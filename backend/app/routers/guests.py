"""Guest links for a babysitter or grandparents (#54).

Not an account: an adult makes a link that is valid for a few hours or days and can be revoked or
extended. Whoever has it sees the emergency cards and, if chosen, the next few days of the
calendar (with who drives and packing lists) and the lists picked – and can tick off list items.
Never chat, allowance, documents or anything else. Every visit is noted for the family.
"""
import hashlib
import secrets
import uuid
from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.services.public_url import public_base
from app.deps import DB, AdultUser
from app.models import Family, GuestAccess, GuestVisit, ListItem, ListModel
from app.routers.emergency import EmergencyOut, emergency_cards
from app.schemas import EventOut
from app.services import login_throttle
from app.services import geo
from app.services import security_log
from app.services.calendar_view import events_between
from app.services.events import publish_family
from app.services.mfa import qr_svg

router = APIRouter(prefix="/api", tags=["guests"])

MAX_HOURS = 24 * 31
CALENDAR_DAYS = 3
CHILD_CALENDAR_DAYS = 28
VISIT_EVERY = timedelta(minutes=30)


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


class GuestIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    hours: int = Field(ge=1, le=MAX_HOURS)
    show_calendar: bool = True
    list_ids: list[uuid.UUID] = Field(default=[], max_length=20)


class ExtendIn(BaseModel):
    hours: int = Field(ge=1, le=MAX_HOURS)


class VisitOut(BaseModel):
    at: datetime
    user_agent: str


class GuestOut(BaseModel):
    id: uuid.UUID
    name: str
    show_calendar: bool
    list_ids: list[uuid.UUID]
    created_at: datetime
    expires_at: datetime
    revoked_at: datetime | None
    last_seen_at: datetime | None
    active: bool
    visits: list[VisitOut]


class GuestCreated(GuestOut):
    url: str  # shown once
    qr_svg: str


class GuestListItem(BaseModel):
    id: uuid.UUID
    name: str
    done: bool


class GuestListOut(BaseModel):
    id: uuid.UUID
    name: str
    items: list[GuestListItem]


class GuestCustody(BaseModel):
    name: str
    other_home: str
    place: str
    next_handover: date | None
    next_place: str | None
    handover_time: str
    days: list[dict]


class GuestView(BaseModel):
    name: str
    family_name: str
    expires_at: datetime
    emergency: EmergencyOut
    calendar: list[EventOut] | None
    lists: list[GuestListOut]
    # A link for a child's other parent: the child's schedule between the two homes.
    custody: list[GuestCustody] = []


class TickIn(BaseModel):
    done: bool


async def _out(db, guest: GuestAccess) -> GuestOut:
    visits = (
        await db.execute(select(GuestVisit).where(GuestVisit.guest_id == guest.id).order_by(GuestVisit.at.desc()).limit(20))
    ).scalars().all()
    return GuestOut(
        id=guest.id, name=guest.name, show_calendar=guest.show_calendar, list_ids=guest.list_ids or [],
        created_at=guest.created_at, expires_at=guest.expires_at, revoked_at=guest.revoked_at, last_seen_at=guest.last_seen_at,
        active=guest.revoked_at is None and _aware(guest.expires_at) > datetime.now(timezone.utc),
        visits=[VisitOut(at=v.at, user_agent=v.user_agent) for v in visits],
    )


async def _check_lists(db, family_id: uuid.UUID, list_ids: list[uuid.UUID]) -> list[str]:
    for list_id in list_ids:
        row = await db.get(ListModel, list_id)
        if row is None or row.family_id != family_id:
            raise HTTPException(status_code=422, detail="Unknown list")
    return list(dict.fromkeys(str(i) for i in list_ids))


# --- In the app (adults) -------------------------------------------------------------------


@router.get("/guests", response_model=list[GuestOut])
async def list_guests(user: AdultUser, db: DB) -> list[GuestOut]:
    rows = (await db.execute(select(GuestAccess).where(GuestAccess.family_id == user.family_id).order_by(GuestAccess.created_at.desc()))).scalars().all()
    return [await _out(db, g) for g in rows]


@router.post("/guests", response_model=GuestCreated, status_code=status.HTTP_201_CREATED)
async def create_guest(payload: GuestIn, request: Request, user: AdultUser, db: DB) -> GuestCreated:
    token = secrets.token_urlsafe(24)
    now = datetime.now(timezone.utc)
    guest = GuestAccess(
        family_id=user.family_id, name=payload.name.strip(), token_hash=_hash(token), show_calendar=payload.show_calendar,
        list_ids=await _check_lists(db, user.family_id, payload.list_ids), expires_at=now + timedelta(hours=payload.hours),
        created_by=user.id, created_at=now,
    )
    db.add(guest)
    await db.commit()
    # The link (and its QR code) must be whole: without a public address set, the app's own.
    base = await public_base(db, request)
    url = f"{base}/guest/{token}"
    return GuestCreated(**(await _out(db, guest)).model_dump(), url=url, qr_svg=qr_svg(url))


async def _own(db, user, guest_id: uuid.UUID) -> GuestAccess:
    guest = await db.get(GuestAccess, guest_id)
    if guest is None or guest.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Guest link not found")
    return guest


@router.post("/guests/{guest_id}/extend", response_model=GuestOut)
async def extend_guest(guest_id: uuid.UUID, payload: ExtendIn, user: AdultUser, db: DB) -> GuestOut:
    """Another few hours or days from now (also for a link that has run out)."""
    guest = await _own(db, user, guest_id)
    if guest.revoked_at is not None:
        raise HTTPException(status_code=409, detail="The link has been revoked – make a new one")
    guest.expires_at = max(_aware(guest.expires_at), datetime.now(timezone.utc)) + timedelta(hours=payload.hours)
    await db.commit()
    return await _out(db, guest)


@router.delete("/guests/{guest_id}", response_model=GuestOut)
async def revoke_guest(guest_id: uuid.UUID, user: AdultUser, db: DB) -> GuestOut:
    guest = await _own(db, user, guest_id)
    guest.revoked_at = guest.revoked_at or datetime.now(timezone.utc)
    await db.commit()
    return await _out(db, guest)


# --- Public, through the link -------------------------------------------------------------


async def _open(db, token: str, request: Request) -> GuestAccess:
    ip = login_throttle.client_ip(request)
    if login_throttle.ip_retry_after(ip, await geo.outside(db, ip)):
        raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")
    guest = (await db.execute(select(GuestAccess).where(GuestAccess.token_hash == _hash(token)))).scalar_one_or_none()
    now = datetime.now(timezone.utc)
    family = await db.get(Family, guest.family_id) if guest else None
    if guest is None or guest.revoked_at is not None or _aware(guest.expires_at) <= now or family is None or family.status != "active":
        login_throttle.record_ip_failure(ip)
        await security_log.record(db, "link_invalid", ip=ip, detail="guest")
        raise HTTPException(status_code=404, detail="This link isn't valid any more")
    if guest.last_seen_at is None or now - _aware(guest.last_seen_at) >= VISIT_EVERY:
        db.add(GuestVisit(family_id=guest.family_id, guest_id=guest.id, at=now, user_agent=(request.headers.get("user-agent") or "")[:200]))
    guest.last_seen_at = now
    await db.commit()
    return guest


def _viewer(family: Family, language: str):
    """Who the calendar is read as: someone who sees only what is shared with the whole family."""
    return SimpleNamespace(id=uuid.uuid4(), family_id=family.id, role="guest", apps=["calendar"], language=language)


@router.get("/guest/{token}", response_model=GuestView)
async def guest_view(token: str, request: Request, db: DB, lang: str = "en") -> GuestView:
    guest = await _open(db, token, request)
    family = await db.get(Family, guest.family_id)
    return await build_view(db, family, guest, lang)


async def build_view(db, family: Family, guest, lang: str) -> GuestView:
    """What a guest sees: `guest` has name, expires_at, show_calendar, child_ids and list_ids (a
    guest link, or a co-parent's account – 2.8.3)."""
    calendar = None
    if guest.show_calendar:
        viewer = _viewer(family, lang if lang in {"en", "sv", "nb", "da", "fi"} else "en")
        today = datetime.now(timezone.utc).date()
        # The other parent plans ahead: four weeks of the child's days.
        days = CHILD_CALENDAR_DAYS if guest.child_ids else CALENDAR_DAYS
        calendar = [e for e in await events_between(db, viewer, today, today + timedelta(days=days)) if not e.busy]
    children = [uuid.UUID(c) for c in guest.child_ids or []]
    custody: list[GuestCustody] = []
    emergency = await emergency_cards(db, family.id)
    if children:
        from app.routers.custody import family_schedules, schedule_out

        # Only the children: their events, their cards – not the rest of the family's.
        if calendar is not None:
            calendar = [e for e in calendar if set(e.member_ids or []) & set(children)]
        # The household card (address, insurance …) is the family's: an empty one instead.
        empty = type(emergency.household)(user_id=None, name=None, role=None, color=None)
        emergency = emergency.model_copy(update={"household": empty, "members": [m for m in emergency.members if m.user_id in children]})
        today = datetime.now(timezone.utc).date()
        for schedule, child, exceptions in await family_schedules(db, family.id, children):
            out = await schedule_out(db, schedule, child, exceptions, today)
            custody.append(GuestCustody(name=out.name, other_home=out.other_home, place=out.place, next_handover=out.next_handover, next_place=out.next_place, handover_time=out.handover_time, days=[d.model_dump(mode="json") for d in out.days[:28]]))
    lists = []
    for list_id in guest.list_ids or []:
        row = await db.get(ListModel, uuid.UUID(list_id))
        if row is None or row.archived:
            continue
        items = (await db.execute(select(ListItem).where(ListItem.list_id == row.id).order_by(ListItem.done, ListItem.position))).scalars().all()
        lists.append(GuestListOut(id=row.id, name=row.name, items=[GuestListItem(id=i.id, name=i.name, done=i.done) for i in items]))
    return GuestView(
        name=guest.name, family_name=family.name, expires_at=guest.expires_at,
        emergency=emergency, calendar=calendar, lists=lists, custody=custody,
    )


@router.post("/guest/{token}/items/{item_id}", response_model=GuestListItem)
async def guest_tick(token: str, item_id: uuid.UUID, payload: TickIn, request: Request, db: DB) -> GuestListItem:
    guest = await _open(db, token, request)
    item = await db.get(ListItem, item_id)
    if item is None or str(item.list_id) not in (guest.list_ids or []):
        raise HTTPException(status_code=404, detail="Item not found")
    item.done = payload.done
    await db.commit()
    await publish_family(guest.family_id, ["lists"])
    return GuestListItem(id=item.id, name=item.name, done=item.done)

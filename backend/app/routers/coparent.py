"""The other parent (2.8.3): an account of their own kind, invited per child by those who may change
the family's settings. They sign in on /coparent with their own session cookie – a family session
isn't one, and theirs is accepted nowhere else – and see only their children: the schedule between
the homes, four weeks of calendar, the emergency card and the handover list. They write with the
family's adults, who are told.
"""
import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.config import get_settings
from app.services.public_url import public_base
from app.deps import DB, AdultUser, FamilyManager
from app.models import CoParent, CoParentMessage, CustodySchedule, Family, ListItem, User
from app.routers.guests import GuestListItem, GuestView, TickIn, build_view
from app.security import hash_password, verify_password
from app.services import login_throttle, security_log, security_policy
from app.services import geo
from app.services.events import publish_family
from app.services.notify import notify

router = APIRouter(prefix="/api", tags=["coparent"])

COOKIE = "smooth_coparent"
INVITE_DAYS = 7
SESSION_DAYS = 30


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _aware(value: datetime | None) -> datetime | None:
    return value if value is None or value.tzinfo else value.replace(tzinfo=timezone.utc)


# --- Their session ------------------------------------------------------------------------------


def _set_cookie(response: Response, coparent_id: uuid.UUID) -> None:
    settings = get_settings()
    token = jwt.encode(
        {"sub": str(coparent_id), "typ": "coparent", "exp": datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)},
        settings.secret_key, algorithm="HS256",
    )
    response.set_cookie(COOKIE, token, httponly=True, samesite="lax", secure=settings.cookie_secure, max_age=SESSION_DAYS * 86400, path="/")


async def _me(request: Request, db) -> CoParent:
    token = request.cookies.get(COOKIE)
    try:
        payload = jwt.decode(token or "", get_settings().secret_key, algorithms=["HS256"])
        if payload.get("typ") != "coparent":
            raise ValueError
        row = await db.get(CoParent, uuid.UUID(payload["sub"]))
    except (jwt.PyJWTError, KeyError, ValueError):
        row = None
    if row is None or row.revoked_at is not None or row.password_hash is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not signed in")
    family = await db.get(Family, row.family_id)
    if family is None or family.status != "active":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not signed in")
    row.last_seen_at = datetime.now(timezone.utc)
    await db.commit()
    return row


async def _username_free(db, username: str) -> bool:
    taken = (await db.execute(select(User.id).where(User.username == username))).first()
    return not taken and not (await db.execute(select(CoParent.id).where(CoParent.username == username))).first()


class InviteIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class CoParentOut(BaseModel):
    id: uuid.UUID
    name: str
    child_ids: list[uuid.UUID]
    joined: bool
    last_seen_at: datetime | None
    revoked: bool
    invite_expires_at: datetime | None
    unread: int = 0


class Invited(CoParentOut):
    url: str  # shown once


class MessageIn(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class MessageOut(BaseModel):
    id: uuid.UUID
    body: str
    from_name: str
    mine: bool
    created_at: datetime


def _out(row: CoParent) -> CoParentOut:
    return CoParentOut(
        id=row.id, name=row.name, child_ids=[uuid.UUID(c) for c in row.child_ids or []], joined=row.password_hash is not None,
        last_seen_at=row.last_seen_at, revoked=row.revoked_at is not None, invite_expires_at=row.invite_expires_at,
    )


# --- The family's side --------------------------------------------------------------------------


@router.post("/custody/{child_id}/coparents", response_model=Invited, status_code=status.HTTP_201_CREATED)
async def invite(child_id: uuid.UUID, payload: InviteIn, request: Request, user: FamilyManager, db: DB) -> Invited:
    child = await db.get(User, child_id)
    if child is None or child.family_id != user.family_id or child.role != "child":
        raise HTTPException(status_code=404, detail="Child not found")
    token = secrets.token_urlsafe(24)
    row = CoParent(
        family_id=user.family_id, name=payload.name.strip(), child_ids=[str(child.id)], invite_token_hash=_hash(token),
        invite_expires_at=datetime.now(timezone.utc) + timedelta(days=INVITE_DAYS), created_by=user.id,
    )
    db.add(row)
    await db.commit()
    base = await public_base(db, request)
    return Invited(**_out(row).model_dump(), url=f"{base}/coparent/join/{token}")


@router.get("/custody/coparents", response_model=list[CoParentOut])
async def list_coparents(user: AdultUser, db: DB) -> list[CoParentOut]:
    rows = (await db.execute(select(CoParent).where(CoParent.family_id == user.family_id).order_by(CoParent.created_at))).scalars().all()
    return [_out(r) for r in rows]


@router.delete("/custody/coparents/{coparent_id}", response_model=CoParentOut)
async def revoke(coparent_id: uuid.UUID, user: FamilyManager, db: DB) -> CoParentOut:
    row = await db.get(CoParent, coparent_id)
    if row is None or row.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Not found")
    row.revoked_at = row.revoked_at or datetime.now(timezone.utc)
    row.invite_token_hash = None
    await db.commit()
    return _out(row)


async def _thread(db, row: CoParent, viewer_user: User | None) -> list[MessageOut]:
    msgs = (await db.execute(select(CoParentMessage).where(CoParentMessage.coparent_id == row.id).order_by(CoParentMessage.created_at))).scalars().all()
    names = {u.id: u.display_name for u in (await db.execute(select(User).where(User.family_id == row.family_id))).scalars().all()}
    return [
        MessageOut(
            id=m.id, body=m.body, from_name=row.name if m.sender_id is None else names.get(m.sender_id, ""),
            mine=(m.sender_id is None) if viewer_user is None else (m.sender_id is not None), created_at=m.created_at,
        )
        for m in msgs
    ]


async def _family_coparent(db, user: User, coparent_id: uuid.UUID) -> CoParent:
    row = await db.get(CoParent, coparent_id)
    if row is None or row.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Not found")
    return row


@router.get("/custody/coparents/{coparent_id}/messages", response_model=list[MessageOut])
async def family_messages(coparent_id: uuid.UUID, user: AdultUser, db: DB) -> list[MessageOut]:
    return await _thread(db, await _family_coparent(db, user, coparent_id), user)


@router.post("/custody/coparents/{coparent_id}/messages", response_model=list[MessageOut], status_code=status.HTTP_201_CREATED)
async def family_write(coparent_id: uuid.UUID, payload: MessageIn, user: AdultUser, db: DB) -> list[MessageOut]:
    row = await _family_coparent(db, user, coparent_id)
    if row.revoked_at is not None:
        raise HTTPException(status_code=409, detail="This co-parent's access is closed")
    db.add(CoParentMessage(family_id=row.family_id, coparent_id=row.id, sender_id=user.id, body=payload.body.strip()))
    await db.commit()
    await publish_family(row.family_id, ["custody"])
    return await _thread(db, row, user)


# --- Their side ---------------------------------------------------------------------------------


class InviteInfo(BaseModel):
    family_name: str
    name: str
    children: list[str]


class JoinIn(BaseModel):
    username: str = Field(min_length=3, max_length=120, pattern=r"^[A-Za-z0-9._@+-]+$")
    password: str = Field(min_length=4, max_length=200)


class LoginIn(BaseModel):
    username: str = Field(max_length=120)
    password: str = Field(max_length=200)


async def _invite(db, token: str, request: Request) -> CoParent:
    ip = login_throttle.client_ip(request)
    if login_throttle.ip_retry_after(ip, await geo.outside(db, ip)):
        raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")
    row = (await db.execute(select(CoParent).where(CoParent.invite_token_hash == _hash(token)))).scalar_one_or_none()
    if row is None or row.revoked_at is not None or _aware(row.invite_expires_at) <= datetime.now(timezone.utc):
        login_throttle.record_ip_failure(ip)
        raise HTTPException(status_code=404, detail="This invitation isn't valid any more")
    return row


@router.get("/coparent/invite/{token}", response_model=InviteInfo)
async def invite_info(token: str, request: Request, db: DB) -> InviteInfo:
    row = await _invite(db, token, request)
    family = await db.get(Family, row.family_id)
    children = [u.display_name for u in (await db.execute(select(User).where(User.id.in_([uuid.UUID(c) for c in row.child_ids])))).scalars().all()]
    return InviteInfo(family_name=family.name, name=row.name, children=children)


@router.post("/coparent/invite/{token}", status_code=status.HTTP_204_NO_CONTENT)
async def accept(token: str, payload: JoinIn, request: Request, response: Response, db: DB) -> None:
    row = await _invite(db, token, request)
    username = payload.username.strip().lower()
    if not await _username_free(db, username):
        raise HTTPException(status_code=409, detail="Username is already taken")
    await security_policy.check_password(db, payload.password, "adult")
    row.username = username
    row.password_hash = hash_password(payload.password)
    row.invite_token_hash = None
    row.joined_at = datetime.now(timezone.utc)
    await db.commit()
    _set_cookie(response, row.id)


@router.post("/coparent/login", status_code=status.HTTP_204_NO_CONTENT)
async def login(payload: LoginIn, request: Request, response: Response, db: DB) -> None:
    ip = login_throttle.client_ip(request)
    username = payload.username.strip().lower()
    if login_throttle.retry_after(f"coparent:{username}", ip, strict=await geo.outside(db, ip)):
        await security_log.throttled(db, ip, username)
        raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")
    row = (await db.execute(select(CoParent).where(CoParent.username == username))).scalar_one_or_none()
    if row is None or row.revoked_at is not None or not row.password_hash or not verify_password(payload.password, row.password_hash):
        login_throttle.record_failure(f"coparent:{username}", ip)
        await security_log.record(db, "login_failed", ip=ip, username=username, family_id=row.family_id if row else None, detail="coparent")
        raise HTTPException(status_code=401, detail="Wrong username or password")
    login_throttle.record_success(f"coparent:{username}")
    _set_cookie(response, row.id)


@router.post("/coparent/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response) -> None:
    response.delete_cookie(COOKIE, path="/")


class CoParentView(GuestView):
    messages: list[MessageOut]


async def _handover_lists(db, row: CoParent) -> list[str]:
    ids = [uuid.UUID(c) for c in row.child_ids or []]
    schedules = (await db.execute(select(CustodySchedule).where(CustodySchedule.family_id == row.family_id, CustodySchedule.user_id.in_(ids)))).scalars().all()
    return [str(s.handover_list_id) for s in schedules if s.handover_list_id]


@router.get("/coparent/me", response_model=CoParentView)
async def my_view(request: Request, db: DB, lang: str = "en") -> CoParentView:
    row = await _me(request, db)
    family = await db.get(Family, row.family_id)
    from types import SimpleNamespace

    guest = SimpleNamespace(
        name=row.name, expires_at=datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS), show_calendar=True,
        child_ids=row.child_ids, list_ids=await _handover_lists(db, row),
    )
    view = await build_view(db, family, guest, lang)
    return CoParentView(**view.model_dump(), messages=await _thread(db, row, None))


@router.get("/coparent/costs")
async def coparent_shared_costs(request: Request, db: DB) -> list[dict]:
    """What the family has bought for the children that the homes share (2.8.4)."""
    from app.routers.receipts import coparent_costs

    row = await _me(request, db)
    return await coparent_costs(db, row.family_id, [str(c) for c in row.child_ids or []])


@router.post("/coparent/items/{item_id}", response_model=GuestListItem)
async def tick(item_id: uuid.UUID, payload: TickIn, request: Request, db: DB) -> GuestListItem:
    row = await _me(request, db)
    item = await db.get(ListItem, item_id)
    if item is None or str(item.list_id) not in await _handover_lists(db, row):
        raise HTTPException(status_code=404, detail="Item not found")
    item.done = payload.done
    await db.commit()
    await publish_family(row.family_id, ["lists"])
    return GuestListItem(id=item.id, name=item.name, done=item.done)


_TOLD = {
    "en": "Message from {name}",
    "sv": "Meddelande från {name}",
    "nb": "Melding fra {name}",
    "da": "Besked fra {name}",
    "fi": "Viesti: {name}",
}


@router.post("/coparent/messages", response_model=list[MessageOut], status_code=status.HTTP_201_CREATED)
async def write(payload: MessageIn, request: Request, db: DB) -> list[MessageOut]:
    row = await _me(request, db)
    db.add(CoParentMessage(family_id=row.family_id, coparent_id=row.id, sender_id=None, body=payload.body.strip()))
    await db.commit()
    # The family's adults are told.
    for adult in (await db.execute(select(User).where(User.family_id == row.family_id, User.role.in_(["admin", "adult"])))).scalars().all():
        title = _TOLD.get(adult.language or "en", _TOLD["en"]).format(name=row.name)
        await notify(db, adult, {"title": title, "body": payload.body.strip()[:140], "route": "/calendar/custody", "kind": "coparent_message"})
    await publish_family(row.family_id, ["custody"])
    return await _thread(db, row, None)

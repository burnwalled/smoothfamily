"""Share a wish list with relatives outside the app.

Adults make a link for one person's wish list (valid 30, 90 or 365 days, revocable). Whoever has
the link sees the wishes – never the gift ideas – and can reserve one with their name. The
person the list is for never sees reservations, as in the app. A guest can undo their own
reservation with the key their browser got when reserving.
"""
import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.services.public_url import public_base
from app.deps import DB, CurrentUser, require_app
from app.models import Family, Person, User, WishItem, WishShare
from app.services import login_throttle
from app.services import geo
from app.services import security_log

router = APIRouter(prefix="/api", tags=["wish-share"])

LIFETIMES = (30, 90, 365)


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class ShareIn(BaseModel):
    days: int = 90


class ShareOut(BaseModel):
    id: uuid.UUID
    created_at: datetime
    expires_at: datetime
    revoked_at: datetime | None


class ShareCreated(ShareOut):
    url: str  # shown once


class GuestWish(BaseModel):
    id: uuid.UUID
    title: str
    url: str | None
    note: str | None
    reserved: bool
    reserved_by_you: bool


class GuestList(BaseModel):
    name: str
    family_name: str
    wishes: list[GuestWish]


class ReserveIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class ReserveOut(BaseModel):
    key: str  # keep it to undo the reservation


def _adult(user: User) -> None:
    if user.role not in {"admin", "adult"}:
        raise HTTPException(status_code=403, detail="Only adults share wish lists")


async def _person(db, user: User, person_id: uuid.UUID) -> Person:
    person = await db.get(Person, person_id)
    if person is None or person.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Person not found")
    return person


# --- In the app (adults) -------------------------------------------------------------------


@router.get("/birthdays/people/{person_id}/shares", response_model=list[ShareOut], dependencies=[require_app("birthdays")])
async def list_shares(person_id: uuid.UUID, user: CurrentUser, db: DB) -> list[WishShare]:
    _adult(user)
    person = await _person(db, user, person_id)
    return list((await db.execute(select(WishShare).where(WishShare.person_id == person.id).order_by(WishShare.created_at.desc()))).scalars().all())


@router.post("/birthdays/people/{person_id}/shares", response_model=ShareCreated, status_code=status.HTTP_201_CREATED, dependencies=[require_app("birthdays")])
async def create_share(person_id: uuid.UUID, payload: ShareIn, user: CurrentUser, db: DB) -> ShareCreated:
    _adult(user)
    if payload.days not in LIFETIMES:
        raise HTTPException(status_code=422, detail="Choose 30, 90 or 365 days")
    person = await _person(db, user, person_id)
    token = secrets.token_urlsafe(18)
    now = datetime.now(timezone.utc)
    share = WishShare(family_id=person.family_id, person_id=person.id, token_hash=_hash(token), created_by=user.id, created_at=now, expires_at=now + timedelta(days=payload.days))
    db.add(share)
    await db.commit()
    await db.refresh(share)
    base = await public_base(db)
    return ShareCreated(id=share.id, created_at=share.created_at, expires_at=share.expires_at, revoked_at=None, url=f"{base}/wishes/{token}")


@router.delete("/birthdays/shares/{share_id}", response_model=ShareOut, dependencies=[require_app("birthdays")])
async def revoke_share(share_id: uuid.UUID, user: CurrentUser, db: DB) -> WishShare:
    _adult(user)
    share = await db.get(WishShare, share_id)
    if share is None or share.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Link not found")
    share.revoked_at = share.revoked_at or datetime.now(timezone.utc)
    await db.commit()
    return share


# --- Public, through the link -------------------------------------------------------------


async def _open(db, token: str, request: Request) -> tuple[WishShare, Person]:
    ip = login_throttle.client_ip(request)
    if login_throttle.ip_retry_after(ip, await geo.outside(db, ip)):
        raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")
    share = (await db.execute(select(WishShare).where(WishShare.token_hash == _hash(token)))).scalar_one_or_none()
    now = datetime.now(timezone.utc)
    expires = None
    if share is not None:
        expires = share.expires_at if share.expires_at.tzinfo else share.expires_at.replace(tzinfo=timezone.utc)
    family = await db.get(Family, share.family_id) if share else None
    if share is None or share.revoked_at or expires <= now or family is None or family.status != "active":
        login_throttle.record_ip_failure(ip)
        await security_log.record(db, "link_invalid", ip=ip, detail="wishes")
        raise HTTPException(status_code=404, detail="This link isn't valid")
    return share, await db.get(Person, share.person_id)


@router.get("/wishes/{token}", response_model=GuestList)
async def guest_list(token: str, request: Request, db: DB, key: str | None = None) -> GuestList:
    from app.models import Family

    share, person = await _open(db, token, request)
    family = await db.get(Family, share.family_id)
    wishes = (
        await db.execute(select(WishItem).where(WishItem.person_id == person.id, WishItem.kind == "wish").order_by(WishItem.created_at))
    ).scalars().all()
    mine = _hash(key) if key else None
    return GuestList(
        name=person.name,
        family_name=family.name,
        wishes=[
            GuestWish(
                id=w.id,
                title=w.title,
                url=w.url,
                note=w.note,
                reserved=w.reserved_by is not None or w.reserved_by_guest is not None,
                reserved_by_you=mine is not None and w.guest_key_hash == mine,
            )
            for w in wishes
        ],
    )


@router.post("/wishes/{token}/{wish_id}/reserve", response_model=ReserveOut)
async def guest_reserve(token: str, wish_id: uuid.UUID, payload: ReserveIn, request: Request, db: DB) -> ReserveOut:
    share, person = await _open(db, token, request)
    wish = await db.get(WishItem, wish_id)
    if wish is None or wish.person_id != person.id or wish.kind != "wish":
        raise HTTPException(status_code=404, detail="Wish not found")
    if wish.reserved_by is not None or wish.reserved_by_guest is not None:
        raise HTTPException(status_code=409, detail="Someone is already buying this")
    key = secrets.token_urlsafe(18)
    wish.reserved_by_guest = payload.name.strip()
    wish.guest_key_hash = _hash(key)
    await db.commit()
    return ReserveOut(key=key)


@router.delete("/wishes/{token}/{wish_id}/reserve", status_code=status.HTTP_204_NO_CONTENT)
async def guest_unreserve(token: str, wish_id: uuid.UUID, request: Request, db: DB, key: str) -> None:
    share, person = await _open(db, token, request)
    wish = await db.get(WishItem, wish_id)
    if wish is None or wish.person_id != person.id or wish.guest_key_hash != _hash(key):
        raise HTTPException(status_code=404, detail="Reservation not found")
    wish.reserved_by_guest = None
    wish.guest_key_hash = None
    await db.commit()

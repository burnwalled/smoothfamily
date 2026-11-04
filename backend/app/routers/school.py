"""The children's school from Home Assistant (3.4.0) – see services/school_ha.py.

The family admin links a child's school account; the child's adults (and the child) see the school
card on Today – the school day, PE tomorrow, the after-school hours, homework, absence and the
weekly letter – and the school's calendars are the child's calendar subscriptions.
"""
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.deps import DB, CurrentUser, FamilyManager
from app.models import User
from app.services import school_ha, smarthome_conn

router = APIRouter(prefix="/api/school", tags=["school"])


class LinksIn(BaseModel):
    accounts: list[str] = Field(default=[], max_length=10)


class SchoolDay(BaseModel):
    user_id: uuid.UUID
    name: str
    color: str | None
    accounts: list[str] = []
    school_day: str | None = None
    pe: bool | None = None
    leisure_today: str | None = None
    checked_in: bool | None = None
    assignments: int | None = None
    assignment_titles: list[str] = []
    absent_today: bool | None = None
    last_absence: str | None = None
    next_event: str | None = None
    next_lesson: str | None = None
    notifications: int | None = None
    weekly_letter: str | None = None
    news: int | None = None
    news_titles: list[str] = []
    lunch: str | None = None


async def _available(db, user: User) -> bool:
    from app.deps import require_smarthome_host

    try:
        await require_smarthome_host(user, db)
    except HTTPException:
        return False
    return await smarthome_conn.primary(db, user.family_id) is not None


async def _child(db, admin: User, child_id: uuid.UUID) -> User:
    child = await db.get(User, child_id)
    if child is None or child.family_id != admin.family_id:
        raise HTTPException(status_code=404, detail="Member not found")
    return child


async def _links(db, admin: User, child: User) -> dict:
    if not await _available(db, admin):
        return {"available": False}
    try:
        found = await school_ha.discover(db, admin.family_id)
    except Exception:
        return {"available": True, "reachable": False, "accounts": [], "linked": [k["key"] for k in (child.school_sources or {}).get("accounts", [])]}
    others = [o for o in (await db.execute(select(User).where(User.family_id == admin.family_id, User.id != child.id, User.school_sources.is_not(None)))).scalars() if o.school_sources]
    owner = {a["key"]: o.display_name for o in others for a in (o.school_sources or {}).get("accounts", [])}
    return {
        "available": True, "reachable": True,
        "accounts": [{**{k: v for k, v in g.items() if k != "domain"}, "linked_to": owner.get(g["key"])} for g in found],
        "linked": [k["key"] for k in (child.school_sources or {}).get("accounts", [])],
        "roles": (child.school_sources or {}).get("roles", {}),
        "calendars": [c["entity"] for c in (child.school_sources or {}).get("calendars", [])],
    }


@router.get("/links/{child_id}")
async def get_links(child_id: uuid.UUID, admin: FamilyManager, db: DB) -> dict:
    """Family admin: the children found in the school integrations, and which is this one."""
    return await _links(db, admin, await _child(db, admin, child_id))


@router.put("/links/{child_id}")
async def set_links(child_id: uuid.UUID, payload: LinksIn, admin: FamilyManager, db: DB) -> dict:
    """Family admin: link a child's school accounts; their calendars become the child's."""
    child = await _child(db, admin, child_id)
    if not await _available(db, admin):
        raise HTTPException(status_code=409, detail="Connect Home Assistant first")
    try:
        await school_ha.link(db, child, payload.accounts, admin)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Home Assistant could not be reached") from exc
    await db.refresh(child)
    return await _links(db, admin, child)


def _sees(viewer: User, child: User) -> bool:
    return viewer.family_id == child.family_id and (viewer.id == child.id or viewer.role in ("admin", "adult"))


@router.get("/today", response_model=list[SchoolDay])
async def today(user: CurrentUser, db: DB) -> list[SchoolDay]:
    """The school card: each linked child the viewer may see (their adults; a child their own)."""
    children = (await db.execute(select(User).where(User.family_id == user.family_id, User.school_sources.is_not(None)).order_by(User.created_at))).scalars().all()
    children = [c for c in children if c.school_sources and _sees(user, c)]
    if not children:
        return []
    try:
        states = await school_ha.states_for(db, user.family_id)
    except Exception:
        states = {}
    return [
        SchoolDay(
            user_id=c.id, name=c.display_name, color=c.color, accounts=[a["label"] for a in (c.school_sources or {}).get("accounts", [])],
            **school_ha.day_of((c.school_sources or {}).get("roles", {}), states),
        )
        for c in children
    ]


@router.get("/{child_id}/letter")
async def letter(child_id: uuid.UUID, user: CurrentUser, db: DB) -> dict:
    """The weekly letter in full."""
    child = await db.get(User, child_id)
    if child is None or not _sees(user, child) or not child.school_sources:
        raise HTTPException(status_code=404, detail="Not found")
    found = school_ha.letter_of(child.school_sources.get("roles", {}), await school_ha.states_for(db, user.family_id))
    if found is None:
        raise HTTPException(status_code=404, detail="No weekly letter")
    return found

"""Who is home (#60), from Home Assistant's person entities.

Privacy first: the admin links a member to a person entity, but nothing is shown until the member
turns sharing on (home/away, or also "on the way home" from a Proximity direction sensor). Only
home / away / on the way is shown – never zones or places – and nothing is stored: the state is read
from Home Assistant when asked. Children's presence is only shown to adults. Needs the family's
own Home Assistant connection (so only when hosting Smooth Family yourself).
"""
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import CurrentUser, DB, FamilyManager, require_smarthome_host
from app.services import smarthome_conn
from app.models import SmarthomeConnection, User
from app.services import homeassistant as ha
from app.services.crypto import decrypt_token

router = APIRouter(prefix="/api/presence", tags=["presence"], dependencies=[Depends(require_smarthome_host)])

ENTITY = r"^(person|sensor|device_tracker)\.[a-z0-9_]+$"


class MemberPresence(BaseModel):
    user_id: uuid.UUID
    name: str
    color: str
    # home | away | travel (on the way home) | unknown
    state: str
    since: datetime | None = None


class PresenceOut(BaseModel):
    # The family has a Home Assistant connection.
    available: bool
    # This member is linked to a person, so they can choose to share.
    linked: bool
    share: str
    members: list[MemberPresence]


class ShareIn(BaseModel):
    share: str = Field(pattern=r"^(off|home|travel)$")


class LinkIn(BaseModel):
    person_entity: str | None = Field(default=None, max_length=200, pattern=ENTITY)
    travel_entity: str | None = Field(default=None, max_length=200, pattern=ENTITY)


class PersonEntity(BaseModel):
    entity_id: str
    name: str


class LinksOut(BaseModel):
    people: list[PersonEntity]
    travel_sensors: list[PersonEntity]
    members: list[dict]


async def _connection(db: AsyncSession, family_id: uuid.UUID) -> SmarthomeConnection | None:
    return await smarthome_conn.primary(db, family_id)


def presence_state(member: User, states: dict[str, dict]) -> tuple[str, datetime | None]:
    """home / away / travel from the person entity (and the direction sensor, if shared)."""
    person = states.get(member.ha_person_entity or "")
    if not person or person.get("state") in (None, "unknown", "unavailable"):
        return "unknown", None
    since = person.get("last_changed")
    since_dt = datetime.fromisoformat(since.replace("Z", "+00:00")) if since else None
    if person["state"] == "home":
        return "home", since_dt
    if member.presence_share == "travel" and member.ha_travel_entity:
        if (states.get(member.ha_travel_entity) or {}).get("state") == "towards":
            return "travel", since_dt
    return "away", since_dt


async def family_presence(db: AsyncSession, viewer: User) -> PresenceOut:
    conn = await _connection(db, viewer.family_id)
    if conn is None:
        return PresenceOut(available=False, linked=False, share="off", members=[])
    members = (await db.execute(select(User).where(User.family_id == viewer.family_id).order_by(User.created_at))).scalars().all()
    adult = viewer.role in {"admin", "adult"}
    shown = [
        m for m in members
        if m.ha_person_entity and m.presence_share in {"home", "travel"} and (adult or m.role != "child" or m.id == viewer.id)
    ]
    out = []
    if shown:
        try:
            states = {s["entity_id"]: s for s in await ha.get_states(conn.base_url, decrypt_token(conn.token_encrypted))}
        except Exception:
            states = {}
        for m in shown:
            state, since = presence_state(m, states)
            out.append(MemberPresence(user_id=m.id, name=m.display_name, color=m.color, state=state, since=since))
    return PresenceOut(available=True, linked=bool(viewer.ha_person_entity), share=viewer.presence_share or "off", members=out)


@router.get("", response_model=PresenceOut)
async def get_presence(user: CurrentUser, db: DB) -> PresenceOut:
    return await family_presence(db, user)


@router.put("/me", response_model=PresenceOut)
async def set_share(payload: ShareIn, user: CurrentUser, db: DB) -> PresenceOut:
    """Each member decides for themselves – also to pause (off)."""
    if payload.share != "off":
        if await _connection(db, user.family_id) is None:
            raise HTTPException(status_code=409, detail="Presence needs the family's Home Assistant connection")
        if not user.ha_person_entity:
            raise HTTPException(status_code=409, detail="An admin needs to link you to a person in Home Assistant first")
    user.presence_share = payload.share
    await db.commit()
    return await family_presence(db, user)


@router.get("/links", response_model=LinksOut)
async def get_links(admin: FamilyManager, db: DB) -> LinksOut:
    """The person entities and Proximity direction sensors in Home Assistant, and who is linked."""
    conn = await _connection(db, admin.family_id)
    if conn is None:
        raise HTTPException(status_code=409, detail="Connect Home Assistant first")
    try:
        states = await ha.get_states(conn.base_url, decrypt_token(conn.token_encrypted))
    except Exception:
        raise HTTPException(status_code=502, detail="Home Assistant could not be reached")

    def name(s: dict) -> str:
        return s.get("attributes", {}).get("friendly_name") or s["entity_id"]

    people = [PersonEntity(entity_id=s["entity_id"], name=name(s)) for s in states if s["entity_id"].startswith("person.")]
    travel = [
        PersonEntity(entity_id=s["entity_id"], name=name(s))
        for s in states
        if s["entity_id"].startswith("sensor.") and s["entity_id"].endswith("direction_of_travel")
    ]
    members = (await db.execute(select(User).where(User.family_id == admin.family_id).order_by(User.created_at))).scalars().all()
    return LinksOut(
        people=sorted(people, key=lambda p: p.name.casefold()),
        travel_sensors=sorted(travel, key=lambda p: p.name.casefold()),
        members=[
            {"user_id": m.id, "name": m.display_name, "role": m.role, "person_entity": m.ha_person_entity, "travel_entity": m.ha_travel_entity, "share": m.presence_share}
            for m in members
        ],
    )


@router.put("/links/{member_id}", response_model=LinksOut)
async def set_link(member_id: uuid.UUID, payload: LinkIn, admin: FamilyManager, db: DB) -> LinksOut:
    member = await db.get(User, member_id)
    if member is None or member.family_id != admin.family_id:
        raise HTTPException(status_code=404, detail="Member not found")
    if payload.person_entity and not payload.person_entity.startswith("person."):
        raise HTTPException(status_code=422, detail="Choose a person from Home Assistant")
    if member.ha_person_entity != payload.person_entity:
        # A new link: the member chooses again whether to share.
        member.presence_share = "off"
    member.ha_person_entity = payload.person_entity
    member.ha_travel_entity = payload.travel_entity if payload.person_entity else None
    await db.commit()
    return await get_links(admin, db)

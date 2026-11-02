"""Emergency cards (#54): the important facts per member – allergies, medicines, health centre,
insurance number, who to call, routines – and a household card with the address.

Everyone with the app reads them (also offline in the app, and through a guest link); adults edit
every card, a member their own. Medicines from the Medicine app are listed on the card too, except
an adult's own (those stay private to them).
"""
import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import DB, CurrentUser, require_app
from app.models import EmergencyCard, Medication, User

router = APIRouter(prefix="/api/emergency", tags=["emergency"], dependencies=[require_app("emergency")])


class Contact(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    phone: str = Field(min_length=1, max_length=40)
    relation: str = Field(default="", max_length=60)


class CardIn(BaseModel):
    allergies: str = Field(default="", max_length=2000)
    medicines: str = Field(default="", max_length=2000)
    health_centre: str = Field(default="", max_length=300)
    insurance: str = Field(default="", max_length=200)
    contacts: list[Contact] = Field(default=[], max_length=10)
    routines: str = Field(default="", max_length=4000)
    notes: str = Field(default="", max_length=4000)
    address: str = Field(default="", max_length=300)


class CardOut(CardIn):
    user_id: uuid.UUID | None
    name: str | None
    role: str | None
    color: str | None
    # Active medicines from the Medicine app ("Penicillin 5 ml – 08:00, 20:00").
    app_medicines: list[str] = []
    updated_at: datetime | None = None


class EmergencyOut(BaseModel):
    household: CardOut
    members: list[CardOut]


def _card_values(card: EmergencyCard | None) -> dict:
    if card is None:
        return {}
    return {
        "allergies": card.allergies or "", "medicines": card.medicines or "", "health_centre": card.health_centre or "",
        "insurance": card.insurance or "", "contacts": card.contacts or [], "routines": card.routines or "",
        "notes": card.notes or "", "address": card.address or "", "updated_at": card.updated_at,
    }


async def emergency_cards(db: AsyncSession, family_id: uuid.UUID, include_adult_medicines_of: uuid.UUID | None = None) -> EmergencyOut:
    """All cards of the family; children first. `include_adult_medicines_of`: the viewer, whose
    own medicines may be listed on their own card."""
    members = (await db.execute(select(User).where(User.family_id == family_id).order_by(User.created_at))).scalars().all()
    cards = {c.user_id: c for c in (await db.execute(select(EmergencyCard).where(EmergencyCard.family_id == family_id))).scalars()}
    today = date.today()
    meds = (
        await db.execute(select(Medication).where(Medication.family_id == family_id, Medication.active == True, Medication.user_id.is_not(None)))  # noqa: E712
    ).scalars().all()
    by_member: dict[uuid.UUID, list[str]] = {}
    for med in meds:
        if med.end_date and med.end_date < today:
            continue
        by_member.setdefault(med.user_id, []).append(" ".join(p for p in (med.name, med.dose or "") if p) + f" – {', '.join(med.times or [])}")
    out = []
    for member in sorted(members, key=lambda m: m.role != "child"):
        show_meds = member.role == "child" or member.id == include_adult_medicines_of
        out.append(
            CardOut(
                user_id=member.id, name=member.display_name, role=member.role, color=member.color,
                app_medicines=by_member.get(member.id, []) if show_meds else [], **_card_values(cards.get(member.id)),
            )
        )
    household = CardOut(user_id=None, name=None, role=None, color=None, **_card_values(cards.get(None)))
    return EmergencyOut(household=household, members=out)


@router.get("", response_model=EmergencyOut)
async def get_cards(user: CurrentUser, db: DB) -> EmergencyOut:
    return await emergency_cards(db, user.family_id, include_adult_medicines_of=user.id)


async def _save(db: AsyncSession, user: User, member_id: uuid.UUID | None, payload: CardIn) -> EmergencyOut:
    if user.role not in {"admin", "adult"} and member_id != user.id:
        raise HTTPException(status_code=403, detail="Only an adult can change this card")
    card = (
        await db.execute(
            select(EmergencyCard).where(
                EmergencyCard.family_id == user.family_id,
                EmergencyCard.user_id.is_(None) if member_id is None else EmergencyCard.user_id == member_id,
            )
        )
    ).scalar_one_or_none()
    if card is None:
        card = EmergencyCard(family_id=user.family_id, user_id=member_id)
        db.add(card)
    for field, value in payload.model_dump().items():
        setattr(card, field, [c for c in value] if field == "contacts" else value.strip())
    card.updated_by = user.id
    card.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return await get_cards(user, db)


@router.put("/household", response_model=EmergencyOut)
async def save_household(payload: CardIn, user: CurrentUser, db: DB) -> EmergencyOut:
    return await _save(db, user, None, payload)


@router.put("/members/{member_id}", response_model=EmergencyOut)
async def save_member(member_id: uuid.UUID, payload: CardIn, user: CurrentUser, db: DB) -> EmergencyOut:
    member = await db.get(User, member_id)
    if member is None or member.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Member not found")
    return await _save(db, user, member_id, payload)

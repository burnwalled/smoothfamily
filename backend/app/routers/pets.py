"""Pets: each animal with its care (vet visits, vaccinations … and when they are due next), its
chores (tasks linked to the pet, with taking turns) and its medicines. A pet with a birth date
also appears among the Birthdays.
"""
import uuid
import datetime as dt

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.deps import DB, CurrentUser, require_app
from app.models import Medication, Person, Pet, PetCare, Task, User

router = APIRouter(prefix="/api/pets", tags=["pets"], dependencies=[require_app("pets")])

SPECIES = r"^(dog|cat|rabbit|guinea_pig|hamster|bird|fish|horse|reptile|other)$"
CARE_KINDS = r"^(vet|vaccination|deworming|grooming|other)$"


class PetIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    species: str = Field(default="other", pattern=SPECIES)
    birth_date: dt.date | None = None
    notes: str | None = Field(default=None, max_length=2000)


class CareIn(BaseModel):
    kind: str = Field(default="vet", pattern=CARE_KINDS)
    title: str = Field(min_length=1, max_length=120)
    date: dt.date | None = None
    next_due: dt.date | None = None
    notes: str | None = Field(default=None, max_length=2000)


class CareOut(BaseModel):
    id: uuid.UUID
    kind: str
    title: str
    date: dt.date | None
    next_due: dt.date | None
    notes: str | None

    model_config = {"from_attributes": True}


class PetOut(BaseModel):
    id: uuid.UUID
    name: str
    species: str
    birth_date: dt.date | None
    notes: str | None
    care: list[CareOut]
    next_due: dt.date | None  # the soonest care that is due
    chores: list[dict]  # [{id, title, recurrence, assignee_id, rotation_user_ids}]


def _require_adult(user: User) -> None:
    if user.role not in {"admin", "adult"}:
        raise HTTPException(status_code=403, detail="Ask an adult to change this")


async def _pet(db, user: User, pet_id: uuid.UUID) -> Pet:
    pet = await db.get(Pet, pet_id)
    if pet is None or pet.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Pet not found")
    return pet


async def _sync_birthday(db, pet: Pet, user: User) -> None:
    """Keeps the pet's entry among the Birthdays in step with its birth date."""
    person = (await db.execute(select(Person).where(Person.pet_id == pet.id))).scalar_one_or_none()
    if pet.birth_date is None:
        if person is not None:
            await db.delete(person)
        return
    if person is None:
        person = Person(family_id=pet.family_id, pet_id=pet.id, created_by=user.id, name=pet.name)
        db.add(person)
    person.name = pet.name
    person.birth_month, person.birth_day, person.birth_year = pet.birth_date.month, pet.birth_date.day, pet.birth_date.year


async def _out(db, pet: Pet) -> PetOut:
    care = (await db.execute(select(PetCare).where(PetCare.pet_id == pet.id).order_by(PetCare.date.desc().nullslast()))).scalars().all()
    chores = (await db.execute(select(Task).where(Task.pet_id == pet.id, Task.active.is_(True)))).scalars().all()
    due = [c.next_due for c in care if c.next_due]
    return PetOut(
        id=pet.id,
        name=pet.name,
        species=pet.species,
        birth_date=pet.birth_date,
        notes=pet.notes,
        care=[CareOut.model_validate(c) for c in care],
        next_due=min(due) if due else None,
        chores=[
            {"id": str(t.id), "title": t.title, "recurrence": t.recurrence, "assignee_id": str(t.assignee_id) if t.assignee_id else None, "rotation_user_ids": [str(x) for x in t.rotation_user_ids or []]}
            for t in chores
        ],
    )


@router.get("", response_model=list[PetOut])
async def list_pets(user: CurrentUser, db: DB) -> list[PetOut]:
    pets = (await db.execute(select(Pet).where(Pet.family_id == user.family_id).order_by(Pet.created_at))).scalars().all()
    return [await _out(db, p) for p in pets]


@router.post("", response_model=PetOut, status_code=status.HTTP_201_CREATED)
async def add_pet(payload: PetIn, user: CurrentUser, db: DB) -> PetOut:
    _require_adult(user)
    pet = Pet(family_id=user.family_id, created_by=user.id, **payload.model_dump())
    db.add(pet)
    await db.flush()
    await _sync_birthday(db, pet, user)
    await db.commit()
    await db.refresh(pet)
    return await _out(db, pet)


@router.put("/{pet_id}", response_model=PetOut)
async def update_pet(pet_id: uuid.UUID, payload: PetIn, user: CurrentUser, db: DB) -> PetOut:
    _require_adult(user)
    pet = await _pet(db, user, pet_id)
    for field, value in payload.model_dump().items():
        setattr(pet, field, value)
    await _sync_birthday(db, pet, user)
    await db.commit()
    return await _out(db, pet)


@router.delete("/{pet_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_pet(pet_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    _require_adult(user)
    pet = await _pet(db, user, pet_id)
    for task in (await db.execute(select(Task).where(Task.pet_id == pet.id))).scalars().all():
        task.pet_id = None
    # Its birthday, care and medicines go with it.
    for model in (Person, PetCare, Medication):
        for row in (await db.execute(select(model).where(model.pet_id == pet.id))).scalars().all():
            await db.delete(row)
    await db.delete(pet)
    await db.commit()


@router.post("/{pet_id}/care", response_model=PetOut, status_code=status.HTTP_201_CREATED)
async def add_care(pet_id: uuid.UUID, payload: CareIn, user: CurrentUser, db: DB) -> PetOut:
    _require_adult(user)
    pet = await _pet(db, user, pet_id)
    db.add(PetCare(family_id=pet.family_id, pet_id=pet.id, created_by=user.id, **payload.model_dump()))
    await db.commit()
    return await _out(db, pet)


@router.delete("/{pet_id}/care/{care_id}", response_model=PetOut)
async def delete_care(pet_id: uuid.UUID, care_id: uuid.UUID, user: CurrentUser, db: DB) -> PetOut:
    _require_adult(user)
    pet = await _pet(db, user, pet_id)
    care = await db.get(PetCare, care_id)
    if care is None or care.pet_id != pet.id:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(care)
    await db.commit()
    return await _out(db, pet)

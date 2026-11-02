"""Medicine: what a member or a pet takes, when, and whether today's doses are taken.

Health information is private: an adult's medicines are seen only by that adult; a child's by the
child and the adults; a pet's by everyone in the family. A child's and a pet's doses are tasks
(2.9.0) – ticked off among the tasks, for points; an adult's own are ticked off here. Reminders and the "missed dose" alert to
the adults are sent by the background worker (services/medicine.py).
"""
import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select

from app.deps import DB, CurrentUser, require_app
from app.models import Medication, MedicationDose, Pet, Task, User
from app.services.medicine import dose_times_on, may_see, may_tick, sync_tasks

router = APIRouter(prefix="/api/medicine", tags=["medicine"], dependencies=[require_app("medicine")])


class MedicationIn(BaseModel):
    user_id: uuid.UUID | None = None
    pet_id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=120)
    dose: str = Field(default="", max_length=120)
    times: list[str] = Field(min_length=1, max_length=8)
    start_date: date | None = None
    end_date: date | None = None
    notes: str | None = Field(default=None, max_length=1000)
    alert_adults: bool = True
    points: int = Field(default=5, ge=0, le=100)

    @field_validator("times")
    @classmethod
    def _times(cls, value: list[str]) -> list[str]:
        out = []
        for t in value:
            try:
                hour, minute = (int(x) for x in t.split(":"))
            except ValueError as exc:
                raise ValueError("Times look like 08:00") from exc
            if not (0 <= hour <= 23 and 0 <= minute <= 59):
                raise ValueError("Times look like 08:00")
            out.append(f"{hour:02d}:{minute:02d}")
        return sorted(set(out))


class DoseOut(BaseModel):
    time: str
    scheduled_at: datetime
    taken_at: datetime | None
    taken_by_name: str | None


class MedicationOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID | None
    pet_id: uuid.UUID | None
    for_name: str
    name: str
    dose: str
    times: list[str]
    start_date: date
    end_date: date | None
    notes: str | None
    alert_adults: bool
    active: bool
    points: int
    # Done as tasks (a child's or a pet's): ticked off among the tasks.
    as_tasks: bool
    can_edit: bool
    today: list[DoseOut]


class TakeIn(BaseModel):
    scheduled_at: datetime


def _is_adult(user: User) -> bool:
    return user.role in {"admin", "adult"}


async def _out(db, med: Medication, user: User, names: dict, pet_names: dict) -> MedicationOut:
    today = date.today()
    doses = {
        d.scheduled_at.replace(tzinfo=d.scheduled_at.tzinfo or timezone.utc): d
        for d in (await db.execute(select(MedicationDose).where(MedicationDose.medication_id == med.id))).scalars().all()
    }
    today_doses = []
    for time_str, at in dose_times_on(med, today):
        dose = doses.get(at)
        today_doses.append(
            DoseOut(
                time=time_str,
                scheduled_at=at,
                taken_at=dose.taken_at if dose else None,
                taken_by_name=names.get(dose.taken_by) if dose and dose.taken_by else None,
            )
        )
    return MedicationOut(
        id=med.id,
        user_id=med.user_id,
        pet_id=med.pet_id,
        for_name=names.get(med.user_id) if med.user_id else pet_names.get(med.pet_id, ""),
        name=med.name,
        dose=med.dose,
        times=med.times,
        start_date=med.start_date,
        end_date=med.end_date,
        notes=med.notes,
        alert_adults=med.alert_adults,
        active=med.active,
        points=med.points,
        as_tasks=await _as_tasks(db, med),
        can_edit=_is_adult(user) or med.user_id == user.id,
        today=today_doses,
    )


async def _as_tasks(db, med: Medication) -> bool:
    if med.pet_id is not None:
        return True
    owner = await db.get(User, med.user_id)
    return owner is not None and owner.role == "child"


async def _names(db, family_id):
    users = dict((await db.execute(select(User.id, User.display_name).where(User.family_id == family_id))).all())
    pets = dict((await db.execute(select(Pet.id, Pet.name).where(Pet.family_id == family_id))).all())
    return users, pets


async def _medication(db, user: User, med_id: uuid.UUID) -> Medication:
    med = await db.get(Medication, med_id)
    if med is None or med.family_id != user.family_id or not await may_see(db, user, med):
        raise HTTPException(status_code=404, detail="Medicine not found")
    return med


async def _check_owner(db, user: User, payload: MedicationIn) -> None:
    if (payload.user_id is None) == (payload.pet_id is None):
        raise HTTPException(status_code=422, detail="Choose who takes it: a member or a pet")
    if payload.user_id is not None:
        member = await db.get(User, payload.user_id)
        if member is None or member.family_id != user.family_id:
            raise HTTPException(status_code=422, detail="Unknown family member")
        # Adults add for anyone; children only for themselves.
        if not _is_adult(user) and member.id != user.id:
            raise HTTPException(status_code=403, detail="Ask an adult to add this")
        if member.role != "child" and member.id != user.id:
            raise HTTPException(status_code=403, detail="Adults add their own medicines themselves")
    else:
        pet = await db.get(Pet, payload.pet_id)
        if pet is None or pet.family_id != user.family_id:
            raise HTTPException(status_code=422, detail="Unknown pet")
        if not _is_adult(user):
            raise HTTPException(status_code=403, detail="Ask an adult to add this")


@router.get("", response_model=list[MedicationOut])
async def list_medicines(user: CurrentUser, db: DB) -> list[MedicationOut]:
    meds = (
        await db.execute(select(Medication).where(Medication.family_id == user.family_id).order_by(Medication.created_at))
    ).scalars().all()
    names, pets = await _names(db, user.family_id)
    return [await _out(db, m, user, names, pets) for m in meds if await may_see(db, user, m)]


@router.post("", response_model=MedicationOut, status_code=status.HTTP_201_CREATED)
async def add_medicine(payload: MedicationIn, user: CurrentUser, db: DB) -> MedicationOut:
    await _check_owner(db, user, payload)
    med = Medication(
        family_id=user.family_id,
        created_by=user.id,
        **payload.model_dump(exclude={"start_date"}),
        start_date=payload.start_date or date.today(),
    )
    db.add(med)
    await db.flush()
    await sync_tasks(db, med)
    await db.commit()
    await db.refresh(med)
    names, pets = await _names(db, user.family_id)
    return await _out(db, med, user, names, pets)


@router.put("/{med_id}", response_model=MedicationOut)
async def update_medicine(med_id: uuid.UUID, payload: MedicationIn, user: CurrentUser, db: DB) -> MedicationOut:
    med = await _medication(db, user, med_id)
    if not (_is_adult(user) or med.user_id == user.id):
        raise HTTPException(status_code=403, detail="Ask an adult to change this")
    payload.user_id, payload.pet_id = med.user_id, med.pet_id  # who takes it doesn't change
    for field, value in payload.model_dump(exclude={"user_id", "pet_id"}).items():
        if field == "start_date" and value is None:
            continue
        setattr(med, field, value)
    await sync_tasks(db, med)
    await db.commit()
    names, pets = await _names(db, user.family_id)
    return await _out(db, med, user, names, pets)


@router.post("/{med_id}/stop", response_model=MedicationOut)
async def stop_medicine(med_id: uuid.UUID, user: CurrentUser, db: DB) -> MedicationOut:
    med = await _medication(db, user, med_id)
    if not (_is_adult(user) or med.user_id == user.id):
        raise HTTPException(status_code=403, detail="Ask an adult to change this")
    med.active = not med.active
    await sync_tasks(db, med)
    await db.commit()
    names, pets = await _names(db, user.family_id)
    return await _out(db, med, user, names, pets)


@router.delete("/{med_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_medicine(med_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    med = await _medication(db, user, med_id)
    if not (_is_adult(user) or med.user_id == user.id):
        raise HTTPException(status_code=403, detail="Ask an adult to remove this")
    # Its tasks stay for the points already earned, but aren't due any more.
    for task in (await db.execute(select(Task).where(Task.medication_id == med.id))).scalars().all():
        task.active, task.medication_id = False, None
    await db.delete(med)
    await db.commit()


@router.post("/{med_id}/take", response_model=MedicationOut)
async def take_dose(med_id: uuid.UUID, payload: TakeIn, user: CurrentUser, db: DB) -> MedicationOut:
    """Ticks off one of today's doses (again = undo)."""
    med = await _medication(db, user, med_id)
    if not may_tick(user, med):
        raise HTTPException(status_code=403, detail="You can't tick off this dose")
    if await _as_tasks(db, med):
        raise HTTPException(status_code=409, detail="This dose is ticked off among the tasks")
    at = payload.scheduled_at if payload.scheduled_at.tzinfo else payload.scheduled_at.replace(tzinfo=timezone.utc)
    if at not in {t for _, t in dose_times_on(med, date.today())}:
        raise HTTPException(status_code=422, detail="Not one of today's doses")
    dose = (
        await db.execute(select(MedicationDose).where(MedicationDose.medication_id == med.id, MedicationDose.scheduled_at == at))
    ).scalar_one_or_none()
    if dose is None:
        dose = MedicationDose(family_id=med.family_id, medication_id=med.id, scheduled_at=at)
        db.add(dose)
    if dose.taken_at:
        dose.taken_at, dose.taken_by = None, None
    else:
        dose.taken_at, dose.taken_by = datetime.now(timezone.utc), user.id
    await db.commit()
    names, pets = await _names(db, user.family_id)
    return await _out(db, med, user, names, pets)

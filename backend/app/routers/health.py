"""Health per person (3.4.0): workouts and the day's numbers – steps, sleep, weight, resting pulse.

Health data is private: each kind (workouts, steps, sleep, weight) is the person's alone until they
share it with the adults or the whole family. The adults always see a child's and may enter it; a
child never sees an adult's unless shared. A child's weight is left out altogether, and weight is
never part of the family's overview – nobody is compared on it.
"""
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select

from app.deps import DB, CurrentUser, require_app
from app.models import HealthDay, User, Workout
from app.services.weather import today_local

router = APIRouter(prefix="/api/health", tags=["health"], dependencies=[require_app("health")])

KINDS = ("walk", "run", "bike", "swim", "gym", "ski", "sport", "yoga", "play", "other")
CATEGORIES = ("workouts", "steps", "sleep", "weight")
Kind = Literal["walk", "run", "bike", "swim", "gym", "ski", "sport", "yoga", "play", "other"]
Share = Literal["me", "adults", "family"]
# How far back a person's page reaches.
MAX_DAYS = 366


def _adult(user: User) -> bool:
    return user.role in {"admin", "adult"}


def shared(owner: User) -> dict[str, str]:
    saved = owner.health_share or {}
    return {c: saved.get(c, "me") for c in CATEGORIES}


def visible(viewer: User, owner: User) -> list[str]:
    """The kinds of the owner's data the viewer may see."""
    if viewer.family_id != owner.family_id:
        return []
    kinds = list(CATEGORIES)
    if owner.role == "child":
        kinds.remove("weight")
    if viewer.id == owner.id or (owner.role == "child" and _adult(viewer)):
        return kinds
    share = shared(owner)
    return [c for c in kinds if share[c] == "family" or (share[c] == "adults" and _adult(viewer))]


def may_enter(viewer: User, owner: User) -> bool:
    return viewer.family_id == owner.family_id and (viewer.id == owner.id or (owner.role == "child" and _adult(viewer)))


async def _owner(db, viewer: User, user_id: uuid.UUID) -> User:
    owner = await db.get(User, user_id)
    if owner is None or owner.family_id != viewer.family_id or not visible(viewer, owner):
        raise HTTPException(status_code=404, detail="Not found")
    return owner


class WorkoutIn(BaseModel):
    day: date
    kind: Kind
    minutes: int = Field(ge=1, le=24 * 60)
    distance_km: float | None = Field(default=None, ge=0, le=1000)
    note: str = Field(default="", max_length=300)


class WorkoutOut(BaseModel):
    id: uuid.UUID
    day: date
    kind: str
    minutes: int
    distance_km: float | None
    note: str
    source: str


class DayIn(BaseModel):
    # Only what is sent changes; null clears it.
    steps: int | None = Field(default=None, ge=0, le=200_000)
    sleep_minutes: int | None = Field(default=None, ge=0, le=24 * 60)
    weight_kg: float | None = Field(default=None, ge=1, le=500)
    resting_hr: int | None = Field(default=None, ge=20, le=250)


class DayOut(BaseModel):
    day: date
    steps: int | None = None
    sleep_minutes: int | None = None
    weight_kg: float | None = None
    resting_hr: int | None = None


class PersonOut(BaseModel):
    user_id: uuid.UUID
    name: str
    color: str | None
    me: bool
    can_enter: bool
    sees: list[str]
    # This week (Monday on), of what the viewer may see; weight is never here.
    week_minutes: int | None = None
    week_workouts: int | None = None
    week_steps_avg: int | None = None
    week_sleep_avg: int | None = None
    streak: int | None = None


class PersonDetail(PersonOut):
    workouts: list[WorkoutOut] = []
    days: list[DayOut] = []
    share: dict[str, str] | None = None


class ShareIn(BaseModel):
    workouts: Share | None = None
    steps: Share | None = None
    sleep: Share | None = None
    weight: Share | None = None


def _streak(days_with: set[date], today: date) -> int:
    """Days in a row with a workout, up to today (or yesterday, before today's is in)."""
    day = today if today in days_with else today - timedelta(days=1)
    n = 0
    while day in days_with:
        n += 1
        day -= timedelta(days=1)
    return n


def _avg(values: list[int]) -> int | None:
    return round(sum(values) / len(values)) if values else None


async def _person(db, viewer: User, owner: User, start: date, today: date, detail: bool) -> PersonDetail:
    sees = visible(viewer, owner)
    monday = today - timedelta(days=today.weekday())
    first = min(start, monday, today - timedelta(days=60))
    workouts = (
        await db.execute(select(Workout).where(Workout.user_id == owner.id, Workout.day >= first, Workout.day <= today).order_by(Workout.day.desc(), Workout.created_at.desc()))
    ).scalars().all() if "workouts" in sees else []
    days = (
        await db.execute(select(HealthDay).where(HealthDay.user_id == owner.id, HealthDay.day >= min(start, monday), HealthDay.day <= today).order_by(HealthDay.day.desc()))
    ).scalars().all() if {"steps", "sleep", "weight"} & set(sees) else []
    week = [w for w in workouts if w.day >= monday]
    week_days = [d for d in days if d.day >= monday]
    out = PersonDetail(
        user_id=owner.id, name=owner.display_name, color=owner.color,
        me=owner.id == viewer.id, can_enter=may_enter(viewer, owner), sees=sees,
    )
    if "workouts" in sees:
        out.week_minutes = sum(w.minutes for w in week)
        out.week_workouts = len(week)
        out.streak = _streak({w.day for w in workouts}, today)
    if "steps" in sees:
        out.week_steps_avg = _avg([d.steps for d in week_days if d.steps is not None])
    if "sleep" in sees:
        out.week_sleep_avg = _avg([d.sleep_minutes for d in week_days if d.sleep_minutes is not None])
    if detail:
        out.workouts = [WorkoutOut(id=w.id, day=w.day, kind=w.kind, minutes=w.minutes, distance_km=w.distance_km, note=w.note, source=w.source) for w in workouts if w.day >= start]
        out.days = [
            DayOut(
                day=d.day,
                steps=d.steps if "steps" in sees else None,
                sleep_minutes=d.sleep_minutes if "sleep" in sees else None,
                weight_kg=d.weight_kg if "weight" in sees else None,
                resting_hr=d.resting_hr if "sleep" in sees else None,
            )
            for d in days
            if d.day >= start
        ]
        if owner.id == viewer.id:
            out.share = shared(owner)
    return out


@router.get("/people", response_model=list[PersonOut])
async def people(user: CurrentUser, db: DB) -> list[PersonOut]:
    """Everyone whose health the viewer may see something of – themself first – with this week."""
    today = today_local()
    members = (await db.execute(select(User).where(User.family_id == user.family_id).order_by(User.created_at))).scalars().all()
    shown = sorted((m for m in members if visible(user, m)), key=lambda m: m.id != user.id)
    return [PersonOut(**(await _person(db, user, m, today, today, detail=False)).model_dump(include=set(PersonOut.model_fields))) for m in shown]


@router.get("/people/{user_id}", response_model=PersonDetail)
async def person(user_id: uuid.UUID, user: CurrentUser, db: DB, days: int = Query(default=28, ge=1, le=MAX_DAYS)) -> PersonDetail:
    owner = await _owner(db, user, user_id)
    today = today_local()
    return await _person(db, user, owner, today - timedelta(days=days - 1), today, detail=True)


async def _enterable(db, user: User, user_id: uuid.UUID) -> User:
    owner = await db.get(User, user_id)
    if owner is None or not may_enter(user, owner):
        raise HTTPException(status_code=403, detail="You can't enter this person's health")
    return owner


@router.post("/people/{user_id}/workouts", response_model=WorkoutOut, status_code=status.HTTP_201_CREATED)
async def add_workout(user_id: uuid.UUID, payload: WorkoutIn, user: CurrentUser, db: DB) -> WorkoutOut:
    owner = await _enterable(db, user, user_id)
    if payload.day > today_local() + timedelta(days=1):
        raise HTTPException(status_code=422, detail="A workout can't be in the future")
    w = Workout(family_id=owner.family_id, user_id=owner.id, created_by=user.id, created_at=datetime.now(timezone.utc), **payload.model_dump())
    w.note = w.note.strip()
    db.add(w)
    await db.commit()
    return WorkoutOut(id=w.id, day=w.day, kind=w.kind, minutes=w.minutes, distance_km=w.distance_km, note=w.note, source=w.source)


async def _workout(db, user: User, workout_id: uuid.UUID) -> Workout:
    w = await db.get(Workout, workout_id)
    owner = await db.get(User, w.user_id) if w else None
    if w is None or owner is None or not may_enter(user, owner):
        raise HTTPException(status_code=404, detail="Not found")
    return w


@router.put("/workouts/{workout_id}", response_model=WorkoutOut)
async def change_workout(workout_id: uuid.UUID, payload: WorkoutIn, user: CurrentUser, db: DB) -> WorkoutOut:
    w = await _workout(db, user, workout_id)
    for key, value in payload.model_dump().items():
        setattr(w, key, value.strip() if isinstance(value, str) else value)
    await db.commit()
    return WorkoutOut(id=w.id, day=w.day, kind=w.kind, minutes=w.minutes, distance_km=w.distance_km, note=w.note, source=w.source)


@router.delete("/workouts/{workout_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workout(workout_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    await db.delete(await _workout(db, user, workout_id))
    await db.commit()


@router.put("/people/{user_id}/days/{day}", response_model=DayOut)
async def set_day(user_id: uuid.UUID, day: date, payload: DayIn, user: CurrentUser, db: DB) -> DayOut:
    owner = await _enterable(db, user, user_id)
    if day > today_local() + timedelta(days=1):
        raise HTTPException(status_code=422, detail="That day hasn't come yet")
    changes = payload.model_dump(exclude_unset=True)
    if owner.role == "child":
        changes.pop("weight_kg", None)
    row = (await db.execute(select(HealthDay).where(HealthDay.user_id == owner.id, HealthDay.day == day))).scalar_one_or_none()
    new = row is None
    if new:
        row = HealthDay(family_id=owner.family_id, user_id=owner.id, day=day)
    for key, value in changes.items():
        setattr(row, key, value)
    row.updated_at = datetime.now(timezone.utc)
    # A day with nothing left in it is no day at all.
    empty = all(getattr(row, k) is None for k in ("steps", "sleep_minutes", "weight_kg", "resting_hr"))
    if empty and not new:
        await db.delete(row)
    elif not empty and new:
        db.add(row)
    await db.commit()
    return DayOut(day=day, steps=row.steps, sleep_minutes=row.sleep_minutes, weight_kg=row.weight_kg, resting_hr=row.resting_hr)


@router.put("/sharing", response_model=dict[str, str])
async def set_sharing(payload: ShareIn, user: CurrentUser, db: DB) -> dict[str, str]:
    """Who sees your own health, per kind."""
    share = shared(user) | {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    user.health_share = share
    await db.commit()
    return share


@router.get("/export")
async def export_mine(user: CurrentUser, db: DB) -> dict:
    """Everything about your own health, as JSON."""
    workouts = (await db.execute(select(Workout).where(Workout.user_id == user.id).order_by(Workout.day))).scalars().all()
    days = (await db.execute(select(HealthDay).where(HealthDay.user_id == user.id).order_by(HealthDay.day))).scalars().all()
    return {
        "name": user.display_name,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "sharing": shared(user),
        "workouts": [{"day": w.day.isoformat(), "kind": w.kind, "minutes": w.minutes, "distance_km": w.distance_km, "note": w.note, "source": w.source} for w in workouts],
        "days": [{"day": d.day.isoformat(), "steps": d.steps, "sleep_minutes": d.sleep_minutes, "weight_kg": d.weight_kg, "resting_hr": d.resting_hr, "source": d.source} for d in days],
    }


@router.delete("/mine", status_code=status.HTTP_204_NO_CONTENT)
async def delete_mine(user: CurrentUser, db: DB) -> None:
    """Remove all your own health data."""
    await db.execute(delete(Workout).where(Workout.user_id == user.id))
    await db.execute(delete(HealthDay).where(HealthDay.user_id == user.id))
    user.health_share = None
    await db.commit()

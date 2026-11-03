"""Health per person (3.4.0): workouts and the day's numbers – steps, sleep, weight, resting pulse.

Health data is private: each kind (workouts, steps, sleep, weight) is the person's alone until they
share it with the adults or the whole family. The adults always see a child's and may enter it; a
child never sees an adult's unless shared. A child's weight is left out altogether, and weight is
never part of the family's overview – nobody is compared on it.
"""
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select

from app.deps import DB, CurrentUser, FamilyManager, require_app
from app.models import HealthDay, HealthGoal, User, Workout
from app.services import health_ha, smarthome_conn
from app.services.achievements import evaluate_achievements
from app.services.health import adult as _adult, goal_progress, may_enter, shared, tick_exercise_tasks, visible
from app.services.weather import today_local

router = APIRouter(prefix="/api/health", tags=["health"], dependencies=[require_app("health")])

KINDS = ("walk", "run", "bike", "swim", "gym", "ski", "sport", "yoga", "play", "other")
Kind = Literal["walk", "run", "bike", "swim", "gym", "ski", "sport", "yoga", "play", "other"]
Share = Literal["me", "adults", "family"]
# How far back a person's page reaches.
MAX_DAYS = 366


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
    # Just logged: the tasks it ticked off and the badges it earned.
    ticked: list[str] = []
    unlocked: list[str] = []


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
    out = WorkoutOut(id=w.id, day=w.day, kind=w.kind, minutes=w.minutes, distance_km=w.distance_km, note=w.note, source=w.source)
    out.ticked = await tick_exercise_tasks(db, owner, w.day, user)
    out.unlocked = await evaluate_achievements(db, owner)
    return out


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
    # Entered by hand: an import from Home Assistant no longer changes what's set on this day.
    if changes:
        row.source = "manual"
    # A day with nothing left in it is no day at all.
    empty = all(getattr(row, k) is None for k in ("steps", "sleep_minutes", "weight_kg", "resting_hr"))
    if empty and not new:
        await db.delete(row)
    elif not empty and new:
        db.add(row)
    await db.commit()
    return DayOut(day=day, steps=row.steps, sleep_minutes=row.sleep_minutes, weight_kg=row.weight_kg, resting_hr=row.resting_hr)


class GoalIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    metric: Literal["minutes", "km", "workouts"]
    target: int = Field(ge=1, le=1_000_000)
    start_date: date
    end_date: date


class GoalPerson(BaseModel):
    user_id: uuid.UUID
    name: str
    color: str | None
    amount: float


class GoalOut(BaseModel):
    id: uuid.UUID
    title: str
    metric: str
    target: int
    start_date: date
    end_date: date
    progress: float
    done: bool
    ended: bool
    people: list[GoalPerson]


@router.get("/goals", response_model=list[GoalOut])
async def goals(user: CurrentUser, db: DB) -> list[GoalOut]:
    """The family's goals: those running now, and those that ended in the last month."""
    today = today_local()
    rows = (
        await db.execute(
            select(HealthGoal).where(HealthGoal.family_id == user.family_id, HealthGoal.end_date >= today - timedelta(days=31)).order_by(HealthGoal.end_date.desc())
        )
    ).scalars().all()
    return [GoalOut(**await goal_progress(db, g, today)) for g in rows if g.start_date <= today]


@router.post("/goals", response_model=GoalOut, status_code=status.HTTP_201_CREATED)
async def add_goal(payload: GoalIn, user: CurrentUser, db: DB) -> GoalOut:
    if not _adult(user):
        raise HTTPException(status_code=403, detail="The adults set the family's goals")
    if payload.end_date < payload.start_date or (payload.end_date - payload.start_date).days > 366:
        raise HTTPException(status_code=422, detail="A goal runs for up to a year, and ends after it starts")
    goal = HealthGoal(family_id=user.family_id, created_by=user.id, created_at=datetime.now(timezone.utc), **payload.model_dump())
    goal.title = goal.title.strip()
    db.add(goal)
    await db.commit()
    return GoalOut(**await goal_progress(db, goal, today_local()))


@router.delete("/goals/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_goal(goal_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    goal = await db.get(HealthGoal, goal_id)
    if goal is None or goal.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Not found")
    if not _adult(user):
        raise HTTPException(status_code=403, detail="The adults set the family's goals")
    await db.delete(goal)
    await db.commit()


class LinkAccount(BaseModel):
    entry: str
    label: str
    title: str


class LinksIn(BaseModel):
    # The person's accounts (Home Assistant integration entries), in order: the first that has a
    # metric is read for it.
    accounts: list[str] = Field(default=[], max_length=20)
    # A sensor of its own for a metric (another account's, or any sensor), or null for none; left
    # out: from the accounts.
    chosen: dict[str, str | None] = {}


class LinksOut(BaseModel):
    # The family has a Home Assistant connection (and may use it).
    available: bool
    reachable: bool = True
    # The accounts could be told apart (not through the gateway).
    accounts_known: bool = True
    accounts: list[dict] = []
    linked: list[str] = []
    chosen: dict[str, str] = {}
    candidates: dict[str, list[dict]] = {}
    import_on: bool = False


class ImportOut(BaseModel):
    available: bool
    # Linked by the admin: the accounts and the metrics read.
    accounts: list[LinkAccount] = []
    metrics: list[str] = []
    on: bool = False
    synced_at: datetime | None = None
    taken: int | None = None


class ImportIn(BaseModel):
    on: bool


async def _ha_available(db, user: User) -> bool:
    from app.deps import require_smarthome_host

    try:
        await require_smarthome_host(user, db)
    except HTTPException:
        return False
    return await smarthome_conn.primary(db, user.family_id) is not None


def _metrics_for(owner: User) -> list[str]:
    return [m for m in health_ha.SOURCES if not (m == "weight" and owner.role == "child")]


async def _member(db, admin: User, user_id: uuid.UUID) -> User:
    member = await db.get(User, user_id)
    if member is None or member.family_id != admin.family_id:
        raise HTTPException(status_code=404, detail="Member not found")
    return member


async def _links(db, admin: User, member: User) -> LinksOut:
    if not await _ha_available(db, admin):
        return LinksOut(available=False)
    saved = member.health_sources or {}
    metrics = _metrics_for(member)
    out = LinksOut(
        available=True, linked=[a["entry"] for a in saved.get("accounts", [])],
        chosen={m: e for m, e in health_ha.chosen_of(member).items()}, import_on=bool(member.health_import),
    )
    try:
        accounts, candidates = await health_ha.discover(await smarthome_conn.primary(db, admin.family_id))
    except Exception:
        out.reachable = False
        return out
    out.accounts_known = bool(accounts)
    # Whose an account already is (so a spouse's Withings isn't linked to the wrong one by mistake).
    others = (await db.execute(select(User).where(User.family_id == admin.family_id, User.id != member.id, User.health_sources.is_not(None)))).scalars().all()
    owner_of = {a["entry"]: o.display_name for o in others for a in (o.health_sources or {}).get("accounts", [])}
    out.accounts = [{**a, "metrics": {m: c for m, c in a["metrics"].items() if m in metrics}, "linked_to": owner_of.get(a["entry"])} for a in accounts]
    out.candidates = {m: c for m, c in candidates.items() if m in metrics}
    return out


@router.get("/links/{user_id}", response_model=LinksOut)
async def get_links(user_id: uuid.UUID, admin: FamilyManager, db: DB) -> LinksOut:
    """Family admin: the health accounts in Home Assistant, and which are this member's."""
    return await _links(db, admin, await _member(db, admin, user_id))


@router.put("/links/{user_id}", response_model=LinksOut)
async def set_links(user_id: uuid.UUID, payload: LinksIn, admin: FamilyManager, db: DB) -> LinksOut:
    """Family admin: link a member's accounts (and any sensors of their own). Nothing is fetched
    until the member turns it on."""
    member = await _member(db, admin, user_id)
    if not await _ha_available(db, admin):
        raise HTTPException(status_code=409, detail="Connect Home Assistant first")
    try:
        accounts, _ = await health_ha.discover(await smarthome_conn.primary(db, admin.family_id))
    except Exception:
        raise HTTPException(status_code=502, detail="Home Assistant could not be reached")
    known = {a["entry"]: a for a in accounts}
    linked = [e for e in payload.accounts if e in known]
    for entity in payload.chosen.values():
        if entity is not None and not re.fullmatch(r"(sensor|calendar)\.[a-z0-9_]+", entity):
            raise HTTPException(status_code=422, detail="Choose a sensor")
    chosen = {m: e for m, e in payload.chosen.items() if m in _metrics_for(member)}
    mapping = health_ha.resolve(accounts, linked, chosen)
    mapping = {m: e for m, e in mapping.items() if m in _metrics_for(member)}
    if linked or mapping:
        member.health_sources = {
            **{k: v for k, v in (member.health_sources or {}).items() if k == "synced_at"},
            "accounts": [{"entry": e, "label": known[e]["label"], "title": known[e]["title"]} for e in linked],
            **mapping,
        }
    else:
        member.health_sources = None
    await db.commit()
    if member.health_import:
        await health_ha.sync_person(db, member)
    await db.refresh(member)
    return await _links(db, admin, member)


async def _import(db, viewer: User, owner: User) -> ImportOut:
    saved = owner.health_sources or {}
    synced = saved.get("synced_at")
    return ImportOut(
        available=await _ha_available(db, viewer),
        accounts=[LinkAccount(**a) for a in saved.get("accounts", [])],
        metrics=list(health_ha.chosen_of(owner)),
        on=bool(owner.health_import),
        synced_at=datetime.fromisoformat(synced) if synced else None,
    )


@router.get("/people/{user_id}/import", response_model=ImportOut)
async def get_import(user_id: uuid.UUID, user: CurrentUser, db: DB) -> ImportOut:
    """Is this person's health fetched from Home Assistant, and from what."""
    return await _import(db, user, await _enterable(db, user, user_id))


@router.put("/people/{user_id}/import", response_model=ImportOut)
async def set_import(user_id: uuid.UUID, payload: ImportIn, user: CurrentUser, db: DB) -> ImportOut:
    """The person turns fetching on or off – or an adult, for a child."""
    owner = await _enterable(db, user, user_id)
    owner.health_import = payload.on
    await db.commit()
    taken = await health_ha.sync_person(db, owner) if payload.on else None
    await db.refresh(owner)
    out = await _import(db, user, owner)
    out.taken = taken
    return out


@router.post("/people/{user_id}/sync", response_model=ImportOut)
async def sync_now(user_id: uuid.UUID, user: CurrentUser, db: DB) -> ImportOut:
    """Fetch now."""
    owner = await _enterable(db, user, user_id)
    if not owner.health_import:
        raise HTTPException(status_code=409, detail="Turn on fetching from Home Assistant first")
    taken = await health_ha.sync_person(db, owner)
    await db.refresh(owner)
    out = await _import(db, user, owner)
    out.taken = taken
    return out


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
    user.health_sources = None
    user.health_import = False
    await db.commit()

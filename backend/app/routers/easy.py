"""The little ones' mode (2.5.5): for children who can't read yet.

Instead of the app a child in this mode sees big picture cards: their routines (morning, evening,
the preschool bag …) as steps in order, and today's tasks. A finished routine or task gives a
sticker for the album – and points and approval as for any task, since a routine *is* a task (its
steps are only shown here). The adults choose the mode and make the routines; the kitchen display
can show them too, so a child taps their own face and sees what's next.
"""
import random
import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import DB, CurrentUser
from app.models import Routine, RoutineStep, RoutineStepDone, Sticker, Task, TaskCompletion, User
from app.routers.tasks import complete_for
from app.services.schedule import due_today

router = APIRouter(prefix="/api/easy", tags=["easy"])

# The album: animals and friendly things, one at random for each routine or task done.
STICKERS = (
    "🦁", "🐸", "🦄", "🐙", "🦋", "🐢", "🐳", "🦊", "🐼", "🐧", "🦖", "🐝", "🐞", "🦒", "🐨", "🐬",
    "🦉", "🐰", "🐶", "🐱", "🦔", "🐘", "🦜", "🐠", "🌈", "🚀", "🌻", "🍓", "🎈", "⭐", "🌙", "🚂",
)


class StepIn(BaseModel):
    id: uuid.UUID | None = None
    picture: str = Field(min_length=1, max_length=16)
    label: str = Field(min_length=1, max_length=80)


class RoutineIn(BaseModel):
    user_id: uuid.UUID
    name: str = Field(min_length=1, max_length=80)
    picture: str = Field(default="⭐", min_length=1, max_length=16)
    # Weekdays 0=Mon … 6=Sun; empty = every day.
    weekdays: list[int] = Field(default=[], max_length=7)
    points: int = Field(default=5, ge=1, le=1000)
    requires_approval: bool = False
    steps: list[StepIn] = Field(min_length=1, max_length=20)


class StepOut(BaseModel):
    id: uuid.UUID
    picture: str
    label: str
    done: bool = False


class RoutineOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    task_id: uuid.UUID
    name: str
    picture: str
    weekdays: list[int]
    points: int
    requires_approval: bool
    steps: list[StepOut]
    # Today: none | pending (waiting for an adult) | approved
    state: str = "none"


class EasyTask(BaseModel):
    id: uuid.UUID
    title: str
    picture: str | None
    # none | pending | approved
    state: str


class EasyDay(BaseModel):
    user_id: uuid.UUID
    name: str
    color: str
    routines: list[RoutineOut]
    tasks: list[EasyTask]
    stickers: int
    stickers_today: list[str]
    # Just earned (to celebrate), when the call finished a routine or task.
    new_sticker: str | None = None


class ChildOut(BaseModel):
    id: uuid.UUID
    display_name: str
    color: str
    easy_mode: bool


class EasyModeIn(BaseModel):
    easy_mode: bool


def _adult(user: User) -> None:
    if user.role not in ("admin", "adult"):
        raise HTTPException(status_code=403, detail="Only adults can do this")


async def _child(db: AsyncSession, family_id: uuid.UUID, user_id: uuid.UUID) -> User:
    child = await db.get(User, user_id)
    if child is None or child.family_id != family_id:
        raise HTTPException(status_code=404, detail="Member not found")
    return child


async def _whose(db: AsyncSession, user: User, user_id: uuid.UUID | None) -> User:
    """The child the call is about: yourself, or – for an adult – one of the family's members."""
    if user_id is None or user_id == user.id:
        return user
    _adult(user)
    return await _child(db, user.family_id, user_id)


def _routine_out(routine: Routine, task: Task, steps: list[RoutineStep], done: set[uuid.UUID], state: str) -> RoutineOut:
    return RoutineOut(
        id=routine.id, user_id=routine.user_id, task_id=task.id, name=routine.name, picture=routine.picture,
        weekdays=list(task.weekdays or []) if task.recurrence == "weekly" else [], points=task.points,
        requires_approval=task.requires_approval,
        steps=[StepOut(id=s.id, picture=s.picture, label=s.label, done=s.id in done) for s in steps], state=state,
    )


async def _steps(db: AsyncSession, routine_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[RoutineStep]]:
    rows = (
        await db.execute(select(RoutineStep).where(RoutineStep.routine_id.in_(routine_ids)).order_by(RoutineStep.position))
    ).scalars().all() if routine_ids else []
    out: dict[uuid.UUID, list[RoutineStep]] = {}
    for step in rows:
        out.setdefault(step.routine_id, []).append(step)
    return out


async def easy_day(db: AsyncSession, child: User, today: date, new_sticker: str | None = None) -> EasyDay:
    routines = (
        await db.execute(select(Routine).where(Routine.user_id == child.id).order_by(Routine.position, Routine.created_at))
    ).scalars().all()
    routine_tasks = {r.task_id for r in routines}
    tasks = (
        await db.execute(select(Task).where(Task.family_id == child.family_id, Task.assignee_id == child.id, Task.active == True))  # noqa: E712
    ).scalars().all()
    from app.routers.custody import away_today

    # In the other home: nothing to tick off here.
    due = {} if child.id in await away_today(db, child.family_id, today) else {t.id: t for t in tasks if due_today(t, today)}
    states = {
        c.task_id: c.status
        for c in (
            await db.execute(
                select(TaskCompletion).where(
                    TaskCompletion.user_id == child.id, TaskCompletion.completed_date == today,
                    TaskCompletion.status != "rejected", TaskCompletion.task_id.in_(list(due)),
                )
            )
        ).scalars().all()
    } if due else {}
    shown = [r for r in routines if r.task_id in due]
    steps = await _steps(db, [r.id for r in shown])
    all_steps = [s.id for r in shown for s in steps.get(r.id, [])]
    done = set(
        (await db.execute(select(RoutineStepDone.step_id).where(RoutineStepDone.step_id.in_(all_steps), RoutineStepDone.day == today))).scalars().all()
    ) if all_steps else set()
    stickers = (await db.execute(select(Sticker).where(Sticker.user_id == child.id))).scalars().all()
    return EasyDay(
        user_id=child.id, name=child.display_name, color=child.color,
        routines=[_routine_out(r, due[r.task_id], steps.get(r.id, []), done, states.get(r.task_id, "none")) for r in shown],
        tasks=[
            EasyTask(id=t.id, title=t.title, picture=t.picture, state=states.get(t.id, "none"))
            for t in sorted(due.values(), key=lambda t: t.title.casefold()) if t.id not in routine_tasks
        ],
        stickers=len(stickers),
        stickers_today=[s.sticker for s in sorted(stickers, key=lambda s: s.created_at) if s.day == today],
        new_sticker=new_sticker,
    )


async def _give_sticker(db: AsyncSession, child: User, task: Task, today: date) -> str:
    recent = (
        await db.execute(select(Sticker.sticker).where(Sticker.user_id == child.id).order_by(Sticker.created_at.desc()).limit(6))
    ).scalars().all()
    sticker = random.choice([s for s in STICKERS if s not in recent] or list(STICKERS))
    db.add(Sticker(family_id=child.family_id, user_id=child.id, sticker=sticker, task_id=task.id, day=today))
    await db.commit()
    return sticker


async def _routine_of_step(db: AsyncSession, child: User, step_id: uuid.UUID) -> tuple[RoutineStep, Routine, Task]:
    step = await db.get(RoutineStep, step_id)
    routine = await db.get(Routine, step.routine_id) if step else None
    if step is None or routine is None or routine.user_id != child.id:
        raise HTTPException(status_code=404, detail="Step not found")
    return step, routine, await db.get(Task, routine.task_id)


async def _completed_today(db: AsyncSession, task: Task, child: User, today: date) -> bool:
    return (
        await db.execute(
            select(TaskCompletion.id).where(
                TaskCompletion.task_id == task.id, TaskCompletion.user_id == child.id,
                TaskCompletion.completed_date == today, TaskCompletion.status != "rejected",
            )
        )
    ).first() is not None


async def step_done(db: AsyncSession, child: User, step_id: uuid.UUID, today: date) -> EasyDay:
    """A step done; the last one finishes the routine (its task) and gives a sticker."""
    step, routine, task = await _routine_of_step(db, child, step_id)
    exists = (await db.execute(select(RoutineStepDone).where(RoutineStepDone.step_id == step.id, RoutineStepDone.day == today))).first()
    if not exists:
        db.add(RoutineStepDone(family_id=child.family_id, step_id=step.id, day=today, done_at=datetime.now(timezone.utc)))
        await db.commit()
    steps = (await db.execute(select(RoutineStep.id).where(RoutineStep.routine_id == routine.id))).scalars().all()
    done = (await db.execute(select(RoutineStepDone.step_id).where(RoutineStepDone.step_id.in_(steps), RoutineStepDone.day == today))).scalars().all()
    sticker = None
    if set(steps) <= set(done) and task.active and not await _completed_today(db, task, child, today):
        await complete_for(db, task, child, today)
        sticker = await _give_sticker(db, child, task, today)
    return await easy_day(db, child, today, sticker)


async def step_undo(db: AsyncSession, child: User, step_id: uuid.UUID, today: date) -> EasyDay:
    step, _, task = await _routine_of_step(db, child, step_id)
    if await _completed_today(db, task, child, today):
        raise HTTPException(status_code=409, detail="The routine is already done today")
    await db.execute(delete(RoutineStepDone).where(RoutineStepDone.step_id == step.id, RoutineStepDone.day == today))
    await db.commit()
    return await easy_day(db, child, today)


async def task_done(db: AsyncSession, child: User, task_id: uuid.UUID, today: date) -> EasyDay:
    task = await db.get(Task, task_id)
    if task is None or task.family_id != child.family_id or not task.active or task.assignee_id != child.id:
        raise HTTPException(status_code=404, detail="Task not found")
    if (await db.execute(select(Routine.id).where(Routine.task_id == task.id))).first():
        raise HTTPException(status_code=422, detail="A routine is done one step at a time")
    await complete_for(db, task, child, today)
    return await easy_day(db, child, today, await _give_sticker(db, child, task, today))


# --- The child (or an adult looking at a child) ---------------------------------------------


@router.get("/today", response_model=EasyDay)
async def today_view(user: CurrentUser, db: DB, user_id: uuid.UUID | None = None) -> EasyDay:
    return await easy_day(db, await _whose(db, user, user_id), date.today())


@router.post("/steps/{step_id}/done", response_model=EasyDay)
async def mark_step(step_id: uuid.UUID, user: CurrentUser, db: DB, user_id: uuid.UUID | None = None) -> EasyDay:
    return await step_done(db, await _whose(db, user, user_id), step_id, date.today())


@router.delete("/steps/{step_id}/done", response_model=EasyDay)
async def unmark_step(step_id: uuid.UUID, user: CurrentUser, db: DB, user_id: uuid.UUID | None = None) -> EasyDay:
    return await step_undo(db, await _whose(db, user, user_id), step_id, date.today())


@router.post("/tasks/{task_id}/done", response_model=EasyDay)
async def mark_task(task_id: uuid.UUID, user: CurrentUser, db: DB, user_id: uuid.UUID | None = None) -> EasyDay:
    return await task_done(db, await _whose(db, user, user_id), task_id, date.today())


@router.get("/stickers", response_model=list[str])
async def stickers(user: CurrentUser, db: DB, user_id: uuid.UUID | None = None) -> list[str]:
    child = await _whose(db, user, user_id)
    rows = (await db.execute(select(Sticker.sticker).where(Sticker.user_id == child.id).order_by(Sticker.created_at))).scalars().all()
    return list(rows)


# --- The adults: who is in the mode, and the routines ----------------------------------------


@router.get("/children", response_model=list[ChildOut])
async def children(user: CurrentUser, db: DB) -> list[ChildOut]:
    _adult(user)
    rows = (
        await db.execute(select(User).where(User.family_id == user.family_id, User.role == "child").order_by(User.created_at))
    ).scalars().all()
    return [ChildOut(id=c.id, display_name=c.display_name, color=c.color, easy_mode=bool(c.easy_mode)) for c in rows]


@router.put("/children/{user_id}", response_model=ChildOut)
async def set_easy_mode(user_id: uuid.UUID, payload: EasyModeIn, user: CurrentUser, db: DB) -> ChildOut:
    _adult(user)
    child = await _child(db, user.family_id, user_id)
    if child.role != "child":
        raise HTTPException(status_code=422, detail="Only children have the little ones' mode")
    child.easy_mode = payload.easy_mode
    await db.commit()
    return ChildOut(id=child.id, display_name=child.display_name, color=child.color, easy_mode=child.easy_mode)


@router.get("/routines", response_model=list[RoutineOut])
async def routines(user_id: uuid.UUID, user: CurrentUser, db: DB) -> list[RoutineOut]:
    _adult(user)
    child = await _child(db, user.family_id, user_id)
    rows = (await db.execute(select(Routine).where(Routine.user_id == child.id).order_by(Routine.position, Routine.created_at))).scalars().all()
    steps = await _steps(db, [r.id for r in rows])
    return [_routine_out(r, await db.get(Task, r.task_id), steps.get(r.id, []), set(), "none") for r in rows]


def _schedule(task: Task, weekdays: list[int]) -> None:
    days = sorted({d for d in weekdays if 0 <= d <= 6})
    if days and len(days) < 7:
        task.recurrence, task.weekdays, task.weekday, task.interval_weeks = "weekly", days, days[0], 1
    else:
        task.recurrence, task.weekdays, task.weekday = "daily", [], None


async def _save_steps(db: AsyncSession, routine: Routine, steps: list[StepIn]) -> None:
    """Steps kept by id stay (and today's ticks with them); the rest are new."""
    old = {s.id: s for s in (await db.execute(select(RoutineStep).where(RoutineStep.routine_id == routine.id))).scalars().all()}
    keep: set[uuid.UUID] = set()
    for i, step in enumerate(steps):
        row = old.get(step.id) if step.id else None
        if row is None:
            row = RoutineStep(family_id=routine.family_id, routine_id=routine.id)
            db.add(row)
        else:
            keep.add(row.id)
        row.picture, row.label, row.position = step.picture.strip(), step.label.strip(), i
    for step_id, row in old.items():
        if step_id not in keep:
            await db.delete(row)


@router.post("/routines", response_model=RoutineOut, status_code=status.HTTP_201_CREATED)
async def create_routine(payload: RoutineIn, user: CurrentUser, db: DB) -> RoutineOut:
    _adult(user)
    child = await _child(db, user.family_id, payload.user_id)
    task = Task(
        family_id=user.family_id, created_by=user.id, assignee_id=child.id, title=payload.name.strip(), points=payload.points,
        requires_approval=payload.requires_approval, picture=payload.picture, anchor_date=date.today(), weekdays=[],
    )
    _schedule(task, payload.weekdays)
    db.add(task)
    await db.flush()
    count = len((await db.execute(select(Routine.id).where(Routine.user_id == child.id))).all())
    routine = Routine(family_id=user.family_id, user_id=child.id, task_id=task.id, name=payload.name.strip(), picture=payload.picture, position=count)
    db.add(routine)
    await db.flush()
    await _save_steps(db, routine, payload.steps)
    await db.commit()
    steps = await _steps(db, [routine.id])
    return _routine_out(routine, task, steps.get(routine.id, []), set(), "none")


@router.put("/routines/{routine_id}", response_model=RoutineOut)
async def update_routine(routine_id: uuid.UUID, payload: RoutineIn, user: CurrentUser, db: DB) -> RoutineOut:
    _adult(user)
    routine = await db.get(Routine, routine_id)
    if routine is None or routine.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Routine not found")
    task = await db.get(Task, routine.task_id)
    routine.name, routine.picture = payload.name.strip(), payload.picture
    task.title, task.picture, task.points, task.requires_approval = routine.name, routine.picture, payload.points, payload.requires_approval
    _schedule(task, payload.weekdays)
    await _save_steps(db, routine, payload.steps)
    await db.commit()
    steps = await _steps(db, [routine.id])
    return _routine_out(routine, task, steps.get(routine.id, []), set(), "none")


@router.delete("/routines/{routine_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_routine(routine_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    """The routine goes; its task stays in the history (as when a task is removed) but not on Today."""
    _adult(user)
    routine = await db.get(Routine, routine_id)
    if routine is None or routine.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Routine not found")
    task = await db.get(Task, routine.task_id)
    if task:
        task.active = False
    steps = select(RoutineStep.id).where(RoutineStep.routine_id == routine.id)
    await db.execute(delete(RoutineStepDone).where(RoutineStepDone.step_id.in_(steps)))
    await db.execute(delete(RoutineStep).where(RoutineStep.routine_id == routine.id))
    await db.delete(routine)
    await db.commit()

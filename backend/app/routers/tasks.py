"""Gamified household tasks: today view, completions, leaderboard."""
import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import DB, CurrentUser, require_app
from app.models import Family, Pet, Property, PropertyProject, Task, TaskCompletion, TaskSuggestion, User, Vehicle
from app.schemas import (
    ApprovalAction,
    ApprovalOut,
    LeaderboardEntry,
    TaskCreate,
    TaskHistoryItem,
    TaskOut,
    TasksAttentionOut,
    TaskSuggestionIn,
    TaskSuggestionOut,
    TaskSuggestionReject,
    TaskUpdate,
    TodayTask,
    WeekDayTasks,
)
from app.services.achievements import evaluate_achievements
from app.services.gamification import leaderboard
from app.services.notify import notify
from app.services.rewards import check_family_rewards
from app.services import medicine, rotation
from app.services.schedule import due_on, due_today, week_start

router = APIRouter(prefix="/api/tasks", tags=["tasks"], dependencies=[require_app("tasks")])


SCHEDULE_FIELDS = ("recurrence", "weekday", "weekdays", "interval_weeks", "month", "day_of_month", "due_date")


def _normalized_schedule(values: dict) -> dict:
    """Validates a task's schedule and returns it cleaned up (fields that don't apply cleared)."""
    recurrence = values["recurrence"]
    out = {
        "recurrence": recurrence,
        "weekday": None,
        "weekdays": [],
        "interval_weeks": 1,
        "month": None,
        "day_of_month": None,
        "due_date": None,
    }
    if recurrence == "weekly":
        days = sorted(set(values.get("weekdays") or []))
        if not days and values.get("weekday") is not None:
            days = [values["weekday"]]
        if not days or any(d < 0 or d > 6 for d in days):
            raise HTTPException(status_code=422, detail="Weekly tasks need at least one weekday")
        out.update(weekdays=days, weekday=days[0], interval_weeks=values.get("interval_weeks") or 1)
    elif recurrence == "monthly":
        if values.get("day_of_month") is None:
            raise HTTPException(status_code=422, detail="Monthly tasks need day_of_month")
        out["day_of_month"] = values["day_of_month"]
    elif recurrence == "yearly":
        if values.get("month") is None or values.get("day_of_month") is None:
            raise HTTPException(status_code=422, detail="Yearly tasks need month and day_of_month")
        out.update(month=values["month"], day_of_month=values["day_of_month"])
    elif recurrence == "none":
        if values.get("due_date") is None:
            raise HTTPException(status_code=422, detail="One-off tasks need a due date")
        out["due_date"] = values["due_date"]
    return out


# Push texts in the recipient's language (the app UI has the full translations).
_PUSH_TEXT = {
    "pending": {
        "en": ("Approval needed", "{name} completed: {task}"),
        "sv": ("Godkännande behövs", "{name} har gjort: {task}"),
        "nb": ("Godkjenning trengs", "{name} har gjort: {task}"),
        "da": ("Godkendelse påkrævet", "{name} har lavet: {task}"),
        "fi": ("Hyväksyntä tarvitaan", "{name} teki: {task}"),
    },
    "approved": {
        "en": ("Task approved", "{task} was approved"),
        "sv": ("Uppgift godkänd", "{task} blev godkänd"),
        "nb": ("Oppgave godkjent", "{task} ble godkjent"),
        "da": ("Opgave godkendt", "{task} blev godkendt"),
        "fi": ("Tehtävä hyväksytty", "{task} hyväksyttiin"),
    },
    "suggestion": {
        "en": ("New task suggestion", "{name} suggests: {task}"),
        "sv": ("Nytt uppgiftsförslag", "{name} föreslår: {task}"),
        "nb": ("Nytt oppgaveforslag", "{name} foreslår: {task}"),
        "da": ("Nyt opgaveforslag", "{name} foreslår: {task}"),
        "fi": ("Uusi tehtäväehdotus", "{name} ehdottaa: {task}"),
    },
    "suggestion_approved": {
        "en": ("Your suggestion was approved", "{task} is now a task"),
        "sv": ("Ditt förslag godkändes", "{task} är nu en uppgift"),
        "nb": ("Forslaget ditt ble godkjent", "{task} er nå en oppgave"),
        "da": ("Dit forslag blev godkendt", "{task} er nu en opgave"),
        "fi": ("Ehdotuksesi hyväksyttiin", "{task} on nyt tehtävä"),
    },
    "suggestion_rejected": {
        "en": ("Your suggestion was declined", "{task}"),
        "sv": ("Ditt förslag blev inte av", "{task}"),
        "nb": ("Forslaget ditt ble ikke godkjent", "{task}"),
        "da": ("Dit forslag blev ikke godkendt", "{task}"),
        "fi": ("Ehdotustasi ei hyväksytty", "{task}"),
    },
    "rejected": {
        "en": ("Task not approved", "{task} needs to be redone"),
        "sv": ("Uppgift inte godkänd", "{task} behöver göras om"),
        "nb": ("Oppgave ikke godkjent", "{task} må gjøres på nytt"),
        "da": ("Opgave ikke godkendt", "{task} skal laves om"),
        "fi": ("Tehtävää ei hyväksytty", "{task} pitää tehdä uudelleen"),
    },
}


def _push_text(kind: str, recipient: User, **values: str) -> tuple[str, str]:
    title, body = _PUSH_TEXT[kind].get(recipient.language or "en", _PUSH_TEXT[kind]["en"])
    return title, body.format(**values)


def _require_adult_or_admin(user: User) -> None:
    if user.role not in {"admin", "adult"}:
        raise HTTPException(status_code=403, detail="Adult or admin privileges required")


async def _check_rotation_and_pet(db, user: User, members: list[uuid.UUID] | None, pet_id: uuid.UUID | None) -> list[str] | None:
    """Rotation members (as stored: strings) must be in the family; so must the pet."""
    if pet_id is not None:
        pet = await db.get(Pet, pet_id)
        if pet is None or pet.family_id != user.family_id:
            raise HTTPException(status_code=422, detail="Invalid pet_id")
    if members is None:
        return None
    unique = list(dict.fromkeys(members))
    if len(unique) == 1:
        raise HTTPException(status_code=422, detail="Choose at least two members to take turns")
    for member_id in unique:
        member = await db.get(User, member_id)
        if member is None or member.family_id != user.family_id:
            raise HTTPException(status_code=422, detail="Invalid rotation member")
    return [str(m) for m in unique]


async def _sync_rotations(db, tasks, today: date) -> None:
    """Weekly rotations move on by themselves: put each task on this week's turn."""
    if any(rotation.sync(task, today) for task in tasks if rotation.rotating(task)):
        await db.commit()


def _not_a_dose(task: Task) -> None:
    """A medicine's dose follows the medicine: it's changed there, in the family's settings."""
    if task.medication_id is not None and task.active:
        raise HTTPException(status_code=409, detail="Change the medicine instead – the family's settings, Safety")


def _normalized_title(title: str) -> str:
    return " ".join(title.casefold().split())


@router.get("", response_model=list[TaskOut])
async def list_tasks(user: CurrentUser, db: DB) -> list[Task]:
    result = await db.execute(
        select(Task).where(Task.family_id == user.family_id, Task.active == True)  # noqa: E712
        .order_by(Task.created_at)
    )
    return list(result.scalars().all())


@router.get("/manage", response_model=list[TaskOut])
async def list_tasks_manage(user: CurrentUser, db: DB) -> list[Task]:
    _require_adult_or_admin(user)
    result = await db.execute(
        select(Task).where(Task.family_id == user.family_id).order_by(Task.created_at)
    )
    return list(result.scalars().all())


# Something done but not ticked off can be reported afterwards, this many days back (2.9.0).
REPORT_DAYS_BACK = 3


def _report_day(back: int) -> date:
    """`back` days before the server's today – counted here, so the browser's clock and time zone
    never decide which day it is."""
    if not 0 <= back <= REPORT_DAYS_BACK:
        raise HTTPException(status_code=422, detail=f"Only today or up to {REPORT_DAYS_BACK} days back")
    return date.today() - timedelta(days=back)


def _turn(task: Task, day: date) -> uuid.UUID | None:
    """Whose the task was on a day (weekly turns move with the calendar)."""
    if rotation.rotating(task) and task.rotation_mode == "weekly":
        return rotation.turn_on(task, day)
    return task.assignee_id


@router.get("/today", response_model=list[TodayTask])
async def today_tasks(user: CurrentUser, db: DB, back: int = 0) -> list[TodayTask]:
    """Today's tasks – or, to report something afterwards, one of the last few days' (`back`)."""
    today = _report_day(back)
    tasks = (
        (await db.execute(select(Task).where(Task.family_id == user.family_id)))
        .scalars()
        .all()
    )
    if today == date.today():
        await _sync_rotations(db, tasks, today)
    completion_rows = (
        (
            await db.execute(
                select(TaskCompletion, User.display_name)
                .join(User, User.id == TaskCompletion.user_id)
                .where(
                    TaskCompletion.family_id == user.family_id,
                    TaskCompletion.completed_date == today,
                )
                .order_by(TaskCompletion.created_at.desc())
            )
        )
        .all()
    )

    current_map: dict[uuid.UUID, tuple[TaskCompletion, str]] = {}
    rejected_map: dict[uuid.UUID, TaskCompletion] = {}
    for completion, display_name in completion_rows:
        if completion.status == "rejected":
            rejected_map.setdefault(completion.task_id, completion)
            continue
        current_map.setdefault(completion.task_id, (completion, display_name))

    from app.routers.custody import away_today

    away = await away_today(db, user.family_id, today)
    items: list[TodayTask] = []
    for task in tasks:
        current = current_map.get(task.id)
        rejected = rejected_map.get(task.id)
        # A child in their other home: their tasks wait (unless already done today).
        waiting = task.assignee_id in away and current is None
        due = due_today(task, today) if today == date.today() else task.active and due_on(task, today)
        if (due and not waiting) or current is not None or rejected is not None:
            out_task = TaskOut.model_validate(task)
            if today != date.today():
                out_task = out_task.model_copy(update={"assignee_id": _turn(task, today)})
            if current is not None:
                completion, who = current
                items.append(
                    TodayTask(
                        task=out_task,
                        done=completion.status == "approved",
                        done_by=who if completion.status == "approved" else None,
                        completion_status=completion.status,
                        review_note=completion.review_note,
                    )
                )
                continue
            items.append(
                TodayTask(
                    task=out_task,
                    done=False,
                    completion_status="rejected" if rejected is not None else None,
                    review_note=rejected.review_note if rejected is not None else None,
                )
            )
    return items


@router.get("/week", response_model=list[WeekDayTasks])
async def week_tasks(user: CurrentUser, db: DB, start: date | None = None) -> list[WeekDayTasks]:
    """The tasks of a whole week (Monday first) with who did what; only today's can be completed."""
    today = date.today()
    first = week_start(start or today)
    days = [first + timedelta(days=i) for i in range(7)]
    tasks = (await db.execute(select(Task).where(Task.family_id == user.family_id))).scalars().all()
    await _sync_rotations(db, tasks, today)
    rows = (
        await db.execute(
            select(TaskCompletion, User.display_name)
            .join(User, User.id == TaskCompletion.user_id)
            .where(
                TaskCompletion.family_id == user.family_id,
                TaskCompletion.completed_date >= days[0],
                TaskCompletion.completed_date <= days[-1],
            )
            .order_by(TaskCompletion.created_at.desc())
        )
    ).all()
    latest: dict[tuple[uuid.UUID, date], tuple[TaskCompletion, str]] = {}
    for completion, name in rows:
        latest.setdefault((completion.task_id, completion.completed_date), (completion, name))

    from app.routers.custody import away_today

    out: list[WeekDayTasks] = []
    for day in days:
        items: list[TodayTask] = []
        away = await away_today(db, user.family_id, day)
        for task in tasks:
            hit = latest.get((task.id, day))
            # Overdue one-off tasks are shown on today, like in the today view.
            due = task.active and (due_on(task, day) or (day == today and due_today(task, today))) and task.assignee_id not in away
            if not due and hit is None:
                continue
            completion, name = hit if hit else (None, None)
            out_task = TaskOut.model_validate(task)
            if rotation.rotating(task) and task.rotation_mode == "weekly" and day > today:
                # Next week's days show next week's turn.
                out_task = out_task.model_copy(update={"assignee_id": rotation.turn_on(task, day)})
            items.append(
                TodayTask(
                    task=out_task,
                    done=completion is not None and completion.status == "approved",
                    done_by=name if completion is not None and completion.status == "approved" else None,
                    completion_status=completion.status if completion else None,
                    review_note=completion.review_note if completion else None,
                )
            )
        out.append(WeekDayTasks(day=day, items=items))
    return out


@router.get("/history", response_model=list[TaskHistoryItem])
async def task_history(user: CurrentUser, db: DB, days: int = Query(default=30, ge=1, le=365)) -> list[TaskHistoryItem]:
    """What I have ticked off lately, newest first."""
    rows = (
        await db.execute(
            select(TaskCompletion, Task.title)
            .join(Task, Task.id == TaskCompletion.task_id)
            .where(
                TaskCompletion.user_id == user.id,
                TaskCompletion.completed_date >= date.today() - timedelta(days=days),
            )
            .order_by(TaskCompletion.completed_date.desc(), TaskCompletion.created_at.desc())
            .limit(200)
        )
    ).all()
    return [
        TaskHistoryItem(
            task_id=c.task_id,
            title=title,
            completed_date=c.completed_date,
            points_awarded=c.points_awarded,
            status=c.status,
        )
        for c, title in rows
    ]


def _suggestion_out(suggestion: TaskSuggestion, user_name: str) -> TaskSuggestionOut:
    out = TaskSuggestionOut.model_validate(suggestion)
    out.user_name = user_name
    return out


@router.get("/attention", response_model=TasksAttentionOut)
async def tasks_attention(user: CurrentUser, db: DB) -> TasksAttentionOut:
    """Counts for the adults' badge and banner (always zero for children)."""
    if user.role not in {"admin", "adult"}:
        return TasksAttentionOut(approvals=0, suggestions=0)
    approvals = (
        await db.execute(
            select(func.count()).select_from(TaskCompletion).where(
                TaskCompletion.family_id == user.family_id, TaskCompletion.status == "pending"
            )
        )
    ).scalar_one()
    suggestions = (
        await db.execute(
            select(func.count()).select_from(TaskSuggestion).where(
                TaskSuggestion.family_id == user.family_id, TaskSuggestion.status == "pending"
            )
        )
    ).scalar_one()
    return TasksAttentionOut(approvals=approvals, suggestions=suggestions)


@router.get("/suggestions", response_model=list[TaskSuggestionOut])
async def list_suggestions(user: CurrentUser, db: DB) -> list[TaskSuggestionOut]:
    """Adults: the family's open suggestions. Children: their own, newest first."""
    query = (
        select(TaskSuggestion, User.display_name)
        .join(User, User.id == TaskSuggestion.user_id)
        .where(TaskSuggestion.family_id == user.family_id)
        .order_by(TaskSuggestion.created_at.desc())
        .limit(50)
    )
    if user.role in {"admin", "adult"}:
        query = query.where(TaskSuggestion.status == "pending")
    else:
        query = query.where(TaskSuggestion.user_id == user.id)
    return [_suggestion_out(s, name) for s, name in (await db.execute(query)).all()]


@router.post("/suggestions", response_model=TaskSuggestionOut, status_code=status.HTTP_201_CREATED)
async def suggest_task(payload: TaskSuggestionIn, user: CurrentUser, db: DB) -> TaskSuggestionOut:
    suggestion = TaskSuggestion(
        family_id=user.family_id,
        user_id=user.id,
        title=payload.title.strip(),
        description=(payload.description or "").strip() or None,
    )
    db.add(suggestion)
    await db.commit()
    await db.refresh(suggestion)
    adults = (
        await db.execute(
            select(User).where(User.family_id == user.family_id, User.role.in_(["admin", "adult"]), User.id != user.id)
        )
    ).scalars().all()
    for adult in adults:
        title, body = _push_text("suggestion", adult, name=user.display_name, task=suggestion.title)
        await notify(db, adult, {"title": title, "body": body, "route": "/tasks?tab=approvals", "kind": "task_suggestion"}, pref="approvals")
    return _suggestion_out(suggestion, user.display_name)


async def _open_suggestion(suggestion_id: uuid.UUID, user: User, db) -> TaskSuggestion:
    _require_adult_or_admin(user)
    suggestion = await db.get(TaskSuggestion, suggestion_id)
    if suggestion is None or suggestion.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Suggestion not found")
    if suggestion.status != "pending":
        raise HTTPException(status_code=409, detail="Suggestion is already handled")
    return suggestion


@router.post("/suggestions/{suggestion_id}/approve", response_model=TaskOut)
async def approve_suggestion(suggestion_id: uuid.UUID, payload: TaskCreate, user: CurrentUser, db: DB) -> Task:
    """The adult decides schedule, points and who; the suggestion becomes a real task."""
    suggestion = await _open_suggestion(suggestion_id, user, db)
    task = await _create_task(payload, user, db, force=True)
    suggestion.status = "approved"
    suggestion.task_id = task.id
    suggestion.reviewed_by = user.id
    suggestion.reviewed_at = datetime.now(timezone.utc)
    await db.commit()
    author = await db.get(User, suggestion.user_id)
    if author is not None and author.id != user.id:
        title, body = _push_text("suggestion_approved", author, task=task.title)
        await notify(db, author, {"title": title, "body": body, "route": "/tasks", "kind": "suggestion_reviewed"}, pref="approvals")
    return task


@router.post("/suggestions/{suggestion_id}/reject", response_model=TaskSuggestionOut)
async def reject_suggestion(
    suggestion_id: uuid.UUID, payload: TaskSuggestionReject, user: CurrentUser, db: DB
) -> TaskSuggestionOut:
    suggestion = await _open_suggestion(suggestion_id, user, db)
    suggestion.status = "rejected"
    suggestion.review_note = (payload.note or "").strip() or None
    suggestion.reviewed_by = user.id
    suggestion.reviewed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(suggestion)
    author = await db.get(User, suggestion.user_id)
    if author is not None and author.id != user.id:
        title, body = _push_text("suggestion_rejected", author, task=suggestion.title)
        if suggestion.review_note:
            body = f"{body} – {suggestion.review_note}"
        await notify(db, author, {"title": title, "body": body, "route": "/tasks", "kind": "suggestion_reviewed"}, pref="approvals")
    return _suggestion_out(suggestion, author.display_name if author else "")


@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
async def create_task(payload: TaskCreate, user: CurrentUser, db: DB, force: bool = Query(default=False)) -> Task:
    _require_adult_or_admin(user)
    return await _create_task(payload, user, db, force)


async def _create_task(payload: TaskCreate, user: User, db, force: bool) -> Task:
    schedule = _normalized_schedule(payload.model_dump())
    if payload.assignee_id is not None:
        assignee = await db.get(User, payload.assignee_id)
        if assignee is None or assignee.family_id != user.family_id:
            raise HTTPException(status_code=422, detail="Invalid assignee")
    if payload.property_id is not None:
        prop = await db.get(Property, payload.property_id)
        if prop is None or prop.family_id != user.family_id:
            raise HTTPException(status_code=422, detail="Invalid property_id")
    if payload.project_id is not None:
        project = await db.get(PropertyProject, payload.project_id)
        if project is None:
            raise HTTPException(status_code=422, detail="Invalid project_id")
        if payload.property_id is not None and project.property_id != payload.property_id:
            raise HTTPException(status_code=422, detail="project_id does not belong to property_id")
        prop = await db.get(Property, project.property_id)
        if prop is None or prop.family_id != user.family_id:
            raise HTTPException(status_code=422, detail="Invalid project_id")
    if payload.vehicle_id is not None:
        vehicle = await db.get(Vehicle, payload.vehicle_id)
        if vehicle is None or vehicle.family_id != user.family_id:
            raise HTTPException(status_code=422, detail="Invalid vehicle_id")
    existing = (
        await db.execute(
            select(Task).where(Task.family_id == user.family_id, Task.active == True)  # noqa: E712
        )
    ).scalars().all()
    new_norm = _normalized_title(payload.title)
    has_duplicate = any(_normalized_title(t.title) == new_norm for t in existing)
    if has_duplicate and not force:
        raise HTTPException(status_code=409, detail="Active task with the same title already exists")

    members = await _check_rotation_and_pet(db, user, payload.rotation_user_ids or None, payload.pet_id)
    fields = payload.model_dump(exclude=set(SCHEDULE_FIELDS) | {"rotation_user_ids"})
    task = Task(family_id=user.family_id, created_by=user.id, anchor_date=date.today(), rotation_user_ids=members or [], **fields, **schedule)
    rotation.sync(task, date.today())
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


@router.patch("/{task_id}", response_model=TaskOut)
async def update_task(task_id: uuid.UUID, payload: TaskUpdate, user: CurrentUser, db: DB) -> Task:
    _require_adult_or_admin(user)
    task = await db.get(Task, task_id)
    if task is None or task.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Task not found")
    _not_a_dose(task)
    data = payload.model_dump(exclude_unset=True)
    if any(field in data for field in SCHEDULE_FIELDS):
        current = {field: getattr(task, field) for field in SCHEDULE_FIELDS}
        if "weekday" in data and "weekdays" not in data:
            current["weekdays"] = []  # an older client changed the single weekday
        schedule = _normalized_schedule({**current, **{k: v for k, v in data.items() if k in SCHEDULE_FIELDS}})
        if schedule["interval_weeks"] != task.interval_weeks or task.anchor_date is None:
            # "Every other week" counts from the week it was set up in.
            data["anchor_date"] = date.today()
        data.update(schedule)
    if data.get("assignee_id") is not None:
        assignee = await db.get(User, data["assignee_id"])
        if assignee is None or assignee.family_id != user.family_id:
            raise HTTPException(status_code=422, detail="Invalid assignee")

    property_id = data.get("property_id", task.property_id)
    project_id = data.get("project_id", task.project_id)
    vehicle_id = data.get("vehicle_id", task.vehicle_id)
    if property_id is not None:
        prop = await db.get(Property, property_id)
        if prop is None or prop.family_id != user.family_id:
            raise HTTPException(status_code=422, detail="Invalid property_id")
    if project_id is not None:
        project = await db.get(PropertyProject, project_id)
        if project is None:
            raise HTTPException(status_code=422, detail="Invalid project_id")
        project_prop = await db.get(Property, project.property_id)
        if project_prop is None or project_prop.family_id != user.family_id:
            raise HTTPException(status_code=422, detail="Invalid project_id")
        if property_id is not None and project.property_id != property_id:
            raise HTTPException(status_code=422, detail="project_id does not belong to property_id")
    if vehicle_id is not None:
        vehicle = await db.get(Vehicle, vehicle_id)
        if vehicle is None or vehicle.family_id != user.family_id:
            raise HTTPException(status_code=422, detail="Invalid vehicle_id")

    if "rotation_user_ids" in data or "pet_id" in data:
        members = data.get("rotation_user_ids")
        checked = await _check_rotation_and_pet(db, user, members if members else None, data.get("pet_id"))
        if "rotation_user_ids" in data:
            data["rotation_user_ids"] = checked or []
            if data["rotation_user_ids"] != [str(m) for m in task.rotation_user_ids or []]:
                data["rotation_index"] = 0
    for field, value in data.items():
        setattr(task, field, value)
    rotation.sync(task, date.today())
    await db.commit()
    await db.refresh(task)
    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(task_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    _require_adult_or_admin(user)
    task = await db.get(Task, task_id)
    if task is None or task.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Task not found")
    _not_a_dose(task)

    # Hard delete requested: remove related completions first to satisfy FK constraints.
    await db.execute(
        delete(TaskCompletion).where(
            TaskCompletion.family_id == user.family_id,
            TaskCompletion.task_id == task.id,
        )
    )
    await db.delete(task)
    await db.commit()


class CompleteIn(BaseModel):
    # A task done together (3.0.3): the others who did it with you.
    together: list[uuid.UUID] = Field(default=[], max_length=10)


def shares(points: int, n: int) -> list[int]:
    """The points split between n who did it together – the first ones get what's left over."""
    base, left = divmod(points, n)
    return [base + (1 if i < left else 0) for i in range(n)]


async def others(db, task: Task, user: User, ids: list[uuid.UUID]) -> list[User]:
    """Those who did a shared task together with `user` (members of the family)."""
    ids = [i for i in dict.fromkeys(ids) if i != user.id]
    if ids and not task.shared:
        raise HTTPException(status_code=422, detail="Only a shared task can be done together")
    found = []
    for member_id in ids:
        member = await db.get(User, member_id)
        if member is None or member.family_id != task.family_id:
            raise HTTPException(status_code=422, detail="Unknown family member")
        found.append(member)
    return found


@router.post("/{task_id}/complete", response_model=TodayTask)
async def complete_task(task_id: uuid.UUID, user: CurrentUser, db: DB, back: int = 0, payload: CompleteIn | None = None) -> TodayTask:
    """Done today – or reported afterwards for one of the last few days (`back` days ago)."""
    today = _report_day(back)
    task = await db.get(Task, task_id)
    if task is None or task.family_id != user.family_id or not task.active:
        raise HTTPException(status_code=404, detail="Task not found")
    if today != date.today() and not due_on(task, today) and not (task.recurrence == "none" and task.due_date and task.due_date <= today):
        raise HTTPException(status_code=422, detail="The task wasn't due that day")
    assignee_id = _turn(task, today)
    if assignee_id is not None and assignee_id != user.id:
        # A dose of medicine is often given by an adult: the points are still the one it's for.
        if task.medication_id is not None and user.role in ("admin", "adult"):
            assignee = await db.get(User, assignee_id)
            if assignee is not None and assignee.family_id == user.family_id:
                return await complete_for(db, task, assignee, today, ticked_by=user)
        raise HTTPException(status_code=403, detail="Task is assigned to someone else")
    return await complete_for(db, task, user, today, together=await others(db, task, user, payload.together if payload else []))


async def complete_for(db: AsyncSession, task: Task, user: User, today: date, ticked_by: User | None = None, together: list[User] | None = None) -> TodayTask:
    """`user` did `task` today: points, or waiting for an adult, as the family wants. An adult who
    ticks it off for a child (`ticked_by`) needs no one's approval. Done `together` with others
    (a shared task), the points are split between them."""
    existing = (
        await db.execute(
            select(TaskCompletion).where(
                TaskCompletion.task_id == task.id,
                TaskCompletion.completed_date == today,
                TaskCompletion.status != "rejected",
            )
        )
    ).scalars().first()
    if existing:
        raise HTTPException(status_code=409, detail="Task is already completed today")

    family = await db.get(Family, user.family_id)
    doers = [user, *(together or [])]
    split = shares(task.points, len(doers))
    statuses: dict[uuid.UUID, str] = {}
    # A completion an adult rejected today is done again in its place (one per person and day).
    rejected = {
        c.user_id: c
        for c in (
            await db.execute(select(TaskCompletion).where(TaskCompletion.task_id == task.id, TaskCompletion.completed_date == today, TaskCompletion.status == "rejected"))
        ).scalars()
    }
    for doer, share in zip(doers, split):
        # Children's tasks wait for an adult when the family wants that (default) or the task says so.
        waits = doer.role == "child" and ticked_by is None and (task.requires_approval or (family is not None and family.child_approval))
        statuses[doer.id] = "pending" if waits else "approved"
        row = rejected.get(doer.id)
        if row is None:
            row = TaskCompletion(family_id=user.family_id, task_id=task.id, user_id=doer.id, completed_date=today)
            db.add(row)
        row.points_awarded = 0 if waits else share
        row.share = share if len(doers) > 1 else None
        row.status = statuses[doer.id]
        row.reviewed_by = row.reviewed_at = row.review_note = None
    status_value = statuses[user.id]
    pending = status_value == "pending"
    if task.medication_id is not None:
        # The dose is taken whether or not the points wait for an adult.
        await medicine.tick_from_task(db, task, ticked_by or user, today)
    if task.recurrence == "none" and "approved" in statuses.values():
        task.active = False  # one-off tasks disappear once completed
    rotation.after_done(task)  # taking turns: the next one's turn now
    await db.commit()
    await db.refresh(task)
    waiting = [d for d in doers if statuses[d.id] == "pending"]
    if waiting:
        adults = (
            await db.execute(
                select(User).where(
                    User.family_id == user.family_id,
                    User.role.in_(["admin", "adult"]),
                )
            )
        ).scalars().all()
        for adult in adults:
            title, body = _push_text("pending", adult, name=", ".join(d.display_name for d in waiting), task=task.title)
            await notify(
                db,
                adult,
                {"title": title, "body": body, "route": "/tasks?tab=approvals", "kind": "approval_pending"},
                pref="approvals",
            )

    unlocked: list[str] = []
    for doer in doers:
        if statuses[doer.id] == "approved":
            found = await evaluate_achievements(db, doer)
            if doer.id == user.id:
                unlocked = found
    if "approved" in statuses.values():
        await check_family_rewards(db, user.family_id)
    return TodayTask(
        task=TaskOut.model_validate(task),
        done=status_value == "approved",
        done_by=user.display_name if status_value == "approved" else None,
        completion_status=status_value,
        unlocked=unlocked,
    )


@router.get("/approvals", response_model=list[ApprovalOut])
async def list_approvals(user: CurrentUser, db: DB) -> list[ApprovalOut]:
    _require_adult_or_admin(user)
    rows = (
        await db.execute(
            select(TaskCompletion, Task, User)
            .join(Task, Task.id == TaskCompletion.task_id)
            .join(User, User.id == TaskCompletion.user_id)
            .where(
                TaskCompletion.family_id == user.family_id,
                TaskCompletion.status == "pending",
            )
            .order_by(TaskCompletion.created_at)
        )
    ).all()
    return [
        ApprovalOut(
            completion_id=completion.id,
            task_id=task.id,
            task_title=task.title,
            user_id=member.id,
            user_name=member.display_name,
            completed_date=completion.completed_date,
            created_at=completion.created_at,
            points=completion.share if completion.share is not None else task.points,
        )
        for completion, task, member in rows
    ]


@router.post("/approvals/{completion_id}")
async def review_approval(completion_id: uuid.UUID, payload: ApprovalAction, user: CurrentUser, db: DB) -> dict:
    _require_adult_or_admin(user)
    completion = await db.get(TaskCompletion, completion_id)
    if completion is None or completion.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Completion not found")
    if completion.status != "pending":
        raise HTTPException(status_code=409, detail="Completion is not pending")

    task = await db.get(Task, completion.task_id)
    completion.reviewed_by = user.id
    completion.reviewed_at = datetime.now(timezone.utc)
    completion.review_note = payload.note

    unlocked: list[str] = []
    if payload.action == "approve":
        completion.status = "approved"
        # Done together: this one's share.
        completion.points_awarded = completion.share if completion.share is not None else task.points
        if task.recurrence == "none":
            task.active = False
        await db.commit()
        owner = await db.get(User, completion.user_id)
        unlocked = await evaluate_achievements(db, owner)
        await check_family_rewards(db, user.family_id)
        if owner is not None:
            title, body = _push_text("approved", owner, task=task.title)
            await notify(
                db,
                owner,
                {"title": title, "body": body, "route": "/tasks", "kind": "approval_reviewed", "status": "approved"},
                pref="approvals",
            )
    else:
        completion.status = "rejected"
        completion.points_awarded = 0
        await db.commit()
        owner = await db.get(User, completion.user_id)
        if owner is not None:
            title, body = _push_text("rejected", owner, task=task.title)
            await notify(
                db,
                owner,
                {"title": title, "body": body, "route": "/tasks", "kind": "approval_reviewed", "status": "rejected"},
                pref="approvals",
            )

    return {"status": completion.status, "unlocked": unlocked}


@router.get("/leaderboard", response_model=list[LeaderboardEntry])
async def get_leaderboard(user: CurrentUser, db: DB) -> list[LeaderboardEntry]:
    return [LeaderboardEntry(**entry) for entry in await leaderboard(db, user.family_id, date.today())]

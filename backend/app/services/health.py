"""Health (3.4.0): who sees what, the family's goals and a task done by exercising.

Each kind of a person's health – workouts, steps, sleep (with resting pulse), weight – is theirs alone
until they share it with the adults or the family. The adults always see a child's; a child's weight
isn't kept. What the family counts together (a goal, the Sunday check-in, the kitchen display) is
only the workouts shared with the whole family – never weight.
"""
import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import HealthGoal, Task, TaskCompletion, User, Workout

CATEGORIES = ("workouts", "steps", "sleep", "weight")


def adult(user: User) -> bool:
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
    if viewer.id == owner.id or (owner.role == "child" and adult(viewer)):
        return kinds
    share = shared(owner)
    return [c for c in kinds if share[c] == "family" or (share[c] == "adults" and adult(viewer))]


def may_enter(viewer: User, owner: User) -> bool:
    return viewer.family_id == owner.family_id and (viewer.id == owner.id or (owner.role == "child" and adult(viewer)))


async def family_exercise(db: AsyncSession, family_id: uuid.UUID, start: date, end: date) -> list[dict]:
    """Per member who shares their workouts with the family: minutes, workouts and km from start up
    to and including end. Those who don't share aren't in it at all."""
    members = (await db.execute(select(User).where(User.family_id == family_id).order_by(User.created_at))).scalars().all()
    sharing = [m for m in members if shared(m)["workouts"] == "family"]
    if not sharing:
        return []
    rows = (
        await db.execute(select(Workout).where(Workout.user_id.in_([m.id for m in sharing]), Workout.day >= start, Workout.day <= end))
    ).scalars().all()
    out = []
    for m in sharing:
        mine = [w for w in rows if w.user_id == m.id]
        out.append({
            "user_id": m.id, "name": m.display_name, "color": m.color,
            "minutes": sum(w.minutes for w in mine), "workouts": len(mine), "km": round(sum(w.distance_km or 0 for w in mine), 1),
        })
    return out


def amount(row: dict, metric: str) -> float:
    return {"minutes": row["minutes"], "km": row["km"], "workouts": row["workouts"]}[metric]


async def goal_progress(db: AsyncSession, goal: HealthGoal, today: date) -> dict:
    people = await family_exercise(db, goal.family_id, goal.start_date, min(goal.end_date, today))
    progress = round(sum(amount(p, goal.metric) for p in people), 1)
    return {
        "id": goal.id, "title": goal.title, "metric": goal.metric, "target": goal.target,
        "start_date": goal.start_date, "end_date": goal.end_date, "progress": progress,
        "done": progress >= goal.target, "ended": goal.end_date < today,
        "people": [{"user_id": p["user_id"], "name": p["name"], "color": p["color"], "amount": amount(p, goal.metric)} for p in people if amount(p, goal.metric)],
    }


async def current_goals(db: AsyncSession, family_id: uuid.UUID, today: date) -> list[dict]:
    goals = (
        await db.execute(select(HealthGoal).where(HealthGoal.family_id == family_id, HealthGoal.start_date <= today, HealthGoal.end_date >= today).order_by(HealthGoal.end_date))
    ).scalars().all()
    return [await goal_progress(db, g, today) for g in goals]


async def tick_exercise_tasks(db: AsyncSession, owner: User, day: date, logged_by: User) -> list[str]:
    """A task done by exercising (Task.exercise_minutes): ticked off for its person once their
    workouts that day add up – with points, or waiting for an adult, as any task. Returns the titles."""
    from app.routers.tasks import _turn, complete_for
    from app.services.schedule import due_on

    tasks = (
        await db.execute(
            select(Task).where(Task.family_id == owner.family_id, Task.active == True, Task.deleted_at.is_(None), Task.exercise_minutes.is_not(None))  # noqa: E712
        )
    ).scalars().all()
    if not tasks:
        return []
    minutes = sum((await db.execute(select(Workout.minutes).where(Workout.user_id == owner.id, Workout.day == day))).scalars().all())
    done = []
    for task in tasks:
        if minutes < task.exercise_minutes or _turn(task, day) != owner.id:
            continue
        if not (due_on(task, day) or (task.recurrence == "none" and task.due_date and task.due_date <= day)):
            continue
        already = (
            await db.execute(select(TaskCompletion.id).where(TaskCompletion.task_id == task.id, TaskCompletion.completed_date == day, TaskCompletion.status != "rejected"))
        ).first()
        if already:
            continue
        await complete_for(db, task, owner, day, ticked_by=logged_by if logged_by.id != owner.id and adult(logged_by) else None)
        done.append(task.title)
    return done

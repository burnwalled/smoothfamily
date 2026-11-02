"""Packing as a task (2.9.0): the adult chooses the day it's time to pack for a trip or a calendar
event, and each one going gets a task that day – with the event's packing list in it, or a link to
their own list on the trip."""
import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Task, TaskCompletion, User
from app.schemas import PackTask

TITLE = {
    "en": "Pack for {name}",
    "sv": "Packa inför {name}",
    "nb": "Pakk til {name}",
    "da": "Pak til {name}",
    "fi": "Pakkaa: {name}",
}


def _link(trip_id: uuid.UUID | None, event_key: str | None):
    return Task.trip_id == trip_id if trip_id is not None else Task.event_key == event_key


async def pack_tasks(db: AsyncSession, family_id: uuid.UUID, trip_id: uuid.UUID | None = None, event_key: str | None = None) -> list[PackTask]:
    tasks = (await db.execute(select(Task).where(Task.family_id == family_id, _link(trip_id, event_key)).order_by(Task.created_at))).scalars().all()
    # A one-off task that has been done is no longer active.
    return [PackTask(task_id=t.id, user_id=t.assignee_id, day=t.due_date, done=not t.active) for t in tasks]


async def set_pack_tasks(
    db: AsyncSession,
    user: User,
    *,
    name: str,
    day: date | None,
    member_ids: list[uuid.UUID],
    points: int,
    trip_id: uuid.UUID | None = None,
    event_key: str | None = None,
    description: str | None = None,
) -> None:
    """One task per member on `day`; no day (or nobody) takes them away. Tasks already done stay
    done; the others follow the new day. The caller commits."""
    members = {
        m.id: m
        for m in (await db.execute(select(User).where(User.family_id == user.family_id, User.id.in_(member_ids or [uuid.uuid4()])))).scalars()
    }
    existing = (await db.execute(select(Task).where(Task.family_id == user.family_id, _link(trip_id, event_key)))).scalars().all()
    by_member = {t.assignee_id: t for t in existing}
    wanted = set(members) if day is not None else set()
    for member_id in wanted:
        member = members[member_id]
        task = by_member.get(member_id)
        if task is None:
            task = Task(family_id=user.family_id, created_by=user.id, assignee_id=member_id, recurrence="none", trip_id=trip_id, event_key=event_key, picture="🎒")
            db.add(task)
        elif not task.active:
            continue
        task.title = TITLE.get(member.language or "en", TITLE["en"]).format(name=name)[:200]
        task.description = description
        task.due_date = day
        task.points = points
    for task in existing:
        if task.assignee_id in wanted or not task.active:
            continue
        done = (await db.execute(select(TaskCompletion.id).where(TaskCompletion.task_id == task.id).limit(1))).first()
        if done:
            task.active = False
        else:
            await db.delete(task)


async def drop_pack_tasks(db: AsyncSession, family_id: uuid.UUID, trip_id: uuid.UUID | None = None, event_key: str | None = None) -> None:
    """The trip or the event is gone: its packing tasks aren't due any more (done ones are kept)."""
    for task in (await db.execute(select(Task).where(Task.family_id == family_id, _link(trip_id, event_key)))).scalars().all():
        done = (await db.execute(select(TaskCompletion.id).where(TaskCompletion.task_id == task.id).limit(1))).first()
        if done:
            task.active, task.trip_id, task.event_key = False, None, None
        else:
            await db.delete(task)

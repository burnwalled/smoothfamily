"""Taking turns on a task: an ordered list of members, and whose turn it is.

Mode "done": the turn passes to the next member when the task has been done. Mode "weekly": the
turn passes every week, counted from the week the task was set up (so the week view can show
next week's person). The task's assignee_id is kept on whose turn it is, so everything that
looks at the assignee (Today, approvals, "assigned to someone else") just works.
"""
import uuid
from datetime import date, timedelta

from app.models import Task


def rotating(task: Task) -> bool:
    return len(task.rotation_user_ids or []) >= 2


def turn_on(task: Task, day: date) -> uuid.UUID | None:
    """Whose turn it is on a day."""
    members = task.rotation_user_ids or []
    if len(members) < 2:
        return None
    if task.rotation_mode == "weekly":
        anchor = task.anchor_date or day
        weeks = (day - (anchor - timedelta(days=anchor.weekday()))).days // 7
        index = weeks % len(members)
    else:
        index = (task.rotation_index or 0) % len(members)
    return uuid.UUID(str(members[index]))


def sync(task: Task, today: date) -> bool:
    """Puts assignee_id on today's turn; True when it changed."""
    turn = turn_on(task, today)
    if turn is None or task.assignee_id == turn:
        return False
    task.assignee_id = turn
    return True


def after_done(task: Task) -> None:
    """In mode "done" the turn passes on once the task has been done."""
    if rotating(task) and task.rotation_mode != "weekly":
        task.rotation_index = ((task.rotation_index or 0) + 1) % len(task.rotation_user_ids)
        task.assignee_id = uuid.UUID(str(task.rotation_user_ids[task.rotation_index]))


def before_done(task: Task) -> None:
    """A completion undone (3.1.1): the turn goes back to the one who had it."""
    if rotating(task) and task.rotation_mode != "weekly":
        task.rotation_index = ((task.rotation_index or 0) - 1) % len(task.rotation_user_ids)
        task.assignee_id = uuid.UUID(str(task.rotation_user_ids[task.rotation_index]))


def next_after(task: Task, day: date) -> uuid.UUID | None:
    """Whose turn comes next (shown as "then …")."""
    members = task.rotation_user_ids or []
    turn = turn_on(task, day)
    if turn is None:
        return None
    index = [str(m) for m in members].index(str(turn))
    return uuid.UUID(str(members[(index + 1) % len(members)]))

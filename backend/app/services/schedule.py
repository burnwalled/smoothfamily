"""When a task is due: daily, on chosen weekdays every N weeks, monthly, yearly or once."""
import calendar
from datetime import date, timedelta

from app.models import Task


def week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


def upcoming_week(today: date) -> date:
    """The week Söndagskollen looks at: from Friday on the next one, earlier in the week this one."""
    return week_start(today + timedelta(days=3))


def task_weekdays(task: Task) -> list[int]:
    """Weekdays (0 = Monday) of a weekly task; older tasks only have the single `weekday`."""
    if task.weekdays:
        return list(task.weekdays)
    return [task.weekday] if task.weekday is not None else []


def due_on(task: Task, day: date) -> bool:
    """Whether a recurring task falls on `day`; a one-off task only on its own date."""
    # A course of medicine: from its first day to its last.
    until = getattr(task, "until_date", None)
    if until is not None and day > until:
        return False
    if getattr(task, "medication_id", None) is not None and task.anchor_date is not None and day < task.anchor_date:
        return False
    if task.recurrence == "daily":
        every = getattr(task, "interval_days", 1) or 1
        if every <= 1:
            return True
        anchor = task.anchor_date or task.created_at.date()
        return day >= anchor and (day - anchor).days % every == 0
    if task.recurrence == "weekly":
        if day.weekday() not in task_weekdays(task):
            return False
        interval = task.interval_weeks or 1
        if interval <= 1:
            return True
        anchor = week_start(task.anchor_date or task.created_at.date())
        return ((week_start(day) - anchor).days // 7) % interval == 0
    if task.recurrence == "monthly":
        every = getattr(task, "interval_months", 1) or 1
        if every > 1:
            anchor = task.anchor_date or task.created_at.date()
            months = (day.year - anchor.year) * 12 + day.month - anchor.month
            if months < 0 or months % every:
                return False
        last = calendar.monthrange(day.year, day.month)[1]
        nth = getattr(task, "month_nth", None)
        if nth:
            # The first … fourth, or the last (-1), of the weekday in the month.
            days = task_weekdays(task)
            if not days or day.weekday() != days[0]:
                return False
            return (day.day - 1) // 7 + 1 == nth if nth > 0 else day.day + 7 > last
        if task.day_of_month is None:
            return False
        # The 31st means "the last day" in shorter months.
        return day.day == min(task.day_of_month, last)
    if task.recurrence == "yearly":
        return task.month == day.month and task.day_of_month == day.day
    return task.due_date == day


def due_today(task: Task, today: date) -> bool:
    """Today's list: recurring tasks due today, plus one-off tasks that are due or overdue."""
    if not task.active:
        return False
    if task.recurrence == "none":
        return task.due_date is not None and task.due_date <= today
    return due_on(task, today)

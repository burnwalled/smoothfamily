"""Task schedules (weekdays, every N weeks, monthly), the week view and personal history."""
from datetime import date, datetime, timezone
from types import SimpleNamespace

import pytest

from app.services.schedule import due_on, week_start



def _task(**kw):
    defaults = dict(
        recurrence="daily", weekday=None, weekdays=[], interval_weeks=1, anchor_date=None,
        month=None, day_of_month=None, due_date=None, active=True,
        created_at=datetime(2026, 10, 26, tzinfo=timezone.utc),
    )
    return SimpleNamespace(**{**defaults, **kw})


def test_weekly_on_several_days():
    task = _task(recurrence="weekly", weekdays=[0, 3])  # Monday and Thursday
    assert due_on(task, date(2026, 10, 26))  # Monday
    assert not due_on(task, date(2026, 10, 27))
    assert due_on(task, date(2026, 10, 29))  # Thursday


def test_every_other_week_counts_from_anchor_week():
    task = _task(recurrence="weekly", weekdays=[2], interval_weeks=2, anchor_date=date(2026, 10, 28))
    assert due_on(task, date(2026, 10, 28))
    assert not due_on(task, date(2026, 11, 4))
    assert due_on(task, date(2026, 11, 11))
    assert not due_on(task, date(2026, 10, 21))
    assert due_on(task, date(2026, 10, 14))


def test_older_weekly_task_with_single_weekday():
    task = _task(recurrence="weekly", weekday=4)
    assert due_on(task, date(2026, 10, 30))
    assert not due_on(task, date(2026, 10, 29))


def test_monthly_31st_means_last_day():
    task = _task(recurrence="monthly", day_of_month=31)
    assert due_on(task, date(2026, 10, 31))
    assert due_on(task, date(2026, 11, 30))
    assert due_on(task, date(2027, 2, 28))
    assert not due_on(task, date(2026, 11, 29))


async def _setup(client):
    resp = await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "S", "display_name": "Admin", "username": "admin", "password": "secret123"},
    )
    assert resp.status_code == 201


@pytest.mark.asyncio
async def test_create_and_edit_schedules(client):
    await _setup(client)
    twice = await client.post(
        "/api/tasks", json={"title": "Dammsuga", "recurrence": "weekly", "weekdays": [3, 0, 3], "interval_weeks": 2}
    )
    assert twice.status_code == 201, twice.text
    body = twice.json()
    assert body["weekdays"] == [0, 3]
    assert body["weekday"] == 0
    assert body["interval_weeks"] == 2

    monthly = await client.post("/api/tasks", json={"title": "Byta filter", "recurrence": "monthly", "day_of_month": 15})
    assert monthly.status_code == 201
    assert monthly.json()["day_of_month"] == 15

    assert (await client.post("/api/tasks", json={"title": "X", "recurrence": "monthly"})).status_code == 422
    assert (await client.post("/api/tasks", json={"title": "Y", "recurrence": "weekly"})).status_code == 422

    # Switching to daily clears the weekly fields.
    daily = await client.patch(f"/api/tasks/{body['id']}", json={"recurrence": "daily"})
    assert daily.json()["weekdays"] == [] and daily.json()["interval_weeks"] == 1

    # Older clients sending a single weekday still work.
    legacy = await client.patch(f"/api/tasks/{body['id']}", json={"recurrence": "weekly", "weekday": 5})
    assert legacy.json()["weekdays"] == [5]


@pytest.mark.asyncio
async def test_week_view_and_history(client):
    await _setup(client)
    today = date.today()
    daily = (await client.post("/api/tasks", json={"title": "Diska", "recurrence": "daily", "points": 10})).json()
    weekly = (
        await client.post("/api/tasks", json={"title": "Sopor", "recurrence": "weekly", "weekdays": [today.weekday()], "points": 5})
    ).json()

    assert (await client.post(f"/api/tasks/{daily['id']}/complete")).status_code == 200

    week = (await client.get("/api/tasks/week")).json()
    assert len(week) == 7
    assert week[0]["day"] == week_start(today).isoformat()
    by_day = {d["day"]: d["items"] for d in week}
    todays = {i["task"]["title"]: i for i in by_day[today.isoformat()]}
    assert todays["Diska"]["done"] is True and todays["Diska"]["done_by"] == "Admin"
    assert todays["Sopor"]["done"] is False
    # The daily task is on every day, the weekly one only once.
    assert all(any(i["task"]["id"] == daily["id"] for i in items) for items in by_day.values())
    assert sum(any(i["task"]["id"] == weekly["id"] for i in items) for items in by_day.values()) == 1

    history = (await client.get("/api/tasks/history")).json()
    assert [(h["title"], h["points_awarded"]) for h in history] == [("Diska", 10)]

"""Söndagskollen (#68), weather and the morning summary (#52), who drives and packing lists (#53)."""
from datetime import date, datetime, timedelta, timezone

import pytest

pytestmark = pytest.mark.asyncio


async def _family(client):
    resp = await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "F", "display_name": "Admin Person", "username": "admin", "password": "secret123"},
    )
    assert resp.status_code == 201
    ids = {"admin": resp.json()["id"]}
    for username, role in [("adult1", "adult"), ("kid1", "child")]:
        r = await client.post("/api/family/members", json={"display_name": username.title(), "username": username, "password": "pass1234", "role": role})
        ids[username] = r.json()["id"]
    return ids


async def _login(client, username, password="pass1234"):
    assert (await client.post("/api/auth/login", json={"username": username, "password": password})).status_code == 200


def _steps(start: datetime, hours: int = 48, wet_from: int | None = None) -> list[dict]:
    out = []
    for i in range(hours):
        when = start + timedelta(hours=i)
        wet = wet_from is not None and when.date() == start.date() and when.hour >= wet_from
        out.append({"time": when, "temp": 5 + i % 10, "kind": "rain" if wet else "partly", "precip": 0.6 if wet else 0.0, "wind": 3.0})
    return out


@pytest.fixture
def utc_zone(monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "timezone", "UTC")


# --- Weather --------------------------------------------------------------------------------


async def test_weather_summary_and_line(utc_zone):
    from app.services.weather import summary, weather_line

    morning = datetime(2026, 10, 28, 6, tzinfo=timezone.utc)
    info = summary(_steps(morning, wet_from=15), morning)
    assert info["today"]["wet_from"] == "15:00" and info["today"]["kind"] == "rain"
    assert info["now"]["kind"] == "partly" and len(info["hours"]) == 12 and info["days"]
    assert weather_line(info, "sv") == "5–14°, regn från 15:00"
    dry = summary(_steps(morning), morning)
    assert dry["today"]["wet_from"] is None and weather_line(dry, "en").endswith("partly cloudy")


async def test_weather_card_place(client, monkeypatch, utc_zone):
    from app.routers import dashboard

    calls = []

    async def fake_forecast(lat, lon):
        calls.append((lat, lon))
        return _steps(datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0))

    monkeypatch.setattr(dashboard, "forecast", fake_forecast)
    await _family(client)
    assert (await client.get("/api/dashboard/weather")).json() is None
    assert (await client.put("/api/dashboard/sources/weather", json={"lat": 40.0, "lon": 18.0})).status_code == 422  # outside the Nordics
    saved = (await client.put("/api/dashboard/sources/weather", json={"lat": 59.334591, "lon": 18.063240, "place": "Stockholm"})).json()
    assert (saved["weather_lat"], saved["weather_lon"], saved["weather_place"]) == (59.33, 18.06, "Stockholm")
    assert calls[-1] == (59.33, 18.06)  # only rounded coordinates leave the server
    card = (await client.get("/api/dashboard/weather")).json()
    assert card["place"] == "Stockholm" and card["now"]["temp"] is not None
    await _login(client, "kid1")
    assert (await client.put("/api/dashboard/sources/weather", json={"lat": None, "lon": None})).status_code == 403


# --- Morning summary ------------------------------------------------------------------------


async def test_morning_summary(client, db_session, utc_zone):
    from app.services.morning import run_morning_summaries

    ids = await _family(client)
    # A Wednesday at 07:00.
    wednesday = datetime(2026, 10, 28, 7, 0, tzinfo=timezone.utc)
    start = wednesday.replace(hour=14, minute=50)
    await client.post("/api/calendar/family-events", json={"title": "Dentist", "start": start.isoformat(), "end": (start + timedelta(hours=1)).isoformat()})
    await client.post("/api/tasks", json={"title": "Dishes", "recurrence": "daily", "assignee_id": ids["admin"]})
    me = (await client.patch("/api/auth/me", json={"morning_summary": True, "morning_time": "06:30", "morning_days": "weekdays"})).json()
    assert me["morning_summary"] and me["morning_time"] == "06:30"
    assert (await client.patch("/api/auth/me", json={"morning_time": "25:00"})).status_code == 422

    assert await run_morning_summaries(db_session, wednesday.replace(hour=6, minute=0)) == 0  # too early
    assert await run_morning_summaries(db_session, wednesday) == 1
    assert await run_morning_summaries(db_session, wednesday + timedelta(minutes=1)) == 0  # once a day
    assert await run_morning_summaries(db_session, wednesday + timedelta(days=3)) == 0  # Saturday, weekdays only
    [note] = (await client.get("/api/notifications")).json()
    assert note["kind"] == "morning_summary" and note["title"] == "Good morning, Admin!"
    assert "Today: Dentist 14:50" in note["body"] and "1 task to do" in note["body"]


# --- Who drives and packing lists -----------------------------------------------------------


async def test_rides_and_packing(client, db_session, utc_zone):
    from app.services.event_reminders import run_packing_reminders, run_ride_reminders

    ids = await _family(client)
    start = (datetime.now(timezone.utc) + timedelta(days=1)).replace(hour=17, minute=0, second=0, microsecond=0)
    event = (
        await client.post(
            "/api/calendar/family-events",
            json={"title": "Football practice", "start": start.isoformat(), "end": (start + timedelta(hours=1)).isoformat(), "member_ids": [ids["kid1"]]},
        )
    ).json()
    target = {"key": f"app:{event['id']}", "title": "Football practice", "start": start.isoformat()}
    assert (await client.post("/api/calendar/plan/ride", json={**target, "key": "app:00000000-0000-0000-0000-000000000000", "leg": "drop_off", "claim": True})).status_code == 404
    plan = (await client.post("/api/calendar/plan/ride", json={**target, "leg": "drop_off", "claim": True})).json()
    assert plan["drop_off_by"] == ids["admin"] and plan["needs_ride"] and plan["pick_up_by"] is None

    await _login(client, "adult1")
    assert (await client.post("/api/calendar/plan/ride", json={**target, "leg": "drop_off", "claim": True})).status_code == 409
    await _login(client, "kid1")
    assert (await client.post("/api/calendar/plan/ride", json={**target, "leg": "pick_up", "claim": True})).status_code == 403
    # The packing list is kept per title, so every practice gets it; ticks are per occurrence.
    items = (await client.put("/api/calendar/packing", json={"title": "football  PRACTICE", "items": ["Shin guards", "Water bottle", "Shin guards", " "]})).json()
    assert [i["text"] for i in items] == ["Shin guards", "Water bottle"]
    ticked = (await client.post("/api/calendar/plan/check", json={**target, "item": "Water bottle", "done": True})).json()
    assert [i["done"] for i in ticked["packing"]] == [False, True]
    day = start.date()
    [listed] = (await client.get(f"/api/calendar/events?start={day}&end={day + timedelta(days=1)}")).json()
    assert listed["key"] == target["key"] and listed["drop_off_by"] == ids["admin"]
    assert [i["text"] for i in listed["packing"] if not i["done"]] == ["Shin guards"]

    # The evening before, the adults are asked who picks up.
    evening = datetime.combine(day - timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc).replace(hour=18)
    assert await run_ride_reminders(db_session, evening - timedelta(hours=1)) == 0
    assert await run_ride_reminders(db_session, evening) == 2
    assert await run_ride_reminders(db_session, evening + timedelta(minutes=5)) == 0
    # Two hours before, the child and the driver are told what's still to pack.
    before = start - timedelta(minutes=115)
    assert await run_packing_reminders(db_session, before) == 2
    assert await run_packing_reminders(db_session, before + timedelta(minutes=5)) == 0
    notes = (await client.get("/api/notifications")).json()
    assert [n["kind"] for n in notes] == ["packing_list"] and "Shin guards" in notes[0]["body"] and "Water bottle" not in notes[0]["body"]
    await _login(client, "adult1")
    assert [n["kind"] for n in (await client.get("/api/notifications")).json()] == ["ride_needed"]


# --- Söndagskollen --------------------------------------------------------------------------


async def test_sunday_check_in(client, db_session, utc_zone):
    from app.routers.week import run_week_review_reminders
    from app.services.schedule import upcoming_week

    ids = await _family(client)
    assert upcoming_week(date(2026, 11, 1)) == date(2026, 11, 2)  # Sunday → next week
    assert upcoming_week(date(2026, 10, 28)) == date(2026, 10, 26)  # Wednesday → this week
    week = (await client.get("/api/week")).json()
    first = week["week_start"]
    assert len(week["days"]) == 7 and week["reminder"] is True and week["done_at"] is None
    assert (await client.get("/api/week?start=2026-10-28")).status_code == 422  # not a Monday

    # Points from the week before.
    resp = await client.post("/api/tasks", json={"title": "Walk the dog", "points": 15, "recurrence": "daily"})
    assert resp.status_code == 201, resp.text
    task = resp.json()
    from app.models import TaskCompletion
    import uuid as _uuid

    last_monday = date.fromisoformat(week["last_week_start"])
    family_id = _uuid.UUID((await client.get("/api/auth/me")).json()["family_id"])
    db_session.add(
        TaskCompletion(
            family_id=family_id, task_id=_uuid.UUID(task["id"]), user_id=_uuid.UUID(ids["kid1"]),
            completed_date=last_monday + timedelta(days=2), points_awarded=15, status="approved",
        )
    )
    await db_session.commit()
    week = (await client.get("/api/week")).json()
    assert week["top_helper"] == "Kid1" and week["tasks_done"] == 1 and week["points"][0]["points"] == 15

    assert (await client.post(f"/api/week/{first}/stars", json={"to_user": ids["admin"], "message": "x"})).status_code == 422  # not to yourself
    star = (await client.post(f"/api/week/{first}/stars", json={"to_user": ids["kid1"], "message": "Great dog walks"})).json()
    assert star["to_name"] == "Kid1"
    assert (await client.put(f"/api/week/{first}/activity", json={"activity": "Bowling"})).status_code == 204
    assert (await client.post(f"/api/week/{first}/done")).status_code == 204
    week = (await client.get("/api/week")).json()
    assert week["activity"] == "Bowling" and week["done_by_name"] == "Admin Person" and len(week["stars"]) == 1

    await _login(client, "kid1")
    kinds = [n["kind"] for n in (await client.get("/api/notifications")).json()]
    assert sorted(kinds) == ["thanks_star", "week_review"]
    assert (await client.delete(f"/api/week/stars/{star['id']}")).status_code == 403
    assert (await client.put("/api/week/settings", json={"reminder": False})).status_code == 403

    # Sunday afternoon reminder, skipped when next week's check-in is already done.
    # The Sunday ending the week just checked in: the reminder is about the week after (not done).
    sunday = datetime.combine(date.fromisoformat(first) + timedelta(days=6), datetime.min.time().replace(hour=16, minute=30), tzinfo=timezone.utc)
    assert await run_week_review_reminders(db_session, sunday.replace(hour=12)) == 0
    assert await run_week_review_reminders(db_session, sunday) == 3
    assert await run_week_review_reminders(db_session, sunday + timedelta(minutes=10)) == 0


# --- Waste collection entered by hand --------------------------------------------------------


async def test_waste_schedule_by_hand(client, db_session, utc_zone):
    from app.models import WasteSchedule
    from app.services.today_cards import run_waste_reminders, schedule_dates

    # Stockholm Vatten och Avfall: garden waste every other Thursday April–November.
    garden = WasteSchedule(title="Garden", anchor_date=date(2026, 11, 5), interval_weeks=2, months=list(range(4, 12)))
    assert schedule_dates(garden, date(2026, 10, 28), 60) == [date(2026, 11, 5), date(2026, 11, 19)]
    glass = WasteSchedule(title="Glass", anchor_date=date(2026, 12, 23), interval_weeks=4, months=[])
    assert schedule_dates(glass, date(2026, 10, 28), 30) == [date(2026, 10, 28), date(2026, 11, 25)]  # also before the date given

    await _family(client)
    today = date.today()
    out = (await client.post("/api/dashboard/sources/waste-schedules", json={"title": "Food waste", "anchor_date": str(today + timedelta(days=1)), "interval_weeks": 2})).json()
    [rule] = out["waste_schedules"]
    assert rule["next_date"] == str(today + timedelta(days=1)) and rule["months"] == []
    assert (await client.post("/api/dashboard/sources/waste-schedules", json={"title": "x", "anchor_date": str(today), "months": [13]})).status_code == 422
    pickups = (await client.get("/api/dashboard/waste")).json()
    assert [p["date"] for p in pickups] == [str(today + timedelta(days=1))]  # the card looks 14 days ahead

    evening = datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc).replace(hour=18)
    assert await run_waste_reminders(db_session, evening) == 2  # both adults
    await _login(client, "kid1")
    assert (await client.post("/api/dashboard/sources/waste-schedules", json={"title": "x", "anchor_date": str(today)})).status_code == 403
    await _login(client, "admin", "secret123")
    assert (await client.delete(f"/api/dashboard/sources/waste-schedules/{rule['id']}")).json()["waste_schedules"] == []

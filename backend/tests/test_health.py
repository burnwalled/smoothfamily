"""3.4.0: health per person – workouts and the day's numbers, private until shared."""
import uuid
from datetime import timedelta

import pytest

from app.services.weather import today_local

pytestmark = pytest.mark.asyncio


async def _family(client):
    await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123"},
    )
    ids = {"admin": (await client.get("/api/auth/me")).json()["id"]}
    for name, role in [("adult1", "adult"), ("kid1", "child")]:
        ids[name] = (await client.post("/api/family/members", json={"display_name": name.title(), "username": name, "password": "pass1234", "role": role})).json()["id"]
    return ids


async def _as(client, username, password="pass1234"):
    assert (await client.post("/api/auth/login", json={"username": username, "password": password})).status_code == 200


async def test_private_until_shared(client):
    ids = await _family(client)
    today = today_local()
    # Anna logs her run and her day.
    run = (await client.post(f"/api/health/people/{ids['admin']}/workouts", json={"day": today.isoformat(), "kind": "run", "minutes": 35, "distance_km": 6.2})).json()
    assert run["kind"] == "run" and run["source"] == "manual"
    await client.post(f"/api/health/people/{ids['admin']}/workouts", json={"day": (today - timedelta(days=1)).isoformat(), "kind": "walk", "minutes": 20})
    day = (await client.put(f"/api/health/people/{ids['admin']}/days/{today}", json={"steps": 9000, "weight_kg": 70.5})).json()
    assert day["steps"] == 9000 and day["weight_kg"] == 70.5
    # A second change keeps what isn't sent.
    assert (await client.put(f"/api/health/people/{ids['admin']}/days/{today}", json={"sleep_minutes": 450})).json()["steps"] == 9000
    mine = (await client.get(f"/api/health/people/{ids['admin']}")).json()
    assert mine["week_minutes"] >= 35 and mine["streak"] == 2 and mine["share"]["weight"] == "me"
    assert (await client.post(f"/api/health/people/{ids['admin']}/workouts", json={"day": (today + timedelta(days=5)).isoformat(), "kind": "run", "minutes": 10})).status_code == 422

    # The other adult sees nothing of hers – until she shares her workouts with the adults.
    await _as(client, "adult1")
    assert [p["user_id"] for p in (await client.get("/api/health/people")).json()] == [ids["adult1"], ids["kid1"]]
    assert (await client.get(f"/api/health/people/{ids['admin']}")).status_code == 404
    await _as(client, "admin", "secret123")
    assert (await client.put("/api/health/sharing", json={"workouts": "adults", "steps": "family"})).json() == {"workouts": "adults", "steps": "family", "sleep": "me", "weight": "me"}
    await _as(client, "adult1")
    seen = (await client.get(f"/api/health/people/{ids['admin']}")).json()
    assert seen["sees"] == ["workouts", "steps"] and len(seen["workouts"]) == 2
    assert all(d["weight_kg"] is None and d["sleep_minutes"] is None for d in seen["days"])
    assert seen["share"] is None and seen["can_enter"] is False
    assert (await client.delete(f"/api/health/workouts/{run['id']}")).status_code == 404
    # The child sees her steps (the family's), not her workouts (the adults').
    await _as(client, "kid1")
    kid_sees = (await client.get(f"/api/health/people/{ids['admin']}")).json()
    assert kid_sees["sees"] == ["steps"] and kid_sees["workouts"] == [] and kid_sees["week_minutes"] is None


async def test_a_childs_health_and_your_own_data(client):
    ids = await _family(client)
    today = today_local()
    # An adult enters the child's football; the child's weight is never kept.
    assert (await client.post(f"/api/health/people/{ids['kid1']}/workouts", json={"day": today.isoformat(), "kind": "sport", "minutes": 60})).status_code == 201
    assert (await client.put(f"/api/health/people/{ids['kid1']}/days/{today}", json={"steps": 12000, "weight_kg": 30})).json()["weight_kg"] is None
    await _as(client, "kid1")
    mine = (await client.get(f"/api/health/people/{ids['kid1']}")).json()
    assert "weight" not in mine["sees"] and mine["week_minutes"] == 60
    # A child can't enter an adult's.
    assert (await client.post(f"/api/health/people/{ids['admin']}/workouts", json={"day": today.isoformat(), "kind": "walk", "minutes": 5})).status_code == 403
    # Clearing the day's last number removes the day.
    assert (await client.put(f"/api/health/people/{ids['kid1']}/days/{today}", json={"steps": None})).json()["steps"] is None
    assert (await client.get(f"/api/health/people/{ids['kid1']}")).json()["days"] == []
    # Your own export, and removing it all.
    export = (await client.get("/api/health/export")).json()
    assert len(export["workouts"]) == 1 and export["workouts"][0]["kind"] == "sport"
    assert (await client.delete("/api/health/mine")).status_code == 204
    assert (await client.get("/api/health/export")).json()["workouts"] == []


async def test_a_goal_together_counts_what_is_shared(client):
    ids = await _family(client)
    today = today_local()
    goal = (await client.post("/api/health/goals", json={"title": "500 km in May", "metric": "km", "target": 500, "start_date": (today - timedelta(days=3)).isoformat(), "end_date": (today + timedelta(days=20)).isoformat()})).json()
    assert goal["progress"] == 0 and goal["people"] == []
    await client.post(f"/api/health/people/{ids['admin']}/workouts", json={"day": today.isoformat(), "kind": "run", "minutes": 40, "distance_km": 8})
    await client.post(f"/api/health/people/{ids['kid1']}/workouts", json={"day": today.isoformat(), "kind": "bike", "minutes": 30, "distance_km": 5})
    # Nothing counts until it's shared with the family.
    assert (await client.get("/api/health/goals")).json()[0]["progress"] == 0
    await client.put("/api/health/sharing", json={"workouts": "family"})
    await _as(client, "kid1")
    await client.put("/api/health/sharing", json={"workouts": "family"})
    got = (await client.get("/api/health/goals")).json()[0]
    assert got["progress"] == 13 and {p["name"] for p in got["people"]} == {"Anna", "Kid1"}
    # Only the adults set goals.
    assert (await client.post("/api/health/goals", json={"title": "x", "metric": "minutes", "target": 10, "start_date": today.isoformat(), "end_date": today.isoformat()})).status_code == 403
    assert (await client.delete(f"/api/health/goals/{goal['id']}")).status_code == 403
    # The kitchen display shows it when it shows the week's exercise.
    await _as(client, "admin", "secret123")
    screen = (await client.post("/api/kiosks", json={"name": "Kitchen"})).json()
    await client.put(f"/api/kiosks/{screen['id']}", json={"widgets": ["exercise"]})
    view = (await client.get(f"/api/kiosk/{screen['url'].rsplit('/', 1)[1]}")).json()
    assert view["exercise"]["goals"][0]["progress"] == 13
    assert [p["name"] for p in view["exercise"]["people"]] == ["Anna", "Kid1"]


async def test_a_task_done_by_exercising(client):
    ids = await _family(client)
    today = today_local()
    assert (await client.patch("/api/allowance/settings", json={"child_approval": False})).status_code == 200
    task = (await client.post("/api/tasks", json={"title": "Move for 30 minutes", "recurrence": "daily", "points": 7, "assignee_id": ids["kid1"], "exercise_minutes": 30})).json()
    assert task["exercise_minutes"] == 30
    await _as(client, "kid1")
    first = (await client.post(f"/api/health/people/{ids['kid1']}/workouts", json={"day": today.isoformat(), "kind": "play", "minutes": 20})).json()
    assert first["ticked"] == [] and "workout_1" in first["unlocked"]
    # Twenty more: thirty in all, and the task is done.
    second = (await client.post(f"/api/health/people/{ids['kid1']}/workouts", json={"day": today.isoformat(), "kind": "walk", "minutes": 15})).json()
    assert second["ticked"] == ["Move for 30 minutes"]
    today_tasks = {t["task"]["title"]: t for t in (await client.get("/api/tasks/today")).json()}
    assert today_tasks["Move for 30 minutes"]["done"] is True
    # Once is enough.
    assert (await client.post(f"/api/health/people/{ids['kid1']}/workouts", json={"day": today.isoformat(), "kind": "run", "minutes": 40})).json()["ticked"] == []


async def test_health_from_home_assistant(client):
    from datetime import datetime, timezone

    from app.database import SessionLocal
    from app.models import HealthDay
    from app.services import ha_sim
    from app.services.health_ha import convert, run_health_sync, score
    from sqlalchemy import select

    ids = await _family(client)
    today = today_local()
    # Without Home Assistant there is nothing to link.
    assert (await client.get(f"/api/health/links/{ids['admin']}")).json()["available"] is False
    assert (await client.post("/api/smarthome/connection/simulated")).status_code in (200, 201, 204)
    ha_sim.reset()

    # The admin sees each account: every phone, and the Withings user.
    links = (await client.get(f"/api/health/links/{ids['admin']}")).json()
    assert links["available"] and links["accounts_known"]
    accounts = {a["entry"]: a for a in links["accounts"]}
    assert accounts["sim-phone-anna"]["label"] == "Home Assistant app" and accounts["sim-phone-anna"]["title"] == "Anna's phone"
    assert accounts["sim-withings-anna"]["metrics"]["weight"][0]["entity_id"] == "sensor.withings_weight"
    assert set(accounts["sim-phone-anna"]["metrics"]) == {"steps", "sleep", "resting_hr"}

    # Linking Anna's phone and the scale maps the metrics; nothing is read before she turns it on.
    linked = (await client.put(f"/api/health/links/{ids['admin']}", json={"accounts": ["sim-phone-anna", "sim-withings-anna"]})).json()
    assert linked["chosen"] == {"steps": "sensor.anna_phone_steps", "sleep": "sensor.anna_phone_sleep_duration", "resting_hr": "sensor.anna_resting_heart_rate", "weight": "sensor.withings_weight", "workouts": "calendar.withings_workouts"}
    assert linked["import_on"] is False
    assert (await client.get(f"/api/health/people/{ids['admin']}")).json()["days"] == []
    assert (await client.post(f"/api/health/people/{ids['admin']}/sync")).status_code == 409

    # She turns it on: read at once – steps, sleep in hours → minutes, weight in kg, resting pulse.
    on = (await client.put(f"/api/health/people/{ids['admin']}/import", json={"on": True})).json()
    # (and the Withings workout calendar's walk and swim)
    assert on["on"] and on["taken"] == 6 and [a["title"] for a in on["accounts"]] == ["Anna's phone", "Anna"]
    day = (await client.get(f"/api/health/people/{ids['admin']}")).json()["days"][0]
    assert (day["day"], day["steps"], day["sleep_minutes"], day["weight_kg"], day["resting_hr"]) == (today.isoformat(), 4200, 450, 78.4, 58)

    # More steps later in the day; a lower reading never takes the day's count down.
    conn_url = next(iter(ha_sim._homes))
    ha_sim._homes[conn_url]["sensor.anna_phone_steps"]["state"] = "6100"
    assert (await client.post(f"/api/health/people/{ids['admin']}/sync")).json()["taken"] == 1
    ha_sim._homes[conn_url]["sensor.anna_phone_steps"]["state"] = "100"
    await client.post(f"/api/health/people/{ids['admin']}/sync")
    assert (await client.get(f"/api/health/people/{ids['admin']}")).json()["days"][0]["steps"] == 6100

    # Entered by hand wins: the import no longer changes that day.
    await client.put(f"/api/health/people/{ids['admin']}/days/{today}", json={"steps": 9999})
    ha_sim._homes[conn_url]["sensor.anna_phone_steps"]["state"] = "12000"
    await client.post(f"/api/health/people/{ids['admin']}/sync")
    assert (await client.get(f"/api/health/people/{ids['admin']}")).json()["days"][0]["steps"] == 9999

    # A sensor of its own for one metric (another phone's steps); none for sleep.
    own = (await client.put(f"/api/health/links/{ids['admin']}", json={"accounts": ["sim-phone-anna"], "chosen": {"steps": "sensor.erik_phone_steps", "sleep": None}})).json()
    assert own["chosen"] == {"steps": "sensor.erik_phone_steps", "resting_hr": "sensor.anna_resting_heart_rate"}

    # A child: never weight; an adult turns it on for them; a child can't link or see an adult's.
    kid = (await client.put(f"/api/health/links/{ids['kid1']}", json={"accounts": ["sim-phone-leo", "sim-withings-anna"]})).json()
    assert "weight" not in kid["chosen"] and kid["chosen"]["steps"] == "sensor.leo_phone_steps"
    assert (await client.put(f"/api/health/people/{ids['kid1']}/import", json={"on": True})).json()["on"] is True
    await _as(client, "kid1")
    assert (await client.get(f"/api/health/links/{ids['kid1']}")).status_code == 403
    assert (await client.get(f"/api/health/people/{ids['admin']}/import")).status_code == 403
    assert (await client.get(f"/api/health/people/{ids['kid1']}/import")).json()["on"] is True

    # The worker reads everyone who has it on, every 15 minutes.
    async with SessionLocal() as db:
        assert await run_health_sync(db) == 0
        assert await run_health_sync(db, datetime.now(timezone.utc) + timedelta(minutes=16)) == 2
        rows = (await db.execute(select(HealthDay).where(HealthDay.user_id == uuid.UUID(ids["kid1"])))).scalars().all()
        assert rows[0].steps and rows[0].weight_kg is None and rows[0].source == "home_assistant"

    # Turned off: no longer read.
    await client.put(f"/api/health/people/{ids['kid1']}/import", json={"on": False})
    async with SessionLocal() as db:
        assert await run_health_sync(db, datetime.now(timezone.utc) + timedelta(minutes=40)) == 1

    # The units and the guesses: part of the night or a goal isn't the thing itself.
    assert convert("sleep", 27000, "s") == 450 and convert("weight", 180, "lb") == 81.6 and convert("steps", -5, "steps") is None
    assert score("steps", {"entity_id": "light.x", "state": "on"}) == 0
    assert score("sleep", {"entity_id": "sensor.anna_deep_sleep", "state": "80", "attributes": {"unit_of_measurement": "min", "device_class": "duration"}}) == 0
    assert score("weight", {"entity_id": "sensor.anna_weight_goal", "state": "70", "attributes": {"unit_of_measurement": "kg", "device_class": "weight"}}) == 0


async def test_an_account_shows_whose_it_is(client):
    from app.services import ha_sim

    ids = await _family(client)
    await client.post("/api/smarthome/connection/simulated")
    ha_sim.reset()
    await client.put(f"/api/health/links/{ids['adult1']}", json={"accounts": ["sim-withings-anna"]})
    accounts = {a["entry"]: a for a in (await client.get(f"/api/health/links/{ids['admin']}")).json()["accounts"]}
    assert accounts["sim-withings-anna"]["linked_to"] == "Adult1" and accounts["sim-phone-anna"]["linked_to"] is None


async def test_workouts_from_home_assistant(client):
    """3.4.0: workouts taken in from a Withings workout calendar and a Garmin activities sensor –
    each once, and a task done by exercising ticks off."""
    from app.services import ha_sim
    from app.services.health_ha import parse_activities_state, parse_activity, parse_calendar_events

    ids = await _family(client)
    await client.post("/api/smarthome/connection/simulated")
    ha_sim.reset()
    accounts = {a["entry"]: a for a in (await client.get(f"/api/health/links/{ids['admin']}")).json()["accounts"]}
    assert accounts["sim-withings-anna"]["metrics"]["workouts"][0]["entity_id"] == "calendar.withings_workouts"
    assert accounts["sim-garmin-erik"]["label"] == "Garmin Connect" and accounts["sim-garmin-erik"]["metrics"]["workouts"][0]["entity_id"] == "sensor.garmin_erik_last_activities"

    # Anna: her Withings (weight and the workout calendar).
    linked = (await client.put(f"/api/health/links/{ids['admin']}", json={"accounts": ["sim-withings-anna"]})).json()
    assert linked["chosen"]["workouts"] == "calendar.withings_workouts"
    on = (await client.put(f"/api/health/people/{ids['admin']}/import", json={"on": True})).json()
    assert on["taken"] == 3  # the weight, a walk and a swim
    workouts = (await client.get(f"/api/health/people/{ids['admin']}")).json()["workouts"]
    assert sorted((w["kind"], w["minutes"], w["source"]) for w in workouts) == [("swim", 40, "home_assistant"), ("walk", 45, "home_assistant")]
    # Fetched again: nothing twice.
    assert (await client.post(f"/api/health/people/{ids['admin']}/sync")).json()["taken"] == 0

    # Erik (adult1): his Garmin, with a task done by exercising – yesterday's run ticks it off? Only today's counts.
    await client.put(f"/api/health/links/{ids['adult1']}", json={"accounts": ["sim-garmin-erik"]})
    await _as(client, "adult1")
    # A run he logged by hand already: the same one from Garmin isn't taken twice.
    yesterday = (today_local() - timedelta(days=1)).isoformat()
    await client.post(f"/api/health/people/{ids['adult1']}/workouts", json={"day": yesterday, "kind": "run", "minutes": 35})
    on = (await client.put(f"/api/health/people/{ids['adult1']}/import", json={"on": True})).json()
    assert on["taken"] == 1  # only the ride
    kinds = sorted((w["kind"], w["minutes"], w["distance_km"]) for w in (await client.get(f"/api/health/people/{ids['adult1']}")).json()["workouts"])
    assert kinds == [("bike", 55, 21.5), ("run", 35, None)]

    # The readers on their own: Garmin's and Strava's fields, a calendar event, and what isn't one.
    assert parse_activity({"activityId": 1, "startTimeLocal": "2026-11-01 07:00:00", "activityType": {"typeKey": "trail_running"}, "duration": 1800, "distance": 5000})["kind"] == "run"
    strava = parse_activity({"id": 77, "sport_type": "Ride", "start_date_local": "2026-11-02T16:00:00Z", "moving_time": 3600, "distance": 30000})
    assert (strava["kind"], strava["minutes"], strava["km"]) == ("bike", 60, 30.0)
    assert parse_activity({"name": "Yoga", "start": "2026-11-02T08:00:00", "duration_minutes": 30})["kind"] == "yoga"
    assert parse_activity({"activityName": "x"}) is None
    assert parse_activities_state({"state": "Lunch swim", "attributes": {"start_date": "2026-11-02T12:00:00", "elapsed_time": 1500}})[0]["kind"] == "swim"
    assert parse_calendar_events([{"summary": "Badminton", "start": {"dateTime": "2026-11-02T18:00:00+01:00"}, "end": {"dateTime": "2026-11-02T19:00:00+01:00"}}])[0]["minutes"] == 60

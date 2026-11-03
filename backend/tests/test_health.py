"""3.4.0: health per person – workouts and the day's numbers, private until shared."""
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

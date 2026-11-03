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

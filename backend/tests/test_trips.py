"""Trips (#70): planning, packing per traveller with templates, budget, checklist, calendar, reminder."""
from datetime import date, datetime, timedelta, timezone

import pytest

pytestmark = pytest.mark.asyncio


async def _family(client):
    resp = await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123"},
    )
    ids = {"admin": resp.json()["id"]}
    for username, role in [("erik", "adult"), ("leo", "child"), ("maja", "child")]:
        r = await client.post("/api/family/members", json={"display_name": username.title(), "username": username, "password": "pass1234", "role": role})
        ids[username] = r.json()["id"]
    return ids


async def _login(client, username, password="pass1234"):
    assert (await client.post("/api/auth/login", json={"username": username, "password": password})).status_code == 200


async def test_a_trip(client, db_session):
    from app.routers.trips import run_trip_reminders

    ids = await _family(client)
    start = date.today() + timedelta(days=1)
    trip = (
        await client.post("/api/trips", json={"name": "Ski week", "destination": "Sälen", "start_date": str(start), "end_date": str(start + timedelta(days=6)), "member_ids": [ids["admin"], ids["leo"]], "budget": 20000})
    ).json()
    assert trip["checks_left"] == 6 and trip["budget"] == 20000  # the default checklist
    assert (await client.post("/api/trips", json={"name": "x", "start_date": str(start), "end_date": str(start - timedelta(days=1))})).status_code == 422

    # Packing: a template for Leo, shared things, and nothing twice.
    t = (await client.post(f"/api/trips/{trip['id']}/packing/template", json={"template": "ski", "user_id": ids["leo"]})).json()
    again = (await client.post(f"/api/trips/{trip['id']}/packing/template", json={"template": "ski", "user_id": ids["leo"]})).json()
    assert len(t["packing"]) == len(again["packing"]) == 8
    shared = (await client.post(f"/api/trips/{trip['id']}/packing", json={"text": "Ski wax"})).json()
    assert shared["to_pack"] == 9
    await client.post(f"/api/trips/{trip['id']}/items", json={"kind": "stay", "title": "Cabin", "place": "Sälen 12", "starts_at": f"{start}T16:00:00+00:00"})
    detail = (await client.post(f"/api/trips/{trip['id']}/expenses", json={"title": "Ski passes", "amount": 4200})).json()
    assert detail["spent"] == 4200 and detail["items"][0]["title"] == "Cabin"

    # Leo packs his own things, can't plan, and Maja (not going) doesn't see the trip.
    await _login(client, "leo")
    mine = next(p for p in detail["packing"] if p["user_id"] == ids["leo"])
    other = (await client.post(f"/api/trips/{trip['id']}/packing", json={"text": "Mine", "user_id": ids["admin"]})).status_code
    assert other == 403
    assert (await client.put(f"/api/trips/{trip['id']}/packing/{mine['id']}", json={"done": True})).json()["packed"] == 1
    assert (await client.post(f"/api/trips/{trip['id']}/expenses", json={"title": "x", "amount": 1})).status_code == 403
    await _login(client, "maja")
    assert (await client.get("/api/trips")).json() == []
    assert (await client.get(f"/api/trips/{trip['id']}")).status_code == 404

    # In the calendar, and a reminder the evening before for the travellers.
    await _login(client, "leo")
    events = (await client.get(f"/api/calendar/events?start={start}&end={start + timedelta(days=7)}")).json()
    assert [e["title"] for e in events if e["trip_id"]] == ["Ski week – Sälen"]
    evening = datetime.combine(date.today(), datetime.min.time(), tzinfo=timezone.utc).replace(hour=18)
    assert await run_trip_reminders(db_session, evening.replace(hour=12)) == 0
    assert await run_trip_reminders(db_session, evening) == 2  # Anna and Leo
    assert await run_trip_reminders(db_session, evening + timedelta(minutes=1)) == 0
    [note] = (await client.get("/api/notifications")).json()
    assert note["title"] == "Tomorrow: Ski week" and note["body"].startswith("8 things left")

    await _login(client, "admin", "secret123")
    assert (await client.delete(f"/api/trips/{trip['id']}")).status_code == 204
    assert (await client.get("/api/trips")).json() == []

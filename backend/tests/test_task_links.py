"""2.9.0: tasks made from other apps – a child's and a pet's medicine doses, and packing before a
trip or a calendar event on the day an adult chooses."""
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest

pytestmark = pytest.mark.asyncio


async def _family(client):
    resp = await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "F", "display_name": "Admin", "username": "admin", "password": "secret123"},
    )
    ids = {"admin": resp.json()["id"]}
    for username, role in [("adult1", "adult"), ("kid1", "child"), ("kid2", "child")]:
        r = await client.post("/api/family/members", json={"display_name": username.title(), "username": username, "password": "pass1234", "role": role})
        ids[username] = r.json()["id"]
    return ids


async def _login(client, username, password="pass1234"):
    assert (await client.post("/api/auth/login", json={"username": username, "password": password})).status_code == 200


def _dose_tasks(rows, medication_id):
    return sorted((r for r in rows if r["task"]["medication_id"] == medication_id), key=lambda r: r["task"]["dose_time"])


async def test_a_childs_medicine_is_tasks_with_points(client):
    ids = await _family(client)
    kid = (
        await client.post(
            "/api/medicine",
            json={"user_id": ids["kid1"], "name": "Penicillin", "dose": "5 ml", "times": ["20:00", "08:00"], "points": 3, "end_date": str(date.today() + timedelta(days=2))},
        )
    ).json()
    assert kid["as_tasks"] is True and kid["points"] == 3
    doses = _dose_tasks((await client.get("/api/tasks/today")).json(), kid["id"])
    assert [d["task"]["title"] for d in doses] == ["Penicillin 5 ml · 08:00", "Penicillin 5 ml · 20:00"]
    assert all(d["task"]["assignee_id"] == ids["kid1"] and d["task"]["points"] == 3 for d in doses)
    # Changed through the medicine, not as a task.
    task_id = doses[0]["task"]["id"]
    assert (await client.patch(f"/api/tasks/{task_id}", json={"points": 50})).status_code == 409
    assert (await client.delete(f"/api/tasks/{task_id}")).status_code == 409

    # The child ticks one off: points (or waiting for an adult), and the dose is taken.
    await _login(client, "kid1")
    done = (await client.post(f"/api/tasks/{task_id}/complete")).json()
    assert done["completion_status"] in ("approved", "pending")
    med = next(m for m in (await client.get("/api/medicine")).json() if m["id"] == kid["id"])
    assert med["today"][0]["taken_by_name"] == "Kid1"

    # An adult gives the evening dose: the child gets the points straight away.
    await _login(client, "adult1")
    evening = doses[1]["task"]["id"]
    given = (await client.post(f"/api/tasks/{evening}/complete")).json()
    assert given["completion_status"] == "approved" and given["done_by"] == "Kid1"
    med = next(m for m in (await client.get("/api/medicine")).json() if m["id"] == kid["id"])
    assert med["today"][1]["taken_by_name"] == "Adult1"
    # Another child can't tick it off.
    await _login(client, "kid2")
    assert (await client.post(f"/api/tasks/{task_id}/complete")).status_code in (403, 409)

    # Fewer times, a pause and the medicine's removal follow along.
    await _login(client, "admin", "secret123")
    body = {"user_id": ids["kid1"], "name": "Penicillin", "dose": "5 ml", "times": ["08:00"], "points": 3}
    await client.put(f"/api/medicine/{kid['id']}", json=body)
    assert len(_dose_tasks((await client.get("/api/tasks/today")).json(), kid["id"])) == 1 + 1  # 20:00 done today stays listed
    await client.post(f"/api/medicine/{kid['id']}/stop")
    assert [t for t in (await client.get("/api/tasks")).json() if t["medication_id"] == kid["id"]] == []
    assert (await client.delete(f"/api/medicine/{kid['id']}")).status_code == 204


async def test_a_course_ends_and_an_adults_own_stays_private(client, db_session):
    from sqlalchemy import select

    from app.models import Task
    from app.services.schedule import due_on

    ids = await _family(client)
    start = date.today() + timedelta(days=1)
    course = (await client.post("/api/medicine", json={"user_id": ids["kid2"], "name": "Drops", "times": ["09:00"], "start_date": str(start), "end_date": str(start + timedelta(days=4))})).json()
    task = (await db_session.execute(select(Task).where(Task.medication_id == uuid.UUID(course["id"])))).scalar_one()
    assert not due_on(task, start - timedelta(days=1))
    assert due_on(task, start) and due_on(task, start + timedelta(days=4))
    assert not due_on(task, start + timedelta(days=5))

    mine = (await client.post("/api/medicine", json={"user_id": ids["admin"], "name": "Blood pressure", "times": ["08:00"]})).json()
    assert mine["as_tasks"] is False
    assert not [t for t in (await client.get("/api/tasks")).json() if t["medication_id"] == mine["id"]]


async def test_a_pets_doses_take_turns_like_its_chores(client):
    ids = await _family(client)
    pet = (await client.post("/api/pets", json={"name": "Sixten", "species": "dog"})).json()
    await client.post("/api/tasks", json={"title": "Walk Sixten", "recurrence": "daily", "pet_id": pet["id"], "rotation_user_ids": [ids["kid1"], ids["kid2"]]})
    med = (await client.post("/api/medicine", json={"pet_id": pet["id"], "name": "Worm tablet", "times": ["18:00"]})).json()
    [dose] = [t for t in (await client.get("/api/tasks")).json() if t["medication_id"] == med["id"]]
    assert dose["title"] == "Sixten: Worm tablet · 18:00"
    assert dose["rotation_user_ids"] == [ids["kid1"], ids["kid2"]] and dose["assignee_id"] == ids["kid1"]


async def test_the_day_to_pack_for_a_trip(client):
    ids = await _family(client)
    start = date.today() + timedelta(days=10)
    trip = (await client.post("/api/trips", json={"name": "Åre", "start_date": str(start), "end_date": str(start + timedelta(days=5)), "member_ids": [ids["kid1"], ids["kid2"]]})).json()
    day = start - timedelta(days=1)
    body = {"day": str(day), "member_ids": [ids["kid1"], ids["kid2"]], "points": 15}
    detail = (await client.put(f"/api/trips/{trip['id']}/pack-task", json=body)).json()
    assert sorted(p["user_id"] for p in detail["pack_tasks"]) == sorted([ids["kid1"], ids["kid2"]])
    tasks = [t for t in (await client.get("/api/tasks")).json() if t["trip_id"] == trip["id"]]
    assert {t["title"] for t in tasks} == {"Pack for Åre"} and {t["due_date"] for t in tasks} == {str(day)} and {t["points"] for t in tasks} == {15}
    assert (await client.put(f"/api/trips/{trip['id']}/pack-task", json={**body, "day": str(start + timedelta(days=1))})).status_code == 422

    # Another day, one child fewer; then none at all.
    detail = (await client.put(f"/api/trips/{trip['id']}/pack-task", json={**body, "day": str(day - timedelta(days=1)), "member_ids": [ids["kid1"]]})).json()
    assert [(p["user_id"], p["day"]) for p in detail["pack_tasks"]] == [(ids["kid1"], str(day - timedelta(days=1)))]
    detail = (await client.put(f"/api/trips/{trip['id']}/pack-task", json={"day": None, "member_ids": []})).json()
    assert detail["pack_tasks"] == []

    await _login(client, "kid1")
    assert (await client.put(f"/api/trips/{trip['id']}/pack-task", json=body)).status_code == 403


async def test_the_day_to_pack_for_an_event(client):
    ids = await _family(client)
    start = datetime.now(timezone.utc).replace(microsecond=0) + timedelta(days=3)
    event = (await client.post("/api/calendar/family-events", json={"title": "Football practice", "start": start.isoformat(), "end": (start + timedelta(hours=1)).isoformat()})).json()
    await client.put("/api/calendar/packing", json={"title": "Football practice", "items": ["Boots", "Water bottle"]})
    target = {"key": f"app:{event['id']}", "title": "Football practice", "start": start.isoformat()}
    plan = (await client.put("/api/calendar/plan/pack-task", json={**target, "day": str(start.date()), "member_ids": [ids["kid1"]]})).json()
    assert [p["user_id"] for p in plan["pack_tasks"]] == [ids["kid1"]]
    [task] = [t for t in (await client.get("/api/tasks")).json() if t["event_key"] == target["key"]]
    assert task["title"] == "Pack for Football practice" and task["description"] == "• Boots\n• Water bottle"
    events = (await client.get(f"/api/calendar/events?start={start.date()}&end={start.date() + timedelta(days=1)}")).json()
    assert next(e for e in events if e.get("key") == target["key"])["pack_tasks"][0]["user_id"] == ids["kid1"]

    # The event is removed: so is its packing task.
    assert (await client.delete(f"/api/calendar/family-events/{event['id']}")).status_code == 204
    assert not [t for t in (await client.get("/api/tasks")).json() if t["event_key"] == target["key"]]


async def test_reporting_a_task_afterwards(client):
    """2.9.0: a task done but not ticked off can be reported up to three days back."""
    ids = await _family(client)
    task = (await client.post("/api/tasks", json={"title": "Feed the fish", "recurrence": "daily", "assignee_id": ids["kid1"], "points": 4})).json()
    yesterday = date.today() - timedelta(days=1)
    rows = (await client.get(f"/api/tasks/today?back=1")).json()
    assert [r["task"]["title"] for r in rows] == ["Feed the fish"] and rows[0]["done"] is False
    assert (await client.get(f"/api/tasks/today?back=4")).status_code == 422
    assert (await client.get(f"/api/tasks/today?back=-1")).status_code == 422

    await _login(client, "kid1")
    done = (await client.post(f"/api/tasks/{task['id']}/complete?back=1")).json()
    assert done["completion_status"] in ("approved", "pending")
    assert (await client.post(f"/api/tasks/{task['id']}/complete?back=1")).status_code == 409
    # Yesterday's is reported; today's is still open.
    assert (await client.get(f"/api/tasks/today?back=1")).json()[0]["completion_status"] in ("approved", "pending")
    today_row = next(r for r in (await client.get("/api/tasks/today")).json() if r["task"]["id"] == task["id"])
    assert today_row["done"] is False and today_row["completion_status"] is None
    history = (await client.get("/api/tasks/history?days=7")).json()
    assert [h["completed_date"] for h in history] == [str(yesterday)]

    # A one-off task due later wasn't due yet.
    await _login(client, "admin", "secret123")
    later = (await client.post("/api/tasks", json={"title": "Fix the bike", "due_date": str(date.today()), "points": 5})).json()
    assert (await client.post(f"/api/tasks/{later['id']}/complete?back=1")).status_code == 422

"""Taking turns (#66), medicine reminders (#67), pets (#64) and wish list share links."""
from datetime import date, datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient

pytestmark = pytest.mark.asyncio


async def _family(client):
    resp = await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "F", "display_name": "Admin", "username": "admin", "password": "secret123"},
    )
    assert resp.status_code == 201
    ids = {"admin": resp.json()["id"]}
    for username, role in [("adult1", "adult"), ("kid1", "child"), ("kid2", "child")]:
        r = await client.post("/api/family/members", json={"display_name": username.title(), "username": username, "password": "pass1234", "role": role})
        ids[username] = r.json()["id"]
    return ids


async def _login(client, username, password="pass1234"):
    assert (await client.post("/api/auth/login", json={"username": username, "password": password})).status_code == 200


def _today_task(rows, title):
    return next(r for r in rows if r["task"]["title"] == title)


# --- Taking turns ----------------------------------------------------------------------------


async def test_turns_pass_on_when_done(client):
    ids = await _family(client)
    assert (await client.post("/api/tasks", json={"title": "Bins", "rotation_user_ids": [ids["kid1"]]})).status_code == 422
    assert (await client.post("/api/tasks", json={"title": "Bins", "rotation_user_ids": [ids["kid1"], "00000000-0000-0000-0000-000000000000"]})).status_code == 422
    task = (await client.post("/api/tasks", json={"title": "Bins", "recurrence": "daily", "rotation_user_ids": [ids["kid1"], ids["kid2"]]})).json()
    assert task["assignee_id"] == ids["kid1"] and task["rotation_mode"] == "done"

    await _login(client, "kid2")
    assert (await client.post(f"/api/tasks/{task['id']}/complete")).status_code == 403
    await _login(client, "kid1")
    done = (await client.post(f"/api/tasks/{task['id']}/complete")).json()
    assert done["task"]["assignee_id"] == ids["kid2"]  # Kid2's turn next time

    await _login(client, "admin", "secret123")
    edited = (await client.patch(f"/api/tasks/{task['id']}", json={"rotation_user_ids": [ids["kid2"], ids["kid1"], ids["adult1"]]})).json()
    assert edited["assignee_id"] == ids["kid2"] and len(edited["rotation_user_ids"]) == 3
    off = (await client.patch(f"/api/tasks/{task['id']}", json={"rotation_user_ids": []})).json()
    assert off["rotation_user_ids"] == []


async def test_weekly_turns_follow_the_calendar(client, db_session):
    import uuid as _uuid

    from app.models import Task

    ids = await _family(client)
    task = (await client.post("/api/tasks", json={"title": "Hoover", "recurrence": "daily", "rotation_mode": "weekly", "rotation_user_ids": [ids["kid1"], ids["kid2"]]})).json()
    row = await db_session.get(Task, _uuid.UUID(task["id"]))
    row.anchor_date = date.today() - timedelta(days=7)  # set up last week: this week is Kid2's
    await db_session.commit()
    today = _today_task((await client.get("/api/tasks/today")).json(), "Hoover")
    assert today["task"]["assignee_id"] == ids["kid2"]
    next_week = (await client.get(f"/api/tasks/week?start={date.today() + timedelta(days=7)}")).json()
    assert _today_task(next_week[0]["items"], "Hoover")["task"]["assignee_id"] == ids["kid1"]


# --- Medicine --------------------------------------------------------------------------------


async def test_medicine_privacy_and_ticking_off(client):
    ids = await _family(client)
    mine = (await client.post("/api/medicine", json={"user_id": ids["admin"], "name": "Blood pressure", "times": ["08:00"]})).json()
    kid = (await client.post("/api/medicine", json={"user_id": ids["kid1"], "name": "Penicillin", "dose": "5 ml", "times": ["20:00", "08:00"], "end_date": str(date.today() + timedelta(days=9))})).json()
    assert kid["times"] == ["08:00", "20:00"] and len(kid["today"]) == 2
    assert (await client.post("/api/medicine", json={"user_id": ids["adult1"], "name": "x", "times": ["09:00"]})).status_code == 403
    assert (await client.post("/api/medicine", json={"user_id": ids["kid1"], "name": "x", "times": ["25:00"]})).status_code == 422

    await _login(client, "adult1")
    names = [m["name"] for m in (await client.get("/api/medicine")).json()]
    assert names == ["Penicillin"]  # the admin's own medicine stays private
    # A child's doses are tasks since 2.9.0 – ticked off there (test_task_links.py).
    assert (await client.post(f"/api/medicine/{kid['id']}/take", json={"scheduled_at": kid["today"][0]["scheduled_at"]})).status_code == 409
    assert (await client.post(f"/api/medicine/{mine['id']}/take", json={"scheduled_at": mine["today"][0]["scheduled_at"]})).status_code == 404

    # An adult's own doses are ticked off in the medicine app (again = undo).
    await _login(client, "admin", "secret123")
    taken = (await client.post(f"/api/medicine/{mine['id']}/take", json={"scheduled_at": mine["today"][0]["scheduled_at"]})).json()
    assert taken["today"][0]["taken_by_name"] == "Admin"
    undone = (await client.post(f"/api/medicine/{mine['id']}/take", json={"scheduled_at": mine["today"][0]["scheduled_at"]})).json()
    assert undone["today"][0]["taken_at"] is None
    assert (await client.post(f"/api/medicine/{mine['id']}/take", json={"scheduled_at": "2001-01-01T08:00:00Z"})).status_code == 422

    await _login(client, "kid2")
    assert (await client.get("/api/medicine")).json() == []
    await _login(client, "kid1")
    assert [m["name"] for m in (await client.get("/api/medicine")).json()] == ["Penicillin"]


async def test_medicine_reminder_and_missed_alert(client, db_session, monkeypatch):
    from app.config import get_settings
    from app.services.medicine import run_medicine_reminders

    monkeypatch.setattr(get_settings(), "timezone", "UTC")
    ids = await _family(client)
    at = datetime.now(timezone.utc).replace(second=0, microsecond=0) - timedelta(minutes=5)
    await client.post("/api/medicine", json={"user_id": ids["kid1"], "name": "Inhaler", "times": [at.strftime("%H:%M")], "start_date": str(at.date())})
    assert await run_medicine_reminders(db_session, at + timedelta(minutes=5)) == 3  # the child and both adults (2.8.2)
    assert await run_medicine_reminders(db_session, at + timedelta(minutes=6)) == 0
    assert await run_medicine_reminders(db_session, at + timedelta(minutes=61)) == 2  # both adults
    assert await run_medicine_reminders(db_session, at + timedelta(minutes=70)) == 0
    await _login(client, "kid1")
    assert [n["kind"] for n in (await client.get("/api/notifications")).json()] == ["medicine"]
    await _login(client, "adult1")
    assert sorted(n["kind"] for n in (await client.get("/api/notifications")).json()) == ["medicine", "medicine_missed"]


# --- Pets ------------------------------------------------------------------------------------


async def test_pets_birthday_care_reminder_chores_and_removal(client, db_session):
    from app.services.pet_care import run_pet_care_reminders

    ids = await _family(client)
    pet = (await client.post("/api/pets", json={"name": "Sixten", "species": "dog", "birth_date": "2021-05-04"})).json()
    people = (await client.get("/api/birthdays/people")).json()
    assert [p["name"] for p in people] == ["Sixten"]
    due = date.today() + timedelta(days=7)
    pet = (await client.post(f"/api/pets/{pet['id']}/care", json={"kind": "vaccination", "title": "Rabies", "next_due": str(due)})).json()
    assert pet["next_due"] == str(due)
    noon = datetime.combine(date.today(), datetime.min.time(), tzinfo=timezone.utc).replace(hour=12)
    assert await run_pet_care_reminders(db_session, noon) == 2  # the two adults
    assert await run_pet_care_reminders(db_session, noon) == 0

    walk = (await client.post("/api/tasks", json={"title": "Walk Sixten", "recurrence": "daily", "pet_id": pet["id"], "rotation_user_ids": [ids["kid1"], ids["kid2"]]})).json()
    assert walk["pet_id"] == pet["id"]
    assert [c["title"] for c in (await client.get("/api/pets")).json()[0]["chores"]] == ["Walk Sixten"]
    await client.post("/api/medicine", json={"pet_id": pet["id"], "name": "Wormer", "times": ["09:00"]})

    await _login(client, "kid1")
    assert (await client.post("/api/pets", json={"name": "Mine"})).status_code == 403
    assert [m["for_name"] for m in (await client.get("/api/medicine")).json()] == ["Sixten"]  # pets' medicines are for everyone

    await _login(client, "admin", "secret123")
    assert (await client.delete(f"/api/pets/{pet['id']}")).status_code == 204
    assert (await client.get("/api/birthdays/people")).json() == []
    assert (await client.get("/api/medicine")).json() == []


# --- Sharing a wish list -----------------------------------------------------------------------


async def test_wish_list_share_link(client):
    from app.main import app

    ids = await _family(client)
    person = (await client.post("/api/birthdays/people", json={"name": "Kid1", "user_id": ids["kid1"], "birth_month": 5, "birth_day": 4})).json()
    lego = (await client.post(f"/api/birthdays/people/{person['id']}/wishes", json={"title": "LEGO"})).json()
    await client.post(f"/api/birthdays/people/{person['id']}/wishes", json={"kind": "idea", "title": "Secret idea"})
    assert (await client.post(f"/api/birthdays/people/{person['id']}/shares", json={"days": 5})).status_code == 422
    share = (await client.post(f"/api/birthdays/people/{person['id']}/shares", json={"days": 90})).json()
    token = share["url"].rsplit("/", 1)[1]

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as gran:
        listing = (await gran.get(f"/api/wishes/{token}")).json()
        assert listing["name"] == "Kid1" and [w["title"] for w in listing["wishes"]] == ["LEGO"]  # no gift ideas
        key = (await gran.post(f"/api/wishes/{token}/{lego['id']}/reserve", json={"name": "Grandma"})).json()["key"]
        assert (await gran.post(f"/api/wishes/{token}/{lego['id']}/reserve", json={"name": "Grandpa"})).status_code == 409
        assert (await gran.get(f"/api/wishes/{token}?key={key}")).json()["wishes"][0]["reserved_by_you"] is True

        wishes = (await client.get(f"/api/birthdays/people/{person['id']}/wishes")).json()
        assert next(w for w in wishes if w["title"] == "LEGO")["reserved_by_name"] == "Grandma"
        await _login(client, "kid1")
        own = (await client.get(f"/api/birthdays/people/{person['id']}/wishes")).json()
        assert own[0]["reserved"] is None  # still a surprise
        assert (await client.post(f"/api/birthdays/people/{person['id']}/shares", json={"days": 90})).status_code == 403

        assert (await gran.delete(f"/api/wishes/{token}/{lego['id']}/reserve?key=wrong")).status_code == 404
        assert (await gran.delete(f"/api/wishes/{token}/{lego['id']}/reserve?key={key}")).status_code == 204
        await _login(client, "admin", "secret123")
        await client.delete(f"/api/birthdays/shares/{share['id']}")
        assert (await gran.get(f"/api/wishes/{token}")).status_code == 404

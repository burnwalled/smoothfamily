"""The little ones' mode (2.5.5): picture routines done step by step, stickers, and the kitchen display."""
import pytest

pytestmark = pytest.mark.asyncio

MORNING = {
    "name": "Morning",
    "picture": "🌅",
    "points": 5,
    "steps": [
        {"picture": "🚽", "label": "Toilet"},
        {"picture": "🪥", "label": "Brush teeth"},
        {"picture": "👕", "label": "Get dressed"},
    ],
}


async def _family(client):
    await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123"},
    )
    ids = {}
    for username, role in [("erik", "adult"), ("ella", "child"), ("leo", "child")]:
        member = await client.post("/api/family/members", json={"display_name": username.title(), "username": username, "password": "pass1234", "role": role})
        ids[username] = member.json()["id"]
    return ids


async def _login(client, username, password="pass1234"):
    assert (await client.post("/api/auth/login", json={"username": username, "password": password})).status_code == 200


async def test_routine_step_by_step(client):
    ids = await _family(client)
    # Only adults turn the mode on and make routines; only children have it.
    assert (await client.put(f"/api/easy/children/{ids['erik']}", json={"easy_mode": True})).status_code == 422
    assert (await client.put(f"/api/easy/children/{ids['ella']}", json={"easy_mode": True})).json()["easy_mode"] is True
    routine = (await client.post("/api/easy/routines", json={**MORNING, "user_id": ids["ella"]})).json()
    assert [s["label"] for s in routine["steps"]] == ["Toilet", "Brush teeth", "Get dressed"]
    tidy = (await client.post("/api/tasks", json={"title": "Tidy the toys", "assignee_id": ids["ella"], "recurrence": "daily", "points": 3, "picture": "🧸"})).json()

    await _login(client, "ella")
    me = (await client.get("/api/auth/me")).json()
    assert me["easy_mode"] is True
    assert (await client.post("/api/easy/routines", json={**MORNING, "user_id": ids["ella"]})).status_code == 403
    day = (await client.get("/api/easy/today")).json()
    assert [r["name"] for r in day["routines"]] == ["Morning"]
    # The routine's own task isn't listed twice; the other task shows with its picture.
    assert [(t["title"], t["picture"]) for t in day["tasks"]] == [("Tidy the toys", "🧸")]
    steps = day["routines"][0]["steps"]

    after = (await client.post(f"/api/easy/steps/{steps[0]['id']}/done")).json()
    assert [s["done"] for s in after["routines"][0]["steps"]] == [True, False, False] and after["new_sticker"] is None
    # Undo while the routine isn't finished.
    after = (await client.delete(f"/api/easy/steps/{steps[0]['id']}/done")).json()
    assert after["routines"][0]["steps"][0]["done"] is False
    for step in steps[:2]:
        await client.post(f"/api/easy/steps/{step['id']}/done")
    last = (await client.post(f"/api/easy/steps/{steps[2]['id']}/done")).json()
    # Done: a sticker, and the task waits for an adult (children's tasks do by default).
    assert last["new_sticker"] and last["routines"][0]["state"] == "pending"
    assert last["stickers"] == 1 and last["stickers_today"] == [last["new_sticker"]]
    assert (await client.delete(f"/api/easy/steps/{steps[2]['id']}/done")).status_code == 409
    # Ticking a step again doesn't give another sticker.
    again = (await client.post(f"/api/easy/steps/{steps[2]['id']}/done")).json()
    assert again["new_sticker"] is None and again["stickers"] == 1

    # A task by itself; a routine can't be ticked off as a whole.
    done = (await client.post(f"/api/easy/tasks/{tidy['id']}/done")).json()
    assert done["new_sticker"] and done["tasks"][0]["state"] == "pending" and done["stickers"] == 2
    assert (await client.post(f"/api/easy/tasks/{routine['task_id']}/done")).status_code == 422
    assert len((await client.get("/api/easy/stickers")).json()) == 2

    # Not a sibling's routine.
    assert (await client.get(f"/api/easy/today?user_id={ids['leo']}")).status_code == 403

    # The adult approves as for any task: the points come then.
    await _login(client, "admin", "secret123")
    pending = (await client.get("/api/tasks/approvals")).json()
    assert sorted(p["task_title"] for p in pending) == ["Morning", "Tidy the toys"]
    view = (await client.get(f"/api/easy/today?user_id={ids['ella']}")).json()
    assert view["name"] == "Ella" and view["routines"][0]["state"] == "pending"


async def test_routines_edit_and_days(client):
    ids = await _family(client)
    routine = (await client.post("/api/easy/routines", json={**MORNING, "user_id": ids["leo"], "weekdays": [0, 1, 2, 3, 4]})).json()
    assert routine["weekdays"] == [0, 1, 2, 3, 4]
    kept = routine["steps"][1]
    changed = (
        await client.put(
            f"/api/easy/routines/{routine['id']}",
            json={**MORNING, "user_id": ids["leo"], "name": "School morning", "weekdays": [], "steps": [kept, {"picture": "🎒", "label": "Pack the bag"}]},
        )
    ).json()
    assert changed["name"] == "School morning" and changed["weekdays"] == []
    assert [s["label"] for s in changed["steps"]] == ["Brush teeth", "Pack the bag"] and changed["steps"][0]["id"] == kept["id"]
    assert [r["name"] for r in (await client.get(f"/api/easy/routines?user_id={ids['leo']}")).json()] == ["School morning"]

    assert (await client.delete(f"/api/easy/routines/{routine['id']}")).status_code == 204
    assert (await client.get(f"/api/easy/routines?user_id={ids['leo']}")).json() == []
    # Its task is no longer on Today.
    today = (await client.get(f"/api/easy/today?user_id={ids['leo']}")).json()
    assert today["routines"] == [] and today["tasks"] == []


async def test_kitchen_display_shows_the_little_ones(client):
    ids = await _family(client)
    await client.put(f"/api/easy/children/{ids['ella']}", json={"easy_mode": True})
    routine = (await client.post("/api/easy/routines", json={**MORNING, "user_id": ids["ella"], "steps": MORNING["steps"][:1]})).json()
    await client.post("/api/easy/routines", json={**MORNING, "user_id": ids["leo"]})
    # The admin chooses per screen whether the little ones can use it.
    screen = (await client.post("/api/kiosks", json={"name": "Kitchen"})).json()
    token = screen["url"].rsplit("/", 1)[1]
    assert screen["easy_mode"] is False
    assert (await client.get(f"/api/kiosk/{token}/easy")).status_code == 403
    changed = (await client.put(f"/api/kiosks/{screen['id']}", json={"easy_mode": True})).json()
    # Only what was sent changes.
    assert changed["easy_mode"] is True and changed["pantry_scan"] is False
    tablet = (await client.post("/api/kiosks", json={"name": "Family tablet", "easy_mode": True})).json()
    assert tablet["easy_mode"] is True
    assert (await client.get(f"/api/kiosk/{token}")).json()["easy_mode"] is True
    client.cookies.clear()

    # Only the children in the mode.
    assert [c["name"] for c in (await client.get(f"/api/kiosk/{token}/easy")).json()] == ["Ella"]
    assert (await client.get(f"/api/kiosk/{token}/easy/{ids['leo']}")).status_code == 404
    day = (await client.get(f"/api/kiosk/{token}/easy/{ids['ella']}")).json()
    done = (await client.post(f"/api/kiosk/{token}/easy/{ids['ella']}/steps/{day['routines'][0]['steps'][0]['id']}/done")).json()
    assert done["new_sticker"] and done["routines"][0]["id"] == routine["id"] and done["routines"][0]["state"] == "pending"
    assert (await client.get(f"/api/kiosk/wrong-token/easy")).status_code == 404

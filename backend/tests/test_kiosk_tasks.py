"""3.0.3: tasks several do together (the points shared), ticked off on the kitchen display by
whoever did them, the day's dinner on the screen, and the screen's screensaver."""
import json
from datetime import date, timedelta

import pytest

pytestmark = pytest.mark.asyncio


async def _family(client):
    await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123"},
    )
    ids = {}
    for name, role in [("adult1", "adult"), ("kid1", "child"), ("kid2", "child")]:
        ids[name] = (await client.post("/api/family/members", json={"display_name": name.title(), "username": name, "password": "pass1234", "role": role})).json()["id"]
    return ids


async def _points(client, user_id):
    board = (await client.get("/api/tasks/leaderboard")).json()
    return next((row.get("points", row.get("week_points", 0)) for row in board if row.get("user_id") == user_id), 0)


async def test_a_task_done_together_shares_the_points(client):
    ids = await _family(client)
    assert (await client.patch("/api/allowance/settings", json={"child_approval": False})).status_code == 200
    task = (await client.post("/api/tasks", json={"title": "Rake the leaves", "recurrence": "daily", "points": 11, "shared": True})).json()
    assert task["shared"] is True
    plain = (await client.post("/api/tasks", json={"title": "Empty the bins", "recurrence": "daily", "points": 4})).json()

    await client.post("/api/auth/login", json={"username": "kid1", "password": "pass1234"})
    done = (await client.post(f"/api/tasks/{task['id']}/complete", json={"together": [ids["kid2"], ids["adult1"]]})).json()
    assert done["completion_status"] in ("approved", "pending")
    # 11 between three: 4, 4 and 3 – the first ones get what's left over.
    history = (await client.get("/api/tasks/history?days=1")).json()
    assert [h["points_awarded"] for h in history if h["task_id"] == task["id"]] == [4]
    # A task that isn't shared can't be done together; and done is done.
    assert (await client.post(f"/api/tasks/{plain['id']}/complete", json={"together": [ids["kid2"]]})).status_code == 422
    assert (await client.post(f"/api/tasks/{task['id']}/complete")).status_code == 409


async def test_shared_points_wait_for_approval_as_shares(client):
    ids = await _family(client)
    task = (await client.post("/api/tasks", json={"title": "Wash the car", "recurrence": "daily", "points": 10, "shared": True})).json()
    await client.post("/api/auth/login", json={"username": "kid1", "password": "pass1234"})
    await client.post(f"/api/tasks/{task['id']}/complete", json={"together": [ids["kid2"]]})
    await client.post("/api/auth/login", json={"username": "admin", "password": "secret123"})
    approvals = (await client.get("/api/tasks/approvals")).json()
    mine = [a for a in approvals if a["task_title"] == "Wash the car"]
    assert sorted(a["points"] for a in mine) == [5, 5]
    assert len(mine) == 2
    for a in mine:
        assert (await client.post(f"/api/tasks/approvals/{a['completion_id']}", json={"action": "approve"})).status_code == 200
    from app.database import SessionLocal
    from app.models import TaskCompletion
    from sqlalchemy import select

    async with SessionLocal() as db:
        rows = (await db.execute(select(TaskCompletion).where(TaskCompletion.status == "approved"))).scalars().all()
    assert sorted(r.points_awarded for r in rows) == [5, 5]


async def test_the_kitchen_display_ticks_off_who_did_it(client):
    ids = await _family(client)
    assert (await client.patch("/api/allowance/settings", json={"child_approval": False})).status_code == 200
    screen = (await client.post("/api/kiosks", json={"name": "Kitchen", "screensaver": "flipclock", "idle_minutes": 3})).json()
    assert screen["screensaver"] == "flipclock" and screen["idle_minutes"] == 3
    changed = (await client.put(f"/api/kiosks/{screen['id']}", json={"screensaver": "calm", "idle_minutes": 10})).json()
    assert changed["screensaver"] == "calm" and changed["idle_minutes"] == 10
    assert (await client.put(f"/api/kiosks/{screen['id']}", json={"screensaver": "disco"})).status_code == 422
    assert (await client.put(f"/api/kiosks/{screen['id']}", json={"screensaver": "fox"})).json()["screensaver"] == "fox"
    await client.put(f"/api/kiosks/{screen['id']}", json={"screensaver": "calm"})
    # Everything about the screen is set here, centrally (3.0.4): its name and its night too.
    assert screen["night_dim"] is True and (screen["night_from"], screen["night_to"]) == (22, 6)
    night = (await client.put(f"/api/kiosks/{screen['id']}", json={"name": "Hall", "night_dim": False, "night_from": 21, "night_to": 7})).json()
    assert night["name"] == "Hall" and night["night_dim"] is False and (night["night_from"], night["night_to"]) == (21, 7)
    assert (await client.put(f"/api/kiosks/{screen['id']}", json={"night_from": 24})).status_code == 422
    # Its own language, or back to the admin's with "".
    assert screen["language"] == ""
    assert (await client.put(f"/api/kiosks/{screen['id']}", json={"language": "fi"})).json()["language"] == "fi"
    assert (await client.put(f"/api/kiosks/{screen['id']}", json={"language": "xx"})).status_code == 422
    token = screen["url"].rsplit("/", 1)[1]

    # Dinner every day this week and next, so today's and tomorrow's are there whatever the zone.
    for week in (date.today() - timedelta(days=date.today().weekday()), date.today() - timedelta(days=date.today().weekday()) + timedelta(days=7)):
        meals = {"meals": [{"weekday": d, "name": f"Dinner {d}"} for d in range(7)]}
        assert (await client.post(f"/api/meals/import?week_start={week}", content=json.dumps(meals), headers={"Content-Type": "text/plain"})).status_code == 200

    shared = (await client.post("/api/tasks", json={"title": "Tidy the garden", "recurrence": "daily", "points": 6, "shared": True})).json()
    solo = (await client.post("/api/tasks", json={"title": "Feed the fish", "recurrence": "daily", "points": 3, "assignee_id": ids["kid1"]})).json()

    view = (await client.get(f"/api/kiosk/{token}")).json()
    assert view["screensaver"] == "calm" and view["idle_minutes"] == 10
    assert len(view["meals"]) == 2 and view["meals"][0]["name"].startswith("Dinner")
    tasks = {t["title"]: t for t in view["tasks"]}
    assert tasks["Tidy the garden"]["shared"] is True and tasks["Tidy the garden"]["points"] == 6
    assert tasks["Feed the fish"]["assignee_id"] == ids["kid1"]
    assert view["night_dim"] is False and (view["night_from"], view["night_to"]) == (21, 7)
    assert view["language"] == "fi"
    await client.put(f"/api/kiosks/{screen['id']}", json={"language": ""})
    assert (await client.get(f"/api/kiosk/{token}")).json()["language"] == "en"

    # A new link: the old one stops working, the screen keeps its settings.
    fresh = (await client.post(f"/api/kiosks/{screen['id']}/link")).json()
    assert fresh["name"] == "Hall" and fresh["screensaver"] == "calm"
    assert (await client.get(f"/api/kiosk/{token}")).status_code != 200
    token = fresh["url"].rsplit("/", 1)[1]
    assert (await client.get(f"/api/kiosk/{token}")).status_code == 200

    client.cookies.clear()  # the screen has no account
    done = (await client.post(f"/api/kiosk/{token}/tasks/{shared['id']}/done", json={"user_ids": [ids["kid1"], ids["kid2"]]})).json()
    assert done["done"] is True
    assert (await client.post(f"/api/kiosk/{token}/tasks/{solo['id']}/done", json={"user_ids": [ids["kid1"], ids["kid2"]]})).status_code == 422
    assert (await client.post(f"/api/kiosk/{token}/tasks/{solo['id']}/done", json={"user_ids": [ids["kid1"]]})).json()["done"] is True
    assert (await client.post(f"/api/kiosk/{token}/tasks/{solo['id']}/done", json={"user_ids": [ids["kid1"]]})).status_code == 409
    assert (await client.post("/api/kiosk/nope/tasks/{}/done".format(solo["id"]), json={"user_ids": [ids["kid1"]]})).status_code == 404
    # Ticked off by mistake (3.1.1): undone on the screen, and ticked off again.
    assert (await client.delete(f"/api/kiosk/{token}/tasks/{solo['id']}/done")).status_code == 204
    assert next(t for t in (await client.get(f"/api/kiosk/{token}")).json()["tasks"] if t["id"] == solo["id"])["done"] is False
    assert (await client.delete(f"/api/kiosk/{token}/tasks/{solo['id']}/done")).status_code == 404
    assert (await client.post(f"/api/kiosk/{token}/tasks/{solo['id']}/done", json={"user_ids": [ids["kid1"]]})).json()["done"] is True

    from app.database import SessionLocal
    from app.models import TaskCompletion
    from sqlalchemy import select

    async with SessionLocal() as db:
        rows = (await db.execute(select(TaskCompletion).where(TaskCompletion.status == "approved"))).scalars().all()
    by_task = {}
    for r in rows:
        by_task.setdefault(str(r.task_id), []).append(r.points_awarded)
    assert sorted(by_task[shared["id"]]) == [3, 3] and by_task[solo["id"]] == [3]

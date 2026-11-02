"""3.1.1: a task ticked off by mistake can be undone – the points go, a one-off task comes back,
the turn goes back; a child only their own, and not once an adult has approved it."""
from datetime import date

import pytest

pytestmark = pytest.mark.asyncio


async def _family(client):
    await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123"},
    )
    ids = {}
    for name, role in [("kid1", "child"), ("kid2", "child")]:
        ids[name] = (await client.post("/api/family/members", json={"display_name": name.title(), "username": name, "password": "pass1234", "role": role})).json()["id"]
    return ids


async def _login(client, username, password="pass1234"):
    await client.post("/api/auth/login", json={"username": username, "password": password})


def _today(rows, task_id):
    return next(r for r in rows if r["task"]["id"] == task_id)


async def test_undo_takes_the_points_back(client):
    await _family(client)
    task = (await client.post("/api/tasks", json={"title": "Dishes", "recurrence": "daily", "points": 7})).json()
    assert (await client.post(f"/api/tasks/{task['id']}/complete")).status_code == 200
    row = _today((await client.get("/api/tasks/today")).json(), task["id"])
    assert row["done"] and row["can_undo"]
    assert (await client.delete(f"/api/tasks/{task['id']}/complete")).status_code == 204
    row = _today((await client.get("/api/tasks/today")).json(), task["id"])
    assert not row["done"] and row["completion_status"] is None
    assert (await client.get("/api/tasks/history?days=1")).json() == []
    # Nothing to undo now; and it can be ticked off again.
    assert (await client.delete(f"/api/tasks/{task['id']}/complete")).status_code == 404
    assert (await client.post(f"/api/tasks/{task['id']}/complete")).status_code == 200


async def test_a_one_off_task_comes_back(client):
    await _family(client)
    task = (await client.post("/api/tasks", json={"title": "Fix the bike", "recurrence": "none", "due_date": date.today().isoformat(), "points": 3})).json()
    await client.post(f"/api/tasks/{task['id']}/complete")
    assert all(t["id"] != task["id"] for t in (await client.get("/api/tasks")).json())
    assert (await client.delete(f"/api/tasks/{task['id']}/complete")).status_code == 204
    assert any(t["id"] == task["id"] for t in (await client.get("/api/tasks")).json())


async def test_the_turn_goes_back(client):
    ids = await _family(client)
    task = (await client.post("/api/tasks", json={"title": "Bins", "recurrence": "daily", "points": 2, "rotation_user_ids": [ids["kid1"], ids["kid2"]]})).json()
    assert task["assignee_id"] == ids["kid1"]
    await _login(client, "kid1")
    await client.post(f"/api/tasks/{task['id']}/complete")
    await _login(client, "admin", "secret123")
    assert _today((await client.get("/api/tasks/today")).json(), task["id"])["task"]["assignee_id"] == ids["kid2"]
    assert (await client.delete(f"/api/tasks/{task['id']}/complete")).status_code == 204
    assert _today((await client.get("/api/tasks/today")).json(), task["id"])["task"]["assignee_id"] == ids["kid1"]


async def test_a_child_undoes_only_their_own_and_not_once_approved(client):
    await _family(client)
    task = (await client.post("/api/tasks", json={"title": "Feed the cat", "recurrence": "daily", "points": 5})).json()
    await _login(client, "kid1")
    await client.post(f"/api/tasks/{task['id']}/complete")
    assert _today((await client.get("/api/tasks/today")).json(), task["id"])["can_undo"]
    await _login(client, "kid2")
    assert not _today((await client.get("/api/tasks/today")).json(), task["id"])["can_undo"]
    assert (await client.delete(f"/api/tasks/{task['id']}/complete")).status_code == 403
    # Waiting for an adult: still the child's to undo. Approved: an adult's.
    await _login(client, "admin", "secret123")
    for a in (await client.get("/api/tasks/approvals")).json():
        await client.post(f"/api/tasks/approvals/{a['completion_id']}", json={"action": "approve"})
    await _login(client, "kid1")
    assert (await client.delete(f"/api/tasks/{task['id']}/complete")).status_code == 403
    await _login(client, "admin", "secret123")
    assert (await client.delete(f"/api/tasks/{task['id']}/complete")).status_code == 204


async def test_a_task_taken_away_keeps_its_history(client):
    """3.4.0: deleting a task that has been done keeps the points, the history and the allowance;
    one never done is simply removed."""
    ids = await _family(client)
    await client.patch("/api/allowance/settings", json={"child_approval": False})
    task = (await client.post("/api/tasks", json={"title": "Bins", "recurrence": "daily", "points": 6, "assignee_id": ids["kid1"]})).json()
    never = (await client.post("/api/tasks", json={"title": "Never done", "recurrence": "daily", "points": 3})).json()
    await _login(client, "kid1")
    await client.post(f"/api/tasks/{task['id']}/complete")
    before = (await client.get("/api/tasks/history?days=1")).json()
    await _login(client, "admin", "secret123")
    assert (await client.delete(f"/api/tasks/{task['id']}")).status_code == 204
    assert (await client.delete(f"/api/tasks/{never['id']}")).status_code == 204
    # Gone from every list …
    assert all(t["id"] != task["id"] for t in (await client.get("/api/tasks/manage")).json())
    assert all(r["task"]["id"] != task["id"] for r in (await client.get("/api/tasks/today")).json())
    # … but the time it was done is still there, with its points (the child's own history).
    await _login(client, "kid1")
    after = (await client.get("/api/tasks/history?days=1")).json()
    await _login(client, "admin", "secret123")
    assert after == before and after[0]["points_awarded"] == 6
    board = {r.get("user_id"): r for r in (await client.get("/api/tasks/leaderboard")).json()}
    assert any(v == 6 for k, v in board[ids["kid1"]].items() if "points" in k)
    # It can't be ticked off or undone any more.
    assert (await client.post(f"/api/tasks/{task['id']}/complete")).status_code == 404
    assert (await client.delete(f"/api/tasks/{task['id']}/complete")).status_code == 404

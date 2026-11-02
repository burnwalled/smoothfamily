import pytest

pytestmark = pytest.mark.asyncio


async def _setup_family(client):
    resp = await client.post(
        "/api/auth/setup",
        json={
            "email": "admin@example.com", "family_name": "H Family",
            "display_name": "Admin",
            "username": "admin",
            "password": "secret123",
        },
    )
    assert resp.status_code == 201

    child = await client.post(
        "/api/family/members",
        json={
            "display_name": "Kid",
            "username": "kid",
            "password": "1234",
            "role": "child",
        },
    )
    assert child.status_code == 201
    child_id = child.json()["id"]

    adult = await client.post(
        "/api/family/members",
        json={
            "display_name": "Adult",
            "username": "adult",
            "password": "1234",
            "role": "adult",
        },
    )
    assert adult.status_code == 201

    return child_id


async def test_duplicate_guard_create_task(client):
    await _setup_family(client)

    first = await client.post("/api/tasks", json={"title": "  Tidy Room  ", "points": 10, "recurrence": "daily"})
    assert first.status_code == 201

    dup = await client.post("/api/tasks", json={"title": "tidy room", "points": 10, "recurrence": "daily"})
    assert dup.status_code == 409

    forced = await client.post("/api/tasks?force=true", json={"title": "tidy room", "points": 10, "recurrence": "daily"})
    assert forced.status_code == 201


async def test_pending_requires_approval_flow_and_reject_recompletable(client):
    child_id = await _setup_family(client)

    task = await client.post(
        "/api/tasks",
        json={
            "title": "Approved Chore",
            "points": 20,
            "recurrence": "daily",
            "assignee_id": child_id,
            "requires_approval": True,
        },
    )
    assert task.status_code == 201
    task_id = task.json()["id"]

    await client.post("/api/auth/logout")
    login_child = await client.post("/api/auth/login", json={"username": "kid", "password": "1234"})
    assert login_child.status_code == 200

    complete = await client.post(f"/api/tasks/{task_id}/complete")
    assert complete.status_code == 200
    assert complete.json()["completion_status"] == "pending"

    board_child = await client.get("/api/tasks/leaderboard")
    child_entry = next(x for x in board_child.json() if x["display_name"] == "Kid")
    assert child_entry["points_total"] == 0

    ach_child = await client.get("/api/achievements")
    first_task = next(x for x in ach_child.json()["achievements"] if x["id"] == "first_task")
    assert first_task["unlocked_at"] is None

    allowance_child = await client.get("/api/allowance/me")
    assert allowance_child.status_code == 200
    assert allowance_child.json()["earned_lifetime"] == 0

    await client.post("/api/auth/logout")
    assert (await client.post("/api/auth/login", json={"username": "admin", "password": "secret123"})).status_code == 200

    pending = await client.get("/api/tasks/approvals")
    assert pending.status_code == 200
    assert len(pending.json()) == 1
    completion_id = pending.json()[0]["completion_id"]

    reject = await client.post(f"/api/tasks/approvals/{completion_id}", json={"action": "reject", "note": "Needs redo"})
    assert reject.status_code == 200
    assert reject.json()["status"] == "rejected"

    await client.post("/api/auth/logout")
    assert (await client.post("/api/auth/login", json={"username": "kid", "password": "1234"})).status_code == 200
    retry = await client.post(f"/api/tasks/{task_id}/complete")
    assert retry.status_code == 200
    assert retry.json()["completion_status"] == "pending"


async def test_approve_awards_points_achievements_and_allowance(client):
    child_id = await _setup_family(client)

    set_rate = await client.patch(f"/api/family/members/{child_id}", json={"allowance_rate": 2})
    assert set_rate.status_code == 200

    task = await client.post(
        "/api/tasks",
        json={
            "title": "Allowance Chore",
            "points": 15,
            "recurrence": "daily",
            "assignee_id": child_id,
            "requires_approval": True,
        },
    )
    assert task.status_code == 201
    task_id = task.json()["id"]

    await client.post("/api/auth/logout")
    assert (await client.post("/api/auth/login", json={"username": "kid", "password": "1234"})).status_code == 200
    done = await client.post(f"/api/tasks/{task_id}/complete")
    assert done.status_code == 200
    assert done.json()["completion_status"] == "pending"

    await client.post("/api/auth/logout")
    assert (await client.post("/api/auth/login", json={"username": "admin", "password": "secret123"})).status_code == 200

    pending = await client.get("/api/tasks/approvals")
    completion_id = pending.json()[0]["completion_id"]

    approved = await client.post(f"/api/tasks/approvals/{completion_id}", json={"action": "approve"})
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"

    await client.post("/api/auth/logout")
    assert (await client.post("/api/auth/login", json={"username": "kid", "password": "1234"})).status_code == 200

    board = await client.get("/api/tasks/leaderboard")
    child_entry = next(x for x in board.json() if x["display_name"] == "Kid")
    assert child_entry["points_total"] == 15

    ach = await client.get("/api/achievements")
    first_task = next(x for x in ach.json()["achievements"] if x["id"] == "first_task")
    assert first_task["unlocked_at"] is not None

    allowance = await client.get("/api/allowance/me")
    assert allowance.status_code == 200
    assert allowance.json()["earned_lifetime"] == 30


async def test_payout_by_adults_but_not_children(client):
    child_id = await _setup_family(client)

    set_rate = await client.patch(f"/api/family/members/{child_id}", json={"allowance_rate": 1})
    assert set_rate.status_code == 200

    payout = await client.post("/api/allowance/payouts", json={"user_id": child_id, "amount": 5, "note": "weekly"})
    assert payout.status_code == 201

    await client.post("/api/auth/logout")
    assert (await client.post("/api/auth/login", json={"username": "adult", "password": "1234"})).status_code == 200

    denied_rate = await client.patch(f"/api/family/members/{child_id}", json={"allowance_rate": 2})
    assert denied_rate.status_code == 403

    # Adults administer the allowance (rates and payouts) too; member settings stay admin-only.
    adult_payout = await client.post("/api/allowance/payouts", json={"user_id": child_id, "amount": 5})
    assert adult_payout.status_code == 201

    await client.post("/api/auth/logout")
    assert (await client.post("/api/auth/login", json={"username": "kid", "password": "1234"})).status_code == 200
    denied_payout = await client.post("/api/allowance/payouts", json={"user_id": child_id, "amount": 5})
    assert denied_payout.status_code == 403

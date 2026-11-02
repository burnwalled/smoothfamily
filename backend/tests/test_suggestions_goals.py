"""Task suggestions from children, point goals for the allowance, and family rewards."""
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest

pytestmark = pytest.mark.asyncio


async def _setup(client, child_approval=False):
    resp = await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "G", "display_name": "Admin", "username": "admin", "password": "secret123"},
    )
    assert resp.status_code == 201
    kid = await client.post(
        "/api/family/members", json={"display_name": "Kid", "username": "kid", "password": "1234", "role": "child"}
    )
    await client.post(
        "/api/family/members", json={"display_name": "Adult", "username": "adult", "password": "1234", "role": "adult"}
    )
    await client.patch("/api/allowance/settings", json={"child_approval": child_approval})
    return kid.json()["id"]


async def _login(client, username, password):
    await client.post("/api/auth/logout")
    assert (await client.post("/api/auth/login", json={"username": username, "password": password})).status_code == 200


async def test_child_suggests_adult_approves_with_schedule(client):
    kid_id = await _setup(client)
    await _login(client, "kid", "1234")
    created = await client.post("/api/tasks/suggestions", json={"title": "Rasta grannens hund", "description": "På lördagar"})
    assert created.status_code == 201
    suggestion = created.json()
    assert suggestion["status"] == "pending" and suggestion["user_name"] == "Kid"
    assert (await client.get("/api/tasks/attention")).json() == {"approvals": 0, "suggestions": 0}

    await _login(client, "adult", "1234")
    assert (await client.get("/api/tasks/attention")).json()["suggestions"] == 1
    assert [s["title"] for s in (await client.get("/api/tasks/suggestions")).json()] == ["Rasta grannens hund"]

    approved = await client.post(
        f"/api/tasks/suggestions/{suggestion['id']}/approve",
        json={"title": "Rasta hunden", "recurrence": "weekly", "weekdays": [5], "points": 30, "assignee_id": kid_id},
    )
    assert approved.status_code == 200, approved.text
    task = approved.json()
    assert task["weekdays"] == [5] and task["points"] == 30 and task["assignee_id"] == kid_id
    assert (await client.get("/api/tasks/suggestions")).json() == []
    # Handled once only.
    again = await client.post(f"/api/tasks/suggestions/{suggestion['id']}/approve", json={"title": "x", "recurrence": "daily"})
    assert again.status_code == 409

    await _login(client, "kid", "1234")
    mine = (await client.get("/api/tasks/suggestions")).json()
    assert mine[0]["status"] == "approved" and mine[0]["task_id"] == task["id"]
    assert (await client.post(f"/api/tasks/suggestions/{suggestion['id']}/reject", json={})).status_code == 403


async def test_adult_declines_suggestion_with_note(client):
    await _setup(client)
    await _login(client, "kid", "1234")
    sid = (await client.post("/api/tasks/suggestions", json={"title": "Spela tv-spel"})).json()["id"]
    await _login(client, "admin", "secret123")
    rejected = await client.post(f"/api/tasks/suggestions/{sid}/reject", json={"note": "Det är ingen syssla 😄"})
    assert rejected.json()["status"] == "rejected"
    await _login(client, "kid", "1234")
    assert (await client.get("/api/tasks/suggestions")).json()[0]["review_note"] == "Det är ingen syssla 😄"


async def test_allowance_point_goal(client):
    kid_id = await _setup(client)
    task = (await client.post("/api/tasks", json={"title": "Dammsuga", "recurrence": "daily", "points": 30})).json()
    rate = await client.put(
        f"/api/allowance/children/{kid_id}/rate",
        json={"mode": "goal", "min_points": 50, "amount": 100, "period": "week"},
    )
    assert rate.status_code == 200, rate.text
    body = rate.json()
    assert body["mode"] == "goal" and body["min_points"] == 50 and body["amount"] == 100
    assert body["period_reached"] is False

    await _login(client, "kid", "1234")
    await client.post(f"/api/tasks/{task['id']}/complete")
    me = (await client.get("/api/allowance/me")).json()
    # 30 of 50 points: the week's 100 kr are not earned yet.
    assert me["period_points"] == 30 and me["period_reached"] is False
    assert me["period_earned"] == 0 and me["balance"] == 0

    await _login(client, "admin", "secret123")
    second = (await client.post("/api/tasks", json={"title": "Diska", "recurrence": "daily", "points": 25})).json()
    await _login(client, "kid", "1234")
    await client.post(f"/api/tasks/{second['id']}/complete")
    me = (await client.get("/api/allowance/me")).json()
    assert me["period_points"] == 55 and me["period_reached"] is True
    assert me["period_earned"] == 100 and me["balance"] == 100


async def test_goal_mode_needs_points_and_amount(client):
    kid_id = await _setup(client)
    bad = await client.put(f"/api/allowance/children/{kid_id}/rate", json={"mode": "goal", "min_points": 50})
    assert bad.status_code == 422


async def test_points_mode_reports_the_period(client):
    kid_id = await _setup(client)
    task = (await client.post("/api/tasks", json={"title": "Bädda", "recurrence": "daily", "points": 40})).json()
    await client.put(f"/api/allowance/children/{kid_id}/rate", json={"points_per_unit": 10, "period": "month"})
    await _login(client, "kid", "1234")
    await client.post(f"/api/tasks/{task['id']}/complete")
    await _login(client, "admin", "secret123")
    item = (await client.get("/api/allowance/overview")).json()[0]
    assert item["mode"] == "points" and item["period"] == "month"
    assert item["period_points"] == 40 and item["period_earned"] == 4.0 and item["period_reached"] is True


async def test_goal_does_not_take_back_earlier_weeks(client, db_session):
    from app.models import TaskCompletion

    kid_id = await _setup(client)
    task = (await client.post("/api/tasks", json={"title": "Bädda", "recurrence": "daily", "points": 20})).json()
    await client.put(f"/api/allowance/children/{kid_id}/rate", json={"points_per_unit": 10})
    # 20 points two weeks ago, before any goal existed.
    old = date.today() - timedelta(days=14)
    db_session.add(TaskCompletion(
        family_id=uuid.UUID((await client.get("/api/auth/me")).json()["family_id"]),
        task_id=uuid.UUID(task["id"]),
        user_id=uuid.UUID(kid_id),
        completed_date=old, points_awarded=20, status="approved",
        created_at=datetime.combine(old, datetime.min.time(), tzinfo=timezone.utc),
    ))
    await db_session.commit()
    await client.put(
        f"/api/allowance/children/{kid_id}/rate",
        json={"mode": "goal", "points_per_unit": 10, "min_points": 100, "amount": 50},
    )
    overview = (await client.get("/api/allowance/overview")).json()
    assert overview[0]["balance"] == 2.0


async def test_family_reward_unlocks_from_everyones_points(client):
    await _setup(client)
    created = await client.post("/api/rewards", json={"title": "Bowling", "points_required": 40})
    assert created.status_code == 201
    reward = created.json()
    assert reward["points"] == 0 and reward["unlocked_at"] is None
    task = (await client.post("/api/tasks", json={"title": "Diska", "recurrence": "daily", "points": 25})).json()
    other = (await client.post("/api/tasks", json={"title": "Sopor", "recurrence": "daily", "points": 25})).json()

    assert (await client.post(f"/api/rewards/{reward['id']}/redeem")).status_code == 409
    await client.post(f"/api/tasks/{task['id']}/complete")  # admin: 25
    assert (await client.get("/api/rewards")).json()[0]["points"] == 25

    await _login(client, "kid", "1234")
    assert (await client.post("/api/rewards", json={"title": "Glass", "points_required": 5})).status_code == 403
    await client.post(f"/api/tasks/{other['id']}/complete")  # kid: 25 → 50 ≥ 40
    goal = (await client.get("/api/rewards")).json()[0]
    assert goal["unlocked_at"] is not None and goal["points"] == 40

    await _login(client, "adult", "1234")
    done = await client.post(f"/api/rewards/{reward['id']}/redeem")
    assert done.status_code == 200 and done.json()["redeemed_at"] is not None


async def test_family_reward_with_child_approval_counts_after_approval(client):
    await _setup(client, child_approval=True)
    reward = (await client.post("/api/rewards", json={"title": "Pizza", "points_required": 10})).json()
    task = (await client.post("/api/tasks", json={"title": "Plocka undan", "recurrence": "daily", "points": 10})).json()
    await _login(client, "kid", "1234")
    await client.post(f"/api/tasks/{task['id']}/complete")
    assert (await client.get("/api/rewards")).json()[0]["unlocked_at"] is None

    await _login(client, "adult", "1234")
    completion_id = (await client.get("/api/tasks/approvals")).json()[0]["completion_id"]
    await client.post(f"/api/tasks/approvals/{completion_id}", json={"action": "approve"})
    assert (await client.get("/api/rewards")).json()[0]["id"] == reward["id"]
    assert (await client.get("/api/rewards")).json()[0]["unlocked_at"] is not None

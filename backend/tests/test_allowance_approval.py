"""Children's tasks need approval by default; allowance in points per unit of money."""
import pytest

pytestmark = pytest.mark.asyncio


async def _setup(client):
    resp = await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "A", "display_name": "Admin", "username": "admin", "password": "secret123"},
    )
    assert resp.status_code == 201
    kid = await client.post(
        "/api/family/members", json={"display_name": "Kid", "username": "kid", "password": "1234", "role": "child"}
    )
    adult = await client.post(
        "/api/family/members", json={"display_name": "Adult", "username": "adult", "password": "1234", "role": "adult"}
    )
    assert kid.status_code == 201 and adult.status_code == 201
    return kid.json()["id"]


async def _login(client, username, password):
    await client.post("/api/auth/logout")
    assert (await client.post("/api/auth/login", json={"username": username, "password": password})).status_code == 200


async def test_child_completion_waits_for_approval_by_default(client):
    kid_id = await _setup(client)
    assert (await client.get("/api/allowance/settings")).json()["child_approval"] is True
    task = (await client.post("/api/tasks", json={"title": "Bädda", "recurrence": "daily", "points": 20})).json()
    assert task["requires_approval"] is False

    await _login(client, "kid", "1234")
    done = await client.post(f"/api/tasks/{task['id']}/complete")
    assert done.json()["completion_status"] == "pending"
    me = (await client.get("/api/allowance/me")).json()
    assert me["points_pending"] == 20 and me["points_lifetime"] == 0

    # Adults (not only the admin) see and handle the approval.
    await _login(client, "adult", "1234")
    approvals = (await client.get("/api/tasks/approvals")).json()
    assert [a["user_id"] for a in approvals] == [kid_id]


async def test_family_can_turn_child_approval_off(client):
    await _setup(client)
    assert (await client.patch("/api/allowance/settings", json={"child_approval": False})).status_code == 200
    task = (await client.post("/api/tasks", json={"title": "Diska", "recurrence": "daily"})).json()
    await _login(client, "kid", "1234")
    assert (await client.post(f"/api/tasks/{task['id']}/complete")).json()["completion_status"] == "approved"


async def test_points_per_unit_rate_set_by_adult(client):
    kid_id = await _setup(client)
    await client.patch("/api/allowance/settings", json={"child_approval": False})
    task = (await client.post("/api/tasks", json={"title": "Dammsuga", "recurrence": "daily", "points": 25})).json()

    # How a child earns it is a family setting (2.8.2): an adult needs the admin's leave.
    adult_id = next(m["id"] for m in (await client.get("/api/family/members")).json() if m["username"] == "adult")
    await _login(client, "adult", "1234")
    assert (await client.put(f"/api/allowance/children/{kid_id}/rate", json={"points_per_unit": 10})).status_code == 403
    await _login(client, "admin", "secret123")
    await client.patch(f"/api/family/members/{adult_id}", json={"can_manage_family": True})
    await _login(client, "adult", "1234")
    rate = await client.put(f"/api/allowance/children/{kid_id}/rate", json={"points_per_unit": 10})
    assert rate.status_code == 200
    assert rate.json()["points_per_unit"] == 10

    await _login(client, "kid", "1234")
    await client.post(f"/api/tasks/{task['id']}/complete")
    me = (await client.get("/api/allowance/me")).json()
    assert me["points_lifetime"] == 25
    assert me["earned_lifetime"] == 2.5
    assert me["balance"] == 2.5
    assert (await client.put(f"/api/allowance/children/{kid_id}/rate", json={"points_per_unit": 1})).status_code == 403

    await _login(client, "adult", "1234")
    assert (await client.post("/api/allowance/payouts", json={"user_id": kid_id, "amount": 2})).status_code == 201
    overview = (await client.get("/api/allowance/overview")).json()
    assert overview[0]["balance"] == 0.5
    payouts = (await client.get(f"/api/allowance/payouts?user_id={kid_id}")).json()
    assert [p["amount"] for p in payouts] == [2.0]

    await _login(client, "kid", "1234")
    assert [p["amount"] for p in (await client.get("/api/allowance/payouts")).json()] == [2.0]

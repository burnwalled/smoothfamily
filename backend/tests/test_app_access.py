"""Per-member app access (enforced with 403) and per-vehicle visibility."""
import pytest

from app.apps import APPS

pytestmark = pytest.mark.asyncio


async def _family(client):
    resp = await client.post(
        "/api/auth/setup",
        json={
            "email": "admin@example.com",
            "family_name": "Access Family",
            "display_name": "Admin",
            "username": "admin",
            "password": "secret123",
        },
    )
    assert resp.status_code == 201
    ids = {}
    for username, role in [("adult1", "adult"), ("kid1", "child")]:
        resp = await client.post(
            "/api/family/members",
            json={"display_name": username, "username": username, "password": "pass1234", "role": role},
        )
        assert resp.status_code == 201
        ids[username] = resp.json()["id"]
    return ids


async def _login(client, username, password="pass1234"):
    resp = await client.post("/api/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200


async def test_role_defaults_and_admin_always_has_everything(client):
    await _family(client)
    me = (await client.get("/api/auth/me")).json()
    assert "vehicles" in me["apps"] and "property" in me["apps"]

    await _login(client, "kid1")
    me = (await client.get("/api/auth/me")).json()
    assert me["app_access"] is None
    assert "vehicles" not in me["apps"] and "property" not in me["apps"]
    assert "tasks" in me["apps"]
    assert (await client.get("/api/vehicles")).status_code == 403
    assert (await client.get("/api/property/properties")).status_code == 403
    assert (await client.get("/api/tasks/today")).status_code == 200


async def test_admin_sets_apps_per_member(client):
    ids = await _family(client)
    resp = await client.put(f"/api/family/members/{ids['adult1']}/apps", json={"apps": ["calendar", "chat"]})
    assert resp.status_code == 200
    assert resp.json()["apps"] == ["calendar", "chat"]

    # Admins can't be limited, so they can't lock themselves out.
    me = (await client.get("/api/auth/me")).json()
    await client.put(f"/api/family/members/{me['id']}/apps", json={"apps": []})
    assert len((await client.get("/api/auth/me")).json()["apps"]) == len(APPS)

    await _login(client, "adult1")
    assert (await client.get("/api/chat/conversations")).status_code == 200
    assert (await client.get("/api/tasks/today")).status_code == 403
    assert (await client.get("/api/lists")).status_code == 403
    assert (await client.get("/api/meals/plan")).status_code == 403
    # Today and the profile always work.
    assert (await client.get("/api/auth/me")).status_code == 200
    assert (await client.get("/api/dashboard/widgets")).status_code == 200
    # Only the admin decides.
    assert (await client.put(f"/api/family/members/{ids['kid1']}/apps", json={"apps": []})).status_code == 403


async def test_back_to_role_default_and_unknown_apps_rejected(client):
    ids = await _family(client)
    await client.put(f"/api/family/members/{ids['kid1']}/apps", json={"apps": ["vehicles"]})
    resp = await client.put(f"/api/family/members/{ids['kid1']}/apps", json={"apps": None})
    assert resp.json()["app_access"] is None
    assert "vehicles" not in resp.json()["apps"]
    resp = await client.put(f"/api/family/members/{ids['kid1']}/apps", json={"apps": ["today", "banking"]})
    assert resp.status_code == 422


async def test_calendar_subscription_feed_needs_no_session(client):
    await _family(client)
    token = (await client.get("/api/calendar/ical/token")).json()["token"]
    client.cookies.clear()
    assert (await client.get(f"/api/calendar/ical/{token}.ics")).status_code == 200
    assert (await client.get("/api/calendar/ical/token")).status_code == 401


async def test_vehicle_visible_only_to_allowed_members(client):
    ids = await _family(client)
    car = (await client.post("/api/vehicles", json={"name": "Volvo", "registration": "ABC123"})).json()
    bike = (await client.post("/api/vehicles", json={"name": "Moped", "registration": "XYZ9"})).json()
    expense = {"vehicle_id": car["id"], "name": "Fuel", "amount": 500, "expense_date": "2026-10-01", "category": "fuel"}
    assert (await client.post("/api/vehicles/expenses", json=expense)).status_code == 201

    resp = await client.put(f"/api/vehicles/{car['id']}/access", json={"allowed_user_ids": [ids["kid1"]]})
    assert resp.status_code == 200
    assert resp.json()["allowed_user_ids"] == [ids["kid1"]]

    await _login(client, "adult1")
    assert [v["name"] for v in (await client.get("/api/vehicles")).json()] == ["Moped"]
    assert (await client.get("/api/vehicles/expenses")).json() == []
    assert (await client.get(f"/api/vehicles/expenses?vehicle_id={car['id']}")).json() == []
    assert (await client.get("/api/vehicles/summary")).json()["total_expenses"] == 0
    assert (await client.patch(f"/api/vehicles/{car['id']}", json={"name": "Mine", "registration": "ABC123"})).status_code == 404
    assert (await client.post("/api/vehicles/expenses", json=expense)).status_code == 404
    assert (await client.put(f"/api/vehicles/{bike['id']}/access", json={"allowed_user_ids": []})).status_code == 403

    # The child is allowed the car, but needs the Vehicles app too.
    await _login(client, "admin", "secret123")
    await client.put(f"/api/family/members/{ids['kid1']}/apps", json={"apps": ["vehicles"]})
    await _login(client, "kid1")
    names = sorted(v["name"] for v in (await client.get("/api/vehicles")).json())
    assert names == ["Moped", "Volvo"]
    assert len((await client.get("/api/vehicles/expenses")).json()) == 1


async def test_menu_grouping_is_a_personal_choice(client):
    await _family(client)
    me = (await client.get("/api/auth/me")).json()
    assert me["nav_group_mobile"] is False and me["nav_group_desktop"] is True
    me = (await client.patch("/api/auth/me", json={"nav_group_mobile": True, "nav_group_desktop": False})).json()
    assert me["nav_group_mobile"] is True and me["nav_group_desktop"] is False

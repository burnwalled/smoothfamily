"""2.8.0: the admin lets chosen adults change the family's settings; the server's own settings are
for the server admin."""
import pytest

pytestmark = pytest.mark.asyncio


async def test_an_adult_the_admin_lets(client):
    await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123"},
    )
    erik = (await client.post("/api/family/members", json={"display_name": "Erik", "username": "erik", "password": "pass1234", "role": "adult"})).json()
    leo = (await client.post("/api/family/members", json={"display_name": "Leo", "username": "leo", "password": "pass1234", "role": "child"})).json()
    assert (await client.patch(f"/api/family/members/{leo['id']}", json={"can_manage_family": True})).status_code == 422

    assert (await client.post("/api/auth/login", json={"username": "erik", "password": "pass1234"})).status_code == 200
    assert (await client.get("/api/auth/me")).json()["can_manage_family"] is False
    assert (await client.put("/api/dashboard/sources/electricity", json={"area": "SE3"})).status_code == 403
    assert (await client.get("/api/kiosks")).status_code == 403

    assert (await client.post("/api/auth/login", json={"username": "admin", "password": "secret123"})).status_code == 200
    assert (await client.patch(f"/api/family/members/{erik['id']}", json={"can_manage_family": True})).json()["can_manage_family"] is True

    assert (await client.post("/api/auth/login", json={"username": "erik", "password": "pass1234"})).status_code == 200
    assert (await client.get("/api/auth/me")).json()["can_manage_family"] is True
    assert (await client.put("/api/dashboard/sources/electricity", json={"area": "SE3"})).status_code == 200
    assert (await client.get("/api/kiosks")).status_code == 200
    # Still the admin's: the members, and the server's own settings.
    assert (await client.patch(f"/api/family/members/{leo['id']}", json={"display_name": "Leon"})).status_code == 403
    assert (await client.put("/api/admin/integrations/giphy", json={"api_key": "x"})).status_code == 403
    assert (await client.get("/api/admin/storage")).status_code == 403


async def test_the_server_admin_sets_the_security_rules(client):
    await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123", "totp_policy": "optional"},
    )
    rules = (await client.get("/api/admin/security-policy")).json()
    assert rules == {"passkeys_enabled": True, "totp_policy": "optional", "password_min_adult": 4, "password_min_child": 4}
    changed = await client.put("/api/admin/security-policy", json={"passkeys_enabled": False, "totp_policy": "required", "password_min_adult": 10, "password_min_child": 6})
    assert changed.status_code == 200
    # Every family follows; the family sees it.
    sec = (await client.get("/api/auth/security")).json()
    assert sec["passkeys_enabled"] is False and sec["totp_policy"] == "required"
    # The password rule wherever one is set.
    assert (await client.post("/api/family/members", json={"display_name": "Erik", "username": "erik", "password": "short123", "role": "adult"})).status_code == 422
    assert (await client.post("/api/family/members", json={"display_name": "Leo", "username": "leo", "password": "12345", "role": "child"})).status_code == 422
    leo = await client.post("/api/family/members", json={"display_name": "Leo", "username": "leo", "password": "123456", "role": "child"})
    assert leo.status_code == 201
    assert (await client.post(f"/api/family/members/{leo.json()['id']}/password", json={"password": "1234"})).status_code == 422
    assert (await client.post("/api/auth/me/password", json={"current_password": "secret123", "new_password": "secret12"})).status_code == 422
    # Only the server admin.
    assert (await client.post("/api/family/members", json={"display_name": "Erik", "username": "erik", "password": "longenough1", "role": "adult"})).status_code == 201
    # (Two-step codes off again, so Erik signs straight in.)
    await client.put("/api/admin/security-policy", json={"passkeys_enabled": False, "totp_policy": "off", "password_min_adult": 10, "password_min_child": 6})
    assert "id" in (await client.post("/api/auth/login", json={"username": "erik", "password": "longenough1"})).json()
    assert (await client.put("/api/admin/security-policy", json={"passkeys_enabled": True, "totp_policy": "off", "password_min_adult": 4, "password_min_child": 4})).status_code == 403
    assert (await client.put("/api/auth/policy", json={"passkeys_enabled": True, "totp_policy": "off"})).status_code == 403

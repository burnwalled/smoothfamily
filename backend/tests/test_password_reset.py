"""Admin password reset for family members."""
import pytest

pytestmark = pytest.mark.asyncio


async def _setup(client):
    resp = await client.post(
        "/api/auth/setup",
        json={"email": "admin@example.com", "family_name": "Reset Family", "display_name": "Admin", "username": "admin", "password": "secret123"},
    )
    assert resp.status_code == 201, resp.text


async def _login(client, username, password):
    return await client.post("/api/auth/login", json={"username": username, "password": password})


async def test_admin_resets_member_password(client):
    await _setup(client)
    kid = await client.post(
        "/api/family/members",
        json={"display_name": "Kid", "username": "kid", "password": "1234", "role": "child"},
    )
    kid_id = kid.json()["id"]

    resp = await client.post(f"/api/family/members/{kid_id}/password", json={"password": "newpass"})
    assert resp.status_code == 204

    assert (await _login(client, "kid", "1234")).status_code == 401
    assert (await _login(client, "kid", "newpass")).status_code == 200


async def test_non_admin_cannot_reset(client):
    await _setup(client)
    adult = await client.post(
        "/api/family/members",
        json={"display_name": "Adult", "username": "adult", "password": "adultpw", "role": "adult"},
    )
    me = await client.get("/api/auth/me")
    admin_id = me.json()["id"]
    assert adult.status_code == 201

    assert (await _login(client, "adult", "adultpw")).status_code == 200
    resp = await client.post(f"/api/family/members/{admin_id}/password", json={"password": "hacked"})
    assert resp.status_code == 403


async def test_reset_validates_length_and_unknown_member(client):
    await _setup(client)
    me = (await client.get("/api/auth/me")).json()
    short = await client.post(f"/api/family/members/{me['id']}/password", json={"password": "abc"})
    assert short.status_code == 422
    missing = await client.post(
        "/api/family/members/00000000-0000-0000-0000-000000000000/password", json={"password": "longenough"}
    )
    assert missing.status_code == 404

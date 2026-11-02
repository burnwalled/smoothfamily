"""Hardening for internet exposure: setup code and login brute-force protection."""
import pytest

from app.config import get_settings
from app.services import login_throttle

pytestmark = pytest.mark.asyncio

SETUP = {"email": "admin@example.com", "family_name": "Prod", "display_name": "Admin", "username": "admin", "password": "secret123"}


@pytest.fixture
def setup_code(monkeypatch):
    # get_settings() is cached; monkeypatch restores the field after the test.
    monkeypatch.setattr(get_settings(), "setup_code", "s3cret-code")
    return "s3cret-code"


async def test_setup_requires_code_when_configured(client, setup_code):
    status = (await client.get("/api/auth/setup")).json()
    assert status["needs_setup"] is True and status["requires_code"] is True

    assert (await client.post("/api/auth/setup", json=SETUP)).status_code == 403
    assert (await client.post("/api/auth/setup", json={**SETUP, "setup_code": "wrong"})).status_code == 403
    ok = await client.post("/api/auth/setup", json={**SETUP, "setup_code": setup_code})
    assert ok.status_code == 201

    after = (await client.get("/api/auth/setup")).json()
    assert after["needs_setup"] is False and after["requires_code"] is False


async def test_setup_without_code_in_dev(client):
    assert (await client.get("/api/auth/setup")).json()["requires_code"] is False
    assert (await client.post("/api/auth/setup", json=SETUP)).status_code == 201


async def test_login_locks_after_repeated_failures(client):
    await client.post("/api/auth/setup", json=SETUP)
    await client.post("/api/auth/logout")

    for _ in range(login_throttle.MAX_FAILURES_PER_USER):
        resp = await client.post("/api/auth/login", json={"username": "admin", "password": "guess"})
        assert resp.status_code == 401

    locked = await client.post("/api/auth/login", json={"username": "ADMIN", "password": "secret123"})
    assert locked.status_code == 429
    assert int(locked.headers["retry-after"]) > 0


async def test_ip_limit_spans_usernames(client):
    await client.post("/api/auth/setup", json=SETUP)
    await client.post("/api/auth/logout")
    headers = {"X-Forwarded-For": "203.0.113.7"}
    for i in range(login_throttle.MAX_FAILURES_PER_IP):
        await client.post("/api/auth/login", json={"username": f"user{i}", "password": "x"}, headers=headers)

    blocked = await client.post("/api/auth/login", json={"username": "admin", "password": "secret123"}, headers=headers)
    assert blocked.status_code == 429
    other_ip = await client.post(
        "/api/auth/login", json={"username": "admin", "password": "secret123"}, headers={"X-Forwarded-For": "198.51.100.1"}
    )
    assert other_ip.status_code == 200


async def test_successful_login_clears_user_failures(client):
    await client.post("/api/auth/setup", json=SETUP)
    await client.post("/api/auth/logout")
    for _ in range(login_throttle.MAX_FAILURES_PER_USER - 1):
        await client.post("/api/auth/login", json={"username": "admin", "password": "guess"})
    assert (await client.post("/api/auth/login", json={"username": "admin", "password": "secret123"})).status_code == 200
    assert (await client.post("/api/auth/login", json={"username": "admin", "password": "guess"})).status_code == 401


async def test_setup_requires_valid_email_and_profile_can_change_it(client):
    no_email = {k: v for k, v in SETUP.items() if k != "email"}
    assert (await client.post("/api/auth/setup", json=no_email)).status_code == 422
    assert (await client.post("/api/auth/setup", json={**SETUP, "email": "not-an-email"})).status_code == 422
    me = (await client.post("/api/auth/setup", json=SETUP)).json()
    assert me["email"] == "admin@example.com"

    changed = await client.patch("/api/auth/me", json={"email": "someone@example.com"})
    assert changed.json()["email"] == "someone@example.com"
    cleared = await client.patch("/api/auth/me", json={"email": ""})
    assert cleared.json()["email"] is None


async def test_push_contact_uses_admin_email(client, db_session):
    import uuid

    from app.services.push import vapid_subject

    me = (await client.post("/api/auth/setup", json=SETUP)).json()
    assert await vapid_subject(db_session, uuid.UUID(me["id"])) == "mailto:admin@example.com"

    await client.patch("/api/auth/me", json={"email": ""})
    db_session.expire_all()
    subject = await vapid_subject(db_session, uuid.UUID(me["id"]))
    assert subject.startswith("mailto:noreply@") or subject.startswith("https://")

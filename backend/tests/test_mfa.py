"""Passkeys and authenticator-app (TOTP) sign-in with a per-family policy."""
import time

import pyotp
import pytest

pytestmark = pytest.mark.asyncio

ORIGIN = {"Origin": "http://localhost:3000"}


async def _setup(client, **policy):
    resp = await client.post(
        "/api/auth/setup",
        json={"email": "admin@example.com", "family_name": "Secure", "display_name": "Admin", "username": "admin", "password": "secret123", **policy},
    )
    assert resp.status_code == 201, resp.text
    kid = await client.post(
        "/api/family/members",
        json={"display_name": "Kid", "username": "kid", "password": "1234", "role": "child"},
    )
    return kid.json()


def _code(secret: str, steps_ahead: int = 0) -> str:
    # Each accepted code burns its 30 s step, so later checks use the next step.
    return pyotp.TOTP(secret).at(time.time() + 30 * steps_ahead)


async def _enroll(client) -> str:
    setup = (await client.post("/api/auth/totp/setup")).json()
    assert setup["otpauth_uri"].startswith("otpauth://totp/") and "<svg" in setup["qr_svg"]
    assert (await client.post("/api/auth/totp/enable", json={"code": _code(setup["secret"])})).status_code == 204
    return setup["secret"]


async def _login(client, username="admin", password="secret123"):
    await client.post("/api/auth/logout")
    return await client.post("/api/auth/login", json={"username": username, "password": password})


async def test_setup_stores_policy(client):
    await _setup(client, passkeys_enabled=False, totp_policy="required")
    sec = (await client.get("/api/auth/security")).json()
    assert sec["passkeys_enabled"] is False and sec["totp_policy"] == "required" and sec["totp_required"] is True
    assert (await client.get("/api/auth/setup")).json()["passkeys_enabled"] is False


async def test_totp_login_flow_and_replay_protection(client):
    await _setup(client)
    secret = await _enroll(client)
    assert (await client.get("/api/auth/security")).json()["totp_enabled"] is True

    first = await _login(client)
    assert first.status_code == 200 and first.json()["mfa_required"] is True
    assert "smooth_session" not in first.cookies
    assert (await client.get("/api/auth/me")).status_code == 401
    token = first.json()["mfa_token"]

    wrong = await client.post("/api/auth/login/totp", json={"mfa_token": token, "code": "000000"})
    assert wrong.status_code == 401
    code = _code(secret, 1)
    ok = await client.post("/api/auth/login/totp", json={"mfa_token": token, "code": code})
    assert ok.status_code == 200 and ok.json()["username"] == "admin"
    assert (await client.get("/api/auth/me")).status_code == 200

    # The same code can't be used again.
    token2 = (await _login(client)).json()["mfa_token"]
    assert (await client.post("/api/auth/login/totp", json={"mfa_token": token2, "code": code})).status_code == 401


async def test_mfa_token_is_not_a_session(client):
    await _setup(client)
    await _enroll(client)
    token = (await _login(client)).json()["mfa_token"]
    client.cookies.set("smooth_session", token)
    assert (await client.get("/api/auth/me")).status_code == 401


async def test_required_policy_forces_enrolment_but_not_for_children(client):
    await _setup(client, totp_policy="required")
    kid_login = await _login(client, "kid", "1234")
    assert kid_login.json().get("username") == "kid"

    challenge = (await _login(client)).json()
    assert challenge["totp_setup_required"] is True
    setup = await client.post("/api/auth/login/totp/setup", json={"mfa_token": challenge["mfa_token"]})
    assert setup.status_code == 200
    done = await client.post(
        "/api/auth/login/totp/enable", json={"mfa_token": challenge["mfa_token"], "code": _code(setup.json()["secret"])}
    )
    assert done.status_code == 200
    assert (await client.post("/api/auth/totp/disable", json={"code": "123456"})).status_code == 403


async def test_policy_off_skips_codes(client):
    await _setup(client)
    await _enroll(client)
    assert (await client.put("/api/auth/policy", json={"passkeys_enabled": True, "totp_policy": "off"})).status_code == 200

    direct = await _login(client)
    assert direct.json().get("username") == "admin"  # session right away, no code step
    assert (await client.get("/api/auth/security")).json()["totp_enabled"] is False


async def test_admin_resets_member_mfa(client):
    kid = await _setup(client)
    await _login(client, "kid", "1234")
    await _enroll(client)
    await _login(client)  # admin has no authenticator -> direct session
    assert (await client.post(f"/api/family/members/{kid['id']}/reset-mfa")).status_code == 204
    kid_login = await _login(client, "kid", "1234")
    assert kid_login.json().get("username") == "kid"


async def test_passkey_options(client):
    await _setup(client)
    reg = await client.post("/api/auth/passkeys/register/options", headers=ORIGIN)
    assert reg.status_code == 200
    options = reg.json()["options"]
    assert options["rp"]["id"] == "localhost"
    assert options["authenticatorSelection"]["residentKey"] == "required"

    bad = await client.post(
        "/api/auth/passkeys/register/verify",
        headers=ORIGIN,
        json={"challenge_id": reg.json()["challenge_id"], "credential": {"id": "x"}, "name": "Phone"},
    )
    assert bad.status_code == 400
    # Challenges are single use.
    again = await client.post(
        "/api/auth/passkeys/register/verify",
        headers=ORIGIN,
        json={"challenge_id": reg.json()["challenge_id"], "credential": {"id": "x"}, "name": "Phone"},
    )
    assert again.status_code == 400

    login_opts = await client.post("/api/auth/passkeys/login/options", headers=ORIGIN)
    assert login_opts.status_code == 200 and login_opts.json()["options"]["rpId"] == "localhost"
    unknown = await client.post(
        "/api/auth/passkeys/login/verify",
        headers=ORIGIN,
        json={"challenge_id": login_opts.json()["challenge_id"], "credential": {"rawId": "AAAA"}},
    )
    assert unknown.status_code == 401


async def test_passkeys_disabled(client):
    await _setup(client, passkeys_enabled=False)
    assert (await client.post("/api/auth/passkeys/register/options", headers=ORIGIN)).status_code == 404
    assert (await client.post("/api/auth/passkeys/login/options", headers=ORIGIN)).status_code == 404


async def test_admin_policy_update(client):
    await _setup(client)
    resp = await client.put("/api/auth/policy", json={"passkeys_enabled": False, "totp_policy": "off"})
    assert resp.status_code == 200
    sec = (await client.get("/api/auth/security")).json()
    assert sec["passkeys_enabled"] is False and sec["totp_policy"] == "off"
    await _login(client, "kid", "1234")
    assert (await client.put("/api/auth/policy", json={"passkeys_enabled": True, "totp_policy": "off"})).status_code == 403

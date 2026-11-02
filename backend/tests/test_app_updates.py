"""3.3.0: Smooth Family updating itself – a signed manifest per build; the stable channel trusts only
the stable key, the beta channel both; the images are planned by digest, never a newer-looking
version from an untrusted signature."""
import base64
import json

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from app.services import app_updates, updates

pytestmark = pytest.mark.asyncio
BACKEND = "ghcr.io/burnwalled/smoothfamily-backend@sha256:" + "a" * 64
FRONTEND = "ghcr.io/burnwalled/smoothfamily-frontend@sha256:" + "b" * 64


def _key():
    key = Ed25519PrivateKey.generate()
    public = base64.b64encode(key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)).decode()
    return key, public


@pytest.fixture
def keys(monkeypatch):
    stable, stable_pub = _key()
    beta, beta_pub = _key()
    monkeypatch.setattr(app_updates, "STABLE_PUBLIC_KEY", stable_pub)
    monkeypatch.setattr(app_updates, "BETA_PUBLIC_KEY", beta_pub)
    monkeypatch.setenv("APP_BUILD", "1" * 40)
    monkeypatch.setattr(app_updates, "__version__", "3.3.0-beta.1")
    return {"stable": stable, "beta": beta}


def _signed(key, which, **over):
    manifest = {"product": "smooth-family", "channel": "beta", "version": "3.3.0-beta.2", "build": 7, "commit": "2" * 40,
                "built_at": "2026-11-03T10:00:00+00:00", "images": {"backend": BACKEND, "frontend": FRONTEND}, **over}
    data = json.dumps(manifest).encode()
    sig = json.dumps({"key": which, "signature": base64.b64encode(key.sign(data)).decode()}).encode()
    return data, sig


def _get(pair):
    async def get(channel):
        return pair
    return get


def test_releases_come_after_their_betas():
    k = app_updates.version_key
    assert k("3.3.0-beta.1") < k("3.3.0-beta.2") < k("3.3.0") < k("3.3.1") < k("3.10.0")


async def test_a_beta_build_on_the_beta_channel(keys):
    found = await app_updates.available("beta", get=_get(_signed(keys["beta"], "beta")))
    assert found["version"] == "3.3.0-beta.2" and found["backend"] == BACKEND and found["frontend"] == FRONTEND


async def test_the_stable_channel_trusts_only_the_stable_key(keys):
    # The beta key can't sign for stable, even a manifest that says stable.
    with pytest.raises(app_updates.AppUpdateError):
        await app_updates.available("stable", get=_get(_signed(keys["beta"], "beta", channel="stable", version="3.3.0")))
    found = await app_updates.available("stable", get=_get(_signed(keys["stable"], "stable", channel="stable", version="3.3.0")))
    assert found["version"] == "3.3.0"


async def test_a_wrong_signature_or_image_is_refused(keys):
    data, sig = _signed(keys["beta"], "beta")
    tampered = data.replace(b"3.3.0-beta.2", b"3.3.0-beta.9")
    with pytest.raises(app_updates.AppUpdateError, match="signature"):
        await app_updates.available("beta", get=_get((tampered, sig)))
    other = _signed(keys["beta"], "beta", images={"backend": "evil.example/backend:latest", "frontend": FRONTEND})
    with pytest.raises(app_updates.AppUpdateError, match="digest"):
        await app_updates.available("beta", get=_get(other))


async def test_nothing_older_and_not_what_runs(keys):
    assert await app_updates.available("beta", get=_get(_signed(keys["beta"], "beta", commit="1" * 40))) is None
    assert await app_updates.available("beta", get=_get(_signed(keys["beta"], "beta", version="3.2.1"))) is None


async def test_the_plan_names_the_images_by_digest(keys, client, tmp_path, monkeypatch):
    await client.post("/api/auth/setup", json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123"})
    monkeypatch.setattr(updates, "folder", lambda: tmp_path)
    (tmp_path / "state.json").write_text(json.dumps({"checked_at": "2026-11-03T10:00:00Z", "services": {}}))
    pair = _signed(keys["beta"], "beta")

    async def fetch(channel):
        return pair
    monkeypatch.setattr(app_updates, "fetch", fetch)
    view = (await client.put("/api/admin/updates/settings", json={"mode": "approve", "day": 6, "hour": 4, "channel": "beta"})).json()
    assert view["settings"]["channel"] == "beta"
    view = (await client.post("/api/admin/updates/check")).json()
    assert view["available"]["app"]["version"] == "3.3.0-beta.2" and view["app_version"] == "3.3.0-beta.1"
    assert (await client.post("/api/admin/updates/approve?now=true")).status_code == 200
    plan = (tmp_path / "plan.env").read_text()
    assert BACKEND in plan and FRONTEND in plan


async def test_off_by_default_and_errors_are_shown(client, tmp_path, monkeypatch):
    await client.post("/api/auth/setup", json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123"})
    monkeypatch.setattr(updates, "folder", lambda: tmp_path)
    (tmp_path / "state.json").write_text(json.dumps({"checked_at": "2026-11-03T10:00:00Z", "services": {}}))
    called = []

    async def fetch(channel):
        called.append(channel)
        raise app_updates.AppUpdateError("No stable release yet")
    monkeypatch.setattr(app_updates, "fetch", fetch)
    view = (await client.post("/api/admin/updates/check")).json()
    assert view["settings"]["channel"] == "off" and called == [] and "app" not in view["available"]
    await client.put("/api/admin/updates/settings", json={"mode": "approve", "day": 6, "hour": 4, "channel": "stable"})
    view = (await client.post("/api/admin/updates/check")).json()
    assert view["app_error"] == "No stable release yet"

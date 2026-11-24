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


async def test_the_manifest_goes_with_the_plan_as_it_came(keys, client, tmp_path, monkeypatch):
    """update.sh checks the signature itself (3.5.1), so it gets the very bytes that were signed."""
    await client.post("/api/auth/setup", json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123"})
    monkeypatch.setattr(updates, "folder", lambda: tmp_path)
    (tmp_path / "state.json").write_text(json.dumps({"checked_at": "2026-11-03T10:00:00Z", "script": updates.SCRIPT, "services": {}}))
    pair = _signed(keys["beta"], "beta")

    async def fetch(channel):
        return pair
    monkeypatch.setattr(app_updates, "fetch", fetch)
    await client.put("/api/admin/updates/settings", json={"mode": "approve", "day": 6, "hour": 4, "channel": "beta"})
    view = (await client.post("/api/admin/updates/check")).json()
    # The signed bytes are for update.sh, not for the page.
    assert "app_signed" not in view and "manifest" not in view["available"]["app"] and view["script_outdated"] is False
    assert (await client.post("/api/admin/updates/approve?now=true")).status_code == 200
    assert "CHANNEL=beta\n" in (tmp_path / "plan.env").read_text()
    assert (tmp_path / "manifest.json").read_bytes() == pair[0] and (tmp_path / "manifest.sig").read_bytes() == pair[1]
    # What update.sh then asks of the image that runs: the same answer, from the files alone.
    from app import verify_manifest
    assert verify_manifest.main([str(tmp_path / "manifest.json"), str(tmp_path / "manifest.sig"), "beta", "-"]) == 0

    # Called off: nothing left for the script to take in.
    await client.put("/api/admin/updates/settings", json={"mode": "off", "day": 6, "hour": 4, "channel": "beta"})
    assert not any((tmp_path / name).exists() for name in ("plan.env", "manifest.json", "manifest.sig"))


async def test_what_update_sh_asks_before_it_puts_a_build_in(keys, tmp_path, capsys):
    from app import verify_manifest

    def ask(pair, channel, floor="-"):
        (tmp_path / "m.json").write_bytes(pair[0])
        (tmp_path / "m.sig").write_bytes(pair[1])
        code = verify_manifest.main([str(tmp_path / "m.json"), str(tmp_path / "m.sig"), channel, floor])
        return code, capsys.readouterr()

    beta = _signed(keys["beta"], "beta")
    code, said = ask(beta, "beta")
    assert code == 0 and said.out.splitlines() == ["version=3.3.0-beta.2", "build=7", f"backend={BACKEND}", f"frontend={FRONTEND}"]

    # Newer than anything put in before – the version, then the build within it. An older build that
    # was signed once stays signed, so this is what keeps it from coming back.
    assert ask(beta, "beta", "3.3.0-beta.2:6")[0] == 0
    assert ask(beta, "beta", "3.3.0-beta.1:900")[0] == 0
    for floor in ("3.3.0-beta.2:7", "3.3.0-beta.2:8", "3.3.0:1", "3.4.0-beta.1:1"):
        code, said = ask(beta, "beta", floor)
        assert code == 1 and said.out == "" and "Not newer" in said.err

    # The stable channel takes only what the stable key signed, as in the app.
    assert ask(beta, "stable")[0] == 1
    assert ask(_signed(keys["beta"], "beta", channel="stable", version="3.3.0"), "stable")[0] == 1
    assert ask(_signed(keys["stable"], "stable", channel="stable", version="3.3.0"), "stable")[0] == 0
    # Changed after it was signed, another channel's name, a file that isn't there.
    assert ask((beta[0].replace(b"a" * 64, b"c" * 64), beta[1]), "beta")[0] == 1
    assert ask(beta, "off")[0] == 1
    assert verify_manifest.main([str(tmp_path / "none.json"), str(tmp_path / "m.sig"), "beta", "-"]) == 1
    assert verify_manifest.main(["only", "three", "arguments"]) == 2

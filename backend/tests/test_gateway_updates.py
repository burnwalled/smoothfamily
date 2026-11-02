"""3.0.1: gateways update themselves from the server – but run only what is signed with the family's
own key; the admins hear of a gateway that won't update itself."""
import base64
import hashlib
import importlib.util
import json
import pathlib

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location("sf_gateway_updates", ROOT / "gateway" / "gateway.py")
gw = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gw)


def test_the_release_on_the_server_is_the_signed_gateway():
    """Fails when gateway/gateway.py changed without running scripts/sign-gateway.py."""
    from app.services import gateway_release

    release = gateway_release.release()
    code = gateway_release.program()
    assert code == (ROOT / "gateway" / "gateway.py").read_bytes().replace(b"\r\n", b"\n"), "sign the gateway again"
    assert release["version"] == gw.VERSION and gw.verified(code, release)


def test_a_tampered_or_unsigned_update_is_refused():
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

    from app.services import gateway_release

    release, code = gateway_release.release(), gateway_release.program()
    assert not gw.verified(code + b"\n# extra", release)
    assert not gw.verified(code, {**release, "version": "9.9.9"})
    # Signed with another key – say, by someone who took over the server.
    other = Ed25519PrivateKey.generate()
    forged = code.replace(f'VERSION = "{gw.VERSION}"'.encode(), b'VERSION = "9.9.9"')
    sha = hashlib.sha256(forged).hexdigest()
    signature = base64.b64encode(other.sign(f"smooth-family-gateway\n9.9.9\n{sha}".encode())).decode()
    assert not gw.verified(forged, {"version": "9.9.9", "sha256": sha, "signature": signature})
    # …which is fine with that key's public half (the check itself works).
    public = base64.b64encode(other.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)).decode()
    assert gw.verified(forged, {"version": "9.9.9", "sha256": sha, "signature": signature}, public_key=public)


def test_the_downloaded_version_runs_and_a_broken_one_is_given_up(tmp_path, monkeypatch):
    started = []
    monkeypatch.setattr(gw, "_restart", lambda path, bundled: started.append(str(path)))
    cfg = gw.load_config(environ={"SF_DATA_DIR": str(tmp_path)}, options_file="/nonexistent")
    assert cfg["auto_update"] is True  # on unless turned off
    assert gw.load_config(environ={"SF_AUTO_UPDATE": "false"}, options_file="/nonexistent")["auto_update"] is False

    folder = tmp_path / "update"
    folder.mkdir()
    newer = folder / "gateway.py"
    newer.write_text('VERSION = "99.0.0"\n', encoding="utf-8")
    gw.launch(cfg)
    assert started == [str(newer.resolve())]
    # An older (or same) download than the image's own is just removed.
    started.clear()
    newer.write_text('VERSION = "0.1.0"\n', encoding="utf-8")
    gw.launch(cfg)
    assert started == [] and not newer.exists()

    # A new version that keeps failing to connect: after a few starts the image's own is back, and
    # that version isn't fetched again.
    gw._save_state(cfg, {"trying": "9.9.9", "tries": gw.UPDATE_TRIES})
    newer.write_text("x", encoding="utf-8")
    monkeypatch.setattr(gw, "VERSION", "9.9.9")
    gw.give_up(cfg, "/app/gateway.py")
    assert started == [str(pathlib.Path("/app/gateway.py"))] and not newer.exists()
    assert json.loads((folder / "state.json").read_text())["bad"] == ["9.9.9"]


@pytest.mark.asyncio
async def test_the_release_is_for_paired_gateways_and_old_ones_are_told(client):
    from sqlalchemy import select

    from app.database import SessionLocal
    from app.models import SmarthomeConnection
    from app.routers.gateway import _tell_if_old
    from app.services import gateway, gateway_release

    await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123"},
    )
    code = (await client.post("/api/smarthome/gateways", json={"name": "Stugan"})).json()["code"]
    key = (await client.post("/api/gateway/pair", json={"code": code, "version": "1.1.0"})).json()["key"]

    assert (await client.get("/api/gateway/release")).status_code == 401
    assert (await client.get("/api/gateway/release", headers={"Authorization": "Bearer nope"})).status_code == 401
    auth = {"Authorization": f"Bearer {key}"}
    release = (await client.get("/api/gateway/release", headers=auth)).json()
    assert release == gateway_release.release()
    program = (await client.get("/api/gateway/release/file", headers=auth)).content
    assert gw.verified(program, release)

    [home] = (await client.get("/api/smarthome/connections")).json()
    assert home["version"] == "1.1.0" and home["update_available"] and home["latest_version"] == gw.VERSION

    async with SessionLocal() as db:
        conn = (await db.execute(select(SmarthomeConnection))).scalar_one()
        # One that updates itself isn't worth a notification…
        await _tell_if_old(db, conn, {"auto_update": True})
        assert conn.gateway_update_told is None
        # …one that doesn't is, once per version.
        await _tell_if_old(db, conn, {"auto_update": False})
        await _tell_if_old(db, conn, {"auto_update": False})
        await db.commit()
    kinds = [n["kind"] for n in (await client.get("/api/notifications")).json()]
    assert kinds.count("gateway_update") == 1

    # The server admin sees every gateway and the version it reported.
    overview = (await client.get("/api/admin/updates")).json()["gateways"]
    assert overview["latest"] == gw.VERSION
    assert [(g["home"], g["family"], g["version"], g["up_to_date"]) for g in overview["items"]] == [("Stugan", "F", "1.1.0", False)]

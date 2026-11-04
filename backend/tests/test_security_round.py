"""The security round (3.4.0): what the audit found, each with a test that it's closed."""

import io
import json
import struct
import time
import uuid
import zipfile
import zlib
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.services import safe_fetch
from app.services.access_log import mask


async def _family(client):
    await client.post("/api/auth/setup", json={"email": "a@example.com", "family_name": "Lind", "display_name": "Anna", "username": "admin", "password": "secret123", "language": "sv"})
    ids = {"admin": (await client.get("/api/auth/me")).json()["id"]}
    for name, role in [("bo", "admin"), ("eva", "adult"), ("maja", "child")]:
        ids[name] = (await client.post("/api/family/members", json={"display_name": name.title(), "username": name, "password": "pass1234", "role": role})).json()["id"]
    return ids


async def _as(client, username, password="pass1234"):
    resp = await client.post("/api/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200, resp.text


def _other():
    from app.main import app

    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


# --- C1: the server's admin isn't a family admin's to change ---------------------------------------


async def test_a_family_admin_cannot_take_over_the_servers_admin(client):
    ids = await _family(client)
    await _as(client, "bo")
    server_admin = ids["admin"]
    assert (await client.post(f"/api/family/members/{server_admin}/password", json={"password": "mine-now-123"})).status_code == 403
    assert (await client.post(f"/api/family/members/{server_admin}/reset-mfa")).status_code == 403
    assert (await client.patch(f"/api/family/members/{server_admin}", json={"display_name": "Bo's"})).status_code == 403
    assert (await client.put(f"/api/family/members/{server_admin}/apps", json={"apps": []})).status_code == 403
    # Other members are still theirs to manage, and the server's admin can still change themself.
    assert (await client.post(f"/api/family/members/{ids['eva']}/password", json={"password": "eva-new-123"})).status_code == 204
    await _as(client, "admin", "secret123")
    assert (await client.patch(f"/api/family/members/{server_admin}", json={"display_name": "Anna L"})).status_code == 200
    assert (await client.post("/api/auth/login", json={"username": "admin", "password": "secret123"})).status_code == 200


# --- C4: sessions end --------------------------------------------------------------------------------


async def test_a_new_password_ends_the_other_sessions(client):
    await _family(client)
    await _as(client, "eva")
    elsewhere = _other()
    assert (await elsewhere.post("/api/auth/login", json={"username": "eva", "password": "pass1234"})).status_code == 200
    assert (await elsewhere.get("/api/auth/me")).status_code == 200
    assert (await client.post("/api/auth/me/password", json={"current_password": "pass1234", "new_password": "fresh-pass-1"})).status_code == 204
    # This browser goes on; the other one is signed out.
    assert (await client.get("/api/auth/me")).status_code == 200
    assert (await elsewhere.get("/api/auth/me")).status_code == 401


async def test_an_admins_reset_and_sign_out_everywhere_end_sessions(client):
    ids = await _family(client)
    eva = _other()
    assert (await eva.post("/api/auth/login", json={"username": "eva", "password": "pass1234"})).status_code == 200
    assert (await client.post(f"/api/family/members/{ids['eva']}/password", json={"password": "set-by-admin-1"})).status_code == 204
    assert (await eva.get("/api/auth/me")).status_code == 401

    other = _other()
    assert (await other.post("/api/auth/login", json={"username": "admin", "password": "secret123"})).status_code == 200
    assert (await client.post("/api/auth/logout?everywhere=true")).status_code == 204
    assert (await other.get("/api/auth/me")).status_code == 401
    assert (await client.post("/api/auth/login", json={"username": "admin", "password": "secret123"})).status_code == 200


# --- C5: the server fetches only public addresses -------------------------------------------------------


async def test_only_public_addresses_are_fetched():
    for url in ("http://127.0.0.1:9/x.ics", "http://10.0.0.5/", "http://192.168.1.86:5000/webapi/", "http://[::1]/", "http://169.254.169.254/latest/", "ftp://example.com/x", "http://localhost/"):
        with pytest.raises(safe_fetch.UnsafeAddress):
            await safe_fetch.safe_get(url, 1000)


async def test_a_feed_at_a_home_address_is_refused(client):
    from app.services.ical import fetch_ical_raw

    with pytest.raises(httpx.HTTPError):
        await fetch_ical_raw("http://192.168.1.86:5000/webman/index.cgi")
    await _family(client)
    # The feed can still be added (the address isn't fetched then), but it yields nothing and no request.
    assert (await client.post("/api/calendar/feeds", json={"name": "x", "url": "http://10.0.0.1/cal.ics"})).status_code == 201
    assert (await client.post("/api/calendar/feeds", json={"name": "x", "url": "https://example.com/" + "a" * 2100})).status_code == 422


# --- C9: a feed's address is its owner's; others see what they may ---------------------------------------


async def test_feeds_keep_their_address_and_settings_to_their_owner(client):
    ids = await _family(client)
    await _as(client, "eva")
    feed = (await client.post("/api/calendar/feeds", json={"name": "Jobbet", "url": "https://calendar.example.com/secret-abc.ics", "visible_to": [ids["eva"], ids["maja"]]})).json()
    assert feed["url"].endswith("secret-abc.ics") and feed["can_edit"] is True
    await _as(client, "maja")
    seen = (await client.get("/api/calendar/feeds")).json()
    assert [f["name"] for f in seen] == ["Jobbet"]
    assert seen[0]["url"] == "" and seen[0]["can_edit"] is False
    assert (await client.patch(f"/api/calendar/feeds/{feed['id']}", json={"visible_to": []})).status_code == 403
    assert (await client.delete(f"/api/calendar/feeds/{feed['id']}")).status_code == 403
    await _as(client, "bo")  # not among visible_to, but an admin
    assert (await client.get("/api/calendar/feeds")).json()[0]["url"].endswith("secret-abc.ics")
    await _as(client, "eva")
    assert (await client.delete(f"/api/calendar/feeds/{feed['id']}")).status_code == 204


# --- C8: the family's chat is the family's ---------------------------------------------------------------


async def test_a_group_named_family_is_not_the_family_chat(client):
    ids = await _family(client)
    # The admin makes a group with just themself, named "Family", and writes in it.
    group = (await client.post("/api/chat/conversations", json={"member_ids": [], "name": "Family"})).json()
    await client.post("/api/chat/messages", json={"peer": group["peer_key"], "body": "Planning Maja's surprise"})
    await _as(client, "maja")
    page = (await client.get("/api/chat/messages?peer=family")).json()
    assert "surprise" not in json.dumps(page)
    assert (await client.post("/api/chat/messages", json={"peer": "family", "body": "Hej alla"})).status_code == 201
    # Nobody is removed from the family's chat.
    await _as(client, "admin", "secret123")
    family_conv = next(c for c in (await client.get("/api/chat/conversations")).json() if c["peer_key"] != group["peer_key"])
    assert (await client.patch(f"/api/chat/conversations/{family_conv['peer_key']}", json={"remove_member_ids": [ids["maja"]]})).status_code == 403
    assert (await client.get("/api/chat/messages?peer=family")).json()["items"][-1]["body"] == "Hej alla"


# --- C11: a child's chores are suggestions -----------------------------------------------------------------


async def test_a_childs_chores_wait_for_an_adult(client):
    await _family(client)
    await _as(client, "maja")
    raw = json.dumps({"chores": [{"title": "Bädda sängen", "points": 1000, "recurrence": "daily"}]})
    out = (await client.post("/api/home/chores/import", content=raw, headers={"Content-Type": "text/plain"})).json()
    assert out == {"imported": 0, "skipped": [], "suggested": 1}
    assert [t["title"] for t in (await client.get("/api/tasks")).json()] == []
    await _as(client, "admin", "secret123")
    assert [s["title"] for s in (await client.get("/api/tasks/suggestions")).json()] == ["Bädda sängen"]
    assert (await client.post("/api/home/chores/import", content=raw, headers={"Content-Type": "text/plain"})).json()["imported"] == 1


# --- C6/C7: uploads within their limits, pictures within theirs --------------------------------------------


def _png_claiming(width: int, height: int) -> bytes:
    """A PNG whose header says it's this big – the pixels never come."""
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    chunk = b"IHDR" + ihdr
    return b"\x89PNG\r\n\x1a\n" + struct.pack(">I", len(ihdr)) + chunk + struct.pack(">I", zlib.crc32(chunk) & 0xFFFFFFFF)


async def test_a_picture_that_claims_to_be_enormous_is_refused(client):
    await _family(client)
    bomb = _png_claiming(30_000, 30_000)
    assert (await client.post("/api/auth/me/avatar", files={"file": ("big.png", bomb, "image/png")})).status_code == 422
    album = (await client.post("/api/albums", json={"name": "Test"})).json()
    # Kept as a file, but no thumbnail is made from it.
    out = await client.post(f"/api/albums/{album['id']}/media", files={"file": ("big.png", bomb, "image/png")})
    assert out.status_code == 201 and out.json()["width"] is None


async def test_an_upload_over_the_limit_is_refused_before_it_is_read(client, monkeypatch):
    from app.config import get_settings

    await _family(client)
    monkeypatch.setattr(get_settings(), "media_max_size_bytes", 1024 * 1024)
    album = (await client.post("/api/albums", json={"name": "Test"})).json()
    big = b"\xff" * (2 * 1024 * 1024)
    assert (await client.post(f"/api/albums/{album['id']}/media", files={"file": ("big.jpg", big, "image/jpeg")})).status_code in (413, 422)
    # A request that says it's huge is refused on that alone, before its body is parsed (httpx won't
    # send a Content-Length that lies, so the check is called as the route does).
    from fastapi import HTTPException
    from starlette.requests import Request

    from app.services.uploads import limit_body

    check = limit_body(1024 * 1024).dependency
    with pytest.raises(HTTPException) as refused:
        await check(Request({"type": "http", "headers": [(b"content-length", str(50 * 1024 * 1024).encode())]}))
    assert refused.value.status_code == 413
    assert await check(Request({"type": "http", "headers": [(b"content-length", b"1000")]})) is None
    assert (await client.post("/api/auth/me/avatar", files={"file": ("a.jpg", b"\xff" * (11 * 1024 * 1024), "image/jpeg")})).status_code == 413


def test_the_portal_takes_only_so_many_photos_an_hour():
    from app.routers.parties import PORTAL_UPLOADS_PER_HOUR, _portal_upload_allowed

    ip = f"203.0.113.{uuid.uuid4().int % 250}"
    assert all(_portal_upload_allowed(ip, now=1000.0) for _ in range(PORTAL_UPLOADS_PER_HOUR))
    assert _portal_upload_allowed(ip, now=1001.0) is False
    assert _portal_upload_allowed(ip, now=1000.0 + 3601) is True


# --- C12: no keys in the access log -------------------------------------------------------------------------


def test_the_access_log_masks_the_links_secrets():
    assert mask("/api/kiosk/AbC123xyz/view") == "/api/kiosk/…/view"
    assert mask("/api/guest/tok-en") == "/api/guest/…"
    assert mask("/api/party/abc?key=def&wish_key=ghi") == "/api/party/…?key=…&wish_key=…"
    assert mask("/api/party-help/abc/enter") == "/api/party-help/…/enter"
    assert mask("/api/coparent/invite/abc") == "/api/coparent/invite/…"
    assert mask("/api/parties/550e8400-e29b-41d4-a716-446655440000") == "/api/parties/550e8400-e29b-41d4-a716-446655440000"
    assert mask("/api/lists") == "/api/lists"


# --- C13: reports within the quota and not without end ----------------------------------------------------


async def test_reports_are_limited(client):
    await _family(client)
    for _ in range(10):
        assert (await client.post("/api/feedback", json={"type": "bug", "title": "Hm", "description": "Something"})).status_code == 201
    assert (await client.post("/api/feedback", json={"type": "bug", "title": "Hm", "description": "Something"})).status_code == 429


# --- C3: a move file's rows are the family's ------------------------------------------------------------------


async def test_a_move_file_cannot_smuggle_a_user_into_another_family(client):
    from app.services.families import decrypt, encrypt
    from tests.test_hosting import _hosted_family, _owner

    owner = await _owner(client)
    guest, gina, _ = await _hosted_family(client)
    family_id = gina["family_id"]
    blob = (await client.post(f"/api/server/families/{family_id}/export", json={"passphrase": "correct horse battery"})).content
    assert (await client.delete(f"/api/server/families/{family_id}?confirm=Guests")).status_code == 204

    def tampered(change) -> bytes:
        zf = zipfile.ZipFile(io.BytesIO(decrypt(blob, "correct horse battery")))
        data = json.loads(zf.read("family.json"))
        change(data)
        out = io.BytesIO()
        with zipfile.ZipFile(out, "w") as new:
            for item in zf.infolist():
                new.writestr(item, json.dumps(data) if item.filename == "family.json" else zf.read(item))
        return encrypt(out.getvalue(), "correct horse battery")

    def smuggle(data):
        intruder = dict(data["tables"]["users"][0])
        intruder.update({"id": str(uuid.uuid4()), "family_id": owner["family_id"], "username": "intruder", "role": "admin"})
        data["tables"]["users"].append(intruder)

    headers = {"Content-Type": "application/octet-stream"}
    assert (await client.post("/api/server/families/import?passphrase=correct horse battery", content=tampered(smuggle), headers=headers)).status_code == 422
    assert (await client.post("/api/auth/login", json={"username": "intruder", "password": "guestpass1"})).status_code == 401
    # Untouched, the file is still welcome.
    assert (await client.post("/api/server/families/import?passphrase=correct horse battery", content=blob, headers=headers)).status_code == 201


# --- C10: the export shows what its maker may see ------------------------------------------------------------


async def test_the_export_keeps_another_adults_private_things_out(client):
    ids = await _family(client)
    await _as(client, "eva")
    await client.post("/api/documents", json={"user_id": ids["eva"], "kind": "health", "title": "Evas journal", "private": True, "number": "J-1"})
    await client.post("/api/documents", json={"user_id": ids["eva"], "kind": "passport", "title": "Evas pass", "number": "P-2"})
    await client.post("/api/medicine/medications", json={"user_id": ids["eva"], "name": "Evas medicin", "dose": "1", "times": ["08:00"]})
    await _as(client, "admin", "secret123")
    resp = await client.get("/api/admin/export/family")
    assert resp.status_code == 200
    zf = zipfile.ZipFile(io.BytesIO(resp.content))
    documents = json.loads(zf.read("documents/documents.json"))
    assert [d["title"] for d in documents] == ["Evas pass"]
    rows = json.loads(zf.read("data/documents.json"))
    assert [d["title"] for d in rows] == ["Evas pass"]
    assert "Evas medicin" not in zf.read("data/medications.json").decode()


# --- the small ones ---------------------------------------------------------------------------------------------


async def test_turning_the_authenticator_off_needs_the_password(client):
    import pyotp

    await _family(client)
    setup = (await client.post("/api/auth/totp/setup")).json()
    code = pyotp.TOTP(setup["secret"]).now()
    assert (await client.post("/api/auth/totp/enable", json={"code": code})).status_code == 204
    # The next step's code: one that was used is never accepted again.
    code = pyotp.TOTP(setup["secret"]).at(time.time() + 30)
    assert (await client.post("/api/auth/totp/disable", json={"code": code})).status_code == 400
    assert (await client.post("/api/auth/totp/disable", json={"code": code, "password": "wrong"})).status_code == 400
    assert (await client.post("/api/auth/totp/disable", json={"code": code, "password": "secret123"})).status_code == 204


async def test_the_setup_code_cannot_be_guessed_without_end(client, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "setup_code", "abc123")
    body = {"email": "a@example.com", "family_name": "Lind", "display_name": "Anna", "username": "admin", "password": "secret123", "setup_code": "nope"}
    codes = {(await client.post("/api/auth/setup", json=body)).status_code for _ in range(30)}
    assert codes == {403, 429}


async def test_an_old_party_link_has_ended(client):
    await _family(client)
    start = (datetime.now(timezone.utc) - timedelta(days=200)).replace(microsecond=0)
    party = (await client.post("/api/parties", json={"title": "Förr", "kind": "party", "starts_at": start.isoformat(), "ends_at": (start + timedelta(hours=2)).isoformat(), "place": "Hemma"})).json()
    token = (await client.post(f"/api/parties/{party['id']}/link")).json()["link"].rsplit("/", 1)[1]
    assert (await client.get(f"/api/party/{token}")).status_code == 410


async def test_a_paused_familys_links_are_paused(client, db_session):
    from app.models import Family

    ids = await _family(client)
    created = (await client.post("/api/guests", json={"name": "Babysitter Sara", "hours": 5})).json()
    token = created["url"].rsplit("/", 1)[1]
    assert (await client.get(f"/api/guest/{token}")).status_code == 200
    family = await db_session.get(Family, uuid.UUID((await client.get("/api/auth/me")).json()["family_id"]))
    family.status = "suspended"
    await db_session.commit()
    assert (await client.get(f"/api/guest/{token}")).status_code == 404
    assert ids


async def test_the_push_key_is_kept_sealed(db_session):
    from app.models import AppSetting
    from app.services.crypto import decrypt_token
    from app.services.push import VAPID_PRIVATE_KEY, ensure_vapid_keys

    _, private = await ensure_vapid_keys(db_session)
    stored = (await db_session.get(AppSetting, VAPID_PRIVATE_KEY)).value
    assert stored != private and decrypt_token(stored) == private
    assert (await ensure_vapid_keys(db_session))[1] == private

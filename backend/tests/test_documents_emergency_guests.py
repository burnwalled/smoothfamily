"""Document vault (#56), emergency cards and guest links (#54)."""
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pytest

pytestmark = pytest.mark.asyncio


async def _family(client):
    resp = await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "F", "display_name": "Admin", "username": "admin", "password": "secret123"},
    )
    assert resp.status_code == 201
    ids = {"admin": resp.json()["id"]}
    for username, role in [("adult1", "adult"), ("kid1", "child")]:
        r = await client.post("/api/family/members", json={"display_name": username.title(), "username": username, "password": "pass1234", "role": role})
        ids[username] = r.json()["id"]
    return ids


async def _login(client, username, password="pass1234"):
    assert (await client.post("/api/auth/login", json={"username": username, "password": password})).status_code == 200


# --- Documents ------------------------------------------------------------------------------


async def test_documents_access_numbers_and_files(client, db_session, tmp_path, monkeypatch):
    from app.config import get_settings
    from app.models import Document

    monkeypatch.setattr(get_settings(), "media_root", str(tmp_path))
    ids = await _family(client)
    soon = date.today() + timedelta(days=40)
    passport = (await client.post("/api/documents", json={"user_id": ids["kid1"], "kind": "passport", "title": "Passport", "number": "AB 1234567", "expiry_date": str(soon)})).json()
    assert passport["number_masked"] == "•••• 4567" and passport["remind_days"] == 90 and passport["status"] == "soon"
    mine = (await client.post("/api/documents", json={"user_id": ids["admin"], "kind": "health", "title": "My journal", "private": True})).json()
    house = (await client.post("/api/documents", json={"kind": "insurance", "title": "Home insurance", "number": "P-998877"})).json()
    row = await db_session.get(Document, __import__("uuid").UUID(passport["id"]))
    assert "1234567" not in row.number_encrypted  # encrypted at rest

    reveal = await client.get(f"/api/documents/{passport['id']}/number")
    assert reveal.json() == {"number": "AB 1234567"} and "no-store" in reveal.headers["cache-control"]

    upload = await client.post(f"/api/documents/{house['id']}/files", files={"file": ("policy.pdf", b"%PDF-secret-policy", "application/pdf")})
    assert upload.status_code == 201
    [stored] = list(Path(tmp_path).rglob("*.enc"))
    assert b"secret-policy" not in stored.read_bytes()
    got = await client.get(f"/api/documents/{house['id']}/files/{upload.json()['files'][0]['id']}")
    assert got.content == b"%PDF-secret-policy" and "no-store" in got.headers["cache-control"]
    assert (await client.post(f"/api/documents/{house['id']}/files", files={"file": ("x.exe", b"MZ", "application/x-msdownload")})).status_code == 415

    # The other adult: the child's and the household's, not the admin's private one.
    await _login(client, "adult1")
    titles = sorted(d["title"] for d in (await client.get("/api/documents")).json())
    assert titles == ["Home insurance", "Passport"]
    assert (await client.get(f"/api/documents/{mine['id']}/number")).status_code == 404
    # Children don't get the app unless it's turned on.
    await _login(client, "kid1")
    assert (await client.get("/api/documents")).status_code == 403

    # Expiry shows in the calendar and is reminded once.
    await _login(client, "admin", "secret123")
    events = (await client.get(f"/api/calendar/events?start={soon}&end={soon + timedelta(days=1)}")).json()
    assert [e["title"] for e in events if e["document_id"]] == ["Passport – expires"]
    from app.routers.documents import run_document_reminders

    at = datetime.combine(date.today(), datetime.min.time(), tzinfo=timezone.utc).replace(hour=8)
    assert await run_document_reminders(db_session, at) == 2  # both adults (the child has no app)
    assert await run_document_reminders(db_session, at + timedelta(hours=1)) == 0
    assert (await client.delete(f"/api/documents/{house['id']}")).status_code == 204
    assert list(Path(tmp_path).rglob("*.enc")) == []


async def test_document_key_survives_a_move(client, db_session, tmp_path, monkeypatch):
    """The move file carries the family's key; on the new server it is sealed with that key."""
    from app.config import get_settings
    from app.services import crypto
    from app.services.families import delete_family, export_family, import_family

    monkeypatch.setattr(get_settings(), "media_root", str(tmp_path))
    await _family(client)
    doc = (await client.post("/api/documents", json={"kind": "passport", "title": "Passport", "number": "XY 7654321"})).json()
    family_id = __import__("uuid").UUID((await client.get("/api/auth/me")).json()["family_id"])
    blob = await export_family(db_session, family_id, "correct horse battery")
    await delete_family(db_session, family_id)
    monkeypatch.setattr(get_settings(), "secret_key", "another-servers-secret-key-1234567890")
    assert crypto.encrypt_token("x")  # the new server's key is in use
    await import_family(db_session, blob, "correct horse battery")
    await _login(client, "admin", "secret123")
    assert (await client.get(f"/api/documents/{doc['id']}/number")).json() == {"number": "XY 7654321"}


# --- Emergency cards ------------------------------------------------------------------------


async def test_emergency_cards(client):
    ids = await _family(client)
    await client.post("/api/medicine", json={"user_id": ids["kid1"], "name": "Inhaler", "times": ["08:00"]})
    await client.post("/api/medicine", json={"user_id": ids["admin"], "name": "Private pill", "times": ["09:00"]})
    card = {"allergies": "Nuts", "health_centre": "Spånga VC", "contacts": [{"name": "Grandma", "phone": "070-123", "relation": "Grandma"}]}
    out = (await client.put(f"/api/emergency/members/{ids['kid1']}", json=card)).json()
    kid = next(m for m in out["members"] if m["user_id"] == ids["kid1"])
    assert out["members"][0]["user_id"] == ids["kid1"]  # children first
    assert kid["allergies"] == "Nuts" and kid["app_medicines"] == ["Inhaler – 08:00"]
    await client.put("/api/emergency/household", json={"address": "Norrgårdsvägen 16"})

    await _login(client, "adult1")
    out = (await client.get("/api/emergency")).json()
    admin_card = next(m for m in out["members"] if m["user_id"] == ids["admin"])
    assert admin_card["app_medicines"] == [] and out["household"]["address"] == "Norrgårdsvägen 16"
    await _login(client, "kid1")
    assert (await client.put("/api/emergency/household", json={"address": "x"})).status_code == 403
    assert (await client.put(f"/api/emergency/members/{ids['kid1']}", json={**card, "routines": "Bed at 20"})).status_code == 200


# --- Guest links ----------------------------------------------------------------------------


async def test_guest_link(client):
    ids = await _family(client)
    shopping = (await client.post("/api/lists", json={"name": "Shopping"})).json()
    secret = (await client.post("/api/lists", json={"name": "Gift ideas"})).json()
    item = (await client.post(f"/api/lists/{shopping['id']}/items", json={"name": "Milk"})).json()
    await client.post(f"/api/lists/{secret['id']}/items", json={"name": "Watch"})
    start = (datetime.now(timezone.utc) + timedelta(days=1)).replace(hour=17, minute=0, second=0, microsecond=0)
    await client.post("/api/calendar/family-events", json={"title": "Football", "start": start.isoformat(), "end": (start + timedelta(hours=1)).isoformat()})
    await client.put(f"/api/emergency/members/{ids['kid1']}", json={"allergies": "Nuts"})

    await _login(client, "kid1")
    assert (await client.post("/api/guests", json={"name": "Babysitter", "hours": 5})).status_code == 403
    await _login(client, "admin", "secret123")
    created = (await client.post("/api/guests", json={"name": "Babysitter Sara", "hours": 5, "list_ids": [shopping["id"]]})).json()
    token = created["url"].rsplit("/", 1)[1]

    client.cookies.clear()  # the guest has no session
    view = (await client.get(f"/api/guest/{token}")).json()
    assert view["name"] == "Babysitter Sara" and [l["name"] for l in view["lists"]] == ["Shopping"]
    assert [e["title"] for e in view["calendar"]] == ["Football"]
    assert next(m for m in view["emergency"]["members"] if m["user_id"] == ids["kid1"])["allergies"] == "Nuts"
    assert (await client.post(f"/api/guest/{token}/items/{item['id']}", json={"done": True})).json()["done"] is True
    # A guest is no member: nothing else in the app opens.
    assert (await client.get("/api/chat/conversations")).status_code == 401
    assert (await client.get("/api/guest/not-a-token")).status_code == 404

    await _login(client, "admin", "secret123")
    [guest] = (await client.get("/api/guests")).json()
    assert guest["active"] and len(guest["visits"]) == 1  # visits within half an hour count once
    extended = (await client.post(f"/api/guests/{guest['id']}/extend", json={"hours": 24})).json()
    assert extended["expires_at"] > guest["expires_at"]
    assert (await client.delete(f"/api/guests/{guest['id']}")).json()["active"] is False
    client.cookies.clear()
    assert (await client.get(f"/api/guest/{token}")).status_code == 404

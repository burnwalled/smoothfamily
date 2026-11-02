"""2.8.1: links out of the vault – they run out, can be closed, show only what was shared and offer
the original only when the one sharing chose so. Children can't share; a login is shown once."""
import io
from datetime import datetime, timedelta, timezone

import pytest
from PIL import Image

from app.models import VaultShare

pytestmark = pytest.mark.asyncio


def _png() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (40, 30), (40, 120, 200)).save(buf, "PNG")
    return buf.getvalue()


async def _login(client, username: str, password: str = "pass1234"):
    await client.post("/api/auth/logout")
    assert (await client.post("/api/auth/login", json={"username": username, "password": password})).status_code == 200


async def _setup(client):
    await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "Fam", "display_name": "Anna", "username": "admin", "password": "secret123"},
    )
    await client.post("/api/family/members", json={"display_name": "Leo", "username": "leo", "password": "pass1234", "role": "child"})
    album = (await client.post("/api/albums", json={"name": "Summer"})).json()
    photo = (await client.post(f"/api/albums/{album['id']}/media", files={"file": ("beach.png", _png(), "image/png")})).json()
    return album, photo


def _token(url: str) -> str:
    return url.rsplit("/share/", 1)[1]


async def test_a_photo_link_looks_without_downloading_and_runs_out(client, db_session):
    album, photo = await _setup(client)
    made = await client.post("/api/vault/shares", json={"kind": "media", "target_id": photo["id"], "hours": 24, "label": "Grandma"})
    assert made.status_code == 201, made.text
    token = _token(made.json()["url"])

    await client.post("/api/auth/logout")
    view = await client.get(f"/api/share/{token}")
    assert view.status_code == 200 and "no-store" in view.headers["cache-control"]
    body = view.json()
    assert body["family_name"] == "Fam" and body["allow_download"] is False and [i["name"] for i in body["items"]] == ["beach.png"]
    item = body["items"][0]["id"]
    seen = await client.get(f"/api/share/{token}/files/{item}")
    assert seen.status_code == 200 and seen.headers["content-type"] == "image/jpeg" and seen.headers["content-disposition"].startswith("inline")
    assert (await client.get(f"/api/share/{token}/files/{item}?variant=original")).status_code == 403
    # Nothing else of the family's through it.
    other = (await client.get(f"/api/share/{token}/files/{album['id']}")).status_code
    assert other == 404

    await _login(client, "admin", "secret123")
    mine = (await client.get("/api/vault/shares")).json()
    assert [(s["title"], s["label"], s["views"], s["active"]) for s in mine] == [("beach.png", "Grandma", 1, True)]

    # Runs out.
    await db_session.execute(VaultShare.__table__.update().values(expires_at=datetime.now(timezone.utc) - timedelta(minutes=1)))
    await db_session.commit()
    assert (await client.get(f"/api/share/{token}")).status_code == 404


async def test_an_album_with_download_and_closing_it(client):
    album, photo = await _setup(client)
    token = _token((await client.post("/api/vault/shares", json={"kind": "album", "target_id": album["id"], "hours": 2, "allow_download": True})).json()["url"])
    share_id = (await client.get("/api/vault/shares")).json()[0]["id"]
    view = (await client.get(f"/api/share/{token}")).json()
    assert view["title"] == "Summer" and view["allow_download"] is True
    original = await client.get(f"/api/share/{token}/files/{photo['id']}?variant=original")
    assert original.status_code == 200 and original.headers["content-type"] == "image/png" and original.headers["content-disposition"].startswith("attachment")

    assert (await client.delete(f"/api/vault/shares/{share_id}")).json()["active"] is False
    assert (await client.get(f"/api/share/{token}")).status_code == 404
    assert (await client.get(f"/api/share/{token}/files/{photo['id']}")).status_code == 404


async def test_a_login_is_shown_once_and_children_cant_share(client):
    _, photo = await _setup(client)
    login = (await client.post("/api/vault/logins", json={"title": "Wi-Fi", "username": "home", "password": "hemma123"})).json()
    made = (await client.post("/api/vault/shares", json={"kind": "login", "target_id": login["id"], "hours": 24, "allow_download": True})).json()
    assert made["one_time"] is True and made["allow_download"] is False
    token = _token(made["url"])
    first = (await client.get(f"/api/share/{token}")).json()
    assert first["login"]["password"] == "hemma123" and first["items"] == []
    assert (await client.get(f"/api/share/{token}")).status_code == 404

    # Children don't share.
    await _login(client, "leo")
    assert (await client.post("/api/vault/shares", json={"kind": "media", "target_id": photo["id"], "hours": 1})).status_code == 403


async def test_a_one_time_photo_link_stops_shortly_after_opening(client, db_session):
    _, photo = await _setup(client)
    token = _token((await client.post("/api/vault/shares", json={"kind": "media", "target_id": photo["id"], "hours": 24, "one_time": True})).json()["url"])
    assert (await client.get(f"/api/share/{token}")).status_code == 200
    # Still loads the picture right after; 15 minutes later it is gone.
    await db_session.execute(VaultShare.__table__.update().values(first_opened_at=datetime.now(timezone.utc) - timedelta(minutes=16)))
    await db_session.commit()
    assert (await client.get(f"/api/share/{token}")).status_code == 404


async def test_documents_follow_their_rules(client):
    await _setup(client)
    me = (await client.get("/api/auth/me")).json()["id"]
    doc = (await client.post("/api/documents", json={"user_id": me, "kind": "health", "title": "Journal", "private": True})).json()
    doc = (await client.post(f"/api/documents/{doc['id']}/files", files={"file": ("j.png", _png(), "image/png")})).json()
    file_id = doc["files"][0]["id"]
    token = _token((await client.post("/api/vault/shares", json={"kind": "document", "target_id": file_id, "hours": 1})).json()["url"])
    view = (await client.get(f"/api/share/{token}")).json()
    assert view["title"] == "Journal"
    shown = await client.get(f"/api/share/{token}/files/{file_id}")
    assert shown.status_code == 200 and shown.content[:4] == b"\x89PNG"


async def test_an_opendocument_file_is_only_downloaded_a_word_document_shown(client):
    await _setup(client)
    word = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    odf = "application/vnd.oasis.opendocument.spreadsheet"
    letter = (await client.post("/api/documents", json={"kind": "other", "title": "Letter"})).json()
    letter = (await client.post(f"/api/documents/{letter['id']}/files", files={"file": ("letter.docx", b"PK\x03\x04word", word)})).json()
    shown = _token((await client.post("/api/vault/shares", json={"kind": "document", "target_id": letter["files"][0]["id"], "hours": 1})).json()["url"])
    assert (await client.get(f"/api/share/{shown}")).json()["items"][0]["previewable"] is True
    assert (await client.get(f"/api/share/{shown}/files/{letter['files'][0]['id']}")).status_code == 200

    doc = (await client.post("/api/documents", json={"kind": "other", "title": "Lease"})).json()
    doc = (await client.post(f"/api/documents/{doc['id']}/files", files={"file": ("budget.ods", b"PK\x03\x04fake", odf)})).json()
    file_id = doc["files"][0]["id"]
    assert sorted(i["previewable"] for i in (await client.get("/api/vault", params={"source": "document"})).json()) == [False, True]

    look = _token((await client.post("/api/vault/shares", json={"kind": "document", "target_id": file_id, "hours": 1})).json()["url"])
    assert (await client.get(f"/api/share/{look}")).json()["items"][0]["previewable"] is False
    assert (await client.get(f"/api/share/{look}/files/{file_id}")).status_code == 403
    assert (await client.get(f"/api/share/{look}/files/{file_id}?variant=original")).status_code == 403

    get = _token((await client.post("/api/vault/shares", json={"kind": "document", "target_id": file_id, "hours": 1, "allow_download": True})).json()["url"])
    await client.get(f"/api/share/{get}")
    original = await client.get(f"/api/share/{get}/files/{file_id}?variant=original")
    assert original.status_code == 200 and original.content == b"PK\x03\x04fake" and original.headers["content-disposition"].startswith("attachment")

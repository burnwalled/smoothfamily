"""2.8.1: the vault – photos, chat pictures, receipts and documents in one place, each shown only to
those its own app shows it to."""
import io
import uuid
from datetime import date

import pytest
from PIL import Image

from app.models import VaultLogin
from app.services.family_export import SECRET_COLUMNS

pytestmark = pytest.mark.asyncio


def _png() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (40, 30), (40, 120, 200)).save(buf, "PNG")
    return buf.getvalue()


async def _login(client, username: str, password: str = "pass1234"):
    await client.post("/api/auth/logout")
    assert (await client.post("/api/auth/login", json={"username": username, "password": password})).status_code == 200


async def _family(client):
    await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123"},
    )
    ids = {}
    for name in ("bo", "cleo"):
        ids[name] = (await client.post("/api/family/members", json={"display_name": name.title(), "username": name, "password": "pass1234", "role": "adult"})).json()["id"]
    return ids


async def test_everything_in_one_place_for_those_who_may(client):
    ids = await _family(client)
    # A photo in an album.
    album = (await client.post("/api/albums", json={"name": "Summer"})).json()
    photo = (await client.post(f"/api/albums/{album['id']}/media", files={"file": ("beach.png", _png(), "image/png")})).json()
    # A picture in a chat with Bo only.
    conv = (await client.post("/api/chat/conversations", json={"member_ids": [ids["bo"]]})).json()["peer_key"]
    pic = (await client.post(f"/api/chat/conversations/{conv}/attachments", files={"file": ("cat.png", _png(), "image/png")})).json()
    assert (await client.post("/api/chat/messages", json={"peer": conv, "media_id": pic["id"]})).status_code == 201
    # A receipt for a car open to Bo (and the admin).
    car = (await client.post("/api/vehicles", json={"name": "Volvo"})).json()
    assert (await client.put(f"/api/vehicles/{car['id']}/access", json={"allowed_user_ids": [ids["bo"]]})).status_code == 200
    receipt = (await client.post("/api/vault/receipts", files={"file": ("fuel.png", _png(), "image/png")})).json()
    assert (await client.post("/api/vehicles/expenses", json={"vehicle_id": car["id"], "name": "Fuel", "amount": 650, "expense_date": str(date.today()), "category": "fuel", "receipt_media_id": receipt["id"]})).status_code == 201
    # A document with a scan; one private.
    doc = (await client.post("/api/documents", json={"kind": "insurance", "title": "Home insurance"})).json()
    assert (await client.post(f"/api/documents/{doc['id']}/files", files={"file": ("policy.png", _png(), "image/png")})).status_code == 201
    secret = (await client.post("/api/documents", json={"user_id": (await client.get("/api/auth/me")).json()["id"], "kind": "health", "title": "My journal", "private": True})).json()
    assert (await client.post(f"/api/documents/{secret['id']}/files", files={"file": ("j.png", _png(), "image/png")})).status_code == 201

    every = (await client.get("/api/vault")).json()
    assert {(i["source"], i["title"]) for i in every} == {
        ("photo", "beach.png"), ("chat", "cat.png"), ("receipt", "fuel.png"), ("document", "Home insurance"), ("document", "My journal"),
    }
    assert next(i for i in every if i["source"] == "receipt")["context"] == "Volvo · Fuel"
    assert next(i for i in every if i["source"] == "chat")["context"] == "Bo"
    # Receipts no longer show up as an album of photos.
    assert [a["name"] for a in (await client.get("/api/albums")).json()] == ["Summer"]
    albums = (await client.get("/api/vault/albums")).json()
    assert [(a["kind"], a["name"], a["item_count"]) for a in albums] == [("user", "Summer", 1), ("chat", "Bo", 1)]
    assert [i["title"] for i in (await client.get("/api/vault", params={"source": "chat", "album_id": conv})).json()] == ["cat.png"]
    assert [i["title"] for i in (await client.get("/api/vault", params={"q": "volvo"})).json()] == ["fuel.png"]

    # Bo: in the chat and may see the car; not Anna's private journal.
    await _login(client, "bo")
    seen = {(i["source"], i["title"]) for i in (await client.get("/api/vault")).json()}
    assert seen == {("photo", "beach.png"), ("chat", "cat.png"), ("receipt", "fuel.png"), ("document", "Home insurance")}
    assert (await client.get(f"/api/media/{receipt['id']}/thumb")).status_code == 200

    # Cleo: not in the chat, may not see the car.
    await _login(client, "cleo")
    seen = {(i["source"], i["title"]) for i in (await client.get("/api/vault")).json()}
    assert seen == {("photo", "beach.png"), ("document", "Home insurance")}
    assert [a["kind"] for a in (await client.get("/api/vault/albums")).json()] == ["user"]
    assert (await client.get(f"/api/media/{receipt['id']}/thumb")).status_code == 404
    assert (await client.get(f"/api/media/{pic['id']}/thumb")).status_code == 404
    assert (await client.post(f"/api/vault/media/{pic['id']}/copy", json={"album_id": album["id"]})).status_code == 404

    # Bo keeps the chat picture in the family's album too.
    await _login(client, "bo")
    copy = await client.post(f"/api/vault/media/{pic['id']}/copy", json={"album_id": album["id"]})
    assert copy.status_code == 201, copy.text
    await _login(client, "cleo")
    assert (await client.get(f"/api/media/{copy.json()['id']}/thumb")).status_code == 200
    assert photo["id"] != copy.json()["id"]


async def test_the_vault_is_the_photos_app(client):
    ids = await _family(client)
    assert (await client.put(f"/api/family/members/{ids['bo']}/apps", json={"apps": ["chat"]})).status_code == 200
    await _login(client, "bo")
    assert (await client.get("/api/vault")).status_code == 403
    assert (await client.post("/api/vault/receipts", files={"file": ("r.png", _png(), "image/png")})).status_code == 403


async def test_passwords_children_seen_by_adults_adults_private(client, db_session):
    ids = await _family(client)
    leo = (await client.post("/api/family/members", json={"display_name": "Leo", "username": "leo", "password": "pass1234", "role": "child"})).json()["id"]
    mine = await client.post("/api/vault/logins", json={"title": "Bank", "url": "bank.example", "username": "anna", "password": "s3cret!", "notes": "PIN 1234"})
    assert mine.status_code == 201, mine.text
    mine = mine.json()
    assert mine["url"] == "https://bank.example" and mine["username"] == "anna" and "password" not in mine
    assert (await client.post("/api/vault/logins", json={"title": "Bad", "url": "javascript:alert(1)"})).status_code == 422
    kids = (await client.post("/api/vault/logins", json={"owner_id": leo, "title": "Minecraft", "username": "leo2015", "password": "creeper"})).json()
    assert kids["owner_name"] == "Leo"
    # Kept encrypted: the database never holds the password as it is.
    row = await db_session.get(VaultLogin, uuid.UUID(mine["id"]))
    assert row.password_encrypted and "s3cret" not in row.password_encrypted and "anna" not in row.username_encrypted
    secret = await client.get(f"/api/vault/logins/{mine['id']}/secret")
    assert secret.json() == {"password": "s3cret!", "notes": "PIN 1234"} and "no-store" in secret.headers["cache-control"]

    # Another adult sees the child's, not Anna's – nor may they keep logins for another adult.
    await _login(client, "bo")
    assert [r["title"] for r in (await client.get("/api/vault/logins")).json()] == ["Minecraft"]
    assert (await client.get(f"/api/vault/logins/{mine['id']}/secret")).status_code == 404
    assert (await client.put(f"/api/vault/logins/{mine['id']}", json={"title": "x"})).status_code == 404
    assert (await client.post("/api/vault/logins", json={"owner_id": ids["cleo"], "title": "x"})).status_code == 403
    assert (await client.get(f"/api/vault/logins/{kids['id']}/secret")).json()["password"] == "creeper"
    changed = await client.put(f"/api/vault/logins/{kids['id']}", json={"title": "Minecraft", "username": "leo2015"})
    assert changed.json()["has_password"] is True  # left out = kept

    # The child sees their own only.
    await _login(client, "leo")
    assert [r["title"] for r in (await client.get("/api/vault/logins")).json()] == ["Minecraft"]
    assert (await client.post("/api/vault/logins", json={"owner_id": ids["bo"], "title": "x"})).status_code == 403

    # The family's export leaves the vault's secrets out.
    await _login(client, "admin", "secret123")
    assert SECRET_COLUMNS["vault_logins"] == {"username_encrypted", "password_encrypted", "notes_encrypted"}


async def test_an_adult_chooses_whom_to_share_a_login_with(client):
    ids = await _family(client)
    leo = (await client.post("/api/family/members", json={"display_name": "Leo", "username": "leo", "password": "pass1234", "role": "child"})).json()["id"]
    wifi = (await client.post("/api/vault/logins", json={"title": "Wi-Fi", "password": "hemma123", "shared_with": [ids["bo"]]})).json()
    assert wifi["shared_with"] == [ids["bo"]] and wifi["can_edit"] is True
    # Not with a child, nor with someone outside the adults.
    assert (await client.post("/api/vault/logins", json={"title": "x", "shared_with": [leo]})).status_code == 422
    assert (await client.post("/api/vault/logins", json={"owner_id": leo, "title": "x", "shared_with": [ids["bo"]]})).status_code == 422

    # Bo sees and copies it, but may not change or remove it.
    await _login(client, "bo")
    seen = (await client.get("/api/vault/logins")).json()
    assert [(r["title"], r["owner_name"], r["can_edit"]) for r in seen] == [("Wi-Fi", "Anna", False)]
    assert (await client.get(f"/api/vault/logins/{wifi['id']}/secret")).json()["password"] == "hemma123"
    assert (await client.put(f"/api/vault/logins/{wifi['id']}", json={"title": "Mine now"})).status_code == 403
    assert (await client.delete(f"/api/vault/logins/{wifi['id']}")).status_code == 403
    # Cleo and the child don't see it.
    for name in ("cleo", "leo"):
        await _login(client, name)
        assert (await client.get("/api/vault/logins")).json() == []
        assert (await client.get(f"/api/vault/logins/{wifi['id']}/secret")).status_code == 404

    # Anna stops sharing; leaving it out keeps it as it was.
    await _login(client, "admin", "secret123")
    kept = (await client.put(f"/api/vault/logins/{wifi['id']}", json={"title": "Wi-Fi"})).json()
    assert kept["shared_with"] == [ids["bo"]] and kept["has_password"] is True
    assert (await client.put(f"/api/vault/logins/{wifi['id']}", json={"title": "Wi-Fi", "shared_with": []})).json()["shared_with"] == []
    await _login(client, "bo")
    assert (await client.get("/api/vault/logins")).json() == []


async def test_any_file_kept_encrypted_and_never_run(client, db_session):
    ids = await _family(client)
    page = b"<html><script>alert(1)</script></html>"
    made = await client.post("/api/vault/files", files={"file": ("evil.html", page, "text/html")})
    assert made.status_code == 201, made.text
    item = made.json()
    assert item["source"] == "file" and item["kind"] == "file" and item["previewable"] is False
    # Sent as plain bytes to download – never as a page in the app.
    got = await client.get(f"/api/vault/files/{item['id']}")
    assert got.content == page and got.headers["content-type"] == "application/octet-stream"
    assert got.headers["content-disposition"].startswith("attachment") and got.headers["x-content-type-options"] == "nosniff"
    # Encrypted on disk.
    from app.models import VaultFile  # noqa: PLC0415
    from app.services.storage import get_storage  # noqa: PLC0415

    row = await db_session.get(VaultFile, uuid.UUID(item["id"]))
    assert b"<script>" not in get_storage().open(row.family_id, row.storage_key).read_bytes()

    pdf = (await client.post("/api/vault/files", files={"file": ("plan.pdf", b"%PDF-1.4 x", "application/pdf")}, data={"private": "true"})).json()
    shown = await client.get(f"/api/vault/files/{pdf['id']}")
    assert shown.headers["content-type"] == "application/pdf" and shown.headers["content-disposition"].startswith("inline")
    assert {i["title"] for i in (await client.get("/api/vault", params={"source": "file"})).json()} == {"evil.html", "plan.pdf"}

    # Bo sees the family's file, not the private one, and can't remove Anna's.
    await _login(client, "bo")
    assert [i["title"] for i in (await client.get("/api/vault", params={"source": "file"})).json()] == ["evil.html"]
    assert (await client.get(f"/api/vault/files/{pdf['id']}")).status_code == 404
    assert (await client.delete(f"/api/vault/files/{item['id']}")).status_code == 403

    # Shared with a link: downloaded only when allowed; the private one only by its owner.
    await _login(client, "admin", "secret123")
    link = (await client.post("/api/vault/shares", json={"kind": "file", "target_id": item["id"], "hours": 1, "allow_download": True})).json()["url"]
    token = link.rsplit("/share/", 1)[1]
    assert (await client.get(f"/api/share/{token}")).json()["items"][0]["previewable"] is False
    dl = await client.get(f"/api/share/{token}/files/{item['id']}?variant=original")
    assert dl.content == page and dl.headers["content-type"] == "application/octet-stream"
    await _login(client, "bo")
    assert (await client.post("/api/vault/shares", json={"kind": "file", "target_id": pdf["id"], "hours": 1})).status_code == 404
    assert ids


async def test_the_server_admin_sets_how_large_a_file_may_be(client):
    await _family(client)
    info = (await client.get("/api/admin/file-limit")).json()
    assert info["max_mb"] == 50 and info["factor"] == 3
    big = b"x" * (2 * 1024 * 1024)
    assert (await client.put("/api/admin/file-limit", json={"max_mb": 1})).json()["max_mb"] == 1
    assert (await client.post("/api/vault/files", files={"file": ("big.bin", big, "application/octet-stream")})).status_code == 413
    doc = (await client.post("/api/documents", json={"kind": "other", "title": "Scan"})).json()
    assert (await client.post(f"/api/documents/{doc['id']}/files", files={"file": ("s.pdf", big, "application/pdf")})).status_code == 413
    # No limit on a big server.
    assert (await client.put("/api/admin/file-limit", json={"max_mb": None})).json()["max_mb"] is None
    assert (await client.post("/api/vault/files", files={"file": ("big.bin", big, "application/octet-stream")})).status_code == 201
    # Only the server admin decides.
    await _login(client, "bo")
    assert (await client.put("/api/admin/file-limit", json={"max_mb": 5000})).status_code == 403

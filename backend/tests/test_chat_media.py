"""Chat image attachments, opt-in GIF proxy and self-service password change."""
import io

import httpx
import pytest
from PIL import Image

from app.services import giphy

pytestmark = pytest.mark.asyncio


async def _setup(client):
    resp = await client.post(
        "/api/auth/setup",
        json={"email": "admin@example.com", "family_name": "Media Chat", "display_name": "Admin", "username": "admin", "password": "secret123"},
    )
    assert resp.status_code == 201
    members = {}
    for name in ("bob", "carol"):
        created = await client.post(
            "/api/family/members",
            json={"display_name": name.title(), "username": name, "password": "1234", "role": "adult"},
        )
        assert created.status_code == 201
        members[name] = created.json()
    return members


async def _login(client, username: str, password: str):
    await client.post("/api/auth/logout")
    resp = await client.post("/api/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200


def _png() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (40, 30), (200, 120, 40)).save(buf, "PNG")
    return buf.getvalue()


async def _dm_with_image(client, members):
    conv = await client.post("/api/chat/conversations", json={"member_ids": [members["bob"]["id"]]})
    conv_id = conv.json()["peer_key"]
    upload = await client.post(
        f"/api/chat/conversations/{conv_id}/attachments",
        files={"file": ("photo.png", _png(), "image/png")},
    )
    assert upload.status_code == 201, upload.text
    media_id = upload.json()["id"]
    sent = await client.post("/api/chat/messages", json={"peer": conv_id, "media_id": media_id})
    assert sent.status_code == 201, sent.text
    assert sent.json()["body"] == "" and sent.json()["media_id"] == media_id
    return conv_id, media_id


async def test_attachment_visible_to_members_only(client):
    members = await _setup(client)
    conv_id, media_id = await _dm_with_image(client, members)

    convs = (await client.get("/api/chat/conversations")).json()
    assert next(c for c in convs if c["peer_key"] == conv_id)["last_message_snippet"] == "📷"

    await _login(client, "bob", "1234")
    assert (await client.get(f"/api/media/{media_id}/thumb")).status_code == 200

    await _login(client, "carol", "1234")
    assert (await client.get(f"/api/media/{media_id}/thumb")).status_code == 404
    assert (await client.get(f"/api/media/{media_id}/original")).status_code == 404


async def test_chat_album_hidden_from_photos(client):
    members = await _setup(client)
    await _dm_with_image(client, members)

    albums = (await client.get("/api/albums")).json()
    assert albums == []


async def test_cannot_attach_family_photo_or_send_empty(client):
    members = await _setup(client)
    conv = await client.post("/api/chat/conversations", json={"member_ids": [members["bob"]["id"]]})
    conv_id = conv.json()["peer_key"]

    album = (await client.post("/api/albums", json={"name": "Holiday"})).json()
    photo = await client.post(f"/api/albums/{album['id']}/media", files={"file": ("p.png", _png(), "image/png")})
    leak = await client.post("/api/chat/messages", json={"peer": conv_id, "media_id": photo.json()["id"]})
    assert leak.status_code == 404

    empty = await client.post("/api/chat/messages", json={"peer": conv_id, "body": "   "})
    assert empty.status_code == 422

    # Non-members can't upload into someone else's conversation.
    await _login(client, "carol", "1234")
    upload = await client.post(
        f"/api/chat/conversations/{conv_id}/attachments", files={"file": ("x.png", _png(), "image/png")}
    )
    assert upload.status_code == 404


async def test_attachments_are_images_only(client):
    members = await _setup(client)
    conv = await client.post("/api/chat/conversations", json={"member_ids": [members["bob"]["id"]]})
    upload = await client.post(
        f"/api/chat/conversations/{conv.json()['peer_key']}/attachments",
        files={"file": ("clip.mp4", b"\x00\x00", "video/mp4")},
    )
    assert upload.status_code == 422


async def test_gifs_disabled_by_default(client):
    members = await _setup(client)
    assert (await client.get("/api/chat/gifs/status")).json() == {"enabled": False}
    assert (await client.get("/api/chat/gifs?q=cat")).status_code == 404
    assert (await client.get("/api/chat/gifs/abc123.gif")).status_code == 404

    conv = await client.post("/api/chat/conversations", json={"member_ids": [members["bob"]["id"]]})
    sent = await client.post("/api/chat/messages", json={"peer": conv.json()["peer_key"], "gif_id": "abc123"})
    assert sent.status_code == 404


async def test_gif_endpoints_require_login(client):
    await _setup(client)
    await client.post("/api/auth/logout")
    assert (await client.get("/api/chat/gifs?q=cat")).status_code == 401
    assert (await client.get("/api/chat/gifs/abc123.gif")).status_code == 401


async def test_gif_proxy_forwards_no_user_identifiers(monkeypatch, client):
    members = await _setup(client)
    assert (await client.put("/api/admin/integrations/giphy", json={"api_key": "test-key-123456"})).json() == {
        "configured": True
    }

    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.url.host == "api.giphy.com":
            return httpx.Response(200, json={"data": [{"id": "abcDEF1"}, {"id": "bad/id"}]})
        return httpx.Response(200, content=b"GIF89a...")

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        giphy.httpx, "AsyncClient", lambda **kw: real_client(transport=httpx.MockTransport(handler), **kw)
    )
    monkeypatch.setattr(giphy, "_cache_get", lambda key: _none())

    found = await client.get("/api/chat/gifs?q=cat", headers={"X-Forwarded-For": "10.1.2.3"})
    assert found.status_code == 200
    assert found.json() == {"gifs": [{"id": "abcDEF1", "url": "/api/chat/gifs/abcDEF1.gif"}]}

    image = await client.get("/api/chat/gifs/abcDEF1.gif")
    assert image.status_code == 200 and image.headers["content-type"] == "image/gif"

    search_req, gif_req = seen
    assert search_req.url.params["rating"] == "g"
    assert search_req.url.params["api_key"] == "test-key-123456"
    for req in seen:
        assert "cookie" not in req.headers
        assert "x-forwarded-for" not in req.headers
        assert req.headers["user-agent"] == "smooth-family-proxy"
    assert gif_req.url.path == "/media/abcDEF1/200.gif"

    conv = await client.post("/api/chat/conversations", json={"member_ids": [members["bob"]["id"]]})
    sent = await client.post("/api/chat/messages", json={"peer": conv.json()["peer_key"], "gif_id": "abcDEF1"})
    assert sent.status_code == 201 and sent.json()["gif_id"] == "abcDEF1"


async def test_only_admin_manages_giphy_key(client):
    await _setup(client)
    await _login(client, "bob", "1234")
    assert (await client.put("/api/admin/integrations/giphy", json={"api_key": "test-key-123456"})).status_code == 403


async def _none():
    return None


async def test_change_own_password(client):
    await _setup(client)
    await _login(client, "bob", "1234")

    wrong = await client.post("/api/auth/me/password", json={"current_password": "nope", "new_password": "newpass1"})
    assert wrong.status_code == 400
    short = await client.post("/api/auth/me/password", json={"current_password": "1234", "new_password": "abc"})
    assert short.status_code == 422

    ok = await client.post("/api/auth/me/password", json={"current_password": "1234", "new_password": "newpass1"})
    assert ok.status_code == 204

    await client.post("/api/auth/logout")
    assert (await client.post("/api/auth/login", json={"username": "bob", "password": "1234"})).status_code == 401
    assert (await client.post("/api/auth/login", json={"username": "bob", "password": "newpass1"})).status_code == 200

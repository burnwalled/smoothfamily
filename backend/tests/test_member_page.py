"""3.0.4: a member's own page in the family's settings – a parent chooses a child's language and
picture; adults choose their own."""
import io

import pytest
from PIL import Image

pytestmark = pytest.mark.asyncio


async def _family(client):
    await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123"},
    )
    ids = {}
    for name, role in [("adult1", "adult"), ("kid1", "child")]:
        ids[name] = (await client.post("/api/family/members", json={"display_name": name.title(), "username": name, "password": "pass1234", "role": role})).json()["id"]
    return ids


async def test_a_parent_chooses_a_childs_language(client):
    """3.0.4: a new member speaks the admin's language unless another is chosen; a parent changes a
    child's language under Family members."""
    await _family(client)
    assert (await client.patch("/api/auth/me", json={"language": "sv"})).status_code == 200
    kid = (await client.post("/api/family/members", json={"display_name": "Ella", "username": "ella", "password": "pass1234", "role": "child"})).json()
    assert kid["language"] == "sv"
    other = (await client.post("/api/family/members", json={"display_name": "Odd", "username": "odd", "password": "pass1234", "role": "child", "language": "nb"})).json()
    assert other["language"] == "nb"
    changed = (await client.patch(f"/api/family/members/{kid['id']}", json={"language": "fi"})).json()
    assert changed["language"] == "fi"
    assert (await client.patch(f"/api/family/members/{kid['id']}", json={"language": "xx"})).status_code == 422
    # Changing something else leaves the language be.
    assert (await client.patch(f"/api/family/members/{kid['id']}", json={"color": "#123456"})).json()["language"] == "fi"


async def test_a_parent_sets_a_childs_picture(client):
    ids = await _family(client)
    kid = (await client.post(f"/api/family/members/{ids['kid1']}/avatar/preset", json={"name": "fox"})).json()
    assert kid["avatar_key"] == "preset:fox"
    assert (await client.post(f"/api/family/members/{ids['kid1']}/avatar/preset", json={"name": "dragon"})).status_code == 422
    # Another adult chooses their own.
    assert (await client.post(f"/api/family/members/{ids['adult1']}/avatar/preset", json={"name": "owl"})).status_code == 403

    buf = io.BytesIO()
    Image.new("RGB", (400, 300), "orange").save(buf, "PNG")
    up = await client.post(f"/api/family/members/{ids['kid1']}/avatar", files={"file": ("me.png", buf.getvalue(), "image/png")})
    assert up.status_code == 200 and up.json()["avatar_key"].startswith("avatars/")
    pic = await client.get(f"/api/family/members/{ids['kid1']}/avatar")
    assert pic.status_code == 200 and pic.headers["content-type"] == "image/jpeg"
    listed = {m["id"]: m for m in (await client.get("/api/family/members")).json()}
    assert listed[ids["kid1"]]["avatar_key"].startswith("avatars/")

    assert (await client.delete(f"/api/family/members/{ids['kid1']}/avatar")).json()["avatar_key"] is None
    assert (await client.get(f"/api/family/members/{ids['kid1']}/avatar")).status_code == 404

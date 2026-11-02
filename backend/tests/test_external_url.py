"""The server's external address (2.8.4): set in Server settings, used by every link handed out."""
import pytest

from app.config import get_settings

pytestmark = pytest.mark.asyncio


async def _setup(client):
    resp = await client.post(
        "/api/auth/setup",
        json={"email": "admin@example.com", "family_name": "Addr", "display_name": "Admin", "username": "admin", "password": "secret123"},
    )
    assert resp.status_code == 201, resp.text


async def test_the_address_is_set_and_used_by_links(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "public_url", "https://old.example")
    await _setup(client)

    r = (await client.get("/api/admin/external-url")).json()
    assert r == {"external_url": None, "env_url": "https://old.example", "effective": "https://old.example"}

    # Only scheme and host: a path would break every link.
    assert (await client.put("/api/admin/external-url", json={"external_url": "https://x.example/app"})).status_code == 422
    assert (await client.put("/api/admin/external-url", json={"external_url": "ftp://x.example"})).status_code == 422

    r = (await client.put("/api/admin/external-url", json={"external_url": "Family.Example.COM/"})).json()
    assert r["external_url"] == "https://family.example.com" and r["effective"] == "https://family.example.com"

    ical = (await client.get("/api/calendar/ical/token")).json()
    assert ical["url"].startswith("https://family.example.com/api/calendar/ical/")
    inv = (await client.post("/api/server/invitations", json={"label": "Friends", "days": 7})).json()
    assert inv["url"].startswith("https://family.example.com/invite/")

    # Cleared: back to PUBLIC_URL.
    r = (await client.put("/api/admin/external-url", json={"external_url": ""})).json()
    assert r["external_url"] is None and r["effective"] == "https://old.example"


async def test_passkeys_accept_both_the_new_and_the_old_address(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "public_url", "https://old.example")
    await _setup(client)
    await client.put("/api/admin/external-url", json={"external_url": "https://new.example"})

    for origin, rp in [("https://new.example", "new.example"), ("https://old.example", "old.example"), ("https://evil.example", "new.example")]:
        r = await client.post("/api/auth/passkeys/login/options", headers={"origin": origin})
        assert r.status_code == 200, r.text
        assert r.json()["options"]["rpId"] == rp, origin

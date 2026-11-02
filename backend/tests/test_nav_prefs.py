"""Per-user menu order and hidden sections."""
import pytest

pytestmark = pytest.mark.asyncio


async def test_menu_order_and_hidden_sections(client):
    await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "Nav", "display_name": "Admin", "username": "navadmin", "password": "secret123"},
    )
    me = (await client.get("/api/auth/me")).json()
    assert me["nav_order"] == [] and me["nav_hidden"] == []

    resp = await client.patch(
        "/api/auth/me", json={"nav_order": ["chat", "today", "chat", "lists"], "nav_hidden": ["vehicles", "property"]}
    )
    assert resp.status_code == 200
    assert resp.json()["nav_order"] == ["chat", "today", "lists"]
    assert resp.json()["nav_hidden"] == ["vehicles", "property"]

    assert (await client.patch("/api/auth/me", json={"nav_hidden": ["today"]})).status_code == 422
    assert (await client.patch("/api/auth/me", json={"nav_order": ["settings"]})).status_code == 422
    # Other preferences leave the menu alone.
    assert (await client.patch("/api/auth/me", json={"theme": "ocean"})).json()["nav_hidden"] == ["vehicles", "property"]

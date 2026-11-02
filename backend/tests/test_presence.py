"""Presence via Home Assistant (#60): linked by the admin, shared only when the member wants."""
from unittest.mock import AsyncMock, patch

import pytest

pytestmark = pytest.mark.asyncio

STATES = [
    {"entity_id": "person.anna", "state": "home", "last_changed": "2026-10-28T15:20:00+00:00", "attributes": {"friendly_name": "Anna"}},
    {"entity_id": "person.erik", "state": "Work", "last_changed": "2026-10-28T07:40:00+00:00", "attributes": {"friendly_name": "Erik"}},
    {"entity_id": "person.leo", "state": "not_home", "attributes": {"friendly_name": "Leo"}},
    {"entity_id": "sensor.home_erik_direction_of_travel", "state": "towards", "attributes": {"friendly_name": "Erik direction"}},
    {"entity_id": "light.kitchen", "state": "on", "attributes": {}},
]


async def _family(client):
    resp = await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123"},
    )
    ids = {"admin": resp.json()["id"]}
    for username, role in [("erik", "adult"), ("leo", "child")]:
        r = await client.post("/api/family/members", json={"display_name": username.title(), "username": username, "password": "pass1234", "role": role})
        ids[username] = r.json()["id"]
    return ids


async def _login(client, username, password="pass1234"):
    assert (await client.post("/api/auth/login", json={"username": username, "password": password})).status_code == 200


def _ha():
    return patch("app.routers.presence.ha.get_states", new_callable=AsyncMock, return_value=STATES)


async def test_presence(client):
    ids = await _family(client)
    # Without Home Assistant there is nothing to choose.
    assert (await client.get("/api/presence")).json()["available"] is False
    assert (await client.put("/api/presence/me", json={"share": "home"})).status_code == 409
    with patch("app.routers.smarthome.ha.validate_connection", new_callable=AsyncMock, return_value=True):
        await client.put("/api/smarthome/connection", json={"base_url": "http://ha.local:8123", "token": "t"})

    with _ha():
        links = (await client.get("/api/presence/links")).json()
        assert [p["entity_id"] for p in links["people"]] == ["person.anna", "person.erik", "person.leo"]
        assert [s["entity_id"] for s in links["travel_sensors"]] == ["sensor.home_erik_direction_of_travel"]
        assert (await client.put(f"/api/presence/links/{ids['erik']}", json={"person_entity": "light.kitchen"})).status_code == 422
        await client.put(f"/api/presence/links/{ids['admin']}", json={"person_entity": "person.anna"})
        await client.put(f"/api/presence/links/{ids['erik']}", json={"person_entity": "person.erik", "travel_entity": "sensor.home_erik_direction_of_travel"})
        await client.put(f"/api/presence/links/{ids['leo']}", json={"person_entity": "person.leo"})

        # Linked, but nobody is shown until they share.
        assert (await client.get("/api/presence")).json()["members"] == []
        me = (await client.put("/api/presence/me", json={"share": "home"})).json()
        assert me["linked"] and me["share"] == "home"
        await _login(client, "erik")
        out = (await client.put("/api/presence/me", json={"share": "travel"})).json()
        states = {m["name"]: m["state"] for m in out["members"]}
        # No zone names ("Work") – only home, away or on the way home.
        assert states == {"Anna": "home", "Erik": "travel"}
        await _login(client, "leo")
        await client.put("/api/presence/me", json={"share": "home"})
        assert {m["name"] for m in (await client.get("/api/presence")).json()["members"]} == {"Anna", "Erik", "Leo"}

        # Children's presence is for the adults; another child wouldn't see Leo.
        await _login(client, "admin", "secret123")
        child2 = (await client.post("/api/family/members", json={"display_name": "Maja", "username": "maja", "password": "pass1234", "role": "child"})).json()
        await _login(client, "maja")
        assert {m["name"] for m in (await client.get("/api/presence")).json()["members"]} == {"Anna", "Erik"}
        assert (await client.put("/api/presence/me", json={"share": "home"})).status_code == 409  # not linked
        assert child2["id"]

        # Pausing is one tap; a new link asks again.
        await _login(client, "erik")
        assert {m["name"] for m in (await client.put("/api/presence/me", json={"share": "off"})).json()["members"]} == {"Anna", "Leo"}
        await _login(client, "admin", "secret123")
        await client.put(f"/api/presence/links/{ids['leo']}", json={"person_entity": None})
        assert {m["name"] for m in (await client.get("/api/presence")).json()["members"]} == {"Anna"}

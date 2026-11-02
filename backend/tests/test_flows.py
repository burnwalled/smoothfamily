"""Flows (#44): permissions, approval, time / state / presence triggers, conditions and actions."""
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest

pytestmark = pytest.mark.asyncio

STATES = [
    {"entity_id": "light.kitchen", "state": "off", "attributes": {"friendly_name": "Kitchen"}},
    {"entity_id": "light.hall", "state": "off", "attributes": {"friendly_name": "Hall"}},
    {"entity_id": "binary_sensor.door", "state": "off", "attributes": {"friendly_name": "Front door"}},
    {"entity_id": "media_player.kitchen", "state": "idle", "attributes": {"friendly_name": "Kitchen Sonos"}},
    {"entity_id": "media_player.bathroom", "state": "idle", "attributes": {"friendly_name": "Bathroom Sonos"}},
    {"entity_id": "person.anna", "state": "not_home", "attributes": {}},
    {"entity_id": "person.erik", "state": "not_home", "attributes": {}},
]


@pytest.fixture
def utc_zone(monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "timezone", "UTC")


async def _login(client, username, password="pass1234"):
    assert (await client.post("/api/auth/login", json={"username": username, "password": password})).status_code == 200


async def _home(client):
    """A family with Home Assistant, three lights/speakers exposed, the hall light only for the admin."""
    resp = await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123"},
    )
    ids = {"admin": resp.json()["id"]}
    for username, role in [("erik", "adult"), ("leo", "child")]:
        r = await client.post("/api/family/members", json={"display_name": username.title(), "username": username, "password": "pass1234", "role": role})
        ids[username] = r.json()["id"]
    with patch("app.routers.smarthome.ha.validate_connection", new_callable=AsyncMock, return_value=True):
        await client.put("/api/smarthome/connection", json={"base_url": "http://ha.local:8123", "token": "t"})
    devices = {}
    for entity, name, domain, allowed in [
        ("light.kitchen", "Kitchen", "light", []),
        ("light.hall", "Hall", "light", [ids["admin"]]),
        ("media_player.kitchen", "Kitchen Sonos", "media_player", []),
        ("media_player.bathroom", "Bathroom Sonos", "media_player", []),
    ]:
        r = await client.post("/api/smarthome/devices", json={"entity_id": entity, "display_name": name, "domain": domain, "allowed_user_ids": allowed})
        assert r.status_code == 201, r.text
        devices[entity] = r.json()["id"]
    return ids, devices


def _ha():
    return (
        patch("app.services.homeassistant.get_states", new_callable=AsyncMock, return_value=STATES),
        patch("app.services.homeassistant.call_service", new_callable=AsyncMock, return_value=True),
    )


async def test_permissions_and_approval(client):
    ids, dev = await _home(client)
    light = {"type": "device", "device_id": dev["light.kitchen"], "action": "turn_on"}
    await _login(client, "erik")
    # The hall light isn't Erik's to control, and music only goes to speakers.
    hall = {"name": "x", "trigger": {"type": "button"}, "actions": [{**light, "device_id": dev["light.hall"]}]}
    assert (await client.post("/api/smarthome/flows", json=hall)).status_code == 422
    music_on_lamp = {"name": "x", "trigger": {"type": "button"}, "actions": [{"type": "media", "device_ids": [dev["light.kitchen"]], "media_content_id": "x", "media_content_type": "playlist"}]}
    assert (await client.post("/api/smarthome/flows", json=music_on_lamp)).status_code == 422
    assert (await client.post("/api/smarthome/flows", json={"name": "x", "trigger": {"type": "button"}, "actions": [{**light, "action": "explode"}]})).status_code == 422
    assert (await client.post("/api/smarthome/flows", json={"name": "x", "trigger": {"type": "time", "at": "25:00"}, "actions": [light]})).status_code == 422

    # A child's flow waits for an adult.
    await _login(client, "leo")
    flow = (await client.post("/api/smarthome/flows", json={"name": "Night light", "trigger": {"type": "button"}, "on_today": True, "actions": [light]})).json()
    assert flow["approved"] is False
    assert (await client.post(f"/api/smarthome/flows/{flow['id']}/run")).status_code == 409
    await _login(client, "erik")
    assert [f["name"] for f in (await client.get("/api/smarthome/flows")).json()] == ["Night light"]
    assert (await client.post(f"/api/smarthome/flows/{flow['id']}/approve")).json()["approved"] is True
    await _login(client, "leo")
    assert [f["name"] for f in (await client.get("/api/smarthome/flows/today")).json()] == ["Night light"]
    states, call = _ha()
    with states, call as service:
        assert (await client.post(f"/api/smarthome/flows/{flow['id']}/run")).json()["last_run_at"]
    service.assert_awaited_once()
    assert service.await_args.args[2:5] == ("light", "turn_on", "light.kitchen")
    # Not shared: the admin doesn't see Erik's private flows, but sees children's.
    await _login(client, "erik")
    private = (await client.post("/api/smarthome/flows", json={"name": "Mine", "trigger": {"type": "button"}, "actions": [light]})).json()
    await _login(client, "admin", "secret123")
    names = [f["name"] for f in (await client.get("/api/smarthome/flows")).json()]
    assert names == ["Night light"] and private["id"]


async def test_time_flow_with_music_and_a_condition(client, db_session, utc_zone):
    from app.services.flows import run_time_flows

    ids, dev = await _home(client)
    wednesday = datetime(2026, 10, 28, 7, 0, tzinfo=timezone.utc)
    flow = {
        "name": "Morning music",
        "trigger": {"type": "time", "at": "07:00", "days": [0, 1, 2, 3, 4]},
        "conditions": [{"type": "home", "who": "somebody"}],
        "actions": [
            {"type": "media", "device_ids": [dev["media_player.kitchen"], dev["media_player.bathroom"]], "media_content_id": "spotify:playlist:morgon", "media_content_type": "playlist", "title": "Morgon", "volume": 20},
            {"type": "notify", "to": "me", "text": "Good morning!"},
        ],
    }
    assert (await client.post("/api/smarthome/flows", json=flow)).status_code == 201
    # Nobody shares their presence yet, so "somebody home" doesn't hold.
    states, call = _ha()
    with states, call as service:
        assert await run_time_flows(db_session, wednesday) == 0
    with patch("app.routers.presence.ha.get_states", new_callable=AsyncMock, return_value=STATES):
        await client.put(f"/api/presence/links/{ids['admin']}", json={"person_entity": "person.anna"})
    await client.put("/api/presence/me", json={"share": "home"})
    home = [dict(s, state="home") if s["entity_id"] == "person.anna" else s for s in STATES]
    with patch("app.services.homeassistant.get_states", new_callable=AsyncMock, return_value=home), call as service:
        assert await run_time_flows(db_session, wednesday + timedelta(minutes=1)) == 0  # 07:01: not the time
        assert await run_time_flows(db_session, wednesday.replace(day=31)) == 0  # Saturday
        assert await run_time_flows(db_session, wednesday) == 1
        assert await run_time_flows(db_session, wednesday + timedelta(seconds=20)) == 0  # once
    calls = [(c.args[3], c.args[4], c.args[5]) for c in service.await_args_list]
    assert calls == [
        ("join", "media_player.kitchen", {"group_members": ["media_player.bathroom"]}),
        ("volume_set", "media_player.kitchen", {"volume_level": 0.2}),
        ("volume_set", "media_player.bathroom", {"volume_level": 0.2}),
        ("play_media", "media_player.kitchen", {"media_content_id": "spotify:playlist:morgon", "media_content_type": "playlist"}),
    ]
    assert [n["body"] for n in (await client.get("/api/notifications")).json()] == ["Good morning!"]


async def test_state_and_presence_triggers(client, db_session, utc_zone):
    from app.models import SmarthomeConnection  # noqa: F401
    from app.services.flows import on_state_change

    ids, dev = await _home(client)
    family_id = (await client.get("/api/auth/me")).json()["family_id"]
    light = {"type": "device", "device_id": dev["light.kitchen"], "action": "turn_off"}
    await client.post("/api/smarthome/flows", json={"name": "Kitchen off with the hall", "trigger": {"type": "state", "device_id": dev["light.hall"], "to": "off"}, "actions": [light]})
    await client.post("/api/smarthome/flows", json={"name": "All off", "trigger": {"type": "presence", "event": "last_leaves"}, "actions": [light]})
    with patch("app.routers.presence.ha.get_states", new_callable=AsyncMock, return_value=STATES):
        await client.put(f"/api/presence/links/{ids['admin']}", json={"person_entity": "person.anna"})
        await client.put(f"/api/presence/links/{ids['erik']}", json={"person_entity": "person.erik"})
    await client.put("/api/presence/me", json={"share": "home"})
    await _login(client, "erik")
    await client.put("/api/presence/me", json={"share": "home"})

    import uuid as _uuid

    fid = _uuid.UUID(family_id)
    now = datetime(2026, 10, 28, 9, tzinfo=timezone.utc)
    states, call = _ha()
    with states, call as service:
        assert await on_state_change(db_session, fid, "light.hall", "on", "off", now) == 1
        assert await on_state_change(db_session, fid, "light.hall", "off", "on", now + timedelta(minutes=2)) == 0
    # Anna leaves while Erik is home: not the last one.
    erik_home = [dict(s, state="home") if s["entity_id"] == "person.erik" else s for s in STATES]
    with patch("app.services.homeassistant.get_states", new_callable=AsyncMock, return_value=erik_home), call:
        assert await on_state_change(db_session, fid, "person.anna", "home", "not_home", now) == 0
    with patch("app.services.homeassistant.get_states", new_callable=AsyncMock, return_value=STATES), call:
        assert await on_state_change(db_session, fid, "person.erik", "home", "not_home", now) == 1
    # A member who doesn't share presence never sets off a flow.
    await client.put("/api/presence/me", json={"share": "off"})
    with patch("app.services.homeassistant.get_states", new_callable=AsyncMock, return_value=STATES), call:
        assert await on_state_change(db_session, fid, "person.erik", "home", "not_home", now + timedelta(minutes=5)) == 0

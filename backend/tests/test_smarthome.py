"""Phase D tests: smart home (Home Assistant) — mocked transport, permissions, token security."""
import json
import os
import uuid
from unittest.mock import AsyncMock, patch

import pytest

pytestmark = pytest.mark.asyncio

# Ensure test env vars
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./test.db")
os.environ.setdefault("SECRET_KEY", "test-secret")


MOCK_HA_STATES = [
    {"entity_id": "light.living_room", "state": "on", "attributes": {"friendly_name": "Living Room Light"}},
    {"entity_id": "light.bedroom", "state": "off", "attributes": {"friendly_name": "Bedroom Light"}},
    {"entity_id": "switch.coffee", "state": "off", "attributes": {"friendly_name": "Coffee Machine"}},
    {"entity_id": "cover.garage", "state": "closed", "attributes": {"friendly_name": "Garage Door"}},
    {"entity_id": "sensor.temp", "state": "22.1", "attributes": {"friendly_name": "Temperature"}},
]


async def _setup(client):
    resp = await client.post(
        "/api/auth/setup",
        json={
            "email": "admin@example.com", "family_name": "Smart Family",
            "display_name": "Admin",
            "username": "admin",
            "password": "secret123",
        },
    )
    assert resp.status_code == 201
    return resp.json()


async def _add_member(client, username="child1", role="child"):
    resp = await client.post(
        "/api/family/members",
        json={"display_name": username.title(), "username": username, "password": "pass1234", "role": role},
    )
    assert resp.status_code == 201
    return resp.json()


def _mock_validate_ok():
    """Mock validate_connection to return True."""
    return patch("app.routers.smarthome.ha.validate_connection", new_callable=AsyncMock, return_value=True)


def _mock_get_states():
    """Mock get_states to return test entities."""
    return patch("app.routers.smarthome.ha.get_states", new_callable=AsyncMock, return_value=MOCK_HA_STATES)


def _mock_call_service():
    """Mock call_service to return True."""
    return patch("app.routers.smarthome.ha.call_service", new_callable=AsyncMock, return_value=True)


# ── Connection management ─────────────────────────────────────────────────────

async def test_create_connection(client):
    await _setup(client)
    with _mock_validate_ok():
        resp = await client.put(
            "/api/smarthome/connection",
            json={"base_url": "http://ha.local:8123", "token": "my-secret-token"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["provider"] == "home_assistant"
    assert data["base_url"] == "http://ha.local:8123"
    # Token must NOT be in the response
    assert "token" not in data
    assert "token_encrypted" not in data
    assert "my-secret-token" not in json.dumps(data)


async def test_token_never_in_responses(client):
    """The encrypted token must never appear in ANY response body."""
    await _setup(client)
    with _mock_validate_ok():
        await client.put(
            "/api/smarthome/connection",
            json={"base_url": "http://ha.local:8123", "token": "super-secret-123"},
        )

    # GET connection
    resp = await client.get("/api/smarthome/connection")
    body = resp.text
    assert "super-secret-123" not in body

    # GET entities (with mocked states)
    with _mock_get_states():
        resp = await client.get("/api/smarthome/entities")
    assert "super-secret-123" not in resp.text

    # GET devices
    resp = await client.get("/api/smarthome/devices")
    assert "super-secret-123" not in resp.text


async def test_invalid_connection_rejected(client):
    await _setup(client)
    with patch("app.routers.smarthome.ha.validate_connection", new_callable=AsyncMock, return_value=False):
        resp = await client.put(
            "/api/smarthome/connection",
            json={"base_url": "http://bad.local:8123", "token": "wrong"},
        )
    assert resp.status_code == 422


async def test_delete_connection(client):
    await _setup(client)
    with _mock_validate_ok():
        await client.put(
            "/api/smarthome/connection",
            json={"base_url": "http://ha.local:8123", "token": "tok"},
        )
    resp = await client.delete("/api/smarthome/connection")
    assert resp.status_code == 204

    resp = await client.get("/api/smarthome/connection")
    assert resp.json() is None


# ── Entity listing ────────────────────────────────────────────────────────────

async def test_list_entities_filters_supported_domains(client):
    await _setup(client)
    with _mock_validate_ok():
        await client.put(
            "/api/smarthome/connection",
            json={"base_url": "http://ha.local:8123", "token": "tok"},
        )
    with _mock_get_states():
        resp = await client.get("/api/smarthome/entities")
    assert resp.status_code == 200
    entities = resp.json()
    # Only light, switch, cover should be returned (not sensor)
    domains = {e["domain"] for e in entities}
    assert "sensor" not in domains
    assert "light" in domains
    assert "switch" in domains
    assert "cover" in domains


# ── Device CRUD ───────────────────────────────────────────────────────────────

async def test_add_and_list_devices(client):
    await _setup(client)
    with _mock_validate_ok():
        await client.put(
            "/api/smarthome/connection",
            json={"base_url": "http://ha.local:8123", "token": "tok"},
        )

    resp = await client.post(
        "/api/smarthome/devices",
        json={"entity_id": "light.living_room", "display_name": "Living Room", "domain": "light"},
    )
    assert resp.status_code == 201

    resp = await client.get("/api/smarthome/devices")
    assert len(resp.json()) == 1
    assert resp.json()[0]["entity_id"] == "light.living_room"


async def test_unsupported_domain_rejected(client):
    await _setup(client)
    with _mock_validate_ok():
        await client.put(
            "/api/smarthome/connection",
            json={"base_url": "http://ha.local:8123", "token": "tok"},
        )
    resp = await client.post(
        "/api/smarthome/devices",
        json={"entity_id": "sensor.temp", "display_name": "Temp", "domain": "sensor"},
    )
    assert resp.status_code == 422


# ── Permissions ───────────────────────────────────────────────────────────────

async def test_permission_403_on_restricted_device(client):
    admin = await _setup(client)
    child = await _add_member(client, "child1", "child")

    with _mock_validate_ok():
        await client.put(
            "/api/smarthome/connection",
            json={"base_url": "http://ha.local:8123", "token": "tok"},
        )

    # Add device restricted to admin only
    resp = await client.post(
        "/api/smarthome/devices",
        json={
            "entity_id": "light.living_room",
            "display_name": "Living Room",
            "domain": "light",
            "allowed_user_ids": [admin["id"]],
        },
    )
    assert resp.status_code == 201
    device_id = resp.json()["id"]

    # Login as child
    await client.post("/api/auth/login", json={"username": "child1", "password": "pass1234"})

    # Child should get 403 trying to act on the restricted device
    with _mock_call_service():
        resp = await client.post(f"/api/smarthome/devices/{device_id}/action", json={"action": "toggle"})
    assert resp.status_code == 403


async def test_non_admin_cannot_manage_connection(client):
    await _setup(client)
    await _add_member(client, "kid", "child")
    await client.post("/api/auth/login", json={"username": "kid", "password": "pass1234"})

    resp = await client.put(
        "/api/smarthome/connection",
        json={"base_url": "http://ha.local:8123", "token": "tok"},
    )
    assert resp.status_code == 403


# ── Service call ──────────────────────────────────────────────────────────────

async def test_correct_service_call(client):
    await _setup(client)
    with _mock_validate_ok():
        await client.put(
            "/api/smarthome/connection",
            json={"base_url": "http://ha.local:8123", "token": "tok"},
        )
    resp = await client.post(
        "/api/smarthome/devices",
        json={"entity_id": "light.living_room", "display_name": "LR", "domain": "light", "allowed_user_ids": []},
    )
    device_id = resp.json()["id"]

    with _mock_call_service() as mock_call:
        resp = await client.post(f"/api/smarthome/devices/{device_id}/action", json={"action": "turn_on"})
    assert resp.status_code == 200
    # Verify the HA call was made with correct params
    mock_call.assert_called_once()
    args = mock_call.call_args
    assert args[0][2] == "light"  # domain
    assert args[0][3] == "turn_on"  # service
    assert args[0][4] == "light.living_room"  # entity_id


async def test_cover_action_mapping(client):
    await _setup(client)
    with _mock_validate_ok():
        await client.put(
            "/api/smarthome/connection",
            json={"base_url": "http://ha.local:8123", "token": "tok"},
        )
    resp = await client.post(
        "/api/smarthome/devices",
        json={"entity_id": "cover.garage", "display_name": "Garage", "domain": "cover"},
    )
    device_id = resp.json()["id"]

    with _mock_call_service() as mock_call:
        resp = await client.post(f"/api/smarthome/devices/{device_id}/action", json={"action": "open"})
    assert resp.status_code == 200
    args = mock_call.call_args
    assert args[0][2] == "cover"
    assert args[0][3] == "open_cover"


# ── My devices (member endpoint) ─────────────────────────────────────────────

async def test_my_devices_returns_permitted_devices(client):
    admin = await _setup(client)
    child = await _add_member(client, "kid2", "child")

    with _mock_validate_ok():
        await client.put(
            "/api/smarthome/connection",
            json={"base_url": "http://ha.local:8123", "token": "tok"},
        )

    # Device 1: everyone
    await client.post(
        "/api/smarthome/devices",
        json={"entity_id": "light.living_room", "display_name": "Living Room", "domain": "light", "allowed_user_ids": []},
    )
    # Device 2: admin only
    await client.post(
        "/api/smarthome/devices",
        json={"entity_id": "switch.coffee", "display_name": "Coffee", "domain": "switch", "allowed_user_ids": [admin["id"]]},
    )

    # Login as child
    await client.post("/api/auth/login", json={"username": "kid2", "password": "pass1234"})

    with _mock_get_states():
        resp = await client.get("/api/smarthome/my-devices")
    assert resp.status_code == 200
    devices = resp.json()
    # Child should only see the unrestricted device
    assert len(devices) == 1
    assert devices[0]["entity_id"] == "light.living_room"


# ── Rich controls (dimmer, white balance, vacuums, automations …) ─────────────

async def _connected_device(client, entity_id: str, domain: str) -> str:
    await _setup(client)
    with _mock_validate_ok():
        await client.put("/api/smarthome/connection", json={"base_url": "http://ha.local:8123", "token": "tok"})
    resp = await client.post(
        "/api/smarthome/devices", json={"entity_id": entity_id, "display_name": "X", "domain": domain}
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


@pytest.mark.parametrize(
    "entity_id,domain,body,service,data",
    [
        ("light.lamp", "light", {"action": "brightness", "value": 40}, "turn_on", {"brightness_pct": 40}),
        ("light.lamp", "light", {"action": "color_temp", "value": 2700}, "turn_on", {"color_temp_kelvin": 2700}),
        ("fan.ceiling", "fan", {"action": "percentage", "value": 66}, "set_percentage", {"percentage": 66}),
        ("cover.blind", "cover", {"action": "position", "value": 30}, "set_cover_position", {"position": 30}),
        ("climate.heat_pump", "climate", {"action": "set_temperature", "value": 21.3}, "set_temperature", {"temperature": 21.5}),
        ("vacuum.robot", "vacuum", {"action": "return_to_base"}, "return_to_base", {}),
        ("scene.movie", "scene", {"action": "activate"}, "turn_on", {}),
        ("script.goodnight", "script", {"action": "run"}, "turn_on", {}),
        ("automation.morning", "automation", {"action": "trigger"}, "trigger", {}),
        ("automation.morning", "automation", {"action": "turn_off"}, "turn_off", {}),
    ],
)
async def test_rich_actions_map_to_ha_services(client, entity_id, domain, body, service, data):
    device_id = await _connected_device(client, entity_id, domain)
    with _mock_call_service() as mock_call:
        resp = await client.post(f"/api/smarthome/devices/{device_id}/action", json=body)
    assert resp.status_code == 200, resp.text
    args = mock_call.call_args[0]
    assert args[2:5] == (domain, service, entity_id)
    assert args[5] == data


@pytest.mark.parametrize(
    "body",
    [
        {"action": "brightness"},  # missing value
        {"action": "brightness", "value": 150},
        {"action": "color_temp", "value": 50},
        {"action": "start"},  # vacuum action on a light
    ],
)
async def test_invalid_rich_actions_rejected(client, body):
    device_id = await _connected_device(client, "light.lamp", "light")
    with _mock_call_service() as mock_call:
        resp = await client.post(f"/api/smarthome/devices/{device_id}/action", json=body)
    assert resp.status_code == 422
    mock_call.assert_not_called()


async def test_my_devices_exposes_only_whitelisted_attributes(client):
    await _connected_device(client, "light.lamp", "light")
    states = [
        {
            "entity_id": "light.lamp",
            "state": "on",
            "attributes": {
                "friendly_name": "Lamp",
                "brightness": 128,
                "color_temp_kelvin": 3000,
                "min_color_temp_kelvin": 2200,
                "max_color_temp_kelvin": 6500,
                "supported_color_modes": ["color_temp"],
                "ip_address": "192.168.1.50",
            },
        }
    ]
    with patch("app.routers.smarthome.ha.get_states", new_callable=AsyncMock, return_value=states):
        resp = await client.get("/api/smarthome/my-devices")
    attrs = resp.json()[0]["attributes"]
    assert attrs["brightness"] == 50  # 128/255 → percent
    assert attrs["color_temp_kelvin"] == 3000
    assert attrs["supported_color_modes"] == ["color_temp"]
    assert "ip_address" not in attrs and "friendly_name" not in attrs


async def test_favorites_choose_the_today_card(client):
    admin = await _setup(client)
    with _mock_validate_ok():
        await client.put("/api/smarthome/connection", json={"base_url": "http://ha.local:8123", "token": "tok"})
    lamp = (await client.post(
        "/api/smarthome/devices",
        json={"entity_id": "light.living_room", "display_name": "Living Room", "domain": "light", "allowed_user_ids": []},
    )).json()
    coffee = (await client.post(
        "/api/smarthome/devices",
        json={"entity_id": "switch.coffee", "display_name": "Coffee", "domain": "switch", "allowed_user_ids": [admin["id"]]},
    )).json()

    # Never chosen: everything counts as a favourite.
    with _mock_get_states():
        assert all(d["favorite"] for d in (await client.get("/api/smarthome/my-devices")).json())

    assert (await client.put("/api/smarthome/favorites", json={"device_ids": [lamp["id"]]})).status_code == 204
    with _mock_get_states():
        favs = {d["display_name"]: d["favorite"] for d in (await client.get("/api/smarthome/my-devices")).json()}
    assert favs == {"Living Room": True, "Coffee": False}

    # A child can't favourite a device it isn't allowed to control.
    await _add_member(client, "kid3", "child")
    await client.post("/api/auth/login", json={"username": "kid3", "password": "pass1234"})
    await client.put("/api/smarthome/favorites", json={"device_ids": [lamp["id"], coffee["id"]]})
    with _mock_get_states():
        rows = (await client.get("/api/smarthome/my-devices")).json()
    assert [(d["display_name"], d["favorite"]) for d in rows] == [("Living Room", True)]

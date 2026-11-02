"""Home Assistant service: get entity states and call services via the HA REST API."""
from typing import Any

import httpx

from app.services import gateway, ha_sim

HA_TIMEOUT = 10.0

SUPPORTED_DOMAINS = {"light", "switch", "fan", "cover", "climate", "vacuum", "scene", "script", "automation", "media_player"}


class HomeAssistantError(Exception):
    pass


async def validate_connection(base_url: str, token: str) -> bool:
    """Validate a HA connection by calling GET /api/. Returns True if valid."""
    if ha_sim.is_sim(base_url):
        return True
    if gateway.is_gateway(base_url):
        return gateway.online(gateway.connection_id(base_url))
    url = base_url.rstrip("/") + "/api/"
    try:
        async with httpx.AsyncClient(timeout=HA_TIMEOUT) as client:
            resp = await client.get(url, headers={"Authorization": f"Bearer {token}"})
            return resp.status_code == 200
    except httpx.HTTPError:
        return False


async def get_states(base_url: str, token: str) -> list[dict]:
    """Fetch all entity states from HA."""
    if ha_sim.is_sim(base_url):
        return await ha_sim.get_states(base_url)
    if gateway.is_gateway(base_url):
        try:
            return await gateway.get_states(base_url)
        except gateway.GatewayError as exc:
            raise HomeAssistantError(str(exc)) from exc
    url = base_url.rstrip("/") + "/api/states"
    async with httpx.AsyncClient(timeout=HA_TIMEOUT) as client:
        resp = await client.get(url, headers={"Authorization": f"Bearer {token}"})
        if resp.status_code != 200:
            raise HomeAssistantError(f"HA returned {resp.status_code}")
        return resp.json()


async def get_state(base_url: str, token: str, entity_id: str) -> dict:
    """Fetch a single entity state from HA."""
    if ha_sim.is_sim(base_url):
        return await ha_sim.get_state(base_url, entity_id)
    if gateway.is_gateway(base_url):
        try:
            return await gateway.get_state(base_url, entity_id)
        except gateway.GatewayError as exc:
            raise HomeAssistantError(str(exc)) from exc
    url = base_url.rstrip("/") + f"/api/states/{entity_id}"
    async with httpx.AsyncClient(timeout=HA_TIMEOUT) as client:
        resp = await client.get(url, headers={"Authorization": f"Bearer {token}"})
        if resp.status_code != 200:
            raise HomeAssistantError(f"HA returned {resp.status_code}")
        return resp.json()


async def call_service(
    base_url: str, token: str, domain: str, service: str, entity_id: str, data: dict | None = None
) -> bool:
    """Call a HA service (e.g. light/turn_on) with optional extra service data."""
    if ha_sim.is_sim(base_url):
        return await ha_sim.call_service(base_url, domain, service, entity_id, data)
    if gateway.is_gateway(base_url):
        try:
            await gateway.call_service(base_url, domain, service, entity_id, data)
            return True
        except gateway.GatewayError as exc:
            raise HomeAssistantError(str(exc)) from exc
    url = base_url.rstrip("/") + f"/api/services/{domain}/{service}"
    async with httpx.AsyncClient(timeout=HA_TIMEOUT) as client:
        resp = await client.post(
            url,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"entity_id": entity_id, **(data or {})},
        )
        if resp.status_code not in (200, 201):
            raise HomeAssistantError(f"HA service call returned {resp.status_code}")
        return True


def _need(value: float | None, low: float, high: float, what: str) -> float:
    if value is None or not (low <= value <= high):
        raise ValueError(f"{what} must be between {low:g} and {high:g}")
    return value


# action -> HA service, per domain. Value-carrying actions are handled in resolve_action.
_SIMPLE_ACTIONS: dict[str, dict[str, str]] = {
    "light": {"turn_on": "turn_on", "turn_off": "turn_off", "toggle": "toggle"},
    "switch": {"turn_on": "turn_on", "turn_off": "turn_off", "toggle": "toggle"},
    "fan": {"turn_on": "turn_on", "turn_off": "turn_off", "toggle": "toggle"},
    "cover": {
        "open": "open_cover", "close": "close_cover", "stop": "stop_cover",
        "open_cover": "open_cover", "close_cover": "close_cover", "stop_cover": "stop_cover",
    },
    "climate": {"turn_on": "turn_on", "turn_off": "turn_off"},
    "vacuum": {"start": "start", "pause": "pause", "stop": "stop", "return_to_base": "return_to_base", "locate": "locate"},
    "scene": {"activate": "turn_on", "turn_on": "turn_on"},
    "script": {"run": "turn_on", "turn_on": "turn_on"},
    # turn_on/turn_off enable or disable the automation; trigger runs it now.
    "automation": {"trigger": "trigger", "turn_on": "turn_on", "turn_off": "turn_off", "toggle": "toggle"},
    "media_player": {"play": "media_play", "pause": "media_pause", "play_pause": "media_play_pause", "next": "media_next_track", "turn_off": "turn_off", "turn_on": "turn_on"},
}


def resolve_action(domain: str, action: str, value: float | None = None) -> tuple[str, dict[str, Any]]:
    """Map a user action (plus optional numeric value) to a HA service name and service data.

    Value actions:
    - light: brightness (1–100 %), color_temp (1000–10000 K)
    - fan: percentage (0–100)
    - cover: position (0–100)
    - climate: set_temperature (5–35 °C)
    """
    if domain not in _SIMPLE_ACTIONS:
        raise ValueError(f"Unsupported domain '{domain}'")
    if action in _SIMPLE_ACTIONS[domain]:
        return _SIMPLE_ACTIONS[domain][action], {}

    if domain == "light" and action == "brightness":
        return "turn_on", {"brightness_pct": round(_need(value, 1, 100, "Brightness"))}
    if domain == "light" and action == "color_temp":
        return "turn_on", {"color_temp_kelvin": round(_need(value, 1000, 10000, "Color temperature"))}
    if domain == "fan" and action == "percentage":
        return "set_percentage", {"percentage": round(_need(value, 0, 100, "Percentage"))}
    if domain == "cover" and action == "position":
        return "set_cover_position", {"position": round(_need(value, 0, 100, "Position"))}
    if domain == "media_player" and action == "volume":
        return "volume_set", {"volume_level": round(_need(value, 0, 100, "Volume")) / 100}
    if domain == "climate" and action == "set_temperature":
        return "set_temperature", {"temperature": round(_need(value, 5, 35, "Temperature") * 2) / 2}
    raise ValueError(f"Invalid action '{action}' for domain '{domain}'")


# Attributes the family UI needs, per domain – everything else (IP addresses,
# firmware, internal ids …) stays on the server.
_PUBLIC_ATTRIBUTES: dict[str, tuple[str, ...]] = {
    "light": ("brightness", "color_temp_kelvin", "min_color_temp_kelvin", "max_color_temp_kelvin", "supported_color_modes"),
    "fan": ("percentage", "percentage_step"),
    "cover": ("current_position",),
    "climate": ("current_temperature", "temperature", "min_temp", "max_temp", "target_temp_step", "hvac_action", "hvac_modes"),
    "vacuum": ("battery_level", "status"),
    "automation": ("last_triggered",),
    "script": ("last_triggered",),
    "media_player": ("volume_level", "media_title", "media_artist"),
}


async def todo_items(base_url: str, token: str, entity_id: str) -> list[dict]:
    """A to-do list's items – summary, uid and status (needs_action | completed)."""
    if ha_sim.is_sim(base_url):
        raise HomeAssistantError("The simulated home has no to-do lists")
    if gateway.is_gateway(base_url):
        try:
            return list(await gateway.request(base_url, "todo_items", entity_id=entity_id) or [])
        except gateway.GatewayError as exc:
            raise HomeAssistantError(str(exc)) from exc
    url = base_url.rstrip("/") + "/api/services/todo/get_items?return_response"
    async with httpx.AsyncClient(timeout=HA_TIMEOUT) as client:
        resp = await client.post(url, headers={"Authorization": f"Bearer {token}"}, json={"entity_id": entity_id})
    if resp.status_code != 200:
        raise HomeAssistantError(f"HA returned {resp.status_code}")
    return list(resp.json().get("service_response", {}).get(entity_id, {}).get("items", []))


# --- Automations (Home Assistant's config API; needs an admin user's token) -------------------


async def can_manage_automations(base_url: str, token: str) -> bool:
    """Reading an automation that doesn't exist answers 404 for an admin token, 401 otherwise."""
    if ha_sim.is_sim(base_url) or gateway.is_gateway(base_url):
        return False  # the simulated home has no automation engine; a gateway never edits them
    url = base_url.rstrip("/") + "/api/config/automation/config/smooth_family_probe"
    try:
        async with httpx.AsyncClient(timeout=HA_TIMEOUT) as client:
            resp = await client.get(url, headers={"Authorization": f"Bearer {token}"})
        return resp.status_code == 404
    except httpx.HTTPError:
        return False


async def get_automation(base_url: str, token: str, automation_id: str) -> dict | None:
    url = base_url.rstrip("/") + f"/api/config/automation/config/{automation_id}"
    async with httpx.AsyncClient(timeout=HA_TIMEOUT) as client:
        resp = await client.get(url, headers={"Authorization": f"Bearer {token}"})
    if resp.status_code == 404:
        return None
    if resp.status_code != 200:
        raise HomeAssistantError(f"HA returned {resp.status_code}")
    return resp.json()


async def save_automation(base_url: str, token: str, automation_id: str, config: dict) -> None:
    """Creates or replaces the automation (Home Assistant reloads its automations)."""
    url = base_url.rstrip("/") + f"/api/config/automation/config/{automation_id}"
    async with httpx.AsyncClient(timeout=HA_TIMEOUT) as client:
        resp = await client.post(url, headers={"Authorization": f"Bearer {token}"}, json=config)
    if resp.status_code != 200:
        raise HomeAssistantError(f"Home Assistant didn't save the automation ({resp.status_code}): {resp.text[:200]}")


async def delete_automation(base_url: str, token: str, automation_id: str) -> None:
    url = base_url.rstrip("/") + f"/api/config/automation/config/{automation_id}"
    async with httpx.AsyncClient(timeout=HA_TIMEOUT) as client:
        resp = await client.delete(url, headers={"Authorization": f"Bearer {token}"})
    if resp.status_code not in (200, 404):
        raise HomeAssistantError(f"Home Assistant didn't remove the automation ({resp.status_code})")


async def ws_call(base_url: str, token: str, message: dict) -> Any:
    """One request over Home Assistant's WebSocket API (e.g. browsing a speaker's media)."""
    if ha_sim.is_sim(base_url):
        return await ha_sim.browse(message)
    if gateway.is_gateway(base_url):
        raise HomeAssistantError("Not available through the gateway")
    import json

    import websockets

    from app.services.ha_live import websocket_url

    async with websockets.connect(websocket_url(base_url), open_timeout=HA_TIMEOUT) as ws:
        await ws.recv()  # auth_required
        await ws.send(json.dumps({"type": "auth", "access_token": token}))
        if json.loads(await ws.recv()).get("type") != "auth_ok":
            raise HomeAssistantError("Home Assistant rejected the token")
        await ws.send(json.dumps({"id": 1, **message}))
        while True:
            reply = json.loads(await ws.recv())
            if reply.get("id") == 1:
                if not reply.get("success"):
                    raise HomeAssistantError((reply.get("error") or {}).get("message", "Home Assistant said no"))
                return reply.get("result")


def public_attributes(domain: str, attributes: dict[str, Any]) -> dict[str, Any]:
    out = {k: attributes[k] for k in _PUBLIC_ATTRIBUTES.get(domain, ()) if attributes.get(k) is not None}
    if "brightness" in out:  # HA reports 0–255; the UI works in percent
        out["brightness"] = round(out["brightness"] / 255 * 100)
    if "volume_level" in out:  # 0–1 in HA
        out["volume_level"] = round(out["volume_level"] * 100)
    return out

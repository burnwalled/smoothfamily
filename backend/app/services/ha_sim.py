"""A simulated Home Assistant, for demo families and for trying things out in development.

A connection with the address `sim://<family id>` is answered here instead of by a real Home
Assistant: a made-up home with lights, a coffee machine, blinds, a thermostat, a robot vacuum,
scenes, two Sonos speakers with a small music library, and the family's people. Service calls
change the state like the real thing would, the open apps refresh, and flows that start on a
change run – so devices, flows and presence can be tried without any hardware.

The state lives in memory and starts over when the server restarts.
"""
import asyncio
import copy
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

log = logging.getLogger(__name__)

PREFIX = "sim://"

PEOPLE = ("anna", "erik", "maja", "leo")

# Entity → (friendly name, state, attributes)
_HOME: dict[str, tuple[str, str, dict]] = {
    "light.kitchen": ("Kitchen ceiling", "on", {"brightness": 200, "supported_color_modes": ["brightness"]}),
    "light.living_room": ("Living room lamp", "off", {"brightness": 0, "supported_color_modes": ["color_temp"], "color_temp_kelvin": 2700, "min_color_temp_kelvin": 2200, "max_color_temp_kelvin": 6500}),
    "light.hall": ("Hall", "off", {"brightness": 0, "supported_color_modes": ["brightness"]}),
    "light.kids_room": ("Kids' room", "off", {"brightness": 0, "supported_color_modes": ["brightness"]}),
    "switch.coffee_machine": ("Coffee machine", "off", {}),
    "cover.living_room_blinds": ("Living room blinds", "open", {"current_position": 100}),
    "climate.living_room": ("Thermostat", "heat", {"current_temperature": 21.5, "temperature": 21.0, "min_temp": 7, "max_temp": 30, "target_temp_step": 0.5, "hvac_modes": ["off", "heat"], "hvac_action": "idle"}),
    "vacuum.robot": ("Robot vacuum", "docked", {"battery_level": 100, "status": "Docked"}),
    "scene.movie_night": ("Movie night", "scening", {}),
    "scene.good_night": ("Good night", "scening", {}),
    "media_player.kitchen_sonos": ("Kitchen Sonos", "idle", {"volume_level": 0.25}),
    "media_player.bathroom_sonos": ("Bathroom Sonos", "idle", {"volume_level": 0.2}),
    **{f"person.{p}": (p.title(), "home", {}) for p in PEOPLE},
    **{f"sensor.home_{p}_direction_of_travel": (f"{p.title()} direction of travel", "stationary", {}) for p in PEOPLE},
    # Health (3.4.0): steps and sleep from each person's phone, a scale and a watch.
    **{f"sensor.{p}_phone_steps": (f"{p.title()}'s phone Steps", str(4200 + i * 1350), {"unit_of_measurement": "steps", "state_class": "total_increasing"}) for i, p in enumerate(PEOPLE)},
    **{f"sensor.{p}_phone_sleep_duration": (f"{p.title()}'s phone Sleep duration", str(7.5 + i * 0.25), {"unit_of_measurement": "h", "device_class": "duration"}) for i, p in enumerate(PEOPLE)},
    **{f"sensor.{p}_resting_heart_rate": (f"{p.title()} Resting heart rate", str(58 + i * 4), {"unit_of_measurement": "bpm"}) for i, p in enumerate(PEOPLE)},
    "sensor.withings_weight": ("Withings Weight", "78.4", {"unit_of_measurement": "kg", "device_class": "weight"}),
}

# What the speakers can play: a small tree like HA's media browser gives for Sonos.
_LIBRARY = {
    "": [
        {"title": "Sonos favourites", "media_content_id": "favorites", "media_content_type": "favorites", "can_play": False, "can_expand": True},
        {"title": "Spotify playlists", "media_content_id": "spotify:playlists", "media_content_type": "spotify", "can_play": False, "can_expand": True},
        {"title": "Radio", "media_content_id": "radio", "media_content_type": "directory", "can_play": False, "can_expand": True},
    ],
    "favorites": [
        {"title": "Morning", "media_content_id": "FV:2/1", "media_content_type": "favorite_item_id", "can_play": True, "can_expand": False},
        {"title": "Calm evening", "media_content_id": "FV:2/2", "media_content_type": "favorite_item_id", "can_play": True, "can_expand": False},
        {"title": "Kids' songs", "media_content_id": "FV:2/3", "media_content_type": "favorite_item_id", "can_play": True, "can_expand": False},
    ],
    "spotify:playlists": [
        {"title": "Morning coffee", "media_content_id": "spotify:playlist:sim-morning", "media_content_type": "playlist", "can_play": True, "can_expand": False},
        {"title": "Dinner jazz", "media_content_id": "spotify:playlist:sim-jazz", "media_content_type": "playlist", "can_play": True, "can_expand": False},
        {"title": "Friday party", "media_content_id": "spotify:playlist:sim-party", "media_content_type": "playlist", "can_play": True, "can_expand": False},
    ],
    "radio": [
        {"title": "P1", "media_content_id": "radio:p1", "media_content_type": "music", "can_play": True, "can_expand": False},
        {"title": "P3", "media_content_id": "radio:p3", "media_content_type": "music", "can_play": True, "can_expand": False},
    ],
}
_TITLES = {item["media_content_id"]: item["title"] for items in _LIBRARY.values() for item in items}

# Exposed in a demo family: (entity, shown name in each language, allowed for children).
DEMO_DEVICES = [
    ("light.kitchen", True), ("light.living_room", True), ("light.hall", True), ("light.kids_room", True),
    ("switch.coffee_machine", False), ("cover.living_room_blinds", True), ("climate.living_room", False),
    ("vacuum.robot", False), ("scene.movie_night", True), ("scene.good_night", True),
    ("media_player.kitchen_sonos", True), ("media_player.bathroom_sonos", True),
]

_homes: dict[str, dict[str, dict]] = {}


def is_sim(base_url: str) -> bool:
    return base_url.startswith(PREFIX)


def address(family_id: uuid.UUID) -> str:
    return f"{PREFIX}{family_id}"


def friendly_name(entity_id: str) -> str:
    return _HOME[entity_id][0]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _home(base_url: str) -> dict[str, dict]:
    key = base_url[len(PREFIX):]
    if key not in _homes:
        _homes[key] = {
            entity: {"entity_id": entity, "state": state, "attributes": {"friendly_name": name, **copy.deepcopy(attrs)}, "last_changed": _now()}
            for entity, (name, state, attrs) in _HOME.items()
        }
    return _homes[key]


def reset(base_url: str | None = None) -> None:
    if base_url is None:
        _homes.clear()
    else:
        _homes.pop(base_url[len(PREFIX):], None)


def _entry(entity_id: str) -> tuple[str, str, str] | None:
    """The (entry id, integration, title) a simulated health sensor comes from: each person's phone
    with the companion app, and a Withings scale."""
    for person in PEOPLE:
        if entity_id.startswith(f"sensor.{person}_"):
            return f"sim-phone-{person}", "mobile_app", f"{person.title()}'s phone"
    if entity_id.startswith("sensor.withings_"):
        return "sim-withings-anna", "withings", "Anna"
    return None


async def render_template(base_url: str, template: str) -> str:
    """Only the one template Smooth Family renders: each sensor with its integration and account."""
    import json

    rows = []
    for entity_id, state in _home(base_url).items():
        entry = _entry(entity_id) if entity_id.startswith("sensor.") else None
        if entry:
            rows.append({"e": entity_id, "s": state["state"], "u": state["attributes"].get("unit_of_measurement"), "c": state["attributes"].get("device_class"),
                         "n": state["attributes"].get("friendly_name"), "id": entry[0], "d": entry[1], "t": entry[2]})
    return json.dumps(rows)


async def get_states(base_url: str) -> list[dict]:
    return copy.deepcopy(list(_home(base_url).values()))


async def get_state(base_url: str, entity_id: str) -> dict:
    home = _home(base_url)
    if entity_id not in home:
        from app.services.homeassistant import HomeAssistantError

        raise HomeAssistantError("HA returned 404")
    return copy.deepcopy(home[entity_id])


def _set(home: dict, entity_id: str, state: str | None = None, changed: list | None = None, **attrs: Any) -> None:
    entity = home.get(entity_id)
    if entity is None:
        return
    old = entity["state"]
    if state is not None and state != old:
        entity["state"] = state
        entity["last_changed"] = _now()
        if changed is not None:
            changed.append((entity_id, old, state))
    entity["attributes"].update(attrs)


def _apply(home: dict, domain: str, service: str, entity_id: str, data: dict, changed: list) -> None:
    entity = home.get(entity_id)
    if entity is None:
        return
    state = entity["state"]
    attrs = entity["attributes"]
    if domain in ("light", "switch", "fan"):
        on = {"turn_on": True, "turn_off": False, "toggle": state != "on"}.get(service, state == "on")
        if domain == "light":
            if "brightness_pct" in data:
                on = True
                attrs["brightness"] = round(data["brightness_pct"] / 100 * 255)
            if "color_temp_kelvin" in data:
                on = True
                attrs["color_temp_kelvin"] = data["color_temp_kelvin"]
            if on and not attrs.get("brightness"):
                attrs["brightness"] = 255
            if not on:
                attrs["brightness"] = 0
        _set(home, entity_id, "on" if on else "off", changed)
    elif domain == "cover":
        position = {"open_cover": 100, "close_cover": 0}.get(service, data.get("position", attrs.get("current_position", 0)))
        if service == "stop_cover":
            position = attrs.get("current_position", 0)
        _set(home, entity_id, "open" if position > 0 else "closed", changed, current_position=position)
    elif domain == "climate":
        if service == "set_temperature":
            _set(home, entity_id, None, changed, temperature=data["temperature"])
        else:
            _set(home, entity_id, "off" if service == "turn_off" else "heat", changed)
        heating = home[entity_id]["state"] == "heat" and attrs["temperature"] > attrs["current_temperature"]
        attrs["hvac_action"] = "heating" if heating else "idle"
    elif domain == "vacuum":
        new = {"start": "cleaning", "pause": "paused", "stop": "idle", "return_to_base": "returning", "locate": state}.get(service, state)
        _set(home, entity_id, new, changed, status=new.title())
    elif domain == "scene" and service == "turn_on":
        if entity_id == "scene.movie_night":
            for light in ("light.kitchen", "light.hall", "light.kids_room"):
                _apply(home, "light", "turn_off", light, {}, changed)
            _apply(home, "light", "turn_on", "light.living_room", {"brightness_pct": 25}, changed)
            _apply(home, "cover", "close_cover", "cover.living_room_blinds", {}, changed)
        elif entity_id == "scene.good_night":
            for light in ("light.kitchen", "light.living_room", "light.hall", "light.kids_room"):
                _apply(home, "light", "turn_off", light, {}, changed)
            for speaker in ("media_player.kitchen_sonos", "media_player.bathroom_sonos"):
                _apply(home, "media_player", "media_pause", speaker, {}, changed)
        _set(home, entity_id, None, changed, last_triggered=_now())
    elif domain == "media_player":
        if service == "volume_set":
            _set(home, entity_id, None, changed, volume_level=data["volume_level"])
        elif service == "join":
            for member in data.get("group_members", []):
                if member in home:
                    home[member]["attributes"]["group_leader"] = entity_id
            attrs["group_members"] = [entity_id, *data.get("group_members", [])]
        elif service == "play_media":
            title = _TITLES.get(data.get("media_content_id"), data.get("media_content_id"))
            for speaker in attrs.get("group_members") or [entity_id]:
                _set(home, speaker, "playing", changed, media_title=title, media_artist="Simulated")
        elif service in ("media_play", "media_pause", "media_play_pause", "turn_off", "turn_on", "media_next_track"):
            new = {
                "media_play": "playing", "media_pause": "paused", "turn_off": "off", "turn_on": "idle",
                "media_play_pause": "paused" if state == "playing" else "playing", "media_next_track": state,
            }[service]
            if new == "playing" and not attrs.get("media_title"):
                attrs["media_title"] = "Morning"
            for speaker in attrs.get("group_members") or [entity_id]:
                _set(home, speaker, new, changed)


async def call_service(base_url: str, domain: str, service: str, entity_id: str, data: dict | None = None) -> bool:
    from app.services.homeassistant import HomeAssistantError

    home = _home(base_url)
    if entity_id not in home:
        raise HomeAssistantError("HA service call returned 400")
    changed: list[tuple[str, str, str]] = []
    _apply(home, domain, service, entity_id, data or {}, changed)
    _announce(base_url, changed)
    return True


def move_person(base_url: str, person: str, state: str, direction: str | None = None, announce: bool = True) -> None:
    """The simulator's own control: someone comes home, leaves or is on the way."""
    home = _home(base_url)
    changed: list[tuple[str, str, str]] = []
    _set(home, person, state, changed)
    sensor = "sensor.home_" + person.split(".", 1)[1] + "_direction_of_travel"
    if direction is not None:
        _set(home, sensor, direction, changed)
    if announce:
        _announce(base_url, changed)


def _announce(base_url: str, changed: list[tuple[str, str, str]]) -> None:
    """Like Home Assistant's state_changed events: open apps refresh and flows react."""
    if not changed:
        return
    try:
        family_id = uuid.UUID(base_url[len(PREFIX):])
        loop = asyncio.get_running_loop()
    except (ValueError, RuntimeError):
        return
    loop.create_task(_after_change(family_id, changed))


async def _after_change(family_id: uuid.UUID, changed: list[tuple[str, str, str]]) -> None:
    from app.services.events import publish_family
    from app.services.ha_live import _flows_on_change

    try:
        await publish_family(family_id, ["smarthome", "presence"])
        for entity_id, old, new in changed:
            await _flows_on_change(family_id, entity_id, old, new)
    except Exception:
        log.exception("Simulated Home Assistant: could not pass on a change")


async def browse(message: dict) -> dict:
    key = message.get("media_content_id") or ""
    if message.get("type") == "media_source/browse_media":
        key = {"": "radio", "media-source://radio_browser": "radio"}.get(key, key)
    return {"children": copy.deepcopy(_LIBRARY.get(key, []))}


async def set_up(db, family_id: uuid.UUID, names: dict[str, str] | None = None) -> None:
    """Connects the family to the simulated home and exposes its devices (children may use the
    lights, blinds, scenes and speakers). Replaces a real connection; not committed."""
    from sqlalchemy import delete, select

    from app.models import ExposedDevice, SmarthomeConnection, User
    from app.services import smarthome_conn
    from app.services.crypto import encrypt_token

    conn = await smarthome_conn.primary(db, family_id)
    if conn is None:
        conn = SmarthomeConnection(family_id=family_id, provider="home_assistant", base_url=address(family_id), token_encrypted=encrypt_token("simulated"))
        db.add(conn)
    else:
        conn.base_url = address(family_id)
        conn.token_encrypted = encrypt_token("simulated")
        await db.execute(delete(ExposedDevice).where(ExposedDevice.connection_id == conn.id))
    await db.flush()
    reset(address(family_id))
    adults = [str(u) for u in (await db.execute(select(User.id).where(User.family_id == family_id, User.role.in_(["admin", "adult"])))).scalars()]
    for position, (entity, kids) in enumerate(DEMO_DEVICES):
        db.add(
            ExposedDevice(
                family_id=family_id, connection_id=conn.id, entity_id=entity, display_name=(names or {}).get(entity, friendly_name(entity)),
                domain=entity.split(".", 1)[0], position=position, allowed_user_ids=[] if kids else adults,
            )
        )
    await db.flush()

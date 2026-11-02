"""Flows published to Home Assistant as automations (only `smooth_family_*` ids are touched)."""
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest

pytestmark = pytest.mark.asyncio


class FakeHa:
    """Home Assistant's automation config API, in memory."""

    def __init__(self):
        self.automations: dict[str, dict] = {"user_own_automation": {"id": "user_own_automation", "alias": "Mine"}}

    async def can(self, base, token):
        return True

    async def get(self, base, token, automation_id):
        return self.automations.get(automation_id)

    async def save(self, base, token, automation_id, config):
        assert automation_id.startswith("smooth_family_")
        self.automations[automation_id] = config

    async def delete(self, base, token, automation_id):
        assert automation_id.startswith("smooth_family_")
        self.automations.pop(automation_id, None)

    def patches(self):
        return (
            patch("app.services.homeassistant.can_manage_automations", self.can),
            patch("app.services.homeassistant.get_automation", self.get),
            patch("app.services.homeassistant.save_automation", self.save),
            patch("app.services.homeassistant.delete_automation", self.delete),
        )


async def _home(client, real=True):
    await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123"},
    )
    if real:
        with patch("app.routers.smarthome.ha.validate_connection", new_callable=AsyncMock, return_value=True):
            await client.put("/api/smarthome/connection", json={"base_url": "http://ha.local:8123", "token": "t"})
        devices = {}
        for entity, domain in [("light.kitchen", "light"), ("media_player.kitchen", "media_player"), ("media_player.bath", "media_player")]:
            devices[entity] = (await client.post("/api/smarthome/devices", json={"entity_id": entity, "display_name": entity, "domain": domain})).json()["id"]
        return devices
    await client.post("/api/smarthome/connection/simulated")
    return {d["entity_id"]: d["id"] for d in (await client.get("/api/smarthome/my-devices")).json()}


async def test_publish_pause_and_remove(client, db_session):
    from app.services.flows import run_time_flows

    dev = await _home(client)
    fake = FakeHa()
    a, b, c, d = fake.patches()
    with a, b, c, d:
        assert (await client.get("/api/smarthome/flows/ha")).json() == {"available": True}
        morning = {
            "name": "Morning", "run_in": "ha",
            "trigger": {"type": "time", "at": "07:00", "days": [0, 1, 2, 3, 4]},
            "conditions": [{"type": "home", "who": "somebody"}],
            "actions": [
                {"type": "media", "device_ids": [dev["media_player.kitchen"], dev["media_player.bath"]], "media_content_id": "FV:2/1", "media_content_type": "favorite_item_id", "title": "Morning", "volume": 20},
                {"type": "wait", "minutes": 30},
                {"type": "device", "device_id": dev["light.kitchen"], "action": "brightness", "value": 60},
            ],
        }
        flow = (await client.post("/api/smarthome/flows", json=morning)).json()
        assert flow["run_in"] == "ha" and flow["ha_synced_at"] and flow["last_error"] is None
        auto = fake.automations[f"smooth_family_{flow['id'].replace('-', '')}"]
        assert auto["alias"] == "Smooth Family: Morning" and auto["initial_state"] is True
        assert auto["triggers"] == [{"platform": "time", "at": "07:00:00"}]
        assert auto["conditions"] == [{"condition": "time", "weekday": ["mon", "tue", "wed", "thu", "fri"]}, {"condition": "numeric_state", "entity_id": "zone.home", "above": 0}]
        assert [x.get("action") or "delay" for x in auto["actions"]] == ["media_player.join", "media_player.volume_set", "media_player.play_media", "delay", "light.turn_on"]
        assert auto["actions"][4]["data"] == {"brightness_pct": 60}

        # Home Assistant runs it – the app doesn't as well.
        assert await run_time_flows(db_session, datetime(2026, 10, 28, 6, 0, tzinfo=timezone.utc)) == 0

        # Paused → off in Home Assistant; put back if changed there; removed with the flow.
        await client.put(f"/api/smarthome/flows/{flow['id']}/enabled", json={"enabled": False})
        key = f"smooth_family_{flow['id'].replace('-', '')}"
        assert fake.automations[key]["initial_state"] is False
        fake.automations[key] = {"alias": "changed by hand"}
        from app.services.ha_publish import run_ha_sync

        assert await run_ha_sync(db_session, datetime(2026, 10, 28, 6, 15, tzinfo=timezone.utc)) == 1
        assert fake.automations[key]["alias"] == "Smooth Family: Morning"
        # Unchanged (also in an older Home Assistant's singular keys): nothing is saved again.
        saved = dict(fake.automations[key])
        fake.automations[key] = {("trigger" if k == "triggers" else k): v for k, v in saved.items()}
        before = fake.automations[key]
        assert await run_ha_sync(db_session, datetime(2026, 10, 28, 6, 30, tzinfo=timezone.utc)) == 1  # synced, but…
        assert fake.automations[key] is before  # …not written again
        # Moved back to the app: the automation goes.
        await client.put(f"/api/smarthome/flows/{flow['id']}", json={**morning, "run_in": "app"})
        assert key not in fake.automations
        again = (await client.put(f"/api/smarthome/flows/{flow['id']}", json=morning)).json()
        assert key in fake.automations and again["run_in"] == "ha"
        assert (await client.delete(f"/api/smarthome/flows/{flow['id']}")).status_code == 204
        # Only Smooth Family's own automations were ever touched.
        assert list(fake.automations) == ["user_own_automation"]


async def test_what_needs_the_app(client):
    dev = await _home(client)
    fake = FakeHa()
    a, b, c, d = fake.patches()
    light = {"type": "device", "device_id": dev["light.kitchen"], "action": "turn_on"}
    with a, b, c, d:
        button = {"name": "x", "run_in": "ha", "trigger": {"type": "button"}, "actions": [light]}
        assert "trigger:button" in (await client.post("/api/smarthome/flows", json=button)).json()["detail"]
        notify = {"name": "x", "run_in": "ha", "trigger": {"type": "time", "at": "07:00"}, "actions": [{"type": "notify", "to": "me", "text": "hi"}]}
        assert "action:notify" in (await client.post("/api/smarthome/flows", json=notify)).json()["detail"]
        assert fake.automations == {"user_own_automation": {"id": "user_own_automation", "alias": "Mine"}}


async def test_not_on_the_simulated_home(client):
    dev = await _home(client, real=False)
    assert (await client.get("/api/smarthome/flows/ha")).json() == {"available": False}
    flow = {"name": "x", "run_in": "ha", "trigger": {"type": "time", "at": "07:00"}, "actions": [{"type": "device", "device_id": dev["light.kitchen"], "action": "turn_on"}]}
    assert (await client.post("/api/smarthome/flows", json=flow)).status_code == 409

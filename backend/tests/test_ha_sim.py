"""The simulated Home Assistant: devices react, flows run on its changes, people come and go."""
import asyncio

import pytest

pytestmark = pytest.mark.asyncio


async def _settle():
    """Let the simulator's change events (and the flows they start) run."""
    for _ in range(20):
        await asyncio.sleep(0.02)


async def test_simulated_home(client):
    from app.services import ha_sim

    resp = await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123"},
    )
    admin_id = resp.json()["id"]
    # Not simulated yet: nobody to move – an empty answer, not an error (3.2.1).
    assert (await client.get("/api/smarthome/simulator")).json() == []
    conn = (await client.post("/api/smarthome/connection/simulated")).json()
    assert conn["simulated"] is True and conn["base_url"] == ""
    devices = {d["entity_id"]: d for d in (await client.get("/api/smarthome/my-devices")).json()}
    assert devices["light.kitchen"]["state"] == "on" and devices["media_player.kitchen_sonos"]["attributes"]["volume_level"] == 25

    # A device does what it's told.
    hall, kitchen = devices["light.hall"], devices["light.kitchen"]
    await client.post(f"/api/smarthome/devices/{kitchen['id']}/action", json={"action": "brightness", "value": 40})
    states = {d["entity_id"]: d for d in (await client.get("/api/smarthome/my-devices")).json()}
    assert states["light.kitchen"]["attributes"]["brightness"] == 40

    # A flow starts on the simulator's change, like on a real Home Assistant.
    flow = {"name": "Follow the hall", "trigger": {"type": "state", "device_id": hall["id"], "to": "on"}, "actions": [{"type": "device", "device_id": kitchen["id"], "action": "turn_off"}]}
    assert (await client.post("/api/smarthome/flows", json=flow)).status_code == 201
    await client.post(f"/api/smarthome/devices/{hall['id']}/action", json={"action": "turn_on"})
    await _settle()
    states = {d["entity_id"]: d["state"] for d in (await client.get("/api/smarthome/my-devices")).json()}
    assert states["light.hall"] == "on" and states["light.kitchen"] == "off"

    # Music on two speakers from the simulated library, and a scene.
    library = (await client.get(f"/api/smarthome/media/browse?device_id={devices['media_player.kitchen_sonos']['id']}")).json()
    favourites = (await client.get(f"/api/smarthome/media/browse?device_id={devices['media_player.kitchen_sonos']['id']}&content_id=favorites&content_type=favorites")).json()
    assert [i["title"] for i in library][0] == "Sonos favourites" and favourites[0]["can_play"]
    music = {
        "name": "Music", "trigger": {"type": "button"},
        "actions": [{"type": "media", "device_ids": [devices["media_player.kitchen_sonos"]["id"], devices["media_player.bathroom_sonos"]["id"]], **{k: favourites[0][k] for k in ("media_content_id", "media_content_type")}, "title": favourites[0]["title"], "volume": 30}],
    }
    created = (await client.post("/api/smarthome/flows", json=music)).json()
    await client.post(f"/api/smarthome/flows/{created['id']}/run")
    states = {d["entity_id"]: d for d in (await client.get("/api/smarthome/my-devices")).json()}
    assert states["media_player.bathroom_sonos"]["state"] == "playing"
    assert states["media_player.kitchen_sonos"]["attributes"]["media_title"] == "Morning"
    await client.post(f"/api/smarthome/devices/{devices['scene.movie_night']['id']}/action", json={"action": "activate"})
    states = {d["entity_id"]: d for d in (await client.get("/api/smarthome/my-devices")).json()}
    assert states["cover.living_room_blinds"]["state"] == "closed" and states["light.living_room"]["attributes"]["brightness"] == 25

    # People: link, share, move them and see "who's home" follow.
    await client.put(f"/api/presence/links/{admin_id}", json={"person_entity": "person.anna", "travel_entity": "sensor.home_anna_direction_of_travel"})
    await client.put("/api/presence/me", json={"share": "travel"})
    assert (await client.get("/api/presence")).json()["members"][0]["state"] == "home"
    people = (await client.post("/api/smarthome/simulator/people", json={"entity_id": "person.anna", "state": "not_home", "direction": "towards"})).json()
    assert next(p for p in people if p["entity_id"] == "person.anna")["state"] == "not_home"
    assert (await client.get("/api/presence")).json()["members"][0]["state"] == "travel"
    await _settle()
    ha_sim.reset()


async def test_a_speaker_that_cannot_be_browsed_says_so(client, monkeypatch):
    """A speaker without a library of its own (a Spotify account with nothing playing) gets Home
    Assistant's media sources instead, marked so the picker can say why."""
    from app.services import homeassistant as ha

    await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123"},
    )
    await client.post("/api/smarthome/connection/simulated")
    devices = {d["entity_id"]: d for d in (await client.get("/api/smarthome/my-devices")).json()}
    speaker = devices["media_player.kitchen_sonos"]["id"]
    assert {i["source"] for i in (await client.get(f"/api/smarthome/media/browse?device_id={speaker}")).json()} == {"speaker"}

    real = ha.ws_call

    async def no_library(base_url, token, message):
        if message["type"] == "media_player/browse_media":
            raise ha.HomeAssistantError("Player does not support browsing media")
        return await real(base_url, token, message)

    monkeypatch.setattr(ha, "ws_call", no_library)
    items = (await client.get(f"/api/smarthome/media/browse?device_id={speaker}")).json()
    assert items and {i["source"] for i in items} == {"home_assistant"}


async def test_a_music_account_plays_on_one_of_its_own_devices(client):
    """A Spotify account among the speakers: the step says which of its devices to play on, and it
    is not grouped with other speakers."""
    await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123"},
    )
    await client.post("/api/smarthome/connection/simulated")
    devices = {d["entity_id"]: d for d in (await client.get("/api/smarthome/my-devices")).json()}
    account, kitchen = devices["media_player.spotify_anna"]["id"], devices["media_player.kitchen_sonos"]["id"]

    accounts = (await client.get("/api/smarthome/media/accounts")).json()
    assert [a["device_id"] for a in accounts] == [account] and "Living room TV" in accounts[0]["outputs"]
    # Nothing is playing, so the account has no library to show – Home Assistant's sources instead.
    assert {i["source"] for i in (await client.get(f"/api/smarthome/media/browse?device_id={account}")).json()} == {"home_assistant"}

    step = {"type": "media", "media_content_id": "spotify:playlist:sim-jazz", "media_content_type": "playlist", "title": "Dinner jazz", "volume": 30, "output": "Living room TV"}
    both = await client.post("/api/smarthome/flows", json={"name": "Both", "trigger": {"type": "button"}, "actions": [step | {"device_ids": [account, kitchen]}]})
    assert both.status_code == 422

    created = (await client.post("/api/smarthome/flows", json={"name": "Jazz", "trigger": {"type": "button"}, "actions": [step | {"device_ids": [account]}]})).json()
    assert created["actions"][0]["output"] == "Living room TV"
    await client.post(f"/api/smarthome/flows/{created['id']}/run")
    state = await ha_state(client, "media_player.spotify_anna")
    assert state["state"] == "playing" and state["attributes"]["media_title"] == "Dinner jazz"


async def ha_state(client, entity_id):
    return {d["entity_id"]: d for d in (await client.get("/api/smarthome/my-devices")).json()}[entity_id]

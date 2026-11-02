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

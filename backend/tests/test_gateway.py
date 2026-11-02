"""2.8.4: the smart home per home, and another home's Home Assistant through the gateway – paired once
with a code, answering over its own line; offline means unavailable, never queued."""
import asyncio
import json

import pytest
from fastapi import WebSocketDisconnect

pytestmark = pytest.mark.asyncio

CABIN = [
    {"entity_id": "light.porch", "state": "off", "attributes": {"friendly_name": "Porch"}},
    {"entity_id": "climate.cabin", "state": "heat", "attributes": {"friendly_name": "Heat pump", "temperature": 12}},
]


class FakeGateway:
    """Stands in for the gateway's websocket: answers the server's calls like the real one."""

    def __init__(self):
        self.inbox: asyncio.Queue = asyncio.Queue()
        self.calls: list[dict] = []

    async def send_text(self, text: str) -> None:
        msg = json.loads(text)
        result = None
        if msg["op"] == "states":
            result = CABIN
        elif msg["op"] == "state":
            result = next(s for s in CABIN if s["entity_id"] == msg["entity_id"])
        else:
            self.calls.append(msg)
        await self.inbox.put(json.dumps({"id": msg["id"], "ok": True, "result": result}))

    async def receive_text(self) -> str:
        text = await self.inbox.get()
        if text is None:
            raise WebSocketDisconnect()
        return text

    async def close(self) -> None:
        await self.inbox.put(None)


async def _setup(client):
    await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123"},
    )


async def test_the_cabin_through_the_gateway(client):
    from app.services import gateway

    await _setup(client)
    cabin = (await client.post("/api/property/properties", json={"name": "Stugan"})).json()
    added = await client.post("/api/smarthome/gateways", json={"name": "Stugan", "property_id": cabin["id"]})
    assert added.status_code == 201, added.text
    conn, code = added.json()["connection"], added.json()["code"]
    assert conn["kind"] == "gateway" and conn["pairing"] and not conn["online"] and conn["property_name"] == "Stugan"

    # Pairing: a wrong code is refused; the right one once, with spaces and small letters.
    assert (await client.post("/api/gateway/pair", json={"code": "ABCDEFGH"})).status_code == 401
    paired = await client.post("/api/gateway/pair", json={"code": f"{code[:4].lower()} {code[4:]}", "version": "1.0.0"})
    assert paired.status_code == 200 and paired.json()["name"] == "Stugan"
    assert (await client.post("/api/gateway/pair", json={"code": code})).status_code == 401

    # Offline: nothing to list, and no command is queued.
    assert (await client.get(f"/api/smarthome/entities?connection_id={conn['id']}")).status_code == 502

    fake = FakeGateway()
    line = asyncio.create_task(gateway.serve(__import__("uuid").UUID(conn["id"]), fake, {"op": "hello", "version": "1.0.0", "domains": ["light", "climate"]}))
    await asyncio.sleep(0)
    homes = (await client.get("/api/smarthome/connections")).json()
    assert [h["online"] for h in homes] == [True] and not homes[0]["pairing"]

    entities = (await client.get(f"/api/smarthome/entities?connection_id={conn['id']}")).json()
    assert {e["entity_id"] for e in entities} == {"light.porch", "climate.cabin"}
    device = (await client.post("/api/smarthome/devices", json={"entity_id": "light.porch", "display_name": "Porch", "domain": "light", "connection_id": conn["id"]})).json()
    assert device["connection_id"] == conn["id"]

    mine = (await client.get("/api/smarthome/my-devices")).json()
    assert mine[0]["state"] == "off" and mine[0]["online"]
    assert (await client.post(f"/api/smarthome/devices/{device['id']}/action", json={"action": "turn_on"})).status_code == 200
    assert fake.calls[-1]["domain"] == "light" and fake.calls[-1]["service"] == "turn_on" and fake.calls[-1]["entity_id"] == "light.porch"

    # The gateway goes away: its devices show as unavailable, commands fail at once.
    await fake.close()
    with pytest.raises(WebSocketDisconnect):
        await line
    mine = (await client.get("/api/smarthome/my-devices")).json()
    assert mine[0]["state"] == "unavailable" and not mine[0]["online"]
    assert (await client.post(f"/api/smarthome/devices/{device['id']}/action", json={"action": "turn_off"})).status_code == 502

    # A new code makes the old key useless.
    renewed = (await client.post(f"/api/smarthome/gateways/{conn['id']}/pairing")).json()
    assert renewed["connection"]["pairing"] and renewed["code"] != code


async def test_the_main_home_assistant_stays_the_one_flows_use(client, db_session):
    from app.services import smarthome_conn

    await _setup(client)
    assert (await client.post("/api/smarthome/connection/simulated", json={})).status_code == 200
    await client.post("/api/smarthome/gateways", json={"name": "Stugan"})
    homes = (await client.get("/api/smarthome/connections")).json()
    assert [h["kind"] for h in homes] == ["simulated", "gateway"]
    me = (await client.get("/api/auth/me")).json()
    main = await smarthome_conn.primary(db_session, __import__("uuid").UUID(me["family_id"]))
    assert str(main.id) == homes[0]["id"]
    # Linking the main one to a home.
    home = (await client.post("/api/property/properties", json={"name": "Villan"})).json()
    linked = (await client.patch(f"/api/smarthome/connections/{homes[0]['id']}", json={"property_id": home["id"]})).json()
    assert linked["property_name"] == "Villan"
    assert (await client.delete(f"/api/smarthome/connections/{homes[1]['id']}")).status_code == 204



async def test_a_list_goes_to_a_home_assistant_todo_list(client):
    """Home Assistant passes it on to the shop (ICA, Coop …) through its own integration."""
    from app.services import gateway

    await _setup(client)
    added = (await client.post("/api/smarthome/gateways", json={"name": "Stugan"})).json()
    await client.post("/api/gateway/pair", json={"code": added["code"]})
    conn_id = added["connection"]["id"]

    class TodoGateway(FakeGateway):
        async def send_text(self, text):
            import json as _json

            msg = _json.loads(text)
            if msg["op"] == "states":
                await self.inbox.put(_json.dumps({"id": msg["id"], "ok": True, "result": CABIN + [{"entity_id": "todo.ica_handla", "state": "0", "attributes": {"friendly_name": "ICA Handla"}}]}))
            else:
                await super().send_text(text)

    fake = TodoGateway()
    line = asyncio.create_task(gateway.serve(__import__("uuid").UUID(conn_id), fake, {"op": "hello"}))
    await asyncio.sleep(0)

    shop = (await client.post("/api/lists", json={"name": "Handla"})).json()
    for name in ("Mjölk", "Bröd"):
        await client.post(f"/api/lists/{shop['id']}/items", json={"name": name})
    bread = (await client.get(f"/api/lists/{shop['id']}/items")).json()[1]
    await client.patch(f"/api/lists/{shop['id']}/items/{bread['id']}", json={"done": True})

    targets = (await client.get("/api/lists/ha/targets")).json()
    assert targets == [{"connection_id": conn_id, "home": None, "entity_id": "todo.ica_handla", "name": "ICA Handla"}]
    assert (await client.post(f"/api/lists/{shop['id']}/to-ha", json={"connection_id": conn_id, "entity_id": "light.porch"})).status_code == 422
    sent = (await client.post(f"/api/lists/{shop['id']}/to-ha", json={"connection_id": conn_id, "entity_id": "todo.ica_handla"})).json()
    assert sent == {"sent": 1}
    assert [(c["domain"], c["service"], c["entity_id"], c["data"]) for c in fake.calls] == [("todo", "add_item", "todo.ica_handla", {"item": "Mjölk"})]
    await fake.close()
    with pytest.raises(WebSocketDisconnect):
        await line


class TodoHome(FakeGateway):
    """A Home Assistant with one to-do list, as a shop's integration keeps it."""

    def __init__(self, items):
        super().__init__()
        self.items = items  # [{uid, summary, status}]
        self.next = 100

    async def send_text(self, text):
        import json as _json

        msg = _json.loads(text)
        result = None
        if msg["op"] == "states":
            result = [{"entity_id": "todo.ica_handla", "state": "0", "attributes": {"friendly_name": "ICA Handla"}}]
        elif msg["op"] == "todo_items":
            result = [dict(i) for i in self.items]
        elif msg["op"] == "call":
            data = msg["data"]
            if msg["service"] == "add_item":
                self.next += 1
                self.items.append({"uid": f"u{self.next}", "summary": data["item"], "status": "needs_action"})
            elif msg["service"] == "update_item":
                next(i for i in self.items if i["uid"] == data["item"])["status"] = data["status"]
            elif msg["service"] == "remove_item":
                self.items = [i for i in self.items if i["uid"] not in data["item"]]
            self.calls.append(msg)
        await self.inbox.put(_json.dumps({"id": msg["id"], "ok": True, "result": result}))


async def test_a_list_linked_both_ways_with_home_assistant(client):
    """2.8.4: added here → there, added in the shop's app → here, ticked there → ticked here and
    offered for the pantry, ticked here → ticked there; never twice."""
    from app.services import gateway

    await _setup(client)
    added = (await client.post("/api/smarthome/gateways", json={"name": "Hemma"})).json()
    await client.post("/api/gateway/pair", json={"code": added["code"]})
    conn_id = added["connection"]["id"]
    home = TodoHome([{"uid": "k1", "summary": "Kaffe", "status": "needs_action"}])
    line = asyncio.create_task(gateway.serve(__import__("uuid").UUID(conn_id), home, {"op": "hello"}))
    await asyncio.sleep(0)

    shop = (await client.post("/api/lists", json={"name": "Handla"})).json()
    for name, category in (("Mjölk", "dairy"), ("Kaffe", "pantry")):
        await client.post(f"/api/lists/{shop['id']}/items", json={"name": name, "category": category})
    link = await client.put(f"/api/lists/{shop['id']}/ha", json={"connection_id": conn_id, "entity_id": "todo.ica_handla"})
    assert link.status_code == 200 and link.json()["last_error"] is None
    # Kaffe was already there: matched, not added twice.
    assert sorted(i["summary"] for i in home.items) == ["Kaffe", "Mjölk"]

    # Bread added in the shop's app; the milk bought there.
    home.items.append({"uid": "b1", "summary": "Bröd", "status": "needs_action"})
    next(i for i in home.items if i["summary"] == "Mjölk")["status"] = "completed"
    result = (await client.post(f"/api/lists/{shop['id']}/ha/sync")).json()
    assert result["added_here"] == 1 and result["ticked_here"] == 1
    items = {i["name"]: i for i in (await client.get(f"/api/lists/{shop['id']}/items")).json()}
    assert set(items) == {"Mjölk", "Kaffe", "Bröd"} and items["Mjölk"]["done"]

    # The coffee ticked off here: ticked off there.
    await client.patch(f"/api/lists/{shop['id']}/items/{items['Kaffe']['id']}", json={"done": True})
    assert (await client.post(f"/api/lists/{shop['id']}/ha/sync")).json()["ticked_there"] == 1
    assert next(i for i in home.items if i["uid"] == "k1")["status"] == "completed"

    # The bread removed here: removed there.
    assert (await client.delete(f"/api/lists/{shop['id']}/items/{items['Bröd']['id']}")).status_code == 204
    assert [i["summary"] for i in home.items if i["uid"] == "b1"] == []

    # Just bought: the milk, to the fridge.
    bought = (await client.get("/api/pantry/bought")).json()
    assert [(b["name"], b["place"], b["food"]) for b in bought] == [("Mjölk", "fridge", True)]
    assert (await client.post("/api/pantry/bought", json={"items": [{"item_id": bought[0]["id"], "keep": True, "place": "fridge"}]})).status_code == 200
    assert (await client.get("/api/pantry/bought")).json() == []
    assert [p["name"] for p in (await client.get("/api/pantry")).json()] == ["Mjölk"]

    # Home Assistant away: the link says so, nothing is lost.
    await home.close()
    with pytest.raises(WebSocketDisconnect):
        await line
    await client.post(f"/api/lists/{shop['id']}/ha/sync")
    assert (await client.get(f"/api/lists/{shop['id']}/ha")).json()["last_error"]
    assert (await client.delete(f"/api/lists/{shop['id']}/ha")).status_code == 204
    assert (await client.get(f"/api/lists/{shop['id']}/ha")).json() is None

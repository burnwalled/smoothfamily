"""The gateway program (gateway/gateway.py): what it lets the server read and control, and how it is
configured as an add-on or on its own."""
import importlib.util
import json
import pathlib

import pytest

_PATH = pathlib.Path(__file__).resolve().parents[2] / "gateway" / "gateway.py"
_spec = importlib.util.spec_from_file_location("sf_gateway", _PATH)
gw = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gw)


def _cfg(**env):
    return gw.load_config(environ=env, options_file="/nonexistent/options.json")


def test_only_allowed_domains_are_read_or_controlled():
    cfg = _cfg()
    assert gw.refusal({"op": "states"}, cfg) is None
    assert gw.refusal({"op": "state", "entity_id": "light.porch"}, cfg) is None
    assert gw.refusal({"op": "call", "domain": "light", "service": "turn_on", "entity_id": "light.porch"}, cfg) is None
    # Locks and alarms only when the owner adds them.
    assert gw.refusal({"op": "call", "domain": "lock", "service": "unlock", "entity_id": "lock.front_door"}, cfg)
    assert gw.refusal({"op": "state", "entity_id": "lock.front_door"}, cfg)
    # A call can't switch something of another domain, or use a made-up service.
    assert gw.refusal({"op": "call", "domain": "light", "service": "turn_on", "entity_id": "lock.front_door"}, cfg)
    assert gw.refusal({"op": "call", "domain": "light", "service": "turn_on/../../x", "entity_id": "light.porch"}, cfg)
    assert gw.refusal({"op": "shell", "entity_id": "light.porch"}, cfg)
    opened = _cfg(SF_CONTROL_DOMAINS="light,lock")
    assert gw.refusal({"op": "call", "domain": "lock", "service": "unlock", "entity_id": "lock.front_door"}, opened) is None
    assert "lock" in opened["read_domains"]


def test_configured_as_an_add_on_or_on_its_own(tmp_path):
    options = tmp_path / "options.json"
    options.write_text(json.dumps({"server": "https://family.example.com/", "pairing_code": "ABCD2345", "read_domains": [], "control_domains": []}))
    addon = gw.load_config(environ={"SUPERVISOR_TOKEN": "sv"}, options_file=str(options))
    assert addon["server"] == "https://family.example.com" and addon["ha_url"] == "http://supervisor/core" and addon["ha_token"] == "sv"
    assert addon["control_domains"] == gw.CONTROL_DOMAINS
    alone = _cfg(SF_SERVER="https://x.example", HA_URL="http://ha.local:8123/", HA_TOKEN="t")
    assert alone["ha_url"] == "http://ha.local:8123" and alone["ha_token"] == "t"


@pytest.mark.asyncio
async def test_service_data_cannot_aim_at_other_entities():
    import httpx

    sent = []

    def handler(request: httpx.Request) -> httpx.Response:
        sent.append(json.loads(request.content))
        return httpx.Response(200, json=[])

    async with httpx.AsyncClient(base_url="http://ha", transport=httpx.MockTransport(handler)) as ha:
        msg = {"id": "1", "op": "call", "domain": "light", "service": "turn_on", "entity_id": "light.porch", "data": {"brightness_pct": 50, "entity_id": "lock.front_door", "area_id": "house"}}
        answer = await gw.answer(msg, _cfg(), ha)
    assert answer == {"id": "1", "ok": True, "result": None}
    assert sent == [{"brightness_pct": 50, "entity_id": "light.porch"}]


def test_todo_items_only_for_todo_lists():
    cfg = _cfg()
    assert gw.refusal({"op": "todo_items", "entity_id": "todo.ica_handla"}, cfg) is None
    assert gw.refusal({"op": "todo_items", "entity_id": "light.porch"}, cfg)
    assert gw.refusal({"op": "todo_items", "entity_id": "todo.x"}, _cfg(SF_READ_DOMAINS="light", SF_CONTROL_DOMAINS="light"))

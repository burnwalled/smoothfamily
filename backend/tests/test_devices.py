"""3.1.0: the devices connected to a family – the members' browsers and phones, the kitchen displays and
the gateways – with their health, for the family admin (with names) and the server admin (kinds only),
who can ask a family to look after a device."""
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.models import ClientDevice, SmarthomeConnection
from app.services import gateway

pytestmark = pytest.mark.asyncio

PHONE = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36"
PC = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0"


async def _setup(client):
    await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "Berg", "display_name": "Anna", "username": "admin", "password": "secret123"},
    )
    await client.post("/api/family/members", json={"display_name": "Kim", "username": "kim", "password": "pass1234", "role": "child"})


async def _login(client, username, password):
    client.cookies.clear()
    assert (await client.post("/api/auth/login", json={"username": username, "password": password})).status_code == 200


async def test_the_family_admin_sees_the_devices_and_their_health(client):
    await _setup(client)
    # The admin's computer, twice (one device), and the child's phone on an older app.
    assert (await client.post("/api/devices/hello", json={"version": "3.1.0"}, headers={"user-agent": PC})).status_code == 204
    assert (await client.post("/api/devices/hello", json={"version": "3.1.0", "installed": True}, headers={"user-agent": PC})).status_code == 204
    admin_cookies = dict(client.cookies)
    await _login(client, "kim", "pass1234")
    await client.post("/api/devices/hello", json={"version": "3.0.4"}, headers={"user-agent": PHONE})
    assert (await client.get("/api/devices")).status_code == 403  # a child doesn't see the family's devices

    await _login(client, "admin", "secret123")
    client.cookies.update({"sf_device": admin_cookies["sf_device"]})
    await client.post("/api/devices/hello", json={"version": "3.1.0"}, headers={"user-agent": PC})
    out = (await client.get("/api/devices")).json()
    assert out["app_version"] == "3.1.0"
    devices = {d["member_name"]: d for d in out["devices"] if d["kind"] in ("mobile", "computer")}
    assert len([d for d in out["devices"] if d["member_name"] == "Anna"]) == 1
    assert devices["Anna"]["kind"] == "computer" and devices["Anna"]["name"] == "Edge · Windows" and devices["Anna"]["status"] == "ok"
    assert devices["Kim"]["kind"] == "mobile" and devices["Kim"]["status"] == "outdated" and devices["Kim"]["on_map"] is True

    # A kitchen display reports its version when it asks for the day.
    screen = (await client.post("/api/kiosks", json={"name": "Kitchen"})).json()
    token = screen["url"].rsplit("/", 1)[1]
    assert (await client.get(f"/api/kiosk/{token}", headers={"x-sf-app": "3.1.0"})).status_code == 200
    kiosk = next(d for d in (await client.get("/api/devices")).json()["devices"] if d["kind"] == "kiosk")
    assert kiosk["name"] == "Kitchen" and kiosk["status"] == "ok" and kiosk["version"] == "3.1.0"

    # Unused for over a week: off the map, still in the list – and forgotten on request.
    from app.database import SessionLocal

    async with SessionLocal() as db:
        kim_phone = (await db.execute(select(ClientDevice).where(ClientDevice.kind == "mobile"))).scalar_one()
        kim_phone.last_seen = datetime.now(timezone.utc) - timedelta(days=8)
        await db.commit()
        phone_id = kim_phone.id
    old = next(d for d in (await client.get("/api/devices")).json()["devices"] if d["id"] == str(phone_id))
    assert old["status"] == "away" and old["on_map"] is False and old["forgettable"] is True
    assert (await client.delete(f"/api/devices/{phone_id}")).status_code == 204
    assert all(d["id"] != str(phone_id) for d in (await client.get("/api/devices")).json()["devices"])


async def test_the_server_admin_sees_kinds_and_reminds_a_family(client, monkeypatch):
    await _setup(client)
    await client.post("/api/devices/hello", json={"version": "3.1.0"}, headers={"user-agent": PC})
    await _login(client, "kim", "pass1234")
    await client.post("/api/devices/hello", json={"version": "3.0.4"}, headers={"user-agent": PHONE})
    await _login(client, "admin", "secret123")

    # A gateway in the cabin that runs as the Home Assistant app, on an old version.
    from app.database import SessionLocal

    async with SessionLocal() as db:
        family_id = (await db.execute(select(ClientDevice.family_id))).scalars().first()
        conn = SmarthomeConnection(family_id=family_id, provider="home_assistant", name="Cabin", base_url=f"gateway://{uuid.uuid4()}", token_encrypted="", gateway_key_hash="x" * 64, gateway_version="1.2.0", gateway_runs_in="addon", gateway_last_seen=datetime.now(timezone.utc))
        db.add(conn)
        await db.commit()
        conn_id = conn.id
    monkeypatch.setattr(gateway, "online", lambda cid: cid == conn_id)

    out = (await client.get("/api/devices/server")).json()
    family = out["families"][0]
    assert family["name"] == "Berg" and out["gateway_version"]
    kinds = sorted((d["kind"], d["status"]) for d in family["devices"])
    assert kinds == [("computer", "ok"), ("ha_app", "outdated"), ("mobile", "outdated")]
    # Kinds and versions only – no names reach the server admin.
    assert all("name" not in d for d in family["devices"])

    assert (await client.post(f"/api/devices/server/{family['id']}/remind", json={"kinds": ["ha_app"]})).status_code == 204
    told = [n for n in (await client.get("/api/notifications")).json() if n["kind"] == "devices"]
    assert told and "Home Assistant app" in told[0]["body"] and "an old version" in told[0]["body"]
    # Nothing unwell of that kind: nothing to remind of.
    assert (await client.post(f"/api/devices/server/{family['id']}/remind", json={"kinds": ["kiosk"]})).status_code == 409

    await _login(client, "kim", "pass1234")
    assert (await client.get("/api/devices/server")).status_code == 403

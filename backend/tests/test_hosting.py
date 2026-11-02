"""Family hosting (#88) and demo mode (#89): invitations, separation between families, pausing,
moving and deleting a family, the server log."""
from datetime import datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient

pytestmark = pytest.mark.asyncio


async def _owner(client):
    resp = await client.post(
        "/api/auth/setup",
        json={"email": "owner@example.com", "family_name": "Owners", "display_name": "Owner", "username": "owner", "password": "secret123"},
    )
    assert resp.status_code == 201
    return resp.json()


def _other_client():
    from app.main import app

    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


async def _invite(client, days=7, label="The Guests"):
    resp = await client.post("/api/server/invitations", json={"label": label, "days": days})
    assert resp.status_code == 201, resp.text
    return resp.json()["url"].rsplit("/", 1)[1], resp.json()


async def _hosted_family(client):
    """The owner invites a family; returns a client signed in as its admin."""
    token, _ = await _invite(client)
    guest = _other_client()
    resp = await guest.post(
        f"/api/invite/{token}/family",
        json={"family_name": "Guests", "display_name": "Gina", "username": "gina", "password": "guestpass1", "email": "g@example.com"},
    )
    assert resp.status_code == 201, resp.text
    return guest, resp.json(), token


async def test_setup_makes_the_owner_server_admin(client):
    me = await _owner(client)
    assert (me["is_server_admin"], me["family_kind"], me["smarthome_available"]) == (True, "owner", True)
    rows = (await client.get("/api/server/families")).json()
    assert [(r["name"], r["kind"], r["yours"]) for r in rows] == [("Owners", "owner", True)]


async def test_invitation_demo_then_own_family(client):
    await _owner(client)
    token, created = await _invite(client, days=14)
    assert created["state"] == "open"
    guest = _other_client()
    info = (await guest.get(f"/api/invite/{token}")).json()
    assert info["label"] == "The Guests" and info["demo_active"] is False

    me = (await guest.post(f"/api/invite/{token}/demo", json={"language": "sv"})).json()
    # The demo tries the smart home on a simulated Home Assistant.
    assert (me["family_kind"], me["smarthome_available"], me["role"]) == ("demo", True, "admin")
    demo = (await guest.get("/api/demo")).json()
    assert [m["name"] for m in demo["members"]] == ["Anna", "Erik", "Maja", "Leo"] and demo["invitation"] is True
    # Sample data in the apps
    assert len((await guest.get("/api/tasks/approvals")).json()) == 1
    assert (await guest.get("/api/lists")).json()[0]["name"] == "Inköpslista"
    assert len((await guest.get("/api/shop/purchases")).json()) == 1
    devices = (await guest.get("/api/smarthome/my-devices")).json()
    assert len(devices) == 12 and next(d for d in devices if d["entity_id"] == "light.kitchen")["display_name"] == "Köket tak"
    assert (await guest.get("/api/smarthome/connection")).json()["simulated"] is True
    flows = (await guest.get("/api/smarthome/flows")).json()
    assert [f["name"] for f in flows] == ["Morgonmusik", "Filmkväll", "Allt av när vi går", "Nattlampa"]
    home = {m["name"]: m["state"] for m in (await guest.get("/api/presence")).json()["members"]}
    assert home == {"Anna": "home", "Erik": "travel", "Maja": "home", "Leo": "home"}
    # A demo can't point at a real Home Assistant.
    assert (await guest.put("/api/smarthome/connection", json={"base_url": "http://ha.local:8123", "token": "t"})).status_code == 403
    maja = next(m for m in demo["members"] if m["name"] == "Maja")
    assert (await guest.post("/api/demo/switch", json={"user_id": maja["id"]})).json()["display_name"] == "Maja"
    jars = (await guest.get("/api/allowance/jars")).json()
    assert jars["jars"][0]["balance"] > 0  # Maja's earnings are split into her bike jar
    assert (await guest.post("/api/demo/reset")).json()["display_name"] == "Anna"
    assert (await guest.get(f"/api/invite/{token}")).json()["demo_active"] is True

    resp = await guest.post(
        f"/api/invite/{token}/family",
        json={"family_name": "Guests", "display_name": "Gina", "username": "gina", "password": "guestpass1", "email": "g@example.com"},
    )
    me = resp.json()
    assert (me["family_kind"], me["is_server_admin"], me["family_name"]) == ("hosted", False, "Guests")
    # A hosted family brings its own Home Assistant through the gateway (2.8.4) – never directly:
    # the server must not call addresses in another family's network.
    me = (await guest.get("/api/auth/me")).json()
    assert me["smarthome_available"] is True and me["smarthome_gateway_only"] is True
    assert me["host_family_name"] == "Owners"
    assert (await guest.get("/api/smarthome/my-devices")).status_code == 200
    assert (await guest.put("/api/smarthome/connection", json={"base_url": "http://192.168.1.10:8123", "token": "x"})).status_code == 403
    assert (await guest.post("/api/smarthome/gateways", json={"name": "Home"})).status_code == 201
    # The server admin can turn it off for hosted families.
    assert (await client.put("/api/admin/integrations/hosted-smarthome", json={"allowed": False})).json() == {"allowed": False}
    assert (await guest.get("/api/auth/me")).json()["smarthome_available"] is False
    assert (await guest.get("/api/smarthome/my-devices")).status_code == 403
    assert (await guest.put("/api/admin/integrations/hosted-smarthome", json={"allowed": True})).status_code == 403
    # The link is used up and the demo is gone.
    assert (await guest.get(f"/api/invite/{token}")).status_code == 404
    kinds = sorted(r["kind"] for r in (await client.get("/api/server/families")).json())
    assert kinds == ["hosted", "owner"]
    assert (await client.get("/api/server/invitations")).json()[0]["state"] == "used"
    assert (await guest.get("/api/server/families")).status_code == 403


async def test_invitations_expire_can_be_extended_and_revoked(client, db_session):
    from app.models import Invitation
    from app.services.families import remove_stale_demos

    await _owner(client)
    assert (await client.post("/api/server/invitations", json={"label": "x", "days": 5})).status_code == 422
    token, created = await _invite(client, days=1)
    guest = _other_client()
    await guest.post(f"/api/invite/{token}/demo", json={"language": "en"})
    inv = await db_session.get(Invitation, __import__("uuid").UUID(created["id"]))
    inv.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    await db_session.commit()
    assert (await guest.get(f"/api/invite/{token}")).status_code == 404
    assert (await client.get("/api/server/invitations")).json()[0]["state"] == "expired"
    assert (await client.put(f"/api/server/invitations/{created['id']}/extend", json={"days": 30})).json()["state"] == "open"
    assert (await guest.get(f"/api/invite/{token}")).status_code == 200

    assert (await client.delete(f"/api/server/invitations/{created['id']}")).json()["state"] == "revoked"
    assert (await guest.get(f"/api/invite/{token}")).status_code == 404
    assert [r["kind"] for r in (await client.get("/api/server/families")).json()] == ["owner"]  # demo removed
    assert await remove_stale_demos(db_session) == 0
    assert (await guest.get("/api/invite/not-a-token")).status_code == 404


async def test_separation_between_families(client):
    await _owner(client)
    owner_list = (await client.post("/api/lists", json={"name": "Owner list"})).json()
    owner_task = (await client.post("/api/tasks", json={"title": "Owner task", "points": 5, "recurrence": "daily"})).json()
    owner_car = (await client.post("/api/vehicles", json={"name": "Owner car", "registration": "OWN123"})).json()
    owner_person = (await client.post("/api/birthdays/people", json={"name": "Owner gran"})).json()
    owner_item = (await client.post("/api/shop/items", json={"title": "Owner reward", "price": 5})).json()
    members = (await client.get("/api/family/members")).json()

    guest, _, _ = await _hosted_family(client)
    assert [l["name"] for l in (await guest.get("/api/lists")).json()] == []
    assert all(m["username"] != "owner" for m in (await guest.get("/api/family/members")).json())
    for method, url, body in [
        ("PATCH", f"/api/lists/{owner_list['id']}", {"name": "x"}),
        ("POST", f"/api/lists/{owner_list['id']}/items", {"name": "x"}),
        ("PATCH", f"/api/tasks/{owner_task['id']}", {"title": "x"}),
        ("POST", f"/api/tasks/{owner_task['id']}/complete", None),
        ("PATCH", f"/api/vehicles/{owner_car['id']}", {"name": "x", "registration": "x"}),
        ("GET", f"/api/birthdays/people/{owner_person['id']}/wishes", None),
        ("POST", f"/api/shop/items/{owner_item['id']}/buy", None),
        ("PUT", f"/api/family/members/{members[0]['id']}/apps", {"apps": []}),
        ("GET", f"/api/allowance/jars?user_id={members[0]['id']}", None),
    ]:
        resp = await guest.request(method, url, json=body)
        assert resp.status_code in (403, 404), (method, url, resp.status_code)
    assert (await guest.get("/api/admin/backups")).status_code == 403
    assert (await guest.get("/api/server/log")).status_code == 403


def test_every_table_belongs_to_a_family_or_the_server():
    from app.services.families import _condition, family_tables

    for table in family_tables():
        _condition(table, __import__("uuid").uuid4())  # raises for a table no family can be found for


async def test_pause_move_and_delete_a_family(client, db_session):
    from sqlalchemy import func, select

    from app.services.families import _condition, family_tables

    await _owner(client)
    guest, guest_me, _ = await _hosted_family(client)
    await guest.post("/api/lists", json={"name": "Guest list"})
    family_id = guest_me["family_id"]

    # Pause: the family can't use the app until resumed.
    assert (await client.put(f"/api/server/families/{family_id}/status", json={"status": "suspended"})).json()["status"] == "suspended"
    assert (await guest.get("/api/lists")).status_code == 401
    other = _other_client()
    assert (await other.post("/api/auth/login", json={"username": "gina", "password": "guestpass1"})).status_code == 403
    await client.put(f"/api/server/families/{family_id}/status", json={"status": "active"})

    # Move: encrypted export, delete, import – the members can sign in again.
    blob = await client.post(f"/api/server/families/{family_id}/export", json={"passphrase": "correct horse battery"})
    assert blob.status_code == 200 and blob.content.startswith(b"SFMOVE1")
    assert b"Guest list" not in blob.content
    assert (await client.delete(f"/api/server/families/{family_id}?confirm=Wrong")).status_code == 422
    assert (await client.delete(f"/api/server/families/{family_id}?confirm=Guests")).status_code == 204
    for table in family_tables():
        count = (await db_session.execute(select(func.count()).select_from(table).where(_condition(table, __import__("uuid").UUID(family_id))))).scalar_one()
        assert count == 0, table.name
    assert (await other.post("/api/auth/login", json={"username": "gina", "password": "guestpass1"})).status_code == 401

    headers = {"Content-Type": "application/octet-stream"}
    assert (await client.post("/api/server/families/import?passphrase=wrong-passphrase", content=blob.content, headers=headers)).status_code == 422
    imported = await client.post("/api/server/families/import?passphrase=correct horse battery", content=blob.content, headers=headers)
    assert imported.status_code == 201, imported.text
    assert imported.json()["name"] == "Guests"
    assert (await other.post("/api/auth/login", json={"username": "gina", "password": "guestpass1"})).status_code == 200
    assert [l["name"] for l in (await other.get("/api/lists")).json()] == ["Guest list"]
    again = await client.post("/api/server/families/import?passphrase=correct horse battery", content=blob.content, headers=headers)
    assert again.status_code == 422

    assert (await client.delete(f"/api/server/families/{(await client.get('/api/auth/me')).json()['family_id']}?confirm=Owners")).status_code == 409

    actions = [r["action"] for r in (await client.get("/api/server/log")).json()]
    assert {"family_paused", "family_resumed", "family_exported", "family_deleted", "family_imported"} <= set(actions)
    mine = (await other.get("/api/server/log/mine")).json()
    assert {r["action"] for r in mine} >= {"family_imported"}
    assert all(r["family_id"] == family_id for r in mine)


async def test_new_installation_can_try_the_demo_first(client):
    me = (await client.post("/api/auth/setup/demo", json={"language": "en"})).json()
    assert me["family_kind"] == "demo"
    assert (await client.get("/api/auth/setup")).json()["needs_setup"] is True
    assert (await client.get("/api/demo")).json()["invitation"] is False
    assert (await client.post("/api/demo/leave")).status_code == 204
    await client.post("/api/auth/setup/demo", json={"language": "en"})
    owner = await _owner(client)
    assert owner["is_server_admin"] is True
    assert [r["kind"] for r in (await client.get("/api/server/families")).json()] == ["owner"]  # the demo is gone
    assert (await client.post("/api/auth/setup/demo", json={"language": "en"})).status_code == 409


async def test_sign_up_forgives_capitals_and_spaces(client):
    """A friend typed "Kalle " and " kalle@example.com" – the server tidies it, and what is really
    wrong is named field by field."""
    await _owner(client)
    token, _ = await _invite(client)
    guest = _other_client()
    base = {"family_name": "Kalles", "display_name": "Kalle", "password": "guestpass1"}
    bad = await guest.post(f"/api/invite/{token}/family", json={**base, "username": "kalle andersson", "email": "kalle@gmail"})
    assert bad.status_code == 422
    assert sorted(err["loc"][-1] for err in bad.json()["detail"]) == ["email", "username"]
    resp = await guest.post(f"/api/invite/{token}/family", json={**base, "username": "Kalle ", "email": " kalle@example.com "})
    assert resp.status_code == 201, resp.text
    assert resp.json()["username"] == "kalle"
    # An e-mail address works as a username, and signs in typed with capitals.
    token2, _ = await _invite(client, label="Kalle 2")
    other = _other_client()
    resp = await other.post(f"/api/invite/{token2}/family", json={**base, "username": "Kalle.A@Example.com", "email": "k@example.com"})
    assert resp.status_code == 201, resp.text
    assert resp.json()["username"] == "kalle.a@example.com"
    login = await other.post("/api/auth/login", json={"username": " Kalle.A@example.com", "password": "guestpass1"})
    assert login.status_code == 200, login.text
    await other.aclose()
    await guest.aclose()


async def test_storage_ceiling_and_backups_per_family(client, tmp_path, monkeypatch):
    import io

    from PIL import Image

    from app.config import get_settings
    from app.services import quota

    monkeypatch.setattr(get_settings(), "backup_dir", str(tmp_path / "backup"))
    await _owner(client)
    guest, guest_me, _ = await _hosted_family(client)
    family_id = guest_me["family_id"]

    # A ceiling: the next upload that would go over it is refused; the family sees how full it is.
    buf = io.BytesIO()
    Image.new("RGB", (400, 400), (10, 200, 30)).save(buf, "PNG")
    album = (await guest.post("/api/albums", json={"name": "Trips"})).json()
    assert (await guest.post(f"/api/albums/{album['id']}/media", files={"file": ("a.png", buf.getvalue(), "image/png")})).status_code == 201
    assert (await client.put(f"/api/server/families/{family_id}/quota", json={"quota_mb": 1})).status_code == 204
    quota.forget(__import__("uuid").UUID(family_id))
    big = b"x" * (1024 * 1024)
    assert (await guest.post("/api/vault/files", files={"file": ("big.bin", big, "application/octet-stream")})).status_code == 413
    seen = (await guest.get("/api/family/storage")).json()
    assert seen["quota_mb"] == 1 and seen["used_bytes"] > 0
    rows = (await client.get("/api/server/families")).json()
    assert next(r for r in rows if r["id"] == family_id)["storage_quota_mb"] == 1
    assert (await client.put(f"/api/server/families/{family_id}/quota", json={"quota_mb": None})).status_code == 204
    assert (await guest.post("/api/vault/files", files={"file": ("big.bin", big, "application/octet-stream")})).status_code == 201
    # Only the server admin sets it.
    assert (await guest.put(f"/api/server/families/{family_id}/quota", json={"quota_mb": 99999})).status_code == 403

    # A backup of the family alone; then a change; then put back as it was.
    made = (await client.post(f"/api/server/families/{family_id}/backups")).json()
    assert [b["stamp"] for b in (await client.get(f"/api/server/families/{family_id}/backups")).json()] == [made["stamp"]]
    await guest.post("/api/lists", json={"name": "After the backup"})
    assert (await client.post(f"/api/server/families/{family_id}/backups/{made['stamp']}/restore?confirm=Wrong")).status_code == 422
    restored = await client.post(f"/api/server/families/{family_id}/backups/{made['stamp']}/restore?confirm=Guests")
    assert restored.status_code == 204, restored.text
    other = _other_client()
    assert (await other.post("/api/auth/login", json={"username": "gina", "password": "guestpass1"})).status_code == 200
    assert "After the backup" not in [l["name"] for l in (await other.get("/api/lists")).json()]
    assert [a["name"] for a in (await other.get("/api/albums")).json()] == ["Trips"]
    # Never your own family (it would sign you out in the middle).
    own = (await client.get("/api/auth/me")).json()["family_id"]
    own_backup = (await client.post(f"/api/server/families/{own}/backups")).json()
    assert (await client.post(f"/api/server/families/{own}/backups/{own_backup['stamp']}/restore?confirm=Owners")).status_code == 409

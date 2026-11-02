"""Notification centre (#62) and live update events (#77)."""
from datetime import datetime, timedelta, timezone

import pytest

pytestmark = pytest.mark.asyncio


async def _family(client):
    resp = await client.post(
        "/api/auth/setup",
        json={"email": "admin@example.com", "family_name": "Bell", "display_name": "Admin", "username": "admin", "password": "secret123"},
    )
    assert resp.status_code == 201
    kid = await client.post(
        "/api/family/members", json={"display_name": "Kid", "username": "kid", "password": "pass1234", "role": "child"}
    )
    return kid.json()["id"]


async def _login(client, username, password):
    assert (await client.post("/api/auth/login", json={"username": username, "password": password})).status_code == 200


async def test_kept_in_the_centre_even_with_push_off(client):
    kid_id = await _family(client)
    # The admin has turned approval pushes off; the notification is still kept.
    await client.patch("/api/auth/me", json={"notification_prefs": {"chat": True, "approvals": False, "calendar_mine": True, "calendar_family": False}})
    task = (await client.post("/api/tasks", json={"title": "Dishes", "points": 5, "assignee_id": kid_id, "recurrence": "daily"})).json()

    await _login(client, "kid", "pass1234")
    assert (await client.post(f"/api/tasks/{task['id']}/complete")).status_code == 200
    assert (await client.get("/api/notifications")).json() == []

    await _login(client, "admin", "secret123")
    rows = (await client.get("/api/notifications")).json()
    assert len(rows) == 1
    assert rows[0]["kind"] == "approval_pending"
    assert rows[0]["route"] == "/tasks?tab=approvals"
    assert "Dishes" in rows[0]["body"]
    assert rows[0]["read_at"] is None
    assert (await client.get("/api/notifications/unread")).json() == {"unread": 1}

    # Approving notifies the child.
    approval = (await client.get("/api/tasks/approvals")).json()[0]
    await client.post(f"/api/tasks/approvals/{approval['completion_id']}", json={"action": "approve"})
    await _login(client, "kid", "pass1234")
    kid_rows = (await client.get("/api/notifications")).json()
    assert [r["kind"] for r in kid_rows] == ["approval_reviewed"]


async def test_mark_read_one_or_all_and_only_own(client):
    kid_id = await _family(client)
    for title in ("One", "Two"):
        task = (await client.post("/api/tasks", json={"title": title, "points": 5, "assignee_id": kid_id, "recurrence": "daily"})).json()
        await _login(client, "kid", "pass1234")
        await client.post(f"/api/tasks/{task['id']}/complete")
        await _login(client, "admin", "secret123")
    rows = (await client.get("/api/notifications")).json()
    assert len(rows) == 2

    # Someone else's ids change nothing.
    await _login(client, "kid", "pass1234")
    assert (await client.post("/api/notifications/read", json={"ids": [rows[0]["id"]]})).status_code == 204
    await _login(client, "admin", "secret123")
    assert (await client.get("/api/notifications/unread")).json() == {"unread": 2}

    await client.post("/api/notifications/read", json={"ids": [rows[0]["id"]]})
    assert (await client.get("/api/notifications/unread")).json() == {"unread": 1}
    await client.post("/api/notifications/read", json={})
    assert (await client.get("/api/notifications/unread")).json() == {"unread": 0}


async def test_old_notifications_are_pruned(client, db_session):
    from sqlalchemy import select

    from app.models import Notification, User
    from app.services.notify import notify, prune_notifications

    await _family(client)
    admin = (await db_session.execute(select(User).where(User.username == "admin"))).scalar_one()
    await notify(db_session, admin, {"title": "Old", "body": "", "kind": "other"})
    await notify(db_session, admin, {"title": "New", "body": "", "kind": "other"})
    old = (await db_session.execute(select(Notification).where(Notification.title == "Old"))).scalar_one()
    old.created_at = datetime.now(timezone.utc) - timedelta(days=61)
    await db_session.commit()

    await prune_notifications(db_session)
    titles = (await db_session.execute(select(Notification.title))).scalars().all()
    assert titles == ["New"]


async def test_writes_become_live_events(client, monkeypatch):
    from app.config import get_settings
    from app.services import live_writes

    sent = []

    async def family(family_id, resources):
        sent.append(("family", resources))

    async def user(user_id, resources):
        sent.append(("user", resources))

    await _family(client)
    monkeypatch.setattr(get_settings(), "live_events", True)
    monkeypatch.setattr(live_writes, "publish_family", family)
    monkeypatch.setattr(live_writes, "publish_user", user)

    await client.post("/api/lists", json={"name": "Groceries"})
    await client.post("/api/notifications/read", json={})
    await client.post("/api/chat/read", json={"peer": "family"})  # would loop the open chat
    await client.post("/api/lists", json={"name": ""})  # 422: nothing changed
    await client.get("/api/lists")  # reads are never events
    await client.patch("/api/auth/me", json={"theme": "ocean"})  # sign-in/profile is ignored
    assert sent == [("family", ["lists"]), ("user", ["notifications"])]


def test_home_assistant_websocket_url():
    from app.services.ha_live import websocket_url

    assert websocket_url("http://ha.local:8123/") == "ws://ha.local:8123/api/websocket"
    assert websocket_url("https://ha.example.com") == "wss://ha.example.com/api/websocket"


async def test_home_assistant_state_change_becomes_a_live_event(client, db_session, monkeypatch):
    """A fake Home Assistant: auth handshake, subscription, then a change of an exposed device
    (and one of a device the family doesn't expose, which is ignored)."""
    import asyncio
    import json

    import websockets
    from sqlalchemy import select

    from app.models import ExposedDevice, Family, SmarthomeConnection
    from app.services import ha_live

    await _family(client)
    family = (await db_session.execute(select(Family))).scalar_one()
    conn = SmarthomeConnection(family_id=family.id, provider="home_assistant", base_url="http://x", token_encrypted="x")
    db_session.add(conn)
    await db_session.flush()
    db_session.add(ExposedDevice(family_id=family.id, connection_id=conn.id, entity_id="light.kitchen", display_name="Kitchen", domain="light"))
    await db_session.commit()

    seen_token = []
    release = asyncio.Event()

    async def fake_ha(ws):
        await ws.send(json.dumps({"type": "auth_required"}))
        seen_token.append(json.loads(await ws.recv())["access_token"])
        await ws.send(json.dumps({"type": "auth_ok"}))
        assert json.loads(await ws.recv())["event_type"] == "state_changed"
        for entity in ("sensor.outside", "light.kitchen", "light.kitchen"):
            await ws.send(json.dumps({"type": "event", "event": {"data": {"entity_id": entity}}}))
        await release.wait()  # stay open until the client has stopped on its own

    published = []
    done = asyncio.Event()

    async def publish(family_id, resources):
        published.append((family_id, resources))
        done.set()

    monkeypatch.setattr(ha_live, "publish_family", publish)
    stop = asyncio.Event()
    async with websockets.serve(fake_ha, "127.0.0.1", 0) as server:
        port = server.sockets[0].getsockname()[1]
        task = asyncio.create_task(ha_live._listen(family.id, f"http://127.0.0.1:{port}", "secret-token", stop))
        await asyncio.wait_for(done.wait(), timeout=5)
        stop.set()
        await asyncio.wait_for(task, timeout=10)
        release.set()
    assert seen_token == ["secret-token"]
    # Two quick changes of the same lamp become one refresh.
    assert published == [(family.id, ["smarthome", "presence"])]

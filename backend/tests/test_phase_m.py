"""Phase M tests: push subscriptions, preference gating, cleanup, reminders."""

import json
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from pywebpush import WebPushException

from app.services.notifications import run_calendar_reminders
from app.services.push import send_to_user

pytestmark = pytest.mark.asyncio


async def _setup(client):
    resp = await client.post(
        "/api/auth/setup",
        json={
            "email": "admin@example.com", "family_name": "Push Family",
            "display_name": "Admin",
            "username": "admin",
            "password": "secret123",
        },
    )
    assert resp.status_code == 201

    child = await client.post(
        "/api/family/members",
        json={
            "display_name": "Kid",
            "username": "kid",
            "password": "1234",
            "role": "child",
        },
    )
    assert child.status_code == 201
    return resp.json(), child.json()


async def _login(client, username: str, password: str):
    await client.post("/api/auth/logout")
    resp = await client.post("/api/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200


def _sub(endpoint: str) -> dict:
    return {
        "endpoint": endpoint,
        "keys": {
            "p256dh": "BElvXfVbD2N7GvPHK8S9l1Y7mQ5R1eY8m2v8h9kQ8Y4",
            "auth": "3R6xj2Qv7w",
        },
    }


async def test_subscribe_and_unsubscribe(client):
    await _setup(client)

    key = await client.get("/api/push/vapid-public-key")
    assert key.status_code == 200
    assert key.json()["public_key"]

    added = await client.post("/api/push/subscribe", json=_sub("https://push.example/device-a"))
    assert added.status_code == 200

    listed = await client.get("/api/push/subscriptions")
    assert listed.status_code == 200
    assert len(listed.json()) == 1

    removed = await client.request(
        "DELETE",
        "/api/push/subscribe",
        json={"endpoint": "https://push.example/device-a"},
    )
    assert removed.status_code == 200

    listed2 = await client.get("/api/push/subscriptions")
    assert listed2.status_code == 200
    assert listed2.json() == []


async def test_preference_gates_chat_push_and_payload(monkeypatch, client):
    _, child = await _setup(client)

    await _login(client, "kid", "1234")
    await client.post("/api/push/subscribe", json=_sub("https://push.example/kid"))

    calls: list[dict] = []

    def fake_webpush(subscription_info, data, vapid_private_key, vapid_claims):  # noqa: ANN001
        calls.append(
            {
                "endpoint": subscription_info["endpoint"],
                "data": json.loads(data),
                "claims": vapid_claims,
            }
        )

    monkeypatch.setattr("app.services.push.webpush", fake_webpush)

    await _login(client, "kid", "1234")
    off = await client.patch(
        "/api/auth/me",
        json={
            "notification_prefs": {
                "chat": False,
                "approvals": True,
                "calendar_mine": True,
                "calendar_family": False,
            }
        },
    )
    assert off.status_code == 200

    await _login(client, "admin", "secret123")
    conv = await client.post("/api/chat/conversations", json={"member_ids": [child["id"]]})
    assert conv.status_code == 201
    dm = conv.json()["peer_key"]
    dm1 = await client.post("/api/chat/messages", json={"peer": dm, "body": "hello kid"})
    assert dm1.status_code == 201
    assert calls == []

    await _login(client, "kid", "1234")
    on = await client.patch(
        "/api/auth/me",
        json={
            "notification_prefs": {
                "chat": True,
                "approvals": True,
                "calendar_mine": True,
                "calendar_family": False,
            }
        },
    )
    assert on.status_code == 200

    await _login(client, "admin", "secret123")
    dm2 = await client.post("/api/chat/messages", json={"peer": dm, "body": "second hello"})
    assert dm2.status_code == 201

    assert len(calls) == 1
    assert calls[0]["endpoint"] == "https://push.example/kid"
    assert calls[0]["data"]["kind"] == "chat"
    assert calls[0]["data"]["route"] == "/chat"
    assert "second hello" in calls[0]["data"]["body"]


async def test_dead_subscription_cleanup_on_410(monkeypatch, client, db_session):
    admin, _ = await _setup(client)

    await client.post("/api/push/subscribe", json=_sub("https://push.example/dead"))

    class DeadResponse:
        status_code = 410

    def dead_webpush(*_args, **_kwargs):
        raise WebPushException("gone", response=DeadResponse())

    monkeypatch.setattr("app.services.push.webpush", dead_webpush)

    sent = await send_to_user(db_session, uuid.UUID(admin["id"]), {"title": "x", "body": "y", "route": "/", "kind": "chat"})
    assert sent == 0

    listed = await client.get("/api/push/subscriptions")
    assert listed.status_code == 200
    assert listed.json() == []


async def test_calendar_reminder_respects_feed_visibility(monkeypatch, client, db_session):
    admin, child = await _setup(client)

    create_feed = await client.post(
        "/api/calendar/feeds",
        json={
            "name": "Private Feed",
            "url": "webcal://example.com/private.ics",
            "visible_to": [admin["id"]],
            "details_for": [admin["id"]],
        },
    )
    assert create_feed.status_code == 201

    await client.post("/api/push/subscribe", json=_sub("https://push.example/admin"))

    await _login(client, "kid", "1234")
    await client.post("/api/push/subscribe", json=_sub("https://push.example/kid"))
    await _login(client, "admin", "secret123")

    def fake_fetch(*_args, **_kwargs):
        return b"BEGIN:VCALENDAR"

    now = datetime(2026, 6, 12, 8, 0, tzinfo=timezone.utc)

    def fake_parse(*_args, **_kwargs):
        return [
            {
                "title": "Doctor",
                "start": now + timedelta(minutes=30),
                "end": now + timedelta(minutes=60),
                "all_day": False,
                "location": "Clinic",
            }
        ]

    sent_endpoints: list[str] = []

    def fake_webpush(subscription_info, data, vapid_private_key, vapid_claims):  # noqa: ANN001
        sent_endpoints.append(subscription_info["endpoint"])

    async def fake_fetch_async(*_args, **_kwargs):
        return fake_fetch()

    monkeypatch.setattr("app.services.notifications.fetch_ical_raw", fake_fetch_async)
    monkeypatch.setattr("app.services.notifications.parse_events", fake_parse)
    monkeypatch.setattr("app.services.push.webpush", fake_webpush)

    sent = await run_calendar_reminders(db_session, now=now)
    assert sent == 1
    assert sent_endpoints == ["https://push.example/admin"]

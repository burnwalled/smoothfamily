"""Smoke tests: setup, login, members, tasks, gamification."""
import io

import pytest

pytestmark = pytest.mark.asyncio


async def _setup(client):
    resp = await client.post(
        "/api/auth/setup",
        json={
            "email": "admin@example.com", "family_name": "Test Family",
            "display_name": "Olle",
            "username": "olle",
            "password": "secret123",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _make_image() -> bytes:
    from PIL import Image

    img = Image.new("RGB", (300, 200), (20, 150, 220))
    buf = io.BytesIO()
    img.save(buf, "JPEG")
    buf.seek(0)
    return buf.getvalue()


async def test_health(client):
    resp = await client.get("/api/health")
    assert resp.status_code == 200


async def test_setup_and_login(client):
    status = await client.get("/api/auth/setup")
    assert status.json()["needs_setup"] is True

    me = await _setup(client)
    assert me["role"] == "admin"
    assert me["family_name"] == "Test Family"
    assert me["language"] == "en"
    assert me["theme"] == "forest"

    # setup can only run once
    again = await client.post(
        "/api/auth/setup",
        json={"email": "admin@example.com", "family_name": "X", "display_name": "X", "username": "xx", "password": "12345678"},
    )
    assert again.status_code == 409

    await client.post("/api/auth/logout")
    login = await client.post("/api/auth/login", json={"username": "OLLE", "password": "secret123"})
    assert login.status_code == 200

    wrong = await client.post("/api/auth/login", json={"username": "olle", "password": "wrong"})
    assert wrong.status_code == 401


async def test_members_and_admin_guard(client):
    await _setup(client)
    created = await client.post(
        "/api/family/members",
        json={"display_name": "The Kid", "username": "kid", "password": "1234", "role": "child"},
    )
    assert created.status_code == 201

    members = await client.get("/api/family/members")
    assert len(members.json()) == 2

    # child accounts must not be able to create members
    await client.post("/api/auth/login", json={"username": "kid", "password": "1234"})
    denied = await client.post(
        "/api/family/members",
        json={"display_name": "X", "username": "xx", "password": "1234"},
    )
    assert denied.status_code == 403


async def test_tasks_and_leaderboard(client):
    await _setup(client)
    task = await client.post(
        "/api/tasks",
        json={"title": "Do the dishes", "points": 15, "recurrence": "daily"},
    )
    assert task.status_code == 201, task.text
    task_id = task.json()["id"]

    today = await client.get("/api/tasks/today")
    assert any(t["task"]["id"] == task_id for t in today.json())

    done = await client.post(f"/api/tasks/{task_id}/complete")
    assert done.status_code == 200
    assert done.json()["done"] is True

    # the same task cannot be completed twice on the same day
    twice = await client.post(f"/api/tasks/{task_id}/complete")
    assert twice.status_code == 409

    board = await client.get("/api/tasks/leaderboard")
    entry = board.json()[0]
    assert entry["points_week"] == 15
    assert entry["streak_days"] == 1


async def test_calendar_feed_validation(client):
    await _setup(client)
    bad = await client.post("/api/calendar/feeds", json={"name": "School", "url": "ftp://no"})
    assert bad.status_code == 422

    ok = await client.post(
        "/api/calendar/feeds",
        json={"name": "School", "url": "webcal://example.com/school.ics", "color": "#C2703D"},
    )
    assert ok.status_code == 201
    feeds = await client.get("/api/calendar/feeds")
    assert len(feeds.json()) == 1


async def test_preferences(client):
    await _setup(client)
    updated = await client.patch("/api/auth/me", json={"language": "sv", "theme": "midnight"})
    assert updated.status_code == 200
    assert updated.json()["language"] == "sv"
    assert updated.json()["theme"] == "midnight"

    # preferences persist
    me = await client.get("/api/auth/me")
    assert me.json()["language"] == "sv"
    assert me.json()["theme"] == "midnight"

    invalid = await client.patch("/api/auth/me", json={"language": "de"})
    assert invalid.status_code == 422


async def test_dashboard_widgets(client):
    await _setup(client)

    # first GET seeds the default dashboard
    widgets = (await client.get("/api/dashboard/widgets")).json()
    assert [w["type"] for w in widgets] == ["calendar_today", "tasks_today", "leaderboard"]

    # SL widget requires a site_id
    missing = await client.post("/api/dashboard/widgets", json={"type": "sl_departures"})
    assert missing.status_code == 422

    created = await client.post(
        "/api/dashboard/widgets",
        json={"type": "sl_departures", "config": {"site_id": 9192, "site_name": "Slussen"}},
    )
    assert created.status_code == 201
    widget = created.json()
    assert widget["position"] == 3
    assert widget["config"]["site_name"] == "Slussen"

    moved = await client.patch(f"/api/dashboard/widgets/{widget['id']}", json={"position": 0})
    assert moved.status_code == 200
    assert moved.json()["position"] == 0

    deleted = await client.delete(f"/api/dashboard/widgets/{widget['id']}")
    assert deleted.status_code == 204
    widgets = (await client.get("/api/dashboard/widgets")).json()
    assert len(widgets) == 3


async def test_dashboard_reorder_persists(client):
    await _setup(client)
    widgets = (await client.get("/api/dashboard/widgets")).json()

    payload = [
        {"id": widgets[0]["id"], "position": 2},
        {"id": widgets[1]["id"], "position": 0},
        {"id": widgets[2]["id"], "position": 1},
    ]
    resp = await client.post("/api/dashboard/widgets/reorder", json=payload)
    assert resp.status_code == 200

    ordered = (await client.get("/api/dashboard/widgets")).json()
    assert [w["position"] for w in ordered] == [0, 1, 2]
    assert [w["type"] for w in ordered] == [widgets[1]["type"], widgets[2]["type"], widgets[0]["type"]]


async def test_avatar_upload_and_serve(client):
    await _setup(client)

    uploaded = await client.post(
        "/api/auth/me/avatar",
        files={"file": ("avatar.jpg", _make_image(), "image/jpeg")},
    )
    assert uploaded.status_code == 200, uploaded.text
    assert uploaded.json()["avatar_key"]

    served = await client.get("/api/auth/me/avatar")
    assert served.status_code == 200
    assert served.headers["content-type"].startswith("image/jpeg")
    assert len(served.content) > 0

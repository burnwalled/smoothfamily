"""Config export / import tests."""
import pytest
from app.routers import admin as admin_router

pytestmark = pytest.mark.asyncio


async def _setup(client):
    resp = await client.post(
        "/api/auth/setup",
        json={
            "email": "admin@example.com", "family_name": "Admin Test Family",
            "display_name": "Admin",
            "username": "admin",
            "password": "secret123",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_version_rejected(client):
    """Config files newer than SUPPORTED_VERSION are rejected."""
    await _setup(client)
    resp = await client.post(
        "/api/admin/import",
        json={
            "format": "smooth-family-config",
            "version": 99,
            "exported_at": "2026-06-12T00:00:00Z",
            "family": {"name": "X"},
        },
    )
    assert resp.status_code == 422
    assert "99" in resp.json()["detail"]


async def test_roundtrip(client):
    """Export → delete entities → import recreates them."""
    await _setup(client)

    # Create entities
    kid = await client.post(
        "/api/family/members",
        json={"display_name": "Kid", "username": "kid", "password": "1234", "role": "child"},
    )
    assert kid.status_code == 201
    kid_id = kid.json()["id"]

    feed = await client.post(
        "/api/calendar/feeds",
        json={"name": "School", "url": "webcal://example.com/school.ics", "color": "#C2703D"},
    )
    assert feed.status_code == 201
    feed_id = feed.json()["id"]

    task = await client.post(
        "/api/tasks",
        json={"title": "Do the dishes", "points": 15, "recurrence": "daily"},
    )
    assert task.status_code == 201
    task_id = task.json()["id"]

    room = await client.post(
        "/api/home/rooms",
        json={"name": "Kitchen", "category": "kitchen"},
    )
    assert room.status_code == 201
    room_id = room.json()["id"]

    # Export
    export_resp = await client.get("/api/admin/export")
    assert export_resp.status_code == 200
    config = export_resp.json()
    assert config["format"] == "smooth-family-config"
    assert config["version"] == 5
    assert config["family"]["currency"] == "kr"
    assert config["family"]["shopping_task_points"] == 25
    assert any(m["username"] == "kid" for m in config["members"])
    assert any(f["url"] == "webcal://example.com/school.ics" for f in config["calendar_feeds"])
    assert any(t["title"] == "Do the dishes" for t in config["tasks"])
    assert any(r["name"] == "Kitchen" for r in config["rooms"])

    # Delete the entities
    await client.delete(f"/api/family/members/{kid_id}")
    await client.delete(f"/api/calendar/feeds/{feed_id}")
    await client.delete(f"/api/tasks/{task_id}")
    await client.delete(f"/api/home/rooms/{room_id}")

    # Verify they are gone
    members = (await client.get("/api/family/members")).json()
    assert not any(m["username"] == "kid" for m in members)

    # Import
    import_resp = await client.post("/api/admin/import", json=config)
    assert import_resp.status_code == 200
    result = import_resp.json()
    assert result["created"]["members"] == 1  # kid
    assert result["created"]["feeds"] == 1    # School
    assert result["created"]["tasks"] == 1    # Do the dishes
    assert result["created"]["rooms"] == 1    # Kitchen

    # Verify restored
    members_after = (await client.get("/api/family/members")).json()
    assert any(m["username"] == "kid" for m in members_after)
    feeds_after = (await client.get("/api/calendar/feeds")).json()
    assert any(f["name"] == "School" for f in feeds_after)
    tasks_after = (await client.get("/api/tasks")).json()
    assert any(t["title"] == "Do the dishes" for t in tasks_after)


async def test_import_idempotent(client):
    """Importing twice produces no duplicates — second import is fully skipped."""
    await _setup(client)

    await client.post(
        "/api/family/members",
        json={"display_name": "Kid", "username": "kid", "password": "1234", "role": "child"},
    )
    await client.post(
        "/api/calendar/feeds",
        json={"name": "School", "url": "webcal://example.com/school.ics"},
    )
    await client.post("/api/tasks", json={"title": "Dishes", "points": 10, "recurrence": "daily"})
    await client.post("/api/home/rooms", json={"name": "Kitchen", "category": "kitchen"})

    # Force default dashboard widgets to exist by GETting the dashboard
    await client.get("/api/dashboard/widgets")

    config = (await client.get("/api/admin/export")).json()

    # First import — everything already exists, all skipped
    first = (await client.post("/api/admin/import", json=config)).json()
    assert first["created"]["members"] == 0
    assert first["created"]["feeds"] == 0
    assert first["created"]["tasks"] == 0
    assert first["created"]["rooms"] == 0
    assert first["skipped"]["members"] >= 2   # admin + kid

    # Second import — identical
    second = (await client.post("/api/admin/import", json=config)).json()
    assert second["created"]["members"] == 0
    assert second["created"]["feeds"] == 0
    assert second["created"]["tasks"] == 0
    assert second["created"]["rooms"] == 0
    assert second["skipped"]["members"] == first["skipped"]["members"]


async def test_admin_storage_endpoint_returns_usage(client, monkeypatch):
    await _setup(client)

    monkeypatch.setattr(admin_router, "_disk_usage", lambda _p: (4096 * 1000, 4096 * 600, 4096 * 400))
    monkeypatch.setattr(admin_router, "_read_mountinfo", lambda: "")

    resp = await client.get("/api/admin/storage")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["data_dir"]
    assert body["media_root"]
    assert body["bytes_total"] == 4096 * 1000
    assert body["bytes_free"] == 4096 * 400
    assert body["bytes_used"] == 4096 * 600
    assert body["sd_card_suspected"] is False


async def test_sd_mount_heuristic_detects_mmcblk():
    mountinfo = (
        "24 22 179:2 / /data rw,relatime - ext4 /dev/mmcblk0p2 rw\n"
        "33 24 179:2 /media /data/media rw,relatime - ext4 /dev/mmcblk0p2 rw\n"
    )
    assert admin_router._is_probably_sd_mount("/data/media", mountinfo) is True

    mountinfo_usb = "33 24 8:1 /media /data/media rw,relatime - ext4 /dev/sda1 rw\n"
    assert admin_router._is_probably_sd_mount("/data/media", mountinfo_usb) is False

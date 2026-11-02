"""2.9.0: updates of Postgres, Redis, Caddy and SearXNG – the app reads what runs, finds newer
versions in the same major, plans them for the admin's window and tells every adult on the server;
update.sh (on the NAS) does the Docker work and reports back."""
import json
from datetime import datetime, timedelta, timezone

import pytest

from app.services import updates

pytestmark = pytest.mark.asyncio
NOW = datetime(2026, 11, 2, 12, tzinfo=timezone.utc)
OLD = NOW - timedelta(days=30)
FRESH = NOW - timedelta(days=2)


def test_only_newer_exact_versions_in_the_same_major_out_for_a_week():
    tags = [("16.10-alpine", OLD), ("16.11-alpine", OLD), ("16.12-alpine", FRESH), ("17.2-alpine", OLD), ("16-alpine", OLD), ("16.11-alpine3.22", OLD)]
    assert updates.newer("db", "16.4", tags, NOW) == "16.11-alpine"
    assert updates.newer("db", "16.11", tags, NOW) is None
    caddy = [("2.10.2-alpine", OLD), ("2.10-alpine", OLD), ("3.0.0-alpine", OLD), ("2.8.4-alpine", OLD)]
    assert updates.newer("caddy", "v2.8.4", caddy, NOW) == "2.10.2-alpine"
    searx = [("2026.10.20-abc123def", OLD), ("2026.10.30-1cd13d98d", FRESH), ("latest", OLD)]
    assert updates.newer("searxng", "2026.10.13-22c64b8d3", searx, NOW) == "2026.10.20-abc123def"
    assert updates.newer("redis", "not a version", [("7.4.6-alpine", OLD)], NOW) is None


def _state(folder):
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "state.json").write_text(json.dumps({"checked_at": "2026-11-02T11:00:00Z", "services": {
        "db": {"image": "postgres:16-alpine", "env": ["PG_VERSION=16.4"]},
        "redis": {"image": "redis:7-alpine", "env": ["REDIS_VERSION=7.4.6"]},
        "backend": {"image": "smooth-family-backend:2.9.0", "env": []},
    }}))


async def _setup(client):
    await client.post("/api/auth/setup", json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123"})
    await client.post("/api/family/members", json={"display_name": "Bo", "username": "bo", "password": "pass1234", "role": "adult"})
    await client.post("/api/family/members", json={"display_name": "Leo", "username": "leo", "password": "pass1234", "role": "child"})


async def test_checked_planned_and_everyone_told(client, db_session, tmp_path, monkeypatch):
    from sqlalchemy import select

    from app.config import get_settings
    from app.models import Notification, User

    monkeypatch.setattr(get_settings(), "updates_dir", str(tmp_path / "updates"))
    await _setup(client)

    # Before update.sh has run: nothing to compare.
    view = (await client.post("/api/admin/updates/check")).json()
    assert view["connected"] is False and view["settings"]["mode"] == "approve"

    _state(tmp_path / "updates")

    async def fake_hub(repo, prefix):
        return {"library/postgres": [("16.11-alpine", OLD)], "library/redis": [("7.4.6-alpine", OLD)]}[repo]

    status = await updates.check(db_session, NOW, fetch=fake_hub)
    assert status["running"] == {"db": "16.4", "redis": "7.4.6"} and status["available"] == {"db": "16.11-alpine"}

    # Approved: planned for the window, every adult told (not the child).
    view = (await client.post("/api/admin/updates/approve")).json()
    assert view["planned"]["versions"] == {"db": "16.11-alpine"}
    plan = (tmp_path / "updates" / "plan.env").read_text()
    assert 'PULL="postgres:16.11-alpine"' in plan and "RUN_ID=" in plan
    told = (await db_session.execute(select(User.username).join(Notification, Notification.user_id == User.id).where(Notification.kind == "server_update"))).scalars().all()
    assert sorted(told) == ["admin", "bo"]

    # update.sh reports back: told once, the plan gone.
    run_id = view["planned"]["run_id"]
    (tmp_path / "updates" / "result.env").write_text(f"RUN_ID={run_id}\nOK=1\nAT=2026-11-08T03:00:00Z\nMESSAGE=Updated: postgres:16.11-alpine\n")
    await updates.run_update_cycle(db_session, NOW)
    await updates.run_update_cycle(db_session, NOW)
    view = (await client.get("/api/admin/updates")).json()
    assert view["last_run"]["ok"] is True and view["planned"] is None
    count = len((await db_session.execute(select(Notification).where(Notification.kind == "server_update"))).scalars().all())
    assert count == 4  # planned + done, to two adults

    # Off: nothing planned, and a plan left behind is removed.
    updates.write_plan({"db": "16.11-alpine"}, NOW)
    assert (await client.put("/api/admin/updates/settings", json={"mode": "off", "day": 6, "hour": 4})).status_code == 200
    assert not (tmp_path / "updates" / "plan.env").exists()


async def test_only_the_server_admin(client):
    await _setup(client)
    await client.post("/api/auth/logout")
    await client.post("/api/auth/login", json={"username": "bo", "password": "pass1234"})
    assert (await client.get("/api/admin/updates")).status_code == 403


def test_the_next_window_is_in_the_servers_time():
    # Sunday 04:00 Stockholm, from a Monday.
    when = updates.next_window({"day": 6, "hour": 4}, NOW)
    assert when.astimezone(updates.ZoneInfo("Europe/Stockholm")).strftime("%a %H:%M") == "Sun 04:00"
    assert when > NOW

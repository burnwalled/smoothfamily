"""Backups and family data export (#59)."""
import io
import json
import zipfile
from datetime import datetime, timedelta, timezone

import pytest

pytestmark = pytest.mark.asyncio


async def _family(client):
    resp = await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "Exporters", "display_name": "Admin", "username": "admin", "password": "secret123"},
    )
    assert resp.status_code == 201
    await client.post("/api/family/members", json={"display_name": "Adult", "username": "adult1", "password": "pass1234", "role": "adult"})
    return resp.json()


@pytest.fixture
def backup_dir(tmp_path, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "backup_dir", str(tmp_path / "backup"))
    return tmp_path / "backup"


def _touch(folder, stamp):
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f"smoothfamily-{stamp}.sql.gz").write_bytes(b"db")
    (folder / f"media-{stamp}.tar.gz").write_bytes(b"media!")


async def test_family_export_has_own_data_and_no_secrets(client, db_session):
    from app.models import Family, ListModel, User
    from app.services.storage import get_storage

    me = await _family(client)
    await client.post("/api/lists", json={"name": "Groceries"})
    get_storage().save(__import__("uuid").UUID(me["family_id"]), "photos/a.jpg", io.BytesIO(b"jpeg"))
    # Another family on the same server must never end up in the export.
    other = Family(name="Neighbours")
    db_session.add(other)
    await db_session.flush()
    db_session.add(User(family_id=other.id, username="neighbour", display_name="N", password_hash="x", role="admin"))
    db_session.add(ListModel(family_id=other.id, name="Their secret list", created_by=(await db_session.execute(__import__("sqlalchemy").select(User.id).where(User.username == "neighbour"))).scalar_one()))
    await db_session.commit()

    resp = await client.get("/api/admin/export/family")
    assert resp.status_code == 200
    zf = zipfile.ZipFile(io.BytesIO(resp.content))
    names = set(zf.namelist())
    assert {"README.txt", "data/users.json", "data/lists.json", "data/families.json", "media/photos/a.jpg"} <= names
    assert not any(n in names for n in ("data/webauthn_credentials.json", "data/push_subscriptions.json", "data/app_settings.json"))
    users = json.loads(zf.read("data/users.json"))
    assert sorted(u["username"] for u in users) == ["admin", "adult1"]
    assert not any(k in users[0] for k in ("password_hash", "ical_token", "totp_secret_encrypted"))
    assert [l["name"] for l in json.loads(zf.read("data/lists.json"))] == ["Groceries"]
    assert [f["name"] for f in json.loads(zf.read("data/families.json"))] == ["Exporters"]


async def test_only_the_server_admin_manages_backups(client, backup_dir):
    await _family(client)
    _touch(backup_dir, "20261027-030000")
    data = (await client.get("/api/admin/backups")).json()
    assert [b["stamp"] for b in data["backups"]] == ["20261027-030000"]
    assert data["backups"][0]["media_size"] == 6
    file = await client.get("/api/admin/backups/files/smoothfamily-20261027-030000.sql.gz")
    assert file.status_code == 200 and file.content == b"db"
    assert (await client.get("/api/admin/backups/files/..%2F..%2Fetc%2Fpasswd")).status_code == 404
    assert (await client.get("/api/admin/backups/files/notes.txt")).status_code == 404

    await client.post("/api/auth/login", json={"username": "adult1", "password": "pass1234"})
    assert (await client.get("/api/admin/backups")).status_code == 403
    assert (await client.get("/api/admin/backups/files/smoothfamily-20261027-030000.sql.gz")).status_code == 403
    assert (await client.get("/api/admin/backups/status")).json()["show"] is False


async def test_the_admin_of_another_family_is_not_the_server_admin(client, db_session, backup_dir):
    from app.models import Family, User
    from app.security import hash_password

    await _family(client)
    other = Family(name="Hosted", created_at=datetime.now(timezone.utc) + timedelta(days=1))
    db_session.add(other)
    await db_session.flush()
    db_session.add(User(family_id=other.id, username="hosted", display_name="H", password_hash=hash_password("pass1234"), role="admin"))
    await db_session.commit()
    await client.post("/api/auth/login", json={"username": "hosted", "password": "pass1234"})
    assert (await client.get("/api/admin/backups")).status_code == 403
    # Their own family's export still works.
    assert (await client.get("/api/admin/export/family")).status_code == 200


def test_prune_keeps_the_newest(backup_dir):
    from app.services import backups

    for stamp in ("20260101-030000", "20260601-030000", "20261020-030000"):
        _touch(backup_dir, stamp)
    now = datetime(2026, 10, 27, tzinfo=timezone.utc)
    assert backups.prune(30, now) == 2
    assert [b.stamp for b in backups.list_backups()] == ["20261020-030000"]
    assert backups.prune(1, now) == 0  # the newest is always kept


async def test_scheduled_backup_once_a_day_after_the_hour(client, db_session, backup_dir, monkeypatch):
    from app.services import backups

    made = []
    now = datetime.now(timezone.utc)
    early = now.replace(hour=0, minute=30)  # 01:30–02:30 in Stockholm: before 03
    late = now.replace(hour=12)

    async def fake_create(key=None):
        # Made at the test's own time, so the test doesn't depend on when it runs.
        stamp = late.strftime(backups.STAMP_FORMAT)
        _touch(backup_dir, stamp)
        made.append(stamp)

    monkeypatch.setattr(backups, "available", lambda: True)
    monkeypatch.setattr(backups, "create_backup", fake_create)
    await _family(client)
    assert await backups.run_scheduled_backup(db_session, early) is False
    assert await backups.run_scheduled_backup(db_session, late) is True
    assert await backups.run_scheduled_backup(db_session, late) is False  # already one today
    assert len(made) == 1

    await client.put("/api/admin/backups/schedule", json={"enabled": False, "hour": 3, "keep_days": 30})
    assert (await client.get("/api/admin/backups")).json()["schedule"]["enabled"] is False


async def test_today_warns_the_server_admin_without_recent_backup(client, backup_dir, monkeypatch):
    from app.services import backups

    monkeypatch.setattr(backups, "available", lambda: True)
    await _family(client)
    assert (await client.get("/api/admin/backups/status")).json()["show"] is True
    _touch(backup_dir, datetime.now(timezone.utc).strftime(backups.STAMP_FORMAT))
    assert (await client.get("/api/admin/backups/status")).json()["show"] is False

"""Backups made from the app (backup.sh calls the same code): a gzipped pg_dump of the whole
database and an archive of all media in BACKUP_DIR, listed and downloadable by the server admin, and
made on a schedule by the background worker.

Since 2.9.0 they are sealed with the server's backup key when the server admin has made one
(services/backup_crypto.py): the server can write them but not read them. A sealed backup also holds
the server's secrets (SECRET_KEY, the database password) – without them the encrypted parts of the
database can't be opened after a restore – so the private key alone is enough to bring it all back.

A backup holds the whole server – every family – so only the server admin may use it. A single
family's data is exported with services/family_export.py instead.
"""
import asyncio
import gzip
import json
import os
import re
import shutil
import tarfile
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import unquote, urlparse
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import AppSetting
from app.services import backup_crypto

STAMP_FORMAT = "%Y%m%d-%H%M%S"
FILE_PATTERN = re.compile(r"^(smoothfamily|media|secrets)-(\d{8}-\d{6})\.(sql\.gz|tar\.gz|env)(\.sfenc)?$")
SCHEDULE_KEY = "backup_schedule"
KEY_SETTING = "backup_public_key"
# families: also a backup per family (2.8.2), the newest family_keep of each kept.
DEFAULT_SCHEDULE = {"enabled": True, "hour": 3, "keep_days": 30, "families": False, "family_keep": 7}
# Warn on Today when the newest backup is older than this.
STALE_AFTER = timedelta(days=3)

_lock = asyncio.Lock()
_state: dict = {"running": False, "error": None}


class BackupError(Exception):
    pass


@dataclass
class BackupSet:
    stamp: str
    created_at: datetime
    database: str | None
    database_size: int
    media: str | None
    media_size: int
    # Sealed with the backup key (2.9.0); secrets: the server's secrets, sealed too.
    encrypted: bool = False
    secrets: str | None = None


def backup_dir() -> Path:
    return Path(get_settings().backup_dir)


def available() -> bool:
    return shutil.which("pg_dump") is not None and get_settings().database_url.startswith("postgresql")


def list_backups() -> list[BackupSet]:
    """Backups grouped by time stamp, newest first."""
    folder = backup_dir()
    if not folder.is_dir():
        return []
    sets: dict[str, BackupSet] = {}
    for path in folder.iterdir():
        match = FILE_PATTERN.match(path.name)
        if not match or not path.is_file():
            continue
        kind, stamp = match.group(1), match.group(2)
        created = datetime.strptime(stamp, STAMP_FORMAT).replace(tzinfo=timezone.utc)
        entry = sets.setdefault(stamp, BackupSet(stamp, created, None, 0, None, 0))
        if match.group(4):
            entry.encrypted = True
        if kind == "smoothfamily":
            entry.database, entry.database_size = path.name, path.stat().st_size
        elif kind == "media":
            entry.media, entry.media_size = path.name, path.stat().st_size
        else:
            entry.secrets = path.name
    return sorted(sets.values(), key=lambda b: b.stamp, reverse=True)


def backup_file(name: str) -> Path:
    """A backup file by name – only real backup files in the backup folder."""
    if not FILE_PATTERN.match(name):
        raise BackupError("Not a backup file")
    path = backup_dir() / name
    if not path.is_file():
        raise BackupError("Backup not found")
    return path


def _pg_args() -> tuple[list[str], dict]:
    url = urlparse(get_settings().database_url.replace("postgresql+asyncpg://", "postgresql://"))
    env = {**os.environ, "PGPASSWORD": unquote(url.password or "")}
    args = ["pg_dump", "-h", url.hostname or "localhost", "-p", str(url.port or 5432), "-U", unquote(url.username or ""), "-d", url.path.lstrip("/")]
    return args, env


def _sink(dest: Path, key: bytes | None):
    """Where a backup file is written: straight to disk, or sealed on the way."""
    raw = open(dest, "wb")
    return (backup_crypto.SealWriter(raw, key), raw) if key else (raw, raw)


async def _dump_database(dest: Path, key: bytes | None = None) -> None:
    args, env = _pg_args()
    proc = await asyncio.create_subprocess_exec(*args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, env=env)
    sink, raw = _sink(dest, key)
    try:
        with gzip.GzipFile(fileobj=sink, mode="wb") as out:
            while chunk := await proc.stdout.read(1 << 16):
                out.write(chunk)
    finally:
        sink.close()
        raw.close()
    stderr = await proc.stderr.read()
    if await proc.wait() != 0:
        dest.unlink(missing_ok=True)
        raise BackupError(f"pg_dump failed: {stderr.decode(errors='replace').strip()[:300]}")


def _archive_media(dest: Path, key: bytes | None = None) -> None:
    root = Path(get_settings().media_root)
    sink, raw = _sink(dest, key)
    try:
        with tarfile.open(fileobj=sink, mode="w|gz") as tar:
            if root.is_dir():
                for child in sorted(root.iterdir()):
                    tar.add(child, arcname=child.name)
    finally:
        sink.close()
        raw.close()


def server_secrets() -> bytes:
    """What a restore needs besides the database: the server's secret and the database's address."""
    s = get_settings()
    lines = [
        "# Smooth Family – the server's secrets at the time of this backup. Put SECRET_KEY back in .env",
        "# before restoring the database, or its encrypted parts (the vault, tokens …) can't be opened.",
        f"SECRET_KEY={s.secret_key}",
        f"DATABASE_URL={s.database_url}",
        f"PUBLIC_URL={s.public_url}",
    ]
    return ("\n".join(lines) + "\n").encode()


async def get_key(db: AsyncSession) -> bytes | None:
    row = await db.get(AppSetting, KEY_SETTING)
    return backup_crypto.public_key_from_text(row.value) if row and row.value else None


async def set_key(db: AsyncSession, public: str | None) -> None:
    row = await db.get(AppSetting, KEY_SETTING)
    value = None if not public else __import__("base64").b64encode(backup_crypto.public_key_from_text(public)).decode()
    if value is None:
        if row is not None:
            await db.delete(row)
    elif row is None:
        db.add(AppSetting(key=KEY_SETTING, value=value))
    else:
        row.value = value
    await db.commit()


async def create_backup(key: bytes | None = None) -> BackupSet:
    """Database dump + media archive (+ the server's secrets when sealed); one at a time."""
    if not available():
        raise BackupError("Backups need pg_dump and a PostgreSQL database")
    if _lock.locked():
        raise BackupError("A backup is already running")
    async with _lock:
        _state.update(running=True, error=None)
        try:
            folder = backup_dir()
            folder.mkdir(parents=True, exist_ok=True)
            stamp = datetime.now(timezone.utc).strftime(STAMP_FORMAT)
            end = backup_crypto.SUFFIX if key else ""
            if key:
                # First: a sealed backup always carries what a restore needs.
                (folder / f"secrets-{stamp}.env{end}").write_bytes(backup_crypto.seal_bytes(server_secrets(), key))
            await _dump_database(folder / f"smoothfamily-{stamp}.sql.gz{end}", key)
            await asyncio.to_thread(_archive_media, folder / f"media-{stamp}.tar.gz{end}", key)
            return next(b for b in list_backups() if b.stamp == stamp)
        except Exception as exc:
            _state["error"] = str(exc)
            raise
        finally:
            _state["running"] = False


def start_backup(key: bytes | None = None) -> None:
    """Starts a backup in the background (a large media folder takes a while)."""
    if _lock.locked():
        raise BackupError("A backup is already running")
    if not available():
        raise BackupError("Backups need pg_dump and a PostgreSQL database")
    _state.update(running=True, error=None)

    async def run():
        try:
            await create_backup(key)
        except Exception:
            pass

    asyncio.get_running_loop().create_task(run())


def status() -> dict:
    return dict(_state)


def delete_backup(stamp: str) -> None:
    for name in (f"smoothfamily-{stamp}.sql.gz", f"media-{stamp}.tar.gz", f"secrets-{stamp}.env"):
        for end in ("", backup_crypto.SUFFIX):
            try:
                backup_file(name + end).unlink()
            except BackupError:
                pass


def prune(keep_days: int, now: datetime | None = None) -> int:
    """Removes backups older than keep_days, but always keeps the newest one."""
    now = now or datetime.now(timezone.utc)
    removed = 0
    for entry in list_backups()[1:]:
        if now - entry.created_at > timedelta(days=keep_days):
            delete_backup(entry.stamp)
            removed += 1
    return removed


async def get_schedule(db: AsyncSession) -> dict:
    row = await db.get(AppSetting, SCHEDULE_KEY)
    if row is None:
        return dict(DEFAULT_SCHEDULE)
    try:
        return {**DEFAULT_SCHEDULE, **json.loads(row.value)}
    except ValueError:
        return dict(DEFAULT_SCHEDULE)


async def set_schedule(db: AsyncSession, schedule: dict) -> dict:
    row = await db.get(AppSetting, SCHEDULE_KEY)
    value = json.dumps(schedule)
    if row is None:
        db.add(AppSetting(key=SCHEDULE_KEY, value=value))
    else:
        row.value = value
    await db.commit()
    return schedule


async def run_scheduled_backup(db: AsyncSession, now: datetime | None = None) -> bool:
    """From the scheduled hour (server time zone), once a day if no backup was made today."""
    schedule = await get_schedule(db)
    if not schedule["enabled"] or not available():
        return False
    now = now or datetime.now(timezone.utc)
    local = now.astimezone(ZoneInfo(get_settings().timezone))
    if local.hour < schedule["hour"]:
        return False
    newest = next(iter(list_backups()), None)
    if newest and newest.created_at.astimezone(ZoneInfo(get_settings().timezone)).date() == local.date():
        return False
    try:
        await create_backup(await get_key(db))
    except BackupError:
        return False
    prune(schedule["keep_days"], now)
    if schedule.get("families"):
        from app.services import family_backups

        await family_backups.run_all(db, schedule["family_keep"], now)
    return True

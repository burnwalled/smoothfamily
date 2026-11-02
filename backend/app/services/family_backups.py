"""Backups of one family at a time (2.8.2): a move file per family, made each night with the
server's backup when the server admin turns it on, kept for a number of nights. Encrypted with a key
only this server has (derived from its secret), so a family can be put back as it was – on this
server – without touching the others.

A family with its own backup key (2.9.0) gets its backups sealed with it on top: then not even the
server admin can open them, and putting one back needs the family's private key.
"""
import hashlib
import hmac
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Family
from app.services import families as archive
from app.services import backup_crypto, quota
from app.services.backups import STAMP_FORMAT, backup_dir

NAME = re.compile(r"^family-(\d{8}-\d{6})\.sfbak(\.sfenc)?$")


@dataclass
class FamilyBackup:
    stamp: str
    created_at: datetime
    size: int
    # Sealed with the family's own key: restoring it needs that key.
    sealed: bool = False


def _passphrase(family_id: uuid.UUID) -> str:
    return hmac.new(get_settings().secret_key.encode(), f"family-backup:{family_id}".encode(), hashlib.sha256).hexdigest()


def _folder(family_id: uuid.UUID) -> Path:
    return backup_dir() / "families" / str(family_id)


def list_backups(family_id: uuid.UUID) -> list[FamilyBackup]:
    folder = _folder(family_id)
    out = []
    for f in folder.glob("family-*.sfbak*") if folder.is_dir() else []:
        m = NAME.match(f.name)
        if m:
            when = datetime.strptime(m.group(1), STAMP_FORMAT).replace(tzinfo=timezone.utc)
            out.append(FamilyBackup(stamp=m.group(1), created_at=when, size=f.stat().st_size, sealed=bool(m.group(2))))
    return sorted(out, key=lambda b: b.stamp, reverse=True)


async def create(db: AsyncSession, family_id: uuid.UUID, now: datetime | None = None) -> FamilyBackup:
    stamp = (now or datetime.now(timezone.utc)).strftime(STAMP_FORMAT)
    blob = await archive.export_family(db, family_id, _passphrase(family_id))
    family = await db.get(Family, family_id)
    key = backup_crypto.public_key_from_text(family.backup_public_key) if family and family.backup_public_key else None
    if key:
        blob = backup_crypto.seal_bytes(blob, key)
    folder = _folder(family_id)
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / (f"family-{stamp}.sfbak" + (backup_crypto.SUFFIX if key else ""))
    tmp = folder / f"family-{stamp}.tmp"
    tmp.write_bytes(blob)
    tmp.replace(path)
    return FamilyBackup(stamp=stamp, created_at=datetime.strptime(stamp, STAMP_FORMAT).replace(tzinfo=timezone.utc), size=len(blob), sealed=bool(key))


def prune(family_id: uuid.UUID, keep: int) -> int:
    removed = 0
    for old in list_backups(family_id)[keep:]:
        (_folder(family_id) / (f"family-{old.stamp}.sfbak" + (backup_crypto.SUFFIX if old.sealed else ""))).unlink(missing_ok=True)
        removed += 1
    return removed


async def run_all(db: AsyncSession, keep: int, now: datetime | None = None) -> int:
    """Each family that isn't a demo, once (called with the server's nightly backup)."""
    made = 0
    for family in (await db.execute(select(Family).where(Family.kind != "demo"))).scalars().all():
        try:
            await create(db, family.id, now)
            prune(family.id, keep)
            made += 1
        except Exception:
            continue
    return made


def sealed_file(family_id: uuid.UUID, stamp: str) -> Path | None:
    """The family's sealed backup file (for the family to check its key against), if there is one."""
    if not re.fullmatch(r"\d{8}-\d{6}", stamp):
        return None
    path = _folder(family_id) / f"family-{stamp}.sfbak{backup_crypto.SUFFIX}"
    return path if path.is_file() else None


async def restore(db: AsyncSession, family_id: uuid.UUID, stamp: str, private_key: str | None = None) -> None:
    """Put the family back as it was then. The current state is saved first and put back if the
    restore fails, so nothing is lost on the way. A sealed backup needs the family's private key –
    used here once, never kept."""
    if not re.fullmatch(r"\d{8}-\d{6}", stamp):
        raise archive.FamilyArchiveError("No such backup")
    path = _folder(family_id) / f"family-{stamp}.sfbak"
    sealed = path.with_name(path.name + backup_crypto.SUFFIX)
    if sealed.is_file():
        if not private_key:
            raise archive.FamilyArchiveError("This backup is sealed with the family's own key – it is needed to restore it")
        try:
            blob = backup_crypto.unseal_bytes(sealed.read_bytes(), backup_crypto.private_key_from_text(private_key))
        except backup_crypto.BackupKeyError as exc:
            raise archive.FamilyArchiveError(str(exc)) from exc
    elif path.is_file():
        blob = path.read_bytes()
    else:
        raise archive.FamilyArchiveError("No such backup")
    archive.decrypt(blob, _passphrase(family_id))  # readable before anything is removed
    safety = await archive.export_family(db, family_id, _passphrase(family_id))
    await archive.delete_family(db, family_id)
    # The session still holds the rows just removed; forget them before they come back.
    db.expunge_all()
    try:
        await archive.import_family(db, blob, _passphrase(family_id))
    except Exception:
        await db.rollback()
        await archive.delete_family(db, family_id)
        db.expunge_all()
        await archive.import_family(db, safety, _passphrase(family_id))
        raise
    finally:
        quota.forget(family_id)

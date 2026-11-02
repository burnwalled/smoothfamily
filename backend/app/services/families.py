"""Whole families on a hosted server: delete, move (encrypted export / import) and the server log.

A family's rows are found generically from the table definitions: tables with `family_id`, plus
tables reached through a parent that has one (conversation members, media links, a property's
projects, a user's passkeys …). A test fails when a new table can't be reached this way.

The move archive holds everything – also password hashes and secrets, so members can sign in
again after an import – and is therefore encrypted with a passphrase the family chooses
(scrypt + AES-GCM). The server admin can carry it but not read it.
"""
import base64
import io
import json
import os
import shutil
import uuid
import zipfile
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt
from sqlalchemy import Boolean, Date, DateTime, LargeBinary, Numeric, Uuid, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import Base
from app.models import Family, ServerLog, User
from app.services.vault import plain_key, sealed_key

# Never part of a family: server-wide settings and the server's own records.
SERVER_TABLES = {"app_settings", "invitations", "server_log"}
MAGIC = b"SFMOVE1"
FORMAT_VERSION = 1


class FamilyArchiveError(Exception):
    pass


# --- Finding a family's rows ----------------------------------------------------------------


def _parent(table):
    """(column, parent table) through which a table without family_id belongs to a family."""
    for column in table.columns:
        for fk in column.foreign_keys:
            parent = fk.column.table
            if parent.name != table.name and ("family_id" in parent.c or parent.name == "families"):
                return column, parent
    return None


def family_tables() -> list:
    """Every table that holds family data, parents before children."""
    return [t for t in Base.metadata.sorted_tables if t.name not in SERVER_TABLES]


def _condition(table, family_id: uuid.UUID):
    if table.name == "families":
        return table.c.id == family_id
    if "family_id" in table.c:
        return table.c.family_id == family_id
    found = _parent(table)
    if found is None:
        raise FamilyArchiveError(f"Table {table.name} can't be tied to a family")
    column, parent = found
    return column.in_(select(parent.c.id).where(_condition(parent, family_id)))


async def delete_family(db: AsyncSession, family_id: uuid.UUID) -> None:
    """Removes every row of the family (children first) and its media folder."""
    # Rows pointing at each other (e.g. a list linked to a task) are cleared by deleting in
    # reverse dependency order; self-references are nulled first.
    for table in reversed(family_tables()):
        await db.execute(delete(table).where(_condition(table, family_id)))
    await db.commit()
    shutil.rmtree(Path(get_settings().media_root) / str(family_id), ignore_errors=True)


# --- Values to and from JSON ------------------------------------------------------------------


def _dump(value):
    if isinstance(value, (uuid.UUID, Decimal)):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, bytes):
        return {"b64": base64.b64encode(value).decode()}
    return value


def _load(column, value):
    if value is None:
        return None
    kind = column.type
    if isinstance(kind, Uuid):
        return uuid.UUID(value)
    if isinstance(kind, DateTime):
        return datetime.fromisoformat(value)
    if isinstance(kind, Date):
        return date.fromisoformat(value)
    if isinstance(kind, Numeric):
        return Decimal(value)
    if isinstance(kind, LargeBinary):
        return base64.b64decode(value["b64"])
    if isinstance(kind, Boolean):
        return bool(value)
    return value


# --- Encryption ----------------------------------------------------------------------------


def _key(passphrase: str, salt: bytes) -> bytes:
    return Scrypt(salt=salt, length=32, n=2**15, r=8, p=1).derive(passphrase.encode())


def encrypt(data: bytes, passphrase: str) -> bytes:
    salt, nonce = os.urandom(16), os.urandom(12)
    return MAGIC + salt + nonce + AESGCM(_key(passphrase, salt)).encrypt(nonce, data, MAGIC)


def decrypt(blob: bytes, passphrase: str) -> bytes:
    if not blob.startswith(MAGIC):
        raise FamilyArchiveError("This isn't a Smooth Family move file")
    salt, nonce, body = blob[7:23], blob[23:35], blob[35:]
    try:
        return AESGCM(_key(passphrase, salt)).decrypt(nonce, body, MAGIC)
    except Exception as exc:
        raise FamilyArchiveError("Wrong passphrase, or the file is damaged") from exc


# --- Move a family: export and import ----------------------------------------------------------


async def export_family(db: AsyncSession, family_id: uuid.UUID, passphrase: str) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        tables = {}
        for table in family_tables():
            rows = (await db.execute(select(table).where(_condition(table, family_id)))).mappings().all()
            tables[table.name] = [{k: _dump(v) for k, v in row.items()} for row in rows]
        # The document key is sealed with this server's key; carry it in plain text instead
        # (inside the encrypted file) so the new server can seal it with its own.
        for row in tables.get("families", []):
            row["vault_key_encrypted"] = {"plain": plain_key(row)}
        zf.writestr("family.json", json.dumps({"format": FORMAT_VERSION, "family_id": str(family_id), "tables": tables}, ensure_ascii=False))
        media = Path(get_settings().media_root) / str(family_id)
        if media.is_dir():
            for file in sorted(media.rglob("*")):
                if file.is_file():
                    zf.write(file, f"media/{file.relative_to(media).as_posix()}")
    return encrypt(buf.getvalue(), passphrase)


async def import_family(db: AsyncSession, blob: bytes, passphrase: str) -> uuid.UUID:
    """Recreates a family from a move file. The family keeps its ids, so it can't already be
    on this server, and its usernames must be free."""
    try:
        zf = zipfile.ZipFile(io.BytesIO(decrypt(blob, passphrase)))
        data = json.loads(zf.read("family.json"))
    except FamilyArchiveError:
        raise
    except Exception as exc:
        raise FamilyArchiveError("The file couldn't be read") from exc
    if data.get("format") != FORMAT_VERSION:
        raise FamilyArchiveError("The file is from a newer or older version")
    family_id = uuid.UUID(data["family_id"])
    if await db.get(Family, family_id) is not None:
        raise FamilyArchiveError("This family is already on the server")
    usernames = [u["username"] for u in data["tables"].get("users", [])]
    taken = (await db.execute(select(User.username).where(User.username.in_(usernames)))).scalars().all()
    if taken:
        raise FamilyArchiveError(f"These usernames are taken on this server: {', '.join(sorted(taken))}")

    known = {t.name: t for t in family_tables()}
    for table in family_tables():
        rows = data["tables"].get(table.name, [])
        if not rows:
            continue
        values = [{k: _load(table.c[k], v) for k, v in row.items() if k in table.c} for row in rows]
        if table.name == "families":
            for row, raw in zip(values, rows):
                key = raw.get("vault_key_encrypted")
                row["vault_key_encrypted"] = sealed_key(key.get("plain")) if isinstance(key, dict) else key
                row["kind"] = "hosted"
                row["status"] = "active"
                row["invitation_id"] = None
                # A family that moves here is set up already (older files lack the column).
                row["guide_done_at"] = row.get("guide_done_at") or datetime.now(timezone.utc)
        if table.name == "users":
            for row in values:
                row["is_server_admin"] = False
        await db.execute(table.insert(), values)
    unknown = set(data["tables"]) - set(known)
    await db.commit()

    media_root = Path(get_settings().media_root) / str(family_id)
    for name in zf.namelist():
        if name.startswith("media/") and not name.endswith("/"):
            dest = (media_root / name[len("media/"):]).resolve()
            if media_root.resolve() not in dest.parents:
                continue  # never write outside the family's folder
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(zf.read(name))
    if unknown:
        await log(db, None, "import_skipped_tables", family_id, ", ".join(sorted(unknown)))
    return family_id


# --- Server log ------------------------------------------------------------------------------


async def log(db: AsyncSession, actor: User | None, action: str, family_id: uuid.UUID | None, detail: str = "") -> None:
    db.add(
        ServerLog(
            actor_id=actor.id if actor else None,
            actor_name=actor.display_name if actor else "",
            action=action,
            family_id=family_id,
            detail=detail[:2000],
            created_at=datetime.now(timezone.utc),
        )
    )
    await db.commit()


async def remove_stale_demos(db: AsyncSession, now: datetime | None = None) -> int:
    """Demo families whose invitation expired, was revoked or was used."""
    from app.models import Invitation

    now = now or datetime.now(timezone.utc)
    removed = 0
    rows = (await db.execute(select(Invitation).where(Invitation.demo_family_id.is_not(None)))).scalars().all()
    for inv in rows:
        expires = inv.expires_at if inv.expires_at.tzinfo else inv.expires_at.replace(tzinfo=timezone.utc)
        if inv.revoked_at or inv.used_at or expires <= now:
            demo = inv.demo_family_id
            inv.demo_family_id = None
            await db.commit()
            await delete_family(db, demo)
            removed += 1
    return removed

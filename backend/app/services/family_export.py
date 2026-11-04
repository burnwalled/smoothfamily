"""Everything one family has in Smooth Family, as a zip: one JSON file per table (only this
family's rows) plus the family's media files, readable without the app.

Secrets are left out (password hashes, two-step and Home Assistant tokens, passkeys, push
subscriptions, the calendar subscription token), so the export is safe to keep on a laptop or
in a cloud folder. It is not a restore file: use a backup for that.
"""
import json
import tempfile
import uuid
import zipfile
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import Base
from app.models import Document, DocumentFile, Family, VaultFile
from app.services.vault import family_fernet

# Never exported: server-wide settings and credentials.
SKIP_TABLES = {"app_settings", "push_subscriptions", "webauthn_credentials"}
SECRET_COLUMNS = {
    "users": {"password_hash", "ical_token", "totp_secret_encrypted", "totp_pending_encrypted", "totp_last_step"},
    "smarthome_connections": {"token_encrypted"},
    "families": {"vault_key_encrypted"},
    "guest_access": {"token_hash"},
    "wish_shares": {"token_hash"},
    "vault_shares": {"token_hash"},
    "coparents": {"password_hash", "invite_token_hash"},
    # The vault's passwords: an adult's are theirs alone, so not even the family's export has them.
    "vault_logins": {"username_encrypted", "password_encrypted", "notes_encrypted"},
}
# Tables without family_id, reached through their parent: table → (column, parent table).
VIA_PARENT = {
    "conversation_members": ("conversation_id", "conversations"),
    "media_links": ("media_id", "media_items"),
    "property_projects": ("property_id", "properties"),
    "property_recurring_costs": ("property_id", "properties"),
    "utility_readings": ("property_id", "properties"),
}

README = """Smooth Family – export of {family}
Made {when} (UTC).

data/<table>.json – every row of your family in that table (one JSON list per table).
media/            – your photos, chat pictures, receipts, avatars and other files.
documents/        – your saved documents, with their numbers and scans in plain text.
files/            – the files kept in the vault (not those someone keeps private).

Left out on purpose: passwords (also those in the vault), two-step codes, passkeys, push subscriptions, the calendar
subscription token and the Home Assistant token – and what the app keeps from the one exporting: another adult's
private documents, medicines, health they don't share, private costs and subscriptions, chats they aren't in.
This export is for keeping and reading; to move or restore a whole installation, use a backup.
"""


def _plain(value):
    if isinstance(value, (uuid.UUID, Decimal)):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, bytes):
        return None
    return value


def _parent_column(table, parent: str):
    for column in table.columns:
        for fk in column.foreign_keys:
            if fk.column.table.name == parent:
                return column
    return None


class Viewer:
    """What the one exporting may see: the app's own rules, so that the export shows no more than the app
    does – another adult's private documents, medicines, health or chats stay out."""

    def __init__(self, user_id: uuid.UUID | None, people: dict[str, dict], conversations: set[str]) -> None:
        self.user_id = str(user_id) if user_id else None
        self.people = people  # user id → {"role", "health_share"}
        self.conversations = conversations

    def is_adult(self, user_id) -> bool:
        return self.people.get(str(user_id), {}).get("role") in ("admin", "adult")

    def other_adult(self, user_id) -> bool:
        return user_id is not None and self.is_adult(user_id) and str(user_id) != self.user_id

    def shares(self, user_id, what: str) -> bool:
        return (self.people.get(str(user_id), {}).get("health_share") or {}).get(what) in ("adults", "family")

    def keep(self, table: str, row: dict) -> bool:
        if table == "documents" and row.get("private") and self.other_adult(row.get("user_id")):
            return False
        if table == "medications" and self.other_adult(row.get("user_id")):
            return False
        if table == "workouts" and self.other_adult(row.get("user_id")) and not self.shares(row["user_id"], "workouts"):
            return False
        if table in ("economy_entries", "subscriptions") and row.get("private") and str(row.get("created_by")) != self.user_id:
            return False
        if table == "vault_logins" and self.other_adult(row.get("owner_id")) and self.user_id not in [str(x) for x in (row.get("shared_with") or [])]:
            return False
        if table in ("conversations", "chat_messages") and str(row.get("id") if table == "conversations" else row.get("conversation_id")) not in self.conversations:
            return False
        if table == "conversation_members" and str(row.get("conversation_id")) not in self.conversations:
            return False
        return True

    def trim(self, table: str, row: dict) -> dict:
        if table == "health_days" and self.other_adult(row.get("user_id")):
            for column, what in (("steps", "steps"), ("sleep_minutes", "sleep"), ("weight_kg", "weight"), ("resting_hr", "steps")):
                if not self.shares(row["user_id"], what):
                    row[column] = None
        return row


async def viewer_for(db: AsyncSession, family_id: uuid.UUID, user_id: uuid.UUID | None) -> Viewer:
    users = Base.metadata.tables["users"]
    rows = (await db.execute(select(users.c.id, users.c.role, users.c.health_share).where(users.c.family_id == family_id))).all()
    people = {str(r.id): {"role": r.role, "health_share": r.health_share} for r in rows}
    members = Base.metadata.tables["conversation_members"]
    mine = (await db.execute(select(members.c.conversation_id).where(members.c.user_id == user_id))).scalars().all() if user_id else []
    return Viewer(user_id, people, {str(c) for c in mine})


async def _rows(db: AsyncSession, table, family_id: uuid.UUID, viewer: Viewer) -> list[dict]:
    if table.name == "families":
        query = select(table).where(table.c.id == family_id)
    elif "family_id" in table.c:
        query = select(table).where(table.c.family_id == family_id)
    elif table.name in VIA_PARENT:
        column_name, parent_name = VIA_PARENT[table.name]
        parent = Base.metadata.tables[parent_name]
        column = table.c[column_name] if column_name in table.c else _parent_column(table, parent_name)
        query = select(table).where(column.in_(select(parent.c.id).where(parent.c.family_id == family_id)))
    else:
        return []
    hidden = SECRET_COLUMNS.get(table.name, set())
    rows = (await db.execute(query)).mappings().all()
    out = [{k: _plain(v) for k, v in row.items() if k not in hidden} for row in rows]
    return [viewer.trim(table.name, row) for row in out if viewer.keep(table.name, row)]


async def build_export(db: AsyncSession, family_id: uuid.UUID, family_name: str, user_id: uuid.UUID | None = None) -> Path:
    """Writes the zip to a temporary file and returns its path (the caller removes it). `user_id` is the
    one exporting: the export shows what they may see in the app."""
    viewer = await viewer_for(db, family_id, user_id)
    tmp = tempfile.NamedTemporaryFile(prefix="smooth-family-export-", suffix=".zip", delete=False)
    tmp.close()
    path = Path(tmp.name)
    now = datetime.now(timezone.utc)
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("README.txt", README.format(family=family_name, when=now.strftime("%Y-%m-%d %H:%M")))
        for table in sorted(Base.metadata.tables.values(), key=lambda t: t.name):
            if table.name in SKIP_TABLES:
                continue
            rows = await _rows(db, table, family_id, viewer)
            zf.writestr(f"data/{table.name}.json", json.dumps(rows, ensure_ascii=False, indent=1))
        media = Path(get_settings().media_root) / str(family_id)
        if media.is_dir():
            for file in sorted(media.rglob("*")):
                # Document and vault files are encrypted; they are added readable below.
                rel = file.relative_to(media).as_posix()
                if file.is_file() and not rel.startswith(("documents/", "files/")):
                    zf.write(file, f"media/{file.relative_to(media).as_posix()}")
        await _add_documents(db, zf, family_id, media, viewer)
        await _add_vault_files(db, zf, family_id, media)
    return path


async def _add_vault_files(db: AsyncSession, zf: zipfile.ZipFile, family_id: uuid.UUID, media: Path) -> None:
    """files/ – the vault's own files, readable; those someone keeps private are left out."""
    rows = (await db.execute(select(VaultFile).where(VaultFile.family_id == family_id, VaultFile.private.is_(False)))).scalars().all()
    if not rows:
        return
    fernet = await family_fernet(db, await db.get(Family, family_id))
    for row in rows:
        path = media / row.storage_key
        if path.is_file():
            zf.writestr(f"files/{row.id}/{row.filename}", fernet.decrypt(path.read_bytes()))


async def _add_documents(db: AsyncSession, zf: zipfile.ZipFile, family_id: uuid.UUID, media: Path, viewer: Viewer) -> None:
    """documents/documents.json with the numbers in plain text, and each file readable – not another
    adult's private ones."""
    family = await db.get(Family, family_id)
    docs = (await db.execute(select(Document).where(Document.family_id == family_id))).scalars().all()
    docs = [d for d in docs if not (d.private and viewer.other_adult(d.user_id))]
    if not docs:
        return
    fernet = await family_fernet(db, family)
    out = []
    for doc in docs:
        files = (await db.execute(select(DocumentFile).where(DocumentFile.document_id == doc.id))).scalars().all()
        names = []
        for f in files:
            path = media / f.storage_key
            if path.is_file():
                name = f"documents/{doc.id}/{f.filename}"
                zf.writestr(name, fernet.decrypt(path.read_bytes()))
                names.append(name)
        out.append(
            {
                "title": doc.title, "kind": doc.kind, "user_id": str(doc.user_id) if doc.user_id else None,
                "number": fernet.decrypt(doc.number_encrypted.encode()).decode() if doc.number_encrypted else None,
                "issued_date": _plain(doc.issued_date), "expiry_date": _plain(doc.expiry_date), "notes": doc.notes, "files": names,
            }
        )
    zf.writestr("documents/documents.json", json.dumps(out, ensure_ascii=False, indent=1))

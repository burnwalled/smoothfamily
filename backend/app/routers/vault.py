"""The vault (2.8.1): photos, albums, chat pictures, receipts and documents in one place, with filters.
Each file is shown to those its own app shows it to; Photos is the vault's view of the albums."""
import io
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Form, HTTPException, Query, Response, UploadFile, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import false, or_, select

from app.deps import DB, CurrentUser, require_app
from app.services.uploads import read_upload
from app.models import Album, Document, DocumentFile, Family, MediaItem, User, VaultFile, VaultLogin
from app.routers import documents as docs
from app.routers.albums import ALLOWED_IMAGE_TYPES, MediaOut, _can_view, _media_out, store_upload
from app.services import file_vault as vault
from app.services import file_limit, quota
from app.services.safe_files import headers_for
from app.services.storage import get_storage
from app.services.vault import family_fernet

router = APIRouter(prefix="/api/vault", tags=["vault"])
photos_only = [require_app("photos")]

SOURCES = ("photo", "chat", "receipt", "document", "file")
NO_STORE = {"Cache-Control": "no-store, private"}
# What the app shows in the page (the office files are read in the browser).
PREVIEWABLE = docs.PREVIEWABLE | {"image/gif"}


class VaultItem(BaseModel):
    id: str
    source: str  # photo | chat | receipt | document | file
    kind: str  # image | video | file
    title: str
    # Where it belongs: the album, the chat, "Volvo · Fuel", the document's owner.
    context: str
    created_at: datetime
    media_id: uuid.UUID | None = None
    content_type: str = ""
    # Whether the app can show it (most office files can only be downloaded).
    previewable: bool = True
    # What to show and open: a thumbnail, and the file itself.
    thumb: str | None = None
    url: str
    # The app it comes from, for "open in …".
    link: str | None = None
    # A photo album, or the chat (its conversation) a picture was sent in.
    album_id: uuid.UUID | None = None
    can_delete: bool = False
    # A file only the one who put it there sees.
    private: bool = False


class VaultAlbum(BaseModel):
    id: uuid.UUID
    kind: str  # user | chat
    name: str
    item_count: int
    cover: uuid.UUID | None
    created_by: uuid.UUID | None
    created_at: datetime | None


class CopyIn(BaseModel):
    album_id: uuid.UUID


def _media_item(m: MediaItem, user: User, source: str, context: str, link: str | None, album_id: uuid.UUID | None) -> VaultItem:
    return VaultItem(
        id=str(m.id), source=source, kind=m.kind, title=m.original_name, context=context, created_at=m.created_at,
        media_id=m.id, content_type=m.content_type, thumb=f"/api/media/{m.id}/thumb", url=f"/api/media/{m.id}/{'web' if m.kind == 'image' else 'original'}",
        link=link, album_id=album_id, can_delete=source == "photo" and (m.uploaded_by == user.id or user.role == "admin"),
    )


async def _photos(db, user: User, album_id: uuid.UUID | None, receipt_ids: set[uuid.UUID]) -> list[VaultItem]:
    query = (
        select(MediaItem, Album)
        .join(Album, Album.id == MediaItem.album_id)
        .where(MediaItem.family_id == user.family_id, Album.kind == "user")
    )
    if album_id is not None:
        query = query.where(Album.id == album_id)
    rows = (await db.execute(query.order_by(MediaItem.created_at.desc()))).all()
    # A photo used as a receipt (from before receipts had their own album) is shown as the receipt.
    return [_media_item(m, user, "photo", a.name, "/vault", a.id) for m, a in rows if m.id not in receipt_ids]


async def _receipts(db, user: User, refs: dict[uuid.UUID, list[vault.ReceiptRef]]) -> list[VaultItem]:
    album_ids = (await db.execute(select(Album.id).where(Album.family_id == user.family_id, Album.kind == "receipts"))).scalars().all()
    ids = set(refs)
    rows = (
        await db.execute(
            select(MediaItem).where(
                MediaItem.family_id == user.family_id,
                or_(MediaItem.id.in_(ids) if ids else false(), MediaItem.album_id.in_(album_ids) if album_ids else false()),
            ).order_by(MediaItem.created_at.desc())
        )
    ).scalars().all()
    out = []
    for m in rows:
        seen = vault.visible_refs(refs.get(m.id, []), user)
        if not seen and m.uploaded_by != user.id:
            continue
        context = " · ".join(dict.fromkeys(r.context for r in seen)) if seen else ""
        out.append(_media_item(m, user, "receipt", context, seen[0].link if seen else None, None))
    return out


async def _chat(db, user: User, conv_id: uuid.UUID | None) -> list[VaultItem]:
    names = await vault.my_chats(db, user)
    return [_media_item(m, user, "chat", names.get(cid, ""), "/chat", cid) for m, cid in await vault.chat_media(db, user, conv_id)]


async def _documents(db, user: User) -> list[VaultItem]:
    rows = (
        await db.execute(
            select(DocumentFile, Document)
            .join(Document, Document.id == DocumentFile.document_id)
            .where(Document.family_id == user.family_id)
            .order_by(DocumentFile.created_at.desc())
        )
    ).all()
    owners = {u.id: u.display_name for u in (await db.execute(select(User).where(User.family_id == user.family_id))).scalars().all()}
    out = []
    for f, doc in rows:
        if not await docs.may_see(db, user, doc):
            continue
        url = f"/api/documents/{doc.id}/files/{f.id}"
        image = f.content_type.startswith("image/")
        out.append(VaultItem(
            id=str(f.id), source="document", kind="image" if image else "file", title=doc.title,
            context=owners.get(doc.user_id, "") if doc.user_id else "", created_at=f.created_at,
            thumb=url if image else None, url=url, link=None, content_type=f.content_type, previewable=f.content_type in docs.PREVIEWABLE,
        ))
    return out


def may_see_file(user: User, row: VaultFile) -> bool:
    return row.family_id == user.family_id and (not row.private or row.uploaded_by == user.id)


async def _files(db, user: User) -> list[VaultItem]:
    rows = (await db.execute(select(VaultFile).where(VaultFile.family_id == user.family_id).order_by(VaultFile.created_at.desc()))).scalars().all()
    people = {u.id: u.display_name for u in (await db.execute(select(User).where(User.family_id == user.family_id))).scalars().all()}
    out = []
    for f in rows:
        if not may_see_file(user, f):
            continue
        url = f"/api/vault/files/{f.id}"
        image = f.content_type in {"image/jpeg", "image/png", "image/webp", "image/gif"}
        out.append(VaultItem(
            id=str(f.id), source="file", kind="image" if image else "file", title=f.filename,
            context=people.get(f.uploaded_by, ""), created_at=f.created_at, content_type=f.content_type,
            previewable=f.content_type in PREVIEWABLE, thumb=url if image else None, url=url,
            can_delete=f.uploaded_by == user.id or user.role == "admin", private=f.private,
        ))
    return out


@router.get("", response_model=list[VaultItem], dependencies=photos_only)
async def list_vault(
    user: CurrentUser,
    db: DB,
    source: str = Query(default="all", pattern=r"^(all|photo|chat|receipt|document|file)$"),
    album_id: uuid.UUID | None = None,
    q: str = Query(default="", max_length=100),
    limit: int = Query(default=300, ge=1, le=1000),
) -> list[VaultItem]:
    """Everything this member may see, newest first; one source, one album or chat, or a search."""
    wanted = SOURCES if source == "all" else (source,)
    refs = await vault.receipt_refs(db, user.family_id)
    items: list[VaultItem] = []
    if "photo" in wanted:
        items += await _photos(db, user, album_id if source == "photo" else None, set(refs))
    if "chat" in wanted and "chat" in user.apps:
        items += await _chat(db, user, album_id if source == "chat" else None)
    if "receipt" in wanted and {"vehicles", "property"} & set(user.apps):
        items += await _receipts(db, user, refs)
    if "document" in wanted and "documents" in user.apps:
        items += await _documents(db, user)
    if "file" in wanted:
        items += await _files(db, user)
    if q.strip():
        needle = q.strip().lower()
        items = [i for i in items if needle in i.title.lower() or needle in i.context.lower()]
    items.sort(key=lambda i: i.created_at, reverse=True)
    return items[:limit]


@router.get("/albums", response_model=list[VaultAlbum], dependencies=photos_only)
async def list_albums(user: CurrentUser, db: DB) -> list[VaultAlbum]:
    """The family's photo albums, then one album per chat this member is in (those with pictures)."""
    refs = await vault.receipt_refs(db, user.family_id)
    albums = (
        await db.execute(select(Album).where(Album.family_id == user.family_id, Album.kind == "user").order_by(Album.created_at.desc()))
    ).scalars().all()
    out = []
    for a in albums:
        rows = (
            await db.execute(select(MediaItem.id, MediaItem.kind).where(MediaItem.album_id == a.id).order_by(MediaItem.created_at.desc()))
        ).all()
        rows = [r for r in rows if r.id not in refs]
        cover = next((r.id for r in rows if r.kind == "image"), None)
        out.append(VaultAlbum(id=a.id, kind="user", name=a.name, item_count=len(rows), cover=cover, created_by=a.created_by, created_at=a.created_at))
    if "chat" in user.apps:
        names = await vault.my_chats(db, user)
        per_chat: dict[uuid.UUID, list[MediaItem]] = {}
        for m, cid in await vault.chat_media(db, user):
            per_chat.setdefault(cid, []).append(m)
        for cid, media in per_chat.items():
            cover = next((m.id for m in media if m.kind == "image"), None)
            out.append(VaultAlbum(id=cid, kind="chat", name=names.get(cid, ""), item_count=len(media), cover=cover, created_by=None, created_at=None))
    return out


@router.post("/media/{media_id}/copy", response_model=MediaOut, status_code=201, dependencies=photos_only)
async def copy_to_album(media_id: uuid.UUID, payload: CopyIn, user: CurrentUser, db: DB) -> MediaOut:
    """Keep a picture from a chat (or a receipt) in one of the family's albums as well."""
    item = await db.get(MediaItem, media_id)
    if item is None or item.family_id != user.family_id or not await _can_view(item, user, db):
        raise HTTPException(status_code=404, detail="Media not found")
    album = await db.get(Album, payload.album_id)
    if album is None or album.family_id != user.family_id or album.kind != "user":
        raise HTTPException(status_code=404, detail="Album not found")
    await quota.check(db, user.family_id, item.size_bytes)
    storage = get_storage()
    new_id = uuid.uuid4()
    old_base = item.storage_key.rsplit(".", 1)[0]
    new_base = f"albums/{album.id}/{new_id}"
    ext = Path(item.storage_key).suffix
    for old, new in ((item.storage_key, new_base + ext), (old_base + "_web.jpg", new_base + "_web.jpg"), (old_base + "_thumb.jpg", new_base + "_thumb.jpg")):
        if storage.exists(item.family_id, old):
            storage.save(item.family_id, new, io.BytesIO(storage.open(item.family_id, old).read_bytes()))
    copy = MediaItem(
        id=new_id, family_id=item.family_id, album_id=album.id, uploaded_by=user.id, kind=item.kind,
        original_name=item.original_name, storage_key=new_base + ext, content_type=item.content_type,
        size_bytes=item.size_bytes, width=item.width, height=item.height, taken_at=item.taken_at,
    )
    db.add(copy)
    await db.commit()
    await db.refresh(copy)
    return _media_out(copy)


@router.post("/receipts", response_model=MediaOut, status_code=201)
async def upload_receipt(file: UploadFile, user: CurrentUser, db: DB) -> MediaOut:
    """A receipt photo for a vehicle or the home: kept in the family's receipts album, which only shows
    a receipt to those who may see what it belongs to."""
    if not {"vehicles", "property", "photos"} & set(user.apps):
        raise HTTPException(status_code=403, detail="This app is not enabled for you")
    album = await vault.receipts_album(db, user)
    return await store_upload(file, album, user, db, ALLOWED_IMAGE_TYPES)


# --- Any file -----------------------------------------------------------------------------------


@router.post("/files", response_model=VaultItem, status_code=status.HTTP_201_CREATED, dependencies=photos_only)
async def upload_file(user: CurrentUser, db: DB, file: UploadFile, private: bool = Form(default=False)) -> VaultItem:
    """Any file into the vault, encrypted with the family's key."""
    data = await read_upload(file, await file_limit.max_bytes(db))
    if not data:
        raise HTTPException(status_code=422, detail="The file is empty")
    # Encrypted as a whole in memory: the server admin sets how large (services/file_limit.py).
    limit = await file_limit.too_large(db, len(data))
    if limit:
        raise HTTPException(status_code=413, detail=f"The file is larger than {limit} MB")
    await quota.check(db, user.family_id, len(data))
    fernet = await family_fernet(db, await db.get(Family, user.family_id))
    row = VaultFile(
        id=uuid.uuid4(), family_id=user.family_id, uploaded_by=user.id, filename=(file.filename or "file")[:200],
        content_type=(file.content_type or "application/octet-stream")[:150], size_bytes=len(data), storage_key="", private=private,
    )
    row.storage_key = f"files/{row.id}.enc"
    get_storage().save(user.family_id, row.storage_key, io.BytesIO(fernet.encrypt(data)))
    db.add(row)
    await db.commit()
    return next(i for i in await _files(db, user) if i.id == str(row.id))


async def _file(db, user: User, file_id: uuid.UUID) -> VaultFile:
    row = await db.get(VaultFile, file_id)
    if row is None or not may_see_file(user, row):
        raise HTTPException(status_code=404, detail="File not found")
    return row


async def read_file(db, row: VaultFile) -> bytes:
    fernet = await family_fernet(db, await db.get(Family, row.family_id))
    return fernet.decrypt(get_storage().open(row.family_id, row.storage_key).read_bytes())


@router.get("/files/{file_id}", dependencies=photos_only)
async def get_file(file_id: uuid.UUID, user: CurrentUser, db: DB, download: bool = False) -> Response:
    row = await _file(db, user, file_id)
    media_type, headers = headers_for(row.content_type, row.filename, download)
    return Response(content=await read_file(db, row), media_type=media_type, headers={**headers, **NO_STORE})


@router.delete("/files/{file_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=photos_only)
async def delete_file(file_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    row = await _file(db, user, file_id)
    if row.uploaded_by != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Only the one who put it there, or the admin, can remove it")
    get_storage().delete(row.family_id, row.storage_key)
    await db.delete(row)
    await db.commit()


# --- The password manager ---------------------------------------------------------------------
# Usernames, passwords and notes are encrypted with the family's key. An adult's logins are theirs
# alone (also the admin's) unless they share one with chosen adults, who may see and copy it but not
# change it. A child's logins are seen and kept up to date by the adults; a child sees only their own.

class LoginIn(BaseModel):
    # Whose it is: yourself (left out), or for an adult a child in the family.
    owner_id: uuid.UUID | None = None
    title: str = Field(min_length=1, max_length=120)
    url: str = Field(default="", max_length=500)
    username: str = Field(default="", max_length=200)
    # None keeps what is saved when editing.
    password: str | None = Field(default=None, max_length=500)
    notes: str | None = Field(default=None, max_length=2000)
    # The adults an adult's own login is shared with; None keeps it as it is.
    shared_with: list[uuid.UUID] | None = Field(default=None, max_length=50)

    @field_validator("url")
    @classmethod
    def _web_address(cls, v: str) -> str:
        v = v.strip()
        if not v:
            return ""
        if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", v) and not re.match(r"^https?://", v, re.I):
            raise ValueError("Only web addresses (https://…)")
        return v if re.match(r"^https?://", v, re.I) else f"https://{v}"


class LoginOut(BaseModel):
    id: uuid.UUID
    owner_id: uuid.UUID
    owner_name: str
    title: str
    url: str
    username: str
    has_password: bool
    has_notes: bool
    updated_at: datetime
    shared_with: list[uuid.UUID]
    # The owner (or an adult for a child's); those it is shared with only see and copy it.
    can_edit: bool


def _adult(user: User | None) -> bool:
    return user is not None and user.role in {"admin", "adult"}


def _shared(row: VaultLogin) -> list[str]:
    return [str(uid) for uid in row.shared_with or []]


def _may_edit(user: User, row: VaultLogin, owner: User | None) -> bool:
    if row.family_id != user.family_id:
        return False
    return row.owner_id == user.id or (_adult(user) and owner is not None and owner.role == "child")


def _may_see(user: User, row: VaultLogin, owner: User | None) -> bool:
    # Shared with an adult – and only while the owner is an adult themselves.
    return _may_edit(user, row, owner) or (_adult(user) and _adult(owner) and str(user.id) in _shared(row))


async def _login_row(db, user: User, login_id: uuid.UUID, edit: bool = False) -> tuple[VaultLogin, User | None]:
    row = await db.get(VaultLogin, login_id)
    owner = await db.get(User, row.owner_id) if row else None
    if row is None or not _may_see(user, row, owner):
        raise HTTPException(status_code=404, detail="Login not found")
    if edit and not _may_edit(user, row, owner):
        raise HTTPException(status_code=403, detail="Only the owner can change a shared login")
    return row, owner


async def _owner_for(db, user: User, owner_id: uuid.UUID | None) -> User:
    if owner_id is None or owner_id == user.id:
        return user
    owner = await db.get(User, owner_id)
    if owner is None or owner.family_id != user.family_id or owner.role != "child" or not _adult(user):
        raise HTTPException(status_code=403, detail="An adult can keep logins for the family's children only")
    return owner


async def _share_list(db, owner: User, shared_with: list[uuid.UUID]) -> list[str]:
    """Only an adult's own logins are shared, and only with other adults in the family."""
    wanted = {str(uid) for uid in shared_with} - {str(owner.id)}
    if not wanted:
        return []
    if not _adult(owner):
        raise HTTPException(status_code=422, detail="A child's logins are already seen by the adults")
    adults = {
        str(u.id)
        for u in (await db.execute(select(User).where(User.family_id == owner.family_id, User.role.in_(["admin", "adult"])))).scalars().all()
    }
    if wanted - adults:
        raise HTTPException(status_code=422, detail="Logins can be shared with the family's adults only")
    return sorted(wanted)


def _login_out(row: VaultLogin, owner: User | None, fernet, user: User) -> LoginOut:
    return LoginOut(
        id=row.id, owner_id=row.owner_id, owner_name=owner.display_name if owner else "", title=row.title, url=row.url,
        username=fernet.decrypt(row.username_encrypted.encode()).decode() if row.username_encrypted else "",
        has_password=bool(row.password_encrypted), has_notes=bool(row.notes_encrypted), updated_at=row.updated_at,
        shared_with=[uuid.UUID(uid) for uid in _shared(row)], can_edit=_may_edit(user, row, owner),
    )


def _seal(fernet, value: str | None) -> str | None:
    return fernet.encrypt(value.encode()).decode() if value else None


@router.get("/logins", response_model=list[LoginOut], dependencies=photos_only)
async def list_logins(user: CurrentUser, db: DB) -> list[LoginOut]:
    rows = (await db.execute(select(VaultLogin).where(VaultLogin.family_id == user.family_id).order_by(VaultLogin.title))).scalars().all()
    people = {u.id: u for u in (await db.execute(select(User).where(User.family_id == user.family_id))).scalars().all()}
    fernet = await family_fernet(db, await db.get(Family, user.family_id))
    return [_login_out(row, people.get(row.owner_id), fernet, user) for row in rows if _may_see(user, row, people.get(row.owner_id))]


@router.post("/logins", response_model=LoginOut, status_code=status.HTTP_201_CREATED, dependencies=photos_only)
async def add_login(payload: LoginIn, user: CurrentUser, db: DB) -> LoginOut:
    owner = await _owner_for(db, user, payload.owner_id)
    fernet = await family_fernet(db, await db.get(Family, user.family_id))
    row = VaultLogin(
        family_id=user.family_id, owner_id=owner.id, title=payload.title.strip(), url=payload.url,
        username_encrypted=_seal(fernet, payload.username), password_encrypted=_seal(fernet, payload.password),
        notes_encrypted=_seal(fernet, payload.notes), shared_with=await _share_list(db, owner, payload.shared_with or []),
        created_by=user.id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _login_out(row, owner, fernet, user)


@router.put("/logins/{login_id}", response_model=LoginOut, dependencies=photos_only)
async def update_login(login_id: uuid.UUID, payload: LoginIn, user: CurrentUser, db: DB) -> LoginOut:
    row, owner = await _login_row(db, user, login_id, edit=True)
    if payload.owner_id:
        owner = await _owner_for(db, user, payload.owner_id)
    fernet = await family_fernet(db, await db.get(Family, user.family_id))
    row.owner_id = owner.id
    row.title = payload.title.strip()
    row.url = payload.url
    row.username_encrypted = _seal(fernet, payload.username)
    if payload.password is not None:
        row.password_encrypted = _seal(fernet, payload.password)
    if payload.notes is not None:
        row.notes_encrypted = _seal(fernet, payload.notes)
    if payload.shared_with is not None or not _adult(owner):
        row.shared_with = await _share_list(db, owner, payload.shared_with or [])
    row.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(row)
    return _login_out(row, owner, fernet, user)


@router.delete("/logins/{login_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=photos_only)
async def delete_login(login_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    row, _ = await _login_row(db, user, login_id, edit=True)
    await db.delete(row)
    await db.commit()


@router.get("/logins/{login_id}/secret", dependencies=photos_only)
async def reveal_login(login_id: uuid.UUID, user: CurrentUser, db: DB) -> JSONResponse:
    """The password and note, only when someone taps "show" or "copy" – never cached."""
    row, _ = await _login_row(db, user, login_id)
    fernet = await family_fernet(db, await db.get(Family, user.family_id))
    return JSONResponse(
        {
            "password": fernet.decrypt(row.password_encrypted.encode()).decode() if row.password_encrypted else "",
            "notes": fernet.decrypt(row.notes_encrypted.encode()).decode() if row.notes_encrypted else "",
        },
        headers=NO_STORE,
    )

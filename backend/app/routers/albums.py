"""Albums and media: upload, serve (with Range support), and CRUD."""
import io
import mimetypes
import os
import uuid
from datetime import date, datetime, timezone
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.services import quota
from app.config import get_settings
from app.deps import AdminUser, CurrentUser, DB, require_app
from app.models import Album, ChatMessage, ConversationMember, MediaItem
from app.services.memories import _zone as memory_zone, exif_taken, on_this_day
from app.services.storage import get_storage

router = APIRouter(prefix="/api/albums", tags=["albums"], dependencies=[require_app("photos")])
media_router = APIRouter(prefix="/api/media", tags=["media"])

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
ALLOWED_VIDEO_TYPES = {"video/mp4", "video/webm", "video/quicktime"}
ALLOWED_TYPES = ALLOWED_IMAGE_TYPES | ALLOWED_VIDEO_TYPES

THUMB_SIZE = (320, 320)
WEB_SIZE = (1600, 1600)


# ── Schemas ───────────────────────────────────────────────────────────────────

class AlbumCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class AlbumOut(BaseModel):
    id: uuid.UUID
    name: str
    created_by: uuid.UUID
    created_at: str
    item_count: int = 0


class MediaOut(BaseModel):
    id: uuid.UUID
    album_id: uuid.UUID
    uploaded_by: uuid.UUID
    kind: str
    original_name: str
    content_type: str
    size_bytes: int
    width: int | None
    height: int | None
    created_at: str


def _media_out(m: MediaItem) -> MediaOut:
    return MediaOut(
        id=m.id, album_id=m.album_id, uploaded_by=m.uploaded_by, kind=m.kind, original_name=m.original_name,
        content_type=m.content_type, size_bytes=m.size_bytes, width=m.width, height=m.height, created_at=m.created_at.isoformat(),
    )


# ── Image processing ──────────────────────────────────────────────────────────

def _process_image(data: bytes, storage, family_id: uuid.UUID, base_key: str) -> tuple[int, int]:
    """Create web + thumb variants. Returns (width, height) of original."""
    from PIL import Image

    img = Image.open(io.BytesIO(data))
    img = img.convert("RGB") if img.mode != "RGB" else img
    w, h = img.size

    # Web version (max 1600px)
    web = img.copy()
    web.thumbnail(WEB_SIZE, Image.LANCZOS)
    buf = io.BytesIO()
    web.save(buf, "JPEG", quality=82)
    buf.seek(0)
    storage.save(family_id, base_key + "_web.jpg", buf)

    # Thumbnail (max 320px)
    thumb = img.copy()
    thumb.thumbnail(THUMB_SIZE, Image.LANCZOS)
    buf = io.BytesIO()
    thumb.save(buf, "JPEG", quality=75)
    buf.seek(0)
    storage.save(family_id, base_key + "_thumb.jpg", buf)

    return w, h


async def _user_album(album_id: uuid.UUID, user, db) -> Album:
    """A regular photo album in the user's family. Chat attachment albums are
    hidden from Photos and only reachable through the chat endpoints."""
    album = await db.get(Album, album_id)
    if not album or album.family_id != user.family_id or album.kind != "user":
        raise HTTPException(status_code=404, detail="Album not found")
    return album


# ── Albums CRUD ───────────────────────────────────────────────────────────────

@router.get("")
async def list_albums(user: CurrentUser, db: DB) -> list[AlbumOut]:
    result = await db.execute(
        select(Album)
        .where(Album.family_id == user.family_id, Album.kind == "user")
        .order_by(Album.created_at.desc())
    )
    albums = result.scalars().all()
    out = []
    for a in albums:
        count_q = await db.execute(
            select(MediaItem.id).where(MediaItem.album_id == a.id)
        )
        out.append(AlbumOut(
            id=a.id,
            name=a.name,
            created_by=a.created_by,
            created_at=a.created_at.isoformat(),
            item_count=len(count_q.all()),
        ))
    return out


@router.post("", status_code=201)
async def create_album(body: AlbumCreate, user: CurrentUser, db: DB) -> AlbumOut:
    album = Album(family_id=user.family_id, name=body.name, created_by=user.id)
    db.add(album)
    await db.commit()
    await db.refresh(album)
    return AlbumOut(
        id=album.id,
        name=album.name,
        created_by=album.created_by,
        created_at=album.created_at.isoformat(),
        item_count=0,
    )


class MemoryYear(BaseModel):
    year: int
    years_ago: int
    items: list[MediaOut]


@router.get("/memories", response_model=list[MemoryYear])
async def memories(user: CurrentUser, db: DB, day: date | None = None) -> list[MemoryYear]:
    """Photos from this day in earlier years (or the days around it, if that day has none)."""
    today = day or datetime.now(timezone.utc).astimezone(memory_zone()).date()
    years = await on_this_day(db, user.family_id, today) or await on_this_day(db, user.family_id, today, window=3)
    return [MemoryYear(year=year, years_ago=today.year - year, items=[_media_out(m) for m in items]) for year, items in years]


@router.get("/{album_id}")
async def get_album(album_id: uuid.UUID, user: CurrentUser, db: DB) -> AlbumOut:
    album = await _user_album(album_id, user, db)
    count_q = await db.execute(select(MediaItem.id).where(MediaItem.album_id == album.id))
    return AlbumOut(
        id=album.id,
        name=album.name,
        created_by=album.created_by,
        created_at=album.created_at.isoformat(),
        item_count=len(count_q.all()),
    )


@router.patch("/{album_id}")
async def update_album(album_id: uuid.UUID, body: AlbumCreate, user: CurrentUser, db: DB) -> AlbumOut:
    album = await _user_album(album_id, user, db)
    if album.created_by != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Only creator or admin can rename")
    album.name = body.name
    await db.commit()
    await db.refresh(album)
    count_q = await db.execute(select(MediaItem.id).where(MediaItem.album_id == album.id))
    return AlbumOut(
        id=album.id,
        name=album.name,
        created_by=album.created_by,
        created_at=album.created_at.isoformat(),
        item_count=len(count_q.all()),
    )


@router.delete("/{album_id}", status_code=204)
async def delete_album(album_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    album = await _user_album(album_id, user, db)
    if album.created_by != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Only creator or admin can delete")

    # Delete files from storage
    storage = get_storage()
    items_q = await db.execute(select(MediaItem).where(MediaItem.album_id == album.id))
    for item in items_q.scalars().all():
        _delete_media_files(storage, item)

    await db.delete(album)
    await db.commit()


# ── Media upload ──────────────────────────────────────────────────────────────

@router.post("/{album_id}/media", status_code=201)
async def upload_media(album_id: uuid.UUID, file: UploadFile, user: CurrentUser, db: DB) -> MediaOut:
    album = await _user_album(album_id, user, db)
    return await store_upload(file, album, user, db, ALLOWED_TYPES)


async def store_upload(file: UploadFile, album: Album, user, db, allowed_types: set[str]) -> MediaOut:
    """Validate, store and thumbnail one uploaded file into the given album."""
    album_id = album.id
    content_type = file.content_type or mimetypes.guess_type(file.filename or "")[0] or "application/octet-stream"
    if content_type not in allowed_types:
        raise HTTPException(status_code=422, detail=f"File type not allowed: {content_type}")

    settings = get_settings()
    data = await file.read()
    if len(data) > settings.media_max_size_bytes:
        raise HTTPException(status_code=422, detail="File exceeds maximum allowed size")

    kind = "image" if content_type in ALLOWED_IMAGE_TYPES else "video"
    item_id = uuid.uuid4()
    ext = Path(file.filename or "file").suffix.lower() or (".jpg" if kind == "image" else ".mp4")
    base_key = f"albums/{album_id}/{item_id}"
    original_key = base_key + ext

    await quota.check(db, user.family_id, len(data))
    storage = get_storage()
    storage.save(user.family_id, original_key, io.BytesIO(data))

    width, height = None, None
    if kind == "image":
        try:
            width, height = _process_image(data, storage, user.family_id, base_key)
        except Exception:
            # If image processing fails, continue without thumbnails
            pass

    item = MediaItem(
        id=item_id,
        family_id=user.family_id,
        album_id=album_id,
        uploaded_by=user.id,
        kind=kind,
        original_name=file.filename or "unnamed",
        storage_key=original_key,
        content_type=content_type,
        size_bytes=len(data),
        width=width,
        height=height,
        taken_at=(exif_taken(data) if kind == "image" else None) or datetime.now(timezone.utc),
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)

    return MediaOut(
        id=item.id,
        album_id=item.album_id,
        uploaded_by=item.uploaded_by,
        kind=item.kind,
        original_name=item.original_name,
        content_type=item.content_type,
        size_bytes=item.size_bytes,
        width=item.width,
        height=item.height,
        created_at=item.created_at.isoformat(),
    )


@router.get("/{album_id}/media")
async def list_media(album_id: uuid.UUID, user: CurrentUser, db: DB) -> list[MediaOut]:
    album = await _user_album(album_id, user, db)
    result = await db.execute(
        select(MediaItem).where(MediaItem.album_id == album_id).order_by(MediaItem.created_at.desc())
    )
    return [
        MediaOut(
            id=m.id,
            album_id=m.album_id,
            uploaded_by=m.uploaded_by,
            kind=m.kind,
            original_name=m.original_name,
            content_type=m.content_type,
            size_bytes=m.size_bytes,
            width=m.width,
            height=m.height,
            created_at=m.created_at.isoformat(),
        )
        for m in result.scalars().all()
    ]


# ── Media serving (with Range/206 support) ───────────────────────────────────

async def _can_view(item: MediaItem, user, db) -> bool:
    """Photos are family-wide; chat attachments follow conversation membership; a receipt is seen by
    those who may see what it belongs to (a vehicle, the home)."""
    album = await db.get(Album, item.album_id)
    if album is None or album.kind == "user":
        return True
    if album.kind == "receipts":
        from app.services.file_vault import may_see_receipt

        return await may_see_receipt(db, user, item)
    if item.uploaded_by == user.id:
        return True
    shared_with_user = await db.execute(
        select(ChatMessage.id)
        .join(
            ConversationMember,
            (ConversationMember.conversation_id == ChatMessage.conversation_id)
            & (ConversationMember.user_id == user.id),
        )
        .where(ChatMessage.media_id == item.id)
        .limit(1)
    )
    return shared_with_user.first() is not None


@media_router.get("/{media_id}/{variant}")
async def serve_media(media_id: uuid.UUID, variant: str, request: Request, user: CurrentUser, db: DB):
    if variant not in ("thumb", "web", "original"):
        raise HTTPException(status_code=400, detail="Variant must be thumb, web, or original")

    item = await db.get(MediaItem, media_id)
    if not item or item.family_id != user.family_id or not await _can_view(item, user, db):
        raise HTTPException(status_code=404, detail="Media not found")

    storage = get_storage()
    base_key = item.storage_key.rsplit(".", 1)[0]  # Remove extension

    if variant == "thumb":
        key = base_key + "_thumb.jpg"
        ct = "image/jpeg"
    elif variant == "web":
        key = base_key + "_web.jpg"
        ct = "image/jpeg"
    else:
        key = item.storage_key
        ct = item.content_type

    # For thumb/web on video, fall back to original if variant doesn't exist
    if not storage.exists(item.family_id, key):
        if variant in ("thumb", "web") and item.kind == "video":
            key = item.storage_key
            ct = item.content_type
        else:
            raise HTTPException(status_code=404, detail="Variant not found")

    file_path = storage.open(item.family_id, key)
    file_size = file_path.stat().st_size

    # Handle Range requests for video seeking
    range_header = request.headers.get("range")
    if range_header:
        try:
            range_spec = range_header.replace("bytes=", "")
            parts = range_spec.split("-")
            start = int(parts[0])
            end = int(parts[1]) if parts[1] else min(start + 1024 * 1024 - 1, file_size - 1)
            end = min(end, file_size - 1)
        except (ValueError, IndexError):
            raise HTTPException(status_code=416, detail="Invalid range")

        if start >= file_size:
            raise HTTPException(status_code=416, detail="Range not satisfiable")

        length = end - start + 1

        def _range_iter():
            with open(file_path, "rb") as f:
                f.seek(start)
                remaining = length
                while remaining > 0:
                    chunk = f.read(min(65536, remaining))
                    if not chunk:
                        break
                    remaining -= len(chunk)
                    yield chunk

        return StreamingResponse(
            _range_iter(),
            status_code=206,
            media_type=ct,
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Content-Length": str(length),
                "Accept-Ranges": "bytes",
            },
        )

    # Full response
    def _iter():
        with open(file_path, "rb") as f:
            while chunk := f.read(65536):
                yield chunk

    return StreamingResponse(
        _iter(),
        media_type=ct,
        headers={
            "Content-Length": str(file_size),
            "Accept-Ranges": "bytes",
        },
    )


# ── Delete media ──────────────────────────────────────────────────────────────

def _delete_media_files(storage, item: MediaItem) -> None:
    """Remove all file variants for a media item."""
    storage.delete(item.family_id, item.storage_key)
    base_key = item.storage_key.rsplit(".", 1)[0]
    storage.delete(item.family_id, base_key + "_web.jpg")
    storage.delete(item.family_id, base_key + "_thumb.jpg")


@media_router.delete("/{media_id}", status_code=204)
async def delete_media(media_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    item = await db.get(MediaItem, media_id)
    if not item or item.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Media not found")
    if item.uploaded_by != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Only uploader or admin can delete")

    storage = get_storage()
    _delete_media_files(storage, item)

    await db.delete(item)
    await db.commit()

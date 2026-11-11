"""Links out of the vault (2.8.1): a photo, an album, a document's file, a receipt or – once – a login,
for someone without an account. An adult makes one for what they may see themselves; it runs out
after the hours chosen and can be closed at any time. Only the hash of its code is kept.

Without "may download" the guest only looks: pictures come as the app's web-sized copy, never the
original, and nothing is offered as a download. A one-time link works for a short while after it
is first opened (so a photo or a PDF can load), a login's exactly once.
"""
import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query, Request, Response, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.services.public_url import public_base
from app.deps import DB, AdultUser
from app.models import Album, Document, DocumentFile, Family, MediaItem, User, VaultFile, VaultLogin, VaultShare
from app.routers import documents as docs
from app.routers.albums import _can_view
from app.routers.vault import PREVIEWABLE, _may_edit as may_edit_login, may_see_file, read_file
from app.services.safe_files import headers_for
from app.services import login_throttle
from app.services import geo
from app.services import security_log
from app.services.storage import get_storage
from app.services.vault import family_fernet

router = APIRouter(prefix="/api", tags=["vault-shares"])

MAX_HOURS = 24 * 30
# A one-time link: how long it keeps working after it is first opened.
ONE_TIME_WINDOW = timedelta(minutes=15)
HEADERS = {"Cache-Control": "no-store, private", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "no-referrer"}


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _aware(value: datetime | None) -> datetime | None:
    return value if value is None or value.tzinfo else value.replace(tzinfo=timezone.utc)


class ShareIn(BaseModel):
    kind: str = Field(pattern=r"^(media|album|document|file|login)$")
    target_id: uuid.UUID
    hours: int = Field(ge=1, le=MAX_HOURS)
    label: str = Field(default="", max_length=80)
    one_time: bool = False
    allow_download: bool = False


class ShareOut(BaseModel):
    id: uuid.UUID
    kind: str
    target_id: uuid.UUID
    title: str
    label: str
    one_time: bool
    allow_download: bool
    expires_at: datetime
    views: int
    last_opened_at: datetime | None
    revoked_at: datetime | None
    active: bool
    created_at: datetime


class ShareCreated(ShareOut):
    url: str  # shown once


class ShareItem(BaseModel):
    id: uuid.UUID
    name: str
    kind: str  # image | video | file
    content_type: str
    # An office file can't be shown in the browser: only downloaded, if the link allows it.
    previewable: bool = True


class ShareLogin(BaseModel):
    title: str
    url: str
    username: str
    password: str
    notes: str


class ShareView(BaseModel):
    kind: str
    title: str
    family_name: str
    expires_at: datetime
    one_time: bool
    allow_download: bool
    items: list[ShareItem]
    login: ShareLogin | None = None


def _ends(share: VaultShare) -> datetime:
    """When the link stops working: its time, or shortly after a one-time link was opened."""
    end = _aware(share.expires_at)
    if share.one_time and share.first_opened_at is not None:
        end = min(end, _aware(share.first_opened_at) + ONE_TIME_WINDOW)
    return end


def _active(share: VaultShare, now: datetime | None = None) -> bool:
    return share.revoked_at is None and _ends(share) > (now or datetime.now(timezone.utc))


# --- What a link points at ----------------------------------------------------------------------


async def _target(db, family_id: uuid.UUID, kind: str, target_id: uuid.UUID):
    """(title, the row) – or None when it is gone or not the family's."""
    if kind == "media":
        row = await db.get(MediaItem, target_id)
        return (row.original_name, row) if row and row.family_id == family_id else None
    if kind == "album":
        row = await db.get(Album, target_id)
        return (row.name, row) if row and row.family_id == family_id and row.kind == "user" else None
    if kind == "document":
        row = await db.get(DocumentFile, target_id)
        doc = await db.get(Document, row.document_id) if row else None
        return (doc.title, (doc, row)) if doc and doc.family_id == family_id else None
    if kind == "file":
        row = await db.get(VaultFile, target_id)
        return (row.filename, row) if row and row.family_id == family_id else None
    row = await db.get(VaultLogin, target_id)
    return (row.title, row) if row and row.family_id == family_id else None


async def _may_share(db, user: User, kind: str, target) -> bool:
    """Only what you may see yourself – and a private document or a login only when it is yours to keep."""
    if kind == "media":
        return await _can_view(target, user, db)
    if kind == "album":
        return True
    if kind == "document":
        doc, _ = target
        return await docs.may_see(db, user, doc) and (not doc.private or doc.user_id == user.id)
    if kind == "file":
        return may_see_file(user, target)
    owner = await db.get(User, target.owner_id)
    return may_edit_login(user, target, owner)


async def _out(db, share: VaultShare) -> ShareOut:
    found = await _target(db, share.family_id, share.kind, share.target_id)
    return ShareOut(
        id=share.id, kind=share.kind, target_id=share.target_id, title=found[0] if found else "", label=share.label,
        one_time=share.one_time, allow_download=share.allow_download, expires_at=_ends(share), views=share.views,
        last_opened_at=share.last_opened_at, revoked_at=share.revoked_at, active=_active(share) and found is not None,
        created_at=share.created_at,
    )


# --- In the app (adults) ------------------------------------------------------------------------


@router.post("/vault/shares", response_model=ShareCreated, status_code=status.HTTP_201_CREATED)
async def create_share(payload: ShareIn, request: Request, user: AdultUser, db: DB) -> ShareCreated:
    if "photos" not in user.apps:
        raise HTTPException(status_code=403, detail="This app is not enabled for you")
    found = await _target(db, user.family_id, payload.kind, payload.target_id)
    if found is None or not await _may_share(db, user, payload.kind, found[1]):
        raise HTTPException(status_code=404, detail="Not found")
    token = secrets.token_urlsafe(24)
    now = datetime.now(timezone.utc)
    login = payload.kind == "login"
    share = VaultShare(
        family_id=user.family_id, created_by=user.id, kind=payload.kind, target_id=payload.target_id,
        label=payload.label.strip(), token_hash=_hash(token), expires_at=now + timedelta(hours=payload.hours),
        # A login is shown once and never downloaded.
        one_time=payload.one_time or login, allow_download=payload.allow_download and not login, created_at=now,
    )
    db.add(share)
    await db.commit()
    base = await public_base(db, request)
    return ShareCreated(**(await _out(db, share)).model_dump(), url=f"{base}/share/{token}")


@router.get("/vault/shares", response_model=list[ShareOut])
async def list_shares(user: AdultUser, db: DB) -> list[ShareOut]:
    """The links I have made, newest first."""
    rows = (
        await db.execute(select(VaultShare).where(VaultShare.created_by == user.id, VaultShare.family_id == user.family_id).order_by(VaultShare.created_at.desc()))
    ).scalars().all()
    return [await _out(db, s) for s in rows]


@router.delete("/vault/shares/{share_id}", response_model=ShareOut)
async def close_share(share_id: uuid.UUID, user: AdultUser, db: DB) -> ShareOut:
    share = await db.get(VaultShare, share_id)
    if share is None or share.created_by != user.id:
        raise HTTPException(status_code=404, detail="Link not found")
    share.revoked_at = share.revoked_at or datetime.now(timezone.utc)
    await db.commit()
    return await _out(db, share)


# --- Public, through the link -------------------------------------------------------------------


async def _open(db, token: str, request: Request) -> tuple[VaultShare, tuple]:
    ip = login_throttle.client_ip(request)
    if login_throttle.ip_retry_after(ip, await geo.outside(db, ip)):
        raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")
    share = (await db.execute(select(VaultShare).where(VaultShare.token_hash == _hash(token)))).scalar_one_or_none()
    found = await _target(db, share.family_id, share.kind, share.target_id) if share else None
    family = await db.get(Family, share.family_id) if share else None
    if share is None or found is None or not _active(share) or family is None or family.status != "active":
        login_throttle.record_ip_failure(ip)
        await security_log.record(db, "link_invalid", ip=ip, detail="share")
        raise HTTPException(status_code=404, detail="This link isn't valid any more")
    return share, found


@router.get("/share/{token}", response_model=ShareView)
async def open_share(token: str, request: Request, response: Response, db: DB) -> ShareView:
    share, (title, target) = await _open(db, token, request)
    now = datetime.now(timezone.utc)
    share.views += 1
    share.last_opened_at = now
    share.first_opened_at = share.first_opened_at or now
    items: list[ShareItem] = []
    login = None
    if share.kind == "media":
        items = [ShareItem(id=target.id, name=target.original_name, kind=target.kind, content_type=target.content_type)]
    elif share.kind == "album":
        media = (await db.execute(select(MediaItem).where(MediaItem.album_id == target.id).order_by(MediaItem.created_at.desc()))).scalars().all()
        items = [ShareItem(id=m.id, name=m.original_name, kind=m.kind, content_type=m.content_type) for m in media]
    elif share.kind == "document":
        _, f = target
        items = [ShareItem(
            id=f.id, name=f.filename, kind="image" if f.content_type.startswith("image/") else "file", content_type=f.content_type,
            previewable=f.content_type in docs.PREVIEWABLE,
        )]
    elif share.kind == "file":
        image = target.content_type in {"image/jpeg", "image/png", "image/webp", "image/gif"}
        items = [ShareItem(id=target.id, name=target.filename, kind="image" if image else "file", content_type=target.content_type, previewable=target.content_type in PREVIEWABLE)]
    else:
        fernet = await family_fernet(db, await db.get(Family, share.family_id))

        def plain(value: str | None) -> str:
            return fernet.decrypt(value.encode()).decode() if value else ""

        login = ShareLogin(title=target.title, url=target.url, username=plain(target.username_encrypted), password=plain(target.password_encrypted), notes=plain(target.notes_encrypted))
        # Shown once: the link is spent.
        share.revoked_at = now
    family = await db.get(Family, share.family_id)
    await db.commit()
    response.headers.update(HEADERS)
    return ShareView(
        kind=share.kind, title=title, family_name=family.name, expires_at=_ends(share) if share.kind != "login" else now,
        one_time=share.one_time, allow_download=share.allow_download, items=items, login=login,
    )


@router.get("/share/{token}/files/{item_id}")
async def share_file(token: str, item_id: uuid.UUID, request: Request, db: DB, variant: str = Query(default="view", pattern=r"^(thumb|view|original)$")):
    share, (_, target) = await _open(db, token, request)
    if share.kind == "login" or (share.first_opened_at is None):
        raise HTTPException(status_code=404, detail="Not found")
    if variant == "original" and not share.allow_download:
        raise HTTPException(status_code=403, detail="Downloading isn't allowed for this link")
    disposition = "attachment" if variant == "original" else "inline"
    storage = get_storage()

    if share.kind == "document":
        doc, f = target
        if f.id != item_id:
            raise HTTPException(status_code=404, detail="Not found")
        if variant != "original" and f.content_type not in docs.PREVIEWABLE:
            raise HTTPException(status_code=403, detail="This file can only be downloaded")
        fernet = await family_fernet(db, await db.get(Family, share.family_id))
        data = fernet.decrypt(storage.open(doc.family_id, f.storage_key).read_bytes())
        safe = f.filename.replace('"', "")
        return Response(content=data, media_type=f.content_type, headers={**HEADERS, "Content-Disposition": f'{disposition}; filename="{safe}"'})

    if share.kind == "file":
        if target.id != item_id:
            raise HTTPException(status_code=404, detail="Not found")
        if variant != "original" and target.content_type not in PREVIEWABLE:
            raise HTTPException(status_code=403, detail="This file can only be downloaded")
        # Office files are read by the page itself; only pictures and PDFs are ever shown inline.
        media_type, safe_headers = headers_for(target.content_type, target.filename, variant == "original")
        return Response(content=await read_file(db, target), media_type=media_type, headers={**HEADERS, **safe_headers})

    item = await db.get(MediaItem, item_id)
    if item is None or (share.kind == "media" and item.id != target.id) or (share.kind == "album" and item.album_id != target.id):
        raise HTTPException(status_code=404, detail="Not found")
    base = item.storage_key.rsplit(".", 1)[0]
    key, media_type = item.storage_key, item.content_type
    # Looking only: a picture is the app's web-sized copy, never the original file.
    if item.kind == "image" and variant in ("thumb", "view"):
        key, media_type = base + ("_thumb.jpg" if variant == "thumb" else "_web.jpg"), "image/jpeg"
        if not storage.exists(item.family_id, key):
            raise HTTPException(status_code=404, detail="Not found")
    safe = item.original_name.replace('"', "")
    return FileResponse(
        storage.open(item.family_id, key), media_type=media_type,
        headers={**HEADERS, "Content-Disposition": f'{disposition}; filename="{safe}"'},
    )

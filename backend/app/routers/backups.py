"""Backups and data export from the app.

Backups (the whole database + all media, like backup.sh) are for the server admin: make one now,
see and download them, choose the schedule. Every family admin can export their own family's
data as a readable zip.
"""
import os
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from app.deps import DB, AdminUser, CurrentUser, ServerAdmin, require_server_admin
from app.models import Family
from app.services import backup_crypto, backups
from app.services import families as fam
from app.services.family_export import build_export

router = APIRouter(prefix="/api/admin", tags=["backups"])


class BackupOut(BaseModel):
    stamp: str
    created_at: datetime
    database: str | None
    database_size: int
    media: str | None
    media_size: int
    encrypted: bool = False
    secrets: str | None = None


class KeyIn(BaseModel):
    # The public half of a key made in the browser (base64); empty turns sealing off.
    public_key: str = Field(default="", max_length=100)


class ScheduleIn(BaseModel):
    enabled: bool
    hour: int = Field(ge=0, le=23)
    keep_days: int = Field(ge=1, le=365)
    # A backup per family too (2.8.2), the newest family_keep of each kept.
    families: bool = False
    family_keep: int = Field(default=7, ge=1, le=60)


class BackupsOut(BaseModel):
    available: bool
    # The backup key's id (hex) when backups are sealed (2.9.0).
    key_id: str | None = None
    running: bool
    error: str | None
    schedule: ScheduleIn
    backups: list[BackupOut]


class BackupStatusOut(BaseModel):
    # For the warning on Today: shown to the server admin only.
    show: bool
    latest_at: datetime | None
    stale: bool


async def _overview(db) -> BackupsOut:
    state = backups.status()
    key = await backups.get_key(db)
    return BackupsOut(
        available=backups.available(),
        key_id=backup_crypto.key_id(key).hex() if key else None,
        running=state["running"],
        error=state["error"],
        schedule=ScheduleIn(**await backups.get_schedule(db)),
        backups=[BackupOut(**vars(b)) for b in backups.list_backups()],
    )


@router.get("/backups", response_model=BackupsOut)
async def list_backups(admin: ServerAdmin, db: DB) -> BackupsOut:
    return await _overview(db)


@router.post("/backups", response_model=BackupsOut, status_code=status.HTTP_202_ACCEPTED)
async def backup_now(admin: ServerAdmin, db: DB) -> BackupsOut:
    try:
        backups.start_backup(await backups.get_key(db))
    except backups.BackupError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    await fam.log(db, admin, "backup_made", None)
    return await _overview(db)


@router.put("/backups/schedule", response_model=BackupsOut)
async def set_schedule(payload: ScheduleIn, admin: ServerAdmin, db: DB) -> BackupsOut:
    await backups.set_schedule(db, payload.model_dump())
    return await _overview(db)


@router.put("/backups/key", response_model=BackupsOut)
async def set_backup_key(payload: KeyIn, admin: ServerAdmin, db: DB) -> BackupsOut:
    """The public key backups are sealed with from now on (the private key never comes here).
    Older backups still need the key they were made with."""
    try:
        await backups.set_key(db, payload.public_key or None)
    except backup_crypto.BackupKeyError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    await fam.log(db, admin, "backup_key", None, "on" if payload.public_key else "off")
    return await _overview(db)


@router.get("/backups/files/{name}")
async def download_backup(name: str, admin: ServerAdmin) -> FileResponse:
    try:
        path = backups.backup_file(name)
    except backups.BackupError:
        raise HTTPException(status_code=404, detail="Backup not found")
    return FileResponse(path, filename=name, media_type="application/octet-stream" if name.endswith(backup_crypto.SUFFIX) else "application/gzip")


@router.delete("/backups/{stamp}", response_model=BackupsOut)
async def delete_backup(stamp: str, admin: ServerAdmin, db: DB) -> BackupsOut:
    if len(backups.list_backups()) <= 1:
        raise HTTPException(status_code=409, detail="The last backup can't be removed")
    backups.delete_backup(stamp)
    await fam.log(db, admin, "backup_deleted", None, stamp)
    return await _overview(db)


@router.get("/backups/status", response_model=BackupStatusOut)
async def backup_status(user: CurrentUser, db: DB) -> BackupStatusOut:
    """Whether to warn about old backups on Today (only the server admin is warned)."""
    try:
        await require_server_admin(user, db)
    except HTTPException:
        return BackupStatusOut(show=False, latest_at=None, stale=False)
    if not backups.available():
        return BackupStatusOut(show=False, latest_at=None, stale=False)
    newest = next(iter(backups.list_backups()), None)
    latest = newest.created_at if newest else None
    stale = latest is None or datetime.now(timezone.utc) - latest > backups.STALE_AFTER
    return BackupStatusOut(show=stale, latest_at=latest, stale=stale)


@router.get("/export/family")
async def export_family(admin: AdminUser, db: DB, background: BackgroundTasks) -> FileResponse:
    """All of this family's data (no secrets) and media files as a zip."""
    family = await db.get(Family, admin.family_id)
    path = await build_export(db, admin.family_id, family.name, admin.id)
    background.add_task(os.remove, path)
    name = f"smooth-family-{datetime.now(timezone.utc).strftime('%Y%m%d')}.zip"
    return FileResponse(path, filename=name, media_type="application/zip", background=background)

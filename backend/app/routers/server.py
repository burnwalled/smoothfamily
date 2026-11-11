"""The server admin's page: the families on the server, invitations, moving a family (encrypted
export / import) and the server log. Only names, counts and sizes – never a family's content.
"""
import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Body, HTTPException, Query, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.deps import DB, AdminUser, ServerAdmin
from app.models import ChatMessage, Family, Invitation, ListItem, ServerLog, TaskCompletion, User
from app.services import families as fam
from app.services import family_backups, quota, security_log
from app.services.public_url import public_base

router = APIRouter(prefix="/api/server", tags=["server"])

LIFETIMES = (1, 7, 14, 30, 90)


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


class FamilyRow(BaseModel):
    id: uuid.UUID
    name: str
    kind: str
    status: str
    members: int
    storage_bytes: int
    storage_quota_mb: int | None = None
    created_at: datetime
    last_activity: datetime | None
    yours: bool


class InvitationIn(BaseModel):
    label: str = Field(min_length=1, max_length=120)
    days: int = Field(default=7)


class ExtendIn(BaseModel):
    days: int


class InvitationRow(BaseModel):
    id: uuid.UUID
    label: str
    created_at: datetime
    expires_at: datetime
    state: str  # open | used | expired | revoked
    family_name: str | None
    demo_active: bool


class InvitationCreated(InvitationRow):
    # Shown once: only a hash is stored.
    url: str


class StatusIn(BaseModel):
    status: str = Field(pattern=r"^(active|suspended)$")


class LogRow(BaseModel):
    id: uuid.UUID
    actor_name: str
    action: str
    family_id: uuid.UUID | None
    family_name: str | None
    detail: str
    created_at: datetime



def _state(inv: Invitation, now: datetime) -> str:
    if inv.revoked_at:
        return "revoked"
    if inv.used_at:
        return "used"
    expires = inv.expires_at if inv.expires_at.tzinfo else inv.expires_at.replace(tzinfo=timezone.utc)
    return "expired" if expires <= now else "open"


def _check_days(days: int) -> int:
    if days not in LIFETIMES:
        raise HTTPException(status_code=422, detail=f"Choose one of {', '.join(map(str, LIFETIMES))} days")
    return days


async def _family(db, family_id: uuid.UUID, admin: User, allow_own: bool = False) -> Family:
    family = await db.get(Family, family_id)
    if family is None:
        raise HTTPException(status_code=404, detail="Family not found")
    if family.id == admin.family_id and not allow_own:
        raise HTTPException(status_code=409, detail="That's your own family")
    return family


# --- Families ------------------------------------------------------------------------------


class RestoreKeyIn(BaseModel):
    # The family's private backup key, for a sealed backup – used once, never kept.
    key: str | None = Field(default=None, max_length=120)


class QuotaIn(BaseModel):
    quota_mb: int | None = Field(default=None, ge=1, le=10_000_000)


class FamilyBackupOut(BaseModel):
    stamp: str
    created_at: datetime
    size: int
    sealed: bool = False


@router.put("/families/{family_id}/quota", status_code=status.HTTP_204_NO_CONTENT)
async def set_quota(family_id: uuid.UUID, payload: QuotaIn, admin: ServerAdmin, db: DB) -> None:
    """How much the family may keep (None = no ceiling) – also for the admin's own family."""
    family = await _family(db, family_id, admin, allow_own=True)
    family.storage_quota_mb = payload.quota_mb
    await db.commit()
    await fam.log(db, admin, "family_quota", family.id, f"{payload.quota_mb} MB" if payload.quota_mb else "-")


@router.get("/families/{family_id}/backups", response_model=list[FamilyBackupOut])
async def family_backup_list(family_id: uuid.UUID, admin: ServerAdmin, db: DB) -> list[FamilyBackupOut]:
    await _family(db, family_id, admin, allow_own=True)
    return [FamilyBackupOut(**b.__dict__) for b in family_backups.list_backups(family_id)]


@router.post("/families/{family_id}/backups", response_model=FamilyBackupOut, status_code=status.HTTP_201_CREATED)
async def family_backup_now(family_id: uuid.UUID, admin: ServerAdmin, db: DB) -> FamilyBackupOut:
    await _family(db, family_id, admin, allow_own=True)
    made = await family_backups.create(db, family_id)
    await fam.log(db, admin, "family_backup", family_id)
    return FamilyBackupOut(**made.__dict__)


@router.post("/families/{family_id}/backups/{stamp}/restore", status_code=status.HTTP_204_NO_CONTENT)
async def family_backup_restore(family_id: uuid.UUID, stamp: str, admin: ServerAdmin, db: DB, confirm: str = Query(...), payload: RestoreKeyIn | None = None) -> None:
    """Put one family back as it was – never your own (it would sign you out in the middle). A
    backup sealed with the family's own key needs that key, from the family."""
    family = await _family(db, family_id, admin)
    if confirm.strip() != family.name:
        raise HTTPException(status_code=422, detail="Type the family's name to restore it")
    try:
        await family_backups.restore(db, family_id, stamp, payload.key if payload else None)
    except fam.FamilyArchiveError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    await fam.log(db, admin, "family_restore", family_id, stamp)


@router.get("/families", response_model=list[FamilyRow])
async def list_families(admin: ServerAdmin, db: DB) -> list[FamilyRow]:
    families = (await db.execute(select(Family).order_by(Family.created_at))).scalars().all()
    counts = dict((await db.execute(select(User.family_id, func.count(User.id)).group_by(User.family_id))).all())
    activity: dict = {}
    for model, column in ((TaskCompletion, TaskCompletion.created_at), (ChatMessage, ChatMessage.created_at), (ListItem, ListItem.created_at)):
        for family_id, latest in (await db.execute(select(model.family_id, func.max(column)).group_by(model.family_id))).all():
            if latest and (family_id not in activity or latest > activity[family_id]):
                activity[family_id] = latest
    return [
        FamilyRow(
            id=f.id,
            name=f.name,
            kind=f.kind,
            status=f.status,
            members=counts.get(f.id, 0),
            storage_bytes=quota.used_bytes(f.id, fresh=True),
            storage_quota_mb=f.storage_quota_mb,
            created_at=f.created_at,
            last_activity=activity.get(f.id),
            yours=f.id == admin.family_id,
        )
        for f in families
    ]


@router.put("/families/{family_id}/status", response_model=FamilyRow)
async def set_status(family_id: uuid.UUID, payload: StatusIn, admin: ServerAdmin, db: DB) -> FamilyRow:
    family = await _family(db, family_id, admin)
    family.status = payload.status
    await db.commit()
    await fam.log(db, admin, "family_" + ("paused" if payload.status == "suspended" else "resumed"), family.id, family.name)
    return next(r for r in await list_families(admin, db) if r.id == family.id)


@router.delete("/families/{family_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_family(family_id: uuid.UUID, admin: ServerAdmin, db: DB, confirm: str = Query(...)) -> None:
    """Removes a family and everything in it. `confirm` must be the family's name."""
    family = await _family(db, family_id, admin)
    if confirm.strip() != family.name:
        raise HTTPException(status_code=422, detail="Type the family's name to confirm")
    name = family.name
    for inv in (await db.execute(select(Invitation).where((Invitation.family_id == family.id) | (Invitation.demo_family_id == family.id)))).scalars().all():
        inv.family_id = inv.family_id if inv.family_id != family.id else None
        inv.demo_family_id = None if inv.demo_family_id == family.id else inv.demo_family_id
    await db.commit()
    await fam.delete_family(db, family.id)
    await fam.log(db, admin, "family_deleted", family_id, name)


@router.post("/families/{family_id}/export")
async def export_family(family_id: uuid.UUID, admin: ServerAdmin, db: DB, passphrase: str = Body(..., embed=True, min_length=10)) -> Response:
    """The whole family, encrypted with a passphrase the family chooses – to move it to another
    server or keep it. Without the passphrase the file can't be read, not even by the server admin."""
    family = await _family(db, family_id, admin, allow_own=True)
    blob = await fam.export_family(db, family.id, passphrase)
    await fam.log(db, admin, "family_exported", family.id, family.name)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    return Response(blob, media_type="application/octet-stream", headers={"Content-Disposition": f'attachment; filename="family-{stamp}.sfmove"'})


@router.post("/families/import", response_model=FamilyRow, status_code=status.HTTP_201_CREATED)
async def import_family(admin: ServerAdmin, db: DB, passphrase: str = Query(..., min_length=10), data: bytes = Body(..., media_type="application/octet-stream")) -> FamilyRow:
    try:
        family_id = await fam.import_family(db, data, passphrase)
    except fam.FamilyArchiveError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    family = await db.get(Family, family_id)
    await fam.log(db, admin, "family_imported", family.id, family.name)
    return next(r for r in await list_families(admin, db) if r.id == family.id)


# --- Invitations ---------------------------------------------------------------------------


async def _invitation_rows(db, now: datetime) -> list[InvitationRow]:
    rows = (await db.execute(select(Invitation).order_by(Invitation.created_at.desc()))).scalars().all()
    names = dict((await db.execute(select(Family.id, Family.name))).all())
    return [
        InvitationRow(
            id=i.id,
            label=i.label,
            created_at=i.created_at,
            expires_at=i.expires_at,
            state=_state(i, now),
            family_name=names.get(i.family_id),
            demo_active=i.demo_family_id is not None and i.demo_family_id in names,
        )
        for i in rows
    ]


@router.get("/invitations", response_model=list[InvitationRow])
async def list_invitations(admin: ServerAdmin, db: DB) -> list[InvitationRow]:
    return await _invitation_rows(db, datetime.now(timezone.utc))


@router.post("/invitations", response_model=InvitationCreated, status_code=status.HTTP_201_CREATED)
async def create_invitation(payload: InvitationIn, admin: ServerAdmin, db: DB) -> InvitationCreated:
    days = _check_days(payload.days)
    token = secrets.token_urlsafe(24)
    now = datetime.now(timezone.utc)
    inv = Invitation(token_hash=token_hash(token), label=payload.label.strip(), created_by=admin.id, created_at=now, expires_at=now + timedelta(days=days))
    db.add(inv)
    await db.commit()
    await fam.log(db, admin, "invitation_created", None, f"{inv.label} ({days} d)")
    row = next(r for r in await _invitation_rows(db, now) if r.id == inv.id)
    return InvitationCreated(**row.model_dump(), url=f"{await public_base(db)}/invite/{token}")


@router.put("/invitations/{invitation_id}/extend", response_model=InvitationRow)
async def extend_invitation(invitation_id: uuid.UUID, payload: ExtendIn, admin: ServerAdmin, db: DB) -> InvitationRow:
    days = _check_days(payload.days)
    inv = await db.get(Invitation, invitation_id)
    now = datetime.now(timezone.utc)
    if inv is None or _state(inv, now) not in ("open", "expired"):
        raise HTTPException(status_code=409, detail="Only an open or expired invitation can be extended")
    inv.expires_at = now + timedelta(days=days)
    await db.commit()
    await fam.log(db, admin, "invitation_extended", None, f"{inv.label} ({days} d)")
    return next(r for r in await _invitation_rows(db, now) if r.id == inv.id)


@router.delete("/invitations/{invitation_id}", response_model=InvitationRow)
async def revoke_invitation(invitation_id: uuid.UUID, admin: ServerAdmin, db: DB) -> InvitationRow:
    inv = await db.get(Invitation, invitation_id)
    if inv is None:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if not inv.used_at:
        inv.revoked_at = datetime.now(timezone.utc)
    demo = inv.demo_family_id
    inv.demo_family_id = None
    await db.commit()
    if demo:
        await fam.delete_family(db, demo)
    await fam.log(db, admin, "invitation_revoked", None, inv.label)
    return next(r for r in await _invitation_rows(db, datetime.now(timezone.utc)) if r.id == inv.id)


# --- Server log ----------------------------------------------------------------------------


@router.get("/log", response_model=list[LogRow])
async def server_log(admin: ServerAdmin, db: DB) -> list[LogRow]:
    return await _log_rows(db, None)


@router.get("/security")
async def security_overview(admin: ServerAdmin, db: DB) -> dict:
    """The security log: the last day and week in numbers, and the events of the last 30 days."""
    return await security_log.overview(db)


async def _log_rows(db, family_id: uuid.UUID | None) -> list[LogRow]:
    query = select(ServerLog).order_by(ServerLog.created_at.desc()).limit(200)
    if family_id is not None:
        query = query.where(ServerLog.family_id == family_id)
    rows = (await db.execute(query)).scalars().all()
    names = dict((await db.execute(select(Family.id, Family.name))).all())
    return [
        LogRow(id=r.id, actor_name=r.actor_name, action=r.action, family_id=r.family_id, family_name=names.get(r.family_id), detail=r.detail, created_at=r.created_at)
        for r in rows
    ]


@router.get("/log/mine", response_model=list[LogRow])
async def my_family_log(admin: AdminUser, db: DB) -> list[LogRow]:
    """A family's admin: what the server admin has done with this family."""
    return await _log_rows(db, admin.family_id)

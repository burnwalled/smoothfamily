"""Family member management (admin only for writes)."""
import uuid
from datetime import date

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select, update

from app.services import quota, security_policy
from app.deps import DB, AdminUser, CurrentUser
from app.models import Base, ChatMessage, Family, FamilyEvent, Party, Person, Task, User, WebAuthnCredential
from app.schemas import AppAccessIn, MemberCreate, MemberOut, MemberPasswordReset, MemberPatch
from app.security import hash_password

router = APIRouter(prefix="/api/family", tags=["family"])


@router.get("/members", response_model=list[MemberOut])
async def list_members(user: CurrentUser, db: DB) -> list[User]:
    result = await db.execute(
        select(User).where(User.family_id == user.family_id).order_by(User.created_at)
    )
    return list(result.scalars().all())


@router.post("/members", response_model=MemberOut, status_code=status.HTTP_201_CREATED)
async def create_member(payload: MemberCreate, admin: AdminUser, db: DB) -> User:
    existing = (
        await db.execute(select(User).where(User.username == payload.username.lower()))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Username is already taken")
    await security_policy.check_password(db, payload.password, payload.role)
    member = User(
        family_id=admin.family_id,
        username=payload.username.lower(),
        display_name=payload.display_name,
        password_hash=hash_password(payload.password),
        role=payload.role,
        color=payload.color,
        language=payload.language or admin.language or "en",
    )
    if payload.role == "child" and payload.birth_date is not None:
        born = payload.birth_date
        if born > date.today():
            raise HTTPException(status_code=422, detail="The birthday can't be in the future")
        # Children who can't read yet start in the little ones' mode; it's changed under Tasks.
        member.easy_mode = age_on(born, date.today()) <= EASY_MODE_UP_TO
    db.add(member)
    await db.flush()
    if payload.role == "child" and payload.birth_date is not None:
        db.add(Person(family_id=admin.family_id, user_id=member.id, name=member.display_name, birth_year=born.year, birth_month=born.month, birth_day=born.day, created_by=admin.id))
    await db.commit()
    await db.refresh(member)
    return member


# Up to this age a new child starts in the little ones' mode.
EASY_MODE_UP_TO = 6


def age_on(born: date, day: date) -> int:
    return day.year - born.year - ((day.month, day.day) < (born.month, born.day))


# What was only theirs, by the columns that say whose it is: it goes with them. The rest of what links to
# a member (without a rule of its own in the database) is the family's and stays: without them where it
# can be, otherwise as made by whoever removes them. Private things (logins, documents, medicine) are
# removed by the database itself, and never handed over.
GOES_WITH_MEMBER = {
    ("conversation_members", "user_id"), ("dashboard_widgets", "user_id"), ("push_subscriptions", "user_id"),
    ("user_achievements", "user_id"), ("task_completions", "user_id"), ("allowance_payouts", "user_id"),
}


async def _let_go(db, member: User, remover: User) -> None:
    await db.execute(update(ChatMessage).where(ChatMessage.sender_id == member.id).values(sender_name=member.display_name))
    for table in Base.metadata.sorted_tables:
        for column in table.columns:
            if not any(fk.target_fullname == "users.id" and fk.ondelete is None for fk in column.foreign_keys):
                continue
            where = column == member.id
            if (table.name, column.name) in GOES_WITH_MEMBER:
                await db.execute(table.delete().where(where))
            elif column.nullable:
                await db.execute(table.update().where(where).values({column.name: None}))
            else:
                await db.execute(table.update().where(where).values({column.name: remover.id}))
    # Where they're only named in a list of ids.
    gone = str(member.id)
    for task in (await db.execute(select(Task).where(Task.family_id == member.family_id, Task.rotation_user_ids.is_not(None)))).scalars().all():
        if gone in [str(x) for x in task.rotation_user_ids or []]:
            task.rotation_user_ids = [x for x in task.rotation_user_ids if str(x) != gone]
    for event in (await db.execute(select(FamilyEvent).where(FamilyEvent.family_id == member.family_id))).scalars().all():
        if gone in [str(x) for x in event.member_ids or []]:
            event.member_ids = [x for x in event.member_ids if str(x) != gone]
        if gone in (event.private_to or []):
            event.private_to = [x for x in event.private_to if x != gone] or [str(remover.id)]
    for party in (await db.execute(select(Party).where(Party.family_id == member.family_id))).scalars().all():
        if gone in (party.planners or []):
            party.planners = [x for x in party.planners if x != gone] or None
        if gone in (party.plan_hidden or []):
            party.plan_hidden = [x for x in party.plan_hidden if x != gone] or None


@router.delete("/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_member(member_id: uuid.UUID, admin: AdminUser, db: DB) -> None:
    member = await db.get(User, member_id)
    if member is None or member.family_id != admin.family_id:
        raise HTTPException(status_code=404, detail="Member not found")
    if member.id == admin.id:
        raise HTTPException(status_code=400, detail="You cannot remove yourself")
    if member.is_server_admin:
        raise HTTPException(status_code=400, detail="The server's admin can't be removed")
    await _let_go(db, member, admin)
    await db.delete(member)
    await db.commit()


@router.patch("/members/{member_id}", response_model=MemberOut)
async def patch_member(member_id: uuid.UUID, payload: MemberPatch, admin: AdminUser, db: DB) -> User:
    member = await db.get(User, member_id)
    if member is None or member.family_id != admin.family_id:
        raise HTTPException(status_code=404, detail="Member not found")
    if member.id == admin.id and payload.role is not None and payload.role != "admin":
        raise HTTPException(status_code=400, detail="You cannot remove your own admin role")

    data = payload.model_dump(exclude_unset=True)
    if data.get("can_manage_family") and (data.get("role") or member.role) != "adult":
        raise HTTPException(status_code=422, detail="Only adults can be let change the family's settings")
    if data.get("language") is None:
        data.pop("language", None)
    for field, value in data.items():
        if value is not None or field != "can_manage_family":
            setattr(member, field, value)
    if member.role != "adult":
        member.can_manage_family = False

    await db.commit()
    await db.refresh(member)
    return member


class AvatarPick(BaseModel):
    name: str


async def _child_or_self(db, admin, member_id: uuid.UUID) -> User:
    """A parent sets a child's picture (3.0.4); an adult chooses their own."""
    member = await db.get(User, member_id)
    if member is None or member.family_id != admin.family_id:
        raise HTTPException(status_code=404, detail="Member not found")
    if member.role != "child" and member.id != admin.id:
        raise HTTPException(status_code=403, detail="Adults choose their own picture")
    return member


@router.get("/members/{member_id}/avatar")
async def member_avatar(member_id: uuid.UUID, user: CurrentUser, db: DB):
    from app.routers.auth import avatar_response

    member = await db.get(User, member_id)
    if member is None or member.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Member not found")
    return avatar_response(member)


@router.post("/members/{member_id}/avatar/preset", response_model=MemberOut)
async def set_member_avatar_preset(member_id: uuid.UUID, body: AvatarPick, admin: AdminUser, db: DB) -> User:
    from app.routers.auth import VALID_AVATAR_PRESETS

    member = await _child_or_self(db, admin, member_id)
    if body.name not in VALID_AVATAR_PRESETS:
        raise HTTPException(status_code=422, detail=f"Unknown preset '{body.name}'")
    member.avatar_key = f"preset:{body.name}"
    await db.commit()
    await db.refresh(member)
    return member


@router.post("/members/{member_id}/avatar", response_model=MemberOut)
async def upload_member_avatar(member_id: uuid.UUID, admin: AdminUser, db: DB, file: UploadFile = File(...)) -> User:
    from app.routers.auth import save_avatar

    member = await _child_or_self(db, admin, member_id)
    await save_avatar(member, file)
    await db.commit()
    await db.refresh(member)
    return member


@router.delete("/members/{member_id}/avatar", response_model=MemberOut)
async def clear_member_avatar(member_id: uuid.UUID, admin: AdminUser, db: DB) -> User:
    member = await _child_or_self(db, admin, member_id)
    member.avatar_key = None
    await db.commit()
    await db.refresh(member)
    return member


@router.post("/members/{member_id}/password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_member_password(
    member_id: uuid.UUID, payload: MemberPasswordReset, admin: AdminUser, db: DB
) -> None:
    """Admin sets a new password for a family member (e.g. a forgotten one)."""
    member = await db.get(User, member_id)
    if member is None or member.family_id != admin.family_id:
        raise HTTPException(status_code=404, detail="Member not found")
    await security_policy.check_password(db, payload.password, member.role)
    member.password_hash = hash_password(payload.password)
    await db.commit()


@router.post("/members/{member_id}/reset-mfa", status_code=status.HTTP_204_NO_CONTENT)
async def reset_member_mfa(member_id: uuid.UUID, admin: AdminUser, db: DB) -> None:
    """Remove a member's authenticator and passkeys (e.g. a lost phone)."""
    member = await db.get(User, member_id)
    if member is None or member.family_id != admin.family_id:
        raise HTTPException(status_code=404, detail="Member not found")
    member.totp_secret_encrypted = None
    member.totp_pending_encrypted = None
    member.totp_last_step = None
    await db.execute(delete(WebAuthnCredential).where(WebAuthnCredential.user_id == member.id))
    await db.commit()


@router.put("/members/{member_id}/apps", response_model=MemberOut)
async def set_member_apps(member_id: uuid.UUID, payload: AppAccessIn, admin: AdminUser, db: DB) -> User:
    """Which apps a member may use; null = the role's default. Admins always have every app."""
    member = await db.get(User, member_id)
    if member is None or member.family_id != admin.family_id:
        raise HTTPException(status_code=404, detail="Member not found")
    member.app_access = None if payload.apps is None else sorted(set(payload.apps))
    await db.commit()
    await db.refresh(member)
    return member


@router.get("/storage")
async def family_storage(admin: AdminUser, db: DB) -> dict:
    """How much the family keeps on the server, and its ceiling (set by the server's admin)."""
    family = await db.get(Family, admin.family_id)
    return {"used_bytes": quota.used_bytes(admin.family_id, fresh=True), "quota_mb": family.storage_quota_mb}




# --- The family's own backup key (2.9.0) ------------------------------------------------------


class FamilyKeyIn(BaseModel):
    # The public half of a key made in the browser; empty: backups sealed only with the server's.
    public_key: str = Field(default="", max_length=60)


def _backup_key_out(family: Family) -> dict:
    from app.services import backup_crypto, family_backups

    newest = next((b for b in family_backups.list_backups(family.id) if b.sealed), None)
    key = backup_crypto.public_key_from_text(family.backup_public_key) if family.backup_public_key else None
    return {"key_id": backup_crypto.key_id(key).hex() if key else None, "latest_sealed": newest.stamp if newest else None}


@router.get("/backup-key")
async def get_family_backup_key(admin: AdminUser, db: DB) -> dict:
    return _backup_key_out(await db.get(Family, admin.family_id))


@router.put("/backup-key")
async def set_family_backup_key(payload: FamilyKeyIn, admin: AdminUser, db: DB) -> dict:
    """The family's own key: from now on its backups are sealed with it – not even the server's
    admin can open them. The private key never comes here."""
    from app.services import backup_crypto

    family = await db.get(Family, admin.family_id)
    if payload.public_key:
        try:
            backup_crypto.public_key_from_text(payload.public_key)
        except backup_crypto.BackupKeyError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
    family.backup_public_key = payload.public_key.strip() or None
    await db.commit()
    return _backup_key_out(family)


@router.get("/backup-key/latest")
async def latest_sealed_backup(admin: AdminUser, db: DB):
    """The newest sealed backup, for checking in the browser that the key opens it."""
    from fastapi.responses import FileResponse

    from app.services import family_backups

    newest = next((b for b in family_backups.list_backups(admin.family_id) if b.sealed), None)
    path = family_backups.sealed_file(admin.family_id, newest.stamp) if newest else None
    if path is None:
        raise HTTPException(status_code=404, detail="No sealed backup yet")
    return FileResponse(path, media_type="application/octet-stream")

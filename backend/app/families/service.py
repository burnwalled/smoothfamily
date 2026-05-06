import hashlib
import logging
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

import resend
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.core.settings import get_settings
from app.families.models import Family, FamilyInvite, UserFamilyMembership
from app.families.rbac import ensure_owner_not_downgraded, normalize_invite_role

DEFAULT_FAMILY_NAME = "Min familj"
DEFAULT_MEMBER_COLOR = "#378add"
INVITE_EXPIRY_DAYS = 7

settings = get_settings()
logger = logging.getLogger(__name__)


async def list_user_memberships(db: AsyncSession, user_id: UUID) -> list[UserFamilyMembership]:
    result = await db.execute(
        select(UserFamilyMembership)
        .where(UserFamilyMembership.user_id == user_id)
        .order_by(UserFamilyMembership.is_primary.desc(), UserFamilyMembership.joined_at.asc())
    )
    return list(result.scalars().all())


async def create_primary_family_for_user(
    db: AsyncSession,
    user: User,
    family_name: str | None = None,
) -> tuple[Family, bool]:
    memberships = await list_user_memberships(db, user.id)
    if memberships:
        primary = next((m for m in memberships if m.is_primary), memberships[0])
        family_result = await db.execute(select(Family).where(Family.id == primary.family_id))
        existing_family = family_result.scalar_one()
        return existing_family, False

    now = datetime.now(tz=UTC)
    family = Family(
        name=(family_name or DEFAULT_FAMILY_NAME).strip() or DEFAULT_FAMILY_NAME,
        owner_user_id=user.id,
        trial_ends_at=now + timedelta(days=30),
    )
    db.add(family)
    await db.flush()

    membership = UserFamilyMembership(
        user_id=user.id,
        family_id=family.id,
        is_primary=True,
        role="owner",
        color_hex=DEFAULT_MEMBER_COLOR,
        invited_email=user.email,
    )
    db.add(membership)
    await db.flush()

    return family, True


def _hash_invite_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _build_invite_email_html(family_name: str, invite_url: str, expires_at: datetime) -> str:
    expires_text = expires_at.astimezone(UTC).strftime("%Y-%m-%d %H:%M UTC")
    return (
        f"<p>Du har blivit inbjuden till familjen <strong>{family_name}</strong> i Boet.</p>"
        f"<p>Klicka pa lank nedan for att acceptera inbjudan:</p>"
        f'<p><a href="{invite_url}">{invite_url}</a></p>'
        f"<p>Lanken gar ut: {expires_text}</p>"
    )


def _send_family_invite_email(
    email: str, family_name: str, token: str, expires_at: datetime
) -> None:
    resend.api_key = settings.RESEND_API_KEY.get_secret_value()
    invite_url = f"{settings.APP_URL}/invite/{token}"

    resend.Emails.send(
        {
            "from": settings.EMAIL_FROM,
            "to": [email],
            "subject": f"Inbjudan till {family_name} i Boet",
            "html": _build_invite_email_html(family_name, invite_url, expires_at),
        }
    )


def _send_family_invite_email_safe(
    email: str, family_name: str, token: str, expires_at: datetime
) -> None:
    try:
        _send_family_invite_email(email, family_name, token, expires_at)
    except Exception as error:  # pragma: no cover - network/provider dependent
        logger.exception("Failed to send family invite email")
        if settings.is_production:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Failed to send invite email",
            ) from error


def get_invite_status(invite: FamilyInvite, *, now: datetime | None = None) -> str:
    reference_time = now or datetime.now(tz=UTC)
    if invite.accepted_at is not None:
        return "accepted"
    if invite.revoked_at is not None:
        return "revoked"
    if invite.expires_at <= reference_time:
        return "expired"
    return "pending"


async def create_family_invite(
    db: AsyncSession,
    family: Family,
    invited_email: str,
    role: str = "parent",
) -> FamilyInvite:
    now = datetime.now(tz=UTC)
    expires_at = now + timedelta(days=INVITE_EXPIRY_DAYS)

    token = secrets.token_urlsafe(32)
    token_hash = _hash_invite_token(token)

    invite = FamilyInvite(
        family_id=family.id,
        invited_email=invited_email.lower().strip(),
        role=role,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    db.add(invite)
    await db.flush()

    _send_family_invite_email_safe(invite.invited_email, family.name, token, expires_at)
    return invite


async def list_family_invites(db: AsyncSession, *, family_id: UUID) -> list[FamilyInvite]:
    result = await db.execute(
        select(FamilyInvite)
        .where(FamilyInvite.family_id == family_id)
        .order_by(FamilyInvite.created_at.desc())
    )
    return list(result.scalars().all())


async def resend_family_invite(
    db: AsyncSession,
    *,
    family: Family,
    invite: FamilyInvite,
) -> FamilyInvite:
    if get_invite_status(invite) in {"accepted", "revoked"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Invite cannot be resent in its current state",
        )

    now = datetime.now(tz=UTC)
    expires_at = now + timedelta(days=INVITE_EXPIRY_DAYS)
    token = secrets.token_urlsafe(32)
    invite.token_hash = _hash_invite_token(token)
    invite.expires_at = expires_at
    invite.revoked_at = None
    await db.flush()

    _send_family_invite_email_safe(invite.invited_email, family.name, token, expires_at)
    return invite


async def revoke_family_invite(db: AsyncSession, *, invite: FamilyInvite) -> FamilyInvite:
    current_status = get_invite_status(invite)
    if current_status in {"accepted", "revoked"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Invite cannot be revoked in its current state",
        )

    invite.revoked_at = datetime.now(tz=UTC)
    await db.flush()
    return invite


async def update_family_member_role(
    db: AsyncSession,
    *,
    family: Family,
    target_user_id: UUID,
    role: str,
) -> UserFamilyMembership:
    try:
        normalized_role = normalize_invite_role(role)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(error),
        ) from error

    ensure_owner_not_downgraded(
        family_owner_user_id=family.owner_user_id,
        target_user_id=target_user_id,
        new_role=normalized_role,
    )

    membership_result = await db.execute(
        select(UserFamilyMembership).where(
            UserFamilyMembership.family_id == family.id,
            UserFamilyMembership.user_id == target_user_id,
        )
    )
    membership = membership_result.scalar_one_or_none()
    if membership is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    membership.role = normalized_role
    await db.flush()
    return membership


async def accept_family_invite_token(
    db: AsyncSession,
    user: User,
    token: str,
) -> tuple[Family, str, bool]:
    token_hash = _hash_invite_token(token)
    invite_result = await db.execute(
        select(FamilyInvite).where(FamilyInvite.token_hash == token_hash)
    )
    invite = invite_result.scalar_one_or_none()

    if invite is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")

    now = datetime.now(tz=UTC)
    if invite.accepted_at is not None:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invite already accepted")
    if invite.revoked_at is not None:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invite has been revoked")
    if invite.expires_at <= now:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Invite has expired")

    if user.email.lower().strip() != invite.invited_email.lower().strip():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invite email does not match current user",
        )

    family_result = await db.execute(select(Family).where(Family.id == invite.family_id))
    family = family_result.scalar_one_or_none()
    if family is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Family not found")

    membership_result = await db.execute(
        select(UserFamilyMembership).where(
            UserFamilyMembership.user_id == user.id,
            UserFamilyMembership.family_id == family.id,
        )
    )
    existing_membership = membership_result.scalar_one_or_none()

    if existing_membership is None:
        memberships = await list_user_memberships(db, user.id)
        membership = UserFamilyMembership(
            user_id=user.id,
            family_id=family.id,
            is_primary=not memberships,
            role=invite.role,
            invited_email=invite.invited_email,
            color_hex=DEFAULT_MEMBER_COLOR,
        )
        db.add(membership)
        resolved_role = invite.role
        already_member = False
    else:
        resolved_role = existing_membership.role
        already_member = True

    invite.accepted_at = now
    await db.flush()

    return family, resolved_role, already_member

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

import resend
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.core.settings import get_settings
from app.families.models import Family, FamilyInvite, UserFamilyMembership

DEFAULT_FAMILY_NAME = "Min familj"
DEFAULT_MEMBER_COLOR = "#378add"
INVITE_EXPIRY_DAYS = 7

settings = get_settings()


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

    _send_family_invite_email(invite.invited_email, family.name, token, expires_at)
    return invite

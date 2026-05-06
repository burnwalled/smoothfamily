from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.families.models import Family, UserFamilyMembership

DEFAULT_FAMILY_NAME = "Min familj"
DEFAULT_MEMBER_COLOR = "#378add"


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

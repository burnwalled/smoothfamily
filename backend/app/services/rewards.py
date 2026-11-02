"""Family rewards: everyone's approved points together unlock a shared activity (bowling, a restaurant …)."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FamilyReward, TaskCompletion, User
from app.services.notify import notify

_UNLOCKED_TEXT = {
    "en": ("Family goal reached! 🎉", "{title} is unlocked – well done, everyone!"),
    "sv": ("Familjemålet är nått! 🎉", "{title} är upplåst – bra jobbat allihop!"),
    "nb": ("Familiemålet er nådd! 🎉", "{title} er låst opp – godt jobbet alle sammen!"),
    "da": ("Familiemålet er nået! 🎉", "{title} er låst op – godt klaret allesammen!"),
    "fi": ("Perheen tavoite saavutettu! 🎉", "{title} on avattu – hienoa työtä kaikki!"),
}


def _aware(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


async def family_points_since(db: AsyncSession, family_id: uuid.UUID, since: datetime) -> int:
    """All family members' approved points earned (approved) since `since`."""
    when = func.coalesce(TaskCompletion.reviewed_at, TaskCompletion.created_at)
    value = (
        await db.execute(
            select(func.coalesce(func.sum(TaskCompletion.points_awarded), 0)).where(
                TaskCompletion.family_id == family_id,
                TaskCompletion.status == "approved",
                when >= _aware(since),
            )
        )
    ).scalar_one()
    return int(value or 0)


async def reward_progress(db: AsyncSession, reward: FamilyReward) -> int:
    return await family_points_since(db, reward.family_id, reward.starts_at)


async def check_family_rewards(db: AsyncSession, family_id: uuid.UUID) -> list[FamilyReward]:
    """Unlocks goals that have been reached (once) and tells the whole family. Returns the new ones."""
    open_rewards = (
        await db.execute(
            select(FamilyReward).where(FamilyReward.family_id == family_id, FamilyReward.unlocked_at.is_(None))
        )
    ).scalars().all()
    unlocked: list[FamilyReward] = []
    for reward in open_rewards:
        if await reward_progress(db, reward) >= reward.points_required:
            reward.unlocked_at = datetime.now(timezone.utc)
            unlocked.append(reward)
    if not unlocked:
        return []
    await db.commit()

    members = (await db.execute(select(User).where(User.family_id == family_id))).scalars().all()
    for reward in unlocked:
        for member in members:
            title, body = _UNLOCKED_TEXT.get(member.language or "en", _UNLOCKED_TEXT["en"])
            await notify(
                db,
                member,
                {"title": title, "body": body.format(title=reward.title), "route": "/achievements", "kind": "reward_unlocked"},
            )
    return unlocked

"""Points, weekly leaderboard and streaks computed from task completions."""
import uuid
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import TaskCompletion, User


def week_start(today: date) -> date:
    return today - timedelta(days=today.weekday())


async def leaderboard(db: AsyncSession, family_id: uuid.UUID, today: date) -> list[dict]:
    users = (
        (await db.execute(select(User).where(User.family_id == family_id))).scalars().all()
    )

    totals = dict(
        (
            await db.execute(
                select(TaskCompletion.user_id, func.coalesce(func.sum(TaskCompletion.points_awarded), 0))
                .where(TaskCompletion.family_id == family_id, TaskCompletion.status == "approved")
                .group_by(TaskCompletion.user_id)
            )
        ).all()
    )
    weekly = dict(
        (
            await db.execute(
                select(TaskCompletion.user_id, func.coalesce(func.sum(TaskCompletion.points_awarded), 0))
                .where(
                    TaskCompletion.family_id == family_id,
                    TaskCompletion.status == "approved",
                    TaskCompletion.completed_date >= week_start(today),
                )
                .group_by(TaskCompletion.user_id)
            )
        ).all()
    )

    entries = []
    for user in users:
        entries.append(
            {
                "user_id": user.id,
                "display_name": user.display_name,
                "color": user.color,
                "points_week": int(weekly.get(user.id, 0)),
                "points_total": int(totals.get(user.id, 0)),
                "streak_days": await streak(db, user.id, today),
            }
        )
    entries.sort(key=lambda e: (-e["points_week"], -e["points_total"]))
    return entries


async def streak(db: AsyncSession, user_id: uuid.UUID, today: date) -> int:
    """Consecutive days (ending today or yesterday) with at least one completion."""
    dates = set(
        (
            await db.execute(
                select(TaskCompletion.completed_date)
                .where(
                    TaskCompletion.user_id == user_id,
                    TaskCompletion.status == "approved",
                    TaskCompletion.completed_date >= today - timedelta(days=365),
                )
                .distinct()
            )
        )
        .scalars()
        .all()
    )
    if not dates:
        return 0
    cursor = today if today in dates else today - timedelta(days=1)
    count = 0
    while cursor in dates:
        count += 1
        cursor -= timedelta(days=1)
    return count

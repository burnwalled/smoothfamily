"""Achievement catalog and evaluation."""
import math
import uuid
from datetime import date, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import TaskCompletion, User, UserAchievement
from app.services.gamification import streak as compute_streak


CATALOG: list[dict[str, Any]] = [
    # total completions
    {"id": "first_task",  "tier": "bronze", "icon": "✅", "condition_type": "total_completions", "threshold": 1},
    {"id": "task_10",     "tier": "silver", "icon": "✅", "condition_type": "total_completions", "threshold": 10},
    {"id": "task_100",    "tier": "gold",   "icon": "✅", "condition_type": "total_completions", "threshold": 100},
    # streak
    {"id": "streak_3",  "tier": "bronze", "icon": "🔥", "condition_type": "streak_days", "threshold": 3},
    {"id": "streak_7",  "tier": "silver", "icon": "🔥", "condition_type": "streak_days", "threshold": 7},
    {"id": "streak_30", "tier": "gold",   "icon": "🔥", "condition_type": "streak_days", "threshold": 30},
    # lifetime points
    {"id": "points_100",  "tier": "bronze", "icon": "⭐", "condition_type": "lifetime_points", "threshold": 100},
    {"id": "points_1000", "tier": "silver", "icon": "⭐", "condition_type": "lifetime_points", "threshold": 1000},
    {"id": "points_5000", "tier": "gold",   "icon": "⭐", "condition_type": "lifetime_points", "threshold": 5000},
    # early bird (completion created before 08:00 UTC — deviation: approximation of local time)
    {"id": "early_bird_1",  "tier": "bronze", "icon": "🌅", "condition_type": "early_bird", "threshold": 1},
    {"id": "early_bird_10", "tier": "silver", "icon": "🌅", "condition_type": "early_bird", "threshold": 10},
    {"id": "early_bird_50", "tier": "gold",   "icon": "🌅", "condition_type": "early_bird", "threshold": 50},
    # weekly leaderboard wins (ties count for all tied users)
    {"id": "week_win_1",  "tier": "bronze", "icon": "🏆", "condition_type": "week_wins", "threshold": 1},
    {"id": "week_win_5",  "tier": "silver", "icon": "🏆", "condition_type": "week_wins", "threshold": 5},
    {"id": "week_win_20", "tier": "gold",   "icon": "🏆", "condition_type": "week_wins", "threshold": 20},
    # variety: distinct tasks in one ISO week
    {"id": "variety_3",  "tier": "bronze", "icon": "🌈", "condition_type": "variety", "threshold": 3},
    {"id": "variety_7",  "tier": "silver", "icon": "🌈", "condition_type": "variety", "threshold": 7},
    {"id": "variety_15", "tier": "gold",   "icon": "🌈", "condition_type": "variety", "threshold": 15},
]

CATALOG_BY_ID: dict[str, dict[str, Any]] = {a["id"]: a for a in CATALOG}


def user_level(lifetime_points: int) -> dict:
    level = math.floor(math.sqrt(lifetime_points / 25))
    pts_at_level = level * level * 25
    pts_at_next = (level + 1) * (level + 1) * 25
    return {
        "level": level,
        "points": lifetime_points,
        "points_in_level": lifetime_points - pts_at_level,
        "points_to_next": pts_at_next - pts_at_level,
    }


async def _metrics(db: AsyncSession, user: User, today: date) -> dict[str, int]:
    result = await db.execute(
        select(TaskCompletion).where(TaskCompletion.user_id == user.id, TaskCompletion.status == "approved")
    )
    completions = list(result.scalars().all())

    total_completions = len(completions)
    lifetime_points = sum(c.points_awarded for c in completions)

    early_bird_count = 0
    for c in completions:
        if c.created_at is None:
            continue
        dt = c.created_at
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        if dt.astimezone(timezone.utc).hour < 8:
            early_bird_count += 1

    streak_days = await compute_streak(db, user.id, today)

    # week_wins: completed ISO weeks (strictly before current) where this user had the highest points in the family
    current_iso_year, current_iso_week, _ = today.isocalendar()
    family_result = await db.execute(
        select(TaskCompletion).where(TaskCompletion.family_id == user.family_id, TaskCompletion.status == "approved")
    )
    family_completions = list(family_result.scalars().all())

    weekly_points: dict[tuple, dict[uuid.UUID, int]] = {}
    for c in family_completions:
        iso_year, iso_week, _ = c.completed_date.isocalendar()
        if (iso_year, iso_week) >= (current_iso_year, current_iso_week):
            continue
        week_key = (iso_year, iso_week)
        if week_key not in weekly_points:
            weekly_points[week_key] = {}
        weekly_points[week_key][c.user_id] = weekly_points[week_key].get(c.user_id, 0) + c.points_awarded

    week_wins = 0
    for user_pts in weekly_points.values():
        if not user_pts:
            continue
        max_pts = max(user_pts.values())
        if max_pts > 0 and user_pts.get(user.id, 0) == max_pts:
            week_wins += 1

    # variety: max distinct task_ids completed in a single ISO week
    weekly_tasks: dict[tuple, set] = {}
    for c in completions:
        iso_year, iso_week, _ = c.completed_date.isocalendar()
        week_key = (iso_year, iso_week)
        if week_key not in weekly_tasks:
            weekly_tasks[week_key] = set()
        weekly_tasks[week_key].add(c.task_id)

    variety = max((len(tasks) for tasks in weekly_tasks.values()), default=0)

    return {
        "total_completions": total_completions,
        "lifetime_points": lifetime_points,
        "early_bird": early_bird_count,
        "streak_days": streak_days,
        "week_wins": week_wins,
        "variety": variety,
    }


async def evaluate_achievements(db: AsyncSession, user: User) -> list[str]:
    """Unlock newly-earned achievements. Returns list of newly-unlocked IDs. Idempotent."""
    today = date.today()
    metrics = await _metrics(db, user, today)

    result = await db.execute(
        select(UserAchievement.achievement_id).where(UserAchievement.user_id == user.id)
    )
    already_unlocked = set(result.scalars().all())

    newly_unlocked: list[str] = []
    for ach in CATALOG:
        if ach["id"] in already_unlocked:
            continue
        if metrics[ach["condition_type"]] >= ach["threshold"]:
            db.add(UserAchievement(
                user_id=user.id,
                family_id=user.family_id,
                achievement_id=ach["id"],
            ))
            newly_unlocked.append(ach["id"])

    if newly_unlocked:
        await db.commit()

    return newly_unlocked


async def get_achievement_states(db: AsyncSession, user: User) -> tuple[list[dict], dict]:
    """Return full catalog merged with user's unlocked state + level info."""
    today = date.today()
    metrics = await _metrics(db, user, today)

    result = await db.execute(
        select(UserAchievement).where(UserAchievement.user_id == user.id)
    )
    unlocked_map = {ua.achievement_id: ua.unlocked_at for ua in result.scalars().all()}

    level_info = user_level(metrics["lifetime_points"])

    achievements = []
    for ach in CATALOG:
        current_val = min(metrics[ach["condition_type"]], ach["threshold"])
        achievements.append({
            "id": ach["id"],
            "tier": ach["tier"],
            "icon": ach["icon"],
            "unlocked_at": unlocked_map.get(ach["id"]),
            "progress": {"current": current_val, "target": ach["threshold"]},
        })

    return achievements, level_info

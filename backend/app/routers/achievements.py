"""Achievement catalog and user progress."""
from fastapi import APIRouter

from app.deps import DB, CurrentUser, require_app
from app.schemas import AchievementsResponse
from app.services.achievements import get_achievement_states

router = APIRouter(prefix="/api/achievements", tags=["achievements"], dependencies=[require_app("achievements")])


@router.get("", response_model=AchievementsResponse)
async def list_achievements(user: CurrentUser, db: DB) -> dict:
    achievements, level = await get_achievement_states(db, user)
    return {"achievements": achievements, "level": level}

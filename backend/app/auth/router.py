from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.context import AuthContext, get_current_context
from app.auth.schemas import UserResponse, UserUpdateRequest
from app.auth.service import get_or_create_user
from app.core.database import get_db

router = APIRouter()


@router.get("/me", response_model=UserResponse)
async def get_me(
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Return the current user, creating the row on first login."""
    user = await get_or_create_user(db, ctx.clerk_user_id, ctx.email)
    return UserResponse.model_validate(user)


@router.patch("/me", response_model=UserResponse)
async def update_me(
    body: UserUpdateRequest,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    """Update locale, timezone, or theme_preference for the current user."""
    user = await get_or_create_user(db, ctx.clerk_user_id, ctx.email)
    if body.locale is not None:
        user.locale = body.locale
    if body.timezone is not None:
        user.timezone = body.timezone
    if body.theme_preference is not None:
        user.theme_preference = body.theme_preference
    await db.flush()
    return UserResponse.model_validate(user)

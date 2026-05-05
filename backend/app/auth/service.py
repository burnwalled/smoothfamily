from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User


async def get_or_create_user(
    db: AsyncSession,
    clerk_user_id: str,
    email: str,
) -> User:
    result = await db.execute(select(User).where(User.clerk_user_id == clerk_user_id))
    user = result.scalar_one_or_none()
    if user is None:
        user = User(clerk_user_id=clerk_user_id, email=email)
        db.add(user)
        await db.flush()
    return user

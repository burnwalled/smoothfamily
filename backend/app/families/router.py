from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.context import AuthContext, get_current_context
from app.auth.service import get_or_create_user
from app.core.database import get_db
from app.families.schemas import FamilyCreateRequest, FamilyCreateResponse
from app.families.service import create_primary_family_for_user

router = APIRouter()


@router.post("", response_model=FamilyCreateResponse)
async def create_family(
    body: FamilyCreateRequest,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> FamilyCreateResponse:
    user = await get_or_create_user(db, ctx.clerk_user_id, ctx.email)
    family, created = await create_primary_family_for_user(db, user, body.name)

    return FamilyCreateResponse(
        id=family.id,
        name=family.name,
        owner_user_id=family.owner_user_id,
        tier=family.tier,
        billing_cycle=family.billing_cycle,
        subscription_status=family.subscription_status,
        trial_ends_at=family.trial_ends_at,
        created_at=family.created_at,
        created=created,
    )

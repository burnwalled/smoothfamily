from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.context import AuthContext, get_current_context
from app.auth.service import get_or_create_user
from app.core.database import get_db
from app.families.models import Family
from app.families.schemas import (
    FamilyCreateRequest,
    FamilyCreateResponse,
    FamilyInviteCreateRequest,
    FamilyInviteCreateResponse,
)
from app.families.service import create_family_invite, create_primary_family_for_user

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


@router.post("/{family_id}/invites", response_model=FamilyInviteCreateResponse)
async def create_family_invite_endpoint(
    family_id: UUID,
    body: FamilyInviteCreateRequest,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> FamilyInviteCreateResponse:
    if not ctx.has_family_access(family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this family",
        )

    family_result = await db.execute(select(Family).where(Family.id == family_id))
    family = family_result.scalar_one_or_none()
    if family is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Family not found")

    invite = await create_family_invite(
        db,
        family=family,
        invited_email=body.email,
        role=body.role,
    )

    return FamilyInviteCreateResponse(
        id=invite.id,
        family_id=invite.family_id,
        invited_email=invite.invited_email,
        role=invite.role,
        expires_at=invite.expires_at,
        created_at=invite.created_at,
    )

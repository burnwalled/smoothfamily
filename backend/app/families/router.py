from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.context import AuthContext, get_current_context
from app.auth.models import User
from app.auth.service import get_or_create_user
from app.core.database import get_db
from app.families.models import Family, FamilyInvite, UserFamilyMembership
from app.families.rbac import (
    normalize_invite_role,
    permissions_for_role,
    resolve_effective_family_role,
)
from app.families.schemas import (
    FamilyCreateRequest,
    FamilyCreateResponse,
    FamilyInviteCreateRequest,
    FamilyInviteCreateResponse,
    FamilyMemberResponse,
    FamilyPermissionsResponse,
    FamilyOverviewResponse,
    PendingInviteResponse,
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

    membership_result = await db.execute(
        select(UserFamilyMembership).where(
            UserFamilyMembership.family_id == family.id,
            UserFamilyMembership.user_id == ctx.user_id,
        )
    )
    membership = membership_result.scalar_one_or_none()
    if membership is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this family")

    current_user_role = resolve_effective_family_role(
        family_owner_user_id=family.owner_user_id,
        user_id=ctx.user_id,
        membership_role=membership.role,
    )
    permissions = permissions_for_role(current_user_role)
    if not permissions.can_manage_members:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to invite family members",
        )

    try:
        invite_role = normalize_invite_role(body.role)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)) from error

    invite = await create_family_invite(
        db,
        family=family,
        invited_email=body.email,
        role=invite_role,
    )

    return FamilyInviteCreateResponse(
        id=invite.id,
        family_id=invite.family_id,
        invited_email=invite.invited_email,
        role=invite.role,
        expires_at=invite.expires_at,
        created_at=invite.created_at,
    )


@router.get("/current/overview", response_model=FamilyOverviewResponse)
async def get_current_family_overview(
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> FamilyOverviewResponse:
    now = datetime.now(tz=UTC)

    if ctx.primary_family_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No family found")

    family_result = await db.execute(select(Family).where(Family.id == ctx.primary_family_id))
    family = family_result.scalar_one_or_none()
    if family is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Family not found")

    members_result = await db.execute(
        select(UserFamilyMembership, User.email)
        .join(User, User.id == UserFamilyMembership.user_id)
        .where(UserFamilyMembership.family_id == family.id)
        .order_by(UserFamilyMembership.is_primary.desc(), UserFamilyMembership.joined_at.asc())
    )
    members = [
        FamilyMemberResponse(
            user_id=membership.user_id,
            email=email,
            role=resolve_effective_family_role(
                family_owner_user_id=family.owner_user_id,
                user_id=membership.user_id,
                membership_role=membership.role,
            ),
            is_primary=membership.is_primary,
            color_hex=membership.color_hex,
        )
        for membership, email in members_result.all()
    ]

    caller_membership = next((member for member in members if member.user_id == ctx.user_id), None)
    if caller_membership is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this family")

    current_user_role = caller_membership.role
    permissions = permissions_for_role(current_user_role)

    invites_result = await db.execute(
        select(FamilyInvite)
        .where(
            FamilyInvite.family_id == family.id,
            FamilyInvite.accepted_at.is_(None),
            FamilyInvite.expires_at > now,
        )
        .order_by(FamilyInvite.created_at.desc())
    )
    pending_invites = [
        PendingInviteResponse(
            id=invite.id,
            invited_email=invite.invited_email,
            role=invite.role,
            expires_at=invite.expires_at,
            created_at=invite.created_at,
        )
        for invite in invites_result.scalars().all()
    ]

    return FamilyOverviewResponse(
        family_id=family.id,
        family_name=family.name,
        current_user_role=current_user_role,
        permissions=FamilyPermissionsResponse(
            can_manage_settings=permissions.can_manage_settings,
            can_manage_members=permissions.can_manage_members,
            can_manage_calendar_integrations=permissions.can_manage_calendar_integrations,
        ),
        members=members,
        pending_invites=pending_invites,
    )

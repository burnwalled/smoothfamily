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
    FamilyInviteActionResponse,
    FamilyInviteCreateRequest,
    FamilyInviteCreateResponse,
    FamilyInviteListResponse,
    FamilyMemberResponse,
    FamilyMemberRoleUpdateRequest,
    FamilyMemberRoleUpdateResponse,
    FamilyOverviewResponse,
    FamilyPermissionsResponse,
    PendingInviteResponse,
    PendingMembersWidgetInviteResponse,
    PendingMembersWidgetMemberResponse,
    PendingMembersWidgetResponse,
)
from app.families.service import (
    create_family_invite,
    create_primary_family_for_user,
    get_invite_status,
    list_family_invites,
    resend_family_invite,
    revoke_family_invite,
    update_family_member_role,
)

router = APIRouter()


async def _get_family_and_membership_or_403(
    db: AsyncSession,
    *,
    family_id: UUID,
    user_id: UUID,
) -> tuple[Family, UserFamilyMembership, str]:
    family_result = await db.execute(select(Family).where(Family.id == family_id))
    family = family_result.scalar_one_or_none()
    if family is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Family not found")

    membership_result = await db.execute(
        select(UserFamilyMembership).where(
            UserFamilyMembership.family_id == family.id,
            UserFamilyMembership.user_id == user_id,
        )
    )
    membership = membership_result.scalar_one_or_none()
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this family",
        )

    current_user_role = resolve_effective_family_role(
        family_owner_user_id=family.owner_user_id,
        user_id=user_id,
        membership_role=membership.role,
    )
    return family, membership, current_user_role


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

    family, _, current_user_role = await _get_family_and_membership_or_403(
        db,
        family_id=family_id,
        user_id=ctx.user_id,
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
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)
        ) from error

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
        status=get_invite_status(invite),
        expires_at=invite.expires_at,
        revoked_at=invite.revoked_at,
        accepted_at=invite.accepted_at,
        created_at=invite.created_at,
    )


@router.get("/{family_id}/invites", response_model=FamilyInviteListResponse)
async def list_family_invites_endpoint(
    family_id: UUID,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> FamilyInviteListResponse:
    if not ctx.has_family_access(family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this family",
        )

    family, _, current_user_role = await _get_family_and_membership_or_403(
        db,
        family_id=family_id,
        user_id=ctx.user_id,
    )
    permissions = permissions_for_role(current_user_role)
    if not permissions.can_manage_members:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to manage family members",
        )

    invites = await list_family_invites(db, family_id=family.id)
    now = datetime.now(tz=UTC)
    return FamilyInviteListResponse(
        invites=[
            PendingInviteResponse(
                id=invite.id,
                invited_email=invite.invited_email,
                role=invite.role,
                status=get_invite_status(invite, now=now),
                expires_at=invite.expires_at,
                created_at=invite.created_at,
            )
            for invite in invites
        ]
    )


@router.post("/{family_id}/invites/{invite_id}/resend", response_model=FamilyInviteActionResponse)
async def resend_family_invite_endpoint(
    family_id: UUID,
    invite_id: UUID,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> FamilyInviteActionResponse:
    if not ctx.has_family_access(family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this family",
        )

    family, _, current_user_role = await _get_family_and_membership_or_403(
        db,
        family_id=family_id,
        user_id=ctx.user_id,
    )
    permissions = permissions_for_role(current_user_role)
    if not permissions.can_manage_members:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to manage family members",
        )

    invite_result = await db.execute(
        select(FamilyInvite).where(
            FamilyInvite.id == invite_id,
            FamilyInvite.family_id == family.id,
        )
    )
    invite = invite_result.scalar_one_or_none()
    if invite is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")

    updated = await resend_family_invite(db, family=family, invite=invite)
    return FamilyInviteActionResponse(
        id=updated.id,
        family_id=updated.family_id,
        invited_email=updated.invited_email,
        role=updated.role,
        status=get_invite_status(updated),
        expires_at=updated.expires_at,
        revoked_at=updated.revoked_at,
        accepted_at=updated.accepted_at,
        created_at=updated.created_at,
    )


@router.delete("/{family_id}/invites/{invite_id}", response_model=FamilyInviteActionResponse)
async def revoke_family_invite_endpoint(
    family_id: UUID,
    invite_id: UUID,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> FamilyInviteActionResponse:
    if not ctx.has_family_access(family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this family",
        )

    family, _, current_user_role = await _get_family_and_membership_or_403(
        db,
        family_id=family_id,
        user_id=ctx.user_id,
    )
    permissions = permissions_for_role(current_user_role)
    if not permissions.can_manage_members:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to manage family members",
        )

    invite_result = await db.execute(
        select(FamilyInvite).where(
            FamilyInvite.id == invite_id,
            FamilyInvite.family_id == family.id,
        )
    )
    invite = invite_result.scalar_one_or_none()
    if invite is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")

    updated = await revoke_family_invite(db, invite=invite)
    return FamilyInviteActionResponse(
        id=updated.id,
        family_id=updated.family_id,
        invited_email=updated.invited_email,
        role=updated.role,
        status=get_invite_status(updated),
        expires_at=updated.expires_at,
        revoked_at=updated.revoked_at,
        accepted_at=updated.accepted_at,
        created_at=updated.created_at,
    )


@router.put(
    "/{family_id}/members/{member_user_id}/role", response_model=FamilyMemberRoleUpdateResponse
)
async def update_family_member_role_endpoint(
    family_id: UUID,
    member_user_id: UUID,
    body: FamilyMemberRoleUpdateRequest,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> FamilyMemberRoleUpdateResponse:
    if not ctx.has_family_access(family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this family",
        )

    family, _, current_user_role = await _get_family_and_membership_or_403(
        db,
        family_id=family_id,
        user_id=ctx.user_id,
    )
    permissions = permissions_for_role(current_user_role)
    if not permissions.can_manage_members:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to manage family members",
        )

    membership = await update_family_member_role(
        db,
        family=family,
        target_user_id=member_user_id,
        role=body.role,
    )

    resolved_role = resolve_effective_family_role(
        family_owner_user_id=family.owner_user_id,
        user_id=membership.user_id,
        membership_role=membership.role,
    )
    return FamilyMemberRoleUpdateResponse(user_id=membership.user_id, role=resolved_role)


@router.get("/{family_id}/members/widgets/pending", response_model=PendingMembersWidgetResponse)
async def get_pending_members_widget(
    family_id: UUID,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> PendingMembersWidgetResponse:
    if not ctx.has_family_access(family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this family",
        )

    family, _, _ = await _get_family_and_membership_or_403(
        db,
        family_id=family_id,
        user_id=ctx.user_id,
    )

    now = datetime.now(tz=UTC)
    invites = await list_family_invites(db, family_id=family.id)
    pending_invites = [
        invite for invite in invites if get_invite_status(invite, now=now) == "pending"
    ]

    members_result = await db.execute(
        select(UserFamilyMembership, User.email)
        .join(User, User.id == UserFamilyMembership.user_id)
        .where(UserFamilyMembership.family_id == family.id)
        .order_by(UserFamilyMembership.joined_at.desc())
        .limit(5)
    )

    return PendingMembersWidgetResponse(
        family_id=family.id,
        pending_invites_count=len(pending_invites),
        invites=[
            PendingMembersWidgetInviteResponse(
                id=invite.id,
                invited_email=invite.invited_email,
                role=invite.role,
                expires_at=invite.expires_at,
            )
            for invite in pending_invites[:5]
        ],
        recent_member_changes=[
            PendingMembersWidgetMemberResponse(
                user_id=membership.user_id,
                email=email,
                role=resolve_effective_family_role(
                    family_owner_user_id=family.owner_user_id,
                    user_id=membership.user_id,
                    membership_role=membership.role,
                ),
                joined_at=membership.joined_at,
            )
            for membership, email in members_result.all()
        ],
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
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this family"
        )

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
            status="pending",
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

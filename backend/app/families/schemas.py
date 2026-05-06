from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class FamilyCreateRequest(BaseModel):
    name: str | None = None


class FamilyCreateResponse(BaseModel):
    id: UUID
    name: str
    owner_user_id: UUID
    tier: str
    billing_cycle: str
    subscription_status: str
    trial_ends_at: datetime | None
    created_at: datetime
    created: bool

    model_config = {"from_attributes": True}


class FamilyInviteCreateRequest(BaseModel):
    email: str
    role: str = "parent"


class FamilyInviteCreateResponse(BaseModel):
    id: UUID
    family_id: UUID
    invited_email: str
    role: str
    status: str
    expires_at: datetime
    revoked_at: datetime | None = None
    accepted_at: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class FamilyInviteAcceptResponse(BaseModel):
    family_id: UUID
    family_name: str
    role: str
    already_member: bool


class FamilyMemberResponse(BaseModel):
    user_id: UUID
    email: str
    role: str
    is_primary: bool
    color_hex: str | None


class PendingInviteResponse(BaseModel):
    id: UUID
    invited_email: str
    role: str
    status: str = "pending"
    expires_at: datetime
    created_at: datetime


class FamilyInviteListResponse(BaseModel):
    invites: list[PendingInviteResponse]


class FamilyInviteActionResponse(BaseModel):
    id: UUID
    family_id: UUID
    invited_email: str
    role: str
    status: str
    expires_at: datetime
    revoked_at: datetime | None = None
    accepted_at: datetime | None = None
    created_at: datetime


class FamilyMemberRoleUpdateRequest(BaseModel):
    role: str


class FamilyMemberRoleUpdateResponse(BaseModel):
    user_id: UUID
    role: str


class PendingMembersWidgetInviteResponse(BaseModel):
    id: UUID
    invited_email: str
    role: str
    expires_at: datetime


class PendingMembersWidgetMemberResponse(BaseModel):
    user_id: UUID
    email: str
    role: str
    joined_at: datetime


class PendingMembersWidgetResponse(BaseModel):
    family_id: UUID
    pending_invites_count: int
    invites: list[PendingMembersWidgetInviteResponse]
    recent_member_changes: list[PendingMembersWidgetMemberResponse]


class FamilyPermissionsResponse(BaseModel):
    can_manage_settings: bool
    can_manage_members: bool
    can_manage_calendar_integrations: bool


class FamilyOverviewResponse(BaseModel):
    family_id: UUID
    family_name: str
    current_user_role: str
    permissions: FamilyPermissionsResponse
    members: list[FamilyMemberResponse]
    pending_invites: list[PendingInviteResponse]

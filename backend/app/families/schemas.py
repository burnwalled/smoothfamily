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
    expires_at: datetime
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
    expires_at: datetime
    created_at: datetime


class FamilyOverviewResponse(BaseModel):
    family_id: UUID
    family_name: str
    members: list[FamilyMemberResponse]
    pending_invites: list[PendingInviteResponse]

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

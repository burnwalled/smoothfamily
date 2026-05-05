from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class UserResponse(BaseModel):
    id: UUID
    clerk_user_id: str
    email: str
    locale: str
    timezone: str
    theme_preference: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserUpdateRequest(BaseModel):
    locale: str | None = None
    timezone: str | None = None
    theme_preference: str | None = None

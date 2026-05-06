from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

WidgetSize = Literal["small", "medium", "large", "full"]


class DashboardAvailableWidgetResponse(BaseModel):
    widget_type: str
    default_size: WidgetSize
    allowed_sizes: list[WidgetSize]
    required_features: list[str] = Field(default_factory=list)


class DashboardWidgetLayoutResponse(BaseModel):
    widget_type: str
    size: WidgetSize
    position: int
    is_visible: bool


class DashboardLayoutResponse(BaseModel):
    family_id: UUID
    user_id: UUID
    updated_at: datetime | None
    widgets: list[DashboardWidgetLayoutResponse]
    available_widgets: list[DashboardAvailableWidgetResponse]


class DashboardWidgetLayoutUpdateRequest(BaseModel):
    widget_type: str
    size: WidgetSize
    position: int
    is_visible: bool = True


class DashboardLayoutUpdateRequest(BaseModel):
    widgets: list[DashboardWidgetLayoutUpdateRequest]

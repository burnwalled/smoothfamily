from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class CalendarEventUpsertRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    location: str | None = None
    start_at: datetime
    end_at: datetime
    all_day: bool = False
    tagged_user_ids: list[UUID] = Field(default_factory=list)
    hidden_for_user_ids: list[UUID] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_dates(self) -> "CalendarEventUpsertRequest":
        if self.end_at <= self.start_at:
            raise ValueError("end_at must be after start_at")
        return self


class CalendarEventResponse(BaseModel):
    id: UUID
    family_id: UUID
    creator_user_id: UUID
    title: str
    description: str | None
    location: str | None
    start_at: datetime
    end_at: datetime
    all_day: bool
    is_hidden: bool
    tagged_user_ids: list[UUID]
    hidden_for_user_ids: list[UUID]
    created_at: datetime
    updated_at: datetime


class CalendarEventsListResponse(BaseModel):
    events: list[CalendarEventResponse]


class UpcomingCalendarEventResponse(BaseModel):
    id: UUID
    title: str
    start_at: datetime
    end_at: datetime
    all_day: bool
    tagged_user_ids: list[UUID]


class UpcomingEventsWidgetResponse(BaseModel):
    family_id: UUID
    events: list[UpcomingCalendarEventResponse]

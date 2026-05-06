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


class ExternalCalendarFeedCreateRequest(BaseModel):
    member_user_id: UUID
    provider: str = Field(min_length=2, max_length=20)
    display_name: str = Field(min_length=1, max_length=120)
    ical_url: str = Field(min_length=12, max_length=4000)


class ExternalCalendarFeedResponse(BaseModel):
    id: UUID
    family_id: UUID
    member_user_id: UUID
    member_email: str
    provider: str
    display_name: str
    ical_url_masked: str
    enabled: bool
    last_fetched_at: datetime | None
    last_fetch_status: str
    last_error_message: str | None
    created_at: datetime
    updated_at: datetime


class ExternalCalendarFeedsListResponse(BaseModel):
    feeds: list[ExternalCalendarFeedResponse]

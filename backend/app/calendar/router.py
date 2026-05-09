from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.context import AuthContext, get_current_context
from app.auth.models import User
from app.calendar.models import CalendarEvent, ExternalCalendarFeed
from app.calendar.schemas import (
    AggregatedCalendarEventResponse,
    AggregatedCalendarEventsListResponse,
    CalendarEventResponse,
    CalendarEventsListResponse,
    CalendarEventUpsertRequest,
    ExternalCalendarFeedCreateRequest,
    ExternalCalendarFeedResponse,
    ExternalCalendarFeedsListResponse,
    ExternalCalendarFeedUpdateRequest,
    UpcomingCalendarEventResponse,
    UpcomingEventsWidgetResponse,
)
from app.calendar.service import (
    create_calendar_event,
    create_external_calendar_feed,
    delete_calendar_event,
    delete_external_calendar_feed,
    get_family_role_for_user,
    list_aggregated_events,
    list_external_calendar_feeds,
    list_visible_events,
    update_calendar_event,
    update_external_calendar_feed,
)
from app.core.database import get_db

router = APIRouter()


def to_calendar_event_response(calendar_event: CalendarEvent) -> CalendarEventResponse:
    return CalendarEventResponse(
        id=calendar_event.id,
        family_id=calendar_event.family_id,
        creator_user_id=calendar_event.creator_user_id,
        title=calendar_event.title,
        description=calendar_event.description,
        location=calendar_event.location,
        start_at=calendar_event.start_at,
        end_at=calendar_event.end_at,
        all_day=calendar_event.all_day,
        is_hidden=calendar_event.is_hidden,
        tagged_user_ids=[member.user_id for member in calendar_event.tagged_members],
        hidden_for_user_ids=[member.user_id for member in calendar_event.hidden_for_members],
        created_at=calendar_event.created_at,
        updated_at=calendar_event.updated_at,
    )


def _mask_url(url: str) -> str:
    if len(url) <= 20:
        return "***"
    return f"{url[:16]}...{url[-8:]}"


def to_external_calendar_feed_response(
    *,
    feed: ExternalCalendarFeed,
    member_email: str,
) -> ExternalCalendarFeedResponse:
    return ExternalCalendarFeedResponse(
        id=feed.id,
        family_id=feed.family_id,
        member_user_id=feed.member_user_id,
        member_email=member_email,
        provider=feed.provider,
        display_name=feed.display_name,
        color_hex=feed.color_hex,
        ical_url_masked=_mask_url(feed.ical_url),
        enabled=feed.enabled,
        last_fetched_at=feed.last_fetched_at,
        last_fetch_status=feed.last_fetch_status,
        last_error_message=feed.last_error_message,
        created_at=feed.created_at,
        updated_at=feed.updated_at,
    )


def to_aggregated_event_response(event: object) -> AggregatedCalendarEventResponse:
    from app.calendar.service import AggregatedCalendarEvent

    if not isinstance(event, AggregatedCalendarEvent):
        raise ValueError("Expected AggregatedCalendarEvent")
    return AggregatedCalendarEventResponse(
        id=event.id,
        source_type=event.source_type,
        source_label=event.source_label,
        member_user_id=event.member_user_id,
        source_color_hex=event.source_color_hex,
        title=event.title,
        description=event.description,
        location=event.location,
        start_at=event.start_at,
        end_at=event.end_at,
        all_day=event.all_day,
        is_hidden=event.is_hidden,
        can_edit=event.can_edit,
        family_event_id=event.family_event_id,
        tagged_user_ids=event.tagged_user_ids,
        hidden_for_user_ids=event.hidden_for_user_ids,
    )


@router.get("/{family_id}/calendar/events", response_model=CalendarEventsListResponse)
async def list_calendar_events(
    family_id: UUID,
    start_at_from: datetime | None = Query(default=None),
    start_at_to: datetime | None = Query(default=None),
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> CalendarEventsListResponse:
    if not ctx.has_family_access(family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this family",
        )

    events = await list_visible_events(
        db,
        family_id=family_id,
        current_user_id=ctx.user_id,
        start_at_from=start_at_from,
        start_at_to=start_at_to,
    )
    return CalendarEventsListResponse(
        events=[to_calendar_event_response(event) for event in events]
    )


@router.get(
    "/{family_id}/calendar/events/aggregated",
    response_model=AggregatedCalendarEventsListResponse,
)
async def list_aggregated_calendar_events(
    family_id: UUID,
    start_at_from: datetime | None = Query(default=None),
    start_at_to: datetime | None = Query(default=None),
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> AggregatedCalendarEventsListResponse:
    if not ctx.has_family_access(family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this family",
        )

    role = await get_family_role_for_user(db, family_id=family_id, user_id=ctx.user_id)
    events = await list_aggregated_events(
        db,
        family_id=family_id,
        current_user_id=ctx.user_id,
        role=role,
        start_at_from=start_at_from,
        start_at_to=start_at_to,
    )
    return AggregatedCalendarEventsListResponse(
        events=[to_aggregated_event_response(event) for event in events]
    )


@router.post("/{family_id}/calendar/events", response_model=CalendarEventResponse)
async def create_calendar_event_endpoint(
    family_id: UUID,
    body: CalendarEventUpsertRequest,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> CalendarEventResponse:
    if not ctx.has_family_access(family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this family",
        )

    role = await get_family_role_for_user(db, family_id=family_id, user_id=ctx.user_id)
    created = await create_calendar_event(
        db,
        family_id=family_id,
        creator_user_id=ctx.user_id,
        role=role,
        body=body,
    )
    return to_calendar_event_response(created)


@router.put("/{family_id}/calendar/events/{event_id}", response_model=CalendarEventResponse)
async def update_calendar_event_endpoint(
    family_id: UUID,
    event_id: UUID,
    body: CalendarEventUpsertRequest,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> CalendarEventResponse:
    if not ctx.has_family_access(family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this family",
        )

    role = await get_family_role_for_user(db, family_id=family_id, user_id=ctx.user_id)
    updated = await update_calendar_event(
        db,
        family_id=family_id,
        event_id=event_id,
        current_user_id=ctx.user_id,
        role=role,
        body=body,
    )
    return to_calendar_event_response(updated)


@router.delete("/{family_id}/calendar/events/{event_id}", status_code=204)
async def delete_calendar_event_endpoint(
    family_id: UUID,
    event_id: UUID,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    if not ctx.has_family_access(family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this family",
        )

    role = await get_family_role_for_user(db, family_id=family_id, user_id=ctx.user_id)
    await delete_calendar_event(
        db,
        family_id=family_id,
        event_id=event_id,
        current_user_id=ctx.user_id,
        role=role,
    )


@router.get("/{family_id}/calendar/widgets/upcoming", response_model=UpcomingEventsWidgetResponse)
async def get_upcoming_events_widget(
    family_id: UUID,
    limit: int = Query(default=5, ge=1, le=20),
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> UpcomingEventsWidgetResponse:
    if not ctx.has_family_access(family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this family",
        )

    now = datetime.now(tz=UTC)
    role = await get_family_role_for_user(db, family_id=family_id, user_id=ctx.user_id)
    aggregated_events = await list_aggregated_events(
        db,
        family_id=family_id,
        current_user_id=ctx.user_id,
        role=role,
        start_at_from=now,
        start_at_to=now.replace(year=now.year + 1),
    )

    upcoming = [
        UpcomingCalendarEventResponse(
            id=event.id,
            title=event.title,
            start_at=event.start_at,
            end_at=event.end_at,
            all_day=event.all_day,
            tagged_user_ids=event.tagged_user_ids,
            source_type=event.source_type,
            source_label=event.source_label,
            member_user_id=event.member_user_id,
        )
        for event in aggregated_events[:limit]
    ]

    return UpcomingEventsWidgetResponse(family_id=family_id, events=upcoming)


@router.get(
    "/{family_id}/calendar/integrations",
    response_model=ExternalCalendarFeedsListResponse,
)
async def list_calendar_integrations(
    family_id: UUID,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> ExternalCalendarFeedsListResponse:
    if not ctx.has_family_access(family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this family",
        )

    feeds = await list_external_calendar_feeds(db, family_id=family_id)
    member_ids = [feed.member_user_id for feed in feeds]
    email_by_user_id: dict[UUID, str] = {}
    if member_ids:
        users_result = await db.execute(select(User.id, User.email).where(User.id.in_(member_ids)))
        email_by_user_id = {user_id: email for user_id, email in users_result.all()}

    return ExternalCalendarFeedsListResponse(
        feeds=[
            to_external_calendar_feed_response(
                feed=feed,
                member_email=email_by_user_id.get(feed.member_user_id, ""),
            )
            for feed in feeds
        ]
    )


@router.post(
    "/{family_id}/calendar/integrations",
    response_model=ExternalCalendarFeedResponse,
)
async def create_calendar_integration(
    family_id: UUID,
    body: ExternalCalendarFeedCreateRequest,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> ExternalCalendarFeedResponse:
    if not ctx.has_family_access(family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this family",
        )

    role = await get_family_role_for_user(db, family_id=family_id, user_id=ctx.user_id)
    created = await create_external_calendar_feed(
        db,
        family_id=family_id,
        role=role,
        body=body,
    )

    user_result = await db.execute(select(User.email).where(User.id == created.member_user_id))
    member_email = user_result.scalar_one_or_none() or ""

    return to_external_calendar_feed_response(feed=created, member_email=member_email)


@router.patch(
    "/{family_id}/calendar/integrations/{integration_id}",
    response_model=ExternalCalendarFeedResponse,
)
async def update_calendar_integration(
    family_id: UUID,
    integration_id: UUID,
    body: ExternalCalendarFeedUpdateRequest,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> ExternalCalendarFeedResponse:
    if not ctx.has_family_access(family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this family",
        )

    role = await get_family_role_for_user(db, family_id=family_id, user_id=ctx.user_id)
    updated = await update_external_calendar_feed(
        db,
        family_id=family_id,
        integration_id=integration_id,
        role=role,
        body=body,
    )

    user_result = await db.execute(select(User.email).where(User.id == updated.member_user_id))
    member_email = user_result.scalar_one_or_none() or ""

    return to_external_calendar_feed_response(feed=updated, member_email=member_email)


@router.delete("/{family_id}/calendar/integrations/{integration_id}", status_code=204)
async def delete_calendar_integration(
    family_id: UUID,
    integration_id: UUID,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    if not ctx.has_family_access(family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this family",
        )

    role = await get_family_role_for_user(db, family_id=family_id, user_id=ctx.user_id)
    await delete_external_calendar_feed(
        db,
        family_id=family_id,
        integration_id=integration_id,
        role=role,
    )

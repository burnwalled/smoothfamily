from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.context import AuthContext, get_current_context
from app.calendar.models import CalendarEvent
from app.calendar.schemas import (
    CalendarEventResponse,
    CalendarEventsListResponse,
    CalendarEventUpsertRequest,
    UpcomingCalendarEventResponse,
    UpcomingEventsWidgetResponse,
)
from app.calendar.service import (
    create_calendar_event,
    delete_calendar_event,
    get_family_role_for_user,
    list_visible_events,
    update_calendar_event,
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
    return CalendarEventsListResponse(events=[to_calendar_event_response(event) for event in events])


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
    events = await list_visible_events(
        db,
        family_id=family_id,
        current_user_id=ctx.user_id,
        start_at_from=now,
        start_at_to=None,
    )

    upcoming = [
        UpcomingCalendarEventResponse(
            id=event.id,
            title=event.title,
            start_at=event.start_at,
            end_at=event.end_at,
            all_day=event.all_day,
            tagged_user_ids=[member.user_id for member in event.tagged_members],
        )
        for event in events[:limit]
    ]

    return UpcomingEventsWidgetResponse(family_id=family_id, events=upcoming)

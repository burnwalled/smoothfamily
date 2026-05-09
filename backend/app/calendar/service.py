import hashlib
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from urllib.parse import urlparse
from uuid import UUID

import httpx
from fastapi import HTTPException, status
from icalendar import Calendar
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.calendar.models import (
    CalendarEvent,
    CalendarEventHiddenMember,
    CalendarEventMember,
    ExternalCalendarFeed,
)
from app.calendar.schemas import (
    CalendarEventUpsertRequest,
    ExternalCalendarFeedCreateRequest,
    ExternalCalendarFeedUpdateRequest,
)
from app.families.models import UserFamilyMembership
from app.families.rbac import resolve_effective_family_role


@dataclass(frozen=True)
class CalendarPermissions:
    can_manage_any_event: bool
    can_create_hidden_events: bool
    can_manage_calendar_integrations: bool


@dataclass(frozen=True)
class AggregatedCalendarEvent:
    id: str
    source_type: str
    source_label: str
    member_user_id: UUID | None
    source_color_hex: str | None
    title: str
    description: str | None
    location: str | None
    start_at: datetime
    end_at: datetime
    all_day: bool
    is_hidden: bool
    can_edit: bool
    family_event_id: UUID | None
    tagged_user_ids: list[UUID]
    hidden_for_user_ids: list[UUID]


_external_feed_cache: dict[UUID, tuple[datetime, list[AggregatedCalendarEvent]]] = {}
_external_feed_cache_ttl = timedelta(minutes=15)


def permissions_for_calendar_role(role: str) -> CalendarPermissions:
    if role == "child":
        return CalendarPermissions(
            can_manage_any_event=False,
            can_create_hidden_events=False,
            can_manage_calendar_integrations=False,
        )
    return CalendarPermissions(
        can_manage_any_event=True,
        can_create_hidden_events=True,
        can_manage_calendar_integrations=True,
    )


def validate_ical_url_format(ical_url: str) -> None:
    parsed = urlparse(ical_url.strip())
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="iCal URL must use http or https",
        )
    if not parsed.netloc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid iCal URL",
        )


async def validate_ical_feed_reachable(ical_url: str) -> None:
    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            response = await client.get(ical_url)
            response.raise_for_status()
        Calendar.from_ical(response.text)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Unable to validate iCal feed URL",
        )


def ensure_can_manage_integrations(role: str) -> None:
    permissions = permissions_for_calendar_role(role)
    if not permissions.can_manage_calendar_integrations:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to manage calendar integrations",
        )


def _to_utc_datetime(value: date | datetime) -> tuple[datetime, bool]:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC), False
        return value.astimezone(UTC), False
    return datetime.combine(value, time(0, 0), tzinfo=UTC), True


def _iter_external_events_from_calendar(
    *,
    feed: ExternalCalendarFeed,
    calendar_text: str,
    member_color_hex: str | None,
    start_at_from: datetime | None,
    start_at_to: datetime | None,
) -> list[AggregatedCalendarEvent]:
    calendar = Calendar.from_ical(calendar_text)
    events: list[AggregatedCalendarEvent] = []
    for component in calendar.walk("VEVENT"):
        dtstart_raw = component.get("dtstart")
        if dtstart_raw is None:
            continue

        dtend_raw = component.get("dtend")
        start_at, all_day = _to_utc_datetime(dtstart_raw.dt)
        if dtend_raw is None:
            end_at = start_at if not all_day else start_at + timedelta(days=1)
        else:
            end_at, _ = _to_utc_datetime(dtend_raw.dt)

        if start_at_to is not None and start_at > start_at_to:
            continue
        if start_at_from is not None and end_at < start_at_from:
            continue

        title = str(component.get("summary", "(untitled)"))
        uid_value = str(component.get("uid", f"{title}:{start_at.isoformat()}"))
        source_uuid = UUID(uid_value) if _is_uuid(uid_value) else feed.id
        stable_id = hashlib.sha256(
            f"{feed.id}:{source_uuid}:{start_at.isoformat()}:{end_at.isoformat()}".encode()
        ).hexdigest()[:24]

        events.append(
            AggregatedCalendarEvent(
                id=f"external-{stable_id}",
                source_type="external",
                source_label=feed.display_name,
                member_user_id=feed.member_user_id,
                source_color_hex=member_color_hex,
                title=title,
                description=str(component.get("description"))
                if component.get("description")
                else None,
                location=str(component.get("location")) if component.get("location") else None,
                start_at=start_at,
                end_at=end_at,
                all_day=all_day,
                is_hidden=False,
                can_edit=False,
                family_event_id=None,
                tagged_user_ids=[],
                hidden_for_user_ids=[],
            )
        )

    return events


def _is_uuid(value: str) -> bool:
    try:
        UUID(value)
        return True
    except ValueError:
        return False


async def _load_external_events_for_feed(
    *,
    feed: ExternalCalendarFeed,
    member_color_hex: str | None,
    start_at_from: datetime | None,
    start_at_to: datetime | None,
) -> list[AggregatedCalendarEvent]:
    now = datetime.now(tz=UTC)
    cached = _external_feed_cache.get(feed.id)
    if cached and cached[0] > now:
        return cached[1]

    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            response = await client.get(feed.ical_url)
            response.raise_for_status()

        feed_events = _iter_external_events_from_calendar(
            feed=feed,
            calendar_text=response.text,
            member_color_hex=member_color_hex,
            start_at_from=start_at_from,
            start_at_to=start_at_to,
        )
        _external_feed_cache[feed.id] = (now + _external_feed_cache_ttl, feed_events)
        return feed_events
    except Exception:
        return []


def can_modify_event(*, role: str, current_user_id: UUID, creator_user_id: UUID) -> bool:
    permissions = permissions_for_calendar_role(role)
    if permissions.can_manage_any_event:
        return True
    return current_user_id == creator_user_id


async def get_family_role_for_user(
    db: AsyncSession,
    *,
    family_id: UUID,
    user_id: UUID,
) -> str:
    membership_result = await db.execute(
        select(UserFamilyMembership).where(
            UserFamilyMembership.family_id == family_id,
            UserFamilyMembership.user_id == user_id,
        )
    )
    membership = membership_result.scalar_one_or_none()
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this family"
        )

    owner_result = await db.execute(
        select(UserFamilyMembership.user_id).where(
            UserFamilyMembership.family_id == family_id,
            UserFamilyMembership.role == "owner",
        )
    )
    owner_user_id = owner_result.scalar_one_or_none() or membership.user_id

    return resolve_effective_family_role(
        family_owner_user_id=owner_user_id,
        user_id=user_id,
        membership_role=membership.role,
    )


async def list_family_member_ids(db: AsyncSession, family_id: UUID) -> set[UUID]:
    result = await db.execute(
        select(UserFamilyMembership.user_id).where(UserFamilyMembership.family_id == family_id)
    )
    return set(result.scalars().all())


def validate_tagged_members(*, family_member_ids: set[UUID], tagged_user_ids: list[UUID]) -> None:
    unknown_member_ids = [
        member_id for member_id in tagged_user_ids if member_id not in family_member_ids
    ]
    if unknown_member_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="tagged_user_ids contains users outside this family",
        )


def validate_hidden_members(
    *, family_member_ids: set[UUID], hidden_for_user_ids: list[UUID]
) -> None:
    unknown_member_ids = [
        member_id for member_id in hidden_for_user_ids if member_id not in family_member_ids
    ]
    if unknown_member_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="hidden_for_user_ids contains users outside this family",
        )


async def get_calendar_event_or_404(
    db: AsyncSession,
    *,
    family_id: UUID,
    event_id: UUID,
) -> CalendarEvent:
    result = await db.execute(
        select(CalendarEvent)
        .options(
            selectinload(CalendarEvent.tagged_members),
            selectinload(CalendarEvent.hidden_for_members),
        )
        .where(
            CalendarEvent.id == event_id,
            CalendarEvent.family_id == family_id,
        )
    )
    event = result.scalar_one_or_none()
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event not found")
    return event


async def list_visible_events(
    db: AsyncSession,
    *,
    family_id: UUID,
    current_user_id: UUID,
    start_at_from: datetime | None,
    start_at_to: datetime | None,
) -> list[CalendarEvent]:
    query = (
        select(CalendarEvent)
        .options(
            selectinload(CalendarEvent.tagged_members),
            selectinload(CalendarEvent.hidden_for_members),
        )
        .where(CalendarEvent.family_id == family_id)
        .order_by(CalendarEvent.start_at.asc())
    )
    if start_at_from is not None:
        query = query.where(CalendarEvent.start_at >= start_at_from)
    if start_at_to is not None:
        query = query.where(CalendarEvent.start_at <= start_at_to)

    result = await db.execute(query)
    events = list(result.scalars().all())

    visible_events: list[CalendarEvent] = []
    for event in events:
        hidden_user_ids = {hidden_member.user_id for hidden_member in event.hidden_for_members}
        if current_user_id in hidden_user_ids:
            continue
        visible_events.append(event)

    return visible_events


async def create_calendar_event(
    db: AsyncSession,
    *,
    family_id: UUID,
    creator_user_id: UUID,
    role: str,
    body: CalendarEventUpsertRequest,
) -> CalendarEvent:
    permissions = permissions_for_calendar_role(role)
    if body.hidden_for_user_ids and not permissions.can_create_hidden_events:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to create hidden events",
        )

    family_member_ids = await list_family_member_ids(db, family_id)
    validate_tagged_members(
        family_member_ids=family_member_ids, tagged_user_ids=body.tagged_user_ids
    )
    validate_hidden_members(
        family_member_ids=family_member_ids,
        hidden_for_user_ids=body.hidden_for_user_ids,
    )

    event = CalendarEvent(
        family_id=family_id,
        creator_user_id=creator_user_id,
        title=body.title.strip(),
        description=body.description,
        location=body.location,
        start_at=body.start_at,
        end_at=body.end_at,
        all_day=body.all_day,
        is_hidden=bool(body.hidden_for_user_ids),
    )
    db.add(event)
    await db.flush()

    db.add_all(
        [
            CalendarEventMember(event_id=event.id, user_id=user_id)
            for user_id in set(body.tagged_user_ids)
        ]
    )
    db.add_all(
        [
            CalendarEventHiddenMember(event_id=event.id, user_id=user_id)
            for user_id in set(body.hidden_for_user_ids)
        ]
    )
    await db.flush()

    return await get_calendar_event_or_404(db, family_id=family_id, event_id=event.id)


async def update_calendar_event(
    db: AsyncSession,
    *,
    family_id: UUID,
    event_id: UUID,
    current_user_id: UUID,
    role: str,
    body: CalendarEventUpsertRequest,
) -> CalendarEvent:
    event = await get_calendar_event_or_404(db, family_id=family_id, event_id=event_id)
    if not can_modify_event(
        role=role,
        current_user_id=current_user_id,
        creator_user_id=event.creator_user_id,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions"
        )

    permissions = permissions_for_calendar_role(role)
    if body.hidden_for_user_ids and not permissions.can_create_hidden_events:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to create hidden events",
        )

    family_member_ids = await list_family_member_ids(db, family_id)
    validate_tagged_members(
        family_member_ids=family_member_ids, tagged_user_ids=body.tagged_user_ids
    )
    validate_hidden_members(
        family_member_ids=family_member_ids,
        hidden_for_user_ids=body.hidden_for_user_ids,
    )

    event.title = body.title.strip()
    event.description = body.description
    event.location = body.location
    event.start_at = body.start_at
    event.end_at = body.end_at
    event.all_day = body.all_day
    event.is_hidden = bool(body.hidden_for_user_ids)
    event.updated_at = datetime.now(tz=UTC)

    await db.execute(delete(CalendarEventMember).where(CalendarEventMember.event_id == event.id))
    await db.execute(
        delete(CalendarEventHiddenMember).where(CalendarEventHiddenMember.event_id == event.id)
    )
    await db.flush()

    db.add_all(
        [
            CalendarEventMember(event_id=event.id, user_id=user_id)
            for user_id in set(body.tagged_user_ids)
        ]
    )
    db.add_all(
        [
            CalendarEventHiddenMember(event_id=event.id, user_id=user_id)
            for user_id in set(body.hidden_for_user_ids)
        ]
    )
    await db.flush()

    return await get_calendar_event_or_404(db, family_id=family_id, event_id=event.id)


async def delete_calendar_event(
    db: AsyncSession,
    *,
    family_id: UUID,
    event_id: UUID,
    current_user_id: UUID,
    role: str,
) -> None:
    event = await get_calendar_event_or_404(db, family_id=family_id, event_id=event_id)
    if not can_modify_event(
        role=role,
        current_user_id=current_user_id,
        creator_user_id=event.creator_user_id,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions"
        )

    await db.delete(event)


async def list_external_calendar_feeds(
    db: AsyncSession,
    *,
    family_id: UUID,
) -> list[ExternalCalendarFeed]:
    result = await db.execute(
        select(ExternalCalendarFeed)
        .where(ExternalCalendarFeed.family_id == family_id)
        .order_by(ExternalCalendarFeed.created_at.desc())
    )
    return list(result.scalars().all())


async def create_external_calendar_feed(
    db: AsyncSession,
    *,
    family_id: UUID,
    role: str,
    body: ExternalCalendarFeedCreateRequest,
) -> ExternalCalendarFeed:
    ensure_can_manage_integrations(role)
    validate_ical_url_format(body.ical_url)

    family_member_ids = await list_family_member_ids(db, family_id)
    if body.member_user_id not in family_member_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="member_user_id does not belong to this family",
        )

    await validate_ical_feed_reachable(body.ical_url)

    feed = ExternalCalendarFeed(
        family_id=family_id,
        member_user_id=body.member_user_id,
        provider=body.provider.strip().lower(),
        display_name=body.display_name.strip(),
        ical_url=body.ical_url.strip(),
        color_hex=body.color_hex,
        enabled=True,
        last_fetched_at=datetime.now(tz=UTC),
        last_fetch_status="active",
        last_error_message=None,
    )
    db.add(feed)
    await db.flush()
    await db.refresh(feed)
    return feed


async def update_external_calendar_feed(
    db: AsyncSession,
    *,
    family_id: UUID,
    integration_id: UUID,
    role: str,
    body: ExternalCalendarFeedUpdateRequest,
) -> ExternalCalendarFeed:
    ensure_can_manage_integrations(role)
    result = await db.execute(
        select(ExternalCalendarFeed).where(
            ExternalCalendarFeed.id == integration_id,
            ExternalCalendarFeed.family_id == family_id,
        )
    )
    feed = result.scalar_one_or_none()
    if feed is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Integration not found")

    if "display_name" in body.model_fields_set and body.display_name is not None:
        feed.display_name = body.display_name.strip()
    if "color_hex" in body.model_fields_set:
        feed.color_hex = body.color_hex
    if "enabled" in body.model_fields_set and body.enabled is not None:
        feed.enabled = body.enabled

    _external_feed_cache.pop(feed.id, None)

    await db.flush()
    await db.refresh(feed)
    return feed


async def delete_external_calendar_feed(
    db: AsyncSession,
    *,
    family_id: UUID,
    integration_id: UUID,
    role: str,
) -> None:
    ensure_can_manage_integrations(role)
    result = await db.execute(
        select(ExternalCalendarFeed).where(
            ExternalCalendarFeed.id == integration_id,
            ExternalCalendarFeed.family_id == family_id,
        )
    )
    feed = result.scalar_one_or_none()
    if feed is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Integration not found")

    await db.delete(feed)
    await db.flush()


async def list_aggregated_events(
    db: AsyncSession,
    *,
    family_id: UUID,
    current_user_id: UUID,
    role: str,
    start_at_from: datetime | None,
    start_at_to: datetime | None,
) -> list[AggregatedCalendarEvent]:
    family_events = await list_visible_events(
        db,
        family_id=family_id,
        current_user_id=current_user_id,
        start_at_from=start_at_from,
        start_at_to=start_at_to,
    )

    can_manage_any = permissions_for_calendar_role(role).can_manage_any_event
    internal_events = [
        AggregatedCalendarEvent(
            id=f"family-{event.id}",
            source_type="family",
            source_label="Family",
            member_user_id=event.creator_user_id,
            source_color_hex=None,
            title=event.title,
            description=event.description,
            location=event.location,
            start_at=event.start_at,
            end_at=event.end_at,
            all_day=event.all_day,
            is_hidden=event.is_hidden,
            can_edit=can_manage_any or event.creator_user_id == current_user_id,
            family_event_id=event.id,
            tagged_user_ids=[member.user_id for member in event.tagged_members],
            hidden_for_user_ids=[member.user_id for member in event.hidden_for_members],
        )
        for event in family_events
    ]

    color_result = await db.execute(
        select(UserFamilyMembership.user_id, UserFamilyMembership.color_hex).where(
            UserFamilyMembership.family_id == family_id
        )
    )
    member_color_by_user_id = {user_id: color_hex for user_id, color_hex in color_result.all()}

    feeds = await list_external_calendar_feeds(db, family_id=family_id)
    external_events: list[AggregatedCalendarEvent] = []
    for feed in feeds:
        if not feed.enabled:
            continue
        color = feed.color_hex or member_color_by_user_id.get(feed.member_user_id)
        external_events.extend(
            await _load_external_events_for_feed(
                feed=feed,
                member_color_hex=color,
                start_at_from=start_at_from,
                start_at_to=start_at_to,
            )
        )

    combined = internal_events + external_events
    deduped_by_key: dict[str, AggregatedCalendarEvent] = {}
    for event in combined:
        dedupe_key = (
            f"{event.title.strip().lower()}:{event.start_at.isoformat()}:{event.end_at.isoformat()}"
        )
        if dedupe_key not in deduped_by_key:
            deduped_by_key[dedupe_key] = event
            continue
        if deduped_by_key[dedupe_key].source_type == "external" and event.source_type == "family":
            deduped_by_key[dedupe_key] = event

    return sorted(deduped_by_key.values(), key=lambda event: event.start_at)

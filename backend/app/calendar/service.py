import base64
import hashlib
from dataclasses import dataclass
from datetime import UTC, datetime
from urllib.parse import urlparse
from uuid import UUID

import httpx
from cryptography.fernet import Fernet
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
from app.calendar.schemas import CalendarEventUpsertRequest, ExternalCalendarFeedCreateRequest
from app.core.settings import get_settings
from app.families.models import UserFamilyMembership
from app.families.rbac import resolve_effective_family_role


@dataclass(frozen=True)
class CalendarPermissions:
    can_manage_any_event: bool
    can_create_hidden_events: bool
    can_manage_calendar_integrations: bool


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


def _build_fernet() -> Fernet:
    raw_key = get_settings().FIELD_ENCRYPTION_KEY.get_secret_value()
    try:
        return Fernet(raw_key.encode("utf-8"))
    except ValueError:
        derived_bytes = hashlib.sha256(raw_key.encode("utf-8")).digest()
        derived_key = base64.urlsafe_b64encode(derived_bytes)
        return Fernet(derived_key)


def encrypt_ical_url(ical_url: str) -> str:
    fernet = _build_fernet()
    return fernet.encrypt(ical_url.encode("utf-8")).decode("utf-8")


def decrypt_ical_url(value: str) -> str:
    fernet = _build_fernet()
    return fernet.decrypt(value.encode("utf-8")).decode("utf-8")


def mask_ical_url(ical_url: str) -> str:
    if len(ical_url) <= 20:
        return "***"
    return f"{ical_url[:16]}...{ical_url[-8:]}"


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
    except (httpx.HTTPError, ValueError):
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
        ical_url_encrypted=encrypt_ical_url(body.ical_url.strip()),
        enabled=True,
        last_fetched_at=datetime.now(tz=UTC),
        last_fetch_status="active",
        last_error_message=None,
    )
    db.add(feed)
    await db.flush()
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

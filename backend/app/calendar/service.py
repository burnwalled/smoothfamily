from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.calendar.models import CalendarEvent, CalendarEventHiddenMember, CalendarEventMember
from app.calendar.schemas import CalendarEventUpsertRequest
from app.families.models import UserFamilyMembership
from app.families.rbac import resolve_effective_family_role


@dataclass(frozen=True)
class CalendarPermissions:
    can_manage_any_event: bool
    can_create_hidden_events: bool


def permissions_for_calendar_role(role: str) -> CalendarPermissions:
    if role == "child":
        return CalendarPermissions(
            can_manage_any_event=False,
            can_create_hidden_events=False,
        )
    return CalendarPermissions(
        can_manage_any_event=True,
        can_create_hidden_events=True,
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
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this family")

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
    unknown_member_ids = [member_id for member_id in tagged_user_ids if member_id not in family_member_ids]
    if unknown_member_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="tagged_user_ids contains users outside this family",
        )


def validate_hidden_members(*, family_member_ids: set[UUID], hidden_for_user_ids: list[UUID]) -> None:
    unknown_member_ids = [member_id for member_id in hidden_for_user_ids if member_id not in family_member_ids]
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
    validate_tagged_members(family_member_ids=family_member_ids, tagged_user_ids=body.tagged_user_ids)
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
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

    permissions = permissions_for_calendar_role(role)
    if body.hidden_for_user_ids and not permissions.can_create_hidden_events:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to create hidden events",
        )

    family_member_ids = await list_family_member_ids(db, family_id)
    validate_tagged_members(family_member_ids=family_member_ids, tagged_user_ids=body.tagged_user_ids)
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
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

    await db.delete(event)

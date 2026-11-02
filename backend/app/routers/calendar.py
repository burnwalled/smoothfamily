"""Shared family calendar: read-only iCal feed subscriptions plus events created in the app."""
import secrets
import uuid
from datetime import date, datetime, time, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.deps import DB, CurrentUser, require_app
from app.models import AppSetting, CalendarFeed, EventPlan, FamilyEvent, PackingList, User
from app.schemas import EventOut, FamilyEventIn, FamilyEventOut, FeedCreate, FeedOut, FeedUpdate, ICalTokenOut, PackingItem, PackTask
from app.services.packing_tasks import drop_pack_tasks, set_pack_tasks
from app.services.calendar_view import attach_plans, events_between, feed_visibility, title_key, utc
from app.services.notifications import run_calendar_reminders
from app.services.public_url import configured_url

router = APIRouter(prefix="/api/calendar", tags=["calendar"], dependencies=[require_app("calendar")])
# The subscription feed signs in with its token, not a session, so it has no app check.
ical_router = APIRouter(prefix="/api/calendar", tags=["calendar"])


@router.get("/feeds", response_model=list[FeedOut])
async def list_feeds(user: CurrentUser, db: DB) -> list[CalendarFeed]:
    result = await db.execute(
        select(CalendarFeed)
        .where(CalendarFeed.family_id == user.family_id)
        .order_by(CalendarFeed.created_at)
    )
    return list(result.scalars().all())


async def _family_member(db, user, member_id: uuid.UUID | None) -> uuid.UUID | None:
    if member_id is None:
        return None
    member = await db.get(User, member_id)
    if member is None or member.family_id != user.family_id:
        raise HTTPException(status_code=422, detail="Not a member of the family")
    return member.id


@router.post("/feeds", response_model=FeedOut, status_code=status.HTTP_201_CREATED)
async def create_feed(payload: FeedCreate, user: CurrentUser, db: DB) -> CalendarFeed:
    if not payload.url.startswith(("https://", "http://", "webcal://")):
        raise HTTPException(status_code=422, detail="URL must start with https://, http:// or webcal://")
    feed = CalendarFeed(
        family_id=user.family_id,
        created_by=user.id,
        name=payload.name,
        url=payload.url,
        color=payload.color,
        visible_to=[str(uid) for uid in payload.visible_to],
        details_for=[str(uid) for uid in payload.details_for],
        member_id=await _family_member(db, user, payload.member_id),
    )
    db.add(feed)
    await db.commit()
    await db.refresh(feed)
    return feed


@router.patch("/feeds/{feed_id}", response_model=FeedOut)
async def update_feed(feed_id: uuid.UUID, payload: FeedUpdate, user: CurrentUser, db: DB) -> CalendarFeed:
    feed = await db.get(CalendarFeed, feed_id)
    if feed is None or feed.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Calendar feed not found")

    if payload.name is not None:
        feed.name = payload.name
    if payload.color is not None:
        feed.color = payload.color
    if payload.visible_to is not None:
        feed.visible_to = [str(uid) for uid in payload.visible_to]
    if payload.details_for is not None:
        feed.details_for = [str(uid) for uid in payload.details_for]
    if "member_id" in payload.model_fields_set:
        feed.member_id = await _family_member(db, user, payload.member_id)

    await db.commit()
    await db.refresh(feed)
    return feed


@router.delete("/feeds/{feed_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_feed(feed_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    feed = await db.get(CalendarFeed, feed_id)
    if feed is None or feed.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Calendar feed not found")
    await db.delete(feed)
    await db.commit()


_utc = utc


async def _valid_member_ids(db, family_id: uuid.UUID, member_ids: list[uuid.UUID]) -> list[str]:
    wanted = set(member_ids)
    if not wanted:
        return []
    found = (
        await db.execute(select(User.id).where(User.family_id == family_id, User.id.in_(wanted)))
    ).scalars().all()
    if len(found) != len(wanted):
        raise HTTPException(status_code=422, detail="Unknown family member")
    return list(dict.fromkeys(str(uid) for uid in member_ids))  # unique, in the order given


def _apply_event(event: FamilyEvent, payload: FamilyEventIn) -> None:
    start, end = _utc(payload.start), _utc(payload.end)
    if payload.all_day:
        # Whole days: midnight UTC, exclusive end, at least one day long.
        start = datetime.combine(start.date(), time.min, tzinfo=timezone.utc)
        end = max(datetime.combine(end.date(), time.min, tzinfo=timezone.utc), start + timedelta(days=1))
    elif end < start:
        raise HTTPException(status_code=422, detail="The event cannot end before it starts")
    event.title = payload.title.strip()
    event.start = start
    event.end = end
    event.all_day = payload.all_day
    event.location = (payload.location or "").strip() or None
    event.description = (payload.description or "").strip() or None
    event.color = payload.color


async def _get_own_family_event(event_id: uuid.UUID, user: User, db) -> FamilyEvent:
    event = await db.get(FamilyEvent, event_id)
    if event is None or event.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Event not found")
    if event.created_by != user.id and user.role not in {"admin", "adult"}:
        raise HTTPException(status_code=403, detail="Only the creator or an adult can change this event")
    return event


@router.post("/family-events", response_model=FamilyEventOut, status_code=status.HTTP_201_CREATED)
async def create_family_event(payload: FamilyEventIn, user: CurrentUser, db: DB) -> FamilyEvent:
    event = FamilyEvent(family_id=user.family_id, created_by=user.id)
    _apply_event(event, payload)
    event.member_ids = await _valid_member_ids(db, user.family_id, payload.member_ids)
    db.add(event)
    await db.commit()
    await db.refresh(event)
    return event


@router.put("/family-events/{event_id}", response_model=FamilyEventOut)
async def update_family_event(event_id: uuid.UUID, payload: FamilyEventIn, user: CurrentUser, db: DB) -> FamilyEvent:
    event = await _get_own_family_event(event_id, user, db)
    _apply_event(event, payload)
    event.member_ids = await _valid_member_ids(db, user.family_id, payload.member_ids)
    await db.commit()
    await db.refresh(event)
    return event


@router.delete("/family-events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_family_event(event_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    event = await _get_own_family_event(event_id, user, db)
    await drop_pack_tasks(db, user.family_id, event_key=f"app:{event.id}")
    await db.delete(event)
    await db.commit()


@router.get("/events", response_model=list[EventOut])
async def list_events(start: date, end: date, user: CurrentUser, db: DB) -> list[EventOut]:
    if end < start or (end - start).days > 62:
        raise HTTPException(status_code=422, detail="Invalid date range (max 62 days)")
    return await events_between(db, user, start, end)


# --- Who drives and packing lists (#53) ----------------------------------------------------


class PlanTarget(BaseModel):
    """The event occurrence, as the calendar listed it."""

    key: str = Field(max_length=400, pattern=r"^(app|feed):")
    title: str = Field(min_length=1, max_length=200)
    start: datetime


class RideIn(PlanTarget):
    leg: Literal["drop_off", "pick_up"]
    claim: bool


class NeedsRideIn(PlanTarget):
    needs: bool


class PackingCheckIn(PlanTarget):
    item: str = Field(min_length=1, max_length=120)
    done: bool


class PackingListIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    items: list[str] = Field(default=[], max_length=40)


class PlanOut(BaseModel):
    key: str
    needs_ride: bool
    drop_off_by: uuid.UUID | None
    pick_up_by: uuid.UUID | None
    packing: list[PackingItem]
    pack_tasks: list[PackTask] = []


class PackTaskIn(PlanTarget):
    day: date | None = None
    member_ids: list[uuid.UUID] = Field(default=[], max_length=20)
    points: int = Field(default=10, ge=0, le=100)


async def _check_target(db, user: User, target: PlanTarget) -> None:
    """The key must name an event this member can see in detail."""
    parts = target.key.split(":")
    try:
        ref = uuid.UUID(parts[1])
    except (IndexError, ValueError):
        raise HTTPException(status_code=422, detail="Unknown event")
    if parts[0] == "app":
        event = await db.get(FamilyEvent, ref)
        if event is None or event.family_id != user.family_id or len(parts) != 2:
            raise HTTPException(status_code=404, detail="Event not found")
        return
    feed = await db.get(CalendarFeed, ref)
    if feed is None or feed.family_id != user.family_id or feed_visibility(feed, user) != (True, True):
        raise HTTPException(status_code=404, detail="Event not found")


async def _plan(db, user: User, target: PlanTarget) -> EventPlan:
    await _check_target(db, user, target)
    plan = (
        await db.execute(select(EventPlan).where(EventPlan.family_id == user.family_id, EventPlan.key == target.key))
    ).scalar_one_or_none()
    if plan is None:
        plan = EventPlan(family_id=user.family_id, key=target.key, checked=[])
        db.add(plan)
    plan.title = target.title.strip()
    plan.start = _utc(target.start)
    return plan


async def _plan_out(db, user: User, plan: EventPlan) -> PlanOut:
    await db.commit()
    probe = EventOut(feed_name="", color="", title=plan.title, start=plan.start, end=plan.start, all_day=False, key=plan.key)
    [event] = await attach_plans(db, user.family_id, [probe])
    return PlanOut(key=plan.key, needs_ride=event.needs_ride, drop_off_by=event.drop_off_by, pick_up_by=event.pick_up_by, packing=event.packing, pack_tasks=event.pack_tasks)


@router.post("/plan/ride", response_model=PlanOut)
async def claim_ride(payload: RideIn, user: CurrentUser, db: DB) -> PlanOut:
    """"I'm driving" / "I'll pick up" – or let go of it again."""
    if user.role == "child":
        raise HTTPException(status_code=403, detail="Only adults can drive")
    plan = await _plan(db, user, payload)
    column = "drop_off_by" if payload.leg == "drop_off" else "pick_up_by"
    current = getattr(plan, column)
    if payload.claim:
        if current is not None and current != user.id:
            raise HTTPException(status_code=409, detail="Someone else has already taken it")
        setattr(plan, column, user.id)
        plan.needs_ride = True
    else:
        setattr(plan, column, None)
    return await _plan_out(db, user, plan)


@router.post("/plan/needs-ride", response_model=PlanOut)
async def set_needs_ride(payload: NeedsRideIn, user: CurrentUser, db: DB) -> PlanOut:
    """Mark that someone needs to drive (and pick up), so the adults get asked the day before."""
    plan = await _plan(db, user, payload)
    plan.needs_ride = payload.needs
    if payload.needs:
        plan.ride_alerted_at = None
    return await _plan_out(db, user, plan)


@router.post("/plan/check", response_model=PlanOut)
async def check_packing(payload: PackingCheckIn, user: CurrentUser, db: DB) -> PlanOut:
    plan = await _plan(db, user, payload)
    checked = [item for item in (plan.checked or []) if item != payload.item]
    plan.checked = checked + [payload.item] if payload.done else checked
    return await _plan_out(db, user, plan)


@router.put("/plan/pack-task", response_model=PlanOut)
async def set_pack_task(payload: PackTaskIn, user: CurrentUser, db: DB) -> PlanOut:
    """The day it's time to pack for this occurrence (adults): a task for each one going, with the
    packing list in it. No day = no tasks."""
    if user.role == "child":
        raise HTTPException(status_code=403, detail="Adults choose when to pack")
    plan = await _plan(db, user, payload)
    if payload.day is not None and payload.day > plan.start.date():
        raise HTTPException(status_code=422, detail="Pack before the event")
    members = (await db.execute(select(User.id).where(User.family_id == user.family_id, User.id.in_(payload.member_ids or [uuid.uuid4()])))).scalars().all()
    if len(members) != len(set(payload.member_ids)):
        raise HTTPException(status_code=422, detail="Unknown family member")
    packing = (
        await db.execute(select(PackingList).where(PackingList.family_id == user.family_id, PackingList.title_key == title_key(plan.title)))
    ).scalar_one_or_none()
    await set_pack_tasks(
        db, user, name=plan.title, day=payload.day, member_ids=payload.member_ids, points=payload.points, event_key=plan.key,
        description="\n".join(f"• {item}" for item in packing.items) if packing and packing.items else None,
    )
    return await _plan_out(db, user, plan)


@router.put("/packing", response_model=list[PackingItem])
async def set_packing_list(payload: PackingListIn, user: CurrentUser, db: DB) -> list[PackingItem]:
    """The packing list for every event with this title (e.g. each "Football practice")."""
    key = title_key(payload.title)
    items = list(dict.fromkeys(i.strip()[:120] for i in payload.items if i.strip()))
    packing = (
        await db.execute(select(PackingList).where(PackingList.family_id == user.family_id, PackingList.title_key == key))
    ).scalar_one_or_none()
    if not items:
        if packing is not None:
            await db.delete(packing)
    elif packing is None:
        db.add(PackingList(family_id=user.family_id, title_key=key, items=items))
    else:
        packing.items = items
    await db.commit()
    return [PackingItem(text=item) for item in items]


@router.post("/reminders/run")
async def run_reminders(user: CurrentUser, db: DB) -> dict:
    # Admin-only trigger endpoint intended for a cron/loop runner.
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required")
    return {"sent": await run_calendar_reminders(db)}


@router.get("/ical/token", response_model=ICalTokenOut)
async def get_ical_token(user: CurrentUser, db: DB) -> ICalTokenOut:
    if not user.ical_token:
        user.ical_token = secrets.token_urlsafe(48)
        await db.commit()
        await db.refresh(user)
    external_url = await configured_url(db)
    token_url = f"{external_url}/api/calendar/ical/{user.ical_token}.ics" if external_url else None
    return ICalTokenOut(token=user.ical_token, url=token_url)


@router.post("/ical/token/regenerate", response_model=ICalTokenOut)
async def regenerate_ical_token(user: CurrentUser, db: DB) -> ICalTokenOut:
    user.ical_token = secrets.token_urlsafe(48)
    await db.commit()
    await db.refresh(user)
    external_url = await configured_url(db)
    token_url = f"{external_url}/api/calendar/ical/{user.ical_token}.ics" if external_url else None
    return ICalTokenOut(token=user.ical_token, url=token_url)


@ical_router.get("/ical/{token}.ics", response_class=PlainTextResponse)
async def serve_ical(token: str, db: DB) -> str:
    """Token-authenticated iCal feed (no cookie auth needed): what concerns the member (2.8.4) –
    the whole family's events, those they are in and the rides they drive – as they see the calendar.
    Their own calendar (a feed marked as theirs) is left out: it is already in their phone."""
    user = (await db.execute(select(User).where(User.ical_token == token))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="Not found")

    from icalendar import Calendar, Event as IEvent

    today = date.today()
    own_feeds = {f.id for f in (await db.execute(select(CalendarFeed).where(CalendarFeed.member_id == user.id))).scalars().all()}
    lang = user.language or "en"
    ride = {"en": "Drive", "sv": "Skjutsa", "nb": "Kjør", "da": "Kør", "fi": "Kyyti"}.get(lang, "Drive")

    cal = Calendar()
    cal.add("prodid", "-//Smooth Family//EN")
    cal.add("version", "2.0")
    cal.add("calscale", "GREGORIAN")
    cal.add("x-wr-calname", f"Smooth Family – {user.display_name}")
    cal.add("refresh-interval;value=duration", "PT1H")
    cal.add("x-published-ttl", "PT1H")

    for event in await events_between(db, user, today - timedelta(days=7), today + timedelta(days=365)):
        # The phone's calendar has its own holidays.
        if event.busy or event.holiday or not event.title or (event.feed_id is not None and event.feed_id in own_feeds):
            continue
        drives = user.id in (event.drop_off_by, event.pick_up_by)
        if event.member_ids and user.id not in event.member_ids and not drives:
            continue
        ev = IEvent()
        ev.add("uid", f"{event.key or event.event_id or f'{event.feed_id}-{event.start.isoformat()}'}@smooth-family")
        ev.add("summary", f"🚗 {ride}: {event.title}" if drives and user.id not in event.member_ids else event.title)
        if event.location:
            ev.add("location", event.location)
        if event.description:
            ev.add("description", event.description)
        if event.all_day:
            first = _utc(event.start).date()
            ev.add("dtstart", first)
            ev.add("dtend", max(_utc(event.end).date(), first + timedelta(days=1)))  # DTEND is exclusive
        else:
            ev.add("dtstart", _utc(event.start))
            ev.add("dtend", _utc(event.end))
        cal.add_component(ev)

    return cal.to_ical().decode("utf-8")

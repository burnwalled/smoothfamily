"""The calendar as one member sees it: subscribed iCal feeds (with their visibility rules),
events created in the app and birthdays, plus who drives and the packing list per event.

Used by the calendar, Söndagskollen, the morning summary and the reminders, so they all show
the same events.
"""
import hashlib
import uuid
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CalendarFeed, Document, EventPlan, Trip, Family, FamilyEvent, PackingList, Property, Task, PropertyReminder, User, Vehicle, VehicleReminder
from app.schemas import EventOut, PackingItem, PackTask
from app.services.birthdays import all_day_range, birthday_title, birthdays_between
from app.services.ical import fetch_ical_raw, parse_events


def utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def title_key(title: str) -> str:
    """Packing lists are shared by events with the same title, whatever the case or spacing."""
    return " ".join(title.casefold().split())[:200]


def app_event_key(event_id: uuid.UUID) -> str:
    return f"app:{event_id}"


def feed_event_key(feed_id: uuid.UUID, uid: str, start: datetime) -> str:
    digest = hashlib.sha1(uid.encode()).hexdigest()[:16]
    return f"feed:{feed_id}:{digest}:{utc(start).isoformat()}"


def feed_visibility(feed: CalendarFeed, user: User) -> tuple[bool, bool]:
    """(sees the feed, sees its details) for this member."""
    user_id = str(user.id)
    visible_to = [str(uid) for uid in (feed.visible_to or [])]
    details_for = [str(uid) for uid in (feed.details_for or [])]
    is_owner_or_admin = user.role == "admin" or str(feed.created_by) == user_id
    visible = is_owner_or_admin or not visible_to or user_id in visible_to
    details = is_owner_or_admin or not details_for or user_id in details_for
    return visible, details


async def family_events_between(db: AsyncSession, family_id: uuid.UUID, start: datetime, end: datetime) -> list[FamilyEvent]:
    result = await db.execute(
        select(FamilyEvent)
        .where(
            FamilyEvent.family_id == family_id,
            FamilyEvent.start < end,
            # Overlaps the range; all-day ends are exclusive, zero-length events count at their start.
            or_(FamilyEvent.end > start, FamilyEvent.start >= start),
        )
        .order_by(FamilyEvent.start)
    )
    return list(result.scalars().all())


async def attach_plans(db: AsyncSession, family_id: uuid.UUID, events: list[EventOut]) -> list[EventOut]:
    """Fills in who drives and the packing list (with this occurrence's ticks)."""
    keys = [e.key for e in events if e.key]
    if not keys:
        return events
    plans = {
        p.key: p
        for p in (await db.execute(select(EventPlan).where(EventPlan.family_id == family_id, EventPlan.key.in_(keys)))).scalars()
    }
    lists = {
        p.title_key: p.items or []
        for p in (await db.execute(select(PackingList).where(PackingList.family_id == family_id))).scalars()
    }
    pack = {}
    for task in (await db.execute(select(Task).where(Task.family_id == family_id, Task.event_key.in_(keys), Task.deleted_at.is_(None)).order_by(Task.created_at))).scalars():
        pack.setdefault(task.event_key, []).append(PackTask(task_id=task.id, user_id=task.assignee_id, day=task.due_date, done=not task.active))
    for event in events:
        if not event.key:
            continue
        event.pack_tasks = pack.get(event.key, [])
        plan = plans.get(event.key)
        items = lists.get(title_key(event.title or ""), [])
        checked = set(plan.checked or []) if plan else set()
        event.packing = [PackingItem(text=item, done=item in checked) for item in items]
        if plan:
            event.needs_ride = plan.needs_ride
            event.drop_off_by = plan.drop_off_by
            event.pick_up_by = plan.pick_up_by
    return events


async def events_between(db: AsyncSession, user: User, start: date, end: date, birthdays: bool = True) -> list[EventOut]:
    """Everything on the member's calendar from `start` up to `end` (exclusive), sorted."""
    feeds = (await db.execute(select(CalendarFeed).where(CalendarFeed.family_id == user.family_id))).scalars().all()
    events: list[EventOut] = []
    for feed in feeds:
        visible, details = feed_visibility(feed, user)
        if not visible:
            continue
        try:
            raw = await fetch_ical_raw(feed.url)
            items = parse_events(raw, start, end)
        except Exception:
            # A broken feed must not take down the whole calendar
            continue
        for item in items:
            if details:
                payload = {k: v for k, v in item.items() if k != "uid"}
                event = EventOut(feed_id=feed.id, feed_name=feed.name, color=feed.color, **payload)
                # A member's own calendar: its events are theirs.
                if feed.member_id:
                    event.member_ids = [feed.member_id]
                event.key = feed_event_key(feed.id, item.get("uid") or event.title or "", event.start)
                events.append(event)
            else:
                events.append(
                    EventOut(
                        feed_id=feed.id,
                        feed_name=feed.name,
                        color=feed.color,
                        title=None,
                        start=item["start"],
                        end=item["end"],
                        all_day=item["all_day"],
                        busy=True,
                        member_ids=[feed.member_id] if feed.member_id else [],
                    )
                )

    family = await db.get(Family, user.family_id)
    range_start = datetime.combine(start, time.min, tzinfo=timezone.utc)
    # `end` is exclusive, like the iCal feeds (recurring_ical_events.between).
    range_end = datetime.combine(end, time.min, tzinfo=timezone.utc)
    for event in await family_events_between(db, user.family_id, range_start, range_end):
        events.append(
            EventOut(
                event_id=event.id,
                feed_name=family.name if family else "",
                color=event.color,
                title=event.title,
                start=event.start,
                end=event.end,
                all_day=event.all_day,
                location=event.location,
                description=event.description,
                created_by=event.created_by,
                member_ids=event.member_ids or [],
                key=app_event_key(event.id),
            )
        )
    if birthdays and "birthdays" in user.apps:
        for person, day in await birthdays_between(db, user.family_id, start, end):
            day_start, day_end = all_day_range(day)
            events.append(
                EventOut(
                    birthday_person_id=person.id,
                    feed_name="",
                    color="#D9822B",
                    title=birthday_title(person, day, user.language or "en"),
                    start=day_start,
                    end=day_end,
                    all_day=True,
                )
            )
    if "documents" in user.apps:
        from app.routers.documents import may_see  # the router imports the calendar's helpers

        docs = (
            await db.execute(
                select(Document).where(Document.family_id == user.family_id, Document.expiry_date >= start, Document.expiry_date < end)
            )
        ).scalars().all()
        for doc in docs:
            if await may_see(db, user, doc):
                day_start, day_end = all_day_range(doc.expiry_date)
                events.append(
                    EventOut(document_id=doc.id, feed_name="", color="#8A5A9E", title=f"{doc.title} – {(_NEXT_DOSE if doc.kind == 'vaccination' else _EXPIRES).get(user.language or 'en', 'expires')}", start=day_start, end=day_end, all_day=True)
                )
    if "trips" in user.apps:
        from app.routers.trips import may_see as may_see_trip

        trips = (
            await db.execute(select(Trip).where(Trip.family_id == user.family_id, Trip.start_date < end, Trip.end_date >= start))
        ).scalars().all()
        for trip in trips:
            if may_see_trip(user, trip):
                first, _ = all_day_range(trip.start_date)
                _, last = all_day_range(trip.end_date)
                title = f"{trip.name} – {trip.destination}" if trip.destination else trip.name
                events.append(EventOut(trip_id=trip.id, feed_name="", color="#2B8A8A", title=title, start=first, end=last, all_day=True, member_ids=trip.member_ids or []))
    if "vehicles" in user.apps:
        from app.routers.vehicles import _may_see as may_see_vehicle, kind_label

        reminders = (
            await db.execute(
                select(VehicleReminder, Vehicle)
                .join(Vehicle, Vehicle.id == VehicleReminder.vehicle_id)
                .where(VehicleReminder.family_id == user.family_id, VehicleReminder.due_date >= start, VehicleReminder.due_date < end)
            )
        ).all()
        for reminder, vehicle in reminders:
            if may_see_vehicle(vehicle, user):
                day_start, day_end = all_day_range(reminder.due_date)
                title = f"{kind_label(reminder, user.language or 'en')} – {vehicle.name}"
                events.append(EventOut(vehicle_id=vehicle.id, feed_name="", color="#5A6B8A", title=title, start=day_start, end=day_end, all_day=True))
    if "property" in user.apps:
        upkeep = (
            await db.execute(
                select(PropertyReminder, Property)
                .join(Property, Property.id == PropertyReminder.property_id)
                .where(PropertyReminder.family_id == user.family_id, PropertyReminder.due_date >= start, PropertyReminder.due_date < end)
            )
        ).all()
        for reminder, home in upkeep:
            day_start, day_end = all_day_range(reminder.due_date)
            events.append(EventOut(property_id=home.id, feed_name="", color="#8A6A3B", title=f"{reminder.title} – {home.name}", start=day_start, end=day_end, all_day=True))
    if "calendar" in user.apps:
        events.extend(await custody_events(db, user, start, end))
    events.sort(key=lambda e: utc(e.start))
    return await attach_plans(db, user.family_id, events)


_AWAY = {"en": "{name} at {home}", "sv": "{name} hos {home}", "nb": "{name} hos {home}", "da": "{name} hos {home}", "fi": "{name}: {home}"}
_HANDOVER = {"en": ("{name} to {home}", "{name} home"), "sv": ("{name} till {home}", "{name} hem"), "nb": ("{name} til {home}", "{name} hjem"), "da": ("{name} til {home}", "{name} hjem"), "fi": ("{name}: {home}", "{name} kotiin")}


async def custody_events(db: AsyncSession, user, start: date, end: date) -> list[EventOut]:
    """Two homes: the days a child is in the other home (all-day) and each handover (at its time)."""
    from zoneinfo import ZoneInfo

    from app.routers.custody import family_schedules, periods

    lang = getattr(user, "language", None) or "en"
    zone = ZoneInfo("Europe/Stockholm")
    out: list[EventOut] = []
    for schedule, child, exceptions in await family_schedules(db, user.family_id):
        runs = periods(schedule, exceptions, start - timedelta(days=1), end - timedelta(days=1))
        for first, last, place in runs:
            if place == "other" and last >= start:
                day_start, _ = all_day_range(max(first, start))
                _, day_end = all_day_range(last)
                out.append(EventOut(feed_name="", color=child.color, title=_AWAY.get(lang, _AWAY["en"]).format(name=child.display_name, home=schedule.other_home), start=day_start, end=day_end, all_day=True, member_ids=[child.id]))
            if first >= start and first != runs[0][0]:
                hour, minute = (int(x) for x in schedule.handover_time.split(":"))
                at = datetime(first.year, first.month, first.day, hour, minute, tzinfo=zone)
                away, home = _HANDOVER.get(lang, _HANDOVER["en"])
                title = (away if place == "other" else home).format(name=child.display_name, home=schedule.other_home)
                out.append(EventOut(feed_name="", color=child.color, title=f"🔁 {title}", start=at, end=at + timedelta(minutes=30), all_day=False, member_ids=[child.id]))
    return out


_EXPIRES = {"en": "expires", "sv": "går ut", "nb": "utløper", "da": "udløber", "fi": "vanhenee"}
_NEXT_DOSE = {"en": "next dose", "sv": "nästa dos", "nb": "neste dose", "da": "næste dosis", "fi": "seuraava annos"}

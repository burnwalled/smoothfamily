"""Scheduled notifications: calendar reminders, and pruning of the notification centre."""

import asyncio
from datetime import datetime, timedelta, timezone

import redis.asyncio as aioredis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import AppSetting, CalendarFeed, FamilyEvent, User
from app.services.ical import fetch_ical_raw, parse_events
from app.services.birthdays import run_birthday_reminders
from app.services.backups import run_scheduled_backup
from app.services.families import remove_stale_demos
from app.services.medicine import run_medicine_reminders
from app.services.pet_care import run_pet_care_reminders
from app.services.subscription_reminders import run_subscription_reminders
from app.services.flows import run_time_flows
from app.services.ha_publish import run_ha_sync
from app.services.memories import backfill_taken, run_memory_push
from app.services.event_reminders import run_packing_reminders, run_ride_reminders
from app.services.morning import run_morning_summaries
from app.services.today_cards import run_waste_reminders
from app.services.notify import notify, prune_notifications
from app.services.security_log import prune as prune_security_log, run_security_summary
from app.services.geo import run_geo_refresh


async def run_calendar_reminders(db: AsyncSession, now: datetime | None = None) -> int:
    now = now or datetime.now(timezone.utc)
    window_start = now + timedelta(minutes=29)
    window_end = now + timedelta(minutes=31)

    feeds = (await db.execute(select(CalendarFeed))).scalars().all()
    recipients = (await db.execute(select(User))).scalars().all()
    users_by_family: dict = {}
    for user in recipients:
        users_by_family.setdefault(user.family_id, []).append(user)

    sent = 0
    for feed in feeds:
        try:
            raw = await fetch_ical_raw(feed.url, feed.family_id)
            events = parse_events(raw, window_start.date(), window_end.date())
        except Exception:
            continue

        visible_to = {str(uid) for uid in (feed.visible_to or [])}
        details_for = {str(uid) for uid in (feed.details_for or [])}
        family_users = users_by_family.get(feed.family_id, [])

        for event in events:
            event_start = event["start"]
            if event_start < window_start or event_start > window_end:
                continue

            event_key = f"push.calendar.sent:{feed.id}:{event_start.isoformat()}"
            already_sent = await db.get(AppSetting, event_key)
            if already_sent is not None:
                continue

            for recipient in family_users:
                recipient_id = str(recipient.id)
                is_owner_or_admin = recipient.role == "admin" or str(feed.created_by) == recipient_id
                is_visible = is_owner_or_admin or not visible_to or recipient_id in visible_to
                if not is_visible:
                    continue

                if is_owner_or_admin or (not details_for or recipient_id in details_for):
                    pref_key = "calendar_mine"
                    title = event["title"]
                else:
                    pref_key = "calendar_family"
                    title = "Busy"

                await notify(
                    db,
                    recipient,
                    {
                        "title": "Calendar reminder",
                        "body": f"{title} starts in 30 minutes",
                        "route": "/calendar",
                        "kind": "calendar_reminder",
                    },
                    pref=pref_key,
                )
                sent += 1

            db.add(AppSetting(key=event_key, value=now.isoformat()))
            await db.commit()

    # Events created in the app are shared with the whole family; all-day ones get no reminder.
    family_events = (
        await db.execute(
            select(FamilyEvent).where(
                FamilyEvent.all_day == False,  # noqa: E712
                FamilyEvent.start >= window_start,
                FamilyEvent.start <= window_end,
            )
        )
    ).scalars().all()
    for event in family_events:
        event_key = f"push.calendar.sent:event:{event.id}:{event.start.isoformat()}"
        if await db.get(AppSetting, event_key) is not None:
            continue
        tagged = {str(uid) for uid in (event.member_ids or [])}
        for recipient in users_by_family.get(event.family_id, []):
            if event.private_to:
                if str(recipient.id) not in event.private_to:
                    continue
            elif tagged and str(recipient.id) not in tagged:
                continue
            pref_key = "calendar_mine" if recipient.id == event.created_by else "calendar_family"
            await notify(
                db,
                recipient,
                {
                    "title": "Calendar reminder",
                    "body": f"{event.title} starts in 30 minutes",
                    "route": "/calendar",
                    "kind": "calendar_reminder",
                },
                pref=pref_key,
            )
            sent += 1
        db.add(AppSetting(key=event_key, value=now.isoformat()))
        await db.commit()

    return sent


async def notification_worker(stop_event: asyncio.Event) -> None:
    """Single-runner loop using Redis lock; schedules minute-based reminder checks."""
    from app.database import SessionLocal
    from app.routers.documents import run_document_reminders
    from app.routers.receipts import run_receipt_reminders
    from app.services.list_sync import run_list_sync
    from app.services.updates import run_update_cycle
    from app.routers.pantry import run_pantry_reminders
    from app.routers.custody import run_custody
    from app.routers.property import run_property_meters, run_property_reminders
    from app.routers.vehicles import run_vehicle_meters, run_vehicle_reminders
    from app.routers.trips import run_trip_reminders
    from app.routers.week import run_week_review_reminders
    from app.services.health_ha import run_health_sync
    from app.services.school_ha import run_school_sync
    from app.routers.parties import run_party_mailings, run_party_reminders, run_party_thanks

    settings = get_settings()
    redis = aioredis.from_url(settings.redis_url, decode_responses=True)

    while not stop_event.is_set():
        lock_ok = False
        try:
            lock_ok = await redis.set("push:runner:lock", "1", ex=90, nx=True)
        except Exception:
            lock_ok = False

        if lock_ok:
            try:
                async with SessionLocal() as db:
                    await run_calendar_reminders(db)
                    await run_birthday_reminders(db)
                    await run_waste_reminders(db)
                    await run_scheduled_backup(db)
                    await remove_stale_demos(db)
                    await run_medicine_reminders(db)
                    await run_pet_care_reminders(db)
                    await run_subscription_reminders(db)
                    await run_morning_summaries(db)
                    await run_ride_reminders(db)
                    await run_packing_reminders(db)
                    await run_week_review_reminders(db)
                    await run_document_reminders(db)
                    await run_receipt_reminders(db)
                    await run_list_sync(db)
                    await run_update_cycle(db)
                    await run_time_flows(db)
                    await run_ha_sync(db)
                    await backfill_taken(db)
                    await run_memory_push(db)
                    await run_trip_reminders(db)
                    await run_pantry_reminders(db)
                    await run_vehicle_reminders(db)
                    await run_vehicle_meters(db)
                    await run_property_reminders(db)
                    await run_property_meters(db)
                    await run_custody(db)
                    await run_health_sync(db)
                    await run_school_sync(db)
                    await run_party_reminders(db)
                    await run_party_mailings(db)
                    await run_party_thanks(db)
                    await prune_notifications(db)
                    await run_security_summary(db)
                    await run_geo_refresh(db)
                    await prune_security_log(db)
            except Exception:
                pass

        try:
            await asyncio.wait_for(stop_event.wait(), timeout=60)
        except asyncio.TimeoutError:
            continue

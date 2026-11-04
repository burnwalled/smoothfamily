"""Reminders for who drives and packing lists (#53).

- Who drives: at 18 the evening before, the adults are asked if an event that needs a ride still
  has nobody taking the drop-off or the pick-up.
- Packing: two hours before an event with a packing list, what hasn't been ticked off is sent to
  the members it concerns (the drivers and the members tagged on the event; else the adults). For
  an all-day event it goes out at 18 the evening before.
"""
import hashlib
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import AppSetting, EventPlan, PackingList, User
from app.services.calendar_view import events_between, utc
from app.services.notify import notify

EVENING_HOUR = 18
PACKING_BEFORE = timedelta(hours=2)

_RIDE = {
    "en": ("Who's driving?", "{title} tomorrow {time}: nobody has taken the {legs} yet", {"drop_off": "drop-off", "pick_up": "pick-up", "both": "drop-off and pick-up"}),
    "sv": ("Vem skjutsar?", "{title} imorgon {time}: ingen har tagit {legs} än", {"drop_off": "lämningen", "pick_up": "hämtningen", "both": "lämning och hämtning"}),
    "nb": ("Hvem kjører?", "{title} i morgen {time}: ingen har tatt {legs} ennå", {"drop_off": "levering", "pick_up": "henting", "both": "levering og henting"}),
    "da": ("Hvem kører?", "{title} i morgen {time}: ingen har taget {legs} endnu", {"drop_off": "afleveringen", "pick_up": "afhentningen", "both": "aflevering og afhentning"}),
    "fi": ("Kuka kyyditsee?", "{title} huomenna {time}: kukaan ei ole vielä ottanut {legs}", {"drop_off": "vientiä", "pick_up": "hakua", "both": "vientiä ja hakua"}),
}
_PACKING = {
    "en": ("Don't forget", "{title} {time}: {items}"),
    "sv": ("Glöm inte", "{title} {time}: {items}"),
    "nb": ("Ikke glem", "{title} {time}: {items}"),
    "da": ("Husk", "{title} {time}: {items}"),
    "fi": ("Älä unohda", "{title} {time}: {items}"),
}


def _zone() -> ZoneInfo:
    return ZoneInfo(get_settings().timezone)


async def _adults(db: AsyncSession, family_id) -> list[User]:
    rows = (await db.execute(select(User).where(User.family_id == family_id, User.role.in_(["admin", "adult"])))).scalars().all()
    return [u for u in rows if "calendar" in u.apps]


async def run_ride_reminders(db: AsyncSession, now: datetime | None = None) -> int:
    now_local = (now or datetime.now(timezone.utc)).astimezone(_zone())
    if now_local.hour < EVENING_HOUR:
        return 0
    tomorrow = datetime.combine(now_local.date() + timedelta(days=1), time.min, tzinfo=_zone())
    plans = (
        await db.execute(
            select(EventPlan).where(
                EventPlan.needs_ride == True,  # noqa: E712
                EventPlan.ride_alerted_at.is_(None),
                EventPlan.start >= tomorrow.astimezone(timezone.utc),
                EventPlan.start < (tomorrow + timedelta(days=1)).astimezone(timezone.utc),
            )
        )
    ).scalars().all()
    sent = 0
    for plan in plans:
        plan.ride_alerted_at = now_local
        # Taken by a member or by someone outside the family (3.4.0).
        missing = [leg for leg in ("drop_off", "pick_up") if getattr(plan, f"{leg}_by") is None and not getattr(plan, f"{leg}_text")]
        await db.commit()
        if not missing:
            continue
        legs = "both" if len(missing) == 2 else missing[0]
        for adult in await _adults(db, plan.family_id):
            title, body, names = _RIDE.get(adult.language or "en", _RIDE["en"])
            text = body.format(title=plan.title, time=utc(plan.start).astimezone(_zone()).strftime("%H:%M"), legs=names[legs])
            await notify(db, adult, {"title": title, "body": text, "route": "/calendar", "kind": "ride_needed"}, pref="calendar_family")
            sent += 1
    return sent


async def run_packing_reminders(db: AsyncSession, now: datetime | None = None) -> int:
    now = now or datetime.now(timezone.utc)
    if now.minute % 5:
        return 0  # reading every member's calendar each minute is more than needed
    now_local = now.astimezone(_zone())
    families = set((await db.execute(select(PackingList.family_id))).scalars())
    sent = 0
    for family_id in families:
        members = (await db.execute(select(User).where(User.family_id == family_id))).scalars().all()
        adults = {u.id for u in members if u.role in {"admin", "adult"}}
        for member in members:
            if "calendar" not in member.apps:
                continue
            for event in await events_between(db, member, now_local.date(), now_local.date() + timedelta(days=2), birthdays=False):
                todo = [item.text for item in event.packing if not item.done]
                if not todo or not event.key:
                    continue
                start = utc(event.start)
                if event.all_day:
                    due = now_local.hour >= EVENING_HOUR and start.date() == now_local.date() + timedelta(days=1)
                else:
                    due = now < start <= now + PACKING_BEFORE
                if not due:
                    continue
                concerned = {d for d in (event.drop_off_by, event.pick_up_by) if d} | set(event.member_ids)
                if member.id not in (concerned or adults):
                    continue
                key = "packing.sent:" + hashlib.sha1(f"{member.id}:{event.key}".encode()).hexdigest()
                if await db.get(AppSetting, key) is not None:
                    continue
                db.add(AppSetting(key=key, value=now.isoformat()))
                await db.commit()
                title, body = _PACKING.get(member.language or "en", _PACKING["en"])
                when = "" if event.all_day else start.astimezone(_zone()).strftime("%H:%M")
                await notify(
                    db,
                    member,
                    {"title": title, "body": body.format(title=event.title, time=when, items=", ".join(todo)).replace("  ", " "), "route": "/calendar", "kind": "packing_list"},
                    pref="calendar_mine",
                )
                sent += 1
    return sent

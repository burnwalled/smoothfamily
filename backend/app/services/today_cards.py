"""Today cards fed by public sources: waste collection (the family's iCal calendar from the
municipality or waste company, or a schedule entered by hand) and school lunch (skolmaten.se's public RSS feed per school).

Nothing about the family is sent: only the calendar address and the school's name are used.
Answers are cached for an hour.
"""
import re
import time
import xml.etree.ElementTree as ET
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from html import unescape
from urllib.parse import urlparse

import httpx
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AppSetting, Family, User, WasteSchedule
from app.services.ical import fetch_ical_raw, parse_events
from app.services.notify import notify

SKOLMATEN_RSS = "https://skolmaten.se/api/4/rss/week/{school}?locale=sv&offset={offset}"
CACHE_SECONDS = 3600
# What skolmaten writes for a day or week without a menu.
NO_MENU = "ingen meny tillgänglig"
_cache: dict[str, tuple[float, object]] = {}


def _cached(key: str):
    hit = _cache.get(key)
    return hit[1] if hit and time.monotonic() - hit[0] < CACHE_SECONDS else None


def _remember(key: str, value):
    _cache[key] = (time.monotonic(), value)
    return value


# --- Waste collection ----------------------------------------------------------------------


async def waste_pickups(url: str, today: date, days: int = 14) -> list[dict]:
    """[{date, title}] for collections from today up to `days` ahead."""
    raw = await fetch_ical_raw(url)
    events = parse_events(raw, today, today + timedelta(days=days))
    pickups = []
    for event in events:
        start = event["start"]
        day = start.date() if isinstance(start, datetime) else start
        if day >= today and event.get("title"):
            pickups.append({"date": day, "title": event["title"]})
    pickups.sort(key=lambda p: (p["date"], p["title"]))
    return pickups


def schedule_dates(rule: WasteSchedule, start: date, days: int) -> list[date]:
    """The dates a hand-entered collection falls on from `start` up to `days` ahead."""
    step = timedelta(weeks=max(1, rule.interval_weeks or 1))
    # The first collection on or after start, whole steps from the anchor (before or after it).
    steps = -(-(start - rule.anchor_date).days // step.days)
    out, day = [], rule.anchor_date + step * steps
    while day <= start + timedelta(days=days):
        if day >= start and (not rule.months or day.month in rule.months):
            out.append(day)
        day += step
    return out


async def family_pickups(db: AsyncSession, family: Family, today: date, days: int = 14) -> list[dict]:
    """Collections from the family's waste calendar (iCal) and its own schedule, sorted.

    Raises when the calendar can't be read and there is no own schedule to show instead."""
    rules = (await db.execute(select(WasteSchedule).where(WasteSchedule.family_id == family.id))).scalars().all()
    pickups = [{"date": d, "title": rule.title} for rule in rules for d in schedule_dates(rule, today, days)]
    if family.waste_ical_url:
        try:
            pickups += await waste_pickups(family.waste_ical_url, today, days)
        except Exception:
            if not rules:
                raise
    pickups.sort(key=lambda p: (p["date"], p["title"]))
    return pickups


_WASTE_TEXT = {
    "en": ("Waste collection tomorrow", "{what} – put the bin out tonight"),
    "sv": ("Sophämtning imorgon", "{what} – ställ ut kärlet ikväll"),
    "nb": ("Søppeltømming i morgen", "{what} – sett ut dunken i kveld"),
    "da": ("Affaldsafhentning i morgen", "{what} – stil spanden ud i aften"),
    "fi": ("Jätehuolto huomenna", "{what} – vie astia tienvarteen tänä iltana"),
}


async def run_waste_reminders(db: AsyncSession, now: datetime | None = None) -> int:
    """The evening before a collection (from 17 UTC ≈ 18–19 in Sweden) the adults get a reminder."""
    now = now or datetime.now(timezone.utc)
    if now.hour < 17:
        return 0
    tomorrow = now.date() + timedelta(days=1)
    sent = 0
    with_schedule = select(WasteSchedule.family_id)
    families = (
        await db.execute(select(Family).where(or_(Family.waste_ical_url.is_not(None), Family.id.in_(with_schedule))))
    ).scalars().all()
    for family in families:
        key = f"waste.sent:{family.id}:{tomorrow.isoformat()}"
        if await db.get(AppSetting, key) is not None:
            continue
        try:
            pickups = [p for p in await family_pickups(db, family, tomorrow, 1) if p["date"] == tomorrow]
        except Exception:
            continue
        if pickups:
            what = ", ".join(p["title"] for p in pickups)
            adults = (
                await db.execute(select(User).where(User.family_id == family.id, User.role.in_(["admin", "adult"])))
            ).scalars().all()
            for adult in adults:
                title, body = _WASTE_TEXT.get(adult.language or "en", _WASTE_TEXT["en"])
                await notify(db, adult, {"title": title, "body": body.format(what=what), "route": "/", "kind": "waste_collection"}, pref="calendar_family")
                sent += 1
        db.add(AppSetting(key=key, value=now.isoformat()))
        await db.commit()
    return sent


# --- School lunch --------------------------------------------------------------------------


def school_name_from(value: str) -> str | None:
    """'https://skolmaten.se/ostra-real/' or 'ostra-real' → 'ostra-real'."""
    value = value.strip()
    if "://" in value:
        parsed = urlparse(value)
        if not (parsed.hostname or "").endswith("skolmaten.se"):
            return None
        parts = [p for p in parsed.path.split("/") if p]
        # Also the RSS address: /api/4/rss/week/<school>
        value = parts[-1] if parts else ""
    return value.lower() if re.fullmatch(r"[a-z0-9-]{2,120}", value.lower()) else None


def _dishes(description: str) -> list[str]:
    text = unescape(re.sub(r"<br\s*/?>", "\n", description, flags=re.I))
    text = re.sub(r"<[^>]+>", " ", text)
    return [re.sub(r"\s+", " ", line).strip() for line in text.split("\n") if line.strip()]


def parse_lunch_rss(xml: str) -> dict:
    """{'school': name, 'days': [{date, dishes}]} from skolmaten's weekly RSS."""
    root = ET.fromstring(xml.strip())
    channel = root.find("channel")
    title = (channel.findtext("title") or "").removeprefix("Skolmaten - ").strip() if channel is not None else ""
    days = []
    for item in root.iter("item"):
        when = item.findtext("pubDate")
        if not when:
            continue  # "Vecka 44 – Ingen meny tillgänglig"
        try:
            day = parsedate_to_datetime(when).date()
        except (TypeError, ValueError):
            continue
        dishes = [d for d in _dishes(item.findtext("description") or "") if d.lower() != NO_MENU]
        if dishes:
            days.append({"date": day, "dishes": dishes})
    return {"school": title, "days": days}


async def school_lunch(school: str, today: date) -> dict:
    """This week's lunch (next week's from Saturday), cached per school and week."""
    offset = 1 if today.weekday() >= 5 else 0
    key = f"lunch:{school}:{today.isocalendar()[:2]}:{offset}"
    if (hit := _cached(key)) is not None:
        return hit
    async with httpx.AsyncClient(timeout=10, headers={"User-Agent": "SmoothFamily (school lunch card)"}) as client:
        resp = await client.get(SKOLMATEN_RSS.format(school=school, offset=offset))
    if resp.status_code != 200:
        raise ValueError("School not found on skolmaten.se")
    return _remember(key, parse_lunch_rss(resp.text))

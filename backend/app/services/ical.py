"""Fetch and parse iCal feeds (read-only subscriptions).

Feeds are cached in Redis with a TTL so the Pi doesn't hammer Google/iCloud.
If Redis is unavailable we fall back to fetching directly.
"""
import hashlib
from datetime import date, datetime, time, timezone

import httpx
import icalendar
import recurring_ical_events
import redis.asyncio as aioredis

from app.config import get_settings

_redis: aioredis.Redis | None = None


def _get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(get_settings().redis_url, decode_responses=False)
    return _redis


async def fetch_ical_raw(url: str, family_id=None) -> bytes:
    """Fetch raw iCal bytes, via Redis cache when possible. A `homeassistant://calendar.x` address
    (3.4.0) is read from the family's own Home Assistant."""
    settings = get_settings()
    # webcal:// is just https in disguise
    if url.startswith("webcal://"):
        url = "https://" + url[len("webcal://"):]
    cache_key = "ical:" + hashlib.sha256(f"{family_id or ''}{url}".encode()).hexdigest()

    try:
        cached = await _get_redis().get(cache_key)
        if cached:
            return cached
    except Exception:
        pass  # Redis down – fetch directly

    from app.services import ha_calendar

    if ha_calendar.is_ha(url):
        if family_id is None:
            return ha_calendar.to_ics("", [])
        from app.database import SessionLocal

        async with SessionLocal() as db:
            data = await ha_calendar.fetch(db, family_id, ha_calendar.entity_of(url))
    else:
        async with httpx.AsyncClient(
            timeout=settings.ical_fetch_timeout_seconds, follow_redirects=True
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.content

    try:
        await _get_redis().set(cache_key, data, ex=settings.ical_cache_ttl_seconds)
    except Exception:
        pass
    return data


def parse_events(ical_bytes: bytes, start: date, end: date) -> list[dict]:
    """Expand recurring events within [start, end] into plain dicts."""
    calendar = icalendar.Calendar.from_ical(ical_bytes)
    events = recurring_ical_events.of(calendar).between(start, end)
    result: list[dict] = []
    for event in events:
        dtstart = event.get("DTSTART")
        dtend = event.get("DTEND") or dtstart
        if dtstart is None:
            continue
        start_value, end_value = dtstart.dt, dtend.dt
        all_day = not isinstance(start_value, datetime)
        if all_day:
            start_value = datetime.combine(start_value, time.min, tzinfo=timezone.utc)
            end_value = datetime.combine(end_value, time.min, tzinfo=timezone.utc)
        else:
            if start_value.tzinfo is None:
                start_value = start_value.replace(tzinfo=timezone.utc)
            if end_value.tzinfo is None:
                end_value = end_value.replace(tzinfo=timezone.utc)
        result.append(
            {
                "title": str(event.get("SUMMARY", "Untitled")),
                "start": start_value,
                "end": end_value,
                "all_day": all_day,
                "location": str(event["LOCATION"]) if event.get("LOCATION") else None,
                "uid": str(event.get("UID", "")),
            }
        )
    result.sort(key=lambda e: e["start"])
    return result

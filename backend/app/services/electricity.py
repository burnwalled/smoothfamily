"""Electricity spot prices (#74) per price area (SE1–SE4) from elprisetjustnu.se's open API.

No key is needed and nothing about the family is sent – only the area and the date. Prices come
per quarter hour; the card and the flows use hourly averages, in öre per kWh without VAT and fees.
Tomorrow's prices are published in the early afternoon. Answers are cached for an hour.
"""
import time
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import httpx

from app.config import get_settings

API = "https://www.elprisetjustnu.se/api/v1/prices/{year}/{month:02d}-{day:02d}_{area}.json"
AREAS = ("SE1", "SE2", "SE3", "SE4")
CACHE_SECONDS = 3600
_cache: dict[str, tuple[float, list[dict] | None]] = {}


def _zone() -> ZoneInfo:
    return ZoneInfo(get_settings().timezone)


async def _fetch(area: str, day: date) -> list[dict] | None:
    url = API.format(year=day.year, month=day.month, day=day.day, area=area)
    async with httpx.AsyncClient(timeout=10, headers={"User-Agent": "SmoothFamily (electricity card)"}) as client:
        resp = await client.get(url)
    if resp.status_code == 404:
        return None  # not published yet
    resp.raise_for_status()
    return resp.json()


def hourly(rows: list[dict]) -> list[dict]:
    """[{start (aware), ore}] – quarter hours averaged per hour, in öre/kWh."""
    by_hour: dict[datetime, list[float]] = {}
    for row in rows:
        start = datetime.fromisoformat(row["time_start"])
        hour = start.replace(minute=0, second=0, microsecond=0)
        by_hour.setdefault(hour, []).append(float(row["SEK_per_kWh"]) * 100)
    return [{"start": hour, "ore": round(sum(v) / len(v), 1)} for hour, v in sorted(by_hour.items())]


async def prices(area: str, day: date) -> list[dict] | None:
    """The day's hourly prices, or None if they aren't out yet."""
    key = f"{area}:{day.isoformat()}"
    hit = _cache.get(key)
    if hit and time.monotonic() - hit[0] < CACHE_SECONDS:
        return hit[1]
    rows = await _fetch(area, day)
    value = hourly(rows) if rows else None
    # "Not published yet" is asked again sooner, in a few minutes.
    _cache[key] = (time.monotonic() - (CACHE_SECONDS - 600 if value is None else 0), value)
    return value


def cheapest(hours: list[dict], n: int) -> set[datetime]:
    return {h["start"] for h in sorted(hours, key=lambda h: (h["ore"], h["start"]))[:n]}


def hour_of(hours: list[dict], now: datetime) -> dict | None:
    now = now.astimezone(timezone.utc)
    for h in hours:
        if h["start"].astimezone(timezone.utc) <= now < h["start"].astimezone(timezone.utc) + timedelta(hours=1):
            return h
    return None


async def today(area: str, now: datetime | None = None) -> list[dict]:
    local = (now or datetime.now(timezone.utc)).astimezone(_zone())
    return await prices(area, local.date()) or []

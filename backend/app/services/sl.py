"""SL (Stockholm public transport) departures via Trafiklab's SL Transport API.

The SL Transport API (https://www.trafiklab.se/api/our-apis/sl/transport/) is
open and requires no API key. Responses are cached in Redis so a dashboard
full of widgets doesn't hammer the API; if Redis is unavailable we fetch
directly.

SL sometimes answers with an empty list for every stop, or with errors, for a while. The last
departures we saw per stop are kept (in memory and in Redis, so they survive a restart or a
deploy), and during such a gap the ones that haven't left yet are served, flagged as stale, so
the widget can say so instead of "no departures".
"""
import json
import time
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import httpx
import redis.asyncio as aioredis

from app.config import get_settings

_redis: aioredis.Redis | None = None
_STOCKHOLM = ZoneInfo("Europe/Stockholm")
# (site_id, forecast) -> (monotonic time stored, parsed departures)
_last_known: dict[tuple[int, int], tuple[float, list[dict]]] = {}


def _get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(get_settings().redis_url, decode_responses=False)
    return _redis


async def _cached_get_json(url: str, cache_key: str, ttl: int, empty_ttl: int | None = None) -> object:
    try:
        cached = await _get_redis().get(cache_key)
        if cached:
            return json.loads(cached)
    except Exception:
        pass  # Redis down – fetch directly

    settings = get_settings()
    async with httpx.AsyncClient(timeout=settings.sl_fetch_timeout_seconds) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()

    if empty_ttl is not None and isinstance(data, dict) and not data.get("departures"):
        ttl = empty_ttl  # an empty answer may be an SL hiccup: ask again soon
    try:
        await _get_redis().set(cache_key, json.dumps(data).encode(), ex=ttl)
    except Exception:
        pass
    return data


async def search_sites(query: str, limit: int = 10) -> list[dict]:
    """Search SL sites (stops/stations) by name, case-insensitively."""
    settings = get_settings()
    data = await _cached_get_json(
        f"{settings.sl_api_base}/sites?expand=false",
        "sl:sites",
        settings.sl_sites_cache_ttl_seconds,
    )
    needle = query.strip().lower()
    matches = [site for site in data if needle in str(site.get("name", "")).lower()]
    # Prefer names that start with the query, then shorter (more exact) names
    matches.sort(key=lambda s: (not str(s["name"]).lower().startswith(needle), len(str(s["name"]))))
    return [{"id": site["id"], "name": site["name"]} for site in matches[:limit]]


def _parse_departures(data: object) -> list[dict]:
    result: list[dict] = []
    for dep in (data or {}).get("departures", []) if isinstance(data, dict) else []:
        line = dep.get("line") or {}
        result.append(
            {
                "line": str(line.get("designation") or line.get("id") or "?"),
                "destination": dep.get("destination") or "",
                "transport_mode": str(line.get("transport_mode") or "BUS"),
                "scheduled": dep.get("scheduled"),
                "expected": dep.get("expected") or dep.get("scheduled"),
                "state": dep.get("state") or "EXPECTED",
            }
        )
    return result


def _as_utc(value: str) -> datetime:
    moment = datetime.fromisoformat(value)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=_STOCKHOLM)  # SL gives local Stockholm times
    return moment.astimezone(timezone.utc)


async def departures(site_id: int, forecast_minutes: int = 60) -> list[dict]:
    """Upcoming departures from a site within the forecast window.

    When SL fails or answers with nothing, the last known departures that haven't left yet are
    returned with `stale: True`; with nothing known the SL error is raised as before.
    """
    settings = get_settings()
    key = (site_id, forecast_minutes)
    error: httpx.HTTPError | None = None
    result: list[dict] = []
    try:
        data = await _cached_get_json(
            f"{settings.sl_api_base}/sites/{site_id}/departures?forecast={forecast_minutes}",
            f"sl:departures:{site_id}:{forecast_minutes}",
            settings.sl_departures_cache_ttl_seconds,
            empty_ttl=settings.sl_empty_cache_ttl_seconds,
        )
        result = _parse_departures(data)
    except httpx.HTTPError as exc:
        error = exc

    redis_key = f"sl:last_known:{site_id}:{forecast_minutes}"
    if result:
        _last_known[key] = (time.monotonic(), result)
        try:
            await _get_redis().set(redis_key, json.dumps(result).encode(), ex=settings.sl_last_known_ttl_seconds)
        except Exception:
            pass
        return result

    known: list[dict] | None = None
    stored = _last_known.get(key)
    if stored and time.monotonic() - stored[0] < settings.sl_last_known_ttl_seconds:
        known = stored[1]
    else:
        try:
            raw = await _get_redis().get(redis_key)
            known = json.loads(raw) if raw else None
        except Exception:
            known = None
    if known:
        now = datetime.now(timezone.utc)
        upcoming = [dict(dep, stale=True) for dep in known if dep["expected"] and _as_utc(dep["expected"]) > now]
        if upcoming:
            return upcoming
    if error is not None:
        raise error
    return []

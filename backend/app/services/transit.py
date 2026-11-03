"""Public transport departures from several providers (3.4.0), for the Departures widget.

- SL (Stockholm): keyless, as before (services/sl.py, unchanged).
- Trafiklab Realtime APIs (all of Sweden): a key from developer.trafiklab.se.
- Entur (Norway): keyless; only asks for an ET-Client-Name header.
- Digitransit (Finland): a key from portal-api.digitransit.fi.
- Rejseplanen (Denmark): a key (accessId) from labs.rejseplanen.dk.
- TfL (London): works without a key; a key from api-portal.tfl.gov.uk gives more calls.

The server admin adds the keys (Server → Services); they're kept encrypted. The browser never talks
to a provider: the server asks, caches the answers in Redis, and while a provider fails it shows
the last known departures that haven't left yet, flagged as stale – like SL.

Each departure has the same shape as SL's: line, destination, transport_mode (BUS, METRO, TRAM,
TRAIN, FERRY, TAXI), scheduled, expected (ISO 8601 with a time zone) and state (EXPECTED or
CANCELLED).
"""
import json
from datetime import datetime, timedelta, timezone
from urllib.parse import quote
from zoneinfo import ZoneInfo

import httpx
import redis.asyncio as aioredis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import AppSetting
from app.services import sl
from app.services.crypto import decrypt_token, encrypt_token

SETTING_KEY = "transit_keys"
TIMEOUT = 10.0
STOPS_TTL = 24 * 3600
DEPARTURES_TTL = 30
LAST_KNOWN_TTL = 3 * 3600

# id → (name, area, key: "none" | "required" | "optional", where to get one)
PROVIDERS: dict[str, tuple[str, str, str, str | None]] = {
    "sl": ("SL", "Stockholm", "none", None),
    "trafiklab": ("Trafiklab", "Sverige", "required", "https://developer.trafiklab.se"),
    "entur": ("Entur", "Norge", "none", None),
    "digitransit": ("Digitransit", "Suomi", "required", "https://portal-api.digitransit.fi"),
    "rejseplanen": ("Rejseplanen", "Danmark", "required", "https://labs.rejseplanen.dk"),
    "tfl": ("TfL", "London", "optional", "https://api-portal.tfl.gov.uk"),
}
# Which provider a family starts with, from its language.
BY_LANGUAGE = {"sv": "sl", "nb": "entur", "fi": "digitransit", "da": "rejseplanen", "en": "tfl"}

_redis: aioredis.Redis | None = None


class TransitError(Exception):
    """The provider couldn't be asked (no key) or didn't answer."""


def _get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(get_settings().redis_url, decode_responses=False)
    return _redis


# --- Keys ------------------------------------------------------------------------------------


async def keys(db: AsyncSession) -> dict[str, str]:
    row = (await db.execute(select(AppSetting).where(AppSetting.key == SETTING_KEY))).scalar_one_or_none()
    if row is None or not row.value:
        return {}
    try:
        return json.loads(decrypt_token(row.value))
    except Exception:
        return {}


async def set_key(db: AsyncSession, provider: str, key: str | None) -> None:
    current = await keys(db)
    if key:
        current[provider] = key.strip()
    else:
        current.pop(provider, None)
    row = (await db.execute(select(AppSetting).where(AppSetting.key == SETTING_KEY))).scalar_one_or_none()
    value = encrypt_token(json.dumps(current)) if current else None
    if row is None and value:
        db.add(AppSetting(key=SETTING_KEY, value=value))
    elif row is not None and value:
        row.value = value
    elif row is not None:
        await db.delete(row)
    await db.commit()


def available(provider: str, have: dict[str, str]) -> bool:
    return provider in PROVIDERS and (PROVIDERS[provider][2] != "required" or bool(have.get(provider)))


# --- Asking, with a cache ------------------------------------------------------------------------


async def _cached(cache_key: str, ttl: int, fetch) -> object:
    try:
        hit = await _get_redis().get(cache_key)
        if hit:
            return json.loads(hit)
    except Exception:
        pass  # Redis down – ask directly
    data = await fetch()
    try:
        await _get_redis().set(cache_key, json.dumps(data).encode(), ex=ttl)
    except Exception:
        pass
    return data


async def _get(url: str, headers: dict | None = None, params: dict | None = None) -> object:
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.get(url, headers=headers, params=params)
        resp.raise_for_status()
        return resp.json()


async def _post(url: str, body: dict, headers: dict) -> object:
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.post(url, json=body, headers=headers)
        resp.raise_for_status()
        return resp.json()


def _iso(moment: datetime | None) -> str | None:
    return moment.isoformat() if moment else None


def _local(value: str | None, zone: str) -> datetime | None:
    """A provider's time, with its own zone when it gives none."""
    if not value:
        return None
    moment = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return moment if moment.tzinfo else moment.replace(tzinfo=ZoneInfo(zone))


_MODES = {
    "bus": "BUS", "coach": "BUS", "trolleybus": "BUS", "metro": "METRO", "subway": "METRO", "tube": "METRO", "tram": "TRAM",
    "rail": "TRAIN", "train": "TRAIN", "overground": "TRAIN", "elizabeth-line": "TRAIN", "dlr": "TRAIN", "national-rail": "TRAIN",
    "water": "FERRY", "ferry": "FERRY", "boat": "FERRY", "river-bus": "FERRY", "taxi": "TAXI",
}


def _mode(value: str | None) -> str:
    text = str(value or "")
    if text.upper() in ("BUS", "METRO", "TRAM", "TRAIN", "FERRY", "TAXI"):
        return text.upper()
    return "FERRY" if text.upper() == "BOAT" else _MODES.get(text.lower(), "BUS")


# --- Trafiklab Realtime APIs (Sweden) ------------------------------------------------------------

TRAFIKLAB = "https://realtime-api.trafiklab.se/v1"


def parse_trafiklab_stops(data: dict) -> list[dict]:
    return [{"id": str(g["id"]), "name": g["name"]} for g in (data or {}).get("stop_groups", []) if g.get("id") and g.get("name")]


def parse_trafiklab_departures(data: dict) -> list[dict]:
    out = []
    for d in (data or {}).get("departures", []):
        route = d.get("route") or {}
        scheduled = _local(d.get("scheduled"), "Europe/Stockholm")
        expected = _local(d.get("realtime") or d.get("scheduled"), "Europe/Stockholm")
        out.append({
            "line": str(route.get("designation") or route.get("name") or "?"),
            "destination": route.get("direction") or (route.get("destination") or {}).get("name") or "",
            "transport_mode": _mode(route.get("transport_mode")),
            "scheduled": _iso(scheduled), "expected": _iso(expected),
            "state": "CANCELLED" if d.get("canceled") in (True, "true") else "EXPECTED",
        })
    return out


# --- Entur (Norway) ----------------------------------------------------------------------------

ENTUR_GEOCODER = "https://api.entur.io/geocoder/v1/autocomplete"
ENTUR_JOURNEY = "https://api.entur.io/journey-planner/v3/graphql"
ENTUR_HEADERS = {"ET-Client-Name": "smoothfamily-departures"}
ENTUR_QUERY = """query($id: String!, $n: Int!) { stopPlace(id: $id) { name estimatedCalls(numberOfDepartures: $n, timeRange: 7200) {
  aimedDepartureTime expectedDepartureTime cancellation destinationDisplay { frontText } serviceJourney { line { publicCode transportMode } } } } }"""


def parse_entur_stops(data: dict) -> list[dict]:
    out = []
    for f in (data or {}).get("features", []):
        p = f.get("properties") or {}
        if str(p.get("id", "")).startswith("NSR:StopPlace:"):
            out.append({"id": p["id"], "name": p.get("label") or p.get("name") or p["id"]})
    return out


def parse_entur_departures(data: dict) -> list[dict]:
    calls = (((data or {}).get("data") or {}).get("stopPlace") or {}).get("estimatedCalls") or []
    out = []
    for c in calls:
        line = ((c.get("serviceJourney") or {}).get("line")) or {}
        out.append({
            "line": str(line.get("publicCode") or "?"),
            "destination": (c.get("destinationDisplay") or {}).get("frontText") or "",
            "transport_mode": _mode(line.get("transportMode")),
            "scheduled": _iso(_local(c.get("aimedDepartureTime"), "Europe/Oslo")),
            "expected": _iso(_local(c.get("expectedDepartureTime") or c.get("aimedDepartureTime"), "Europe/Oslo")),
            "state": "CANCELLED" if c.get("cancellation") else "EXPECTED",
        })
    return out


# --- Digitransit (Finland) -----------------------------------------------------------------------

DIGITRANSIT = "https://api.digitransit.fi/routing/v2/finland/gtfs/v1"
DIGITRANSIT_STOPS = """query($q: String!) { stops(name: $q) { gtfsId name code vehicleMode } }"""
DIGITRANSIT_DEPARTURES = """query($id: String!, $n: Int!) { stop(id: $id) { name stoptimesWithoutPatterns(numberOfDepartures: $n, timeRange: 7200) {
  scheduledDeparture realtimeDeparture realtimeState serviceDay headsign trip { route { shortName mode } } } } }"""


def parse_digitransit_stops(data: dict) -> list[dict]:
    stops = ((data or {}).get("data") or {}).get("stops") or []
    return [{"id": s["gtfsId"], "name": f"{s['name']} ({s['code']})" if s.get("code") else s["name"]} for s in stops if s.get("gtfsId")][:15]


def parse_digitransit_departures(data: dict) -> list[dict]:
    times = (((data or {}).get("data") or {}).get("stop") or {}).get("stoptimesWithoutPatterns") or []
    out = []
    for s in times:
        day = s.get("serviceDay")
        if day is None:
            continue
        route = (s.get("trip") or {}).get("route") or {}
        scheduled = datetime.fromtimestamp(day + (s.get("scheduledDeparture") or 0), timezone.utc)
        expected = datetime.fromtimestamp(day + (s.get("realtimeDeparture") or s.get("scheduledDeparture") or 0), timezone.utc)
        out.append({
            "line": str(route.get("shortName") or "?"), "destination": s.get("headsign") or "", "transport_mode": _mode(route.get("mode")),
            "scheduled": _iso(scheduled), "expected": _iso(expected),
            "state": "CANCELLED" if s.get("realtimeState") == "CANCELED" else "EXPECTED",
        })
    return out


# --- Rejseplanen (Denmark) – HAFAS -----------------------------------------------------------------

REJSEPLANEN = "https://www.rejseplanen.dk/api"


def parse_hafas_stops(data: dict) -> list[dict]:
    rows = (data or {}).get("stopLocationOrCoordLocation") or []
    out = []
    for row in rows:
        stop = row.get("StopLocation")
        if stop and (stop.get("extId") or stop.get("id")):
            out.append({"id": str(stop.get("extId") or stop.get("id")), "name": stop.get("name", "")})
    return out


def _hafas_mode(dep: dict) -> str:
    product = dep.get("ProductAtStop") or {}
    if not product:
        listed = dep.get("Product")
        product = (listed[0] if listed else {}) if isinstance(listed, list) else listed or {}
    cat = str(product.get("catOut") or dep.get("type") or "").lower()
    if any(w in cat for w in ("bus", "bybus", "flex")):
        return "BUS"
    if "metro" in cat or cat == "m":
        return "METRO"
    if "letbane" in cat or "tram" in cat:
        return "TRAM"
    if any(w in cat for w in ("ic", "re", "tog", "s-tog", "train", "lyn", "reg")):
        return "TRAIN"
    if "færge" in cat or "ferry" in cat or "ship" in cat:
        return "FERRY"
    return "BUS"


def parse_hafas_departures(data: dict, zone: str = "Europe/Copenhagen") -> list[dict]:
    out = []
    for d in (data or {}).get("Departure") or []:
        product = d.get("ProductAtStop") or {}
        scheduled = _local(f"{d.get('date')}T{d.get('time')}", zone) if d.get("date") and d.get("time") else None
        rt_date, rt_time = d.get("rtDate") or d.get("date"), d.get("rtTime")
        expected = _local(f"{rt_date}T{rt_time}", zone) if rt_time else scheduled
        out.append({
            "line": str(product.get("displayNumber") or product.get("line") or d.get("name") or "?").strip(),
            "destination": d.get("direction") or "", "transport_mode": _hafas_mode(d),
            "scheduled": _iso(scheduled), "expected": _iso(expected),
            "state": "CANCELLED" if d.get("cancelled") in (True, "true") else "EXPECTED",
        })
    return out


# --- TfL (London) --------------------------------------------------------------------------------

TFL = "https://api.tfl.gov.uk"


def parse_tfl_stops(data: dict) -> list[dict]:
    return [{"id": m["id"], "name": m.get("name", m["id"])} for m in (data or {}).get("matches", []) if m.get("id")][:15]


def parse_tfl_departures(data: list) -> list[dict]:
    out = []
    for a in data or []:
        expected = _local(a.get("expectedArrival"), "Europe/London")
        out.append({
            "line": str(a.get("lineName") or "?"), "destination": a.get("destinationName") or a.get("towards") or "",
            "transport_mode": _mode(a.get("modeName")), "scheduled": _iso(expected), "expected": _iso(expected), "state": "EXPECTED",
        })
    return sorted(out, key=lambda d: d["expected"] or "")


# --- The two questions ---------------------------------------------------------------------------


async def search(db: AsyncSession, provider: str, query: str) -> list[dict]:
    """Stops matching a name: [{id, name}]."""
    have = await keys(db)
    if not available(provider, have):
        raise TransitError("This provider needs an API key from the server admin")
    key = have.get(provider)
    q = query.strip()
    cache = f"transit:stops:{provider}:{q.lower()}"
    if provider == "sl":
        return [{"id": str(s["id"]), "name": s["name"]} for s in await sl.search_sites(q)]
    if provider == "trafiklab":
        return parse_trafiklab_stops(await _cached(cache, STOPS_TTL, lambda: _get(f"{TRAFIKLAB}/stops/name/{quote(q)}", params={"key": key})))
    if provider == "entur":
        return parse_entur_stops(await _cached(cache, STOPS_TTL, lambda: _get(ENTUR_GEOCODER, ENTUR_HEADERS, {"text": q, "layers": "venue", "size": 15})))
    if provider == "digitransit":
        return parse_digitransit_stops(await _cached(cache, STOPS_TTL, lambda: _post(DIGITRANSIT, {"query": DIGITRANSIT_STOPS, "variables": {"q": q}}, {"digitransit-subscription-key": key})))
    if provider == "rejseplanen":
        return parse_hafas_stops(await _cached(cache, STOPS_TTL, lambda: _get(f"{REJSEPLANEN}/location.name", params={"input": q, "accessId": key, "format": "json", "type": "S", "maxNo": 15})))
    if provider == "tfl":
        return parse_tfl_stops(await _cached(cache, STOPS_TTL, lambda: _get(f"{TFL}/StopPoint/Search/{quote(q)}", params={"app_key": key} if key else None)))
    raise TransitError("Unknown provider")


async def _fetch_departures(provider: str, stop: str, key: str | None) -> list[dict]:
    cache = f"transit:departures:{provider}:{stop}"
    if provider == "trafiklab":
        return parse_trafiklab_departures(await _cached(cache, DEPARTURES_TTL, lambda: _get(f"{TRAFIKLAB}/departures/{quote(stop)}", params={"key": key})))
    if provider == "entur":
        return parse_entur_departures(await _cached(cache, DEPARTURES_TTL, lambda: _post(ENTUR_JOURNEY, {"query": ENTUR_QUERY, "variables": {"id": stop, "n": 12}}, ENTUR_HEADERS)))
    if provider == "digitransit":
        return parse_digitransit_departures(await _cached(cache, DEPARTURES_TTL, lambda: _post(DIGITRANSIT, {"query": DIGITRANSIT_DEPARTURES, "variables": {"id": stop, "n": 12}}, {"digitransit-subscription-key": key})))
    if provider == "rejseplanen":
        return parse_hafas_departures(await _cached(cache, DEPARTURES_TTL, lambda: _get(f"{REJSEPLANEN}/departureBoard", params={"id": stop, "accessId": key, "format": "json", "duration": 120, "maxJourneys": 12})))
    if provider == "tfl":
        return parse_tfl_departures(await _cached(cache, DEPARTURES_TTL, lambda: _get(f"{TFL}/StopPoint/{quote(stop)}/Arrivals", params={"app_key": key} if key else None)))
    raise TransitError("Unknown provider")


async def departures(db: AsyncSession, provider: str, stop: str) -> list[dict]:
    """The next departures from a stop. SL as before; the others with the same stale fallback."""
    if provider == "sl":
        return await sl.departures(int(stop))
    have = await keys(db)
    if not available(provider, have):
        raise TransitError("This provider needs an API key from the server admin")
    last = f"transit:last:{provider}:{stop}"
    error: Exception | None = None
    result: list[dict] = []
    try:
        result = sorted((d for d in await _fetch_departures(provider, stop, have.get(provider)) if d["expected"]), key=lambda d: datetime.fromisoformat(d["expected"]))
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
        error = exc
    if result:
        try:
            await _get_redis().set(last, json.dumps(result).encode(), ex=LAST_KNOWN_TTL)
        except Exception:
            pass
        return result
    try:
        raw = await _get_redis().get(last)
        known = json.loads(raw) if raw else []
    except Exception:
        known = []
    now = datetime.now(timezone.utc) - timedelta(minutes=1)
    upcoming = [dict(d, stale=True) for d in known if datetime.fromisoformat(d["expected"]) > now]
    if upcoming:
        return upcoming
    if error is not None:
        raise TransitError("The provider isn't answering right now") from error
    return []

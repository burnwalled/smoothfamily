"""Addresses from OpenStreetMap (3.4.0): suggestions as one types an address – a party's, an event's,
a home's – through Photon (komoot's geocoder for OpenStreetMap data, or the server's own Photon).

The server asks, not the browser: only the typed words leave the server, never who is asking. The
server admin can turn it off, or point it at a Photon of their own (Server → Address and services).
"""
import json
import time

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app import __version__
from app.models import AppSetting

KEY = "places"
DEFAULT_URL = "https://photon.komoot.io"
TIMEOUT = httpx.Timeout(6.0, connect=4.0)
LIMIT = 6
# Photon's own languages; for the others its local names are the right ones.
LANGS = ("en", "de", "fr")
_cache: dict[tuple[str, str], tuple[float, list[dict]]] = {}
CACHE_SECONDS = 600


class PlacesError(Exception):
    pass


async def settings(db: AsyncSession) -> dict:
    """{enabled, url} – on, with komoot's Photon, until the server admin says otherwise."""
    row = await db.get(AppSetting, KEY)
    value = json.loads(row.value) if row else {}
    return {"enabled": value.get("enabled", True), "url": value.get("url") or ""}


async def save(db: AsyncSession, enabled: bool, url: str | None) -> dict:
    row = await db.get(AppSetting, KEY)
    value = json.dumps({"enabled": enabled, "url": (url or "").rstrip("/")})
    if row is None:
        db.add(AppSetting(key=KEY, value=value))
    else:
        row.value = value
    await db.commit()
    _cache.clear()
    return await settings(db)


def _label(p: dict) -> tuple[str, str]:
    """(the address as one writes it, the place around it)."""
    street = " ".join(x for x in (p.get("street"), p.get("housenumber")) if x)
    town = " ".join(x for x in (p.get("postcode"), p.get("city") or p.get("town") or p.get("village") or p.get("district")) if x)
    name = p.get("name") or ""
    first = ", ".join(x for x in (name if name and name != street else "", street) if x) or name
    line = ", ".join(x for x in (first, town) if x)
    around = ", ".join(x for x in (p.get("state"), p.get("country")) if x)
    return line, around


def parse(data: dict) -> list[dict]:
    out, seen = [], set()
    for feature in data.get("features", []):
        p = feature.get("properties", {})
        coords = (feature.get("geometry") or {}).get("coordinates") or [None, None]
        line, around = _label(p)
        if not line or line in seen:
            continue
        seen.add(line)
        out.append({"label": line, "detail": around, "lat": coords[1], "lon": coords[0]})
    return out[:LIMIT]


async def search(db: AsyncSession, q: str, language: str = "en") -> list[dict]:
    conf = await settings(db)
    if not conf["enabled"]:
        raise PlacesError("Address suggestions are off on this server")
    q = " ".join(q.split())[:200]
    if len(q) < 3:
        return []
    key = (q.lower(), language)
    hit = _cache.get(key)
    if hit and hit[0] > time.monotonic():
        return hit[1]
    params = {"q": q, "limit": str(LIMIT + 4)}
    if language in LANGS:
        params["lang"] = language
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, headers={"User-Agent": f"SmoothFamily/{__version__} (self-hosted family app)"}) as client:
            resp = await client.get(f"{conf['url'] or DEFAULT_URL}/api", params=params)
            resp.raise_for_status()
            found = parse(resp.json())
    except (httpx.HTTPError, ValueError) as exc:
        raise PlacesError("The address search didn't answer") from exc
    if len(_cache) > 500:
        _cache.clear()
    _cache[key] = (time.monotonic() + CACHE_SECONDS, found)
    return found

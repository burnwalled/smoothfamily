"""Privacy-preserving GIPHY proxy (opt-in).

GIPHY is a tracking-heavy third party, so the browser never talks to it:
searches and GIF images go through the backend, which forwards no user
identifiers (no cookies, no client IP, no user agent of the family's
devices) and caches results in Redis. Disabled until an admin stores
their own API key (encrypted at rest).
"""
import hashlib
import json

import httpx
import redis.asyncio as aioredis
from sqlalchemy import select

from app.config import get_settings
from app.models import AppSetting
from app.services.crypto import decrypt_token

SETTING_KEY = "giphy_api_key"
SEARCH_TTL_SECONDS = 3600
GIF_TTL_SECONDS = 7 * 24 * 3600
MAX_GIF_BYTES = 5 * 1024 * 1024
# Generic UA so requests can't be tied to a specific family device.
_HEADERS = {"User-Agent": "smooth-family-proxy"}

_redis: aioredis.Redis | None = None


def _get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(get_settings().redis_url, decode_responses=False)
    return _redis


async def _cache_get(key: str) -> bytes | None:
    try:
        return await _get_redis().get(key)
    except Exception:
        return None  # Redis down – just skip the cache


async def _cache_set(key: str, value: bytes, ttl: int) -> None:
    try:
        await _get_redis().set(key, value, ex=ttl)
    except Exception:
        pass


async def get_api_key(db) -> str | None:
    setting = (await db.execute(select(AppSetting).where(AppSetting.key == SETTING_KEY))).scalar_one_or_none()
    if setting is None:
        return None
    return decrypt_token(setting.value)


async def search(api_key: str, query: str) -> list[str]:
    """Return GIF ids for a search (rating G only)."""
    cache_key = "giphy:search:" + hashlib.sha256(query.strip().lower().encode()).hexdigest()
    cached = await _cache_get(cache_key)
    if cached:
        return json.loads(cached)

    async with httpx.AsyncClient(headers=_HEADERS, timeout=8.0) as client:
        resp = await client.get(
            "https://api.giphy.com/v1/gifs/search",
            params={"api_key": api_key, "q": query, "limit": 24, "rating": "g"},
        )
    resp.raise_for_status()
    ids = [g["id"] for g in resp.json().get("data", []) if g.get("id", "").isalnum()]
    await _cache_set(cache_key, json.dumps(ids).encode(), SEARCH_TTL_SECONDS)
    return ids


async def fetch_gif(gif_id: str) -> bytes:
    """Fetch the fixed-height (200px) rendition of one GIF."""
    cache_key = f"giphy:gif:{gif_id}"
    cached = await _cache_get(cache_key)
    if cached:
        return cached

    async with httpx.AsyncClient(headers=_HEADERS, timeout=10.0, follow_redirects=True) as client:
        resp = await client.get(f"https://media.giphy.com/media/{gif_id}/200.gif")
    resp.raise_for_status()
    data = resp.content
    if len(data) > MAX_GIF_BYTES:
        raise ValueError("GIF too large")
    await _cache_set(cache_key, data, GIF_TTL_SECONDS)
    return data

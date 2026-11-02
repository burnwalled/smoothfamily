"""Live updates: small "this changed" events fanned out over Redis pub/sub to every open app.

Events never carry data, only which resources to refresh (e.g. ["tasks"]); the app then
fetches them with its normal, permission-checked requests. A family channel reaches every
member's open apps, a user channel only that member's own devices. See routers/events.py.
"""
import json
import logging
import uuid

import redis.asyncio as aioredis

from app.config import get_settings

log = logging.getLogger(__name__)

_redis: aioredis.Redis | None = None


def family_channel(family_id: uuid.UUID) -> str:
    return f"events:family:{family_id}"


def user_channel(user_id: uuid.UUID) -> str:
    return f"events:user:{user_id}"


def redis_client() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(get_settings().redis_url, decode_responses=True)
    return _redis


async def _publish(channel: str, resources: list[str]) -> None:
    if not get_settings().live_events or not resources:
        return
    try:
        await redis_client().publish(channel, json.dumps({"resources": resources}))
    except Exception:  # live updates are best effort; polling still catches up
        log.debug("live event to %s not published", channel, exc_info=True)


async def publish_family(family_id: uuid.UUID, resources: list[str]) -> None:
    await _publish(family_channel(family_id), resources)


async def publish_user(user_id: uuid.UUID, resources: list[str]) -> None:
    await _publish(user_channel(user_id), resources)

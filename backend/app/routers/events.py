"""Live updates: one Server-Sent Events stream per open app.

The stream forwards the family's and the member's own "this changed" events (services/events.py)
and sends a comment every 25 seconds so proxies keep the connection open. The app refreshes
the named resources itself; nothing private travels in the stream.
"""
import asyncio
from collections.abc import AsyncIterator

from fastapi import APIRouter, HTTPException, Request, status
from fastapi.responses import StreamingResponse

from app.config import get_settings
from app.database import SessionLocal
from app.models import Family, User
from app.security import read_session, session_current
from app.services.events import family_channel, redis_client, user_channel

router = APIRouter(prefix="/api", tags=["events"])

HEARTBEAT_SECONDS = 25


@router.get("/events")
async def event_stream(request: Request) -> StreamingResponse:
    if not get_settings().live_events:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Live updates are off")
    # A short session for the sign-in check only: the stream may stay open for hours.
    user_id, version = read_session(request)
    async with SessionLocal() as db:
        user = await db.get(User, user_id)
        family = await db.get(Family, user.family_id) if user else None
    if user is None or family is None or not session_current(user, version) or family.status != "active":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User no longer exists")
    channels = [family_channel(user.family_id), user_channel(user.id)]

    async def stream() -> AsyncIterator[str]:
        pubsub = redis_client().pubsub()
        await pubsub.subscribe(*channels)
        try:
            # Reconnect after 5 s if the connection drops.
            yield "retry: 5000\n: connected\n\n"
            while not await request.is_disconnected():
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=HEARTBEAT_SECONDS)
                yield f"data: {message['data']}\n\n" if message else ": ping\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            await pubsub.unsubscribe(*channels)
            await pubsub.aclose()

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        # no-transform: proxies (Next, Caddy) must not compress the stream, which would hold it back.
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )

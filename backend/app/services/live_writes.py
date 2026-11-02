"""Turns every successful write into a live event, so all open apps refresh what changed.

`/api/tasks/...` → the family's apps refresh "tasks" (the app also refreshes related
resources, see frontend/src/lib/api.ts). Marking notifications read only goes to the member's
own devices. Marking a chat read sends nothing: the open chat marks itself read after every
refresh, so an event would make it refresh again and again.
"""
import uuid

from starlette.requests import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.config import get_settings
from app.database import SessionLocal
from app.models import User
from app.security import read_user_id_from_request
from app.services.events import publish_family, publish_user

WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
# Sign-in, push subscriptions and the stream itself change nothing other apps show.
IGNORED = {"auth", "mfa", "push", "events", "transit"}
OWN_DEVICES_ONLY = ("/api/notifications",)
IGNORED_PATHS = {"/api/chat/read"}

_family_of: dict[uuid.UUID, uuid.UUID] = {}


def resource_of(path: str) -> str | None:
    parts = path.split("/")
    if len(parts) < 3 or parts[1] != "api" or not parts[2]:
        return None
    return parts[2]


async def _family_id(user_id: uuid.UUID) -> uuid.UUID | None:
    if user_id not in _family_of:
        async with SessionLocal() as db:
            user = await db.get(User, user_id)
        if user is None:
            return None
        _family_of[user_id] = user.family_id
    return _family_of[user_id]


async def publish_write(request: Request, status_code: int) -> None:
    if status_code >= 400 or not get_settings().live_events:
        return
    path = request.url.path
    resource = resource_of(path)
    if resource is None or resource in IGNORED or path in IGNORED_PATHS:
        return
    try:
        user_id = read_user_id_from_request(request)
    except Exception:
        return
    if path.startswith(OWN_DEVICES_ONLY):
        await publish_user(user_id, [resource])
        return
    family_id = await _family_id(user_id)
    if family_id is not None:
        await publish_family(family_id, [resource])


class LiveWritesMiddleware:
    """Plain ASGI (not BaseHTTPMiddleware), so streaming responses like /api/events are untouched."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] not in WRITE_METHODS:
            await self.app(scope, receive, send)
            return
        status_code = 500

        async def capture(message: Message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
            await send(message)

        await self.app(scope, receive, capture)
        await publish_write(Request(scope), status_code)

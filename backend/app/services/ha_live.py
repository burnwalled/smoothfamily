"""Home Assistant → live updates: listens to HA's WebSocket `state_changed` events and tells the
family's open apps to refresh the smart home as soon as an exposed device changes (a lamp turned
on at the wall switch shows up at once) – and who is home, when a shared person comes or goes.

One connection per family with a Home Assistant connection; reconnects with backoff, and picks
up new or removed connections and devices every minute.
"""
import asyncio
import json
import logging
import uuid

import websockets
from sqlalchemy import select

from app.database import SessionLocal
from app.models import ExposedDevice, Family, SmarthomeConnection, User
from app.services.crypto import decrypt_token
from app.services.events import publish_family

log = logging.getLogger(__name__)

REFRESH_SECONDS = 60
# Several changes in a row (a scene switching ten lamps) become one refresh.
COALESCE_SECONDS = 0.5
MAX_BACKOFF_SECONDS = 300


def websocket_url(base_url: str) -> str:
    base = base_url.rstrip("/")
    if base.startswith("https://"):
        return "wss://" + base[len("https://"):] + "/api/websocket"
    if base.startswith("http://"):
        return "ws://" + base[len("http://"):] + "/api/websocket"
    return base + "/api/websocket"


async def _entities(family_id: uuid.UUID) -> set[str]:
    """The exposed devices, and the person and direction entities of members sharing presence."""
    async with SessionLocal() as db:
        rows = await db.execute(select(ExposedDevice.entity_id).where(ExposedDevice.family_id == family_id))
        entities = set(rows.scalars().all())
        people = await db.execute(
            select(User.ha_person_entity, User.ha_travel_entity).where(User.family_id == family_id, User.presence_share != "off")
        )
        for person, travel in people.all():
            entities |= {e for e in (person, travel) if e}
        return entities


async def _listen(family_id: uuid.UUID, base_url: str, token: str, stop: asyncio.Event) -> None:
    """Runs until the connection drops (raises) or `stop` is set."""
    entities = await _entities(family_id)
    async with websockets.connect(websocket_url(base_url), open_timeout=15, ping_interval=30) as ws:
        hello = json.loads(await ws.recv())
        if hello.get("type") != "auth_required":
            raise RuntimeError(f"unexpected greeting {hello.get('type')}")
        await ws.send(json.dumps({"type": "auth", "access_token": token}))
        if json.loads(await ws.recv()).get("type") != "auth_ok":
            raise PermissionError("Home Assistant rejected the token")
        await ws.send(json.dumps({"id": 1, "type": "subscribe_events", "event_type": "state_changed"}))

        loop = asyncio.get_running_loop()
        next_entities_check = loop.time() + REFRESH_SECONDS
        pending = False
        while not stop.is_set():
            try:
                raw = await asyncio.wait_for(ws.recv(), timeout=COALESCE_SECONDS if pending else 5)
            except asyncio.TimeoutError:
                raw = None
            if raw is None:
                if pending:
                    await publish_family(family_id, ["smarthome", "presence"])
                    pending = False
            else:
                message = json.loads(raw)
                if message.get("type") == "event":
                    data = message.get("event", {}).get("data", {})
                    entity = data.get("entity_id")
                    if entity in entities:
                        pending = True
                        old, new = (data.get("old_state") or {}).get("state"), (data.get("new_state") or {}).get("state")
                        if old != new:
                            # Flows that start on this change run beside the listener.
                            asyncio.create_task(_flows_on_change(family_id, entity, old, new))
            if loop.time() > next_entities_check:
                entities = await _entities(family_id)
                next_entities_check = loop.time() + REFRESH_SECONDS


async def _flows_on_change(family_id: uuid.UUID, entity_id: str, old: str | None, new: str | None) -> None:
    from app.services.flows import on_state_change

    try:
        async with SessionLocal() as db:
            await on_state_change(db, family_id, entity_id, old, new)
    except Exception:
        log.exception("Flows: could not handle %s for family %s", entity_id, family_id)


async def _run_connection(family_id: uuid.UUID, base_url: str, token: str, stop: asyncio.Event) -> None:
    backoff = 5
    while not stop.is_set():
        try:
            await _listen(family_id, base_url, token, stop)
            backoff = 5
        except asyncio.CancelledError:
            raise
        except PermissionError:
            log.warning("Home Assistant live updates: token rejected for family %s", family_id)
            backoff = MAX_BACKOFF_SECONDS
        except Exception as exc:
            log.info("Home Assistant live updates for family %s dropped: %s", family_id, exc)
            backoff = min(backoff * 2, MAX_BACKOFF_SECONDS)
        try:
            await asyncio.wait_for(stop.wait(), timeout=backoff)
        except asyncio.TimeoutError:
            pass


async def ha_live_worker(stop: asyncio.Event) -> None:
    running: dict[uuid.UUID, tuple[str, asyncio.Task]] = {}
    try:
        while not stop.is_set():
            try:
                async with SessionLocal() as db:
                    connections = (
                        await db.execute(
                            select(SmarthomeConnection).join(Family, Family.id == SmarthomeConnection.family_id).where(Family.kind == "owner", ~SmarthomeConnection.base_url.like("gateway://%"))
                        )
                    ).scalars().all()
                # A simulated Home Assistant tells about its changes itself (services/ha_sim.py).
                wanted = {c.family_id: (c.base_url, c.token_encrypted) for c in connections if not c.base_url.startswith("sim://")}
                for family_id, (key, task) in list(running.items()):
                    if wanted.get(family_id, (None, None))[1] != key or task.done():
                        task.cancel()
                        del running[family_id]
                for family_id, (base_url, token_encrypted) in wanted.items():
                    if family_id not in running:
                        token = decrypt_token(token_encrypted)
                        task = asyncio.create_task(_run_connection(family_id, base_url, token, stop))
                        running[family_id] = (token_encrypted, task)
            except Exception:
                log.exception("Home Assistant live updates: could not load connections")
            try:
                await asyncio.wait_for(stop.wait(), timeout=REFRESH_SECONDS)
            except asyncio.TimeoutError:
                pass
    finally:
        for _, task in running.values():
            task.cancel()

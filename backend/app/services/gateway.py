"""Home Assistant in another home through the Smooth Family gateway (2.8.4).

The gateway runs next to that home's Home Assistant (as an add-on, or on a small computer) and
calls this server over HTTPS, keeping a websocket open – no port is opened at the other home. The
Home Assistant token stays there: this server can only ask the gateway for states and for service
calls, and the gateway only answers for the domains its owner allows.

A connection through a gateway has the address `gateway://<connection id>`; the Home Assistant
client (services/homeassistant.py) sends its calls here instead of over HTTP. The open gateways
live in this process's memory (the backend runs one process).

Nothing is queued while a gateway is away: a command sent two hours late ("unlock") is worse than
an error now.
"""
import asyncio
import hashlib
import json
import secrets
import uuid
from dataclasses import dataclass, field
from typing import Any

from fastapi import WebSocket

PREFIX = "gateway://"
TIMEOUT = 15.0


class GatewayError(Exception):
    pass


def is_gateway(base_url: str) -> bool:
    return base_url.startswith(PREFIX)


def address(connection_id: uuid.UUID) -> str:
    return f"{PREFIX}{connection_id}"


def connection_id(base_url: str) -> uuid.UUID:
    return uuid.UUID(base_url[len(PREFIX):])


def new_secret(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


def new_pairing_code() -> str:
    """Eight letters and digits that are easy to read and type (no 0/O, 1/I/L)."""
    alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(8))


def digest(secret: str) -> str:
    """Only a hash of a gateway's key or pairing code is kept."""
    return hashlib.sha256(secret.encode()).hexdigest()


def normalise_code(code: str) -> str:
    return "".join(ch for ch in code.upper() if ch.isalnum())


@dataclass
class _Session:
    socket: WebSocket
    version: str = ""
    domains: list[str] = field(default_factory=list)
    auto_update: bool = False
    pending: dict[str, asyncio.Future] = field(default_factory=dict)


_open: dict[uuid.UUID, _Session] = {}


def online(conn_id: uuid.UUID) -> bool:
    return conn_id in _open


def info(conn_id: uuid.UUID) -> dict:
    session = _open.get(conn_id)
    return {
        "online": session is not None,
        "version": session.version if session else None,
        "domains": session.domains if session else [],
        "auto_update": session.auto_update if session else None,
    }


async def serve(conn_id: uuid.UUID, socket: WebSocket, hello: dict) -> None:
    """Keep one gateway's websocket: route answers to the calls waiting for them."""
    old = _open.get(conn_id)
    if old is not None:  # the gateway reconnected: the old socket is dead
        await _close(old)
    session = _Session(socket=socket, version=str(hello.get("version", ""))[:40], domains=[str(d)[:40] for d in hello.get("domains", [])][:40], auto_update=hello.get("auto_update") is True)
    _open[conn_id] = session
    try:
        while True:
            message = json.loads(await socket.receive_text())
            future = session.pending.pop(str(message.get("id", "")), None)
            if future is not None and not future.done():
                future.set_result(message)
    finally:
        if _open.get(conn_id) is session:
            del _open[conn_id]
        for future in session.pending.values():
            if not future.done():
                future.set_exception(GatewayError("The gateway went away"))


async def _close(session: _Session) -> None:
    try:
        await session.socket.close()
    except Exception:
        pass


async def disconnect(conn_id: uuid.UUID) -> None:
    session = _open.pop(conn_id, None)
    if session is not None:
        await _close(session)


async def request(base_url: str, op: str, **args: Any) -> Any:
    session = _open.get(connection_id(base_url))
    if session is None:
        raise GatewayError("The other home's gateway isn't connected right now")
    call_id = uuid.uuid4().hex
    future: asyncio.Future = asyncio.get_running_loop().create_future()
    session.pending[call_id] = future
    try:
        await session.socket.send_text(json.dumps({"id": call_id, "op": op, **args}))
        answer = await asyncio.wait_for(future, TIMEOUT)
    except asyncio.TimeoutError as exc:
        raise GatewayError("The other home's gateway didn't answer in time") from exc
    finally:
        session.pending.pop(call_id, None)
    if not answer.get("ok"):
        raise GatewayError(str(answer.get("error") or "The gateway refused")[:200])
    return answer.get("result")


async def get_states(base_url: str) -> list[dict]:
    return list(await request(base_url, "states") or [])


async def get_state(base_url: str, entity_id: str) -> dict:
    return dict(await request(base_url, "state", entity_id=entity_id) or {})


async def call_service(base_url: str, domain: str, service: str, entity_id: str, data: dict | None = None) -> None:
    await request(base_url, "call", domain=domain, service=service, entity_id=entity_id, data=data or {})

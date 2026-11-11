"""The Smooth Family gateway's side of the server (2.8.4): pairing once with a code, then a websocket
the gateway keeps open. See services/gateway.py."""
import json
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.database import SessionLocal
from app.deps import DB
from app.models import SmarthomeConnection
from app.models import User
from app.services import gateway, gateway_release, login_throttle
from app.services import geo
from app.services.notify import notify

router = APIRouter(prefix="/api/gateway", tags=["gateway"])


class PairIn(BaseModel):
    code: str = Field(min_length=6, max_length=20)
    version: str = Field(default="", max_length=40)


class PairOut(BaseModel):
    key: str
    name: str


@router.post("/pair", response_model=PairOut)
async def pair(payload: PairIn, request: Request, db: DB) -> PairOut:
    """The code shown in Smart home settings, once: the gateway gets its own key (kept only as a hash
    here). Guessing is throttled like a sign-in."""
    ip = login_throttle.client_ip(request)
    if login_throttle.ip_retry_after(ip, await geo.outside(db, ip)):
        raise HTTPException(status_code=429, detail="Too many attempts. Try again later.")
    code = gateway.normalise_code(payload.code)
    conn = (await db.execute(select(SmarthomeConnection).where(SmarthomeConnection.gateway_code_hash == gateway.digest(code)))).scalar_one_or_none()
    now = datetime.now(timezone.utc)
    expires = conn.gateway_code_expires if conn else None
    if expires is not None and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if conn is None or expires is None or expires < now:
        login_throttle.record_ip_failure(ip)
        raise HTTPException(status_code=401, detail="The pairing code is wrong or too old – make a new one in Smart home settings")
    key = gateway.new_secret()
    conn.gateway_key_hash = gateway.digest(key)
    conn.gateway_code_hash = None
    conn.gateway_code_expires = None
    conn.gateway_version = payload.version or None
    await db.commit()
    await gateway.disconnect(conn.id)  # a gateway paired before this one is let go
    return PairOut(key=key, name=conn.name)


async def _by_key(request: Request, db) -> SmarthomeConnection:
    auth = request.headers.get("authorization", "")
    key = auth[7:].strip() if auth.lower().startswith("bearer ") else ""
    conn = (await db.execute(select(SmarthomeConnection).where(SmarthomeConnection.gateway_key_hash == gateway.digest(key)))).scalar_one_or_none() if key else None
    if conn is None:
        raise HTTPException(status_code=401, detail="Not a paired gateway")
    return conn


@router.get("/release")
async def latest_release(request: Request, db: DB) -> dict:
    """The newest gateway's version, checksum and signature – for paired gateways only."""
    await _by_key(request, db)
    found = gateway_release.release()
    if found is None:
        raise HTTPException(status_code=404, detail="No gateway release on this server")
    return found


@router.get("/release/file")
async def latest_program(request: Request, db: DB) -> Response:
    await _by_key(request, db)
    if gateway_release.release() is None:
        raise HTTPException(status_code=404, detail="No gateway release on this server")
    return Response(gateway_release.program(), media_type="text/x-python")


_TOLD = {
    "en": ("Update for the gateway", "{home} runs gateway {old} – {new} is out. It updates itself when auto_update is on in its options; otherwise update it there."),
    "sv": ("Uppdatering för gatewayen", "{home} kör gateway {old} – {new} finns. Den uppdaterar sig själv när auto_update är på i dess inställningar; annars uppdaterar du den där."),
    "nb": ("Oppdatering for gatewayen", "{home} kjører gateway {old} – {new} finnes. Den oppdaterer seg selv når auto_update er på i innstillingene; ellers oppdaterer du den der."),
    "da": ("Opdatering til gatewayen", "{home} kører gateway {old} – {new} findes. Den opdaterer sig selv, når auto_update er slået til i dens indstillinger; ellers opdaterer du den der."),
    "fi": ("Päivitys yhdyskäytävälle", "{home} käyttää yhdyskäytävää {old} – {new} on saatavilla. Se päivittyy itse, kun auto_update on päällä sen asetuksissa; muuten päivitä se siellä."),
}


async def _tell_if_old(db, conn: SmarthomeConnection, hello: dict) -> None:
    """A gateway that won't update itself and is behind: the family's admins hear of it, once per
    version (one that updates itself does so within minutes – no need to bother anyone)."""
    latest = gateway_release.latest_version()
    if hello.get("auto_update") is True or not gateway_release.older(conn.gateway_version, latest) or conn.gateway_update_told == latest:
        return
    managers = (
        await db.execute(select(User).where(User.family_id == conn.family_id, (User.role == "admin") | (User.can_manage_family.is_(True))))
    ).scalars().all()
    for user in managers:
        title, body = _TOLD.get(user.language or "en", _TOLD["en"])
        await notify(db, user, {"title": title, "body": body.format(home=conn.name, old=conn.gateway_version, new=latest), "route": "/settings/smarthome", "kind": "gateway_update"})
    conn.gateway_update_told = latest


@router.websocket("/ws")
async def gateway_socket(socket: WebSocket) -> None:
    """The gateway's line: authenticated by its key (Authorization: Bearer …), then it says hello
    with its version and the domains its owner allows, and answers the server's calls."""
    auth = socket.headers.get("authorization", "")
    key = auth[7:].strip() if auth.lower().startswith("bearer ") else ""
    async with SessionLocal() as db:
        conn = (await db.execute(select(SmarthomeConnection).where(SmarthomeConnection.gateway_key_hash == gateway.digest(key)))).scalar_one_or_none() if key else None
        if conn is None:
            await socket.close(code=4401)
            return
        from app.models import Family
        from app.services.smarthome_conn import hosted_allowed

        family = await db.get(Family, conn.family_id)
        if family is None or (family.kind == "hosted" and not await hosted_allowed(db)) or family.status == "paused":
            await socket.close(code=4403)
            return
        conn_id = conn.id
    await socket.accept()
    try:
        hello = json.loads(await socket.receive_text())
        if hello.get("op") != "hello":
            await socket.close(code=4400)
            return
        async with SessionLocal() as db:
            conn = await db.get(SmarthomeConnection, conn_id)
            conn.gateway_last_seen = datetime.now(timezone.utc)
            conn.gateway_version = str(hello.get("version", ""))[:40] or None
            if hello.get("runs_in") in ("addon", "docker"):
                conn.gateway_runs_in = hello["runs_in"]
            await _tell_if_old(db, conn, hello)
            await db.commit()
        await gateway.serve(conn_id, socket, hello)
    except (WebSocketDisconnect, json.JSONDecodeError, RuntimeError):
        pass
    finally:
        async with SessionLocal() as db:
            conn = await db.get(SmarthomeConnection, conn_id)
            if conn is not None:
                conn.gateway_last_seen = datetime.now(timezone.utc)
                await db.commit()

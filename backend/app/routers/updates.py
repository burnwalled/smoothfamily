"""Server settings → Updates (2.9.0): what runs, what newer versions there are, and when they may be
put in. See services/updates.py – the app plans, the server's update.sh does the Docker work."""
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import get_settings
from app.deps import DB, ServerAdmin
from sqlalchemy import select

from app.models import Family, SmarthomeConnection
from app.services import families as fam
from app.services import gateway, gateway_release, updates

router = APIRouter(prefix="/api/admin/updates", tags=["updates"])


class SettingsIn(BaseModel):
    # auto: put in at the window by itself; approve: ask the admin first; off: don't look.
    mode: str = Field(pattern="^(auto|approve|off)$")
    day: int = Field(ge=0, le=6)
    hour: int = Field(ge=0, le=23)


async def _gateways(db) -> dict:
    """Every gateway on the server (3.0.1) – the version each reported when it last connected, so the
    server admin sees they're up to date. Only names and versions: nothing of what they switch."""
    latest = gateway_release.latest_version()
    rows = (
        await db.execute(
            select(SmarthomeConnection, Family.name).join(Family, Family.id == SmarthomeConnection.family_id).where(SmarthomeConnection.base_url.like(f"{gateway.PREFIX}%")).order_by(Family.name, SmarthomeConnection.name)
        )
    ).all()
    items = []
    for conn, family in rows:
        live = gateway.info(conn.id)
        items.append({
            "family": family,
            "home": conn.name,
            "version": live["version"] or conn.gateway_version,
            "online": live["online"],
            "auto_update": live["auto_update"],
            "last_seen": conn.gateway_last_seen.isoformat() if conn.gateway_last_seen else None,
            "pairing": conn.gateway_key_hash is None,
            "up_to_date": not gateway_release.older(live["version"] or conn.gateway_version, latest),
        })
    return {"latest": latest, "items": items}


async def _overview(db) -> dict:
    status = await updates.get_status(db)
    settings = await updates.get_settings_(db)
    return {
        "app_version": get_settings().app_version or None,
        # update.sh has run (it writes the state); without it nothing can be updated.
        "connected": bool(status.get("seen")),
        "state_at": status.get("state_at"),
        "checked_at": status.get("checked_at"),
        "running": status.get("running") or {},
        "available": status.get("available") or {},
        "planned": status.get("planned"),
        "last_run": status.get("last_run"),
        "settings": settings,
        "next_window": updates.next_window(settings, datetime.now(timezone.utc)).isoformat(),
        "gateways": await _gateways(db),
    }


@router.get("")
async def get_updates(admin: ServerAdmin, db: DB) -> dict:
    return await _overview(db)


@router.put("/settings")
async def set_update_settings(payload: SettingsIn, admin: ServerAdmin, db: DB) -> dict:
    await updates.set_settings(db, payload.mode, payload.day, payload.hour)
    if payload.mode == "off":
        updates.cancel_plan()
        status = await updates.get_status(db)
        status.pop("planned", None)
        await updates._put(db, updates.STATUS, status)
    return await _overview(db)


@router.post("/check")
async def check_now(admin: ServerAdmin, db: DB) -> dict:
    await updates.check(db)
    return await _overview(db)


@router.post("/approve")
async def approve(admin: ServerAdmin, db: DB, now: bool = False) -> dict:
    """Plan the available versions for the next window – or for update.sh's next hourly run."""
    if not await updates.plan(db, at_once=now):
        raise HTTPException(status_code=409, detail="Nothing to update")
    await fam.log(db, admin, "updates_planned", None, "now" if now else "window")
    return await _overview(db)


@router.delete("/plan")
async def cancel(admin: ServerAdmin, db: DB) -> dict:
    updates.cancel_plan()
    status = await updates.get_status(db)
    status.pop("planned", None)
    await updates._put(db, updates.STATUS, status)
    await fam.log(db, admin, "updates_cancelled", None)
    return await _overview(db)

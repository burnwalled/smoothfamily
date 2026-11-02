"""Flows (#44) in the Smart home app: list, build, pause, approve, run now, and the media picker."""
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, or_, select

from app.deps import DB, CurrentUser, require_app, require_smarthome_host
from app.services import smarthome_conn
from app.models import ExposedDevice, SmarthomeConnection, SmarthomeFlow, User
from app.services import flows as engine
from app.services import ha_publish
from app.services import homeassistant as ha
from app.services.crypto import decrypt_token

router = APIRouter(prefix="/api/smarthome", tags=["flows"], dependencies=[require_app("smarthome"), Depends(require_smarthome_host)])


class FlowOut(BaseModel):
    id: uuid.UUID
    owner_id: uuid.UUID
    owner_name: str
    name: str
    enabled: bool
    shared: bool
    approved: bool
    on_today: bool
    trigger: dict
    conditions: list
    actions: list
    last_run_at: datetime | None
    last_error: str | None
    can_edit: bool
    run_in: str = "app"
    ha_synced_at: datetime | None = None


class EnabledIn(BaseModel):
    enabled: bool


class MediaItem(BaseModel):
    title: str
    media_content_id: str
    media_content_type: str
    can_play: bool
    can_expand: bool
    thumbnail: str | None = None


def _adult(user: User) -> bool:
    return user.role in {"admin", "adult"}


def _can_edit(user: User, flow: SmarthomeFlow) -> bool:
    return flow.owner_id == user.id or user.role == "admin"


async def _out(db, user: User, flow: SmarthomeFlow) -> FlowOut:
    owner = await db.get(User, flow.owner_id)
    return FlowOut(
        id=flow.id, owner_id=flow.owner_id, owner_name=owner.display_name if owner else "", name=flow.name, enabled=flow.enabled,
        shared=flow.shared, approved=flow.approved, on_today=flow.on_today, trigger=flow.trigger, conditions=flow.conditions or [],
        actions=flow.actions or [], last_run_at=flow.last_run_at, last_error=flow.last_error, can_edit=_can_edit(user, flow),
        run_in=flow.run_in or "app", ha_synced_at=flow.ha_synced_at,
    )


async def _visible(db, user: User, flow_id: uuid.UUID) -> SmarthomeFlow:
    flow = await db.get(SmarthomeFlow, flow_id)
    if flow is None or flow.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Flow not found")
    owner = await db.get(User, flow.owner_id)
    if flow.owner_id != user.id and not flow.shared and not (_adult(user) and owner and owner.role == "child"):
        raise HTTPException(status_code=404, detail="Flow not found")
    return flow


async def _editable(db, user: User, flow_id: uuid.UUID) -> SmarthomeFlow:
    flow = await _visible(db, user, flow_id)
    if not _can_edit(user, flow):
        raise HTTPException(status_code=403, detail="Only the one who made the flow can change it")
    return flow


class HaStatus(BaseModel):
    # Flows can be published to Home Assistant (a real one, with an admin user's token).
    available: bool


async def _sync(db, flow: SmarthomeFlow) -> None:
    """Brings Home Assistant in line; a failure is shown on the flow rather than lost."""
    try:
        await ha_publish.sync_flow(db, flow)
        if flow.last_error and flow.last_error.startswith("Home Assistant:"):
            flow.last_error = None
    except Exception as exc:
        flow.last_error = f"Home Assistant: {exc}"[:300]
    await db.commit()


async def _check_ha(db, user: User, payload: engine.FlowIn) -> None:
    if payload.run_in != "ha":
        return
    reason = ha_publish.why_not(payload.model_dump(mode="json")["trigger"], payload.model_dump(mode="json")["conditions"], payload.model_dump(mode="json")["actions"])
    if reason:
        raise HTTPException(status_code=422, detail=f"Home Assistant can't run this on its own ({reason})")
    if not await ha_publish.available(db, user.family_id):
        raise HTTPException(status_code=409, detail="Home Assistant doesn't let Smooth Family create automations (an admin user's token is needed)")


@router.get("/flows/ha", response_model=HaStatus)
async def ha_status(user: CurrentUser, db: DB) -> HaStatus:
    return HaStatus(available=await ha_publish.available(db, user.family_id))


def _store(flow: SmarthomeFlow, payload: engine.FlowIn) -> None:
    data = payload.model_dump(mode="json")
    flow.run_in = payload.run_in
    flow.name = payload.name.strip()
    flow.trigger = data["trigger"]
    flow.conditions = data["conditions"]
    flow.actions = data["actions"]
    flow.shared = payload.shared
    flow.on_today = payload.on_today and payload.trigger.type == "button"


@router.get("/flows", response_model=list[FlowOut])
async def list_flows(user: CurrentUser, db: DB) -> list[FlowOut]:
    """Mine, the family's shared ones, and (for adults) the children's."""
    rows = (await db.execute(select(SmarthomeFlow).where(SmarthomeFlow.family_id == user.family_id).order_by(SmarthomeFlow.created_at))).scalars().all()
    children = {m.id for m in (await db.execute(select(User).where(User.family_id == user.family_id, User.role == "child"))).scalars()}
    shown = [f for f in rows if f.owner_id == user.id or f.shared or (_adult(user) and f.owner_id in children)]
    return [await _out(db, user, f) for f in shown]


@router.get("/flows/today", response_model=list[FlowOut])
async def today_buttons(user: CurrentUser, db: DB) -> list[FlowOut]:
    """Button flows starred for the Today card: my own, and shared ones."""
    rows = (
        await db.execute(
            select(SmarthomeFlow).where(
                SmarthomeFlow.family_id == user.family_id, SmarthomeFlow.on_today == True, SmarthomeFlow.enabled == True,  # noqa: E712
                SmarthomeFlow.approved == True, or_(SmarthomeFlow.owner_id == user.id, SmarthomeFlow.shared == True),  # noqa: E712
            ).order_by(SmarthomeFlow.created_at)
        )
    ).scalars().all()
    return [await _out(db, user, f) for f in rows]


@router.post("/flows", response_model=FlowOut, status_code=status.HTTP_201_CREATED)
async def create_flow(payload: engine.FlowIn, user: CurrentUser, db: DB) -> FlowOut:
    count = (await db.execute(select(func.count()).select_from(SmarthomeFlow).where(SmarthomeFlow.owner_id == user.id))).scalar_one()
    if count >= engine.MAX_FLOWS:
        raise HTTPException(status_code=409, detail=f"You can have at most {engine.MAX_FLOWS} flows")
    try:
        await engine.check_flow(db, user, payload)
    except engine.FlowError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    await _check_ha(db, user, payload)
    flow = SmarthomeFlow(family_id=user.family_id, owner_id=user.id, approved=user.role != "child")
    _store(flow, payload)
    db.add(flow)
    await db.commit()
    if flow.run_in == "ha":
        await _sync(db, flow)
    return await _out(db, user, flow)


@router.put("/flows/{flow_id}", response_model=FlowOut)
async def update_flow(flow_id: uuid.UUID, payload: engine.FlowIn, user: CurrentUser, db: DB) -> FlowOut:
    flow = await _editable(db, user, flow_id)
    owner = await db.get(User, flow.owner_id)
    try:
        await engine.check_flow(db, owner, payload)
    except engine.FlowError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    await _check_ha(db, owner, payload)
    was_in_ha = flow.run_in == "ha"
    _store(flow, payload)
    if owner.role == "child" and not _adult(user):
        flow.approved = False  # changed by the child: an adult looks again
    await db.commit()
    if was_in_ha or flow.run_in == "ha":
        await _sync(db, flow)
    return await _out(db, user, flow)


@router.delete("/flows/{flow_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_flow(flow_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    flow = await _visible(db, user, flow_id)
    owner = await db.get(User, flow.owner_id)
    if not (_can_edit(user, flow) or (_adult(user) and owner and owner.role == "child")):
        raise HTTPException(status_code=403, detail="Only the one who made the flow can remove it")
    try:
        await ha_publish.remove_flow(db, flow)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"The automation in Home Assistant couldn't be removed: {exc}")
    await db.delete(flow)
    await db.commit()


@router.put("/flows/{flow_id}/enabled", response_model=FlowOut)
async def set_enabled(flow_id: uuid.UUID, payload: EnabledIn, user: CurrentUser, db: DB) -> FlowOut:
    flow = await _visible(db, user, flow_id)
    owner = await db.get(User, flow.owner_id)
    # The owner, or an adult for a child's flow, can pause it.
    if not (_can_edit(user, flow) or (_adult(user) and owner and owner.role == "child")):
        raise HTTPException(status_code=403, detail="Only the one who made the flow can pause it")
    flow.enabled = payload.enabled
    await db.commit()
    if flow.run_in == "ha":
        await _sync(db, flow)
    return await _out(db, user, flow)


@router.post("/flows/{flow_id}/approve", response_model=FlowOut)
async def approve_flow(flow_id: uuid.UUID, user: CurrentUser, db: DB) -> FlowOut:
    if not _adult(user):
        raise HTTPException(status_code=403, detail="An adult approves children's flows")
    flow = await _visible(db, user, flow_id)
    flow.approved = True
    await db.commit()
    if flow.run_in == "ha":
        await _sync(db, flow)
    return await _out(db, user, flow)


@router.post("/flows/{flow_id}/run", response_model=FlowOut)
async def run_now(flow_id: uuid.UUID, user: CurrentUser, db: DB) -> FlowOut:
    """Run now (the button on Today, or "Run now"): the If part is skipped."""
    flow = await _visible(db, user, flow_id)
    if not flow.enabled or not flow.approved:
        raise HTTPException(status_code=409, detail="The flow is paused or waiting for approval")
    await engine.start(db, flow, check=False)
    await db.refresh(flow)
    return await _out(db, user, flow)


@router.get("/media/browse", response_model=list[MediaItem])
async def browse_media(user: CurrentUser, db: DB, device_id: uuid.UUID, content_id: str | None = None, content_type: str | None = None) -> list[MediaItem]:
    """What a speaker can play – Sonos favourites, Spotify playlists … – one level at a time."""
    device = await db.get(ExposedDevice, device_id)
    if device is None or device.family_id != user.family_id or device.domain != "media_player" or not engine._allowed(device, user):
        raise HTTPException(status_code=404, detail="Speaker not found")
    conn = await smarthome_conn.primary(db, user.family_id)
    if conn is None:
        raise HTTPException(status_code=404, detail="No connection configured")
    token = decrypt_token(conn.token_encrypted)
    # Inside Home Assistant's own media sources (radio, my media …) – or the speaker can't browse.
    in_sources = bool(content_id and content_id.startswith("media-source://"))
    result = None
    if not in_sources:
        message = {"type": "media_player/browse_media", "entity_id": device.entity_id}
        if content_id and content_type:
            message |= {"media_content_id": content_id, "media_content_type": content_type}
        try:
            result = await ha.ws_call(conn.base_url, token, message)
        except Exception as exc:
            if content_id:
                raise HTTPException(status_code=502, detail=f"Home Assistant: {exc}")
            # Some speakers (e.g. through a bridge) can't browse: offer Home Assistant's media
            # sources instead – radio, own music – which most speakers can play.
            in_sources = True
    if in_sources:
        message = {"type": "media_source/browse_media"} | ({"media_content_id": content_id} if content_id else {})
        try:
            result = await ha.ws_call(conn.base_url, token, message)
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Home Assistant: {exc}")
    return [
        MediaItem(
            title=c.get("title") or "", media_content_id=c.get("media_content_id") or "", media_content_type=c.get("media_content_type") or "",
            can_play=bool(c.get("can_play")), can_expand=bool(c.get("can_expand")), thumbnail=c.get("thumbnail"),
        )
        for c in (result or {}).get("children") or []
    ]

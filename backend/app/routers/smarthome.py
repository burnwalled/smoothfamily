"""Smart home integration: Home Assistant connection, devices, and actions."""
import json
import uuid
from typing import Any

from datetime import datetime, timedelta, timezone

from fastapi import Depends, APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.config import get_settings
from app.deps import CurrentUser, DB, FamilyManager, require_app, require_smarthome_host
from app.services import gateway_release, smarthome_conn
from app.models import ExposedDevice, Family, SmarthomeConnection
from app.services.crypto import decrypt_token, encrypt_token
from app.services import gateway, ha_sim
from app.services import homeassistant as ha
from app.models import Property

router = APIRouter(prefix="/api/smarthome", tags=["smarthome"], dependencies=[require_app("smarthome"), Depends(require_smarthome_host)])

SUPPORTED_DOMAINS = ha.SUPPORTED_DOMAINS

# Redis cache TTL for device states
STATE_CACHE_TTL = 5


# ── Schemas ───────────────────────────────────────────────────────────────────

class ConnectionIn(BaseModel):
    base_url: str = Field(min_length=1, max_length=500)
    token: str = Field(min_length=1)


class ConnectionOut(BaseModel):
    id: uuid.UUID
    provider: str
    base_url: str
    created_at: str
    # A simulated Home Assistant (demo / trying it out), see services/ha_sim.py.
    simulated: bool = False


class SimPersonIn(BaseModel):
    entity_id: str = Field(pattern=r"^person\.[a-z0-9_]+$")
    state: str = Field(pattern=r"^(home|not_home)$")
    # Proximity's direction of travel; "towards" = on the way home.
    direction: str | None = Field(default=None, pattern=r"^(towards|away_from|stationary)$")


class SimPerson(BaseModel):
    entity_id: str
    name: str
    state: str
    direction: str


def _conn_out(conn: SmarthomeConnection) -> ConnectionOut:
    return ConnectionOut(
        id=conn.id, provider=conn.provider, base_url="" if ha_sim.is_sim(conn.base_url) else conn.base_url,
        created_at=conn.created_at.isoformat(), simulated=ha_sim.is_sim(conn.base_url),
    )


class EntityOut(BaseModel):
    entity_id: str
    domain: str
    name: str
    state: str


class DeviceIn(BaseModel):
    entity_id: str = Field(min_length=1, max_length=200)
    display_name: str = Field(min_length=1, max_length=200)
    domain: str = Field(min_length=1, max_length=40)
    position: int = 0
    allowed_user_ids: list[str] = []
    # Which Home Assistant (2.8.4); the main one when left out.
    connection_id: uuid.UUID | None = None


class DeviceOut(BaseModel):
    id: uuid.UUID
    connection_id: uuid.UUID | None = None
    entity_id: str
    display_name: str
    domain: str
    position: int
    allowed_user_ids: list[str]


class DeviceStateOut(BaseModel):
    id: uuid.UUID
    entity_id: str
    display_name: str
    domain: str
    state: str
    position: int
    attributes: dict[str, Any] = {}
    favorite: bool = True  # on this user's Today card
    # The home it is in (when the family has more than one Home Assistant), and whether it answers.
    home: str | None = None
    online: bool = True


class HomeConnOut(BaseModel):
    id: uuid.UUID
    name: str
    property_id: uuid.UUID | None
    property_name: str | None
    kind: str  # direct | gateway | simulated
    base_url: str
    online: bool
    last_seen: datetime | None
    version: str | None
    # The gateway still waits for its pairing code.
    pairing: bool
    # The newest gateway (3.0.1), and whether this one fetches it by itself (None while offline).
    latest_version: str | None = None
    update_available: bool = False
    auto_update: bool | None = None


class HomeConnPatch(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    property_id: uuid.UUID | None = None


class GatewayIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    property_id: uuid.UUID | None = None


class PairingOut(BaseModel):
    connection: HomeConnOut
    code: str
    expires_at: datetime


class FavoritesIn(BaseModel):
    device_ids: list[uuid.UUID] = Field(max_length=500)


class ActionIn(BaseModel):
    action: str = Field(min_length=1, max_length=40)  # see ha.resolve_action
    value: float | None = None  # brightness %, kelvin, position, percentage or °C


# ── Admin: connection management ─────────────────────────────────────────────

@router.get("/connection")
async def get_connection(admin: FamilyManager, db: DB) -> ConnectionOut | None:
    conn = await smarthome_conn.primary(db, admin.family_id)
    if not conn:
        return None
    return _conn_out(conn)


@router.put("/connection")
async def upsert_connection(body: ConnectionIn, admin: FamilyManager, db: DB) -> ConnectionOut:
    if (await db.get(Family, admin.family_id)).kind != "owner" or ha_sim.is_sim(body.base_url):
        raise HTTPException(status_code=403, detail="A demo family uses the simulated home")
    # Validate by calling HA
    valid = await ha.validate_connection(body.base_url, body.token)
    if not valid:
        raise HTTPException(status_code=422, detail="Could not connect to Home Assistant. Check URL and token.")

    encrypted = encrypt_token(body.token)
    conn = await smarthome_conn.primary(db, admin.family_id)

    if conn:
        conn.base_url = body.base_url
        conn.token_encrypted = encrypted
    else:
        conn = SmarthomeConnection(
            family_id=admin.family_id,
            provider="home_assistant",
            base_url=body.base_url,
            token_encrypted=encrypted,
        )
        db.add(conn)

    await db.commit()
    await db.refresh(conn)
    return _conn_out(conn)


@router.post("/connection/simulated")
async def use_simulated(admin: FamilyManager, db: DB) -> ConnectionOut:
    """A made-up home to try devices, flows and presence without Home Assistant."""
    await ha_sim.set_up(db, admin.family_id)
    await db.commit()
    return await get_connection(admin, db)


async def _sim_conn(db, user) -> SmarthomeConnection:
    conn = await smarthome_conn.primary(db, user.family_id)
    if conn is None or not ha_sim.is_sim(conn.base_url):
        raise HTTPException(status_code=404, detail="Not a simulated home")
    return conn


@router.get("/simulator", response_model=list[SimPerson])
async def simulator(user: CurrentUser, db: DB) -> list[SimPerson]:
    """The simulated home's people, to move them home and away."""
    conn = await _sim_conn(db, user)
    states = {s["entity_id"]: s for s in await ha.get_states(conn.base_url, "")}
    return [
        SimPerson(
            entity_id=e, name=s["attributes"].get("friendly_name", e), state=s["state"],
            direction=states.get("sensor.home_" + e.split(".", 1)[1] + "_direction_of_travel", {}).get("state", "stationary"),
        )
        for e, s in states.items()
        if e.startswith("person.")
    ]


@router.post("/simulator/people", response_model=list[SimPerson])
async def move_person(body: SimPersonIn, user: CurrentUser, db: DB) -> list[SimPerson]:
    if user.role not in {"admin", "adult"}:
        raise HTTPException(status_code=403, detail="Adults move the simulated people")
    conn = await _sim_conn(db, user)
    direction = body.direction if body.direction else ("stationary" if body.state == "home" else None)
    ha_sim.move_person(conn.base_url, body.entity_id, body.state, direction)
    return await simulator(user, db)


@router.post("/simulator/reset", status_code=204)
async def reset_simulator(admin: FamilyManager, db: DB) -> None:
    ha_sim.reset((await _sim_conn(db, admin)).base_url)


@router.delete("/connection", status_code=204)
async def delete_connection(admin: FamilyManager, db: DB) -> None:
    conn = await smarthome_conn.primary(db, admin.family_id)
    if not conn:
        raise HTTPException(status_code=404, detail="No connection configured")
    await db.delete(conn)
    await db.commit()


# ── Admin: entity picker ──────────────────────────────────────────────────────

async def _family_conn(db, user, connection_id: uuid.UUID | None) -> SmarthomeConnection | None:
    if connection_id is None:
        return await smarthome_conn.primary(db, user.family_id)
    conn = await db.get(SmarthomeConnection, connection_id)
    return conn if conn is not None and conn.family_id == user.family_id else None


@router.get("/entities")
async def list_entities(admin: FamilyManager, db: DB, connection_id: uuid.UUID | None = None) -> list[EntityOut]:
    """Fetch all entities from HA with supported domains (light, switch, cover)."""
    conn = await _family_conn(db, admin, connection_id)
    if not conn:
        raise HTTPException(status_code=404, detail="No Home Assistant connection configured")

    token = decrypt_token(conn.token_encrypted)
    try:
        states = await ha.get_states(conn.base_url, token)
    except ha.HomeAssistantError as e:
        raise HTTPException(status_code=502, detail=str(e))

    entities = []
    for s in states:
        eid = s.get("entity_id", "")
        domain = eid.split(".", 1)[0] if "." in eid else ""
        if domain in SUPPORTED_DOMAINS:
            name = s.get("attributes", {}).get("friendly_name", eid)
            entities.append(EntityOut(entity_id=eid, domain=domain, name=name, state=s.get("state", "unknown")))
    return entities


# ── Admin: devices CRUD ───────────────────────────────────────────────────────

@router.get("/devices")
async def list_devices_admin(admin: FamilyManager, db: DB) -> list[DeviceOut]:
    result = await db.execute(
        select(ExposedDevice)
        .where(ExposedDevice.family_id == admin.family_id)
        .order_by(ExposedDevice.position)
    )
    return [
        DeviceOut(
            id=d.id, connection_id=d.connection_id, entity_id=d.entity_id, display_name=d.display_name,
            domain=d.domain, position=d.position,
            allowed_user_ids=[str(uid) for uid in d.allowed_user_ids],
        )
        for d in result.scalars().all()
    ]


@router.post("/devices", status_code=201)
async def add_device(body: DeviceIn, admin: FamilyManager, db: DB) -> DeviceOut:
    if body.domain not in SUPPORTED_DOMAINS:
        raise HTTPException(status_code=422, detail=f"Unsupported domain: {body.domain}. Allowed: {', '.join(SUPPORTED_DOMAINS)}")

    conn = await _family_conn(db, admin, body.connection_id)
    if not conn:
        raise HTTPException(status_code=404, detail="No connection configured")

    device = ExposedDevice(
        family_id=admin.family_id,
        connection_id=conn.id,
        entity_id=body.entity_id,
        display_name=body.display_name,
        domain=body.domain,
        position=body.position,
        allowed_user_ids=body.allowed_user_ids,
    )
    db.add(device)
    await db.commit()
    await db.refresh(device)
    return DeviceOut(
        id=device.id, connection_id=device.connection_id, entity_id=device.entity_id, display_name=device.display_name,
        domain=device.domain, position=device.position,
        allowed_user_ids=[str(uid) for uid in device.allowed_user_ids],
    )


@router.patch("/devices/{device_id}")
async def update_device(device_id: uuid.UUID, body: DeviceIn, admin: FamilyManager, db: DB) -> DeviceOut:
    device = await db.get(ExposedDevice, device_id)
    if not device or device.family_id != admin.family_id:
        raise HTTPException(status_code=404, detail="Device not found")
    if body.domain not in SUPPORTED_DOMAINS:
        raise HTTPException(status_code=422, detail=f"Unsupported domain: {body.domain}")
    device.entity_id = body.entity_id
    device.display_name = body.display_name
    device.domain = body.domain
    device.position = body.position
    device.allowed_user_ids = body.allowed_user_ids
    await db.commit()
    await db.refresh(device)
    return DeviceOut(
        id=device.id, connection_id=device.connection_id, entity_id=device.entity_id, display_name=device.display_name,
        domain=device.domain, position=device.position,
        allowed_user_ids=[str(uid) for uid in device.allowed_user_ids],
    )


@router.delete("/devices/{device_id}", status_code=204)
async def delete_device(device_id: uuid.UUID, admin: FamilyManager, db: DB) -> None:
    device = await db.get(ExposedDevice, device_id)
    if not device or device.family_id != admin.family_id:
        raise HTTPException(status_code=404, detail="Device not found")
    await db.delete(device)
    await db.commit()


# ── Member: my devices with state ─────────────────────────────────────────────

@router.get("/my-devices")
async def my_devices(user: CurrentUser, db: DB) -> list[DeviceStateOut]:
    """Get devices the current user is allowed to see, with live state."""
    conns = {c.id: c for c in await smarthome_conn.all_for(db, user.family_id)}
    if not conns:
        return []

    result = await db.execute(
        select(ExposedDevice)
        .where(ExposedDevice.family_id == user.family_id)
        .order_by(ExposedDevice.position)
    )
    all_devices = result.scalars().all()

    my = _allowed(all_devices, user)
    favorites = None if user.smarthome_favorites is None else set(user.smarthome_favorites)

    def favorite(d: ExposedDevice) -> bool:
        return favorites is None or str(d.id) in favorites

    if not my:
        return []
    return await device_states(db, user.family_id, my, favorite)


async def device_states(db, family_id, devices: list[ExposedDevice], favorite=lambda d: True) -> list[DeviceStateOut]:
    """The devices with their live state – one read per Home Assistant; one that doesn't answer
    shows its devices as unavailable. Also used by the kitchen display (3.0.4)."""
    conns = {c.id: c for c in await smarthome_conn.all_for(db, family_id)}
    my = list(devices)
    homes = {}
    if len(conns) > 1:
        for c in conns.values():
            prop = await db.get(Property, c.property_id) if c.property_id else None
            homes[c.id] = c.name or (prop.name if prop else None)
    states: dict = {}
    for conn_id in {d.connection_id for d in my}:
        conn = conns.get(conn_id)
        if conn is None:
            continue
        try:
            states[conn_id] = {s["entity_id"]: s for s in await ha.get_states(conn.base_url, decrypt_token(conn.token_encrypted))}
        except ha.HomeAssistantError:
            pass

    out = []
    for d in my:
        state = states.get(d.connection_id, {}).get(d.entity_id) if d.connection_id in states else None
        out.append(
            DeviceStateOut(
                id=d.id, entity_id=d.entity_id, display_name=d.display_name, domain=d.domain, position=d.position,
                state=state.get("state", "unknown") if state else ("unknown" if d.connection_id in states else "unavailable"),
                attributes=ha.public_attributes(d.domain, state.get("attributes", {})) if state else {},
                favorite=favorite(d), home=homes.get(d.connection_id), online=d.connection_id in states,
            )
        )
    return out


def _allowed(devices, user) -> list[ExposedDevice]:
    """Devices the user may see and control: empty allowed_user_ids = everyone."""
    uid_str = str(user.id)
    return [d for d in devices if not d.allowed_user_ids or uid_str in [str(x) for x in d.allowed_user_ids]]


@router.put("/favorites", status_code=204)
async def set_favorites(body: FavoritesIn, user: CurrentUser, db: DB) -> None:
    """Choose which of your devices show on the Today card (from the Smart home app)."""
    devices = (
        await db.execute(select(ExposedDevice).where(ExposedDevice.family_id == user.family_id))
    ).scalars().all()
    allowed = {str(d.id) for d in _allowed(devices, user)}
    user.smarthome_favorites = [str(i) for i in body.device_ids if str(i) in allowed]
    await db.commit()


# ── Member: action ────────────────────────────────────────────────────────────

@router.post("/devices/{device_id}/action", status_code=200)
async def device_action(device_id: uuid.UUID, body: ActionIn, user: CurrentUser, db: DB) -> dict:
    device = await db.get(ExposedDevice, device_id)
    if not device or device.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Device not found")

    # Permission check
    uid_str = str(user.id)
    if device.allowed_user_ids and uid_str not in [str(x) for x in device.allowed_user_ids]:
        raise HTTPException(status_code=403, detail="You do not have access to this device")
    return await run_action(db, device, body)


async def run_action(db, device: ExposedDevice, body: ActionIn) -> dict:
    """Press a device in its own Home Assistant (the app and the kitchen display, 3.0.4)."""
    # Resolve action to HA service
    try:
        service, data = ha.resolve_action(device.domain, body.action, body.value)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    # The device's own Home Assistant
    conn = await db.get(SmarthomeConnection, device.connection_id)
    if not conn or conn.family_id != device.family_id:
        raise HTTPException(status_code=404, detail="No connection configured")

    token = decrypt_token(conn.token_encrypted)
    try:
        await ha.call_service(conn.base_url, token, device.domain, service, device.entity_id, data)
    except ha.HomeAssistantError as e:
        raise HTTPException(status_code=502, detail=str(e))

    return {"ok": True}


# ── Admin: the family's Home Assistants, one per home (2.8.4) ─────────────────


async def _home_out(db, conn: SmarthomeConnection) -> HomeConnOut:
    prop = await db.get(Property, conn.property_id) if conn.property_id else None
    is_gw = gateway.is_gateway(conn.base_url)
    return HomeConnOut(
        id=conn.id, name=conn.name, property_id=conn.property_id, property_name=prop.name if prop else None,
        kind="gateway" if is_gw else "simulated" if ha_sim.is_sim(conn.base_url) else "direct",
        base_url="" if is_gw or ha_sim.is_sim(conn.base_url) else conn.base_url,
        online=gateway.online(conn.id) if is_gw else True, last_seen=conn.gateway_last_seen, version=conn.gateway_version,
        pairing=is_gw and conn.gateway_key_hash is None,
        latest_version=gateway_release.latest_version() if is_gw else None,
        update_available=is_gw and gateway_release.older(conn.gateway_version, gateway_release.latest_version()),
        auto_update=gateway.info(conn.id)["auto_update"] if is_gw else None,
    )


async def _home(db, admin, connection_id: uuid.UUID) -> SmarthomeConnection:
    conn = await db.get(SmarthomeConnection, connection_id)
    if conn is None or conn.family_id != admin.family_id:
        raise HTTPException(status_code=404, detail="No such Home Assistant")
    return conn


async def _check_property(db, admin, property_id: uuid.UUID | None) -> None:
    if property_id is not None:
        prop = await db.get(Property, property_id)
        if prop is None or prop.family_id != admin.family_id:
            raise HTTPException(status_code=422, detail="No such home")


@router.get("/connections", response_model=list[HomeConnOut])
async def list_homes(admin: FamilyManager, db: DB) -> list[HomeConnOut]:
    return [await _home_out(db, c) for c in await smarthome_conn.all_for(db, admin.family_id)]


@router.patch("/connections/{connection_id}", response_model=HomeConnOut)
async def update_home(connection_id: uuid.UUID, body: HomeConnPatch, admin: FamilyManager, db: DB) -> HomeConnOut:
    conn = await _home(db, admin, connection_id)
    if body.name is not None:
        conn.name = body.name.strip()
    if "property_id" in body.model_fields_set:
        await _check_property(db, admin, body.property_id)
        conn.property_id = body.property_id
    await db.commit()
    return await _home_out(db, conn)


def _pairing(conn: SmarthomeConnection) -> tuple[str, datetime]:
    code = gateway.new_pairing_code()
    conn.gateway_code_hash = gateway.digest(code)
    conn.gateway_code_expires = datetime.now(timezone.utc) + timedelta(hours=24)
    return code, conn.gateway_code_expires


@router.post("/gateways", response_model=PairingOut, status_code=status.HTTP_201_CREATED)
async def add_gateway(body: GatewayIn, admin: FamilyManager, db: DB) -> PairingOut:
    """Another home's Home Assistant through the gateway: a one-time pairing code (24 hours) to type
    into the gateway there."""
    if (await db.get(Family, admin.family_id)).kind not in ("owner", "hosted"):
        raise HTTPException(status_code=403, detail="A demo family uses the simulated home")
    await _check_property(db, admin, body.property_id)
    conn = SmarthomeConnection(family_id=admin.family_id, provider="home_assistant", base_url="", token_encrypted=encrypt_token(""), name=body.name.strip(), property_id=body.property_id)
    db.add(conn)
    await db.flush()
    conn.base_url = gateway.address(conn.id)
    code, expires = _pairing(conn)
    await db.commit()
    return PairingOut(connection=await _home_out(db, conn), code=code, expires_at=expires)


@router.post("/gateways/{connection_id}/pairing", response_model=PairingOut)
async def new_pairing(connection_id: uuid.UUID, admin: FamilyManager, db: DB) -> PairingOut:
    """A new code: for a new gateway computer, or when the old key should no longer work."""
    conn = await _home(db, admin, connection_id)
    if not gateway.is_gateway(conn.base_url):
        raise HTTPException(status_code=422, detail="Not a gateway")
    conn.gateway_key_hash = None
    code, expires = _pairing(conn)
    await db.commit()
    await gateway.disconnect(conn.id)
    return PairingOut(connection=await _home_out(db, conn), code=code, expires_at=expires)


@router.delete("/connections/{connection_id}", status_code=204)
async def delete_home(connection_id: uuid.UUID, admin: FamilyManager, db: DB) -> None:
    """Its devices go with it."""
    conn = await _home(db, admin, connection_id)
    await gateway.disconnect(conn.id)
    await db.delete(conn)
    await db.commit()

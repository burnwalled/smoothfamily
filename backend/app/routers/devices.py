"""The devices connected to a family (3.1.0): the browsers and phones the members use, the kitchen
displays and the gateways (the Home Assistant app, or a container of its own) – for the family
admin, with names, and for the server admin as kinds per family, without names.

A device's health: "ok" when seen lately and running the version it should; "outdated" when it runs
an older one (an app to reload, a gateway to update); "away" when a member's device hasn't been used
for a while; "offline" when a kitchen display or a gateway isn't there. Gone for more than 7 days, a
device leaves the map but stays in the list until it is forgotten.
"""
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.config import get_settings
from app.deps import AdminUser, CurrentUser, DB, ServerAdmin
from app.models import ClientDevice, Family, KioskScreen, Property, SmarthomeConnection, User
from app.services import gateway, gateway_release, useragent
from app.services.notify import notify

router = APIRouter(prefix="/api/devices", tags=["devices"])

COOKIE = "sf_device"
# A member's device not used for a day is "away"; anything gone this long leaves the map.
AWAY = timedelta(days=1)
GONE = timedelta(days=7)
# A kitchen display asks every minute: quiet for longer than this, it is off.
KIOSK_QUIET = timedelta(minutes=15)


class HelloIn(BaseModel):
    version: str = Field(default="", max_length=40)
    installed: bool = False


class DeviceOut(BaseModel):
    id: str
    # mobile | tablet | computer | kiosk | gateway | ha_app
    kind: str
    name: str
    member_id: uuid.UUID | None = None
    member_name: str | None = None
    member_color: str | None = None
    version: str | None = None
    # The version it should run.
    latest: str | None = None
    last_seen: datetime | None = None
    # ok | outdated | away | offline
    status: str
    # Shown on the map (seen within 7 days, or online).
    on_map: bool
    # Only a member's browser or phone can be forgotten here.
    forgettable: bool = False


class FamilyDevices(BaseModel):
    app_version: str | None
    devices: list[DeviceOut]


def _parts(version: str | None) -> tuple:
    try:
        return tuple(int(p) for p in (version or "").split("."))
    except ValueError:
        return ()


async def expected_app_version(db) -> str | None:
    """The app version a device should run: the server's own – or, where it isn't set (development),
    the newest any device has reported."""
    if get_settings().app_version:
        return get_settings().app_version
    versions = (await db.execute(select(ClientDevice.app_version).where(ClientDevice.app_version.is_not(None)).distinct())).scalars().all()
    return max(versions, key=_parts, default=None)


async def family_devices(db, family_id: uuid.UUID, now: datetime | None = None) -> list[DeviceOut]:
    now = now or datetime.now(timezone.utc)
    app = await expected_app_version(db)
    gw_latest = gateway_release.latest_version()
    members = {m.id: m for m in (await db.execute(select(User).where(User.family_id == family_id))).scalars().all()}
    out: list[DeviceOut] = []

    def seen(at: datetime | None) -> datetime | None:
        return at if at is None or at.tzinfo else at.replace(tzinfo=timezone.utc)

    for d in (await db.execute(select(ClientDevice).where(ClientDevice.family_id == family_id).order_by(ClientDevice.last_seen.desc()))).scalars().all():
        last = seen(d.last_seen)
        member = members.get(d.user_id)
        age = now - last
        state = "away" if age > AWAY else "outdated" if app and d.app_version and _parts(d.app_version) < _parts(app) else "ok"
        out.append(DeviceOut(
            id=str(d.id), kind=d.kind, name=" · ".join(x for x in (d.browser, d.os) if x) or d.kind,
            member_id=d.user_id, member_name=member.display_name if member else None, member_color=member.color if member else None,
            version=d.app_version, latest=app, last_seen=last, status=state, on_map=age <= GONE, forgettable=True,
        ))

    for s in (await db.execute(select(KioskScreen).where(KioskScreen.family_id == family_id, KioskScreen.revoked_at.is_(None)))).scalars().all():
        last = seen(s.last_seen_at)
        if last is None:
            continue  # never opened: not connected
        age = now - last
        state = "offline" if age > KIOSK_QUIET else "outdated" if app and s.app_version and _parts(s.app_version) < _parts(app) else "ok"
        out.append(DeviceOut(id=f"kiosk:{s.id}", kind="kiosk", name=s.name, version=s.app_version, latest=app, last_seen=last, status=state, on_map=age <= GONE))

    for c in (await db.execute(select(SmarthomeConnection).where(SmarthomeConnection.family_id == family_id))).scalars().all():
        if not gateway.is_gateway(c.base_url) or c.gateway_key_hash is None:
            continue
        here = gateway.online(c.id)
        last = now if here else seen(c.gateway_last_seen)
        prop = await db.get(Property, c.property_id) if c.property_id else None
        state = "offline" if not here else "outdated" if gateway_release.older(c.gateway_version, gw_latest) else "ok"
        out.append(DeviceOut(
            id=f"gateway:{c.id}", kind="ha_app" if c.gateway_runs_in == "addon" else "gateway", name=c.name or (prop.name if prop else "Gateway"),
            version=c.gateway_version, latest=gw_latest, last_seen=last, status=state, on_map=here or (last is not None and now - last <= GONE),
        ))
    return out


# --- Every device that uses the app says hello ------------------------------------------------------


@router.post("/hello", status_code=status.HTTP_204_NO_CONTENT)
async def hello(payload: HelloIn, request: Request, response: Response, user: CurrentUser, db: DB) -> None:
    """Called by the app when it opens (and now and then): which device this is and its version."""
    key = request.cookies.get(COOKIE) or ""
    if not (16 <= len(key) <= 64):
        key = secrets.token_urlsafe(24)
    response.set_cookie(COOKIE, key, max_age=2 * 365 * 86400, httponly=True, samesite="lax", secure=get_settings().cookie_secure, path="/")
    now = datetime.now(timezone.utc)
    about = useragent.describe(request.headers.get("user-agent"))
    device = (await db.execute(select(ClientDevice).where(ClientDevice.user_id == user.id, ClientDevice.device_key == key))).scalar_one_or_none()
    if device is None:
        device = ClientDevice(family_id=user.family_id, user_id=user.id, device_key=key, first_seen=now)
        db.add(device)
    device.kind, device.browser, device.os = about["kind"], about["browser"][:40], about["os"][:40]
    device.app_version = payload.version or None
    device.installed = payload.installed
    device.last_seen = now
    await db.commit()


# --- The family admin -----------------------------------------------------------------------------


@router.get("", response_model=FamilyDevices)
async def list_devices(admin: AdminUser, db: DB) -> FamilyDevices:
    return FamilyDevices(app_version=await expected_app_version(db), devices=await family_devices(db, admin.family_id))


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
async def forget_device(device_id: uuid.UUID, admin: AdminUser, db: DB) -> None:
    """Forget a member's old device (it comes back if it is used again)."""
    device = await db.get(ClientDevice, device_id)
    if device is None or device.family_id != admin.family_id:
        raise HTTPException(status_code=404, detail="Device not found")
    await db.delete(device)
    await db.commit()


# --- The server admin: kinds per family, never names -----------------------------------------------


class ServerDevice(BaseModel):
    kind: str
    version: str | None
    latest: str | None
    status: str
    last_seen: datetime | None
    on_map: bool


class ServerFamilyDevices(BaseModel):
    id: uuid.UUID
    name: str
    kind: str
    devices: list[ServerDevice]


class ServerDevicesOut(BaseModel):
    app_version: str | None
    gateway_version: str | None
    families: list[ServerFamilyDevices]


class RemindIn(BaseModel):
    # The kinds to look at; empty = every device that isn't well.
    kinds: list[str] = Field(default_factory=list, max_length=6)


_REMIND = {
    "en": ("A device needs looking after", "The server admin asks you to check: {what}. See Family settings → Devices."),
    "sv": ("En enhet behöver ses över", "Serveradministratören ber er kontrollera: {what}. Se Familjeinställningar → Enheter."),
    "nb": ("En enhet må sees til", "Serveradministratoren ber dere sjekke: {what}. Se Familieinnstillinger → Enheter."),
    "da": ("En enhed skal ses efter", "Serveradministratoren beder jer tjekke: {what}. Se Familieindstillinger → Enheder."),
    "fi": ("Laite kaipaa huomiota", "Palvelimen ylläpitäjä pyytää tarkistamaan: {what}. Katso Perheen asetukset → Laitteet."),
}
_KINDS = {
    "en": {"mobile": "phone", "tablet": "tablet", "computer": "computer", "kiosk": "kitchen display", "gateway": "gateway", "ha_app": "Home Assistant app"},
    "sv": {"mobile": "mobil", "tablet": "surfplatta", "computer": "dator", "kiosk": "köksskärm", "gateway": "gateway", "ha_app": "Home Assistant-app"},
    "nb": {"mobile": "mobil", "tablet": "nettbrett", "computer": "datamaskin", "kiosk": "kjøkkenskjerm", "gateway": "gateway", "ha_app": "Home Assistant-app"},
    "da": {"mobile": "mobil", "tablet": "tablet", "computer": "computer", "kiosk": "køkkenskærm", "gateway": "gateway", "ha_app": "Home Assistant-app"},
    "fi": {"mobile": "puhelin", "tablet": "tabletti", "computer": "tietokone", "kiosk": "keittiön näyttö", "gateway": "yhdyskäytävä", "ha_app": "Home Assistant -sovellus"},
}
_STATES = {
    "en": {"outdated": "an old version", "offline": "offline"},
    "sv": {"outdated": "gammal version", "offline": "offline"},
    "nb": {"outdated": "gammel versjon", "offline": "frakoblet"},
    "da": {"outdated": "gammel version", "offline": "offline"},
    "fi": {"outdated": "vanha versio", "offline": "ei yhteyttä"},
}


@router.get("/server", response_model=ServerDevicesOut)
async def server_devices(admin: ServerAdmin, db: DB) -> ServerDevicesOut:
    now = datetime.now(timezone.utc)
    families = (await db.execute(select(Family).order_by(Family.created_at))).scalars().all()
    out = []
    for f in families:
        devices = await family_devices(db, f.id, now)
        out.append(ServerFamilyDevices(
            id=f.id, name=f.name, kind=f.kind or "owner",
            devices=[ServerDevice(kind=d.kind, version=d.version, latest=d.latest, status=d.status, last_seen=d.last_seen, on_map=d.on_map) for d in devices],
        ))
    return ServerDevicesOut(app_version=await expected_app_version(db), gateway_version=gateway_release.latest_version(), families=out)


@router.post("/server/{family_id}/remind", status_code=status.HTTP_204_NO_CONTENT)
async def remind_family(family_id: uuid.UUID, payload: RemindIn, admin: ServerAdmin, db: DB) -> None:
    """Tell a family's admins (in the notification centre) which of their devices need looking after."""
    family = await db.get(Family, family_id)
    if family is None:
        raise HTTPException(status_code=404, detail="Family not found")
    unwell = [d for d in await family_devices(db, family_id) if d.status in ("outdated", "offline") and d.on_map and (not payload.kinds or d.kind in payload.kinds)]
    if not unwell:
        raise HTTPException(status_code=409, detail="All of the family's devices are well")
    admins = (await db.execute(select(User).where(User.family_id == family_id, User.role == "admin"))).scalars().all()
    for user in admins:
        lang = user.language if user.language in _REMIND else "en"
        title, body = _REMIND[lang]
        counts: dict[tuple[str, str], int] = {}
        for d in unwell:
            counts[(d.kind, d.status)] = counts.get((d.kind, d.status), 0) + 1
        what = ", ".join(f"{n} × {_KINDS[lang][kind]} ({_STATES[lang][state]})" for (kind, state), n in sorted(counts.items()))
        await notify(db, user, {"title": title, "body": body.format(what=what), "route": "/settings/devices", "kind": "devices"})

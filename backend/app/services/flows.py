"""Personal automations (#44): When → If → Do, run by Smooth Family through Home Assistant.

- When: a time on chosen weekdays, a button (also on Today), a device changing state, someone
  coming home / leaving (only members who share their presence count), or one of the day's
  cheapest electricity hours starting.
- If (all must hold): a time window, weekdays, a device's state, nobody/somebody home, the
  electricity price below a level or among the day's cheapest hours.
- Do (in order): control a device, play media on one or more speakers (grouped, with a volume),
  send a notification, wait a few minutes.

A flow may only use devices its owner may control, checked when it is saved and again when it
runs. A child's flow waits for an adult's approval. A flow runs at most once a minute so two flows
can't set each other off forever. Flows with a wait run in the background; a restart in the
middle of a wait drops the rest of that run.
"""
import asyncio
import logging
import uuid
from datetime import datetime, time, timedelta, timezone
from typing import Annotated, Literal, Union
from zoneinfo import ZoneInfo

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.services import smarthome_conn
from app.models import ExposedDevice, Family, SmarthomeConnection, SmarthomeFlow, User
from app.services import electricity
from app.services import homeassistant as ha
from app.services.crypto import decrypt_token
from app.services.notify import notify

log = logging.getLogger(__name__)

MAX_FLOWS = 20
MAX_ACTIONS = 10
COOLDOWN = timedelta(seconds=55)
HHMM = r"^([01][0-9]|2[0-3]):[0-5][0-9]$"
Days = Annotated[list[int], Field(min_length=1, max_length=7)]


# --- What a flow looks like ------------------------------------------------------------------


class TimeTrigger(BaseModel):
    type: Literal["time"]
    at: str = Field(pattern=HHMM)
    days: Days = [0, 1, 2, 3, 4, 5, 6]


class ButtonTrigger(BaseModel):
    type: Literal["button"]


class StateTrigger(BaseModel):
    type: Literal["state"]
    device_id: uuid.UUID
    to: str = Field(min_length=1, max_length=40)


class PresenceTrigger(BaseModel):
    type: Literal["presence"]
    # arrive / leave: a member (or anyone if none chosen); first_arrives / last_leaves: the home.
    event: Literal["arrive", "leave", "first_arrives", "last_leaves"]
    user_id: uuid.UUID | None = None


class CheapestHourTrigger(BaseModel):
    """At the start of each of the day's N cheapest hours (electricity spot price)."""

    type: Literal["cheapest_hour"]
    hours: int = Field(default=3, ge=1, le=12)


Trigger = Annotated[Union[TimeTrigger, ButtonTrigger, StateTrigger, PresenceTrigger, CheapestHourTrigger], Field(discriminator="type")]


class TimeBetween(BaseModel):
    type: Literal["time_between"]
    start: str = Field(pattern=HHMM)
    end: str = Field(pattern=HHMM)


class OnWeekdays(BaseModel):
    type: Literal["weekdays"]
    days: Days


class DeviceIs(BaseModel):
    type: Literal["device_state"]
    device_id: uuid.UUID
    state: str = Field(min_length=1, max_length=40)


class HomeIs(BaseModel):
    type: Literal["home"]
    who: Literal["nobody", "somebody"]


class PriceBelow(BaseModel):
    type: Literal["price_below"]
    ore: int = Field(ge=0, le=1000)


class CheapestHours(BaseModel):
    type: Literal["cheapest_hours"]
    hours: int = Field(ge=1, le=12)


Condition = Annotated[Union[TimeBetween, OnWeekdays, DeviceIs, HomeIs, PriceBelow, CheapestHours], Field(discriminator="type")]


class DeviceAction(BaseModel):
    type: Literal["device"]
    device_id: uuid.UUID
    action: str = Field(min_length=1, max_length=40)
    value: float | None = None


class MediaAction(BaseModel):
    type: Literal["media"]
    device_ids: list[uuid.UUID] = Field(min_length=1, max_length=6)
    media_content_id: str = Field(min_length=1, max_length=500)
    media_content_type: str = Field(min_length=1, max_length=80)
    title: str = Field(default="", max_length=200)
    volume: int | None = Field(default=None, ge=0, le=100)


class NotifyAction(BaseModel):
    type: Literal["notify"]
    to: Literal["me", "family"] = "me"
    text: str = Field(min_length=1, max_length=200)


class WaitAction(BaseModel):
    type: Literal["wait"]
    minutes: int = Field(ge=1, le=120)


Action = Annotated[Union[DeviceAction, MediaAction, NotifyAction, WaitAction], Field(discriminator="type")]


class FlowIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    trigger: Trigger
    conditions: list[Condition] = Field(default=[], max_length=10)
    actions: list[Action] = Field(min_length=1, max_length=MAX_ACTIONS)
    shared: bool = False
    on_today: bool = False
    # app: Smooth Family runs it | ha: Home Assistant runs it (services/ha_publish.py)
    run_in: Literal["app", "ha"] = "app"


class FlowError(ValueError):
    pass


def _zone() -> ZoneInfo:
    return ZoneInfo(get_settings().timezone)


def _allowed(device: ExposedDevice, user: User) -> bool:
    return not device.allowed_user_ids or str(user.id) in [str(x) for x in device.allowed_user_ids]


async def _device(db: AsyncSession, owner: User, device_id: uuid.UUID) -> ExposedDevice:
    device = await db.get(ExposedDevice, device_id)
    if device is None or device.family_id != owner.family_id or not _allowed(device, owner):
        raise FlowError("The flow uses a device you can't control")
    return device


async def check_flow(db: AsyncSession, owner: User, flow: FlowIn) -> None:
    """Raises FlowError if the flow uses something its owner may not, or can't be done."""
    trigger = flow.trigger
    if isinstance(trigger, StateTrigger):
        await _device(db, owner, trigger.device_id)
    if isinstance(trigger, PresenceTrigger) and trigger.user_id:
        member = await db.get(User, trigger.user_id)
        if member is None or member.family_id != owner.family_id:
            raise FlowError("Unknown family member")
    for condition in flow.conditions:
        if isinstance(condition, DeviceIs):
            await _device(db, owner, condition.device_id)
    for action in flow.actions:
        if isinstance(action, DeviceAction):
            device = await _device(db, owner, action.device_id)
            try:
                ha.resolve_action(device.domain, action.action, action.value)
            except ValueError as exc:
                raise FlowError(str(exc))
        if isinstance(action, MediaAction):
            for device_id in action.device_ids:
                if (await _device(db, owner, device_id)).domain != "media_player":
                    raise FlowError("Music can only be played on speakers")


def parsed(flow: SmarthomeFlow) -> FlowIn:
    return FlowIn(name=flow.name, trigger=flow.trigger, conditions=flow.conditions or [], actions=flow.actions or [], shared=flow.shared, on_today=flow.on_today, run_in=flow.run_in or "app")


# --- Running ---------------------------------------------------------------------------------


async def _connection(db: AsyncSession, family_id: uuid.UUID) -> SmarthomeConnection | None:
    return await smarthome_conn.primary(db, family_id)


async def _sharing_home(db: AsyncSession, family_id: uuid.UUID, states: dict) -> list[User]:
    """Members who share their presence and are home right now."""
    members = (
        await db.execute(select(User).where(User.family_id == family_id, User.presence_share != "off", User.ha_person_entity.is_not(None)))
    ).scalars().all()
    return [m for m in members if (states.get(m.ha_person_entity) or {}).get("state") == "home"]


def _in_window(now: time, start: str, end: str) -> bool:
    a, b = time.fromisoformat(start), time.fromisoformat(end)
    return a <= now < b if a <= b else now >= a or now < b  # over midnight, e.g. 22:00–06:00


async def conditions_hold(db: AsyncSession, flow: FlowIn, family_id: uuid.UUID, states: dict, now: datetime) -> bool:
    local = now.astimezone(_zone())
    for condition in flow.conditions:
        if isinstance(condition, TimeBetween) and not _in_window(local.time(), condition.start, condition.end):
            return False
        if isinstance(condition, OnWeekdays) and local.weekday() not in condition.days:
            return False
        if isinstance(condition, DeviceIs):
            device = await db.get(ExposedDevice, condition.device_id)
            if device is None or (states.get(device.entity_id) or {}).get("state") != condition.state:
                return False
        if isinstance(condition, HomeIs):
            home = await _sharing_home(db, family_id, states)
            if (condition.who == "nobody") == bool(home):
                return False
        if isinstance(condition, (PriceBelow, CheapestHours)):
            hours = await _prices(db, family_id, now)
            current = electricity.hour_of(hours, now)
            if current is None:
                return False  # no prices: don't guess
            if isinstance(condition, PriceBelow) and current["ore"] >= condition.ore:
                return False
            if isinstance(condition, CheapestHours) and current["start"] not in electricity.cheapest(hours, condition.hours):
                return False
    return True


async def _prices(db: AsyncSession, family_id: uuid.UUID, now: datetime) -> list[dict]:
    family = await db.get(Family, family_id)
    if not family or not family.electricity_area:
        return []
    try:
        return await electricity.today(family.electricity_area, now)
    except Exception:
        return []


async def _do(db: AsyncSession, flow: SmarthomeFlow, owner: User, action, base_url: str, token: str) -> None:
    if isinstance(action, DeviceAction):
        device = await _device(db, owner, action.device_id)
        service, data = ha.resolve_action(device.domain, action.action, action.value)
        await ha.call_service(base_url, token, device.domain, service, device.entity_id, data)
    elif isinstance(action, MediaAction):
        speakers = [await _device(db, owner, d) for d in action.device_ids]
        leader = speakers[0].entity_id
        if len(speakers) > 1:
            await ha.call_service(base_url, token, "media_player", "join", leader, {"group_members": [s.entity_id for s in speakers[1:]]})
        if action.volume is not None:
            for speaker in speakers:
                await ha.call_service(base_url, token, "media_player", "volume_set", speaker.entity_id, {"volume_level": action.volume / 100})
        await ha.call_service(
            base_url, token, "media_player", "play_media", leader,
            {"media_content_id": action.media_content_id, "media_content_type": action.media_content_type},
        )
    elif isinstance(action, NotifyAction):
        recipients = [owner]
        if action.to == "family":
            recipients = (await db.execute(select(User).where(User.family_id == flow.family_id))).scalars().all()
        for person in recipients:
            await notify(db, person, {"title": flow.name, "body": action.text, "route": "/smarthome", "kind": "flow"})
    elif isinstance(action, WaitAction):
        await asyncio.sleep(action.minutes * 60)


async def run_flow(db: AsyncSession, flow: SmarthomeFlow, now: datetime | None = None, check: bool = True, states: dict | None = None) -> bool:
    """Runs the flow if it may run now (enabled, approved, not just run, conditions hold).
    `check=False` skips the conditions (the "Run now" button). Returns whether it ran."""
    now = now or datetime.now(timezone.utc)
    if not flow.enabled or not flow.approved:
        return False
    last = flow.last_run_at.replace(tzinfo=timezone.utc) if flow.last_run_at and flow.last_run_at.tzinfo is None else flow.last_run_at
    if last and now - last < COOLDOWN and check:
        return False
    conn = await _connection(db, flow.family_id)
    owner = await db.get(User, flow.owner_id)
    if conn is None or owner is None:
        return False
    token = decrypt_token(conn.token_encrypted)
    spec = parsed(flow)
    if check and spec.conditions:
        if states is None:
            states = {s["entity_id"]: s for s in await ha.get_states(conn.base_url, token)}
        if not await conditions_hold(db, spec, flow.family_id, states, now):
            return False
    flow.last_run_at = now
    flow.last_error = None
    await db.commit()
    try:
        for action in spec.actions:
            await _do(db, flow, owner, action, conn.base_url, token)
    except Exception as exc:
        flow.last_error = str(exc)[:300] or exc.__class__.__name__
        await db.commit()
        log.info("Flow %s failed: %s", flow.id, exc)
    return True


def has_wait(flow: SmarthomeFlow) -> bool:
    return any((a or {}).get("type") == "wait" for a in flow.actions or [])


async def _run_detached(flow_id: uuid.UUID, check: bool) -> None:
    from app.database import SessionLocal

    async with SessionLocal() as db:
        flow = await db.get(SmarthomeFlow, flow_id)
        if flow is not None:
            await run_flow(db, flow, check=check)


async def start(db: AsyncSession, flow: SmarthomeFlow, check: bool = True, now: datetime | None = None, states: dict | None = None) -> bool:
    """Runs a flow; one with a wait goes on in the background so nothing else is held up."""
    if has_wait(flow):
        if not flow.enabled or not flow.approved:
            return False
        asyncio.get_running_loop().create_task(_run_detached(flow.id, check))
        return True
    return await run_flow(db, flow, now=now, check=check, states=states)


def _active(db: AsyncSession, family_id: uuid.UUID | None = None):
    # Flows published to Home Assistant are run there, not here.
    query = select(SmarthomeFlow).where(SmarthomeFlow.enabled == True, SmarthomeFlow.approved == True, SmarthomeFlow.run_in == "app")  # noqa: E712
    if family_id is not None:
        query = query.where(SmarthomeFlow.family_id == family_id)
    return query


async def run_time_flows(db: AsyncSession, now: datetime | None = None) -> int:
    """Every minute from the worker: flows whose time it is."""
    now = now or datetime.now(timezone.utc)
    local = now.astimezone(_zone())
    hhmm = local.strftime("%H:%M")
    ran = 0
    for flow in (await db.execute(_active(db))).scalars().all():
        trigger = (flow.trigger or {})
        due = trigger.get("type") == "time" and trigger.get("at") == hhmm and local.weekday() in trigger.get("days", [])
        if trigger.get("type") == "cheapest_hour" and local.minute == 0:
            hours = await _prices(db, flow.family_id, now)
            current = electricity.hour_of(hours, now)
            due = current is not None and current["start"] in electricity.cheapest(hours, int(trigger.get("hours", 3)))
        if due and await start(db, flow, now=now):
            ran += 1
    return ran


async def on_state_change(db: AsyncSession, family_id: uuid.UUID, entity_id: str, old: str | None, new: str | None, now: datetime | None = None) -> int:
    """From the Home Assistant live connection: a device or a person changed state."""
    if old == new:
        return 0
    flows = (await db.execute(_active(db, family_id))).scalars().all()
    if not flows:
        return 0
    devices = {d.id: d for d in (await db.execute(select(ExposedDevice).where(ExposedDevice.family_id == family_id))).scalars()}
    member = (
        await db.execute(select(User).where(User.family_id == family_id, User.ha_person_entity == entity_id, User.presence_share != "off"))
    ).scalar_one_or_none()
    states: dict | None = None
    ran = 0
    for flow in flows:
        trigger = flow.trigger or {}
        hit = False
        if trigger.get("type") == "state":
            device = devices.get(uuid.UUID(str(trigger.get("device_id"))))
            hit = device is not None and device.entity_id == entity_id and new == trigger.get("to")
        elif trigger.get("type") == "presence" and member is not None:
            arrived, left = new == "home" and old != "home", old == "home" and new != "home"
            event = trigger.get("event")
            who = trigger.get("user_id")
            if event in ("arrive", "leave"):
                hit = (arrived if event == "arrive" else left) and (not who or str(who) == str(member.id))
            elif arrived or left:
                if states is None:
                    conn = await _connection(db, family_id)
                    states = {s["entity_id"]: s for s in await ha.get_states(conn.base_url, decrypt_token(conn.token_encrypted))} if conn else {}
                home = [m for m in await _sharing_home(db, family_id, states)]
                hit = (event == "first_arrives" and arrived and [m.id for m in home] == [member.id]) or (event == "last_leaves" and left and not home)
        if hit and await start(db, flow, now=now, states=states):
            ran += 1
    return ran

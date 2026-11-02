"""Flows that run in Home Assistant (#44): published as automations, so they work even while
Smooth Family is restarting, and show up in Home Assistant's logbook.

Only automations with the id `smooth_family_<flow id>` are ever created, changed or removed –
nothing else in Home Assistant is touched. Smooth Family stays the source of truth: saving,
pausing or removing the flow updates or removes the automation, and a sync puts back one that was
changed or deleted in Home Assistant. It needs an admin user's token (the config API).

What Home Assistant can do on its own is published: a time, a device's state, someone coming or
going; time window, weekdays, device state and nobody/somebody home; controlling devices, music
and waiting. Buttons, the electricity price and notifications in Smooth Family need the app, so
such flows run in the app.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import smarthome_conn
from app.models import ExposedDevice, SmarthomeConnection, SmarthomeFlow, User
from app.services import homeassistant as ha
from app.services.crypto import decrypt_token

PREFIX = "smooth_family_"
WEEKDAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
APP_ONLY_TRIGGERS = {"button", "cheapest_hour"}
APP_ONLY_CONDITIONS = {"price_below", "cheapest_hours"}
APP_ONLY_ACTIONS = {"notify"}


class NotPublishable(ValueError):
    pass


def automation_id(flow: SmarthomeFlow) -> str:
    return f"{PREFIX}{flow.id.hex}"


def why_not(flow_trigger: dict, conditions: list, actions: list) -> str | None:
    """None if Home Assistant can run it on its own, else what needs the app."""
    if flow_trigger.get("type") in APP_ONLY_TRIGGERS:
        return f"trigger:{flow_trigger['type']}"
    for c in conditions:
        if c.get("type") in APP_ONLY_CONDITIONS:
            return f"condition:{c['type']}"
    for a in actions:
        if a.get("type") in APP_ONLY_ACTIONS:
            return f"action:{a['type']}"
    return None


def _days(days: list[int]) -> list[str]:
    return [WEEKDAYS[d] for d in sorted(days)]


async def _entity(db: AsyncSession, device_id) -> str:
    device = await db.get(ExposedDevice, uuid.UUID(str(device_id)))
    if device is None:
        raise NotPublishable("A device the flow uses is gone")
    return device.entity_id


async def to_automation(db: AsyncSession, flow: SmarthomeFlow) -> dict:
    """The Home Assistant automation for a flow, in the format Home Assistant stores it."""
    reason = why_not(flow.trigger or {}, flow.conditions or [], flow.actions or [])
    if reason:
        raise NotPublishable(reason)
    tr = flow.trigger or {}
    triggers: list[dict] = []
    conditions: list[dict] = []
    if tr["type"] == "time":
        triggers.append({"platform": "time", "at": f"{tr['at']}:00"})
        if sorted(tr.get("days", [])) != list(range(7)):
            conditions.append({"condition": "time", "weekday": _days(tr["days"])})
    elif tr["type"] == "state":
        triggers.append({"platform": "state", "entity_id": await _entity(db, tr["device_id"]), "to": tr["to"]})
    elif tr["type"] == "presence":
        event = tr["event"]
        if event in ("first_arrives", "last_leaves"):
            # zone.home counts the people at home.
            triggers.append({"platform": "numeric_state", "entity_id": "zone.home", "above": 0} if event == "first_arrives" else {"platform": "state", "entity_id": "zone.home", "to": "0"})
        else:
            people = await _people(db, flow.family_id, tr.get("user_id"))
            if not people:
                raise NotPublishable("Nobody shares when they're home")
            triggers.append({"platform": "state", "entity_id": people, "to": "home"} if event == "arrive" else {"platform": "state", "entity_id": people, "from": "home"})
    for c in flow.conditions or []:
        if c["type"] == "time_between":
            conditions.append({"condition": "time", "after": f"{c['start']}:00", "before": f"{c['end']}:00"})
        elif c["type"] == "weekdays":
            conditions.append({"condition": "time", "weekday": _days(c["days"])})
        elif c["type"] == "device_state":
            conditions.append({"condition": "state", "entity_id": await _entity(db, c["device_id"]), "state": c["state"]})
        elif c["type"] == "home":
            conditions.append({"condition": "state", "entity_id": "zone.home", "state": "0"} if c["who"] == "nobody" else {"condition": "numeric_state", "entity_id": "zone.home", "above": 0})
    actions: list[dict] = []
    for a in flow.actions or []:
        if a["type"] == "device":
            device = await db.get(ExposedDevice, uuid.UUID(str(a["device_id"])))
            if device is None:
                raise NotPublishable("A device the flow uses is gone")
            service, data = ha.resolve_action(device.domain, a["action"], a.get("value"))
            actions.append({"action": f"{device.domain}.{service}", "target": {"entity_id": device.entity_id}, "data": data})
        elif a["type"] == "media":
            speakers = [await _entity(db, d) for d in a["device_ids"]]
            if len(speakers) > 1:
                actions.append({"action": "media_player.join", "target": {"entity_id": speakers[0]}, "data": {"group_members": speakers[1:]}})
            if a.get("volume") is not None:
                actions.append({"action": "media_player.volume_set", "target": {"entity_id": speakers}, "data": {"volume_level": a["volume"] / 100}})
            actions.append({"action": "media_player.play_media", "target": {"entity_id": speakers[0]}, "data": {"media_content_id": a["media_content_id"], "media_content_type": a["media_content_type"]}})
        elif a["type"] == "wait":
            actions.append({"delay": {"minutes": a["minutes"]}})
    return {
        "id": automation_id(flow),
        "alias": f"Smooth Family: {flow.name}",
        "description": "Made in Smooth Family – change it there; changes made here are put back.",
        "mode": "single",
        "initial_state": bool(flow.enabled and flow.approved),
        "triggers": triggers,
        "conditions": conditions,
        "actions": actions,
    }


_PLURAL = {"trigger": "triggers", "condition": "conditions", "action": "actions"}


def same(stored: dict | None, wanted: dict) -> bool:
    """Whether Home Assistant already has it; older versions keep the singular keys."""
    if stored is None:
        return False
    tidy = {_PLURAL.get(k, k): v for k, v in stored.items()}
    # Older versions also call a step's service "service" rather than "action".
    tidy["actions"] = [{("action" if k == "service" else k): v for k, v in step.items()} for step in tidy.get("actions", [])]
    return tidy == wanted


async def _people(db: AsyncSession, family_id: uuid.UUID, user_id) -> list[str]:
    query = select(User.ha_person_entity).where(User.family_id == family_id, User.presence_share != "off", User.ha_person_entity.is_not(None))
    if user_id:
        query = query.where(User.id == uuid.UUID(str(user_id)))
    return [p for p in (await db.execute(query)).scalars().all() if p]


async def _connection(db: AsyncSession, family_id: uuid.UUID) -> tuple[str, str] | None:
    conn = await smarthome_conn.primary(db, family_id)
    if conn is None:
        return None
    return conn.base_url, decrypt_token(conn.token_encrypted)


async def available(db: AsyncSession, family_id: uuid.UUID) -> bool:
    conn = await _connection(db, family_id)
    return bool(conn) and await ha.can_manage_automations(*conn)


async def sync_flow(db: AsyncSession, flow: SmarthomeFlow) -> None:
    """Puts the automation in Home Assistant in line with the flow (or removes it). Raises on errors."""
    conn = await _connection(db, flow.family_id)
    if conn is None:
        return
    if flow.run_in != "ha":
        await ha.delete_automation(*conn, automation_id(flow))
        flow.ha_synced_at = None
        return
    config = await to_automation(db, flow)
    if not same(await ha.get_automation(*conn, automation_id(flow)), config):
        await ha.save_automation(*conn, automation_id(flow), config)
    flow.ha_synced_at = datetime.now(timezone.utc)


async def remove_flow(db: AsyncSession, flow: SmarthomeFlow) -> None:
    conn = await _connection(db, flow.family_id)
    if conn is not None and flow.run_in == "ha":
        await ha.delete_automation(*conn, automation_id(flow))


async def run_ha_sync(db: AsyncSession, now: datetime | None = None) -> int:
    """Every quarter hour: puts back automations that were changed or removed in Home Assistant."""
    now = now or datetime.now(timezone.utc)
    if now.minute % 15:
        return 0
    fixed = 0
    for flow in (await db.execute(select(SmarthomeFlow).where(SmarthomeFlow.run_in == "ha"))).scalars().all():
        try:
            before = flow.ha_synced_at
            await sync_flow(db, flow)
            flow.last_error = None
            fixed += flow.ha_synced_at != before
        except Exception as exc:
            flow.last_error = f"Home Assistant: {exc}"[:300]
        await db.commit()
    return fixed

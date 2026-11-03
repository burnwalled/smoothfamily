"""A calendar in the family's Home Assistant as a calendar subscription (3.4.0).

A feed whose address is `homeassistant://calendar.<entity>` is read from the family's own Home
Assistant (its calendar API: a school's schedule from InfoMentor or SchoolSoft, a workout calendar,
anything) and turned into iCal, so it works like any other subscription – colours, who sees it,
rides and packing, reminders. Through the gateway a calendar can't be read; such a feed is empty.
"""
import hashlib
import uuid
from datetime import date, datetime, timedelta, timezone

import icalendar

from app.services import homeassistant as ha
from app.services import smarthome_conn
from app.services.crypto import decrypt_token

PREFIX = "homeassistant://"
# What is read: a month back, four months ahead.
BACK, AHEAD = 31, 122


def is_ha(url: str) -> bool:
    return url.startswith(PREFIX)


def entity_of(url: str) -> str:
    return url[len(PREFIX):]


def _when(value) -> date | datetime | None:
    if isinstance(value, dict):
        value = value.get("dateTime") or value.get("date")
    if not value:
        return None
    text = str(value)
    if len(text) == 10:
        return date.fromisoformat(text)
    moment = datetime.fromisoformat(text.replace("Z", "+00:00"))
    return moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)


def to_ics(entity_id: str, events: list[dict]) -> bytes:
    """Home Assistant's calendar events as an iCal calendar."""
    cal = icalendar.Calendar()
    cal.add("prodid", "-//Smooth Family//Home Assistant calendar//EN")
    cal.add("version", "2.0")
    for e in events or []:
        start, end = _when(e.get("start")), _when(e.get("end"))
        if start is None:
            continue
        ev = icalendar.Event()
        uid = e.get("uid") or hashlib.sha1(f"{entity_id}{e.get('summary')}{start}".encode()).hexdigest()
        ev.add("uid", f"{uid}{'-' + str(e['recurrence_id']) if e.get('recurrence_id') else ''}")
        ev.add("summary", e.get("summary") or "")
        ev.add("dtstart", start)
        if end is not None:
            ev.add("dtend", end)
        if e.get("location"):
            ev.add("location", e["location"])
        if e.get("description"):
            ev.add("description", e["description"])
        cal.add_component(ev)
    return cal.to_ical()


async def fetch(db, family_id: uuid.UUID, entity_id: str) -> bytes:
    """The calendar as iCal bytes (empty when there's no Home Assistant or it can't be read)."""
    conn = await smarthome_conn.primary(db, family_id)
    if conn is None:
        return to_ics(entity_id, [])
    now = datetime.now(timezone.utc)
    token = decrypt_token(conn.token_encrypted) if conn.token_encrypted else ""
    events = await ha.calendar_events(conn.base_url, token, entity_id, (now - timedelta(days=BACK)).isoformat(), (now + timedelta(days=AHEAD)).isoformat())
    return to_ics(entity_id, events)

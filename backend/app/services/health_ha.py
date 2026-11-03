"""Health from Home Assistant (3.4.0): a person's steps, sleep, weight and resting pulse read from
sensors they choose themselves – the companion app on their phone (Health Connect on Android, the
pedometer on iOS), Withings, Garmin, Fitbit or anything else that shows up as a sensor.

Read-only, and only the sensors the person picked. The current state is read (every 15 minutes, and
when asked) and kept on the day it is from (the state's last change), so it works the same through
the gateway and the simulated home as directly. What the person entered by hand is never
overwritten: an import only fills in what's empty on such a day.
"""
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import HealthDay, User
from app.services import homeassistant as ha
from app.services import smarthome_conn
from app.services.crypto import decrypt_token
from app.services.weather import _tz

log = logging.getLogger(__name__)

METRICS = ("steps", "sleep", "weight", "resting_hr")
# The HealthDay column each metric fills.
COLUMN = {"steps": "steps", "sleep": "sleep_minutes", "weight": "weight_kg", "resting_hr": "resting_hr"}
EVERY = timedelta(minutes=15)
SOURCE = "home_assistant"

_WORDS = {
    "steps": ("step", "steg", "skritt", "skridt", "askel", "pedometer"),
    "sleep": ("sleep", "sömn", "sovn", "søvn", "uni"),
    "weight": ("weight", "vikt", "vekt", "vægt", "paino", "mass"),
    "resting_hr": ("resting", "heart", "pulse", "puls", "syke", "hr"),
}


def _number(state: str | None) -> float | None:
    try:
        return float(state) if state not in (None, "", "unknown", "unavailable") else None
    except ValueError:
        return None


def score(metric: str, state: dict) -> int:
    """How likely a sensor is to be this metric (0 = not at all) – to suggest it first."""
    entity = state.get("entity_id", "")
    attrs = state.get("attributes") or {}
    if not entity.startswith("sensor.") or _number(state.get("state")) is None:
        return 0
    unit = str(attrs.get("unit_of_measurement") or "").strip().lower()
    kind = str(attrs.get("device_class") or "").lower()
    text = f"{entity} {attrs.get('friendly_name') or ''}".lower()
    named = any(w in text for w in _WORDS[metric])
    if metric == "steps":
        return 3 if unit in ("steps", "step", "steg") else 2 if named and unit in ("", "count") else 0
    if metric == "sleep":
        return 3 if named and (kind == "duration" or unit in ("h", "min", "s")) else 0
    if metric == "weight":
        return 3 if kind == "weight" and named else 2 if kind == "weight" or (named and unit in ("kg", "lb", "lbs")) else 0
    if metric == "resting_hr":
        return 3 if unit == "bpm" and "rest" in text else 2 if unit == "bpm" else 0
    return 0


def candidates(states: list[dict]) -> dict[str, list[dict]]:
    """Per metric, the sensors that could be it – the likeliest first."""
    out = {}
    for metric in METRICS:
        ranked = sorted(((score(metric, s), s) for s in states), key=lambda x: (-x[0], x[1]["entity_id"]))
        out[metric] = [
            {
                "entity_id": s["entity_id"],
                "name": (s.get("attributes") or {}).get("friendly_name") or s["entity_id"],
                "state": s.get("state"),
                "unit": (s.get("attributes") or {}).get("unit_of_measurement"),
            }
            for n, s in ranked
            if n > 0
        ][:40]
    return out


def convert(metric: str, value: float, unit: str | None) -> float | int | None:
    """Into what Smooth Family keeps: steps, minutes of sleep, kg, beats a minute."""
    unit = (unit or "").strip().lower()
    if metric == "sleep":
        factor = {"h": 60, "hr": 60, "hours": 60, "min": 1, "minutes": 1, "s": 1 / 60, "sec": 1 / 60, "ms": 1 / 60000, "d": 1440}.get(unit, 60 if value <= 24 else 1)
        minutes = round(value * factor)
        return minutes if 0 <= minutes <= 24 * 60 else None
    if metric == "weight":
        kg = value * {"lb": 0.45359237, "lbs": 0.45359237, "g": 0.001, "st": 6.35029318}.get(unit, 1)
        return round(kg, 1) if 1 <= kg <= 500 else None
    if metric == "steps":
        return int(value) if 0 <= value <= 200_000 else None
    if metric == "resting_hr":
        return int(round(value)) if 20 <= value <= 250 else None
    return None


def _day(state: dict):
    when = state.get("last_changed") or state.get("last_updated")
    try:
        moment = datetime.fromisoformat(str(when).replace("Z", "+00:00"))
    except ValueError:
        moment = datetime.now(timezone.utc)
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(_tz()).date()


async def sync_person(db: AsyncSession, user: User) -> int:
    """Read the person's chosen sensors into their days. Returns how many numbers were taken in."""
    chosen = {m: e for m, e in (user.health_sources or {}).items() if m in METRICS and e}
    if user.role == "child":
        chosen.pop("weight", None)
    conn = await smarthome_conn.primary(db, user.family_id)
    if not chosen or conn is None:
        return 0
    token = decrypt_token(conn.token_encrypted) if conn.token_encrypted else ""
    taken = 0
    for metric, entity in chosen.items():
        try:
            state = await ha.get_state(conn.base_url, token, entity)
        except Exception:
            log.info("health: %s could not be read", entity)
            continue
        raw = _number(state.get("state"))
        value = convert(metric, raw, (state.get("attributes") or {}).get("unit_of_measurement")) if raw is not None else None
        if value is None:
            continue
        day = _day(state)
        row = (await db.execute(select(HealthDay).where(HealthDay.user_id == user.id, HealthDay.day == day))).scalar_one_or_none()
        if row is None:
            row = HealthDay(family_id=user.family_id, user_id=user.id, day=day, source=SOURCE)
            db.add(row)
        column = COLUMN[metric]
        current = getattr(row, column)
        if row.source != SOURCE and current is not None:
            continue  # entered by hand: that wins
        # A day's step counter only grows; a later, lower reading is the next day's start.
        if metric == "steps" and current is not None and row.source == SOURCE:
            value = max(current, value)
        if current != value:
            setattr(row, column, value)
            row.updated_at = datetime.now(timezone.utc)
            taken += 1
    user.health_sources = {**(user.health_sources or {}), "synced_at": datetime.now(timezone.utc).isoformat()}
    await db.commit()
    return taken


def _due(user: User, now: datetime) -> bool:
    synced = (user.health_sources or {}).get("synced_at")
    if not synced:
        return True
    try:
        return now - datetime.fromisoformat(synced) >= EVERY
    except ValueError:
        return True


async def run_health_sync(db: AsyncSession, now: datetime | None = None) -> int:
    """The background worker: everyone with sensors chosen, every 15 minutes."""
    now = now or datetime.now(timezone.utc)
    users = (await db.execute(select(User).where(User.health_sources.is_not(None)))).scalars().all()
    done = 0
    for user in users:
        if "health" not in user.apps or not _due(user, now):
            continue
        try:
            await sync_person(db, user)
            done += 1
        except Exception:
            await db.rollback()
            log.exception("health: sync failed for a member")
    return done

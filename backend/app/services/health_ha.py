"""Health from Home Assistant (3.4.0): a person's steps, sleep, weight and resting pulse read from their
own accounts in the family's Home Assistant – the companion app on their phone (Health Connect on
Android, the pedometer on iOS), Withings, Google Health, Garmin Connect, or anything else that shows up
as sensors. Each account is an integration entry (one per Withings user, phone or Garmin login).

The family admin links a member's accounts (or single sensors) to them; nothing is fetched until the
member turns it on (an adult may, for a child). Read-only. The current state is read every 15
minutes and when asked, and kept on the day it is from (the state's last change), so it works the
same through the gateway and the simulated home as directly. What the person entered by hand is
never overwritten: an import only fills in what's empty on such a day.
"""
import json
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import HealthDay, SmarthomeConnection, User
from app.services import homeassistant as ha
from app.services import smarthome_conn
from app.services.crypto import decrypt_token
from app.services.weather import _tz

log = logging.getLogger(__name__)

METRICS = ("steps", "sleep", "weight", "resting_hr")
# Workouts (3.4.0): a calendar whose events are workouts (Withings), or a sensor that lists recent
# activities or describes the last one (Garmin Connect, Strava and others) – beta until tried on a
# real account of each.
WORKOUTS = "workouts"
SOURCES = (*METRICS, WORKOUTS)
# How far back workouts are taken in.
WORKOUT_DAYS = 14
# The HealthDay column each metric fills.
COLUMN = {"steps": "steps", "sleep": "sleep_minutes", "weight": "weight_kg", "resting_hr": "resting_hr"}
EVERY = timedelta(minutes=15)
SOURCE = "home_assistant"

# The integrations known by name; any other with health sensors shows by its own name.
INTEGRATIONS = {
    "mobile_app": "Home Assistant app",
    "withings": "Withings",
    "google_health": "Google Health",
    "fitbit": "Fitbit",
    "garmin_connect": "Garmin Connect",
    "ha_strava": "Strava",
    "strava": "Strava",
    "oura": "Oura",
    "polar": "Polar",
}

_WORDS = {
    "steps": ("step", "steg", "skritt", "skridt", "askel", "pedometer"),
    "sleep": ("sleep", "sömn", "sovn", "søvn", "uni"),
    "weight": ("weight", "vikt", "vekt", "vægt", "paino", "mass"),
    "resting_hr": ("resting", "heart", "pulse", "puls", "syke", "hr"),
}
# Words that make a sensor something else: a goal, part of the night, part of the body.
_NOT = {
    "steps": ("goal", "mål", "target", "floor"),
    "sleep": ("deep", "light", "rem", "awake", "wake", "latency", "score", "goal", "interrupt", "snore", "breath", "heart", "djup", "lätt"),
    "weight": ("goal", "mål", "fat", "muscle", "bone", "water", "lean", "bmi"),
    "resting_hr": ("max", "min ", "minimum", "average", "variab", "hrv"),
}

# Each sensor and calendar with its integration and account, in one render (Home Assistant 2024.2
# and later); "k" is the names of its attributes, to tell an activities sensor.
TEMPLATE = """{%- set ns = namespace(rows=[]) -%}
{%- for s in states.sensor | list + states.calendar | list -%}
{%- set entry = config_entry_id(s.entity_id) -%}
{%- if entry -%}
{%- set ns.rows = ns.rows + [{"e": s.entity_id, "s": s.state, "u": s.attributes.unit_of_measurement, "c": s.attributes.device_class,
  "n": s.attributes.friendly_name, "id": entry, "d": config_entry_attr(entry, "domain"), "t": config_entry_attr(entry, "title"),
  "k": s.attributes.keys() | list | join(",")}] -%}
{%- endif -%}
{%- endfor -%}
{{ ns.rows | tojson }}"""


def _number(state: str | None) -> float | None:
    try:
        return float(state) if state not in (None, "", "unknown", "unavailable") else None
    except ValueError:
        return None


_ACTIVITY_LISTS = ("last_activities", "activities", "recent_activities", "workouts", "last_workouts")
_WORKOUT_WORDS = ("workout", "activit", "training", "träning", "trening", "træning", "exercise", "liikunta")


def score_workouts(state: dict, attr_names: list[str] | None = None) -> int:
    """How likely an entity is to hold workouts: a workout calendar, or an activities sensor."""
    entity = state.get("entity_id", "")
    attrs = state.get("attributes") or {}
    names = attr_names if attr_names is not None else list(attrs)
    text = f"{entity} {attrs.get('friendly_name') or ''}".lower()
    if any(w in text for w in ("goal", "scheduled", "next ", "_next_", "gear", "route", "streak")):
        return 0
    if entity.startswith("calendar."):
        return 3 if any(w in text for w in _WORKOUT_WORDS) else 0
    if not entity.startswith("sensor."):
        return 0
    if any(n in names for n in ("last_activities", "recent_activities")):
        return 3
    if any(w in text for w in ("last_activit", "latest_activit", "recent_activit", "last_workout", "latest_workout")):
        return 2
    return 0


def score(metric: str, state: dict) -> int:
    """How likely a sensor is to be this metric (0 = not at all) – to suggest it first."""
    if metric == WORKOUTS:
        return score_workouts(state)
    entity = state.get("entity_id", "")
    attrs = state.get("attributes") or {}
    if not entity.startswith("sensor.") or _number(state.get("state")) is None:
        return 0
    unit = str(attrs.get("unit_of_measurement") or "").strip().lower()
    kind = str(attrs.get("device_class") or "").lower()
    text = f"{entity} {attrs.get('friendly_name') or ''}".lower()
    if any(w in text for w in _NOT[metric]):
        return 0
    named = any(w in text for w in _WORDS[metric])
    if metric == "steps":
        return 3 if unit in ("steps", "step", "steg") else 2 if named and unit in ("", "count") else 0
    if metric == "sleep":
        if not named or not (kind == "duration" or unit in ("h", "min", "s")):
            return 0
        return 3 if any(w in text for w in ("total", "duration", "asleep", "time")) else 2
    if metric == "weight":
        return 3 if kind == "weight" and named else 2 if kind == "weight" or (named and unit in ("kg", "lb", "lbs")) else 0
    if metric == "resting_hr":
        return 3 if unit == "bpm" and "rest" in text else 1 if unit == "bpm" else 0
    return 0


def _ranked(metric: str, states: list[dict]) -> list[dict]:
    ranked = sorted(((score(metric, s), s) for s in states), key=lambda x: (-x[0], x[1]["entity_id"]))
    return [
        {
            "entity_id": s["entity_id"],
            "name": (s.get("attributes") or {}).get("friendly_name") or s["entity_id"],
            "state": s.get("state"),
            "unit": (s.get("attributes") or {}).get("unit_of_measurement"),
        }
        for n, s in ranked
        if n > 0
    ][:40]


def candidates(states: list[dict]) -> dict[str, list[dict]]:
    """Per metric, the sensors that could be it – the likeliest first."""
    return {metric: _ranked(metric, states) for metric in SOURCES}


async def _token(conn: SmarthomeConnection) -> str:
    return decrypt_token(conn.token_encrypted) if conn.token_encrypted else ""


async def discover(conn: SmarthomeConnection) -> tuple[list[dict], dict[str, list[dict]]]:
    """The health accounts in Home Assistant – each integration entry with health sensors, and what
    each of its sensors could be – plus every sensor that could be a metric (for "another sensor").
    Through the gateway the accounts can't be told apart: then only the sensors."""
    token = await _token(conn)
    states = await ha.get_states(conn.base_url, token)
    try:
        rows = json.loads(await ha.render_template(conn.base_url, token, TEMPLATE))
    except Exception:
        rows = []
    entries: dict[str, dict] = {}
    names: dict[str, list[str]] = {}
    for row in rows:
        entry = entries.setdefault(row["id"], {"entry": row["id"], "domain": row.get("d") or "", "title": row.get("t") or "", "states": []})
        entry["states"].append({"entity_id": row["e"], "state": row.get("s"), "attributes": {"unit_of_measurement": row.get("u"), "device_class": row.get("c"), "friendly_name": row.get("n")}})
        names[row["e"]] = [n for n in str(row.get("k") or "").split(",") if n]
    accounts = []
    for entry in entries.values():
        metrics = {m: _ranked(m, entry["states"]) for m in METRICS}
        ranked = sorted(((score_workouts(s, names.get(s["entity_id"])), s) for s in entry["states"]), key=lambda x: -x[0])
        metrics[WORKOUTS] = [{"entity_id": s["entity_id"], "name": s["attributes"].get("friendly_name") or s["entity_id"], "state": None, "unit": None} for n, s in ranked if n > 0]
        if any(metrics.values()):
            accounts.append({
                "entry": entry["entry"], "domain": entry["domain"], "title": entry["title"],
                "label": INTEGRATIONS.get(entry["domain"], entry["domain"].replace("_", " ").title()),
                "metrics": {m: c for m, c in metrics.items() if c},
            })
    accounts.sort(key=lambda a: (a["label"].casefold(), a["title"].casefold()))
    return accounts, candidates(states)


def resolve(accounts: list[dict], linked: list[str], chosen: dict[str, str | None]) -> dict[str, str]:
    """Which sensor each metric is read from: the admin's choice, or the likeliest sensor of the
    first linked account that has it."""
    out = {}
    for metric in SOURCES:
        if metric in chosen:
            if chosen[metric]:
                out[metric] = chosen[metric]
            continue
        for account in accounts:
            if account["entry"] in linked and account["metrics"].get(metric):
                out[metric] = account["metrics"][metric][0]["entity_id"]
                break
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


def chosen_of(user: User) -> dict[str, str]:
    """The sensors a person's health is read from."""
    out = {m: e for m, e in (user.health_sources or {}).items() if m in SOURCES and isinstance(e, str) and e}
    if user.role == "child":
        out.pop("weight", None)
    return out


async def sync_person(db: AsyncSession, user: User) -> int:
    """Read the person's sensors into their days, if they've turned it on. Returns how many numbers
    were taken in."""
    chosen = chosen_of(user)
    conn = await smarthome_conn.primary(db, user.family_id)
    if not chosen or conn is None or not user.health_import:
        return 0
    token = await _token(conn)
    taken = 0
    if WORKOUTS in chosen:
        taken += await _sync_workouts(db, user, conn, token, chosen.pop(WORKOUTS))
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


# --- Workouts ------------------------------------------------------------------------------------

_KINDS = (
    ("run", ("run", "jog", "löp", "trail", "treadmill", "juoks")),
    ("bike", ("bik", "cycl", "ride", "cykel", "spinning", "pyöräil")),
    ("swim", ("swim", "sim", "svøm", "uinti")),
    ("ski", ("ski", "skid", "langlauf", "hiiht")),
    ("walk", ("walk", "hik", "promenad", "gå", "kävel", "trek")),
    ("yoga", ("yoga", "pilates", "stretch", "jooga")),
    ("gym", ("strength", "gym", "weight", "fitness", "crossfit", "hiit", "cardio", "styrke", "kuntosali")),
    ("sport", ("football", "soccer", "fotboll", "hockey", "tennis", "padel", "basket", "handball", "innebandy", "floorball", "golf", "badminton")),
)


def _kind(text: str) -> str:
    text = text.lower()
    for kind, words in _KINDS:
        if any(w in text for w in words):
            return kind
    return "other"


def _first(d: dict, *keys):
    for k in keys:
        if d.get(k) not in (None, ""):
            return d[k]
    return None


def _moment(value) -> datetime | None:
    if value in (None, ""):
        return None
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value / 1000 if value > 10**11 else value, timezone.utc)
    text = str(value).replace("Z", "+00:00")
    try:
        moment = datetime.fromisoformat(text.replace(" ", "T") if "T" not in text and " " in text else text)
    except ValueError:
        return None
    return moment if moment.tzinfo else moment.replace(tzinfo=_tz())


def parse_activity(raw: dict) -> dict | None:
    """One activity from an integration's attributes (Garmin's raw activity, Strava's and the like):
    {external, day, kind, minutes, km} – or None when it can't be read."""
    kind_value = _first(raw, "activityType", "sport_type", "activity_type", "type", "sport", "workout_type", "activityName", "name", "title")
    if isinstance(kind_value, dict):
        kind_value = kind_value.get("typeKey") or kind_value.get("key") or kind_value.get("name")
    start = _moment(_first(raw, "startTimeLocal", "start_date_local", "startTime", "start_date", "start_time", "start", "date", "startTimeGMT"))
    seconds = _first(raw, "duration", "elapsedDuration", "movingDuration", "moving_time", "elapsed_time", "duration_seconds", "duration_s")
    minutes = _first(raw, "duration_minutes", "minutes", "duration_min")
    try:
        mins = round(float(minutes)) if minutes is not None else round(float(seconds) / 60) if seconds is not None else None
    except (TypeError, ValueError):
        mins = None
    if start is None or not mins or mins < 1 or mins > 24 * 60:
        return None
    km_value = _first(raw, "distance_km", "km")
    meters = _first(raw, "distance", "distance_m", "distanceInMeters")
    try:
        km = round(float(km_value), 2) if km_value is not None else round(float(meters) / 1000, 2) if meters else None
    except (TypeError, ValueError):
        km = None
    ident = _first(raw, "activityId", "activity_id", "id", "uid")
    return {
        "external": str(ident) if ident is not None else f"{start.isoformat()}:{mins}",
        "day": start.astimezone(_tz()).date(), "kind": _kind(str(kind_value or "")), "minutes": int(mins), "km": km if km and km > 0 else None,
    }


def parse_activities_state(state: dict) -> list[dict]:
    """An activities sensor: a list of recent activities in an attribute, or the last one itself."""
    attrs = state.get("attributes") or {}
    for key in _ACTIVITY_LISTS:
        if isinstance(attrs.get(key), list):
            return [a for a in (parse_activity(x) for x in attrs[key] if isinstance(x, dict)) if a]
    one = parse_activity({**attrs, "name": attrs.get("name") or state.get("state")})
    return [one] if one else []


def parse_calendar_events(events: list[dict]) -> list[dict]:
    """A workout calendar's events (Withings): the summary is the kind, the length the minutes."""
    out = []
    for e in events or []:
        start = _moment((e.get("start") or {}).get("dateTime") if isinstance(e.get("start"), dict) else e.get("start"))
        end = _moment((e.get("end") or {}).get("dateTime") if isinstance(e.get("end"), dict) else e.get("end"))
        if start is None or end is None or end <= start:
            continue
        mins = round((end - start).total_seconds() / 60)
        if 1 <= mins <= 24 * 60:
            out.append({"external": str(e.get("uid") or f"{start.isoformat()}"), "day": start.astimezone(_tz()).date(), "kind": _kind(e.get("summary") or ""), "minutes": mins, "km": None})
    return out


async def _sync_workouts(db: AsyncSession, user: User, conn: SmarthomeConnection, token: str, entity: str) -> int:
    """Take in the last two weeks' workouts; a workout already here – from this source, or the same
    one from another (same day and kind, about as long) – isn't taken twice."""
    from app.models import Workout

    now = datetime.now(timezone.utc)
    try:
        if entity.startswith("calendar."):
            found = parse_calendar_events(await ha.calendar_events(conn.base_url, token, entity, (now - timedelta(days=WORKOUT_DAYS)).isoformat(), now.isoformat()))
        else:
            found = parse_activities_state(await ha.get_state(conn.base_url, token, entity))
    except Exception:
        log.info("health: workouts from %s could not be read", entity)
        return 0
    first = (now - timedelta(days=WORKOUT_DAYS)).astimezone(_tz()).date()
    found = [w for w in found if w["day"] >= first]
    if not found:
        return 0
    have = (await db.execute(select(Workout).where(Workout.user_id == user.id, Workout.day >= first))).scalars().all()
    known = {w.external_id for w in have if w.source == SOURCE}
    new = []
    for w in found:
        external = f"{entity}:{w['external']}"[:120]
        twin = any(h.day == w["day"] and h.kind == w["kind"] and abs(h.minutes - w["minutes"]) <= max(5, w["minutes"] * 0.15) for h in have)
        if external in known or twin:
            continue
        row = Workout(family_id=user.family_id, user_id=user.id, day=w["day"], kind=w["kind"], minutes=w["minutes"], distance_km=w["km"], source=SOURCE, external_id=external, created_by=user.id, created_at=now)
        db.add(row)
        have.append(row)
        known.add(external)
        new.append(row)
    if not new:
        return 0
    await db.commit()
    # A task done by exercising, and the badges, as when it's logged by hand.
    from app.services.achievements import evaluate_achievements
    from app.services.health import tick_exercise_tasks

    for day in sorted({w.day for w in new}):
        await tick_exercise_tasks(db, user, day, user)
    await evaluate_achievements(db, user)
    return len(new)


def _due(user: User, now: datetime) -> bool:
    synced = (user.health_sources or {}).get("synced_at")
    if not synced:
        return True
    try:
        return now - datetime.fromisoformat(synced) >= EVERY
    except ValueError:
        return True


async def run_health_sync(db: AsyncSession, now: datetime | None = None) -> int:
    """The background worker: everyone who has it on, every 15 minutes."""
    now = now or datetime.now(timezone.utc)
    users = (await db.execute(select(User).where(User.health_import == True, User.health_sources.is_not(None)))).scalars().all()  # noqa: E712
    done = 0
    for user in users:
        if "health" not in user.apps or not chosen_of(user) or not _due(user, now):
            continue
        try:
            await sync_person(db, user)
            done += 1
        except Exception:
            await db.rollback()
            log.exception("health: sync failed for a member")
    return done

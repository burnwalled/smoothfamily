"""Updates of the server's other software (2.9.0): Postgres, Redis, Caddy and SearXNG get security
fixes between Smooth Family's releases. The server admin chooses in Server settings when they may be
put in; the server's own update.sh (run every hour by the NAS) does the Docker work. The app never
touches Docker – the two talk through files in the updates folder (DATA_DIR/updates):

    state.json        written by update.sh: what runs now (each service's image and version)
    plan.env          written here: the run's id, not before when, and the new images
    result.env        written by update.sh: how the run went

Only patches and minor versions within the same major (Postgres 16.x, Redis 7.x, Caddy 2.x); a new
major version of Postgres needs a dump and restore and is never done here. A version must have been
out for a week before it is used.

Smooth Family itself (3.3.0) is updated the same way when the admin has chosen a channel – stable or
beta: services/app_updates.py finds the signed build, and update.sh pulls its two images by digest.
"""
import json
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import AppSetting, Family, User
from app.services import app_updates
from app.services.notify import notify

SETTING = "updates"
STATUS = "updates_status"
# Sunday 04:00, asked first; Smooth Family itself only when a channel is chosen (an outgoing call).
DEFAULTS = {"mode": "approve", "day": 6, "hour": 4, "channel": "off"}
MIN_AGE = timedelta(days=7)
CHECK_EVERY = timedelta(hours=6)


@dataclass(frozen=True)
class Track:
    """How a service's versions are found: the Docker Hub repository, the image's version variable,
    and the tag shape for a version (same major only)."""

    repo: str
    env: str
    tag: str  # format with {v}


TRACKS = {
    "db": Track("library/postgres", "PG_VERSION", "{v}-alpine"),
    "redis": Track("library/redis", "REDIS_VERSION", "{v}-alpine"),
    "caddy": Track("library/caddy", "CADDY_VERSION", "{v}-alpine"),
    "searxng": Track("searxng/searxng", "__SEARXNG_VERSION", "{v}"),
}
# The tags a version may be taken from: exact versions only, never the moving "16-alpine".
TAG = {
    "db": re.compile(r"^(\d+)\.(\d+)-alpine$"),
    "redis": re.compile(r"^(\d+)\.(\d+)\.(\d+)-alpine$"),
    "caddy": re.compile(r"^(\d+)\.(\d+)\.(\d+)-alpine$"),
    "searxng": re.compile(r"^(\d{4})\.(\d{1,2})\.(\d{1,2})-[0-9a-f]+$"),
}
RUNNING = re.compile(r"^v?(\d+)\.(\d+)(?:\.(\d+))?")


def folder() -> Path:
    return Path(get_settings().updates_dir)


def _key(numbers) -> tuple[int, int, int]:
    nums = [int(x) for x in numbers if x is not None]
    return tuple((nums + [0, 0, 0])[:3])


def newer(track: str, current: str, tags: list[tuple[str, datetime]], now: datetime) -> str | None:
    """The newest exact tag after `current` – in the same major (but any newer for SearXNG, whose
    versions are dates) – that has been out for at least a week."""
    m = RUNNING.match(current.strip())
    if not m:
        return None
    have = _key(m.groups())
    best, best_tag = None, None
    for tag, when in tags:
        t = TAG[track].match(tag)
        if not t or now - when < MIN_AGE:
            continue
        k = _key(t.groups())
        if k <= have or (track != "searxng" and k[0] != have[0]):
            continue
        if best is None or k > best:
            best, best_tag = k, tag
    return best_tag


async def hub_tags(repo: str, prefix: str) -> list[tuple[str, datetime]]:
    url = f"https://hub.docker.com/v2/repositories/{repo}/tags"
    out = []
    async with httpx.AsyncClient(timeout=20) as client:
        params = {"page_size": 100, "ordering": "last_updated", "name": prefix}
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        for t in resp.json().get("results", []):
            when = datetime.fromisoformat(t["last_updated"].replace("Z", "+00:00"))
            out.append((t["name"], when))
    return out


def read_state() -> dict | None:
    path = folder() / "state.json"
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def read_env(name: str) -> dict:
    path = folder() / name
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return {}
    return {k: v.strip().strip('"') for k, _, v in (line.partition("=") for line in lines if "=" in line and not line.startswith("#"))}


def current_versions(state: dict) -> dict[str, str]:
    """The version each tracked service runs, from its image's own variable."""
    out = {}
    for name, svc in (state.get("services") or {}).items():
        track = TRACKS.get(name)
        if not track:
            continue
        for item in svc.get("env") or []:
            key, _, value = str(item).partition("=")
            if key == track.env:
                out[name] = value
    return out


async def get_settings_(db: AsyncSession) -> dict:
    row = await db.get(AppSetting, SETTING)
    try:
        return {**DEFAULTS, **(json.loads(row.value) if row else {})}
    except ValueError:
        return dict(DEFAULTS)


async def _put(db: AsyncSession, key: str, value: dict) -> None:
    row = await db.get(AppSetting, key)
    if row is None:
        db.add(AppSetting(key=key, value=json.dumps(value)))
    else:
        row.value = json.dumps(value)
    await db.commit()


async def set_settings(db: AsyncSession, mode: str, day: int, hour: int, channel: str = "off") -> dict:
    value = {"mode": mode, "day": day, "hour": hour, "channel": channel}
    await _put(db, SETTING, value)
    return value


async def get_status(db: AsyncSession) -> dict:
    row = await db.get(AppSetting, STATUS)
    try:
        return json.loads(row.value) if row else {}
    except ValueError:
        return {}


async def check(db: AsyncSession, now: datetime | None = None, fetch=hub_tags) -> dict:
    """What runs and what newer versions there are – stored for the page and the plan."""
    now = now or datetime.now(timezone.utc)
    state = read_state()
    status = await get_status(db)
    if state is None:
        status.update(seen=False, checked_at=now.isoformat())
        await _put(db, STATUS, status)
        return status
    running = current_versions(state)
    found = {}
    for name, version in running.items():
        track = TRACKS[name]
        prefix = "" if name == "searxng" else version.split(".")[0] + "."
        try:
            tags = await fetch(track.repo, prefix)
        except (httpx.HTTPError, ValueError, KeyError):
            continue
        candidate = newer(name, version, tags, now)
        if candidate:
            found[name] = candidate
    # Smooth Family itself, on the chosen channel.
    channel = (await get_settings_(db)).get("channel", "off")
    status.pop("app_error", None)
    if channel != "off":
        try:
            app = await app_updates.available(channel)
        except app_updates.AppUpdateError as e:
            status["app_error"] = str(e)
        else:
            if app:
                found["app"] = app
    status.update(seen=True, checked_at=now.isoformat(), state_at=state.get("checked_at"), running=running, available=found)
    await _put(db, STATUS, status)
    return status


def next_window(settings: dict, now: datetime) -> datetime:
    """The next time in the chosen weekday and hour (the server's time zone)."""
    tz = ZoneInfo(get_settings().timezone)
    local = now.astimezone(tz)
    days = (settings["day"] - local.weekday()) % 7
    start = (local + timedelta(days=days)).replace(hour=settings["hour"], minute=0, second=0, microsecond=0)
    if start <= local:
        start += timedelta(days=7)
    return start.astimezone(timezone.utc)


def write_plan(available: dict, not_before: datetime) -> str:
    """The plan update.sh carries out: the new images, and not before when. update.sh checks every
    value against a strict pattern and writes the compose override itself. Smooth Family's own two
    images come by digest, as the signed manifest names them."""
    run_id = uuid.uuid4().hex[:12]
    out = folder()
    out.mkdir(parents=True, exist_ok=True)
    images = {name: f"{TRACKS[name].repo.removeprefix('library/')}:{tag}" for name, tag in available.items() if name in TRACKS}
    if "app" in available:
        images["backend"] = available["app"]["backend"]
        images["frontend"] = available["app"]["frontend"]
    env = [f"RUN_ID={run_id}", f"NOT_BEFORE={int(not_before.timestamp())}", f"PULL=\"{' '.join(sorted(images.values()))}\""]
    tmp = out / "plan.env.tmp"
    tmp.write_text("\n".join(env) + "\n", encoding="utf-8")
    tmp.replace(out / "plan.env")
    return run_id


def cancel_plan() -> None:
    (folder() / "plan.env").unlink(missing_ok=True)


async def adults_on_server(db: AsyncSession) -> list[User]:
    """Everyone grown-up on the server – in every family (not demos): an update touches them all."""
    rows = await db.execute(
        select(User).join(Family, Family.id == User.family_id).where(User.role.in_(["admin", "adult"]), Family.kind != "demo")
    )
    return list(rows.scalars().all())


_PLANNED = {
    "en": ("Server update", "The server is updated {when} – a few minutes' break."),
    "sv": ("Serveruppdatering", "Servern uppdateras {when} – ett avbrott på några minuter."),
    "nb": ("Serveroppdatering", "Serveren oppdateres {when} – et avbrudd på noen minutter."),
    "da": ("Serveropdatering", "Serveren opdateres {when} – en afbrydelse på nogle minutter."),
    "fi": ("Palvelimen päivitys", "Palvelin päivitetään {when} – muutaman minuutin katko."),
}
_NOW = {"en": "within the hour", "sv": "inom en timme", "nb": "innen en time", "da": "inden for en time", "fi": "tunnin sisällä"}
_DONE = {
    "en": ("Server updated", "The server's update went well.", "The server's update failed – the old versions are back."),
    "sv": ("Servern uppdaterad", "Serverns uppdatering gick bra.", "Serverns uppdatering misslyckades – de gamla versionerna är tillbaka."),
    "nb": ("Serveren oppdatert", "Serverens oppdatering gikk bra.", "Serverens oppdatering feilet – de gamle versjonene er tilbake."),
    "da": ("Serveren opdateret", "Serverens opdatering gik godt.", "Serverens opdatering mislykkedes – de gamle versioner er tilbage."),
    "fi": ("Palvelin päivitetty", "Palvelimen päivitys onnistui.", "Palvelimen päivitys epäonnistui – vanhat versiot palautettiin."),
}
_ASK = {
    "en": ("Updates to approve", "New versions of the server's software are ready – approve them in Server settings."),
    "sv": ("Uppdateringar att godkänna", "Nya versioner av serverns programvara finns – godkänn dem i Serverinställningar."),
    "nb": ("Oppdateringer å godkjenne", "Nye versjoner av serverens programvare finnes – godkjenn dem i Serverinnstillinger."),
    "da": ("Opdateringer at godkende", "Nye versioner af serverens software findes – godkend dem i Serverindstillinger."),
    "fi": ("Hyväksyttäviä päivityksiä", "Palvelimen ohjelmistoista on uusia versioita – hyväksy ne Palvelimen asetuksissa."),
}


async def plan(db: AsyncSession, now: datetime | None = None, at_once: bool = False) -> str | None:
    """Plan the available updates for the next window (or the next hourly run) and tell the adults."""
    now = now or datetime.now(timezone.utc)
    status = await get_status(db)
    available = status.get("available") or {}
    if not available:
        return None
    settings = await get_settings_(db)
    when = now if at_once else next_window(settings, now)
    run_id = write_plan(available, when)
    status.update(planned={"run_id": run_id, "at": when.isoformat(), "versions": available})
    await _put(db, STATUS, status)
    tz = ZoneInfo(get_settings().timezone)
    for user in await adults_on_server(db):
        title, body = _PLANNED.get(user.language or "en", _PLANNED["en"])
        label = _NOW.get(user.language or "en", _NOW["en"]) if at_once else when.astimezone(tz).strftime("%Y-%m-%d %H:%M")
        await notify(db, user, {"title": title, "body": body.format(when=label), "route": "/", "kind": "server_update"})
    return run_id


async def run_update_cycle(db: AsyncSession, now: datetime | None = None) -> None:
    """From the worker: check now and then, plan by the admin's choice, and tell how a run went."""
    now = now or datetime.now(timezone.utc)
    status = await get_status(db)
    # A finished run: told once.
    result = read_env("result.env")
    if result.get("RUN_ID") and result.get("RUN_ID") != status.get("told_run"):
        ok = result.get("OK") == "1"
        status.update(told_run=result["RUN_ID"], last_run={"run_id": result["RUN_ID"], "ok": ok, "at": result.get("AT"), "message": result.get("MESSAGE", "")[:300]})
        status.pop("planned", None)
        await _put(db, STATUS, status)
        for user in await adults_on_server(db):
            title, good, bad = _DONE.get(user.language or "en", _DONE["en"])
            await notify(db, user, {"title": title, "body": good if ok else bad, "route": "/", "kind": "server_update"})
    checked = status.get("checked_at")
    if checked and now - datetime.fromisoformat(checked) < CHECK_EVERY:
        return
    settings = await get_settings_(db)
    if settings["mode"] == "off":
        return
    status = await check(db, now)
    available = status.get("available") or {}
    planned = (status.get("planned") or {}).get("versions")
    if not available or planned == available:
        return
    if settings["mode"] == "auto":
        await plan(db, now)
    elif status.get("asked") != available:
        status["asked"] = available
        await _put(db, STATUS, status)
        admins = (await db.execute(select(User).where(User.is_server_admin.is_(True)))).scalars().all()
        for user in admins:
            title, body = _ASK.get(user.language or "en", _ASK["en"])
            await notify(db, user, {"title": title, "body": body, "route": "/server", "kind": "server_update"})

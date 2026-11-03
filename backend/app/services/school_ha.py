"""The children's school from Home Assistant (3.4.0): InfoMentor and SchoolSoft through the community
integrations that bring them into Home Assistant – the school day, PE tomorrow, the after-school
hours, homework, absence, the weekly letter, the school's news and the schedules as calendars.

Each child is a device of the integration (one entry with a device per child for InfoMentor; one
entry per child for SchoolSoft). The family admin links a child's school account to the child
(Family settings → Family members → the child); Smooth Family recognises what each sensor is by
its name – in English or Swedish, as Home Assistant names them in its language. The school's
calendars become the child's calendar subscriptions. What it reads is the child's: their adults
see it, and the child themself.

Beta: the integrations are small, unofficial and change; the names they use are recognised
loosely, so a renamed sensor still fits.
"""
import json
import logging
import re
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CalendarFeed, User
from app.services import homeassistant as ha
from app.services import smarthome_conn
from app.services.crypto import decrypt_token

log = logging.getLogger(__name__)

# Integrations recognised as a school's, by their domain.
SCHOOL_WORDS = ("infomentor", "schoolsoft", "school", "skola", "vklass", "unikum", "webuntis", "edlevo", "schoolday")
LABELS = {"infomentor": "InfoMentor", "schoolsoft": "SchoolSoft", "ha_schoolsoft": "SchoolSoft", "vklass": "Vklass", "unikum": "Unikum", "webuntis": "WebUntis"}

# What each sensor can be, by words in its entity id or name (å/ä/ö written as a/a/o).
ROLES: dict[str, tuple[str, tuple[str, ...]]] = {
    # role: (domain, words)
    "school_day": ("sensor", ("school_day", "skoldag", "schooldag")),
    "school_start": ("sensor", ("school_start", "skolstart", "skolan_borjar", "skoldagen_borjar")),
    "school_end": ("sensor", ("school_end", "skolslut", "skolan_slutar", "skoldagen_slutar")),
    "pe": ("binary_sensor", ("pe_next", "physical_education", "idrott", "gympa", "pe_")),
    "leisure_today": ("sensor", ("leisure_time_centre_today", "fritids_idag", "fritidshem_idag", "scheduled_time_today", "schemalagd_tid")),
    "checked_in": ("binary_sensor", ("checked_in", "incheckad")),
    "assignments": ("sensor", ("assignments", "uppgift", "laxor", "homework", "lesson_preparation")),
    "absent_today": ("binary_sensor", ("absent_today", "franvarande_idag", "franvaro_idag", "absent")),
    "last_absence": ("sensor", ("last_absence", "senaste_franvaro", "registered_absence", "registrerad_franvaro")),
    "weekly_letter": ("sensor", ("weekly_letter", "veckobrev", "veckoinfo")),
    "next_event": ("sensor", ("next_event", "nasta_handelse")),
    "next_lesson": ("sensor", ("next_lesson", "nasta_lektion")),
    "notifications": ("sensor", ("unread_notifications", "olasta", "notifications")),
    "news": ("sensor", ("school_news", "skolnyheter", "nyheter", "news", "learnlog")),
    "lunch": ("sensor", ("lunch", "matsedel", "skollunch")),
}
# Roles a hub (not a child) has: shared by every child of the same account.
SHARED = ("news", "lunch")

TEMPLATE = """{%- set ns = namespace(rows=[]) -%}
{%- for s in states.sensor | list + states.binary_sensor | list + states.calendar | list -%}
{%- set entry = config_entry_id(s.entity_id) -%}
{%- if entry -%}
{%- set dev = device_id(s.entity_id) -%}
{%- set ns.rows = ns.rows + [{"e": s.entity_id, "n": s.attributes.friendly_name, "id": entry, "d": config_entry_attr(entry, "domain"),
  "t": config_entry_attr(entry, "title"), "dev": dev, "dn": device_attr(dev, "name_by_user") or device_attr(dev, "name") if dev else none}] -%}
{%- endif -%}
{%- endfor -%}
{{ ns.rows | tojson }}"""


def _plain(text: str) -> str:
    text = (text or "").lower()
    for a, b in (("å", "a"), ("ä", "a"), ("ö", "o"), (" ", "_"), ("-", "_")):
        text = text.replace(a, b)
    return text


def role_of(entity_id: str, name: str | None) -> str | None:
    """What a school sensor is, from its id and name; None when it isn't one of the known kinds."""
    domain = entity_id.split(".", 1)[0]
    text = f"{_plain(entity_id)} {_plain(name or '')}"
    # The more specific first (absent_today before absent, leisure_time_centre_today before leisure).
    for role, (dom, words) in ROLES.items():
        if dom == domain and any(w in text for w in words):
            return role
    return None


def _school(domain: str) -> bool:
    return any(w in (domain or "").lower() for w in SCHOOL_WORDS)


async def _conn(db: AsyncSession, family_id: uuid.UUID):
    conn = await smarthome_conn.primary(db, family_id)
    return conn, (decrypt_token(conn.token_encrypted) if conn and conn.token_encrypted else "")


async def discover(db: AsyncSession, family_id: uuid.UUID) -> list[dict]:
    """The children found in the school integrations: [{key, entry, label, title, roles, calendars}]."""
    conn, token = await _conn(db, family_id)
    if conn is None:
        return []
    rows = json.loads(await ha.render_template(conn.base_url, token, TEMPLATE))
    groups: dict[str, dict] = {}
    shared: dict[str, dict[str, str]] = {}
    for row in rows:
        if not _school(row.get("d") or ""):
            continue
        entry = row["id"]
        key = row.get("dev") or entry
        group = groups.setdefault(key, {
            "key": key, "entry": entry, "domain": row.get("d") or "", "label": LABELS.get(row.get("d") or "", (row.get("d") or "").replace("_", " ").title()),
            "title": row.get("dn") or row.get("t") or "", "roles": {}, "calendars": [],
        })
        entity = row["e"]
        if entity.startswith("calendar."):
            group["calendars"].append({"entity": entity, "name": row.get("n") or entity})
            continue
        role = role_of(entity, row.get("n"))
        if role and role not in group["roles"]:
            group["roles"][role] = entity
            if role in SHARED:
                shared.setdefault(entry, {}).setdefault(role, entity)
    children = []
    for group in groups.values():
        # A hub with only the shared things (the school's news) isn't a child.
        own = {r for r in group["roles"] if r not in SHARED}
        if not own and not group["calendars"]:
            continue
        for role, entity in shared.get(group["entry"], {}).items():
            group["roles"].setdefault(role, entity)
        children.append(group)
    return sorted(children, key=lambda g: (g["label"], g["title"].casefold()))


async def link(db: AsyncSession, child: User, keys: list[str], by: User) -> dict:
    """Link a child's school accounts: their sensors by role, and their calendars as the child's
    subscriptions (made, or removed when no longer linked)."""
    found = {g["key"]: g for g in await discover(db, child.family_id)}
    linked = [found[k] for k in keys if k in found]
    roles: dict[str, str] = {}
    for g in linked:
        for role, entity in g["roles"].items():
            roles.setdefault(role, entity)
    wanted = {c["entity"]: c["name"] for g in linked for c in g["calendars"]}
    saved = child.school_sources or {}
    feeds = {f["entity"]: f["feed_id"] for f in saved.get("calendars", [])}
    adults = (await db.execute(select(User.id).where(User.family_id == child.family_id, User.role.in_(["admin", "adult"])))).scalars().all()
    who = [str(u) for u in {*adults, child.id}]
    for entity, feed_id in list(feeds.items()):
        if entity not in wanted:
            feed = await db.get(CalendarFeed, uuid.UUID(feed_id))
            if feed is not None and feed.family_id == child.family_id:
                await db.delete(feed)
            feeds.pop(entity)
    for entity, name in wanted.items():
        if entity in feeds and await db.get(CalendarFeed, uuid.UUID(feeds[entity])) is not None:
            continue
        feed = CalendarFeed(family_id=child.family_id, created_by=by.id, name=f"{name}"[:120], url=f"homeassistant://{entity}", color=child.color or "#4F7A5B",
                            visible_to=who, details_for=who, member_id=child.id)
        db.add(feed)
        await db.flush()
        feeds[entity] = str(feed.id)
    child.school_sources = {
        "accounts": [{"key": g["key"], "label": g["label"], "title": g["title"]} for g in linked],
        "roles": roles, "calendars": [{"entity": e, "feed_id": f} for e, f in feeds.items()], "seen": saved.get("seen", {}),
    } if linked else None
    await db.commit()
    return child.school_sources or {}


# --- Reading the day ---------------------------------------------------------------------------


def _on(state: dict | None) -> bool | None:
    if not state or state.get("state") in (None, "unknown", "unavailable"):
        return None
    return state["state"] == "on"


def _text(state: dict | None) -> str | None:
    if not state or state.get("state") in (None, "", "unknown", "unavailable"):
        return None
    return str(state["state"])


def _list(state: dict | None, *keys: str) -> list:
    attrs = (state or {}).get("attributes") or {}
    for k in keys:
        if isinstance(attrs.get(k), list):
            return attrs[k]
    for v in attrs.values():
        if isinstance(v, list) and v and isinstance(v[0], dict):
            return v
    return []


def _title(item) -> str:
    if isinstance(item, dict):
        return str(item.get("title") or item.get("name") or item.get("subject") or item.get("text") or "")[:160]
    return str(item)[:160]


def day_of(roles: dict[str, str], states: dict[str, dict]) -> dict:
    """The school card's facts for one child from the integration's states."""
    s = {role: states.get(entity) for role, entity in roles.items()}
    day = _text(s.get("school_day"))
    if not day and (_text(s.get("school_start")) or _text(s.get("school_end"))):
        start, end = _text(s.get("school_start")), _text(s.get("school_end"))
        day = "–".join(_hhmm(x) for x in (start, end) if x)
    assignments = s.get("assignments")
    letter = s.get("weekly_letter")
    news = s.get("news")
    absence = s.get("last_absence")
    return {
        "school_day": day,
        "pe": _on(s.get("pe")),
        "leisure_today": _text(s.get("leisure_today")),
        "checked_in": _on(s.get("checked_in")),
        "assignments": _count(assignments),
        "assignment_titles": [_title(a) for a in _list(assignments, "assignments", "list", "items")][:5],
        "absent_today": _on(s.get("absent_today")),
        "last_absence": _text(absence),
        "next_event": _text(s.get("next_event")),
        "next_lesson": _text(s.get("next_lesson")),
        "notifications": _count(s.get("notifications")),
        "weekly_letter": _text(letter),
        "news": _count(news),
        "news_titles": [_title(n) for n in _list(news, "items", "news", "latest")][:3],
        "lunch": _text(s.get("lunch")),
    }


def _hhmm(value: str) -> str:
    m = re.search(r"(\d{1,2}):(\d{2})", value or "")
    return f"{int(m.group(1)):02d}:{m.group(2)}" if m else value


def _count(state: dict | None) -> int | None:
    text = _text(state)
    try:
        return int(float(text)) if text is not None else None
    except ValueError:
        return None


def letter_of(roles: dict[str, str], states: dict[str, dict]) -> dict | None:
    """The weekly letter in full: title, date, text and attachments (names and links)."""
    state = states.get(roles.get("weekly_letter", ""))
    if not state or not _text(state):
        return None
    attrs = state.get("attributes") or {}
    files = attrs.get("attachments") or []
    return {
        "title": _text(state), "date": attrs.get("date") or attrs.get("published"), "text": attrs.get("text") or attrs.get("content") or attrs.get("body") or "",
        "attachments": [{"name": f.get("name") or f.get("title") or "", "url": f.get("url") or f.get("link")} if isinstance(f, dict) else {"name": str(f), "url": None} for f in files][:20],
        "source": attrs.get("source"),
    }


async def states_for(db: AsyncSession, family_id: uuid.UUID) -> dict[str, dict]:
    conn, token = await _conn(db, family_id)
    if conn is None:
        return {}
    return {s["entity_id"]: s for s in await ha.get_states(conn.base_url, token)}


# --- Telling the adults ------------------------------------------------------------------------

_TEXT = {
    "letter": {"en": ("Weekly letter: {name}", "{title}"), "sv": ("Veckobrev: {name}", "{title}"), "nb": ("Ukebrev: {name}", "{title}"), "da": ("Ugebrev: {name}", "{title}"), "fi": ("Viikkokirje: {name}", "{title}")},
    "absent": {"en": ("{name} is registered absent", "Today, at school"), "sv": ("{name} är frånvaroanmäld", "I dag, i skolan"), "nb": ("{name} er registrert fraværende", "I dag, på skolen"), "da": ("{name} er registreret fraværende", "I dag, i skolen"), "fi": ("{name} on merkitty poissaolevaksi", "Tänään, koulussa")},
    "news": {"en": ("News from {name}'s school", "{title}"), "sv": ("Nyheter från {name}s skola", "{title}"), "nb": ("Nyheter fra {name}s skole", "{title}"), "da": ("Nyheder fra {name}s skole", "{title}"), "fi": ("Uutisia: {name}, koulu", "{title}")},
}


async def run_school_sync(db: AsyncSession) -> int:
    """The background worker: a new weekly letter, a new absence today and the school's news tell
    the child's adults – once each."""
    from app.services.notify import notify

    children = [c for c in (await db.execute(select(User).where(User.school_sources.is_not(None)))).scalars() if c.school_sources]
    by_family: dict[uuid.UUID, list[User]] = {}
    for child in children:
        by_family.setdefault(child.family_id, []).append(child)
    sent = 0
    for family_id, kids in by_family.items():
        try:
            states = await states_for(db, family_id)
        except Exception:
            continue
        if not states:
            continue
        adults = (await db.execute(select(User).where(User.family_id == family_id, User.role.in_(["admin", "adult"])))).scalars().all()
        for child in kids:
            roles = (child.school_sources or {}).get("roles", {})
            facts = day_of(roles, states)
            seen = dict((child.school_sources or {}).get("seen", {}))
            first = not seen
            news_title = facts["news_titles"][0] if facts["news_titles"] else None
            now = {
                "letter": facts["weekly_letter"],
                "absent": f"{datetime.now(timezone.utc).date()}" if facts["absent_today"] else seen.get("absent"),
                "news": news_title,
            }
            for kind, value in now.items():
                if not value or value == seen.get(kind):
                    continue
                seen[kind] = value
                if first:
                    continue  # just linked: what's there already isn't news
                for adult in adults:
                    if "calendar" not in adult.apps:
                        continue
                    title, body = _TEXT[kind].get(adult.language or "en", _TEXT[kind]["en"])
                    await notify(db, adult, {"title": title.format(name=child.display_name), "body": body.format(title=value), "route": "/", "kind": f"school_{kind}"}, pref="calendar_family")
                    sent += 1
            child.school_sources = {**(child.school_sources or {}), "seen": seen}
        await db.commit()
    return sent

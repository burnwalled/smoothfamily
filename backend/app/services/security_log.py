"""The security log (3.4.1): what's worth knowing about who tried to get in – failed sign-ins, the brake
that stops them, links that didn't exist, a member's new device, passwords and authenticators changed.
Kept 30 days, shown to the server's admin, and told: at once when the brake stops someone, and once a
day as a summary when anything happened. Only what's needed is kept: the name that was typed, the
address it came from, the kind, a short detail."""
import time
import uuid
from collections import Counter
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AppSetting, SecurityEvent, User
from app.services.notify import notify
from app.services.push import user_pref_enabled

KEEP_DAYS = 30
# What the summary counts, in the order it says them.
SUMMARY_KINDS = ("login_failed", "throttled", "link_invalid", "new_device")
SUMMARY_KEY = "security.summary.date"
SUMMARY_HOUR = 7
# The admins are told of a brake at most this often per address.
TOLD_EVERY = 3600
_told: dict[str, float] = {}


def reset() -> None:
    """Forget which addresses the admins were told of (the tests)."""
    _told.clear()

_SUMMARY = {
    "en": ("Security, the last day", {"login_failed": "{n} failed sign-ins", "throttled": "{n} addresses stopped by the brake", "link_invalid": "{n} tries with links that don't exist", "new_device": "{n} new devices"}),
    "sv": ("Säkerhet, senaste dygnet", {"login_failed": "{n} misslyckade inloggningar", "throttled": "{n} adresser stoppade av bromsen", "link_invalid": "{n} försök med länkar som inte finns", "new_device": "{n} nya enheter"}),
    "nb": ("Sikkerhet, siste døgn", {"login_failed": "{n} mislykkede pålogginger", "throttled": "{n} adresser stoppet av bremsen", "link_invalid": "{n} forsøk med lenker som ikke finnes", "new_device": "{n} nye enheter"}),
    "da": ("Sikkerhed, det seneste døgn", {"login_failed": "{n} mislykkede logins", "throttled": "{n} adresser stoppet af bremsen", "link_invalid": "{n} forsøg med links, der ikke findes", "new_device": "{n} nye enheder"}),
    "fi": ("Turvallisuus, viime vuorokausi", {"login_failed": "{n} epäonnistunutta kirjautumista", "throttled": "{n} osoitetta pysäytetty", "link_invalid": "{n} yritystä olemattomilla linkeillä", "new_device": "{n} uutta laitetta"}),
}
_THROTTLED = {
    "en": ("Sign-in brake", "Too many failed attempts from {ip}{who} – stopped for a while."),
    "sv": ("Inloggningsbromsen", "För många misslyckade försök från {ip}{who} – stoppad en stund."),
    "nb": ("Påloggingsbremsen", "For mange mislykkede forsøk fra {ip}{who} – stoppet en stund."),
    "da": ("Login-bremsen", "For mange mislykkede forsøg fra {ip}{who} – stoppet et stykke tid."),
    "fi": ("Kirjautumisjarru", "Liian monta epäonnistunutta yritystä osoitteesta {ip}{who} – pysäytetty hetkeksi."),
}
_NEW_DEVICE = {
    "en": ("New device signed in", "{what} signed in to your account just now. Not you? Change your password – that signs the others out."),
    "sv": ("Ny enhet inloggad", "{what} loggade just in på ditt konto. Inte du? Byt lösenord – då loggas de andra ut."),
    "nb": ("Ny enhet pålogget", "{what} logget nettopp inn på kontoen din. Ikke deg? Bytt passord – da logges de andre ut."),
    "da": ("Ny enhed logget ind", "{what} loggede lige ind på din konto. Ikke dig? Skift adgangskode – så logges de andre ud."),
    "fi": ("Uusi laite kirjautui", "{what} kirjautui juuri tilillesi. Etkö se ollut sinä? Vaihda salasana – muut kirjataan ulos."),
}
_PASSWORD = {
    "en": ("Your password was changed", "Just now. Not you? Ask the family's admin to reset it."),
    "sv": ("Ditt lösenord byttes", "Nyss. Inte du? Be familjens admin återställa det."),
    "nb": ("Passordet ditt ble byttet", "Nettopp. Ikke deg? Be familiens admin tilbakestille det."),
    "da": ("Din adgangskode blev skiftet", "Lige nu. Ikke dig? Bed familiens admin om at nulstille den."),
    "fi": ("Salasanasi vaihdettiin", "Juuri äsken. Etkö se ollut sinä? Pyydä perheen ylläpitäjää nollaamaan se."),
}


def _lang(user: User) -> str:
    return user.language if user.language in _SUMMARY else "en"


async def record(db: AsyncSession, kind: str, *, ip: str = "", user: User | None = None, family_id: uuid.UUID | None = None, username: str = "", detail: str = "") -> None:
    db.add(SecurityEvent(
        kind=kind[:24], ip=ip[:45], user_id=user.id if user else None, family_id=family_id or (user.family_id if user else None),
        username=(username or (user.username if user else ""))[:60], detail=detail[:200],
    ))
    await db.commit()


async def _server_admins(db: AsyncSession) -> list[User]:
    return list((await db.execute(select(User).where(User.is_server_admin.is_(True)))).scalars().all())


async def throttled(db: AsyncSession, ip: str, username: str = "", now: float | None = None) -> None:
    """The brake stopped someone: noted, and the server's admins told – once an hour per address."""
    await record(db, "throttled", ip=ip, username=username)
    now = now or time.monotonic()
    if _told.get(ip, -TOLD_EVERY) > now - TOLD_EVERY:
        return
    _told[ip] = now
    for admin in await _server_admins(db):
        if not user_pref_enabled(admin, "security"):
            continue
        title, body = _THROTTLED[_lang(admin)]
        await notify(db, admin, {"title": title, "body": body.format(ip=ip or "?", who=f" ({username})" if username else ""), "route": "/server?tab=security", "kind": "security"})


async def new_device(db: AsyncSession, user: User, what: str, ip: str, first: bool) -> None:
    """A device the member hasn't used before. Their first one ever is just noted."""
    await record(db, "new_device", ip=ip, user=user, detail=what)
    if first or not user_pref_enabled(user, "security"):
        return
    title, body = _NEW_DEVICE[_lang(user)]
    await notify(db, user, {"title": title, "body": body.format(what=what), "route": "/profile", "kind": "security"})


async def password_changed(db: AsyncSession, user: User, ip: str, by_admin: str | None = None) -> None:
    await record(db, "password_reset" if by_admin else "password_changed", ip=ip, user=user, detail=by_admin or "")
    if by_admin or not user_pref_enabled(user, "security"):
        return
    title, body = _PASSWORD[_lang(user)]
    await notify(db, user, {"title": title, "body": body, "route": "/profile", "kind": "security"})


async def run_security_summary(db: AsyncSession, now: datetime | None = None) -> int:
    """Once a day from 07:00 UTC: what the last day held, to the server's admins – only when it held something."""
    now = now or datetime.now(timezone.utc)
    if now.hour < SUMMARY_HOUR:
        return 0
    today = now.date().isoformat()
    row = await db.get(AppSetting, SUMMARY_KEY)
    if row is not None and row.value == today:
        return 0
    if row is None:
        db.add(AppSetting(key=SUMMARY_KEY, value=today))
    else:
        row.value = today
    await db.commit()
    since = now - timedelta(days=1)
    rows = (await db.execute(select(SecurityEvent.kind, SecurityEvent.ip).where(SecurityEvent.created_at >= since, SecurityEvent.kind.in_(SUMMARY_KINDS)))).all()
    if not rows:
        return 0
    counts = Counter(kind for kind, _ in rows)
    counts["throttled"] = len({ip for kind, ip in rows if kind == "throttled"})
    sent = 0
    for admin in await _server_admins(db):
        if not user_pref_enabled(admin, "security"):
            continue
        title, texts = _SUMMARY[_lang(admin)]
        body = ", ".join(texts[k].format(n=counts[k]) for k in SUMMARY_KINDS if counts.get(k))
        await notify(db, admin, {"title": title, "body": body, "route": "/server?tab=security", "kind": "security"})
        sent += 1
    return sent


async def prune(db: AsyncSession, now: datetime | None = None) -> None:
    cutoff = (now or datetime.now(timezone.utc)) - timedelta(days=KEEP_DAYS)
    await db.execute(delete(SecurityEvent).where(SecurityEvent.created_at < cutoff))
    await db.commit()


async def overview(db: AsyncSession, now: datetime | None = None, limit: int = 300) -> dict:
    now = now or datetime.now(timezone.utc)
    rows = (await db.execute(select(SecurityEvent).where(SecurityEvent.created_at >= now - timedelta(days=KEEP_DAYS)).order_by(SecurityEvent.created_at.desc()))).scalars().all()
    names = {u.id: u.display_name for u in (await db.execute(select(User))).scalars().all()} if rows else {}
    day, week = now - timedelta(days=1), now - timedelta(days=7)
    stamp = lambda r: r.created_at if r.created_at.tzinfo else r.created_at.replace(tzinfo=timezone.utc)  # noqa: E731
    return {
        "day": dict(Counter(r.kind for r in rows if stamp(r) >= day)),
        "week": dict(Counter(r.kind for r in rows if stamp(r) >= week)),
        "events": [
            {"id": r.id, "kind": r.kind, "username": r.username, "name": names.get(r.user_id), "ip": r.ip, "detail": r.detail, "created_at": stamp(r)}
            for r in rows[:limit]
        ],
    }

"""Reminders for the household's subscriptions (3.4.0): the last day to cancel, while there's time to act,
and a quarterly or yearly payment before it's drawn. Monthly ones would only teach people to ignore them.
Each adult chooses which they want. If the server was off on the day, the reminder comes at the next chance."""
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AppSetting, Family, Subscription, User
from app.services.notify import notify
from app.services.push import user_pref_enabled

CANCEL_DAYS = (2, 14)
PAYMENT_DAYS = (7,)
PAYMENT_PREF = {"quarter": "subs_quarter", "year": "subs_year"}

_TEXT = {
    "en": {"cancel": "{name}: last day to cancel", "payment": "{name}: payment coming up", "today": "Today", "tomorrow": "Tomorrow", "days": "In {n} days"},
    "sv": {"cancel": "{name}: sista dag att säga upp", "payment": "{name}: betalning på väg", "today": "Idag", "tomorrow": "Imorgon", "days": "Om {n} dagar"},
    "nb": {"cancel": "{name}: siste dag å si opp", "payment": "{name}: betaling på vei", "today": "I dag", "tomorrow": "I morgen", "days": "Om {n} dager"},
    "da": {"cancel": "{name}: sidste dag at opsige", "payment": "{name}: betaling på vej", "today": "I dag", "tomorrow": "I morgen", "days": "Om {n} dage"},
    "fi": {"cancel": "{name}: viimeinen irtisanomispäivä", "payment": "{name}: maksu tulossa", "today": "Tänään", "tomorrow": "Huomenna", "days": "{n} päivän päästä"},
}


def next_payment(row: Subscription, today: date) -> date | None:
    """The next payment: the date given, carried forward by the interval once it's passed."""
    day = row.next_payment
    if day is None:
        return None
    guard = 0
    while day < today and guard < 2000:
        guard += 1
        if row.interval == "week":
            day += timedelta(days=7)
        else:
            months = {"month": 1, "quarter": 3, "year": 12}[row.interval]
            total = day.month - 1 + months
            year, month = day.year + total // 12, total % 12 + 1
            for last in (31, 30, 29, 28):
                try:
                    day = date(year, month, min(row.next_payment.day, last))
                    break
                except ValueError:
                    continue
    return day


def _step(days: int, steps: tuple[int, ...]) -> int | None:
    """The reminder this many days ahead belongs to: the nearest one reached."""
    return next((step for step in sorted(steps) if 0 <= days <= step), None)


def _when(text: dict, days: int) -> str:
    return text["today"] if days == 0 else text["tomorrow"] if days == 1 else text["days"].format(n=days)


async def _send(db: AsyncSession, row: Subscription, kind: str, on: date, days: int, step: int, pref: str, now: datetime) -> int:
    key = f"subs.sent:{row.id}:{on.isoformat()}:{kind}:{step}"
    if await db.get(AppSetting, key) is not None:
        return 0
    adults = (await db.execute(select(User).where(User.family_id == row.family_id, User.role.in_(["admin", "adult"])))).scalars().all()
    family = await db.get(Family, row.family_id)
    sent = 0
    for adult in adults:
        if "property" not in adult.apps or (row.private and row.created_by != adult.id) or not user_pref_enabled(adult, pref):
            continue
        text = _TEXT.get(adult.language or "en", _TEXT["en"])
        body = _when(text, days)
        if kind == "payment":
            body = f"{body} · {round(float(row.amount))} {(family.currency if family else '') or ''}".strip()
        await notify(db, adult, {"title": text[kind].format(name=row.name), "body": body, "route": "/subscriptions", "kind": "subscription"}, pref=pref)
        sent += 1
    db.add(AppSetting(key=key, value=now.isoformat()))
    await db.commit()
    return sent


async def run_subscription_reminders(db: AsyncSession, now: datetime | None = None) -> int:
    now = now or datetime.now(timezone.utc)
    if now.hour < 7:  # mornings, not in the night
        return 0
    today = now.date()
    sent = 0
    rows = (await db.execute(select(Subscription).where(Subscription.ended_on.is_(None)))).scalars().all()
    for row in rows:
        if row.cancel_by is not None:
            days = (row.cancel_by - today).days
            step = _step(days, CANCEL_DAYS)
            if step is not None:
                sent += await _send(db, row, "cancel", row.cancel_by, days, step, "subs_cancel", now)
        pref = PAYMENT_PREF.get(row.interval)
        due = next_payment(row, today) if pref else None
        if pref and due is not None:
            days = (due - today).days
            step = _step(days, PAYMENT_DAYS)
            if step is not None:
                sent += await _send(db, row, "payment", due, days, step, pref, now)
    return sent

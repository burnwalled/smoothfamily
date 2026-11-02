"""Birthdays in the calendar and their reminders: six weeks before the birthday child is asked to
fill in their wish list; a month before the others to share it with relatives and plan the gifts;
a week before and on the day everyone (2.8.2).

Only the day itself reaches the person themself (besides the wish list), so a surprise stays a surprise.
"""
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AppSetting, Person, User
from app.routers.birthdays import next_birthday
from app.services.notify import notify

REMIND_DAYS_BEFORE = 7
WISH_LIST_DAYS_BEFORE = 42
PLAN_DAYS_BEFORE = 30

_TITLE = {
    "en": ("🎂 {name} turns {n}", "🎂 {name}'s birthday"),
    "sv": ("🎂 {name} fyller {n}", "🎂 {name} fyller år"),
    "nb": ("🎂 {name} fyller {n}", "🎂 {name} har bursdag"),
    "da": ("🎂 {name} fylder {n}", "🎂 {name} har fødselsdag"),
    "fi": ("🎂 {name} täyttää {n}", "🎂 {name}: syntymäpäivä"),
}
_SOON = {
    "en": ("Birthday in a week", "{title} – check the wish list"),
    "sv": ("Födelsedag om en vecka", "{title} – kika på önskelistan"),
    "nb": ("Bursdag om en uke", "{title} – sjekk ønskelisten"),
    "da": ("Fødselsdag om en uge", "{title} – kig på ønskelisten"),
    "fi": ("Syntymäpäivä viikon päästä", "{title} – katso toivelista"),
}
_WISH = {
    "en": ("Your birthday is coming", "In six weeks – fill in your wish list"),
    "sv": ("Snart fyller du år", "Om sex veckor – fyll i din önskelista"),
    "nb": ("Snart har du bursdag", "Om seks uker – fyll ut ønskelisten din"),
    "da": ("Snart har du fødselsdag", "Om seks uger – udfyld din ønskeliste"),
    "fi": ("Syntymäpäiväsi lähestyy", "Kuuden viikon päästä – täytä toivelistasi"),
}
_PLAN = {
    "en": ("Birthday in a month", "{title} – share the wish list with family and friends and start planning the gifts"),
    "sv": ("Födelsedag om en månad", "{title} – dela önskelistan med släkt och vänner och börja planera inköpen"),
    "nb": ("Bursdag om en måned", "{title} – del ønskelisten med familie og venner og begynn å planlegge gavene"),
    "da": ("Fødselsdag om en måned", "{title} – del ønskelisten med familie og venner og begynd at planlægge gaverne"),
    "fi": ("Syntymäpäivä kuukauden päästä", "{title} – jaa toivelista suvulle ja ystäville ja aloita lahjojen suunnittelu"),
}
_TODAY = {
    "en": "Birthday today",
    "sv": "Födelsedag idag",
    "nb": "Bursdag i dag",
    "da": "Fødselsdag i dag",
    "fi": "Syntymäpäivä tänään",
}


def birthday_title(person: Person, when: date, language: str) -> str:
    with_age, without = _TITLE.get(language, _TITLE["en"])
    if person.birth_year:
        return with_age.format(name=person.name, n=when.year - person.birth_year)
    return without.format(name=person.name)


async def birthdays_between(db: AsyncSession, family_id, start: date, end: date) -> list[tuple[Person, date]]:
    """(person, date) for birthdays from start up to (not including) end."""
    people = (
        await db.execute(select(Person).where(Person.family_id == family_id, Person.birth_month.is_not(None)))
    ).scalars().all()
    out = []
    for person in people:
        day = next_birthday(person.birth_month, person.birth_day, start)
        while day < end:
            out.append((person, day))
            day = next_birthday(person.birth_month, person.birth_day, day + timedelta(days=1))
    return out


async def run_birthday_reminders(db: AsyncSession, now: datetime | None = None) -> int:
    now = now or datetime.now(timezone.utc)
    if now.hour < 7:  # not in the middle of the night (UTC ≈ 8–9 in Sweden)
        return 0
    today = now.date()
    sent = 0
    people = (await db.execute(select(Person).where(Person.birth_month.is_not(None)))).scalars().all()
    for person in people:
        when = next_birthday(person.birth_month, person.birth_day, today)
        days = (when - today).days
        if days not in (0, REMIND_DAYS_BEFORE, PLAN_DAYS_BEFORE, WISH_LIST_DAYS_BEFORE):
            continue
        # Six weeks before: only a family member has a wish list of their own to fill in.
        if days == WISH_LIST_DAYS_BEFORE and person.user_id is None:
            continue
        key = f"birthday.sent:{person.id}:{when.isoformat()}:{days}"
        if await db.get(AppSetting, key) is not None:
            continue
        members = (await db.execute(select(User).where(User.family_id == person.family_id))).scalars().all()
        for member in members:
            if "birthdays" not in member.apps:
                continue
            own = member.id == person.user_id
            # The wish list reminder is the birthday child's; before the day the rest is for the others.
            if days == WISH_LIST_DAYS_BEFORE:
                if not own:
                    continue
            elif days and own:
                continue
            lang = member.language or "en"
            title = birthday_title(person, when, lang)
            if days == WISH_LIST_DAYS_BEFORE:
                head, body = _WISH.get(lang, _WISH["en"])
                payload = {"title": head, "body": body, "route": f"/lists?wish={person.id}", "kind": "birthday_wish_list"}
            elif days == PLAN_DAYS_BEFORE:
                head, body = _PLAN.get(lang, _PLAN["en"])
                route = f"/lists?plan={person.id}" if member.role != "child" else f"/lists?wish={person.id}"
                payload = {"title": head, "body": body.format(title=title), "route": route, "kind": "birthday_plan"}
            elif days:
                head, body = _SOON.get(lang, _SOON["en"])
                payload = {"title": head, "body": body.format(title=title), "route": f"/lists?wish={person.id}", "kind": "birthday_soon"}
            else:
                payload = {"title": _TODAY.get(lang, _TODAY["en"]), "body": title, "route": f"/lists?wish={person.id}", "kind": "birthday_today"}
            await notify(db, member, payload, pref="calendar_mine")
            sent += 1
        db.add(AppSetting(key=key, value=now.isoformat()))
        await db.commit()
    return sent


def all_day_range(day: date) -> tuple[datetime, datetime]:
    start = datetime.combine(day, time.min, tzinfo=timezone.utc)
    return start, start + timedelta(days=1)

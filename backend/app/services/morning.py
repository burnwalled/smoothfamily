"""The morning summary: one push per member at the time they chose, e.g.
"Today: Dentist 14:50, Practice 17:00 · 3 tasks · 8–12°, rain from 15:00".

Built from what the member can see anyway: their calendar, their own tasks and medicine, who
drives, waste collection (adults), their school lunch and the weather (SMHI).
"""
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import AppSetting, EventPlan, Family, Medication, Task, TaskCompletion, User
from app.services.calendar_view import events_between, utc
from app.services.medicine import dose_times_on
from app.services.notify import notify
from app.services.schedule import due_today
from app.services.today_cards import family_pickups, school_lunch
from app.services.weather import forecast, summary, weather_line

# Sent at the chosen time, or later the same morning if the server was busy or off.
LATE_LIMIT = timedelta(hours=3)

_TEXT = {
    "en": {
        "title": "Good morning, {name}!",
        "events": "Today: {list}",
        "tasks1": "1 task to do",
        "tasks": "{n} tasks to do",
        "medicine": "Medicine: {list}",
        "drive": "You're driving: {list}",
        "pickup": "You're picking up: {list}",
        "waste": "Waste collection today: {what}",
        "lunch": "School lunch: {what}",
        "weather": "Weather: {what}",
        "empty": "Nothing planned today – enjoy!",
    },
    "sv": {
        "title": "God morgon, {name}!",
        "events": "Idag: {list}",
        "tasks1": "1 uppgift att göra",
        "tasks": "{n} uppgifter att göra",
        "medicine": "Medicin: {list}",
        "drive": "Du skjutsar: {list}",
        "pickup": "Du hämtar: {list}",
        "waste": "Sophämtning idag: {what}",
        "lunch": "Skollunch: {what}",
        "weather": "Väder: {what}",
        "empty": "Inget inplanerat idag – njut!",
    },
    "nb": {
        "title": "God morgen, {name}!",
        "events": "I dag: {list}",
        "tasks1": "1 oppgave å gjøre",
        "tasks": "{n} oppgaver å gjøre",
        "medicine": "Medisin: {list}",
        "drive": "Du kjører: {list}",
        "pickup": "Du henter: {list}",
        "waste": "Søppeltømming i dag: {what}",
        "lunch": "Skolelunsj: {what}",
        "weather": "Vær: {what}",
        "empty": "Ingenting planlagt i dag – kos deg!",
    },
    "da": {
        "title": "Godmorgen, {name}!",
        "events": "I dag: {list}",
        "tasks1": "1 opgave at lave",
        "tasks": "{n} opgaver at lave",
        "medicine": "Medicin: {list}",
        "drive": "Du kører: {list}",
        "pickup": "Du henter: {list}",
        "waste": "Affaldsafhentning i dag: {what}",
        "lunch": "Skolefrokost: {what}",
        "weather": "Vejr: {what}",
        "empty": "Intet planlagt i dag – nyd det!",
    },
    "fi": {
        "title": "Hyvää huomenta, {name}!",
        "events": "Tänään: {list}",
        "tasks1": "1 tehtävä tekemättä",
        "tasks": "{n} tehtävää tekemättä",
        "medicine": "Lääkkeet: {list}",
        "drive": "Sinä kyyditset: {list}",
        "pickup": "Sinä haet: {list}",
        "waste": "Jätehuolto tänään: {what}",
        "lunch": "Kouluruoka: {what}",
        "weather": "Sää: {what}",
        "empty": "Ei mitään suunniteltua tänään – nauti!",
    },
}


def _zone() -> ZoneInfo:
    return ZoneInfo(get_settings().timezone)


def _hhmm(value: datetime) -> str:
    return utc(value).astimezone(_zone()).strftime("%H:%M")


def is_due(user: User, now_local: datetime) -> bool:
    """Whether the member's summary should go out now (before the once-a-day check)."""
    if not user.morning_summary:
        return False
    if (user.morning_days or "weekdays") == "weekdays" and now_local.weekday() >= 5:
        return False
    try:
        hour, minute = (int(part) for part in (user.morning_time or "07:00").split(":"))
    except ValueError:
        return False
    at = datetime.combine(now_local.date(), time(hour, minute), tzinfo=now_local.tzinfo)
    return at <= now_local < at + LATE_LIMIT


async def build_summary(db: AsyncSession, user: User, today: date, weather: dict | None = None) -> tuple[str, list[str]]:
    texts = _TEXT.get(user.language or "en", _TEXT["en"])
    lines: list[str] = []

    if "calendar" in user.apps:
        events = await events_between(db, user, today, today + timedelta(days=1))
        mine = [e for e in events if not e.busy and (not e.member_ids or user.id in e.member_ids)]
        if mine:
            names = [e.title if e.all_day else f"{e.title} {_hhmm(e.start)}" for e in mine[:5]]
            lines.append(texts["events"].format(list=", ".join(names)))

    if "tasks" in user.apps:
        tasks = (
            await db.execute(select(Task).where(Task.family_id == user.family_id, Task.assignee_id == user.id, Task.active == True))  # noqa: E712
        ).scalars().all()
        done = set(
            (
                await db.execute(
                    select(TaskCompletion.task_id).where(
                        TaskCompletion.user_id == user.id,
                        TaskCompletion.completed_date == today,
                        TaskCompletion.status != "rejected",
                    )
                )
            ).scalars()
        )
        from app.routers.custody import away_today

        away = await away_today(db, user.family_id, today)
        open_tasks = [t for t in tasks if due_today(t, today) and t.id not in done and t.assignee_id not in away]
        if open_tasks:
            n = len(open_tasks)
            lines.append(texts["tasks1"] if n == 1 else texts["tasks"].format(n=n))

    if "medicine" in user.apps:
        meds = (
            await db.execute(select(Medication).where(Medication.user_id == user.id, Medication.active == True))  # noqa: E712
        ).scalars().all()
        doses = sorted((label, med.name) for med in meds for label, _ in dose_times_on(med, today))
        if doses:
            lines.append(texts["medicine"].format(list=", ".join(f"{name} {label}" for label, name in doses[:4])))

    day_start = datetime.combine(today, time.min, tzinfo=_zone()).astimezone(timezone.utc)
    plans = (
        await db.execute(
            select(EventPlan).where(
                EventPlan.family_id == user.family_id,
                EventPlan.start >= day_start,
                EventPlan.start < day_start + timedelta(days=1),
            )
        )
    ).scalars().all()
    drive = [f"{p.title} {_hhmm(p.start)}" for p in plans if p.drop_off_by == user.id]
    pick = [p.title for p in plans if p.pick_up_by == user.id]
    if drive:
        lines.append(texts["drive"].format(list=", ".join(drive)))
    if pick:
        lines.append(texts["pickup"].format(list=", ".join(pick)))

    family = await db.get(Family, user.family_id)
    if user.role in {"admin", "adult"}:
        try:
            pickups = [p["title"] for p in await family_pickups(db, family, today, 1) if p["date"] == today]
        except Exception:
            pickups = []
        if pickups:
            lines.append(texts["waste"].format(what=", ".join(pickups)))

    if user.school:
        try:
            menu = await school_lunch(user.school, today)
            dishes = next((d["dishes"] for d in menu["days"] if d["date"] == today), [])
        except Exception:
            dishes = []
        if dishes:
            lines.append(texts["lunch"].format(what=dishes[0]))

    if not lines:
        lines.append(texts["empty"])
    if weather:
        lines.append(texts["weather"].format(what=weather_line(weather, user.language or "en")))
    return texts["title"].format(name=user.display_name.split(" ")[0]), lines


async def run_morning_summaries(db: AsyncSession, now: datetime | None = None) -> int:
    now_local = (now or datetime.now(timezone.utc)).astimezone(_zone())
    today = now_local.date()
    users = (await db.execute(select(User).where(User.morning_summary == True))).scalars().all()  # noqa: E712
    weather_by_family: dict = {}
    sent = 0
    for user in users:
        if not is_due(user, now_local):
            continue
        key = f"morning.sent:{user.id}:{today.isoformat()}"
        if await db.get(AppSetting, key) is not None:
            continue
        if user.family_id not in weather_by_family:
            family = await db.get(Family, user.family_id)
            weather_by_family[user.family_id] = None
            if family.weather_lat is not None and family.weather_lon is not None:
                try:
                    weather_by_family[user.family_id] = summary(await forecast(family.weather_lat, family.weather_lon), now_local)
                except Exception:
                    pass
        title, lines = await build_summary(db, user, today, weather_by_family[user.family_id])
        db.add(AppSetting(key=key, value=now_local.isoformat()))
        await db.commit()
        await notify(db, user, {"title": title, "body": "\n".join(lines), "route": "/", "kind": "morning_summary"})
        sent += 1
    return sent

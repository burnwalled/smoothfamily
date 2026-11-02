"""Söndagskollen (#68): a relaxed weekly moment to look back at the week and ahead at the next.

Looking back: points per member, tasks done, the top helper and the family goals. Looking ahead:
the calendar (with who drives), meals and whose turn it is. Rituals: thank-you stars, next
week's family activity, and "done" – which sends everyone a short summary.
"""
import uuid
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.deps import CurrentUser, DB, FamilyManager, require_app
from app.models import AppSetting, Family, FamilyReward, Meal, MealPlan, Task, TaskCompletion, ThanksStar, User, WeekReview
from app.schemas import EventOut
from app.services import rotation
from app.services.calendar_view import events_between, utc
from app.services.notify import notify
from app.services.rewards import reward_progress
from app.services.schedule import upcoming_week

router = APIRouter(prefix="/api/week", tags=["week"], dependencies=[require_app("week")])

_TEXT = {
    "star": {
        "en": ("A thank-you star ⭐", "{name} thanks you: {message}"),
        "sv": ("En tack-stjärna ⭐", "{name} tackar dig: {message}"),
        "nb": ("En takkestjerne ⭐", "{name} takker deg: {message}"),
        "da": ("En takkestjerne ⭐", "{name} takker dig: {message}"),
        "fi": ("Kiitostähti ⭐", "{name} kiittää sinua: {message}"),
    },
    "done": {
        "en": ("Söndagskollen is done", "Week {week}: {events} in the calendar · {stars} thank-you stars{activity}"),
        "sv": ("Söndagskollen är klar", "Vecka {week}: {events} i kalendern · {stars} tack-stjärnor{activity}"),
        "nb": ("Söndagskollen er ferdig", "Uke {week}: {events} i kalenderen · {stars} takkestjerner{activity}"),
        "da": ("Söndagskollen er færdig", "Uge {week}: {events} i kalenderen · {stars} takkestjerner{activity}"),
        "fi": ("Söndagskollen on valmis", "Viikko {week}: {events} kalenterissa · {stars} kiitostähteä{activity}"),
    },
    "activity": {"en": " · This week: {what}", "sv": " · Veckans aktivitet: {what}", "nb": " · Ukens aktivitet: {what}", "da": " · Ugens aktivitet: {what}", "fi": " · Viikon aktiviteetti: {what}"},
    "reminder": {
        "en": ("Time for Söndagskollen", "Look back at the week together and plan the next one."),
        "sv": ("Dags för Söndagskollen", "Titta tillbaka på veckan tillsammans och planera nästa."),
        "nb": ("Tid for Söndagskollen", "Se tilbake på uka sammen og planlegg den neste."),
        "da": ("Tid til Söndagskollen", "Se tilbage på ugen sammen og planlæg den næste."),
        "fi": ("Söndagskollenin aika", "Katsokaa yhdessä mennyttä viikkoa ja suunnitelkaa seuraava."),
    },
}


def _zone() -> ZoneInfo:
    return ZoneInfo(get_settings().timezone)


class MemberPoints(BaseModel):
    user_id: uuid.UUID
    name: str
    color: str
    points: int
    tasks: int


class GoalOut(BaseModel):
    title: str
    points: int
    required: int
    unlocked: bool


class StarOut(BaseModel):
    id: uuid.UUID
    from_user: uuid.UUID
    from_name: str
    to_user: uuid.UUID
    to_name: str
    message: str


class TurnOut(BaseModel):
    title: str
    user_id: uuid.UUID | None
    name: str | None


class DayOut(BaseModel):
    date: date
    events: list[EventOut]
    meal: str | None = None


class WeekOut(BaseModel):
    week_start: date
    last_week_start: date
    activity: str | None
    done_at: datetime | None
    done_by_name: str | None
    reminder: bool
    points: list[MemberPoints]
    tasks_done: int
    top_helper: str | None
    goals: list[GoalOut]
    stars: list[StarOut]
    days: list[DayOut]
    turns: list[TurnOut]


class ActivityIn(BaseModel):
    activity: str | None = Field(default=None, max_length=200)


class StarIn(BaseModel):
    to_user: uuid.UUID
    message: str = Field(default="", max_length=200)


class ReminderIn(BaseModel):
    reminder: bool


def _check_week(day: date) -> date:
    if day.weekday() != 0:
        raise HTTPException(status_code=422, detail="A week starts on a Monday")
    return day


async def _review(db: AsyncSession, family_id: uuid.UUID, first: date, create: bool = False) -> WeekReview | None:
    review = (
        await db.execute(select(WeekReview).where(WeekReview.family_id == family_id, WeekReview.week_start == first))
    ).scalar_one_or_none()
    if review is None and create:
        review = WeekReview(family_id=family_id, week_start=first)
        db.add(review)
    return review


async def _stars(db: AsyncSession, family_id: uuid.UUID, first: date, names: dict) -> list[StarOut]:
    rows = (
        await db.execute(
            select(ThanksStar).where(ThanksStar.family_id == family_id, ThanksStar.week_start == first).order_by(ThanksStar.created_at)
        )
    ).scalars().all()
    return [
        StarOut(id=s.id, from_user=s.from_user, from_name=names.get(s.from_user, "?"), to_user=s.to_user, to_name=names.get(s.to_user, "?"), message=s.message)
        for s in rows
    ]


async def _local_events(db: AsyncSession, user: User, first: date) -> dict[date, list[EventOut]]:
    zone = _zone()
    by_day: dict[date, list[EventOut]] = {first + timedelta(days=i): [] for i in range(7)}
    for event in await events_between(db, user, first, first + timedelta(days=7)):
        start = utc(event.start)
        day = start.date() if event.all_day else start.astimezone(zone).date()
        if event.all_day:
            # Multi-day events show on each of their days in the week.
            last = utc(event.end).date() - timedelta(days=1)
            d = max(day, first)
            while d <= min(last, first + timedelta(days=6)):
                by_day[d].append(event)
                d += timedelta(days=1)
        elif day in by_day:
            by_day[day].append(event)
    return by_day


@router.get("", response_model=WeekOut)
async def get_week(user: CurrentUser, db: DB, start: date | None = None) -> WeekOut:
    first = _check_week(start) if start else upcoming_week(datetime.now(_zone()).date())
    last_first = first - timedelta(days=7)
    family = await db.get(Family, user.family_id)
    members = (await db.execute(select(User).where(User.family_id == user.family_id).order_by(User.created_at))).scalars().all()
    names = {m.id: m.display_name for m in members}

    # Looking back: the week before.
    rows = (
        await db.execute(
            select(TaskCompletion.user_id, func.coalesce(func.sum(TaskCompletion.points_awarded), 0), func.count())
            .where(
                TaskCompletion.family_id == user.family_id,
                TaskCompletion.status == "approved",
                TaskCompletion.completed_date >= last_first,
                TaskCompletion.completed_date < first,
            )
            .group_by(TaskCompletion.user_id)
        )
    ).all()
    totals = {uid: (int(points), int(count)) for uid, points, count in rows}
    points = sorted(
        (
            MemberPoints(user_id=m.id, name=m.display_name, color=m.color, points=totals.get(m.id, (0, 0))[0], tasks=totals.get(m.id, (0, 0))[1])
            for m in members
        ),
        key=lambda p: (-p.points, -p.tasks),
    )
    top = points[0] if points and points[0].points > 0 else None
    goals = []
    for reward in (
        await db.execute(select(FamilyReward).where(FamilyReward.family_id == user.family_id, FamilyReward.redeemed_at.is_(None)))
    ).scalars():
        goals.append(GoalOut(title=reward.title, points=await reward_progress(db, reward), required=reward.points_required, unlocked=reward.unlocked_at is not None))

    # Looking ahead.
    by_day = await _local_events(db, user, first) if "calendar" in user.apps else {first + timedelta(days=i): [] for i in range(7)}
    meals: dict[int, str] = {}
    if "food" in user.apps:
        plan = (await db.execute(select(MealPlan).where(MealPlan.family_id == user.family_id, MealPlan.week_start == first))).scalar_one_or_none()
        if plan is not None:
            for meal in (await db.execute(select(Meal).where(Meal.meal_plan_id == plan.id).order_by(Meal.weekday))).scalars():
                meals.setdefault(meal.weekday, meal.name)
    turns = []
    if "tasks" in user.apps:
        tasks = (await db.execute(select(Task).where(Task.family_id == user.family_id, Task.active == True))).scalars().all()  # noqa: E712
        for task in tasks:
            if rotation.rotating(task):
                who = rotation.turn_on(task, first) if task.rotation_mode == "weekly" else task.assignee_id
                turns.append(TurnOut(title=task.title, user_id=who, name=names.get(who)))
        turns.sort(key=lambda t: t.title.casefold())

    review = await _review(db, user.family_id, first)
    return WeekOut(
        week_start=first,
        last_week_start=last_first,
        activity=review.activity if review else None,
        done_at=review.done_at if review else None,
        done_by_name=names.get(review.done_by) if review and review.done_by else None,
        reminder=family.week_review_reminder is not False,
        points=points,
        tasks_done=sum(p.tasks for p in points),
        top_helper=top.name if top else None,
        goals=goals,
        stars=await _stars(db, user.family_id, first, names),
        days=[DayOut(date=day, events=events, meal=meals.get(day.weekday())) for day, events in by_day.items()],
        turns=turns,
    )


@router.put("/{first}/activity", status_code=status.HTTP_204_NO_CONTENT)
async def set_activity(first: date, payload: ActivityIn, user: CurrentUser, db: DB) -> None:
    review = await _review(db, user.family_id, _check_week(first), create=True)
    review.activity = (payload.activity or "").strip() or None
    await db.commit()


@router.post("/{first}/stars", response_model=StarOut, status_code=status.HTTP_201_CREATED)
async def give_star(first: date, payload: StarIn, user: CurrentUser, db: DB) -> StarOut:
    _check_week(first)
    to = await db.get(User, payload.to_user)
    if to is None or to.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Member not found")
    if to.id == user.id:
        raise HTTPException(status_code=422, detail="Give the star to someone else")
    star = ThanksStar(family_id=user.family_id, week_start=first, from_user=user.id, to_user=to.id, message=payload.message.strip())
    db.add(star)
    await db.commit()
    await db.refresh(star)
    title, body = _TEXT["star"].get(to.language or "en", _TEXT["star"]["en"])
    text = body.format(name=user.display_name, message=star.message) if star.message else body.split(":")[0].format(name=user.display_name)
    await notify(db, to, {"title": title, "body": text, "route": "/week", "kind": "thanks_star"})
    return StarOut(id=star.id, from_user=user.id, from_name=user.display_name, to_user=to.id, to_name=to.display_name, message=star.message)


@router.delete("/stars/{star_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_star(star_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    star = await db.get(ThanksStar, star_id)
    if star is None or star.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Star not found")
    if star.from_user != user.id and user.role not in {"admin", "adult"}:
        raise HTTPException(status_code=403, detail="Only the giver or an adult can remove the star")
    await db.delete(star)
    await db.commit()


@router.post("/{first}/done", status_code=status.HTTP_204_NO_CONTENT)
async def mark_done(first: date, user: CurrentUser, db: DB) -> None:
    """Söndagskollen is done: everyone gets a short summary in the notification centre."""
    review = await _review(db, user.family_id, _check_week(first), create=True)
    if review.done_at is not None:
        return
    review.done_at = datetime.now(timezone.utc)
    review.done_by = user.id
    await db.commit()
    week = await get_week(user, db, first)
    events = sum(len([e for e in d.events if not e.birthday_person_id]) for d in week.days)
    members = (await db.execute(select(User).where(User.family_id == user.family_id))).scalars().all()
    for member in members:
        if "week" not in member.apps:
            continue
        lang = member.language or "en"
        title, body = _TEXT["done"].get(lang, _TEXT["done"]["en"])
        activity = _TEXT["activity"].get(lang, _TEXT["activity"]["en"]).format(what=week.activity) if week.activity else ""
        text = body.format(week=first.isocalendar()[1], events=events, stars=len(week.stars), activity=activity)
        await notify(db, member, {"title": title, "body": text, "route": "/week", "kind": "week_review"})


@router.delete("/{first}/done", status_code=status.HTTP_204_NO_CONTENT)
async def reopen(first: date, user: CurrentUser, db: DB) -> None:
    review = await _review(db, user.family_id, _check_week(first))
    if review is not None:
        review.done_at = None
        review.done_by = None
        await db.commit()


@router.put("/settings", status_code=status.HTTP_204_NO_CONTENT)
async def set_reminder(payload: ReminderIn, admin: FamilyManager, db: DB) -> None:
    family = await db.get(Family, admin.family_id)
    family.week_review_reminder = payload.reminder
    await db.commit()


async def run_week_review_reminders(db: AsyncSession, now: datetime | None = None) -> int:
    """Sunday from 16: the family is reminded, unless next week's Söndagskollen is already done."""
    now_local = (now or datetime.now(timezone.utc)).astimezone(_zone())
    if now_local.weekday() != 6 or not 16 <= now_local.hour < 21:
        return 0
    first = upcoming_week(now_local.date())
    sent = 0
    for family in (await db.execute(select(Family).where(Family.week_review_reminder == True))).scalars():  # noqa: E712
        key = f"week.reminder:{family.id}:{first.isoformat()}"
        if await db.get(AppSetting, key) is not None:
            continue
        db.add(AppSetting(key=key, value=now_local.isoformat()))
        await db.commit()
        review = await _review(db, family.id, first)
        if review is not None and review.done_at is not None:
            continue
        for member in (await db.execute(select(User).where(User.family_id == family.id))).scalars().all():
            if "week" not in member.apps:
                continue
            title, body = _TEXT["reminder"].get(member.language or "en", _TEXT["reminder"]["en"])
            await notify(db, member, {"title": title, "body": body, "route": "/week", "kind": "week_review"})
            sent += 1
    return sent

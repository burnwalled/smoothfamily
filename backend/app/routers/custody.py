"""Two homes (2.7.5, #73): a child who lives part of the time with their other parent.

The adults set a pattern – week on, week off; 2-2-3; every other weekend away; or only the days
they type in – plus exceptions for holidays and swapped weekends. The calendar shows when the child
is in the other home and when the handover is, Today says where the child is, the child's tasks
wait while they are away (if chosen), the evening before a handover the adults are told, and a
handover list (what goes along) is cleared again after each handover. The other parent can get a
link that shows only this child: their calendar, the schedule, the emergency card and the list.
"""
import secrets
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.public_url import public_base
from app.deps import DB, AdultUser, CurrentUser, FamilyManager
from app.models import CustodyException, CustodySchedule, GuestAccess, ListItem, ListModel, User
from app.services.mfa import qr_svg
from app.services.notify import notify

router = APIRouter(prefix="/api/custody", tags=["custody"])

Pattern = Literal["week", "223", "weekend", "custom"]
Place = Literal["here", "other"]
# 2-2-3 over two weeks from a Monday: here Mon–Tue, away Wed–Thu, here Fri–Sun, then the other way.
TWO_TWO_THREE = "hhoohhhoohhooo"
DAYS_AHEAD = 56
LINK_DAYS_MAX = 366


def place_on(schedule: CustodySchedule, exceptions: list[CustodyException], day: date) -> str:
    """Where the child is on `day` (a handover day counts as the new place)."""
    for ex in exceptions:
        if ex.start_date <= day <= ex.end_date:
            return ex.place
    days = (day - schedule.anchor_date).days
    if schedule.pattern == "week":
        return "here" if (days // 7) % 2 == 0 else "other"
    if schedule.pattern == "223":
        return "here" if TWO_TWO_THREE[days % 14] == "h" else "other"
    if schedule.pattern == "weekend":
        # The anchor is a Friday away; every other Friday to Sunday after it.
        in_cycle = days % 14
        return "other" if in_cycle in (0, 1, 2) else "here"
    return "here"


def periods(schedule: CustodySchedule, exceptions: list[CustodyException], start: date, end: date) -> list[tuple[date, date, str]]:
    """Runs of days in one place, inclusive, from `start` to `end`."""
    out: list[tuple[date, date, str]] = []
    day = start
    while day <= end:
        place = place_on(schedule, exceptions, day)
        if out and out[-1][2] == place and out[-1][1] == day - timedelta(days=1):
            out[-1] = (out[-1][0], day, place)
        else:
            out.append((day, day, place))
        day += timedelta(days=1)
    return out


def next_handover(schedule: CustodySchedule, exceptions: list[CustodyException], today: date) -> tuple[date, str] | None:
    """The next day the place changes (and where to), within the coming two months."""
    now = place_on(schedule, exceptions, today)
    for i in range(1, DAYS_AHEAD + 1):
        day = today + timedelta(days=i)
        place = place_on(schedule, exceptions, day)
        if place != now:
            return day, place
    return None


class ScheduleIn(BaseModel):
    other_home: str = Field(min_length=1, max_length=60)
    pattern: Pattern = "week"
    anchor_date: date
    handover_time: str = Field(default="17:00", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    pause_tasks: bool = True
    # Make a handover list ("To Dad's – Klara") if there is none.
    handover_list: bool = True


class ExceptionIn(BaseModel):
    start_date: date
    end_date: date
    place: Place
    note: str = Field(default="", max_length=120)


class ExceptionOut(ExceptionIn):
    id: uuid.UUID


class DayOut(BaseModel):
    date: date
    place: str


class ScheduleOut(BaseModel):
    user_id: uuid.UUID
    name: str
    color: str
    other_home: str
    pattern: str
    anchor_date: date
    handover_time: str
    pause_tasks: bool
    handover_list_id: uuid.UUID | None
    exceptions: list[ExceptionOut]
    # Today and what comes next.
    place: str
    next_handover: date | None
    next_place: str | None
    days: list[DayOut]


class LinkIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    days: int = Field(default=180, ge=1, le=LINK_DAYS_MAX)


class LinkOut(BaseModel):
    url: str
    qr_svg: str
    expires_at: datetime


async def _exceptions(db: AsyncSession, schedule_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[CustodyException]]:
    out: dict[uuid.UUID, list[CustodyException]] = {}
    if schedule_ids:
        rows = (await db.execute(select(CustodyException).where(CustodyException.schedule_id.in_(schedule_ids)).order_by(CustodyException.start_date))).scalars().all()
        for row in rows:
            out.setdefault(row.schedule_id, []).append(row)
    return out


async def schedule_out(db: AsyncSession, schedule: CustodySchedule, child: User, exceptions: list[CustodyException], today: date) -> ScheduleOut:
    nxt = next_handover(schedule, exceptions, today)
    return ScheduleOut(
        user_id=child.id, name=child.display_name, color=child.color, other_home=schedule.other_home, pattern=schedule.pattern,
        anchor_date=schedule.anchor_date, handover_time=schedule.handover_time, pause_tasks=schedule.pause_tasks,
        handover_list_id=schedule.handover_list_id,
        exceptions=[ExceptionOut(id=e.id, start_date=e.start_date, end_date=e.end_date, place=e.place, note=e.note) for e in exceptions],
        place=place_on(schedule, exceptions, today), next_handover=nxt[0] if nxt else None, next_place=nxt[1] if nxt else None,
        days=[DayOut(date=today + timedelta(days=i), place=place_on(schedule, exceptions, today + timedelta(days=i))) for i in range(DAYS_AHEAD)],
    )


async def family_schedules(db: AsyncSession, family_id: uuid.UUID, child_ids: list[uuid.UUID] | None = None) -> list[tuple[CustodySchedule, User, list[CustodyException]]]:
    query = select(CustodySchedule, User).join(User, User.id == CustodySchedule.user_id).where(CustodySchedule.family_id == family_id)
    if child_ids is not None:
        query = query.where(CustodySchedule.user_id.in_(child_ids))
    rows = (await db.execute(query.order_by(User.created_at))).all()
    exceptions = await _exceptions(db, [s.id for s, _ in rows])
    return [(s, u, exceptions.get(s.id, [])) for s, u in rows]


async def away_today(db: AsyncSession, family_id: uuid.UUID, day: date) -> set[uuid.UUID]:
    """The children whose tasks wait today: in the other home, with pausing on."""
    return {s.user_id for s, _, ex in await family_schedules(db, family_id) if s.pause_tasks and place_on(s, ex, day) == "other"}


async def _schedule(db: AsyncSession, family_id: uuid.UUID, child_id: uuid.UUID) -> CustodySchedule:
    row = (await db.execute(select(CustodySchedule).where(CustodySchedule.user_id == child_id, CustodySchedule.family_id == family_id))).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="No schedule for this child")
    return row


async def _child(db: AsyncSession, family_id: uuid.UUID, child_id: uuid.UUID) -> User:
    child = await db.get(User, child_id)
    if child is None or child.family_id != family_id or child.role != "child":
        raise HTTPException(status_code=404, detail="Child not found")
    return child


# --- In the app ----------------------------------------------------------------------------


@router.get("", response_model=list[ScheduleOut])
async def list_schedules(user: CurrentUser, db: DB) -> list[ScheduleOut]:
    """Adults see every child's; a child their own."""
    today = date.today()
    rows = await family_schedules(db, user.family_id, None if user.role != "child" else [user.id])
    return [await schedule_out(db, s, child, ex, today) for s, child, ex in rows]


_LIST = {"en": "To {home} – {name}", "sv": "Till {home} – {name}", "nb": "Til {home} – {name}", "da": "Til {home} – {name}", "fi": "{home} – {name}"}


@router.put("/{child_id}", response_model=ScheduleOut)
async def save_schedule(child_id: uuid.UUID, payload: ScheduleIn, user: FamilyManager, db: DB) -> ScheduleOut:
    child = await _child(db, user.family_id, child_id)
    row = (await db.execute(select(CustodySchedule).where(CustodySchedule.user_id == child.id))).scalar_one_or_none()
    if row is None:
        row = CustodySchedule(family_id=user.family_id, user_id=child.id)
        db.add(row)
    row.other_home, row.pattern, row.anchor_date = payload.other_home.strip(), payload.pattern, payload.anchor_date
    row.handover_time, row.pause_tasks = payload.handover_time, payload.pause_tasks
    row.reminded_for = None
    if payload.handover_list and row.handover_list_id is None:
        name = _LIST.get(user.language or "en", _LIST["en"]).format(home=row.other_home, name=child.display_name)
        lst = ListModel(family_id=user.family_id, name=name[:160], created_by=user.id, allowed_user_ids=[])
        db.add(lst)
        await db.flush()
        row.handover_list_id = lst.id
    await db.commit()
    exceptions = (await _exceptions(db, [row.id])).get(row.id, [])
    return await schedule_out(db, row, child, exceptions, date.today())


@router.delete("/{child_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_schedule(child_id: uuid.UUID, user: FamilyManager, db: DB) -> None:
    """The schedule goes (its handover list stays in Lists)."""
    row = await _schedule(db, user.family_id, child_id)
    await db.execute(delete(CustodyException).where(CustodyException.schedule_id == row.id))
    await db.delete(row)
    await db.commit()


@router.post("/{child_id}/exceptions", response_model=ScheduleOut, status_code=status.HTTP_201_CREATED)
async def add_exception(child_id: uuid.UUID, payload: ExceptionIn, user: AdultUser, db: DB) -> ScheduleOut:
    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=422, detail="The end is before the start")
    row = await _schedule(db, user.family_id, child_id)
    db.add(CustodyException(family_id=user.family_id, schedule_id=row.id, start_date=payload.start_date, end_date=payload.end_date, place=payload.place, note=payload.note.strip()))
    row.reminded_for = None
    await db.commit()
    exceptions = (await _exceptions(db, [row.id])).get(row.id, [])
    return await schedule_out(db, row, await db.get(User, child_id), exceptions, date.today())


@router.delete("/exceptions/{exception_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_exception(exception_id: uuid.UUID, user: AdultUser, db: DB) -> None:
    row = await db.get(CustodyException, exception_id)
    if row is None or row.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(row)
    await db.commit()


@router.post("/{child_id}/link", response_model=LinkOut, status_code=status.HTTP_201_CREATED)
async def other_parent_link(child_id: uuid.UUID, payload: LinkIn, request: Request, user: FamilyManager, db: DB) -> LinkOut:
    """A link for the other parent: only this child (its calendar, the schedule, the emergency card
    and the handover list). It can be revoked under Guests like any guest link."""
    from app.routers.guests import _hash

    child = await _child(db, user.family_id, child_id)
    schedule = await _schedule(db, user.family_id, child.id)
    token = secrets.token_urlsafe(24)
    now = datetime.now(timezone.utc)
    guest = GuestAccess(
        family_id=user.family_id, name=payload.name.strip(), token_hash=_hash(token), show_calendar=True,
        list_ids=[str(schedule.handover_list_id)] if schedule.handover_list_id else [], child_ids=[str(child.id)],
        expires_at=now + timedelta(days=payload.days), created_by=user.id, created_at=now,
    )
    db.add(guest)
    await db.commit()
    base = await public_base(db, request)
    url = f"{base}/guest/{token}"
    return LinkOut(url=url, qr_svg=qr_svg(url), expires_at=guest.expires_at)


# --- The worker: the evening before, and after a handover ----------------------------------

_TEXT = {
    "en": ("{name} to {home} tomorrow", "{name} comes home tomorrow", "At {time}.", " Handover list: {n} things."),
    "sv": ("{name} till {home} imorgon", "{name} kommer hem imorgon", "Kl. {time}.", " Packlista: {n} saker."),
    "nb": ("{name} til {home} i morgen", "{name} kommer hjem i morgen", "Kl. {time}.", " Pakkeliste: {n} ting."),
    "da": ("{name} til {home} i morgen", "{name} kommer hjem i morgen", "Kl. {time}.", " Pakkeliste: {n} ting."),
    "fi": ("{name}: {home} huomenna", "{name} tulee kotiin huomenna", "Klo {time}.", " Pakkauslista: {n} asiaa."),
}


async def run_custody(db: AsyncSession, now: datetime | None = None) -> int:
    """From 17 UTC (≈ 18–19 in the Nordics) the evening before a handover, the adults are told; the
    day after one, the handover list is cleared for the next time."""
    now = now or datetime.now(timezone.utc)
    today = now.date()
    sent = 0
    for family_id in {s.family_id for s in (await db.execute(select(CustodySchedule))).scalars().all()}:
        for schedule, child, exceptions in await family_schedules(db, family_id):
            yesterday = today - timedelta(days=1)
            if schedule.handover_list_id and place_on(schedule, exceptions, yesterday) != place_on(schedule, exceptions, yesterday - timedelta(days=1)) and schedule.cleared_for != yesterday:
                for item in (await db.execute(select(ListItem).where(ListItem.list_id == schedule.handover_list_id))).scalars().all():
                    item.done = False
                schedule.cleared_for = yesterday
                await db.commit()
            if now.hour < 17:
                continue
            tomorrow = today + timedelta(days=1)
            to = place_on(schedule, exceptions, tomorrow)
            if to == place_on(schedule, exceptions, today) or schedule.reminded_for == tomorrow:
                continue
            schedule.reminded_for = tomorrow
            await db.commit()
            open_items = 0
            if schedule.handover_list_id:
                open_items = len((await db.execute(select(ListItem.id).where(ListItem.list_id == schedule.handover_list_id, ListItem.done == False))).all())  # noqa: E712
            adults = (await db.execute(select(User).where(User.family_id == family_id, User.role.in_(["admin", "adult"])))).scalars().all()
            for adult in adults:
                away, home, at, packing = _TEXT.get(adult.language or "en", _TEXT["en"])
                title = (away if to == "other" else home).format(name=child.display_name, home=schedule.other_home)
                body = at.format(time=schedule.handover_time) + (packing.format(n=open_items) if open_items else "")
                await notify(db, adult, {"title": title, "body": body, "route": "/calendar/custody", "kind": "custody"})
                sent += 1
    return sent

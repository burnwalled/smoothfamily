"""Per-user dashboard widgets: list, add, reorder/configure, remove.

Each user composes their own dashboard. On first use the dashboard is seeded
with the three built-in widgets (today's calendar, today's tasks, leaderboard).
Additional widgets (e.g. SL departures) can be added multiple times with their
own config.
"""
import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.deps import CurrentUser, DB, FamilyManager
from app.models import DashboardWidget, Family, User, WasteSchedule
from app.services.today_cards import family_pickups, schedule_dates, school_lunch, school_name_from, waste_pickups
from app.services import electricity as el
from app.services.weather import forecast, rounded, summary
from app.schemas import WidgetCreate, WidgetOut, WidgetReorderItem, WidgetUpdate

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

DEFAULT_WIDGETS = ["calendar_today", "tasks_today", "leaderboard"]


@router.get("/widgets", response_model=list[WidgetOut])
async def list_widgets(user: CurrentUser, db: DB) -> list[DashboardWidget]:
    widgets = (
        (
            await db.execute(
                select(DashboardWidget)
                .where(DashboardWidget.user_id == user.id)
                .order_by(DashboardWidget.position, DashboardWidget.created_at)
            )
        )
        .scalars()
        .all()
    )
    if widgets:
        return list(widgets)

    # First visit: seed the default dashboard.
    seeded = [
        DashboardWidget(family_id=user.family_id, user_id=user.id, type=widget_type, position=i, config={})
        for i, widget_type in enumerate(DEFAULT_WIDGETS)
    ]
    db.add_all(seeded)
    await db.commit()
    for widget in seeded:
        await db.refresh(widget)
    return seeded


@router.post("/widgets", response_model=WidgetOut, status_code=status.HTTP_201_CREATED)
async def create_widget(payload: WidgetCreate, user: CurrentUser, db: DB) -> DashboardWidget:
    if payload.type == "sl_departures" and not payload.config.get("site_id"):
        raise HTTPException(status_code=422, detail="SL departures widget needs a site_id in config")
    max_position = (
        await db.execute(
            select(func.coalesce(func.max(DashboardWidget.position), -1)).where(
                DashboardWidget.user_id == user.id
            )
        )
    ).scalar_one()
    widget = DashboardWidget(
        family_id=user.family_id,
        user_id=user.id,
        type=payload.type,
        position=max_position + 1,
        config=payload.config,
    )
    db.add(widget)
    await db.commit()
    await db.refresh(widget)
    return widget


@router.patch("/widgets/{widget_id}", response_model=WidgetOut)
async def update_widget(
    widget_id: uuid.UUID, payload: WidgetUpdate, user: CurrentUser, db: DB
) -> DashboardWidget:
    widget = await db.get(DashboardWidget, widget_id)
    if widget is None or widget.user_id != user.id:
        raise HTTPException(status_code=404, detail="Widget not found")
    if payload.position is not None:
        widget.position = payload.position
    if payload.config is not None:
        widget.config = payload.config
    await db.commit()
    await db.refresh(widget)
    return widget


@router.post("/widgets/reorder", response_model=list[WidgetOut])
async def reorder_widgets(payload: list[WidgetReorderItem], user: CurrentUser, db: DB) -> list[DashboardWidget]:
    if not payload:
        return []

    ids = [item.id for item in payload]
    widgets = list(
        (
            await db.execute(
                select(DashboardWidget).where(
                    DashboardWidget.user_id == user.id,
                    DashboardWidget.id.in_(ids),
                )
            )
        ).scalars().all()
    )
    if len(widgets) != len(ids):
        raise HTTPException(status_code=404, detail="One or more widgets not found")

    widget_map = {w.id: w for w in widgets}
    for item in payload:
        widget_map[item.id].position = item.position

    await db.commit()

    ordered = list(
        (
            await db.execute(
                select(DashboardWidget)
                .where(DashboardWidget.user_id == user.id)
                .order_by(DashboardWidget.position, DashboardWidget.created_at)
            )
        ).scalars().all()
    )
    return ordered


@router.delete("/widgets/{widget_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_widget(widget_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    widget = await db.get(DashboardWidget, widget_id)
    if widget is None or widget.user_id != user.id:
        raise HTTPException(status_code=404, detail="Widget not found")
    await db.delete(widget)
    await db.commit()


# --- Cards fed by public sources: waste collection and school lunch ------------------------


class WastePickup(BaseModel):
    date: date
    title: str


class LunchDay(BaseModel):
    date: date
    dishes: list[str]


class SchoolLunch(BaseModel):
    user_id: uuid.UUID
    name: str
    school: str
    school_name: str
    days: list[LunchDay]
    error: bool = False


class WasteScheduleIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    # Any date it is collected, e.g. "next collection" from the waste company's page.
    anchor_date: date
    interval_weeks: int = Field(default=2, ge=1, le=52)
    months: list[int] = Field(default=[], max_length=12)


class WasteScheduleOut(BaseModel):
    id: uuid.UUID
    title: str
    anchor_date: date
    interval_weeks: int
    months: list[int]
    next_date: date | None = None


class SourcesOut(BaseModel):
    waste_ical_url: str | None
    schools: list[dict]
    waste_schedules: list[WasteScheduleOut] = []
    electricity_area: str | None = None
    weather_lat: float | None = None
    weather_lon: float | None = None
    weather_place: str | None = None


class WeatherIn(BaseModel):
    # Both empty turns the weather card off.
    lat: float | None = Field(default=None, ge=54, le=71.5)
    lon: float | None = Field(default=None, ge=2, le=33)
    place: str | None = Field(default=None, max_length=120)


class ElectricityIn(BaseModel):
    area: str | None = Field(default=None, pattern=r"^SE[1-4]$")


class PriceHour(BaseModel):
    start: datetime
    ore: float


class ElectricityOut(BaseModel):
    area: str
    now: float | None
    today: list[PriceHour]
    tomorrow: list[PriceHour] | None
    # Today's three cheapest hours from now on.
    cheapest_ahead: list[datetime]


class WeatherOut(BaseModel):
    place: str | None
    now: dict | None
    today: dict
    hours: list[dict]
    days: list[dict]


class WasteIn(BaseModel):
    url: str | None = Field(default=None, max_length=1000, pattern=r"^$|^(https?|webcal)://")


class SchoolIn(BaseModel):
    # The school's page on skolmaten.se or just its name there; empty clears it.
    school: str | None = Field(default=None, max_length=300)


@router.get("/waste", response_model=list[WastePickup])
async def waste(user: CurrentUser, db: DB) -> list[dict]:
    family = await db.get(Family, user.family_id)
    try:
        return await family_pickups(db, family, date.today())
    except Exception:
        raise HTTPException(status_code=502, detail="The waste collection calendar could not be read")


@router.get("/school-lunch", response_model=list[SchoolLunch])
async def lunch(user: CurrentUser, db: DB) -> list[SchoolLunch]:
    """This week's school lunch for every child with a school set (adults see all, children their own)."""
    query = select(User).where(User.family_id == user.family_id, User.school.is_not(None)).order_by(User.created_at)
    if user.role == "child":
        query = query.where(User.id == user.id)
    out = []
    for member in (await db.execute(query)).scalars().all():
        try:
            menu = await school_lunch(member.school, date.today())
            out.append(SchoolLunch(user_id=member.id, name=member.display_name, school=member.school, school_name=menu["school"], days=menu["days"]))
        except Exception:
            out.append(SchoolLunch(user_id=member.id, name=member.display_name, school=member.school, school_name=member.school, days=[], error=True))
    return out


@router.get("/weather", response_model=WeatherOut | None)
async def weather(user: CurrentUser, db: DB) -> WeatherOut | None:
    """The forecast for the family's place (null until the admin has chosen one)."""
    family = await db.get(Family, user.family_id)
    if family.weather_lat is None or family.weather_lon is None:
        return None
    try:
        steps = await forecast(family.weather_lat, family.weather_lon)
    except Exception:
        raise HTTPException(status_code=502, detail="SMHI's forecast could not be read")
    return WeatherOut(place=family.weather_place, **summary(steps))


@router.get("/electricity", response_model=ElectricityOut | None)
async def electricity(user: CurrentUser, db: DB) -> ElectricityOut | None:
    """Spot prices for the family's area (null until the admin has chosen one)."""
    family = await db.get(Family, user.family_id)
    if not family.electricity_area:
        return None
    now = datetime.now(timezone.utc)
    local = now.astimezone(el._zone())
    try:
        today = await el.prices(family.electricity_area, local.date()) or []
        tomorrow = await el.prices(family.electricity_area, local.date() + timedelta(days=1))
    except Exception:
        raise HTTPException(status_code=502, detail="The electricity prices could not be read")
    current = el.hour_of(today, now)
    ahead = [h for h in today if h["start"].astimezone(timezone.utc) + timedelta(hours=1) > now]
    return ElectricityOut(
        area=family.electricity_area, now=current["ore"] if current else None, today=today, tomorrow=tomorrow,
        cheapest_ahead=sorted(el.cheapest(ahead, 3)),
    )


@router.get("/sources", response_model=SourcesOut)
async def sources(admin: FamilyManager, db: DB) -> SourcesOut:
    family = await db.get(Family, admin.family_id)
    members = (await db.execute(select(User).where(User.family_id == admin.family_id).order_by(User.created_at))).scalars().all()
    return SourcesOut(
        waste_ical_url=family.waste_ical_url,
        schools=[{"user_id": m.id, "name": m.display_name, "role": m.role, "school": m.school} for m in members],
        weather_lat=family.weather_lat,
        weather_lon=family.weather_lon,
        weather_place=family.weather_place,
        electricity_area=family.electricity_area,
        waste_schedules=[
            WasteScheduleOut(
                id=r.id, title=r.title, anchor_date=r.anchor_date, interval_weeks=r.interval_weeks, months=r.months or [],
                next_date=next(iter(schedule_dates(r, date.today(), 366)), None),
            )
            for r in (
                await db.execute(select(WasteSchedule).where(WasteSchedule.family_id == admin.family_id).order_by(WasteSchedule.created_at))
            ).scalars()
        ],
    )


@router.post("/sources/waste-schedules", response_model=SourcesOut, status_code=status.HTTP_201_CREATED)
async def add_waste_schedule(payload: WasteScheduleIn, admin: FamilyManager, db: DB) -> SourcesOut:
    """A collection from the waste company's page, for municipalities without an iCal calendar."""
    if any(not 1 <= m <= 12 for m in payload.months):
        raise HTTPException(status_code=422, detail="Months are 1–12")
    db.add(
        WasteSchedule(
            family_id=admin.family_id, title=payload.title.strip(), anchor_date=payload.anchor_date,
            interval_weeks=payload.interval_weeks, months=sorted(set(payload.months)) if len(set(payload.months)) < 12 else [],
        )
    )
    await db.commit()
    return await sources(admin, db)


@router.delete("/sources/waste-schedules/{schedule_id}", response_model=SourcesOut)
async def remove_waste_schedule(schedule_id: uuid.UUID, admin: FamilyManager, db: DB) -> SourcesOut:
    rule = await db.get(WasteSchedule, schedule_id)
    if rule is None or rule.family_id != admin.family_id:
        raise HTTPException(status_code=404, detail="Schedule not found")
    await db.delete(rule)
    await db.commit()
    return await sources(admin, db)


@router.put("/sources/electricity", response_model=SourcesOut)
async def set_electricity(payload: ElectricityIn, admin: FamilyManager, db: DB) -> SourcesOut:
    family = await db.get(Family, admin.family_id)
    family.electricity_area = payload.area
    await db.commit()
    return await sources(admin, db)


@router.put("/sources/weather", response_model=SourcesOut)
async def set_weather(payload: WeatherIn, admin: FamilyManager, db: DB) -> SourcesOut:
    """SMHI covers the Nordic countries; the coordinates are rounded to about a kilometre."""
    family = await db.get(Family, admin.family_id)
    if payload.lat is None or payload.lon is None:
        family.weather_lat = family.weather_lon = family.weather_place = None
    else:
        lat, lon = rounded(payload.lat), rounded(payload.lon)
        try:
            await forecast(lat, lon)
        except Exception:
            raise HTTPException(status_code=422, detail="SMHI has no forecast for that place")
        family.weather_lat, family.weather_lon = lat, lon
        family.weather_place = (payload.place or "").strip() or None
    await db.commit()
    return await sources(admin, db)


@router.put("/sources/waste", response_model=SourcesOut)
async def set_waste(payload: WasteIn, admin: FamilyManager, db: DB) -> SourcesOut:
    family = await db.get(Family, admin.family_id)
    url = (payload.url or "").strip() or None
    if url:
        try:
            await waste_pickups(url, date.today(), 1)
        except Exception:
            raise HTTPException(status_code=422, detail="That address isn't a calendar that can be read (iCal)")
    family.waste_ical_url = url
    await db.commit()
    return await sources(admin, db)


@router.put("/sources/school/{member_id}", response_model=SourcesOut)
async def set_school(member_id: uuid.UUID, payload: SchoolIn, admin: FamilyManager, db: DB) -> SourcesOut:
    member = await db.get(User, member_id)
    if member is None or member.family_id != admin.family_id:
        raise HTTPException(status_code=404, detail="Member not found")
    if payload.school and payload.school.strip():
        name = school_name_from(payload.school)
        if name is None:
            raise HTTPException(status_code=422, detail="Paste the school's address on skolmaten.se")
        try:
            await school_lunch(name, date.today())
        except Exception:
            raise HTTPException(status_code=422, detail="The school wasn't found on skolmaten.se")
        member.school = name
    else:
        member.school = None
    await db.commit()
    return await sources(admin, db)


# --- Coming up: vehicles and homes (2.7.0) ---------------------------------------------------


class UpcomingOut(BaseModel):
    # vehicle | property
    source: str
    id: uuid.UUID
    title: str
    # The vehicle's or home's name.
    where: str
    due_date: date | None
    days_left: int | None
    # A vehicle's meter: km or hours to go.
    left: int | None = None
    unit: str | None = None
    status: str


UPCOMING_DAYS = 30


@router.get("/upcoming", response_model=list[UpcomingOut])
async def upcoming(user: CurrentUser, db: DB) -> list[UpcomingOut]:
    """What is due soon in Vehicles and Property (the next 30 days, or close on the meter), for the
    Today card – only what the member may see there."""
    from app.models import Property, PropertyReminder, Vehicle, VehicleReminder
    from app.routers import property as homes
    from app.routers import vehicles

    today = date.today()
    out: list[UpcomingOut] = []
    if "vehicles" in user.apps:
        seen = {v.id: v for v in (await db.execute(select(Vehicle).where(Vehicle.family_id == user.family_id))).scalars().all() if vehicles._may_see(v, user)}
        rows = (await db.execute(select(VehicleReminder).where(VehicleReminder.vehicle_id.in_(list(seen))))).scalars().all() if seen else []
        for row in rows:
            r = vehicles.reminder_out(row, seen[row.vehicle_id], today)
            soon = r.status != "ok" or (r.days_left is not None and r.days_left <= UPCOMING_DAYS)
            if soon:
                vehicle = seen[row.vehicle_id]
                out.append(
                    UpcomingOut(
                        source="vehicle", id=row.id, title=vehicles.kind_label(row, user.language or "en"), where=vehicle.name, due_date=r.due_date,
                        days_left=r.days_left, left=r.km_left, unit="h" if vehicle.meter == "hours" else "km", status=r.status,
                    )
                )
    if "property" in user.apps:
        rows = (
            await db.execute(
                select(PropertyReminder, Property)
                .join(Property, Property.id == PropertyReminder.property_id)
                .where(PropertyReminder.family_id == user.family_id, PropertyReminder.due_date <= today + timedelta(days=UPCOMING_DAYS))
            )
        ).all()
        for row, home in rows:
            r = homes.reminder_out(row, today)
            out.append(UpcomingOut(source="property", id=row.id, title=row.title, where=home.name, due_date=row.due_date, days_left=r.days_left, status=r.status))
    order = {"overdue": 0, "soon": 1, "ok": 2}

    def days(u: UpcomingOut) -> int:
        # The meter roughly as time: 1 000 km (or 10 hours) ≈ a month of use.
        by_meter = (u.left * 30 // (10 if u.unit == "h" else 1000)) if u.left is not None else None
        return min(x for x in (u.days_left, by_meter, 10_000) if x is not None)

    return sorted(out, key=lambda u: (order[u.status], days(u)))

"""Vehicles (2.6.0): an overview of what is due, reminders, costs, the odometer and exports.

A vehicle is anything the family keeps going: a car, a bike, a boat, a jet ski, a tractor, a
mower, a robot … Its meter counts km, engine hours or nothing. Each vehicle gets a card with what matters now: the next inspection, service, tyre change,
insurance or tax (by date and/or mileage, told in advance and shown in the calendar), the costs
this year against last year, and fuel or charging consumption from the receipts. Costs are quick to
add from the phone; a photo of the receipt (or a service history as a PDF) can be read by the local
AI (routers/ai.py). Tyre sets, home charging at the spot price, the vehicle's documents, a report
to show a buyer, and the meter read from a Home Assistant sensor are here too.
"""

import csv
import io
import json
import uuid
import zipfile
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import DB, AdminUser, CurrentUser, require_app
from app.services import smarthome_conn
from app.models import (
    Document,
    Family,
    MediaItem,
    SmarthomeConnection,
    Task,
    User,
    Vehicle,
    VehicleExpense,
    VehicleMileage,
    VehicleReminder,
    VehicleTyre,
)
from app.services import electricity
from app.services import homeassistant as ha
from app.services.crypto import decrypt_token
from app.services.notify import notify
from app.services.storage import get_storage

router = APIRouter(prefix="/api/vehicles", tags=["vehicles"], dependencies=[require_app("vehicles")])


Fuel = Literal["petrol", "diesel", "electric", "hybrid", "plugin", "gas", "other"]
Kind = Literal["car", "motorcycle", "moped", "bicycle", "ebike", "boat", "jetski", "snowmobile", "atv", "tractor", "mower", "robot_mower", "caravan", "trailer", "robot", "other"]
Meter = Literal["km", "hours", "none"]
Season = Literal["summer", "winter", "studded", "allyear"]
CATEGORY = r"^(fuel|charging|service|repair|tyres|insurance|tax|parking|toll|other)$"
ReminderKind = Literal["inspection", "service", "tyres", "insurance", "tax", "storage", "battery", "warranty", "other"]
# Told about a reminder by the meter this far before: km, or engine hours.
SOON = {"km": 1000, "hours": 10}
# VAT on the spot price (elprisetjustnu.se gives it without).
VAT = 1.25


class VehicleIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    kind: Kind = "car"
    meter: Meter = "km"
    registration: str = Field(default="", max_length=40)
    make: str | None = Field(default=None, max_length=80)
    model: str | None = Field(default=None, max_length=120)
    year: int | None = Field(default=None, ge=1900, le=3000)
    mileage: int | None = Field(default=None, ge=0)
    fuel: Fuel | None = None
    purchase_date: date | None = None
    purchase_price: float | None = Field(default=None, ge=0)
    charge_price_mode: Literal["spot", "fixed"] = "spot"
    charge_fixed_price: float | None = Field(default=None, ge=0, le=100)
    charge_extra: float | None = Field(default=None, ge=0, le=100)
    ha_meter_entity: str | None = Field(default=None, max_length=200, pattern=r"^[a-z_]+\.[a-z0-9_]+$")
    notes: str | None = None


class VehicleOut(BaseModel):
    id: uuid.UUID
    name: str
    kind: str = "car"
    meter: str = "km"
    registration: str
    make: str | None
    model: str | None
    year: int | None
    mileage: int | None
    fuel: str | None = None
    purchase_date: date | None = None
    purchase_price: float | None = None
    charge_price_mode: str = "spot"
    charge_fixed_price: float | None = None
    charge_extra: float | None = None
    ha_meter_entity: str | None = None
    notes: str | None
    allowed_user_ids: list[uuid.UUID] = []


class VehicleAccessIn(BaseModel):
    # Empty = everyone who has the Vehicles app.
    allowed_user_ids: list[uuid.UUID] = []


class VehicleExpenseIn(BaseModel):
    vehicle_id: uuid.UUID
    name: str = Field(min_length=1, max_length=200)
    # Home charging may leave it out: it is worked out from the kWh and the price.
    amount: float | None = Field(default=None, gt=0)
    expense_date: date
    category: str = Field(default="other", pattern=CATEGORY)
    mileage_at: int | None = Field(default=None, ge=0)
    volume: float | None = Field(default=None, gt=0, le=10_000)
    volume_unit: Literal["l", "kWh"] | None = None
    charge_place: Literal["home", "public"] | None = None
    receipt_media_id: uuid.UUID | None = None


class VehicleExpenseOut(BaseModel):
    id: uuid.UUID
    vehicle_id: uuid.UUID
    name: str
    amount: float
    expense_date: date
    category: str
    mileage_at: int | None
    volume: float | None = None
    volume_unit: str | None = None
    charge_place: str | None = None
    receipt_media_id: uuid.UUID | None


class VehicleSummary(BaseModel):
    total_expenses: float
    fuel_total: float
    service_total: float
    repair_total: float


class ReminderIn(BaseModel):
    vehicle_id: uuid.UUID
    kind: ReminderKind
    title: str = Field(default="", max_length=120)
    due_date: date | None = None
    due_mileage: int | None = Field(default=None, ge=0)
    repeat_months: int | None = Field(default=None, ge=1, le=120)
    repeat_km: int | None = Field(default=None, ge=1, le=200_000)
    remind_days: int = Field(default=14, ge=0, le=120)


class ReminderOut(BaseModel):
    id: uuid.UUID
    vehicle_id: uuid.UUID
    kind: str
    title: str
    due_date: date | None
    due_mileage: int | None
    repeat_months: int | None
    repeat_km: int | None
    remind_days: int
    last_done: date | None
    # overdue | soon | ok – by date or mileage, whichever comes first
    status: str = "ok"
    days_left: int | None = None
    km_left: int | None = None


class ReminderDoneIn(BaseModel):
    done_date: date | None = None
    mileage: int | None = Field(default=None, ge=0)


class MileageIn(BaseModel):
    reading_date: date
    mileage: int = Field(ge=0, le=5_000_000)


class MileageOut(BaseModel):
    id: uuid.UUID
    vehicle_id: uuid.UUID
    reading_date: date
    mileage: int
    from_expense: bool


class VehicleCard(BaseModel):
    vehicle: VehicleOut
    reminders: list[ReminderOut]
    cost_this_year: float
    cost_last_year: float
    # Last year by the same date, to compare fairly during the year.
    cost_last_year_to_date: float
    by_category: dict[str, float]
    # Per 100 km over the last 12 months (litres or kWh), from fills with odometer and amount.
    consumption: float | None
    consumption_unit: str | None
    km_last_12_months: int | None
    cost_per_km: float | None
    currency: str = "kr"
    # Since it was bought: the price plus every cost.
    ownership_cost: float | None = None
    tyres_on: str | None = None


class TyreIn(BaseModel):
    name: str = Field(default="", max_length=120)
    season: Season = "summer"
    size: str = Field(default="", max_length=40)
    bought: date | None = None
    tread_mm: float | None = Field(default=None, ge=0, le=30)
    storage: str = Field(default="", max_length=120)
    notes: str | None = None


class TyreOut(TyreIn):
    id: uuid.UUID
    vehicle_id: uuid.UUID
    mounted: bool
    mounted_at: date | None


class MountIn(BaseModel):
    on_date: date | None = None
    mileage: int | None = Field(default=None, ge=0)
    # Where the set that comes off is kept.
    storage: str | None = Field(default=None, max_length=120)


class VehicleDocument(BaseModel):
    id: uuid.UUID
    title: str
    kind: str
    expiry_date: date | None


def _to_float(v: Decimal | float | int | None) -> float:
    if v is None:
        return 0.0
    return float(v)


def _may_see(vehicle: Vehicle, user: User) -> bool:
    """Admins see every vehicle; others those open to everyone or to them."""
    allowed = [str(uid) for uid in vehicle.allowed_user_ids or []]
    return user.role == "admin" or not allowed or str(user.id) in allowed


async def _get_vehicle(db, user: User, vehicle_id: uuid.UUID) -> Vehicle:
    row = await db.get(Vehicle, vehicle_id)
    if row is None or row.family_id != user.family_id or not _may_see(row, user):
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return row


async def _visible_ids(db, user: User) -> list[uuid.UUID]:
    rows = (await db.execute(select(Vehicle).where(Vehicle.family_id == user.family_id))).scalars().all()
    return [v.id for v in rows if _may_see(v, user)]


async def _validate_receipt(db, family_id: uuid.UUID, receipt_media_id: uuid.UUID | None) -> None:
    if receipt_media_id is None:
        return
    media = await db.get(MediaItem, receipt_media_id)
    if media is None or media.family_id != family_id:
        raise HTTPException(status_code=404, detail="Receipt media not found")


@router.get("", response_model=list[VehicleOut])
async def list_vehicles(user: CurrentUser, db: DB) -> list[Vehicle]:
    rows = await db.execute(select(Vehicle).where(Vehicle.family_id == user.family_id).order_by(Vehicle.created_at.desc()))
    return [v for v in rows.scalars().all() if _may_see(v, user)]


@router.post("", response_model=VehicleOut, status_code=status.HTTP_201_CREATED)
async def create_vehicle(payload: VehicleIn, user: CurrentUser, db: DB) -> Vehicle:
    row = Vehicle(family_id=user.family_id, **payload.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.patch("/{vehicle_id}", response_model=VehicleOut)
async def update_vehicle(vehicle_id: uuid.UUID, payload: VehicleIn, user: CurrentUser, db: DB) -> Vehicle:
    row = await _get_vehicle(db, user, vehicle_id)
    for field, value in payload.model_dump().items():
        setattr(row, field, value)
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/{vehicle_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vehicle(vehicle_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    row = await _get_vehicle(db, user, vehicle_id)
    for doc in (await db.execute(select(Document).where(Document.vehicle_id == row.id))).scalars().all():
        doc.vehicle_id = None
    for model in (VehicleMileage, VehicleReminder, VehicleTyre, VehicleExpense):
        await db.execute(delete(model).where(model.vehicle_id == row.id))
    await db.delete(row)
    await db.commit()


@router.put("/{vehicle_id}/access", response_model=VehicleOut)
async def set_vehicle_access(vehicle_id: uuid.UUID, payload: VehicleAccessIn, admin: AdminUser, db: DB) -> Vehicle:
    """Family admin: who may see the vehicle, its expenses and exports."""
    row = await _get_vehicle(db, admin, vehicle_id)
    members = (await db.execute(select(User.id).where(User.family_id == admin.family_id))).scalars().all()
    family_ids = {str(uid) for uid in members}
    row.allowed_user_ids = [str(uid) for uid in payload.allowed_user_ids if str(uid) in family_ids]
    await db.commit()
    await db.refresh(row)
    return row


@router.get("/expenses", response_model=list[VehicleExpenseOut])
async def list_expenses(user: CurrentUser, db: DB, vehicle_id: uuid.UUID | None = Query(default=None)) -> list[VehicleExpense]:
    query = select(VehicleExpense).where(VehicleExpense.vehicle_id.in_(await _visible_ids(db, user)))
    if vehicle_id is not None:
        query = query.where(VehicleExpense.vehicle_id == vehicle_id)
    rows = await db.execute(query.order_by(VehicleExpense.expense_date.desc(), VehicleExpense.created_at.desc()))
    return list(rows.scalars().all())


async def charge_price(db: AsyncSession, vehicle: Vehicle, day: date) -> float | None:
    """Per kWh charged at home: fixed, or the day's average spot price with VAT plus the extra."""
    if vehicle.charge_price_mode == "fixed":
        return vehicle.charge_fixed_price
    family = await db.get(Family, vehicle.family_id)
    if not family or not family.electricity_area:
        return None
    hours = await electricity.prices(family.electricity_area, day)
    if not hours:
        return None
    spot = sum(h["ore"] for h in hours) / len(hours) / 100
    return round(spot * VAT + (vehicle.charge_extra or 0), 4)


async def _priced(db: AsyncSession, vehicle: Vehicle, payload: VehicleExpenseIn) -> VehicleExpenseIn:
    if payload.amount is not None:
        return payload
    if payload.category == "charging" and payload.charge_place == "home" and payload.volume:
        price = await charge_price(db, vehicle, payload.expense_date)
        if price is not None:
            return payload.model_copy(update={"amount": round(payload.volume * price, 2)})
        raise HTTPException(status_code=422, detail="No electricity price for that day – give the amount or a fixed price per kWh")
    raise HTTPException(status_code=422, detail="Give the amount")


async def add_expense(db: AsyncSession, user: User, payload: VehicleExpenseIn) -> VehicleExpense:
    """Also used by the local AI when a read receipt is put in."""
    vehicle = await _get_vehicle(db, user, payload.vehicle_id)
    await _validate_receipt(db, user.family_id, payload.receipt_media_id)
    payload = await _priced(db, vehicle, payload)
    row = VehicleExpense(family_id=user.family_id, **payload.model_dump())
    db.add(row)
    await db.flush()
    await _expense_reading(db, vehicle, row)
    await db.commit()
    await db.refresh(row)
    await check_mileage_reminders(db, vehicle)
    return row


async def _expense_reading(db: AsyncSession, vehicle: Vehicle, row: VehicleExpense) -> None:
    await db.execute(delete(VehicleMileage).where(VehicleMileage.expense_id == row.id))
    if row.mileage_at is not None:
        db.add(VehicleMileage(family_id=vehicle.family_id, vehicle_id=vehicle.id, reading_date=row.expense_date, mileage=row.mileage_at, expense_id=row.id))
    await db.flush()
    await _update_odometer(db, vehicle)


async def _update_odometer(db: AsyncSession, vehicle: Vehicle) -> None:
    """The vehicle's mileage is its highest reading (an older one typed in later doesn't lower it)."""
    rows = (await db.execute(select(VehicleMileage.mileage).where(VehicleMileage.vehicle_id == vehicle.id))).scalars().all()
    if rows:
        vehicle.mileage = max(max(rows), vehicle.mileage or 0)


async def _expense(db: AsyncSession, user: User, expense_id: uuid.UUID) -> VehicleExpense:
    row = await db.get(VehicleExpense, expense_id)
    if row is None or row.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Expense not found")
    await _get_vehicle(db, user, row.vehicle_id)
    return row


@router.post("/expenses", response_model=VehicleExpenseOut, status_code=status.HTTP_201_CREATED)
async def create_expense(payload: VehicleExpenseIn, user: CurrentUser, db: DB) -> VehicleExpense:
    return await add_expense(db, user, payload)


@router.patch("/expenses/{expense_id}", response_model=VehicleExpenseOut)
async def update_expense(expense_id: uuid.UUID, payload: VehicleExpenseIn, user: CurrentUser, db: DB) -> VehicleExpense:
    row = await _expense(db, user, expense_id)
    vehicle = await _get_vehicle(db, user, payload.vehicle_id)
    await _validate_receipt(db, user.family_id, payload.receipt_media_id)
    payload = await _priced(db, vehicle, payload)
    for field, value in payload.model_dump().items():
        setattr(row, field, value)
    await _expense_reading(db, vehicle, row)
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/expenses/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expense(expense_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    row = await _expense(db, user, expense_id)
    await db.execute(delete(VehicleMileage).where(VehicleMileage.expense_id == row.id))
    await db.delete(row)
    await db.commit()


# --- Reminders --------------------------------------------------------------------------------


def add_months(day: date, months: int) -> date:
    month = day.month - 1 + months
    year, month = day.year + month // 12, month % 12 + 1
    last = [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
    return date(year, month, min(day.day, last))


def reminder_out(row: VehicleReminder, vehicle: Vehicle, today: date) -> ReminderOut:
    days_left = (row.due_date - today).days if row.due_date else None
    counted = vehicle.meter != "none" and row.due_mileage is not None and vehicle.mileage is not None
    km_left = row.due_mileage - (vehicle.mileage or 0) if counted else None
    if (days_left is not None and days_left < 0) or (km_left is not None and km_left < 0):
        state = "overdue"
    elif (days_left is not None and days_left <= row.remind_days) or (km_left is not None and km_left <= SOON.get(vehicle.meter, 1000)):
        state = "soon"
    else:
        state = "ok"
    return ReminderOut(
        id=row.id, vehicle_id=row.vehicle_id, kind=row.kind, title=row.title, due_date=row.due_date, due_mileage=row.due_mileage,
        repeat_months=row.repeat_months, repeat_km=row.repeat_km, remind_days=row.remind_days, last_done=row.last_done,
        status=state, days_left=days_left, km_left=km_left,
    )


def _urgency(r: ReminderOut) -> tuple:
    order = {"overdue": 0, "soon": 1, "ok": 2}[r.status]
    # Compare a date and the meter roughly: 1 000 km (or 10 hours) ≈ a month of use.
    days = min(x for x in [r.days_left, (r.km_left * 30 // 1000) if r.km_left is not None else None, 100_000] if x is not None)
    return (order, days)


async def _reminder(db: AsyncSession, user: User, reminder_id: uuid.UUID) -> tuple[VehicleReminder, Vehicle]:
    row = await db.get(VehicleReminder, reminder_id)
    if row is None or row.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return row, await _get_vehicle(db, user, row.vehicle_id)


def _check_due(payload: ReminderIn) -> None:
    if payload.due_date is None and payload.due_mileage is None:
        raise HTTPException(status_code=422, detail="Give a date, a mileage or both")


@router.get("/reminders", response_model=list[ReminderOut])
async def list_reminders(user: CurrentUser, db: DB, vehicle_id: uuid.UUID | None = None) -> list[ReminderOut]:
    visible = await _visible_ids(db, user)
    query = select(VehicleReminder).where(VehicleReminder.vehicle_id.in_(visible))
    if vehicle_id:
        query = query.where(VehicleReminder.vehicle_id == vehicle_id)
    rows = (await db.execute(query)).scalars().all()
    vehicles = {v.id: v for v in (await db.execute(select(Vehicle).where(Vehicle.id.in_(visible)))).scalars().all()}
    today = date.today()
    return sorted((reminder_out(r, vehicles[r.vehicle_id], today) for r in rows), key=_urgency)


@router.post("/reminders", response_model=ReminderOut, status_code=status.HTTP_201_CREATED)
async def create_reminder(payload: ReminderIn, user: CurrentUser, db: DB) -> ReminderOut:
    vehicle = await _get_vehicle(db, user, payload.vehicle_id)
    _check_due(payload)
    row = VehicleReminder(family_id=user.family_id, **payload.model_dump())
    row.title = row.title.strip()
    db.add(row)
    await db.commit()
    return reminder_out(row, vehicle, date.today())


@router.patch("/reminders/{reminder_id}", response_model=ReminderOut)
async def update_reminder(reminder_id: uuid.UUID, payload: ReminderIn, user: CurrentUser, db: DB) -> ReminderOut:
    row, _ = await _reminder(db, user, reminder_id)
    vehicle = await _get_vehicle(db, user, payload.vehicle_id)
    _check_due(payload)
    for field, value in payload.model_dump().items():
        setattr(row, field, value.strip() if isinstance(value, str) and field == "title" else value)
    await db.commit()
    return reminder_out(row, vehicle, date.today())


@router.delete("/reminders/{reminder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_reminder(reminder_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    row, _ = await _reminder(db, user, reminder_id)
    await db.delete(row)
    await db.commit()


@router.post("/reminders/{reminder_id}/done", response_model=ReminderOut | None)
async def reminder_done(reminder_id: uuid.UUID, payload: ReminderDoneIn, user: CurrentUser, db: DB) -> ReminderOut | None:
    """Done: the next one is set from when it was done (and the odometer then), or – if it
    doesn't repeat – the reminder goes."""
    row, vehicle = await _reminder(db, user, reminder_id)
    done = payload.done_date or date.today()
    if payload.mileage is not None:
        db.add(VehicleMileage(family_id=vehicle.family_id, vehicle_id=vehicle.id, reading_date=done, mileage=payload.mileage))
        await db.flush()
        await _update_odometer(db, vehicle)
    if not row.repeat_months and not row.repeat_km:
        await db.delete(row)
        await db.commit()
        return None
    row.last_done = done
    row.due_date = add_months(done, row.repeat_months) if row.repeat_months else None
    at = payload.mileage if payload.mileage is not None else vehicle.mileage
    row.due_mileage = at + row.repeat_km if row.repeat_km and at is not None else None
    if row.due_date is None and row.due_mileage is None:
        # Repeats by mileage, but the odometer isn't known: ask again in a year.
        row.due_date = add_months(done, 12)
    await db.commit()
    return reminder_out(row, vehicle, date.today())


# --- The odometer ---------------------------------------------------------------------------


@router.get("/{vehicle_id}/mileage", response_model=list[MileageOut])
async def list_mileage(vehicle_id: uuid.UUID, user: CurrentUser, db: DB) -> list[MileageOut]:
    await _get_vehicle(db, user, vehicle_id)
    rows = (
        await db.execute(select(VehicleMileage).where(VehicleMileage.vehicle_id == vehicle_id).order_by(VehicleMileage.reading_date.desc(), VehicleMileage.mileage.desc()))
    ).scalars().all()
    return [MileageOut(id=r.id, vehicle_id=r.vehicle_id, reading_date=r.reading_date, mileage=r.mileage, from_expense=r.expense_id is not None) for r in rows]


@router.post("/{vehicle_id}/mileage", response_model=MileageOut, status_code=status.HTTP_201_CREATED)
async def add_mileage(vehicle_id: uuid.UUID, payload: MileageIn, user: CurrentUser, db: DB) -> MileageOut:
    vehicle = await _get_vehicle(db, user, vehicle_id)
    row = VehicleMileage(family_id=vehicle.family_id, vehicle_id=vehicle.id, reading_date=payload.reading_date, mileage=payload.mileage)
    db.add(row)
    await db.flush()
    await _update_odometer(db, vehicle)
    await db.commit()
    await check_mileage_reminders(db, vehicle)
    return MileageOut(id=row.id, vehicle_id=row.vehicle_id, reading_date=row.reading_date, mileage=row.mileage, from_expense=False)


@router.delete("/mileage/{reading_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_mileage(reading_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    row = await db.get(VehicleMileage, reading_id)
    if row is None or row.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Reading not found")
    vehicle = await _get_vehicle(db, user, row.vehicle_id)
    if row.expense_id is not None:
        raise HTTPException(status_code=409, detail="This reading comes from an expense – change it there")
    await db.delete(row)
    await db.flush()
    rest = (await db.execute(select(VehicleMileage.mileage).where(VehicleMileage.vehicle_id == vehicle.id))).scalars().all()
    vehicle.mileage = max(rest) if rest else vehicle.mileage
    await db.commit()


# --- The overview ---------------------------------------------------------------------------


def consumption(fills: list[VehicleExpense]) -> tuple[float | None, int | None]:
    """Full-tank method: what was filled after the first fill, over the distance between the first
    and the last fill. Per 100 km, and the distance."""
    rows = sorted((f for f in fills if f.mileage_at is not None and f.volume), key=lambda f: f.mileage_at)
    if len(rows) < 2:
        return None, None
    distance = rows[-1].mileage_at - rows[0].mileage_at
    if distance <= 0:
        return None, None
    used = sum(f.volume for f in rows[1:])
    return round(used / distance * 100, 1), distance


@router.get("/overview", response_model=list[VehicleCard])
async def overview(user: CurrentUser, db: DB) -> list[VehicleCard]:
    today = date.today()
    visible = await _visible_ids(db, user)
    vehicles = (await db.execute(select(Vehicle).where(Vehicle.id.in_(visible)).order_by(Vehicle.created_at))).scalars().all()
    reminders = (await db.execute(select(VehicleReminder).where(VehicleReminder.vehicle_id.in_(visible)))).scalars().all()
    since = date(today.year - 1, 1, 1)
    expenses = (await db.execute(select(VehicleExpense).where(VehicleExpense.vehicle_id.in_(visible), VehicleExpense.expense_date >= since))).scalars().all()
    readings = (await db.execute(select(VehicleMileage).where(VehicleMileage.vehicle_id.in_(visible)))).scalars().all()
    family = await db.get(Family, user.family_id)
    tyres_on = {t.vehicle_id: t for t in (await db.execute(select(VehicleTyre).where(VehicleTyre.vehicle_id.in_(visible), VehicleTyre.mounted == True))).scalars().all()}  # noqa: E712
    totals = dict(
        (await db.execute(select(VehicleExpense.vehicle_id, func.coalesce(func.sum(VehicleExpense.amount), 0)).where(VehicleExpense.vehicle_id.in_(visible)).group_by(VehicleExpense.vehicle_id))).all()
    )
    year_ago = today - timedelta(days=365)
    try:
        same_day_last_year = today.replace(year=today.year - 1)
    except ValueError:  # 29 February
        same_day_last_year = today - timedelta(days=365)
    cards = []
    for v in vehicles:
        mine = [e for e in expenses if e.vehicle_id == v.id]
        this_year = [e for e in mine if e.expense_date.year == today.year]
        last_year = [e for e in mine if e.expense_date.year == today.year - 1]
        by_category: dict[str, float] = {}
        for e in this_year:
            by_category[e.category] = round(by_category.get(e.category, 0) + _to_float(e.amount), 2)
        fills = [e for e in mine if e.category in ("fuel", "charging") and e.expense_date >= year_ago]
        per_100, _ = consumption(fills)
        units = {f.volume_unit for f in fills if f.volume}
        recent = sorted((r for r in readings if r.vehicle_id == v.id), key=lambda r: r.reading_date)
        before = [r.mileage for r in recent if r.reading_date <= year_ago]
        in_year = [r.mileage for r in recent if r.reading_date > year_ago]
        km = None
        if in_year and (before or len(in_year) > 1):
            start = max(before) if before else min(in_year)
            km = max(in_year) - start if max(in_year) > start else None
        year_cost = sum(_to_float(e.amount) for e in mine if e.expense_date >= year_ago)
        cards.append(
            VehicleCard(
                vehicle=VehicleOut.model_validate(v, from_attributes=True),
                reminders=sorted((reminder_out(r, v, today) for r in reminders if r.vehicle_id == v.id), key=_urgency),
                cost_this_year=round(sum(_to_float(e.amount) for e in this_year), 2),
                cost_last_year=round(sum(_to_float(e.amount) for e in last_year), 2),
                cost_last_year_to_date=round(sum(_to_float(e.amount) for e in last_year if e.expense_date <= same_day_last_year), 2),
                by_category=by_category,
                consumption=per_100,
                consumption_unit=(units.pop() if len(units) == 1 else None) if per_100 is not None else None,
                km_last_12_months=km,
                cost_per_km=round(year_cost / km, 2) if km else None,
                currency=family.currency or "kr",
                ownership_cost=round(_to_float(v.purchase_price) + _to_float(totals.get(v.id)), 2) if v.purchase_price is not None else None,
                tyres_on=tyres_on[v.id].season if v.id in tyres_on else None,
            )
        )
    return cards


# --- Telling the family -------------------------------------------------------------------

_KIND = {
    "en": {"inspection": "Inspection", "service": "Service", "tyres": "Tyre change", "insurance": "Insurance", "tax": "Vehicle tax", "storage": "Storage", "battery": "Battery", "warranty": "Warranty ends", "other": "Reminder"},
    "sv": {"inspection": "Besiktning", "service": "Service", "tyres": "Däckbyte", "insurance": "Försäkring", "tax": "Fordonsskatt", "storage": "Förvaring", "battery": "Batteri", "warranty": "Garantin går ut", "other": "Påminnelse"},
    "nb": {"inspection": "EU-kontroll", "service": "Service", "tyres": "Dekkskift", "insurance": "Forsikring", "tax": "Trafikkforsikringsavgift", "storage": "Lagring", "battery": "Batteri", "warranty": "Garantien utløper", "other": "Påminnelse"},
    "da": {"inspection": "Syn", "service": "Service", "tyres": "Dækskift", "insurance": "Forsikring", "tax": "Vægtafgift", "storage": "Opbevaring", "battery": "Batteri", "warranty": "Garantien udløber", "other": "Påmindelse"},
    "fi": {"inspection": "Katsastus", "service": "Huolto", "tyres": "Renkaanvaihto", "insurance": "Vakuutus", "tax": "Ajoneuvovero", "storage": "Säilytys", "battery": "Akku", "warranty": "Takuu päättyy", "other": "Muistutus"},
}
_WHEN = {
    "en": ("{what} for {vehicle}", "Due {date}", "Due at {km} km – {left} km to go", "Overdue since {date}"),
    "sv": ("{what} för {vehicle}", "Senast {date}", "Vid {km} km – {left} km kvar", "Försenad sedan {date}"),
    "nb": ("{what} for {vehicle}", "Senest {date}", "Ved {km} km – {left} km igjen", "Forsinket siden {date}"),
    "da": ("{what} for {vehicle}", "Senest {date}", "Ved {km} km – {left} km tilbage", "Forsinket siden {date}"),
    "fi": ("{what}: {vehicle}", "Viimeistään {date}", "{km} km kohdalla – {left} km jäljellä", "Myöhässä {date} alkaen"),
}


def kind_label(row: VehicleReminder, language: str) -> str:
    return row.title or _KIND.get(language, _KIND["en"]).get(row.kind, row.kind)


async def _tell(db: AsyncSession, vehicle: Vehicle, row: VehicleReminder, body_for) -> int:
    members = (await db.execute(select(User).where(User.family_id == vehicle.family_id, User.role.in_(["admin", "adult"])))).scalars().all()
    sent = 0
    for member in members:
        if "vehicles" not in member.apps or not _may_see(vehicle, member):
            continue
        lang = member.language or "en"
        title = _WHEN.get(lang, _WHEN["en"])[0].format(what=kind_label(row, lang), vehicle=vehicle.name)
        await notify(db, member, {"title": title, "body": body_for(lang), "route": "/vehicles", "kind": "vehicle_reminder"})
        sent += 1
    return sent


async def check_mileage_reminders(db: AsyncSession, vehicle: Vehicle) -> int:
    """After a new odometer reading: what is due within SOON_KM, once per due mileage."""
    if vehicle.mileage is None or vehicle.meter == "none":
        return 0
    rows = (await db.execute(select(VehicleReminder).where(VehicleReminder.vehicle_id == vehicle.id, VehicleReminder.due_mileage.is_not(None)))).scalars().all()
    unit = "h" if vehicle.meter == "hours" else "km"
    sent = 0
    for row in rows:
        left = row.due_mileage - vehicle.mileage
        if left > SOON.get(vehicle.meter, 1000) or row.reminded_km == row.due_mileage:
            continue
        row.reminded_km = row.due_mileage
        await db.commit()
        sent += await _tell(
            db, vehicle, row,
            lambda lang: _WHEN.get(lang, _WHEN["en"])[2].format(km=f"{row.due_mileage:,}".replace(",", " "), left=max(left, 0)).replace("km", unit),
        )
    return sent


async def run_vehicle_reminders(db: AsyncSession, now: datetime | None = None) -> int:
    """From 07 UTC: dated reminders `remind_days` before, once per due date, to the adults who see
    the vehicle."""
    now = now or datetime.now(timezone.utc)
    if now.hour < 7:
        return 0
    today = now.date()
    rows = (await db.execute(select(VehicleReminder).where(VehicleReminder.due_date.is_not(None)))).scalars().all()
    sent = 0
    for row in rows:
        if row.reminded_for == row.due_date or row.due_date - timedelta(days=row.remind_days) > today:
            continue
        vehicle = await db.get(Vehicle, row.vehicle_id)
        if vehicle is None:
            continue
        row.reminded_for = row.due_date
        await db.commit()
        late = row.due_date < today
        sent += await _tell(db, vehicle, row, lambda lang: _WHEN.get(lang, _WHEN["en"])[3 if late else 1].format(date=row.due_date.isoformat()))
    return sent


@router.get("/summary", response_model=VehicleSummary)
async def summary(
    user: CurrentUser,
    db: DB,
    vehicle_id: uuid.UUID | None = Query(default=None),
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
) -> VehicleSummary:
    query = select(VehicleExpense).where(VehicleExpense.vehicle_id.in_(await _visible_ids(db, user)))
    if vehicle_id is not None:
        await _get_vehicle(db, user, vehicle_id)
        query = query.where(VehicleExpense.vehicle_id == vehicle_id)
    if from_date is not None:
        query = query.where(VehicleExpense.expense_date >= from_date)
    if to_date is not None:
        query = query.where(VehicleExpense.expense_date <= to_date)
    rows = list((await db.execute(query)).scalars().all())

    total = 0.0
    fuel = 0.0
    service = 0.0
    repair = 0.0
    for row in rows:
        amount = _to_float(row.amount)
        total += amount
        if row.category == "fuel":
            fuel += amount
        elif row.category == "service":
            service += amount
        elif row.category == "repair":
            repair += amount

    return VehicleSummary(
        total_expenses=round(total, 2),
        fuel_total=round(fuel, 2),
        service_total=round(service, 2),
        repair_total=round(repair, 2),
    )


@router.get("/export")
async def export_vehicle_data(user: CurrentUser, db: DB, vehicle_id: uuid.UUID | None = Query(default=None)) -> StreamingResponse:
    visible = await _visible_ids(db, user)
    vehicles_q = select(Vehicle).where(Vehicle.id.in_(visible))
    expenses_q = select(VehicleExpense).where(VehicleExpense.vehicle_id.in_(visible))
    tasks_q = select(Task).where(Task.family_id == user.family_id, Task.vehicle_id.in_(visible))

    if vehicle_id is not None:
        await _get_vehicle(db, user, vehicle_id)
        vehicles_q = vehicles_q.where(Vehicle.id == vehicle_id)
        expenses_q = expenses_q.where(VehicleExpense.vehicle_id == vehicle_id)
        tasks_q = tasks_q.where(Task.vehicle_id == vehicle_id)

    vehicles = list((await db.execute(vehicles_q)).scalars().all())
    expenses = list((await db.execute(expenses_q)).scalars().all())
    tasks = list((await db.execute(tasks_q)).scalars().all())
    ids = [v.id for v in vehicles]
    reminders = list((await db.execute(select(VehicleReminder).where(VehicleReminder.vehicle_id.in_(ids)))).scalars().all())
    readings = list((await db.execute(select(VehicleMileage).where(VehicleMileage.vehicle_id.in_(ids)).order_by(VehicleMileage.reading_date))).scalars().all())

    out = io.BytesIO()
    storage = get_storage()
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        payload = {
            "vehicles": [
                {
                    "id": str(v.id),
                    "name": v.name,
                    "registration": v.registration,
                    "make": v.make,
                    "model": v.model,
                    "year": v.year,
                    "mileage": v.mileage,
                    "fuel": v.fuel,
                    "notes": v.notes,
                }
                for v in vehicles
            ],
            "vehicle_expenses": [
                {
                    "id": str(e.id),
                    "vehicle_id": str(e.vehicle_id),
                    "name": e.name,
                    "amount": _to_float(e.amount),
                    "expense_date": e.expense_date.isoformat(),
                    "category": e.category,
                    "mileage_at": e.mileage_at,
                    "volume": e.volume,
                    "volume_unit": e.volume_unit,
                    "receipt_media_id": str(e.receipt_media_id) if e.receipt_media_id else None,
                }
                for e in expenses
            ],
            "reminders": [
                {
                    "vehicle_id": str(r.vehicle_id), "kind": r.kind, "title": r.title,
                    "due_date": r.due_date.isoformat() if r.due_date else None, "due_mileage": r.due_mileage,
                    "repeat_months": r.repeat_months, "repeat_km": r.repeat_km, "last_done": r.last_done.isoformat() if r.last_done else None,
                }
                for r in reminders
            ],
            "mileage": [{"vehicle_id": str(m.vehicle_id), "date": m.reading_date.isoformat(), "km": m.mileage} for m in readings],
            "tasks": [
                {
                    "id": str(t.id),
                    "title": t.title,
                    "vehicle_id": str(t.vehicle_id) if t.vehicle_id else None,
                    "recurrence": t.recurrence,
                    "month": t.month,
                    "day_of_month": t.day_of_month,
                }
                for t in tasks
            ],
        }
        zf.writestr("vehicles/data.json", json.dumps(payload, ensure_ascii=False, indent=2))

        csv_buf = io.StringIO()
        writer = csv.DictWriter(csv_buf, fieldnames=["id", "vehicle_id", "name", "amount", "expense_date", "category", "mileage_at", "volume", "volume_unit", "receipt_media_id"])
        writer.writeheader()
        for row in payload["vehicle_expenses"]:
            writer.writerow(row)
        # UTF-8 BOM so Excel shows å/ä/ö correctly instead of guessing a legacy codepage.
        zf.writestr("vehicles/expenses.csv", "\ufeff" + csv_buf.getvalue())

        for expense in expenses:
            if expense.receipt_media_id is None:
                continue
            media = await db.get(MediaItem, expense.receipt_media_id)
            if media is None or media.family_id != user.family_id:
                continue
            try:
                src = storage.open(user.family_id, media.storage_key)
                with open(src, "rb") as fh:
                    zf.writestr(f"vehicles/receipts/{media.id}_{media.original_name}", fh.read())
            except FileNotFoundError:
                continue

    out.seek(0)
    return StreamingResponse(
        out,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="vehicles-export.zip"'},
    )


# --- Tyres ----------------------------------------------------------------------------------


def _tyre_out(t: VehicleTyre) -> TyreOut:
    return TyreOut(
        id=t.id, vehicle_id=t.vehicle_id, name=t.name, season=t.season, size=t.size, bought=t.bought, tread_mm=t.tread_mm,
        storage=t.storage, notes=t.notes, mounted=t.mounted, mounted_at=t.mounted_at,
    )


async def _tyre(db: AsyncSession, user: User, tyre_id: uuid.UUID) -> tuple[VehicleTyre, Vehicle]:
    row = await db.get(VehicleTyre, tyre_id)
    if row is None or row.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Tyres not found")
    return row, await _get_vehicle(db, user, row.vehicle_id)


@router.get("/{vehicle_id}/tyres", response_model=list[TyreOut])
async def list_tyres(vehicle_id: uuid.UUID, user: CurrentUser, db: DB) -> list[TyreOut]:
    await _get_vehicle(db, user, vehicle_id)
    rows = (await db.execute(select(VehicleTyre).where(VehicleTyre.vehicle_id == vehicle_id).order_by(VehicleTyre.mounted.desc(), VehicleTyre.created_at))).scalars().all()
    return [_tyre_out(t) for t in rows]


@router.post("/{vehicle_id}/tyres", response_model=TyreOut, status_code=status.HTTP_201_CREATED)
async def add_tyres(vehicle_id: uuid.UUID, payload: TyreIn, user: CurrentUser, db: DB) -> TyreOut:
    vehicle = await _get_vehicle(db, user, vehicle_id)
    row = VehicleTyre(family_id=vehicle.family_id, vehicle_id=vehicle.id, **payload.model_dump())
    db.add(row)
    await db.commit()
    return _tyre_out(row)


@router.patch("/tyres/{tyre_id}", response_model=TyreOut)
async def update_tyres(tyre_id: uuid.UUID, payload: TyreIn, user: CurrentUser, db: DB) -> TyreOut:
    row, _ = await _tyre(db, user, tyre_id)
    for field, value in payload.model_dump().items():
        setattr(row, field, value)
    await db.commit()
    return _tyre_out(row)


@router.delete("/tyres/{tyre_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tyres(tyre_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    row, _ = await _tyre(db, user, tyre_id)
    await db.delete(row)
    await db.commit()


@router.post("/tyres/{tyre_id}/mount", response_model=list[TyreOut])
async def mount_tyres(tyre_id: uuid.UUID, payload: MountIn, user: CurrentUser, db: DB) -> list[TyreOut]:
    """A tyre change: this set goes on, the one that was on goes to storage. A tyre-change reminder
    due within a month counts as done, and the odometer is noted."""
    row, vehicle = await _tyre(db, user, tyre_id)
    day = payload.on_date or date.today()
    for other in (await db.execute(select(VehicleTyre).where(VehicleTyre.vehicle_id == vehicle.id, VehicleTyre.mounted == True))).scalars().all():  # noqa: E712
        other.mounted = False
        if payload.storage is not None:
            other.storage = payload.storage.strip()
    row.mounted, row.mounted_at = True, day
    if payload.mileage is not None:
        db.add(VehicleMileage(family_id=vehicle.family_id, vehicle_id=vehicle.id, reading_date=day, mileage=payload.mileage))
        await db.flush()
        await _update_odometer(db, vehicle)
    due = (
        await db.execute(
            select(VehicleReminder).where(
                VehicleReminder.vehicle_id == vehicle.id, VehicleReminder.kind == "tyres",
                VehicleReminder.due_date.is_not(None), VehicleReminder.due_date <= day + timedelta(days=31),
            )
        )
    ).scalars().all()
    for reminder in due:
        reminder.last_done = day
        if reminder.repeat_months:
            # Seasonal: the same time next year, not counted from today.
            while reminder.due_date <= day + timedelta(days=31):
                reminder.due_date = add_months(reminder.due_date, reminder.repeat_months)
        else:
            await db.delete(reminder)
    await db.commit()
    return await list_tyres(vehicle.id, user, db)


# --- Documents ------------------------------------------------------------------------------


async def _documents_may_see(db: AsyncSession, user: User, doc: Document) -> bool:
    from app.routers.documents import may_see

    return "documents" in user.apps and await may_see(db, user, doc)


@router.get("/{vehicle_id}/documents", response_model=list[VehicleDocument])
async def vehicle_documents(vehicle_id: uuid.UUID, user: CurrentUser, db: DB) -> list[VehicleDocument]:
    """The vehicle's documents from the Documents app – only those the member may see there."""
    await _get_vehicle(db, user, vehicle_id)
    rows = (await db.execute(select(Document).where(Document.vehicle_id == vehicle_id).order_by(Document.title))).scalars().all()
    return [VehicleDocument(id=d.id, title=d.title, kind=d.kind, expiry_date=d.expiry_date) for d in rows if await _documents_may_see(db, user, d)]


@router.put("/{vehicle_id}/documents/{document_id}", response_model=list[VehicleDocument])
async def link_document(vehicle_id: uuid.UUID, document_id: uuid.UUID, user: CurrentUser, db: DB) -> list[VehicleDocument]:
    await _get_vehicle(db, user, vehicle_id)
    doc = await db.get(Document, document_id)
    if doc is None or not await _documents_may_see(db, user, doc):
        raise HTTPException(status_code=404, detail="Document not found")
    doc.vehicle_id = vehicle_id
    await db.commit()
    return await vehicle_documents(vehicle_id, user, db)


@router.delete("/{vehicle_id}/documents/{document_id}", response_model=list[VehicleDocument])
async def unlink_document(vehicle_id: uuid.UUID, document_id: uuid.UUID, user: CurrentUser, db: DB) -> list[VehicleDocument]:
    await _get_vehicle(db, user, vehicle_id)
    doc = await db.get(Document, document_id)
    if doc is None or doc.vehicle_id != vehicle_id or not await _documents_may_see(db, user, doc):
        raise HTTPException(status_code=404, detail="Document not found")
    doc.vehicle_id = None
    await db.commit()
    return await vehicle_documents(vehicle_id, user, db)


# --- The meter from Home Assistant ----------------------------------------------------------


def meter_value(state: dict, meter: str) -> int | None:
    """A sensor's state as whole km or hours (miles and minutes converted)."""
    try:
        value = float(state.get("state"))
    except (TypeError, ValueError):
        return None
    unit = str((state.get("attributes") or {}).get("unit_of_measurement") or "").lower()
    if meter == "km":
        value *= {"mi": 1.609344, "m": 0.001, "mil": 10}.get(unit, 1)
    elif meter == "hours":
        value /= {"min": 60, "s": 3600}.get(unit, 1)
    return int(round(value)) if value >= 0 else None


async def read_ha_meter(db: AsyncSession, vehicle: Vehicle, today: date) -> int | None:
    """Reads the vehicle's meter from the family's own Home Assistant (read only) and keeps one
    reading a day. Returns the new value, or None."""
    if not vehicle.ha_meter_entity or vehicle.meter == "none":
        return None
    conn = await smarthome_conn.primary(db, vehicle.family_id)
    if conn is None:
        return None
    value = meter_value(await ha.get_state(conn.base_url, decrypt_token(conn.token_encrypted), vehicle.ha_meter_entity), vehicle.meter)
    if value is None or (vehicle.mileage is not None and value <= vehicle.mileage):
        return None
    row = (
        await db.execute(select(VehicleMileage).where(VehicleMileage.vehicle_id == vehicle.id, VehicleMileage.reading_date == today, VehicleMileage.expense_id.is_(None)))
    ).scalars().first()
    if row is None:
        db.add(VehicleMileage(family_id=vehicle.family_id, vehicle_id=vehicle.id, reading_date=today, mileage=value))
    else:
        row.mileage = value
    vehicle.mileage = value
    await db.commit()
    await check_mileage_reminders(db, vehicle)
    return value


async def run_vehicle_meters(db: AsyncSession, now: datetime | None = None) -> int:
    """Every half hour: vehicles with a Home Assistant meter sensor."""
    now = now or datetime.now(timezone.utc)
    if now.minute % 30:
        return 0
    read = 0
    for vehicle in (await db.execute(select(Vehicle).where(Vehicle.ha_meter_entity.is_not(None)))).scalars().all():
        try:
            read += await read_ha_meter(db, vehicle, now.date()) is not None
        except Exception:
            await db.rollback()
    return read


@router.post("/{vehicle_id}/meter/read", response_model=VehicleOut)
async def read_meter_now(vehicle_id: uuid.UUID, user: CurrentUser, db: DB) -> Vehicle:
    """Read the Home Assistant sensor now (when it was just set up)."""
    vehicle = await _get_vehicle(db, user, vehicle_id)
    if not vehicle.ha_meter_entity:
        raise HTTPException(status_code=422, detail="Choose the Home Assistant sensor first")
    try:
        await read_ha_meter(db, vehicle, date.today())
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Home Assistant: {exc}") from exc
    await db.refresh(vehicle)
    return vehicle

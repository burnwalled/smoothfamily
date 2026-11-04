"""Homes (2.6.5): an overview of each home, maintenance that comes back, costs, projects, the
things in the home, energy and documents.

Each home gets a card with what matters now: the maintenance that is due (sweeping the chimney,
the gutters, the filters, the smoke alarm …, suggested for the kind of home), this year's costs
against last year, the energy use against last year, and the open projects' budget against what
has been spent. Maintenance can become a task for someone in the family; when the task is done, so
is the maintenance. Meters can be read from Home Assistant sensors (read only), and a receipt or an
invoice can be read by the local AI (routers/ai.py).
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

from app.deps import DB, CurrentUser, require_app
from app.services import smarthome_conn
from app.models import (
    Document,
    Family,
    MediaItem,
    MediaLink,
    Property,
    PropertyExpense,
    PropertyItem,
    PropertyMeter,
    PropertyProject,
    PropertyRecurringCost,
    PropertyReminder,
    SmarthomeConnection,
    Task,
    TaskCompletion,
    User,
    UtilityReading,
)
from app.routers.vehicles import add_months
from app.services import homeassistant as ha
from app.services.crypto import decrypt_token
from app.services.notify import notify
from app.services.storage import get_storage

router = APIRouter(prefix="/api/property", tags=["property"], dependencies=[require_app("property")])


Dwelling = Literal["villa", "rowhouse", "apartment", "cabin", "farm", "other"]
ReminderKind = Literal["maintenance", "safety", "inspection", "season", "insurance", "warranty", "other"]
MeterKind = Literal["electricity", "water", "heating", "gas", "other"]
CATEGORY = r"^(maintenance|renovation|repair|tax|insurance|utility|loan|other)$"


class PropertyIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    kind: str = Field(default="primary", pattern=r"^(primary|secondary|cabin|rental|other)$")
    dwelling: Dwelling = "villa"
    address: str | None = Field(default=None, max_length=300)
    built_year: int | None = Field(default=None, ge=1000, le=3000)
    area_m2: float | None = Field(default=None, gt=0, le=100_000)
    purchase_date: date | None = None
    purchase_price: float | None = Field(default=None, ge=0)
    notes: str | None = None


class PropertyOut(BaseModel):
    id: uuid.UUID
    name: str
    kind: str
    dwelling: str = "villa"
    address: str | None
    built_year: int | None = None
    area_m2: float | None = None
    purchase_date: date | None = None
    purchase_price: float | None = None
    notes: str | None


class ProjectIn(BaseModel):
    property_id: uuid.UUID
    name: str = Field(min_length=1, max_length=200)
    status: str = Field(default="planned", pattern=r"^(planned|active|done|paused)$")
    budget: float | None = None
    started_at: date | None = None
    finished_at: date | None = None
    notes: str | None = None


class ProjectOut(BaseModel):
    id: uuid.UUID
    property_id: uuid.UUID
    name: str
    status: str
    budget: float | None
    started_at: date | None
    finished_at: date | None
    notes: str | None = None
    # What has been spent on it so far.
    spent: float = 0


class ExpenseIn(BaseModel):
    property_id: uuid.UUID
    project_id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=200)
    amount: float = Field(gt=0)
    expense_date: date
    category: str = Field(default="other", pattern=CATEGORY)
    receipt_media_id: uuid.UUID | None = None


class ExpenseOut(BaseModel):
    id: uuid.UUID
    property_id: uuid.UUID
    project_id: uuid.UUID | None
    name: str
    amount: float
    expense_date: date
    category: str
    receipt_media_id: uuid.UUID | None


class UtilityIn(BaseModel):
    property_id: uuid.UUID
    kind: str = Field(pattern=r"^(electricity|water|heating|gas|other)$")
    reading_date: date
    value: float
    unit: str = Field(min_length=1, max_length=10)


class UtilityOut(BaseModel):
    id: uuid.UUID
    property_id: uuid.UUID
    kind: str
    reading_date: date
    value: float
    unit: str


class RecurringCostIn(BaseModel):
    property_id: uuid.UUID
    kind: str = Field(min_length=1, max_length=30)
    amount: float = Field(gt=0)
    period: str = Field(pattern=r"^(monthly|quarterly|yearly)$")
    note: str | None = None


class RecurringCostOut(BaseModel):
    id: uuid.UUID
    property_id: uuid.UUID
    kind: str
    amount: float
    period: str
    note: str | None


class MediaLinkIn(BaseModel):
    media_id: uuid.UUID
    target_type: str = Field(pattern=r"^(property|project|expense)$")
    target_id: uuid.UUID


class MediaLinkOut(BaseModel):
    id: uuid.UUID
    media_id: uuid.UUID
    target_type: str
    target_id: uuid.UUID


class PropertySummary(BaseModel):
    total_expenses: float
    project_budget_total: float
    recurring_monthly_estimate: float
    open_projects: int


def _to_float(v: Decimal | float | int | None) -> float:
    if v is None:
        return 0.0
    return float(v)


async def _get_property_for_family(db, family_id: uuid.UUID, property_id: uuid.UUID) -> Property:
    prop = await db.get(Property, property_id)
    if prop is None or prop.family_id != family_id:
        raise HTTPException(status_code=404, detail="Property not found")
    return prop


async def _get_project_for_family(db, family_id: uuid.UUID, project_id: uuid.UUID) -> PropertyProject:
    project = await db.get(PropertyProject, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    prop = await db.get(Property, project.property_id)
    if prop is None or prop.family_id != family_id:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


async def _validate_receipt(db, family_id: uuid.UUID, receipt_media_id: uuid.UUID | None) -> None:
    if receipt_media_id is None:
        return
    media = await db.get(MediaItem, receipt_media_id)
    if media is None or media.family_id != family_id:
        raise HTTPException(status_code=404, detail="Receipt media not found")


@router.get("/properties", response_model=list[PropertyOut])
async def list_properties(user: CurrentUser, db: DB) -> list[Property]:
    rows = await db.execute(select(Property).where(Property.family_id == user.family_id).order_by(Property.created_at.desc()))
    return list(rows.scalars().all())


@router.post("/properties", response_model=PropertyOut, status_code=status.HTTP_201_CREATED)
async def create_property(payload: PropertyIn, user: CurrentUser, db: DB) -> Property:
    row = Property(family_id=user.family_id, **payload.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.patch("/properties/{property_id}", response_model=PropertyOut)
async def update_property(property_id: uuid.UUID, payload: PropertyIn, user: CurrentUser, db: DB) -> Property:
    row = await _get_property_for_family(db, user.family_id, property_id)
    for field, value in payload.model_dump().items():
        setattr(row, field, value)
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/properties/{property_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_property(property_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    """With everything that belongs to it; its documents stay in Documents."""
    row = await _get_property_for_family(db, user.family_id, property_id)
    for doc in (await db.execute(select(Document).where(Document.property_id == row.id))).scalars().all():
        doc.property_id = None
    for reminder in (await db.execute(select(PropertyReminder).where(PropertyReminder.property_id == row.id))).scalars().all():
        await _drop_task(db, reminder)
    for model in (PropertyReminder, PropertyItem, PropertyMeter, UtilityReading, PropertyRecurringCost, PropertyExpense, PropertyProject):
        await db.execute(delete(model).where(model.property_id == row.id))
    await db.delete(row)
    await db.commit()


async def _spent(db: AsyncSession, project_ids: list[uuid.UUID]) -> dict[uuid.UUID, float]:
    if not project_ids:
        return {}
    rows = (
        await db.execute(
            select(PropertyExpense.project_id, func.coalesce(func.sum(PropertyExpense.amount), 0)).where(PropertyExpense.project_id.in_(project_ids)).group_by(PropertyExpense.project_id)
        )
    ).all()
    return {pid: _to_float(total) for pid, total in rows}


def _project_out(row: PropertyProject, spent: float) -> ProjectOut:
    return ProjectOut(
        id=row.id, property_id=row.property_id, name=row.name, status=row.status, budget=_to_float(row.budget) if row.budget is not None else None,
        started_at=row.started_at, finished_at=row.finished_at, notes=row.notes, spent=round(spent, 2),
    )


@router.get("/projects", response_model=list[ProjectOut])
async def list_projects(user: CurrentUser, db: DB, property_id: uuid.UUID | None = Query(default=None)) -> list[ProjectOut]:
    query = select(PropertyProject).join(Property, Property.id == PropertyProject.property_id).where(Property.family_id == user.family_id)
    if property_id is not None:
        query = query.where(PropertyProject.property_id == property_id)
    rows = list((await db.execute(query.order_by(PropertyProject.created_at.desc()))).scalars().all())
    spent = await _spent(db, [r.id for r in rows])
    return [_project_out(r, spent.get(r.id, 0)) for r in rows]


@router.post("/projects", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
async def create_project(payload: ProjectIn, user: CurrentUser, db: DB) -> ProjectOut:
    await _get_property_for_family(db, user.family_id, payload.property_id)
    row = PropertyProject(**payload.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _project_out(row, 0)


@router.patch("/projects/{project_id}", response_model=ProjectOut)
async def update_project(project_id: uuid.UUID, payload: ProjectIn, user: CurrentUser, db: DB) -> ProjectOut:
    row = await _get_project_for_family(db, user.family_id, project_id)
    await _get_property_for_family(db, user.family_id, payload.property_id)
    for field, value in payload.model_dump().items():
        setattr(row, field, value)
    if row.status == "done" and row.finished_at is None:
        row.finished_at = date.today()
    await db.commit()
    return _project_out(row, (await _spent(db, [row.id])).get(row.id, 0))


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(project_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    """The project goes; its costs stay with the home (no longer tied to a project)."""
    row = await _get_project_for_family(db, user.family_id, project_id)
    for expense in (await db.execute(select(PropertyExpense).where(PropertyExpense.project_id == row.id))).scalars().all():
        expense.project_id = None
    await db.delete(row)
    await db.commit()


@router.get("/expenses", response_model=list[ExpenseOut])
async def list_expenses(
    user: CurrentUser,
    db: DB,
    property_id: uuid.UUID | None = Query(default=None),
    project_id: uuid.UUID | None = Query(default=None),
) -> list[PropertyExpense]:
    query = select(PropertyExpense).where(PropertyExpense.family_id == user.family_id)
    if property_id is not None:
        query = query.where(PropertyExpense.property_id == property_id)
    if project_id is not None:
        query = query.where(PropertyExpense.project_id == project_id)
    rows = await db.execute(query.order_by(PropertyExpense.expense_date.desc(), PropertyExpense.created_at.desc()))
    return list(rows.scalars().all())


async def _check_expense(db: AsyncSession, user: User, payload: ExpenseIn) -> None:
    await _get_property_for_family(db, user.family_id, payload.property_id)
    if payload.project_id is not None:
        project = await _get_project_for_family(db, user.family_id, payload.project_id)
        if project.property_id != payload.property_id:
            raise HTTPException(status_code=422, detail="project_id does not belong to property_id")
    await _validate_receipt(db, user.family_id, payload.receipt_media_id)


async def add_expense(db: AsyncSession, user: User, payload: ExpenseIn) -> PropertyExpense:
    """Also used by the local AI when a read receipt or invoice is put in."""
    await _check_expense(db, user, payload)
    row = PropertyExpense(family_id=user.family_id, **payload.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.post("/expenses", response_model=ExpenseOut, status_code=status.HTTP_201_CREATED)
async def create_expense(payload: ExpenseIn, user: CurrentUser, db: DB) -> PropertyExpense:
    return await add_expense(db, user, payload)


async def _own_expense(db: AsyncSession, user: User, expense_id: uuid.UUID) -> PropertyExpense:
    row = await db.get(PropertyExpense, expense_id)
    if row is None or row.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Expense not found")
    return row


@router.patch("/expenses/{expense_id}", response_model=ExpenseOut)
async def update_expense(expense_id: uuid.UUID, payload: ExpenseIn, user: CurrentUser, db: DB) -> PropertyExpense:
    row = await _own_expense(db, user, expense_id)
    await _check_expense(db, user, payload)
    for field, value in payload.model_dump().items():
        setattr(row, field, value)
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/expenses/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expense(expense_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    await db.delete(await _own_expense(db, user, expense_id))
    await db.commit()


@router.get("/utility-readings", response_model=list[UtilityOut])
async def list_utilities(user: CurrentUser, db: DB, property_id: uuid.UUID | None = Query(default=None)) -> list[UtilityReading]:
    query = select(UtilityReading).join(Property, Property.id == UtilityReading.property_id).where(Property.family_id == user.family_id)
    if property_id is not None:
        query = query.where(UtilityReading.property_id == property_id)
    rows = await db.execute(query.order_by(UtilityReading.reading_date.desc(), UtilityReading.created_at.desc()))
    return list(rows.scalars().all())


@router.post("/utility-readings", response_model=UtilityOut, status_code=status.HTTP_201_CREATED)
async def create_utility(payload: UtilityIn, user: CurrentUser, db: DB) -> UtilityReading:
    await _get_property_for_family(db, user.family_id, payload.property_id)
    row = UtilityReading(**payload.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.get("/recurring-costs", response_model=list[RecurringCostOut])
async def list_recurring_costs(user: CurrentUser, db: DB, property_id: uuid.UUID | None = Query(default=None)) -> list[PropertyRecurringCost]:
    query = select(PropertyRecurringCost).join(Property, Property.id == PropertyRecurringCost.property_id).where(Property.family_id == user.family_id)
    if property_id is not None:
        query = query.where(PropertyRecurringCost.property_id == property_id)
    rows = await db.execute(query.order_by(PropertyRecurringCost.created_at.desc()))
    return list(rows.scalars().all())


@router.post("/recurring-costs", response_model=RecurringCostOut, status_code=status.HTTP_201_CREATED)
async def create_recurring_cost(payload: RecurringCostIn, user: CurrentUser, db: DB) -> PropertyRecurringCost:
    await _get_property_for_family(db, user.family_id, payload.property_id)
    row = PropertyRecurringCost(**payload.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.get("/media-links", response_model=list[MediaLinkOut])
async def list_media_links(
    user: CurrentUser,
    db: DB,
    target_type: str | None = Query(default=None),
    target_id: uuid.UUID | None = Query(default=None),
) -> list[MediaLink]:
    query = select(MediaLink)
    if target_type is not None:
        query = query.where(MediaLink.target_type == target_type)
    if target_id is not None:
        query = query.where(MediaLink.target_id == target_id)
    rows = await db.execute(query.order_by(MediaLink.created_at.desc()))
    all_rows = list(rows.scalars().all())

    filtered: list[MediaLink] = []
    for row in all_rows:
        media = await db.get(MediaItem, row.media_id)
        if media is not None and media.family_id == user.family_id:
            filtered.append(row)
    return filtered


@router.post("/media-links", response_model=MediaLinkOut, status_code=status.HTTP_201_CREATED)
async def create_media_link(payload: MediaLinkIn, user: CurrentUser, db: DB) -> MediaLink:
    media = await db.get(MediaItem, payload.media_id)
    if media is None or media.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Media not found")

    if payload.target_type == "property":
        await _get_property_for_family(db, user.family_id, payload.target_id)
    elif payload.target_type == "project":
        await _get_project_for_family(db, user.family_id, payload.target_id)
    else:
        exp = await db.get(PropertyExpense, payload.target_id)
        if exp is None or exp.family_id != user.family_id:
            raise HTTPException(status_code=404, detail="Expense not found")

    row = MediaLink(**payload.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.get("/summary", response_model=PropertySummary)
async def summary(
    user: CurrentUser,
    db: DB,
    property_id: uuid.UUID | None = Query(default=None),
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
) -> PropertySummary:
    expense_q = select(func.sum(PropertyExpense.amount)).where(PropertyExpense.family_id == user.family_id)
    project_q = select(func.sum(PropertyProject.budget)).join(Property, Property.id == PropertyProject.property_id).where(Property.family_id == user.family_id)
    recurring_q = select(PropertyRecurringCost).join(Property, Property.id == PropertyRecurringCost.property_id).where(Property.family_id == user.family_id)
    open_q = select(func.count(PropertyProject.id)).join(Property, Property.id == PropertyProject.property_id).where(
        Property.family_id == user.family_id,
        PropertyProject.status != "done",
    )

    if property_id is not None:
        await _get_property_for_family(db, user.family_id, property_id)
        expense_q = expense_q.where(PropertyExpense.property_id == property_id)
        project_q = project_q.where(PropertyProject.property_id == property_id)
        recurring_q = recurring_q.where(PropertyRecurringCost.property_id == property_id)
        open_q = open_q.where(PropertyProject.property_id == property_id)
    if from_date is not None:
        expense_q = expense_q.where(PropertyExpense.expense_date >= from_date)
    if to_date is not None:
        expense_q = expense_q.where(PropertyExpense.expense_date <= to_date)

    total_expenses = _to_float((await db.execute(expense_q)).scalar_one())
    budget_total = _to_float((await db.execute(project_q)).scalar_one())
    open_projects = int((await db.execute(open_q)).scalar_one() or 0)

    recurring_rows = (await db.execute(recurring_q)).scalars().all()
    monthly = 0.0
    for row in recurring_rows:
        amount = _to_float(row.amount)
        if row.period == "monthly":
            monthly += amount
        elif row.period == "quarterly":
            monthly += amount / 3.0
        elif row.period == "yearly":
            monthly += amount / 12.0

    return PropertySummary(
        total_expenses=round(total_expenses, 2),
        project_budget_total=round(budget_total, 2),
        recurring_monthly_estimate=round(monthly, 2),
        open_projects=open_projects,
    )


@router.get("/export")
async def export_property_data(user: CurrentUser, db: DB, property_id: uuid.UUID | None = Query(default=None)) -> StreamingResponse:
    if property_id is not None:
        await _get_property_for_family(db, user.family_id, property_id)

    properties_q = select(Property).where(Property.family_id == user.family_id)
    projects_q = select(PropertyProject).join(Property, Property.id == PropertyProject.property_id).where(Property.family_id == user.family_id)
    expenses_q = select(PropertyExpense).where(PropertyExpense.family_id == user.family_id)
    utilities_q = select(UtilityReading).join(Property, Property.id == UtilityReading.property_id).where(Property.family_id == user.family_id)
    recurring_q = select(PropertyRecurringCost).join(Property, Property.id == PropertyRecurringCost.property_id).where(Property.family_id == user.family_id)
    tasks_q = select(Task).where(Task.family_id == user.family_id, Task.property_id.is_not(None), Task.deleted_at.is_(None))

    if property_id is not None:
        properties_q = properties_q.where(Property.id == property_id)
        projects_q = projects_q.where(PropertyProject.property_id == property_id)
        expenses_q = expenses_q.where(PropertyExpense.property_id == property_id)
        utilities_q = utilities_q.where(UtilityReading.property_id == property_id)
        recurring_q = recurring_q.where(PropertyRecurringCost.property_id == property_id)
        tasks_q = tasks_q.where(Task.property_id == property_id)

    properties = list((await db.execute(properties_q)).scalars().all())
    projects = list((await db.execute(projects_q)).scalars().all())
    expenses = list((await db.execute(expenses_q)).scalars().all())
    utilities = list((await db.execute(utilities_q)).scalars().all())
    recurring = list((await db.execute(recurring_q)).scalars().all())
    tasks = list((await db.execute(tasks_q)).scalars().all())

    out = io.BytesIO()
    storage = get_storage()
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        payload = {
            "properties": [
                {"id": str(r.id), "name": r.name, "kind": r.kind, "address": r.address, "notes": r.notes}
                for r in properties
            ],
            "projects": [
                {
                    "id": str(r.id),
                    "property_id": str(r.property_id),
                    "name": r.name,
                    "status": r.status,
                    "budget": _to_float(r.budget),
                    "started_at": r.started_at.isoformat() if r.started_at else None,
                    "finished_at": r.finished_at.isoformat() if r.finished_at else None,
                }
                for r in projects
            ],
            "expenses": [
                {
                    "id": str(r.id),
                    "property_id": str(r.property_id),
                    "project_id": str(r.project_id) if r.project_id else None,
                    "name": r.name,
                    "amount": _to_float(r.amount),
                    "expense_date": r.expense_date.isoformat(),
                    "category": r.category,
                    "receipt_media_id": str(r.receipt_media_id) if r.receipt_media_id else None,
                }
                for r in expenses
            ],
            "utility_readings": [
                {
                    "id": str(r.id),
                    "property_id": str(r.property_id),
                    "kind": r.kind,
                    "reading_date": r.reading_date.isoformat(),
                    "value": _to_float(r.value),
                    "unit": r.unit,
                }
                for r in utilities
            ],
            "property_recurring_costs": [
                {
                    "id": str(r.id),
                    "property_id": str(r.property_id),
                    "kind": r.kind,
                    "amount": _to_float(r.amount),
                    "period": r.period,
                    "note": r.note,
                }
                for r in recurring
            ],
            "tasks": [
                {
                    "id": str(t.id),
                    "title": t.title,
                    "property_id": str(t.property_id) if t.property_id else None,
                    "project_id": str(t.project_id) if t.project_id else None,
                    "recurrence": t.recurrence,
                    "due_date": t.due_date.isoformat() if t.due_date else None,
                }
                for t in tasks
            ],
        }
        zf.writestr("property/data.json", json.dumps(payload, ensure_ascii=False, indent=2))

        csv_buf = io.StringIO()
        writer = csv.DictWriter(csv_buf, fieldnames=["id", "property_id", "project_id", "name", "amount", "expense_date", "category", "receipt_media_id"])
        writer.writeheader()
        for row in payload["expenses"]:
            writer.writerow(row)
        # UTF-8 BOM so Excel shows å/ä/ö correctly instead of guessing a legacy codepage.
        zf.writestr("property/expenses.csv", "\ufeff" + csv_buf.getvalue())

        for expense in expenses:
            if expense.receipt_media_id is None:
                continue
            media = await db.get(MediaItem, expense.receipt_media_id)
            if media is None or media.family_id != user.family_id:
                continue
            try:
                src = storage.open(user.family_id, media.storage_key)
                with open(src, "rb") as fh:
                    zf.writestr(f"property/receipts/{media.id}_{media.original_name}", fh.read())
            except FileNotFoundError:
                continue

    out.seek(0)
    return StreamingResponse(
        out,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="property-export.zip"'},
    )


@router.delete("/recurring-costs/{cost_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_recurring_cost(cost_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    row = await db.get(PropertyRecurringCost, cost_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")
    await _get_property_for_family(db, user.family_id, row.property_id)
    await db.delete(row)
    await db.commit()


@router.delete("/utility-readings/{reading_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_utility(reading_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    row = await db.get(UtilityReading, reading_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")
    await _get_property_for_family(db, user.family_id, row.property_id)
    await db.delete(row)
    await db.commit()


# --- Maintenance ----------------------------------------------------------------------------


class ReminderIn(BaseModel):
    property_id: uuid.UUID
    kind: ReminderKind = "maintenance"
    title: str = Field(min_length=1, max_length=120)
    due_date: date
    repeat_months: int | None = Field(default=None, ge=1, le=240)
    remind_days: int = Field(default=14, ge=0, le=120)
    item_id: uuid.UUID | None = None
    # Make it a task for this member when it is time.
    assignee_id: uuid.UUID | None = None
    task_points: int = Field(default=10, ge=1, le=1000)


class ReminderOut(BaseModel):
    id: uuid.UUID
    property_id: uuid.UUID
    kind: str
    title: str
    due_date: date
    repeat_months: int | None
    remind_days: int
    last_done: date | None
    item_id: uuid.UUID | None
    assignee_id: uuid.UUID | None
    task_points: int
    task_id: uuid.UUID | None
    # overdue | soon | ok
    status: str
    days_left: int


class DoneIn(BaseModel):
    done_date: date | None = None


def reminder_out(row: PropertyReminder, today: date) -> ReminderOut:
    days_left = (row.due_date - today).days
    state = "overdue" if days_left < 0 else "soon" if days_left <= row.remind_days else "ok"
    return ReminderOut(
        id=row.id, property_id=row.property_id, kind=row.kind, title=row.title, due_date=row.due_date, repeat_months=row.repeat_months,
        remind_days=row.remind_days, last_done=row.last_done, item_id=row.item_id, assignee_id=row.assignee_id, task_points=row.task_points,
        task_id=row.task_id, status=state, days_left=days_left,
    )


async def _check_reminder(db: AsyncSession, user: User, payload: ReminderIn) -> None:
    await _get_property_for_family(db, user.family_id, payload.property_id)
    if payload.item_id:
        item = await db.get(PropertyItem, payload.item_id)
        if item is None or item.property_id != payload.property_id:
            raise HTTPException(status_code=404, detail="Item not found")
    if payload.assignee_id:
        member = await db.get(User, payload.assignee_id)
        if member is None or member.family_id != user.family_id:
            raise HTTPException(status_code=404, detail="Member not found")


async def _reminder(db: AsyncSession, user: User, reminder_id: uuid.UUID) -> PropertyReminder:
    row = await db.get(PropertyReminder, reminder_id)
    if row is None or row.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return row


@router.get("/reminders", response_model=list[ReminderOut])
async def list_reminders(user: CurrentUser, db: DB, property_id: uuid.UUID | None = None) -> list[ReminderOut]:
    query = select(PropertyReminder).where(PropertyReminder.family_id == user.family_id)
    if property_id:
        query = query.where(PropertyReminder.property_id == property_id)
    today = date.today()
    return [reminder_out(r, today) for r in (await db.execute(query.order_by(PropertyReminder.due_date))).scalars().all()]


@router.post("/reminders", response_model=ReminderOut, status_code=status.HTTP_201_CREATED)
async def create_reminder(payload: ReminderIn, user: CurrentUser, db: DB) -> ReminderOut:
    await _check_reminder(db, user, payload)
    row = PropertyReminder(family_id=user.family_id, **payload.model_dump())
    row.title = row.title.strip()
    db.add(row)
    await db.commit()
    await make_due_task(db, row, date.today())
    return reminder_out(row, date.today())


@router.patch("/reminders/{reminder_id}", response_model=ReminderOut)
async def update_reminder(reminder_id: uuid.UUID, payload: ReminderIn, user: CurrentUser, db: DB) -> ReminderOut:
    row = await _reminder(db, user, reminder_id)
    await _check_reminder(db, user, payload)
    if row.due_date != payload.due_date:
        row.reminded_for = None
    for field, value in payload.model_dump().items():
        setattr(row, field, value.strip() if field == "title" else value)
    await db.commit()
    await make_due_task(db, row, date.today())
    return reminder_out(row, date.today())


@router.delete("/reminders/{reminder_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_reminder(reminder_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    row = await _reminder(db, user, reminder_id)
    await _drop_task(db, row)
    await db.delete(row)
    await db.commit()


async def _drop_task(db: AsyncSession, row: PropertyReminder) -> None:
    """A task made for it that hasn't been done goes away with it."""
    if row.task_id:
        task = await db.get(Task, row.task_id)
        if task is not None and task.active:
            task.active = False
        row.task_id = None


async def mark_done(db: AsyncSession, row: PropertyReminder, day: date) -> PropertyReminder | None:
    """Done: the next one from when it was done – or, if it doesn't repeat, it goes."""
    await _drop_task(db, row)
    if not row.repeat_months:
        await db.delete(row)
        await db.commit()
        return None
    row.last_done = day
    row.due_date = add_months(day, row.repeat_months)
    row.reminded_for = None
    await db.commit()
    return row


@router.post("/reminders/{reminder_id}/done", response_model=ReminderOut | None)
async def reminder_done(reminder_id: uuid.UUID, payload: DoneIn, user: CurrentUser, db: DB) -> ReminderOut | None:
    row = await mark_done(db, await _reminder(db, user, reminder_id), payload.done_date or date.today())
    return reminder_out(row, date.today()) if row else None


_TASK = {"en": "Maintenance: {title}", "sv": "Underhåll: {title}", "nb": "Vedlikehold: {title}", "da": "Vedligehold: {title}", "fi": "Huolto: {title}"}


async def make_due_task(db: AsyncSession, row: PropertyReminder, today: date) -> Task | None:
    """When it is time (within its remind days), a one-off task for the chosen member, once."""
    if row.assignee_id is None or row.task_id is not None or (row.due_date - today).days > row.remind_days:
        return None
    member = await db.get(User, row.assignee_id)
    if member is None:
        return None
    task = Task(
        family_id=row.family_id, created_by=member.id, assignee_id=member.id, title=_TASK.get(member.language or "en", _TASK["en"]).format(title=row.title)[:200],
        points=row.task_points, recurrence="none", due_date=row.due_date, property_id=row.property_id, weekdays=[],
    )
    db.add(task)
    await db.flush()
    row.task_id = task.id
    await db.commit()
    return task


async def _task_done(db: AsyncSession, row: PropertyReminder) -> date | None:
    """The day its task was done (approved), if it has been."""
    if row.task_id is None:
        return None
    done = (
        await db.execute(
            select(TaskCompletion.completed_date).where(TaskCompletion.task_id == row.task_id, TaskCompletion.status == "approved").order_by(TaskCompletion.completed_date.desc())
        )
    ).scalars().first()
    return done


_TEXT = {
    "en": ("{title} – {home}", "Due {date}", "Overdue since {date}"),
    "sv": ("{title} – {home}", "Senast {date}", "Försenad sedan {date}"),
    "nb": ("{title} – {home}", "Senest {date}", "Forsinket siden {date}"),
    "da": ("{title} – {home}", "Senest {date}", "Forsinket siden {date}"),
    "fi": ("{title} – {home}", "Viimeistään {date}", "Myöhässä {date} alkaen"),
}


async def run_property_reminders(db: AsyncSession, now: datetime | None = None) -> int:
    """From 07 UTC: tasks done mark their maintenance done; due ones become tasks; the adults with
    the app are told `remind_days` before, once per due date."""
    now = now or datetime.now(timezone.utc)
    if now.hour < 7:
        return 0
    today = now.date()
    sent = 0
    for row in (await db.execute(select(PropertyReminder))).scalars().all():
        done = await _task_done(db, row)
        if done:
            await mark_done(db, row, done)
            continue
        await make_due_task(db, row, today)
        if row.reminded_for == row.due_date or row.due_date - timedelta(days=row.remind_days) > today:
            continue
        home = await db.get(Property, row.property_id)
        row.reminded_for = row.due_date
        await db.commit()
        members = (await db.execute(select(User).where(User.family_id == row.family_id, User.role.in_(["admin", "adult"])))).scalars().all()
        for member in members:
            if "property" not in member.apps:
                continue
            title, due, late = _TEXT.get(member.language or "en", _TEXT["en"])
            body = (late if row.due_date < today else due).format(date=row.due_date.isoformat())
            await notify(db, member, {"title": title.format(title=row.title, home=home.name if home else ""), "body": body, "route": "/property", "kind": "property_reminder"})
            sent += 1
    return sent


# --- Things in the home ---------------------------------------------------------------------


class ItemIn(BaseModel):
    property_id: uuid.UUID
    name: str = Field(min_length=1, max_length=120)
    room: str = Field(default="", max_length=60)
    brand: str = Field(default="", max_length=80)
    model: str = Field(default="", max_length=120)
    serial: str = Field(default="", max_length=80)
    bought: date | None = None
    price: float | None = Field(default=None, ge=0)
    warranty_until: date | None = None
    manual_url: str = Field(default="", max_length=500, pattern=r"^(|https?://.+)$")
    receipt_media_id: uuid.UUID | None = None
    notes: str | None = None
    # Serviced every … months (a heat pump, a ventilation unit): a maintenance reminder for it.
    service_months: int | None = Field(default=None, ge=1, le=120)


class ItemOut(BaseModel):
    id: uuid.UUID
    property_id: uuid.UUID
    name: str
    room: str
    brand: str
    model: str
    serial: str
    bought: date | None
    price: float | None
    warranty_until: date | None
    manual_url: str
    receipt_media_id: uuid.UUID | None
    notes: str | None
    # under | ending (within 60 days) | over | none
    warranty: str
    service_months: int | None = None


_WARRANTY = {"en": "Warranty ends: {name}", "sv": "Garantin går ut: {name}", "nb": "Garantien utløper: {name}", "da": "Garantien udløber: {name}", "fi": "Takuu päättyy: {name}"}
_SERVICE = {"en": "Service: {name}", "sv": "Service: {name}", "nb": "Service: {name}", "da": "Service: {name}", "fi": "Huolto: {name}"}


def item_out(row: PropertyItem, today: date) -> ItemOut:
    if row.warranty_until is None:
        warranty = "none"
    elif row.warranty_until < today:
        warranty = "over"
    else:
        warranty = "ending" if (row.warranty_until - today).days <= 60 else "under"
    return ItemOut(
        id=row.id, property_id=row.property_id, name=row.name, room=row.room, brand=row.brand, model=row.model, serial=row.serial,
        bought=row.bought, price=_to_float(row.price) if row.price is not None else None, warranty_until=row.warranty_until,
        manual_url=row.manual_url, receipt_media_id=row.receipt_media_id, notes=row.notes, warranty=warranty,
    )


async def _item_reminders(db: AsyncSession, user: User, row: PropertyItem, service_months: int | None) -> None:
    """The warranty's end and the service become maintenance reminders for the item."""
    lang = user.language or "en"
    existing = {r.kind: r for r in (await db.execute(select(PropertyReminder).where(PropertyReminder.item_id == row.id))).scalars().all()}
    warranty = existing.get("warranty")
    if row.warranty_until and row.warranty_until >= date.today():
        if warranty is None:
            warranty = PropertyReminder(family_id=row.family_id, property_id=row.property_id, kind="warranty", item_id=row.id, remind_days=30)
            db.add(warranty)
        warranty.title = _WARRANTY.get(lang, _WARRANTY["en"]).format(name=row.name)[:120]
        if warranty.due_date != row.warranty_until:
            warranty.due_date, warranty.reminded_for = row.warranty_until, None
    elif warranty is not None:
        await db.delete(warranty)
    service = existing.get("maintenance")
    if service_months:
        if service is None:
            service = PropertyReminder(
                family_id=row.family_id, property_id=row.property_id, kind="maintenance", item_id=row.id,
                due_date=add_months(row.bought or date.today(), service_months), remind_days=14,
            )
            while service.due_date < date.today():
                service.due_date = add_months(service.due_date, service_months)
            db.add(service)
        service.title = _SERVICE.get(lang, _SERVICE["en"]).format(name=row.name)[:120]
        service.repeat_months = service_months
    elif service is not None:
        await db.delete(service)


async def _item(db: AsyncSession, user: User, item_id: uuid.UUID) -> PropertyItem:
    row = await db.get(PropertyItem, item_id)
    if row is None or row.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Item not found")
    return row


async def _with_service(db: AsyncSession, rows: list[ItemOut]) -> list[ItemOut]:
    ids = [r.id for r in rows]
    services = {
        r.item_id: r.repeat_months
        for r in (await db.execute(select(PropertyReminder).where(PropertyReminder.item_id.in_(ids), PropertyReminder.kind == "maintenance"))).scalars().all()
    } if ids else {}
    for row in rows:
        row.service_months = services.get(row.id)
    return rows


@router.get("/items", response_model=list[ItemOut])
async def list_items(user: CurrentUser, db: DB, property_id: uuid.UUID | None = None) -> list[ItemOut]:
    query = select(PropertyItem).where(PropertyItem.family_id == user.family_id)
    if property_id:
        query = query.where(PropertyItem.property_id == property_id)
    today = date.today()
    rows = (await db.execute(query.order_by(PropertyItem.room, PropertyItem.name))).scalars().all()
    return await _with_service(db, [item_out(r, today) for r in rows])


@router.post("/items", response_model=ItemOut, status_code=status.HTTP_201_CREATED)
async def create_item(payload: ItemIn, user: CurrentUser, db: DB) -> ItemOut:
    await _get_property_for_family(db, user.family_id, payload.property_id)
    await _validate_receipt(db, user.family_id, payload.receipt_media_id)
    row = PropertyItem(family_id=user.family_id, **payload.model_dump(exclude={"service_months"}))
    db.add(row)
    await db.flush()
    await _item_reminders(db, user, row, payload.service_months)
    await db.commit()
    return (await _with_service(db, [item_out(row, date.today())]))[0]


@router.patch("/items/{item_id}", response_model=ItemOut)
async def update_item(item_id: uuid.UUID, payload: ItemIn, user: CurrentUser, db: DB) -> ItemOut:
    row = await _item(db, user, item_id)
    await _get_property_for_family(db, user.family_id, payload.property_id)
    await _validate_receipt(db, user.family_id, payload.receipt_media_id)
    for field, value in payload.model_dump(exclude={"service_months"}).items():
        setattr(row, field, value)
    await _item_reminders(db, user, row, payload.service_months)
    await db.commit()
    return (await _with_service(db, [item_out(row, date.today())]))[0]


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(item_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    row = await _item(db, user, item_id)
    await db.execute(delete(PropertyReminder).where(PropertyReminder.item_id == row.id))
    await db.delete(row)
    await db.commit()


# --- Energy -----------------------------------------------------------------------------------


class MeterIn(BaseModel):
    property_id: uuid.UUID
    kind: MeterKind
    unit: str = Field(min_length=1, max_length=10)
    ha_entity: str | None = Field(default=None, max_length=200, pattern=r"^[a-z_]+\.[a-z0-9_]+$")


class MeterOut(BaseModel):
    id: uuid.UUID
    property_id: uuid.UUID
    kind: str
    unit: str
    ha_entity: str | None


class MonthUse(BaseModel):
    month: str  # YYYY-MM
    use: float


class EnergyOut(BaseModel):
    kind: str
    unit: str
    months: list[MonthUse]
    this_year: float
    last_year_to_date: float
    last_reading: float | None


def monthly_use(readings: list[tuple[date, float]]) -> dict[str, float]:
    """A meter's total over time → use per month (the rise between readings, spread over the days
    between them so a reading late in a month doesn't put it all in the next one)."""
    rows = sorted(readings)
    out: dict[str, float] = {}
    for (d0, v0), (d1, v1) in zip(rows, rows[1:]):
        days = (d1 - d0).days
        rise = v1 - v0
        if days <= 0 or rise < 0:  # a new meter, or the same day twice
            continue
        per_day = rise / days
        day = d0
        while day < d1:
            key = day.strftime("%Y-%m")
            out[key] = out.get(key, 0) + per_day
            day += timedelta(days=1)
    return {k: round(v, 1) for k, v in out.items()}


@router.get("/meters", response_model=list[MeterOut])
async def list_meters(user: CurrentUser, db: DB, property_id: uuid.UUID) -> list[MeterOut]:
    await _get_property_for_family(db, user.family_id, property_id)
    rows = (await db.execute(select(PropertyMeter).where(PropertyMeter.property_id == property_id).order_by(PropertyMeter.created_at))).scalars().all()
    return [MeterOut(id=m.id, property_id=m.property_id, kind=m.kind, unit=m.unit, ha_entity=m.ha_entity) for m in rows]


@router.post("/meters", response_model=MeterOut, status_code=status.HTTP_201_CREATED)
async def save_meter(payload: MeterIn, user: CurrentUser, db: DB) -> MeterOut:
    """One meter per kind and home: saving again changes it."""
    await _get_property_for_family(db, user.family_id, payload.property_id)
    row = (await db.execute(select(PropertyMeter).where(PropertyMeter.property_id == payload.property_id, PropertyMeter.kind == payload.kind))).scalar_one_or_none()
    if row is None:
        row = PropertyMeter(family_id=user.family_id, property_id=payload.property_id, kind=payload.kind)
        db.add(row)
    row.unit, row.ha_entity = payload.unit.strip(), payload.ha_entity
    await db.commit()
    return MeterOut(id=row.id, property_id=row.property_id, kind=row.kind, unit=row.unit, ha_entity=row.ha_entity)


@router.delete("/meters/{meter_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_meter(meter_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    row = await db.get(PropertyMeter, meter_id)
    if row is None or row.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Meter not found")
    await db.delete(row)
    await db.commit()


async def energy(db: AsyncSession, property_id: uuid.UUID, today: date) -> list[EnergyOut]:
    readings = (await db.execute(select(UtilityReading).where(UtilityReading.property_id == property_id))).scalars().all()
    by_kind: dict[str, list[UtilityReading]] = {}
    for r in readings:
        by_kind.setdefault(r.kind, []).append(r)
    out = []
    for kind, rows in sorted(by_kind.items()):
        months = monthly_use([(r.reading_date, _to_float(r.value)) for r in rows])
        this_year = sum(v for k, v in months.items() if k.startswith(f"{today.year}-"))
        last_year = sum(v for k, v in months.items() if k.startswith(f"{today.year - 1}-") and k <= f"{today.year - 1}-{today.month:02d}")
        latest = max(rows, key=lambda r: r.reading_date)
        out.append(
            EnergyOut(
                kind=kind, unit=latest.unit, months=[MonthUse(month=k, use=v) for k, v in sorted(months.items())[-24:]],
                this_year=round(this_year, 1), last_year_to_date=round(last_year, 1), last_reading=_to_float(latest.value),
            )
        )
    return out


@router.get("/{property_id}/energy", response_model=list[EnergyOut])
async def property_energy(property_id: uuid.UUID, user: CurrentUser, db: DB) -> list[EnergyOut]:
    await _get_property_for_family(db, user.family_id, property_id)
    return await energy(db, property_id, date.today())


async def read_ha_meters(db: AsyncSession, meter: PropertyMeter, today: date) -> float | None:
    """The meter's total from the family's own Home Assistant (read only); one reading a day."""
    if not meter.ha_entity:
        return None
    conn = await smarthome_conn.primary(db, meter.family_id)
    if conn is None:
        return None
    state = await ha.get_state(conn.base_url, decrypt_token(conn.token_encrypted), meter.ha_entity)
    try:
        value = float(state.get("state"))
    except (TypeError, ValueError):
        return None
    unit = str((state.get("attributes") or {}).get("unit_of_measurement") or "")
    if unit.lower() == "wh" and meter.unit.lower() == "kwh":
        value /= 1000
    if unit.lower() == "l" and meter.unit.lower() == "m³":
        value /= 1000
    row = (
        await db.execute(select(UtilityReading).where(UtilityReading.property_id == meter.property_id, UtilityReading.kind == meter.kind, UtilityReading.reading_date == today))
    ).scalars().first()
    if row is None:
        db.add(UtilityReading(property_id=meter.property_id, kind=meter.kind, reading_date=today, value=value, unit=meter.unit))
    else:
        row.value = value
    await db.commit()
    return value


async def run_property_meters(db: AsyncSession, now: datetime | None = None) -> int:
    """Every half hour: meters with a Home Assistant sensor."""
    now = now or datetime.now(timezone.utc)
    if now.minute % 30:
        return 0
    read = 0
    for meter in (await db.execute(select(PropertyMeter).where(PropertyMeter.ha_entity.is_not(None)))).scalars().all():
        try:
            read += await read_ha_meters(db, meter, now.date()) is not None
        except Exception:
            await db.rollback()
    return read


@router.post("/meters/{meter_id}/read", response_model=list[EnergyOut])
async def read_meter_now(meter_id: uuid.UUID, user: CurrentUser, db: DB) -> list[EnergyOut]:
    meter = await db.get(PropertyMeter, meter_id)
    if meter is None or meter.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Meter not found")
    try:
        await read_ha_meters(db, meter, date.today())
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Home Assistant: {exc}") from exc
    return await energy(db, meter.property_id, date.today())


# --- Documents ------------------------------------------------------------------------------


class PropertyDocument(BaseModel):
    id: uuid.UUID
    title: str
    kind: str
    expiry_date: date | None


async def _may_see_doc(db: AsyncSession, user: User, doc: Document) -> bool:
    from app.routers.documents import may_see

    return "documents" in user.apps and await may_see(db, user, doc)


@router.get("/{property_id}/documents", response_model=list[PropertyDocument])
async def property_documents(property_id: uuid.UUID, user: CurrentUser, db: DB) -> list[PropertyDocument]:
    await _get_property_for_family(db, user.family_id, property_id)
    rows = (await db.execute(select(Document).where(Document.property_id == property_id).order_by(Document.title))).scalars().all()
    return [PropertyDocument(id=d.id, title=d.title, kind=d.kind, expiry_date=d.expiry_date) for d in rows if await _may_see_doc(db, user, d)]


@router.put("/{property_id}/documents/{document_id}", response_model=list[PropertyDocument])
async def link_document(property_id: uuid.UUID, document_id: uuid.UUID, user: CurrentUser, db: DB) -> list[PropertyDocument]:
    await _get_property_for_family(db, user.family_id, property_id)
    doc = await db.get(Document, document_id)
    if doc is None or not await _may_see_doc(db, user, doc):
        raise HTTPException(status_code=404, detail="Document not found")
    doc.property_id = property_id
    await db.commit()
    return await property_documents(property_id, user, db)


@router.delete("/{property_id}/documents/{document_id}", response_model=list[PropertyDocument])
async def unlink_document(property_id: uuid.UUID, document_id: uuid.UUID, user: CurrentUser, db: DB) -> list[PropertyDocument]:
    await _get_property_for_family(db, user.family_id, property_id)
    doc = await db.get(Document, document_id)
    if doc is None or doc.property_id != property_id or not await _may_see_doc(db, user, doc):
        raise HTTPException(status_code=404, detail="Document not found")
    doc.property_id = None
    await db.commit()
    return await property_documents(property_id, user, db)


# --- The overview ---------------------------------------------------------------------------


class HomeCard(BaseModel):
    property: PropertyOut
    reminders: list[ReminderOut]
    cost_this_year: float
    cost_last_year_to_date: float
    by_category: dict[str, float]
    recurring_monthly: float
    projects: list[ProjectOut]
    energy: list[EnergyOut]
    items: int
    warranties_ending: int
    ownership_cost: float | None
    currency: str


PERIOD_MONTHS = {"monthly": 1, "quarterly": 3, "yearly": 12}


@router.get("/overview", response_model=list[HomeCard])
async def overview(user: CurrentUser, db: DB) -> list[HomeCard]:
    today = date.today()
    try:
        same_day = today.replace(year=today.year - 1)
    except ValueError:
        same_day = today - timedelta(days=365)
    family = await db.get(Family, user.family_id)
    homes = (await db.execute(select(Property).where(Property.family_id == user.family_id).order_by(Property.created_at))).scalars().all()
    cards = []
    for home in homes:
        expenses = (await db.execute(select(PropertyExpense).where(PropertyExpense.property_id == home.id))).scalars().all()
        this_year = [e for e in expenses if e.expense_date.year == today.year]
        by_category: dict[str, float] = {}
        for e in this_year:
            by_category[e.category] = round(by_category.get(e.category, 0) + _to_float(e.amount), 2)
        recurring = (await db.execute(select(PropertyRecurringCost).where(PropertyRecurringCost.property_id == home.id))).scalars().all()
        projects = (await db.execute(select(PropertyProject).where(PropertyProject.property_id == home.id, PropertyProject.status != "done").order_by(PropertyProject.created_at))).scalars().all()
        spent = await _spent(db, [p.id for p in projects])
        reminders = (await db.execute(select(PropertyReminder).where(PropertyReminder.property_id == home.id).order_by(PropertyReminder.due_date))).scalars().all()
        items = [item_out(i, today) for i in (await db.execute(select(PropertyItem).where(PropertyItem.property_id == home.id))).scalars().all()]
        total = sum(_to_float(e.amount) for e in expenses)
        cards.append(
            HomeCard(
                property=PropertyOut.model_validate(home, from_attributes=True),
                reminders=[reminder_out(r, today) for r in reminders],
                cost_this_year=round(sum(_to_float(e.amount) for e in this_year), 2),
                cost_last_year_to_date=round(sum(_to_float(e.amount) for e in expenses if e.expense_date.year == today.year - 1 and e.expense_date <= same_day), 2),
                by_category=by_category,
                recurring_monthly=round(sum(_to_float(r.amount) / PERIOD_MONTHS.get(r.period, 1) for r in recurring), 2),
                projects=[_project_out(p, spent.get(p.id, 0)) for p in projects],
                energy=await energy(db, home.id, today),
                items=len(items),
                warranties_ending=sum(1 for i in items if i.warranty == "ending"),
                ownership_cost=round(_to_float(home.purchase_price) + total, 2) if home.purchase_price is not None else None,
                currency=family.currency or "kr",
            )
        )
    return cards

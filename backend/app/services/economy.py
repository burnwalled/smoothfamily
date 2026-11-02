"""The household's economy (2.8.5): what the family spends – and, if they add it, earns – by category,
gathered from what the app already knows, so nothing is entered twice:

- receipts in the vault (by their category; a home's or a vehicle's goes to that home or vehicle),
- each home's expenses and fixed costs (electricity, loan, insurance …),
- each vehicle's expenses,
- trips' expenses,
- entries of its own: the bank import's rows put under a category, incomes, and costs that belong
  nowhere else (a subscription, the phone bill). An entry can be private: only its maker sees it.

A home's costs go under "home:<id>" and a vehicle's under "vehicle:<id>", so the cabin and the house,
the car and the moped are each their own category.
"""
import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    EconomyBudget,
    EconomyEntry,
    Family,
    Property,
    PropertyExpense,
    PropertyRecurringCost,
    Receipt,
    Trip,
    TripExpense,
    User,
    Vehicle,
    VehicleExpense,
)
from app.services.file_vault import may_see_vehicle

OUT = ["food", "housing", "transport", "children", "clothes", "health", "leisure", "electronics", "gifts", "travel", "insurance", "subscriptions", "savings", "other"]
IN = ["salary", "benefits", "other_income"]
# A receipt's category → the economy's.
FROM_RECEIPT = {"food": "food", "home": "housing", "vehicle": "transport", "clothes": "clothes", "children": "children", "health": "health", "leisure": "leisure", "electronics": "electronics", "gifts": "gifts", "travel": "travel", "other": "other"}


def valid_key(key: str, kind: str) -> bool:
    if kind == "in":
        return key in IN
    if key in OUT:
        return True
    prefix, _, rest = key.partition(":")
    if prefix not in ("home", "vehicle"):
        return False
    try:
        uuid.UUID(rest)
    except ValueError:
        return False
    return True


def _months(start: date, period: str, year: int, today: date) -> list[int]:
    """The months of `year` a recurring amount falls in: from its start, up to this month."""
    last = 12 if year < today.year else today.month if year == today.year else 0
    first = 1 if start.year < year else start.month if start.year == year else 13
    months = range(first, last + 1)
    if period == "monthly":
        return list(months)
    if period == "quarterly":
        return [m for m in months if (m - start.month) % 3 == 0]
    if period == "yearly":
        return [m for m in months if m == start.month]
    return [start.month] if start.year == year and first <= start.month <= last else []


async def overview(db: AsyncSession, user: User, year: int) -> dict:
    from app.routers.receipts import _visible as visible_receipts

    today = date.today()
    family = await db.get(Family, user.family_id)
    currency = family.currency or ""
    out: dict[str, list[float]] = {}
    inc: dict[str, list[float]] = {}
    earners: dict[uuid.UUID, float] = {}
    labels: dict[str, str] = {}

    def put(book: dict, key: str, month: int, amount: float) -> None:
        book.setdefault(key, [0.0] * 12)[month - 1] += amount

    homes = {p.id: p for p in (await db.execute(select(Property).where(Property.family_id == user.family_id))).scalars().all()}
    for p in homes.values():
        labels[f"home:{p.id}"] = p.name
    cars = {v.id: v for v in (await db.execute(select(Vehicle).where(Vehicle.family_id == user.family_id))).scalars().all() if may_see_vehicle(v, user)}
    for v in cars.values():
        labels[f"vehicle:{v.id}"] = v.name

    # Homes: expenses and fixed costs.
    expense_photos = set()
    for e in (await db.execute(select(PropertyExpense).where(PropertyExpense.family_id == user.family_id))).scalars().all():
        if e.receipt_media_id:
            expense_photos.add(e.receipt_media_id)
        if e.expense_date.year == year:
            put(out, f"home:{e.property_id}", e.expense_date.month, float(e.amount))
    for c in (await db.execute(select(PropertyRecurringCost).where(PropertyRecurringCost.property_id.in_(list(homes) or [uuid.uuid4()])))).scalars().all():
        for m in _months(c.created_at.date(), c.period, year, today):
            put(out, f"home:{c.property_id}", m, float(c.amount))
    # Vehicles.
    for e in (await db.execute(select(VehicleExpense).where(VehicleExpense.family_id == user.family_id))).scalars().all():
        if e.receipt_media_id:
            expense_photos.add(e.receipt_media_id)
        if e.vehicle_id in cars and e.expense_date.year == year:
            put(out, f"vehicle:{e.vehicle_id}", e.expense_date.month, float(e.amount))
    # Trips, by the month they start.
    for e, trip in (await db.execute(select(TripExpense, Trip).join(Trip, Trip.id == TripExpense.trip_id).where(TripExpense.family_id == user.family_id))).all():
        if trip.start_date.year == year:
            put(out, "travel", trip.start_date.month, float(e.amount))
    # Receipts not already counted as a home's or a vehicle's expense, in the family's own currency.
    for r in await visible_receipts(db, user):
        if r.amount is None or r.purchased_on is None or r.purchased_on.year != year or r.returned_at is not None:
            continue
        if (r.media_id and r.media_id in expense_photos) or (r.currency and r.currency != currency.upper()):
            continue
        key = f"home:{r.property_id}" if r.property_id in homes else f"vehicle:{r.vehicle_id}" if r.vehicle_id in cars else FROM_RECEIPT.get(r.category, "other")
        put(out, key, r.purchased_on.month, float(r.amount))
    # The economy's own entries; a private one only for its maker.
    for e in (await db.execute(select(EconomyEntry).where(EconomyEntry.family_id == user.family_id))).scalars().all():
        if e.private and e.created_by != user.id:
            continue
        book = inc if e.kind == "in" else out
        for m in _months(e.day, e.recurring or "once", year, today) if e.recurring else ([e.day.month] if e.day.year == year else []):
            put(book, e.category, m, float(e.amount))
            if e.kind == "in" and e.created_by:
                earners[e.created_by] = earners.get(e.created_by, 0.0) + float(e.amount)

    budgets = {b.category: float(b.monthly) for b in (await db.execute(select(EconomyBudget).where(EconomyBudget.family_id == user.family_id))).scalars().all()}
    months = [{"month": m + 1, "out": round(sum(v[m] for v in out.values()), 2), "in": round(sum(v[m] for v in inc.values()), 2)} for m in range(12)]

    def rows(book: dict, kind: str) -> list[dict]:
        keys = set(book) | ({k for k in budgets if valid_key(k, "out")} if kind == "out" else set())
        result = []
        for key in keys:
            values = book.get(key, [0.0] * 12)
            if key.partition(":")[0] in ("home", "vehicle") and key not in labels:
                continue  # a home or vehicle gone, or one this member may not see
            result.append({"key": key, "label": labels.get(key), "total": round(sum(values), 2), "months": [round(v, 2) for v in values], "budget": budgets.get(key)})
        return sorted(result, key=lambda r: -r["total"])

    return {
        "year": year,
        "currency": currency,
        "months": months,
        "out": rows(out, "out"),
        "in": rows(inc, "in"),
        "total_out": round(sum(m["out"] for m in months), 2),
        "total_in": round(sum(m["in"] for m in months), 2),
        "earners": [
            {"name": (await db.get(User, uid)).display_name if await db.get(User, uid) else "?", "total": round(total, 2)}
            for uid, total in sorted(earners.items(), key=lambda kv: -kv[1])
        ],
        "homes": [{"key": f"home:{p.id}", "label": p.name} for p in homes.values()],
        "vehicles": [{"key": f"vehicle:{v.id}", "label": v.name} for v in cars.values()],
    }

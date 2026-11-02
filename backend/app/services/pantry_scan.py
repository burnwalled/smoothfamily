"""Scanning groceries into the pantry, and taking stock, with barcodes (#69).

The camera reads one barcode after another into a list on the phone or the kitchen screen; the
list is saved here in one go. The family's own product list remembers what a barcode is the first
time someone names it, so the next scan fills itself in. Open Food Facts is asked only if the
family admin turned it on, and then only the barcode is sent; its categories give a first guess of
where the item is kept and roughly how long it keeps. Whatever the family changes is remembered
and wins over the guess next time.
"""
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Literal

import httpx
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Family, PantryItem, PantryProduct

Place = Literal["freezer", "fridge", "pantry"]
CODE = re.compile(r"^[0-9A-Za-z.\-]{4,32}$")
# EAN-8, UPC-A, EAN-13, GTIN-14: the codes Open Food Facts knows.
FOOD_CODE = re.compile(r"^\d{8,14}$")
OFF_URL = "https://world.openfoodfacts.org/api/v2/product/{code}.json"
# Open Food Facts asks apps to say who they are.
OFF_AGENT = "SmoothFamily/2.5 (self-hosted family app)"


# Open Food Facts category -> (where it is kept, roughly how many days it keeps). The categories are
# written by volunteers and not always right (milk can also be tagged "sodas"), so the first rule
# that matches wins and the perishable ones come first. Only a suggestion – the member changes it.
CATEGORY_RULES: tuple[tuple[str, str, int], ...] = (
    ("en:ice-creams", "freezer", 365),
    ("en:ice-creams-and-sorbets", "freezer", 365),
    ("en:frozen-foods", "freezer", 180),
    ("en:frozen-desserts", "freezer", 180),
    ("en:canned-foods", "pantry", 730),
    ("en:uht-milks", "pantry", 90),
    ("en:minced-meats", "fridge", 2),
    ("en:ground-meats", "fridge", 2),
    ("en:fishes", "fridge", 2),
    ("en:seafood", "fridge", 2),
    ("en:sausages", "fridge", 14),
    ("en:hams", "fridge", 7),
    ("en:prepared-meats", "fridge", 7),
    ("en:poultries", "fridge", 3),
    ("en:meats", "fridge", 3),
    ("en:milks", "fridge", 7),
    ("en:creams", "fridge", 14),
    ("en:yogurts", "fridge", 14),
    ("en:fermented-milk-products", "fridge", 14),
    ("en:butters", "fridge", 60),
    ("en:margarines", "fridge", 60),
    ("en:cheeses", "fridge", 30),
    ("en:eggs", "fridge", 28),
    ("en:dairies", "fridge", 10),
    ("en:salads", "fridge", 4),
    ("en:fresh-vegetables", "fridge", 7),
    ("en:refrigerated-foods", "fridge", 5),
    ("en:fresh-fruits", "pantry", 7),
    ("en:crispbreads", "pantry", 180),
    ("en:breads", "pantry", 5),
    ("en:pastries", "pantry", 10),
    ("en:cakes", "pantry", 10),
    ("en:biscuits", "pantry", 180),
    ("en:pastas", "pantry", 365),
    ("en:rices", "pantry", 365),
    ("en:flours", "pantry", 365),
    ("en:breakfast-cereals", "pantry", 180),
    ("en:coffees", "pantry", 365),
    ("en:teas", "pantry", 365),
    ("en:spices", "pantry", 365),
    ("en:condiments", "pantry", 365),
    ("en:sauces", "pantry", 180),
    ("en:snacks", "pantry", 120),
    ("en:beverages", "pantry", 180),
)


def guess_from_categories(tags: list[str]) -> tuple[str | None, int | None]:
    have = set(tags)
    for tag, place, days in CATEGORY_RULES:
        if tag in have:
            return place, days
    return None, None


def valid_code(code: str) -> str:
    code = code.strip()
    if not CODE.match(code):
        raise ValueError("Not a barcode")
    return code


class ProductOut(BaseModel):
    barcode: str
    name: str = ""
    unit: str = ""
    place: str | None = None
    keeps_days: int | None = None
    # family: named by the family before | lookup: from Open Food Facts | none: unknown
    source: str = "none"


class ScanLine(BaseModel):
    barcode: str | None = Field(default=None, max_length=32)
    name: str = Field(min_length=1, max_length=120)
    amount: float = Field(default=1, ge=0, le=100_000)
    unit: str = Field(default="", max_length=20)
    place: Place = "pantry"
    best_before: date | None = None
    # Remember the name, unit, place and keeps_days for this barcode for the next scan.
    keeps_days: int | None = Field(default=None, ge=0, le=3650)
    remember: bool = True

    @field_validator("barcode")
    @classmethod
    def _code(cls, value: str | None) -> str | None:
        return valid_code(value) if value else None


class ScanIn(BaseModel):
    # add: the groceries come in, on top of what is there. count: this is what is in `place` now.
    mode: Literal["add", "count"] = "add"
    place: Place | None = None
    lines: list[ScanLine] = Field(default_factory=list, max_length=300)


async def product(db: AsyncSession, family: Family, code: str, language: str = "en") -> ProductOut:
    code = valid_code(code)
    known = (
        await db.execute(select(PantryProduct).where(PantryProduct.family_id == family.id, PantryProduct.barcode == code))
    ).scalar_one_or_none()
    if known:
        return ProductOut(barcode=code, name=known.name, unit=known.unit, place=known.place, keeps_days=known.keeps_days, source="family")
    if family.barcode_lookup and FOOD_CODE.match(code):
        found = await lookup(code, language)
        if found:
            name, place, keeps_days = found
            return ProductOut(barcode=code, name=name, place=place, keeps_days=keeps_days, source="lookup")
    return ProductOut(barcode=code)


async def lookup(code: str, language: str) -> tuple[str, str | None, int | None] | None:
    """Name, and a guess of place and days it keeps, from Open Food Facts – only the barcode is
    sent. None when it doesn't know the product (or is busy: then the member writes the name)."""
    fields = f"product_name,product_name_{language},brands,quantity,categories_tags"
    try:
        async with httpx.AsyncClient(timeout=5, headers={"User-Agent": OFF_AGENT}) as client:
            resp = await client.get(OFF_URL.format(code=code), params={"fields": fields})
        if resp.status_code != 200:
            return None
        data = resp.json().get("product") or {}
    except Exception:
        return None
    name = (data.get(f"product_name_{language}") or data.get("product_name") or "").strip()
    if not name:
        return None
    brand = (data.get("brands") or "").split(",")[0].strip()
    if brand.islower():
        brand = brand.capitalize()  # "wasa" -> "Wasa"
    if brand and brand.casefold() not in name.casefold():
        name = f"{brand} {name}"
    quantity = (data.get("quantity") or "").strip()
    if quantity and quantity.casefold() not in name.casefold():
        name = f"{name} {quantity}"
    place, keeps_days = guess_from_categories(data.get("categories_tags") or [])
    return name[:120], place, keeps_days


async def _remember(db: AsyncSession, family_id: uuid.UUID, line: ScanLine, keeps_days: int | None) -> None:
    row = (
        await db.execute(select(PantryProduct).where(PantryProduct.family_id == family_id, PantryProduct.barcode == line.barcode))
    ).scalar_one_or_none()
    if row is None:
        row = PantryProduct(family_id=family_id, barcode=line.barcode)
        db.add(row)
    row.name, row.unit, row.place = line.name.strip(), line.unit.strip(), line.place
    row.keeps_days = keeps_days
    row.updated_at = datetime.now(timezone.utc)


def _best_before(line: ScanLine, today: date) -> date | None:
    if line.best_before:
        return line.best_before
    return today + timedelta(days=line.keeps_days) if line.keeps_days is not None else None


def _new(family_id: uuid.UUID, user_id: uuid.UUID | None, line: ScanLine, place: str, amount: float, today: date) -> PantryItem:
    return PantryItem(
        family_id=family_id, place=place, name=line.name.strip(), amount=amount, unit=line.unit.strip(),
        best_before=_best_before(line, today), barcode=line.barcode, added_by=user_id,
    )


async def apply_scan(
    db: AsyncSession, family_id: uuid.UUID, user_id: uuid.UUID | None, payload: ScanIn, today: date
) -> tuple[list[PantryItem], list[PantryItem]]:
    """Save a scanned list. Returns (the items that changed, and – when taking stock – what is in
    the place but wasn't scanned, so the member can say whether it is gone)."""
    if payload.mode == "count" and payload.place is None:
        raise ValueError("Choose the place you are taking stock of")
    lines = [ln for ln in payload.lines if ln.amount > 0 or payload.mode == "count"]
    for line in {ln.barcode: ln for ln in lines if ln.barcode and ln.remember}.values():
        # New groceries: the date on the package says how long this product keeps. (Not when
        # taking stock – what is left is older than when it was bought.)
        keeps_days = line.keeps_days
        if payload.mode == "add" and line.best_before and line.best_before >= today:
            keeps_days = (line.best_before - today).days
        await _remember(db, family_id, line, keeps_days)

    existing = list((await db.execute(select(PantryItem).where(PantryItem.family_id == family_id))).scalars().all())
    changed: list[PantryItem] = []

    if payload.mode == "add":
        for line in lines:
            best_before = _best_before(line, today)
            same = next(
                (i for i in existing + changed if line.barcode and i.barcode == line.barcode and i.place == line.place and i.best_before == best_before),
                None,
            )
            if same:
                same.amount = (same.amount or 1) + line.amount
                if same not in changed:
                    changed.append(same)
            else:
                item = _new(family_id, user_id, line, line.place, line.amount, today)
                db.add(item)
                changed.append(item)
        await db.commit()
        return changed, []

    # Taking stock: everything counted is in the chosen place; the count replaces what was there.
    place = payload.place
    here = [i for i in existing if i.place == place]
    seen: set[uuid.UUID] = set()
    counted: dict[str, float] = {}
    first: dict[str, ScanLine] = {}
    for line in lines:
        if line.barcode:
            counted[line.barcode] = counted.get(line.barcode, 0) + line.amount
            first.setdefault(line.barcode, line)
        elif line.amount > 0:
            item = _new(family_id, user_id, line, place, line.amount, today)
            db.add(item)
            changed.append(item)
    for code, total in counted.items():
        # Oldest date first: what is used up is most likely the oldest.
        same = sorted((i for i in here if i.barcode == code), key=lambda i: (i.best_before is None, i.best_before or date.max))
        seen.update(i.id for i in same)
        have = sum(i.amount if i.amount is not None else 1 for i in same)
        if not same:
            if total > 0:
                item = _new(family_id, user_id, first[code], place, total, today)
                db.add(item)
                changed.append(item)
            continue
        if total > have:
            same[-1].amount = (same[-1].amount if same[-1].amount is not None else 1) + (total - have)
            changed.append(same[-1])
            continue
        remove = have - total
        for item in same:
            if remove <= 0:
                break
            amount = item.amount if item.amount is not None else 1
            if amount <= remove:
                remove -= amount
                await db.delete(item)
            else:
                item.amount = amount - remove
                remove = 0
                changed.append(item)
    missing = [i for i in here if i.id not in seen]
    await db.commit()
    return changed, missing

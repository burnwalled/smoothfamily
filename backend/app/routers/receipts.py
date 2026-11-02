"""Receipts in the vault (2.8.4).

A receipt is added in the vault and linked to what it is for: a home, a vehicle, or just a category
(food, clothes …). It keeps the warranty and the last day to return the thing, with reminders, and
can be read by the local AI (store, total, date). Who sees it: the one who added it, and the
family's adults – a receipt for a vehicle only those who may see the vehicle. Children see their own.
"""
import csv
import io
import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import CurrentUser, DB, require_app
from app.models import Album, Family, MediaItem, Property, Receipt, User, Vehicle
from app.services.file_vault import may_see_vehicle, receipt_refs
from app.services.notify import notify

router = APIRouter(prefix="/api/receipts", tags=["receipts"], dependencies=[require_app("photos")])

CATEGORIES = ["food", "home", "vehicle", "clothes", "children", "health", "leisure", "electronics", "gifts", "travel", "other"]
# How long a consumer may complain about a fault, by the member's language as a stand-in for the
# country: three years in Sweden, two in Denmark and Norway (Norway: five for things meant to last
# – the app shows the two). Finland has no fixed time, and an English-speaking family may live
# anywhere: no date is shown then. Never for food.
COMPLAINT_YEARS = {"sv": 3, "da": 2, "nb": 2}


class ReceiptIn(BaseModel):
    media_id: uuid.UUID | None = None
    store: str = Field(default="", max_length=120)
    amount: float | None = Field(default=None, ge=0, le=100_000_000)
    currency: str = Field(default="", max_length=3)
    purchased_on: date | None = None
    category: str = Field(default="other", pattern="^(" + "|".join(CATEGORIES) + ")$")
    property_id: uuid.UUID | None = None
    vehicle_id: uuid.UUID | None = None
    note: str | None = Field(default=None, max_length=2000)
    warranty_until: date | None = None
    return_until: date | None = None
    # Shared with the other home: the child, and the other home's share (e.g. 50 %).
    child_id: uuid.UUID | None = None
    split_pct: int | None = Field(default=None, ge=1, le=100)


class ReceiptPatch(BaseModel):
    store: str | None = Field(default=None, max_length=120)
    amount: float | None = Field(default=None, ge=0, le=100_000_000)
    currency: str | None = Field(default=None, max_length=3)
    purchased_on: date | None = None
    category: str | None = Field(default=None, pattern="^(" + "|".join(CATEGORIES) + ")$")
    property_id: uuid.UUID | None = None
    vehicle_id: uuid.UUID | None = None
    note: str | None = Field(default=None, max_length=2000)
    text: str | None = Field(default=None, max_length=20000)
    warranty_until: date | None = None
    return_until: date | None = None
    child_id: uuid.UUID | None = None
    split_pct: int | None = Field(default=None, ge=1, le=100)


class ReceiptOut(BaseModel):
    id: uuid.UUID
    media_id: uuid.UUID | None
    store: str
    amount: float | None
    currency: str
    purchased_on: date | None
    category: str
    property_id: uuid.UUID | None
    property_name: str | None
    vehicle_id: uuid.UUID | None
    vehicle_name: str | None
    note: str | None
    has_text: bool
    warranty_until: date | None
    # Three years from the purchase to complain about a fault (not for food).
    complaint_until: date | None
    return_until: date | None
    returned_at: datetime | None
    child_id: uuid.UUID | None = None
    child_name: str | None = None
    split_pct: int | None = None
    mine: bool
    created_at: datetime


class ReceiptCreated(BaseModel):
    receipt: ReceiptOut
    # Receipts that look the same (store, amount and date): perhaps added twice.
    duplicates: list[ReceiptOut]


class ReturnedIn(BaseModel):
    returned: bool


def _adult(user: User) -> bool:
    return user.role in ("admin", "adult")


async def _may_see(db: AsyncSession, user: User, receipt: Receipt) -> bool:
    if receipt.family_id != user.family_id:
        return False
    if receipt.created_by == user.id:
        return True
    if not _adult(user):
        return False
    if receipt.vehicle_id:
        vehicle = await db.get(Vehicle, receipt.vehicle_id)
        return vehicle is None or may_see_vehicle(vehicle, user)
    return True


async def _get(db: AsyncSession, user: User, receipt_id: uuid.UUID) -> Receipt:
    receipt = await db.get(Receipt, receipt_id)
    if receipt is None or not await _may_see(db, user, receipt):
        raise HTTPException(status_code=404, detail="Receipt not found")
    return receipt


def _complaint_until(receipt: Receipt, user: User) -> date | None:
    years = COMPLAINT_YEARS.get(user.language or "en")
    if years is None or receipt.category == "food" or receipt.purchased_on is None:
        return None
    try:
        return receipt.purchased_on.replace(year=receipt.purchased_on.year + years)
    except ValueError:  # 29 February
        return receipt.purchased_on.replace(year=receipt.purchased_on.year + years, day=28)


async def _out(db: AsyncSession, user: User, receipt: Receipt) -> ReceiptOut:
    prop = await db.get(Property, receipt.property_id) if receipt.property_id else None
    vehicle = await db.get(Vehicle, receipt.vehicle_id) if receipt.vehicle_id else None
    child = await db.get(User, receipt.child_id) if receipt.child_id else None
    return ReceiptOut(
        id=receipt.id, media_id=receipt.media_id, store=receipt.store, amount=float(receipt.amount) if receipt.amount is not None else None,
        currency=receipt.currency, purchased_on=receipt.purchased_on, category=receipt.category,
        property_id=receipt.property_id, property_name=prop.name if prop else None,
        vehicle_id=receipt.vehicle_id, vehicle_name=vehicle.name if vehicle else None,
        note=receipt.note, has_text=bool(receipt.text), warranty_until=receipt.warranty_until,
        complaint_until=_complaint_until(receipt, user), return_until=receipt.return_until, returned_at=receipt.returned_at,
        child_id=receipt.child_id, child_name=child.display_name if child else None, split_pct=receipt.split_pct if receipt.child_id else None,
        mine=receipt.created_by == user.id, created_at=receipt.created_at,
    )


async def _check_child(db: AsyncSession, user: User, child_id: uuid.UUID | None) -> None:
    if child_id is not None:
        child = await db.get(User, child_id)
        if child is None or child.family_id != user.family_id or child.role != "child":
            raise HTTPException(status_code=422, detail="Not a child in the family")


async def _check_links(db: AsyncSession, user: User, property_id: uuid.UUID | None, vehicle_id: uuid.UUID | None) -> None:
    if property_id:
        prop = await db.get(Property, property_id)
        if prop is None or prop.family_id != user.family_id:
            raise HTTPException(status_code=422, detail="No such home")
    if vehicle_id:
        vehicle = await db.get(Vehicle, vehicle_id)
        if vehicle is None or vehicle.family_id != user.family_id or not may_see_vehicle(vehicle, user):
            raise HTTPException(status_code=422, detail="No such vehicle")


async def _check_media(db: AsyncSession, user: User, media_id: uuid.UUID) -> MediaItem:
    """Only a photo the member put in the family's receipts album."""
    media = await db.get(MediaItem, media_id)
    album = await db.get(Album, media.album_id) if media else None
    if media is None or media.family_id != user.family_id or album is None or album.kind != "receipts" or media.uploaded_by != user.id:
        raise HTTPException(status_code=422, detail="Upload the receipt photo first")
    return media


async def _visible(db: AsyncSession, user: User) -> list[Receipt]:
    rows = (await db.execute(select(Receipt).where(Receipt.family_id == user.family_id).order_by(Receipt.purchased_on.desc().nulls_last(), Receipt.created_at.desc()))).scalars().all()
    return [r for r in rows if await _may_see(db, user, r)]


async def _duplicates(db: AsyncSession, user: User, receipt: Receipt) -> list[Receipt]:
    if receipt.amount is None:
        return []
    found = []
    for other in await _visible(db, user):
        if other.id == receipt.id or other.amount is None or abs(float(other.amount) - float(receipt.amount)) > 0.009:
            continue
        same_day = receipt.purchased_on is None or other.purchased_on is None or abs((other.purchased_on - receipt.purchased_on).days) <= 1
        same_store = not receipt.store or not other.store or other.store.strip().lower() == receipt.store.strip().lower()
        if same_day and same_store:
            found.append(other)
    return found


@router.get("", response_model=list[ReceiptOut])
async def list_receipts(
    user: CurrentUser,
    db: DB,
    q: str | None = Query(default=None, max_length=120),
    category: str | None = None,
    property_id: uuid.UUID | None = None,
    vehicle_id: uuid.UUID | None = None,
    show: str | None = Query(default=None, pattern="^(returns|warranty)$"),
    year: int | None = Query(default=None, ge=1900, le=2200),
) -> list[ReceiptOut]:
    """show=returns: not yet returned and still within the return time; show=warranty: still under
    warranty or within the time to complain. q searches the store, the note and the receipt's lines."""
    return await _filtered(db, user, q, category, property_id, vehicle_id, show, year)


async def _filtered(
    db: AsyncSession, user: User, q: str | None = None, category: str | None = None, property_id: uuid.UUID | None = None,
    vehicle_id: uuid.UUID | None = None, show: str | None = None, year: int | None = None,
) -> list[ReceiptOut]:
    today = date.today()
    words = (q or "").strip().lower()
    out = []
    for r in await _visible(db, user):
        if category and r.category != category:
            continue
        if property_id and r.property_id != property_id:
            continue
        if vehicle_id and r.vehicle_id != vehicle_id:
            continue
        if year and (r.purchased_on is None or r.purchased_on.year != year):
            continue
        if show == "returns" and not (r.return_until and r.return_until >= today and r.returned_at is None):
            continue
        if show == "warranty":
            until = max([d for d in (r.warranty_until, _complaint_until(r, user)) if d], default=None)
            if until is None or until < today or r.returned_at is not None:
                continue
        if words and words not in " ".join([r.store, r.note or "", r.text or ""]).lower():
            continue
        out.append(await _out(db, user, r))
    return out


@router.post("", response_model=ReceiptCreated, status_code=status.HTTP_201_CREATED)
async def add_receipt(payload: ReceiptIn, user: CurrentUser, db: DB) -> ReceiptCreated:
    await _check_links(db, user, payload.property_id, payload.vehicle_id)
    await _check_child(db, user, payload.child_id)
    if payload.media_id:
        await _check_media(db, user, payload.media_id)
    receipt = Receipt(
        family_id=user.family_id, created_by=user.id, media_id=payload.media_id, store=payload.store.strip(), amount=payload.amount,
        # Empty: the family's own currency; a code only for a purchase in another one.
        currency=(payload.currency or "").upper()[:3], purchased_on=payload.purchased_on, category=payload.category,
        property_id=payload.property_id, vehicle_id=payload.vehicle_id, note=(payload.note or "").strip() or None,
        warranty_until=payload.warranty_until, return_until=payload.return_until,
        child_id=payload.child_id, split_pct=(payload.split_pct or 50) if payload.child_id else None,
    )
    db.add(receipt)
    await db.commit()
    await db.refresh(receipt)
    duplicates = await _duplicates(db, user, receipt)
    return ReceiptCreated(receipt=await _out(db, user, receipt), duplicates=[await _out(db, user, d) for d in duplicates])


@router.patch("/{receipt_id}", response_model=ReceiptOut)
async def update_receipt(receipt_id: uuid.UUID, payload: ReceiptPatch, user: CurrentUser, db: DB) -> ReceiptOut:
    receipt = await _get(db, user, receipt_id)
    fields = payload.model_fields_set
    await _check_links(db, user, payload.property_id if "property_id" in fields else None, payload.vehicle_id if "vehicle_id" in fields else None)
    if "child_id" in fields:
        await _check_child(db, user, payload.child_id)
    for name in fields:
        value = getattr(payload, name)
        if name in ("store", "note", "text") and isinstance(value, str):
            value = value.strip() or (None if name != "store" else "")
        if name == "currency" and value is not None:
            value = value.upper()[:3]
        if name in ("category", "store", "currency") and value is None:
            continue
        setattr(receipt, name, value)
    await db.commit()
    return await _out(db, user, receipt)


@router.post("/{receipt_id}/returned", response_model=ReceiptOut)
async def mark_returned(receipt_id: uuid.UUID, payload: ReturnedIn, user: CurrentUser, db: DB) -> ReceiptOut:
    receipt = await _get(db, user, receipt_id)
    receipt.returned_at = datetime.now(timezone.utc) if payload.returned else None
    await db.commit()
    return await _out(db, user, receipt)


@router.delete("/{receipt_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_receipt(receipt_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    """The photo goes too, unless an expense still uses it."""
    from app.routers.albums import _delete_media_files
    from app.services.storage import get_storage

    receipt = await _get(db, user, receipt_id)
    media = await db.get(MediaItem, receipt.media_id) if receipt.media_id else None
    await db.delete(receipt)
    await db.flush()
    if media is not None and not (await receipt_refs(db, user.family_id, [media.id])).get(media.id):
        _delete_media_files(get_storage(), media)
        await db.delete(media)
    await db.commit()


@router.get("/stats")
async def receipt_stats(user: CurrentUser, db: DB, year: int | None = Query(default=None, ge=1900, le=2200)) -> dict:
    """The year in the family's currency: per category, per month and the stores most spent at."""
    year = year or date.today().year
    family = await db.get(Family, user.family_id)
    currency = family.currency or ""
    by_category: dict[str, dict] = {}
    by_month = [0.0] * 12
    by_store: dict[str, float] = {}
    total = 0.0
    for r in await _visible(db, user):
        if r.purchased_on is None or r.purchased_on.year != year or r.amount is None or r.returned_at is not None:
            continue
        if r.currency and r.currency != currency.upper():
            continue  # bought in another currency
        amount = float(r.amount)
        total += amount
        row = by_category.setdefault(r.category, {"category": r.category, "total": 0.0, "count": 0})
        row["total"] += amount
        row["count"] += 1
        by_month[r.purchased_on.month - 1] += amount
        if r.store:
            by_store[r.store] = by_store.get(r.store, 0.0) + amount
    stores = sorted(by_store.items(), key=lambda kv: -kv[1])[:8]
    return {
        "year": year,
        "currency": currency,
        "total": round(total, 2),
        "by_category": sorted((dict(v, total=round(v["total"], 2)) for v in by_category.values()), key=lambda v: -v["total"]),
        "by_month": [round(v, 2) for v in by_month],
        "by_store": [{"store": s, "total": round(v, 2)} for s, v in stores],
    }


def _cell(value) -> str:
    # A spreadsheet must not run a formula from a store's name or a note.
    text = "" if value is None else str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


@router.get("/shared")
async def shared_costs(user: CurrentUser, db: DB, year: int | None = Query(default=None, ge=1900, le=2200)) -> list[dict]:
    """Per child and month: what was bought for the child that the other home shares, and their part."""
    year = year or date.today().year
    out: dict[tuple, dict] = {}
    for r in await _visible(db, user):
        if not r.child_id or r.amount is None or r.purchased_on is None or r.purchased_on.year != year or r.returned_at is not None:
            continue
        key = (r.child_id, r.purchased_on.month)
        row = out.setdefault(key, {"child_id": r.child_id, "month": r.purchased_on.month, "total": 0.0, "their_part": 0.0, "count": 0})
        row["total"] += float(r.amount)
        row["their_part"] += float(r.amount) * (r.split_pct or 50) / 100
        row["count"] += 1
    rows = sorted(out.values(), key=lambda v: (str(v["child_id"]), v["month"]))
    for v in rows:
        child = await db.get(User, v["child_id"])
        v["child_name"] = child.display_name if child else None
        v["total"], v["their_part"] = round(v["total"], 2), round(v["their_part"], 2)
    return rows


async def coparent_costs(db: AsyncSession, family_id: uuid.UUID, child_ids: list[str]) -> list[dict]:
    """For the other parent's own page: the shared receipts for their children – no photos, no notes."""
    rows = (await db.execute(select(Receipt).where(Receipt.family_id == family_id, Receipt.child_id.is_not(None), Receipt.returned_at.is_(None)).order_by(Receipt.purchased_on.desc().nulls_last()))).scalars().all()
    out = []
    for r in rows:
        if str(r.child_id) not in child_ids or r.amount is None:
            continue
        child = await db.get(User, r.child_id)
        out.append({
            "purchased_on": r.purchased_on, "store": r.store, "category": r.category, "amount": float(r.amount),
            "currency": r.currency, "split_pct": r.split_pct or 50, "their_part": round(float(r.amount) * (r.split_pct or 50) / 100, 2),
            "child_name": child.display_name if child else None,
        })
    return out[:200]


@router.get("/export.csv")
async def export_receipts(user: CurrentUser, db: DB, year: int | None = Query(default=None, ge=1900, le=2200)) -> Response:
    buf = io.StringIO()
    writer = csv.writer(buf, delimiter=";")
    writer.writerow(["date", "store", "amount", "currency", "category", "home", "vehicle", "warranty_until", "return_until", "returned", "note"])
    for r in reversed(await _filtered(db, user, year=year)):
        writer.writerow([_cell(v) for v in (
            r.purchased_on, r.store, f"{r.amount:.2f}" if r.amount is not None else "", r.currency, r.category, r.property_name, r.vehicle_name,
            r.warranty_until, r.return_until, "yes" if r.returned_at else "", r.note,
        )])
    name = f"receipts-{year}.csv" if year else "receipts.csv"
    # A BOM so that Excel reads å, ä and ö right.
    return Response(content="﻿" + buf.getvalue(), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": f'attachment; filename="{name}"'})


async def readable_receipt(db: AsyncSession, user: User, receipt_id: uuid.UUID | None) -> tuple[Receipt, MediaItem]:
    """For the local AI: a receipt the member may see, with its photo."""
    if receipt_id is None or "photos" not in user.apps:
        raise HTTPException(status_code=422, detail="Choose the receipt")
    receipt = await _get(db, user, receipt_id)
    media = await db.get(MediaItem, receipt.media_id) if receipt.media_id else None
    if media is None or media.kind != "image":
        raise HTTPException(status_code=422, detail="The receipt has no photo to read")
    return receipt, media


_REMIND = {
    "en": ("Last day to return", "{what} – return it by {date}", "The warranty ends soon", "{what} – the warranty ends {date}"),
    "sv": ("Sista dag för retur", "{what} – lämna tillbaka senast {date}", "Garantin går snart ut", "{what} – garantin går ut {date}"),
    "nb": ("Siste dag for retur", "{what} – lever tilbake senest {date}", "Garantien går snart ut", "{what} – garantien går ut {date}"),
    "da": ("Sidste dag for returnering", "{what} – returnér senest {date}", "Garantien udløber snart", "{what} – garantien udløber {date}"),
    "fi": ("Viimeinen palautuspäivä", "{what} – palauta viimeistään {date}", "Takuu päättyy pian", "{what} – takuu päättyy {date}"),
}


async def run_receipt_reminders(db: AsyncSession, now: datetime | None = None) -> int:
    """From 07 UTC: two days before the last day to return (if not returned) and a month before the
    warranty ends, the one who added the receipt is told – once per date."""
    now = now or datetime.now(timezone.utc)
    if now.hour < 7:
        return 0
    today = now.date()
    rows = (
        await db.execute(
            select(Receipt).where(
                or_(
                    (Receipt.return_until >= today) & (Receipt.return_until <= today + timedelta(days=2)) & Receipt.returned_at.is_(None),
                    (Receipt.warranty_until >= today) & (Receipt.warranty_until <= today + timedelta(days=30)),
                ),
                Receipt.created_by.is_not(None),
            )
        )
    ).scalars().all()
    sent = 0
    for r in rows:
        user = await db.get(User, r.created_by)
        if user is None:
            continue
        rt, rb, wt, wb = _REMIND.get(user.language or "en", _REMIND["en"])
        what = r.store or r.note or "?"
        if r.return_until and r.returned_at is None and r.return_until <= today + timedelta(days=2) and r.reminded_return != r.return_until:
            r.reminded_return = r.return_until
            await db.commit()
            await notify(db, user, {"title": rt, "body": rb.format(what=what, date=r.return_until.isoformat()), "route": "/vault?view=receipt", "kind": "receipt_return"})
            sent += 1
        if r.warranty_until and r.warranty_until <= today + timedelta(days=30) and r.reminded_warranty != r.warranty_until:
            r.reminded_warranty = r.warranty_until
            await db.commit()
            await notify(db, user, {"title": wt, "body": wb.format(what=what, date=r.warranty_until.isoformat()), "route": "/vault?view=receipt", "kind": "receipt_warranty"})
            sent += 1
    return sent

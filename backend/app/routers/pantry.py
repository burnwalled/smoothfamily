"""Pantry (#69): what the family has in the freezer, fridge and pantry, with best-before dates.

Everyone with the app may add, change and use up things – children eat too. Items close to their
date show as "soon" (within 3 days) or "expired"; the evening before the last day the adults are
told what to use. Bought items move in from the shopping list, and something used up can go
straight back onto it. Groceries can be scanned in with their barcodes, and a place can be
counted (stocktaking) the same way – see services/pantry_scan.
"""
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import CurrentUser, DB, FamilyManager, require_app
from app.models import Family, ListItem, ListModel, PantryItem, User
from app.services import pantry_scan as scan
from app.services.notify import notify

router = APIRouter(prefix="/api/pantry", tags=["pantry"], dependencies=[require_app("pantry")])

Place = Literal["freezer", "fridge", "pantry"]
SOON_DAYS = 3


class PantryIn(BaseModel):
    place: Place = "pantry"
    name: str = Field(min_length=1, max_length=120)
    amount: float | None = Field(default=None, ge=0, le=100_000)
    unit: str = Field(default="", max_length=20)
    best_before: date | None = None


class PantryOut(BaseModel):
    id: uuid.UUID
    place: str
    name: str
    amount: float | None
    unit: str
    best_before: date | None
    # ok | soon (within 3 days) | expired
    status: str
    barcode: str | None = None
    created_at: datetime


class FinishedIn(BaseModel):
    # Put it back on this shopping list.
    to_list: uuid.UUID | None = None


class FromListIn(BaseModel):
    item_ids: list[uuid.UUID] = Field(min_length=1, max_length=200)
    place: Place = "pantry"


def status_of(best_before: date | None, today: date) -> str:
    if best_before is None:
        return "ok"
    if best_before < today:
        return "expired"
    return "soon" if (best_before - today).days <= SOON_DAYS else "ok"


def _out(item: PantryItem, today: date) -> PantryOut:
    return PantryOut(
        id=item.id, place=item.place, name=item.name, amount=item.amount, unit=item.unit or "",
        best_before=item.best_before, status=status_of(item.best_before, today), barcode=item.barcode,
        created_at=item.created_at,
    )


def _sorted(items: list[PantryItem]) -> list[PantryItem]:
    """Soonest best-before first; items without a date last; then by name."""
    return sorted(items, key=lambda i: (i.best_before is None, i.best_before or date.max, i.name.casefold()))


async def _item(db: AsyncSession, user: User, item_id: uuid.UUID) -> PantryItem:
    item = await db.get(PantryItem, item_id)
    if item is None or item.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Item not found")
    return item


def _visible_list(lst: ListModel | None, user: User) -> bool:
    from app.routers.lists import _visible_to_user

    return lst is not None and lst.family_id == user.family_id and _visible_to_user(lst, user)


async def _list(db: AsyncSession, user: User, list_id: uuid.UUID) -> ListModel:
    row = await db.get(ListModel, list_id)
    if row is None or row.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="List not found")
    return row


class ScanResult(BaseModel):
    items: list[PantryOut]
    # Taking stock: in the place, but not scanned – still there?
    missing: list[PantryOut]


class SettingsOut(BaseModel):
    barcode_lookup: bool


def scan_result(changed: list[PantryItem], missing: list[PantryItem], today: date) -> ScanResult:
    return ScanResult(items=[_out(i, today) for i in _sorted(changed)], missing=[_out(i, today) for i in _sorted(missing)])


@router.get("", response_model=list[PantryOut])
async def list_items(user: CurrentUser, db: DB, place: Place | None = None) -> list[PantryOut]:
    query = select(PantryItem).where(PantryItem.family_id == user.family_id)
    if place:
        query = query.where(PantryItem.place == place)
    today = date.today()
    return [_out(i, today) for i in _sorted(list((await db.execute(query)).scalars().all()))]


@router.get("/soon", response_model=list[PantryOut])
async def soon(user: CurrentUser, db: DB) -> list[PantryOut]:
    """What to use first: within 3 days of its date, or past it."""
    today = date.today()
    rows = (
        await db.execute(
            select(PantryItem).where(PantryItem.family_id == user.family_id, PantryItem.best_before <= today + timedelta(days=SOON_DAYS))
        )
    ).scalars().all()
    return [_out(i, today) for i in _sorted(list(rows))]


@router.post("", response_model=PantryOut, status_code=status.HTTP_201_CREATED)
async def add_item(payload: PantryIn, user: CurrentUser, db: DB) -> PantryOut:
    item = PantryItem(
        family_id=user.family_id, place=payload.place, name=payload.name.strip(), amount=payload.amount,
        unit=payload.unit.strip(), best_before=payload.best_before, added_by=user.id,
    )
    db.add(item)
    await db.commit()
    return _out(item, date.today())


@router.get("/settings", response_model=SettingsOut)
async def get_settings(user: CurrentUser, db: DB) -> SettingsOut:
    family = await db.get(Family, user.family_id)
    return SettingsOut(barcode_lookup=bool(family.barcode_lookup))


@router.put("/settings", response_model=SettingsOut)
async def put_settings(payload: SettingsOut, admin: FamilyManager, db: DB) -> SettingsOut:
    """Family admin: look up unknown barcodes in Open Food Facts (only the barcode is sent)."""
    family = await db.get(Family, admin.family_id)
    family.barcode_lookup = payload.barcode_lookup
    await db.commit()
    return SettingsOut(barcode_lookup=family.barcode_lookup)


@router.get("/barcode/{code}", response_model=scan.ProductOut)
async def barcode(code: str, user: CurrentUser, db: DB) -> scan.ProductOut:
    try:
        return await scan.product(db, await db.get(Family, user.family_id), code, user.language or "en")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/scan", response_model=ScanResult)
async def save_scan(payload: scan.ScanIn, user: CurrentUser, db: DB) -> ScanResult:
    """A scanned list in one go: groceries in, or a stocktaking of one place."""
    today = date.today()
    try:
        changed, missing = await scan.apply_scan(db, user.family_id, user.id, payload, today)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return scan_result(changed, missing, today)


@router.put("/{item_id}", response_model=PantryOut)
async def update_item(item_id: uuid.UUID, payload: PantryIn, user: CurrentUser, db: DB) -> PantryOut:
    item = await _item(db, user, item_id)
    if item.best_before != payload.best_before:
        item.reminded_for = None
    item.place, item.name, item.amount = payload.place, payload.name.strip(), payload.amount
    item.unit, item.best_before = payload.unit.strip(), payload.best_before
    await db.commit()
    return _out(item, date.today())


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(item_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    await db.delete(await _item(db, user, item_id))
    await db.commit()


@router.post("/{item_id}/finished", status_code=status.HTTP_204_NO_CONTENT)
async def finished(item_id: uuid.UUID, payload: FinishedIn, user: CurrentUser, db: DB) -> None:
    """Used up – and, if asked, back onto the shopping list (both or neither)."""
    item = await _item(db, user, item_id)
    if payload.to_list:
        target = await _list(db, user, payload.to_list)
        position = len((await db.execute(select(ListItem.id).where(ListItem.list_id == target.id))).all())
        db.add(ListItem(list_id=target.id, family_id=user.family_id, name=item.name, category="other", position=position))
    await db.delete(item)
    await db.commit()


class MatchIn(BaseModel):
    ingredients: list[str] = Field(max_length=200)


class MatchOut(BaseModel):
    ingredient: str
    items: list[PantryOut]


class UsedIn(BaseModel):
    item_id: uuid.UUID
    # How much is left, in per cent: 0 = all used (the item goes), 100 = none used.
    left_pct: int = Field(ge=0, le=100)


class UseIn(BaseModel):
    items: list[UsedIn] = Field(max_length=200)


class BoughtOut(BaseModel):
    id: uuid.UUID
    list_name: str
    name: str
    place: Place
    # Not food (household): offered unticked.
    food: bool


class BoughtAnswer(BaseModel):
    item_id: uuid.UUID
    keep: bool
    place: Place = "pantry"


class BoughtIn(BaseModel):
    items: list[BoughtAnswer] = Field(min_length=1, max_length=200)


@router.get("/bought", response_model=list[BoughtOut])
async def just_bought(user: CurrentUser, db: DB) -> list[BoughtOut]:
    """Ticked off in the shop's app through Home Assistant (2.8.4): into the pantry, or not?"""
    from app.services.list_sync import guess_place, not_food

    rows = (await db.execute(select(ListItem, ListModel).join(ListModel, ListModel.id == ListItem.list_id).where(ListItem.family_id == user.family_id, ListItem.pantry_pending.is_(True)))).all()
    return [BoughtOut(id=i.id, list_name=lst.name, name=i.name, place=guess_place(i.name, i.category), food=not not_food(i.category)) for i, lst in rows if _visible_list(lst, user)]


@router.post("/bought", response_model=list[PantryOut])
async def answer_bought(payload: BoughtIn, user: CurrentUser, db: DB) -> list[PantryOut]:
    moved = []
    for answer in payload.items:
        item = await db.get(ListItem, answer.item_id)
        lst = await db.get(ListModel, item.list_id) if item else None
        if item is None or item.family_id != user.family_id or not item.pantry_pending or not _visible_list(lst, user):
            raise HTTPException(status_code=404, detail="Item not found")
        item.pantry_pending = False
        if answer.keep:
            row = PantryItem(family_id=user.family_id, place=answer.place, name=item.name, added_by=user.id)
            db.add(row)
            moved.append(row)
    await db.commit()
    today = date.today()
    return [_out(i, today) for i in moved]


@router.post("/match", response_model=list[MatchOut])
async def match_ingredients(payload: MatchIn, user: CurrentUser, db: DB) -> list[MatchOut]:
    """After cooking: the pantry items each ingredient may have come from (2.8.4)."""
    from app.services.pantry_match import is_staple, matches

    today = date.today()
    items = _sorted((await db.execute(select(PantryItem).where(PantryItem.family_id == user.family_id))).scalars().all())
    out = []
    for name in payload.ingredients:
        if is_staple(name):
            continue
        found = [_out(i, today) for i in items if matches(name, i.name)]
        if found:
            out.append(MatchOut(ingredient=name, items=found))
    return out


@router.post("/use", status_code=status.HTTP_204_NO_CONTENT)
async def use_items(payload: UseIn, user: CurrentUser, db: DB) -> None:
    """What was used: all of it (the item goes), some (the amount is cut to what's left), or nothing."""
    for used in payload.items:
        item = await _item(db, user, used.item_id)
        if used.left_pct == 0:
            await db.delete(item)
        elif used.left_pct < 100 and item.amount is not None:
            item.amount = round(item.amount * used.left_pct / 100, 2)
    await db.commit()


@router.post("/from-list/{list_id}", response_model=list[PantryOut])
async def from_list(list_id: uuid.UUID, payload: FromListIn, user: CurrentUser, db: DB) -> list[PantryOut]:
    """The bought (ticked) items of a shopping list move into the pantry in one go."""
    source = await _list(db, user, list_id)
    rows = (await db.execute(select(ListItem).where(ListItem.list_id == source.id, ListItem.id.in_(payload.item_ids)))).scalars().all()
    if len(rows) != len(set(payload.item_ids)):
        raise HTTPException(status_code=404, detail="Item not found on the list")
    if any(not r.done for r in rows):
        raise HTTPException(status_code=422, detail="Only bought (ticked) items move into the pantry")
    moved = []
    for row in rows:
        item = PantryItem(family_id=user.family_id, place=payload.place, name=row.name, added_by=user.id)
        db.add(item)
        moved.append(item)
        await db.delete(row)
    await db.commit()
    today = date.today()
    return [_out(i, today) for i in moved]


# --- The evening before the last day ---------------------------------------------------------

_TEXT = {
    "en": ("Use soon", "Keeps until tomorrow: {items}"),
    "sv": ("Använd snart", "Håller till imorgon: {items}"),
    "nb": ("Bruk snart", "Holder til i morgen: {items}"),
    "da": ("Brug snart", "Holder til i morgen: {items}"),
    "fi": ("Käytä pian", "Säilyy huomiseen: {items}"),
}
MAX_NAMES = 5


async def run_pantry_reminders(db: AsyncSession, now: datetime | None = None) -> int:
    """From 17 UTC (≈ 18–19 in the Nordics): what keeps only until tomorrow, once per item and
    date, to the family's adults with the app."""
    now = now or datetime.now(timezone.utc)
    if now.hour < 17:
        return 0
    tomorrow = now.date() + timedelta(days=1)
    rows = (await db.execute(select(PantryItem).where(PantryItem.best_before == tomorrow))).scalars().all()
    due: dict[uuid.UUID, list[PantryItem]] = {}
    for item in rows:
        if item.reminded_for != item.best_before:
            due.setdefault(item.family_id, []).append(item)
    sent = 0
    for family_id, items in due.items():
        for item in items:
            item.reminded_for = item.best_before
        await db.commit()
        names = sorted(i.name for i in items)
        listed = ", ".join(names[:MAX_NAMES]) + (" …" if len(names) > MAX_NAMES else "")
        adults = (
            await db.execute(select(User).where(User.family_id == family_id, User.role.in_(["admin", "adult"])))
        ).scalars().all()
        for adult in adults:
            if "pantry" not in adult.apps:
                continue
            title, body = _TEXT.get(adult.language or "en", _TEXT["en"])
            await notify(db, adult, {"title": title, "body": body.format(items=listed), "route": "/pantry", "kind": "pantry"})
            sent += 1
    return sent

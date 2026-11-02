"""Trips and holidays (#70): dates and destination (in the calendar), an itinerary, packing per
traveller with templates (beach, ski, weekend), a shared budget and a checklist before leaving.

Everyone going sees and packs for the trip; adults plan it (itinerary, budget). A trip without
chosen travellers is for the whole family. The evening before, the travellers are reminded of
what is left to pack and check.
"""
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import DB, CurrentUser, require_app
from app.models import Document, Trip, TripCheck, TripExpense, TripItem, TripPackingItem, User
from app.services.notify import notify
from app.services.packing_tasks import PackTask, drop_pack_tasks, pack_tasks, set_pack_tasks

router = APIRouter(prefix="/api/trips", tags=["trips"], dependencies=[require_app("trips")])

# Packing templates: what most families bring (each traveller gets their own copy).
TEMPLATES: dict[str, dict[str, list[str]]] = {
    "beach": {
        "en": ["Swimsuit", "Towel", "Sun cream", "Sunglasses", "Sun hat", "Flip-flops", "Water bottle"],
        "sv": ["Badkläder", "Handduk", "Solkräm", "Solglasögon", "Solhatt", "Flip-flops", "Vattenflaska"],
        "nb": ["Badetøy", "Håndkle", "Solkrem", "Solbriller", "Solhatt", "Flipflops", "Vannflaske"],
        "da": ["Badetøj", "Håndklæde", "Solcreme", "Solbriller", "Solhat", "Klipklappere", "Vandflaske"],
        "fi": ["Uima-asu", "Pyyhe", "Aurinkovoide", "Aurinkolasit", "Aurinkohattu", "Varvassandaalit", "Vesipullo"],
    },
    "ski": {
        "en": ["Ski jacket", "Ski trousers", "Thermal underwear", "Gloves", "Hat", "Goggles", "Helmet", "Lip balm"],
        "sv": ["Skidjacka", "Skidbyxor", "Underställ", "Vantar", "Mössa", "Skidglasögon", "Hjälm", "Cerat"],
        "nb": ["Skijakke", "Skibukse", "Ullundertøy", "Votter", "Lue", "Skibriller", "Hjelm", "Leppepomade"],
        "da": ["Skijakke", "Skibukser", "Skiundertøj", "Handsker", "Hue", "Skibriller", "Hjelm", "Læbepomade"],
        "fi": ["Laskettelutakki", "Laskettteluhousut", "Kerrasto", "Lapaset", "Pipo", "Laskettelulasit", "Kypärä", "Huulirasva"],
    },
    "weekend": {
        "en": ["Clothes for 2 days", "Pyjamas", "Toothbrush", "Charger", "Medicines"],
        "sv": ["Kläder för 2 dagar", "Pyjamas", "Tandborste", "Laddare", "Mediciner"],
        "nb": ["Klær for 2 dager", "Pysjamas", "Tannbørste", "Lader", "Medisiner"],
        "da": ["Tøj til 2 dage", "Pyjamas", "Tandbørste", "Oplader", "Medicin"],
        "fi": ["Vaatteet 2 päiväksi", "Pyjama", "Hammasharja", "Laturi", "Lääkkeet"],
    },
}
CHECKLIST = {
    "en": ["Turn off the water", "Water the plants or ask someone", "Pet sitter arranged", "Empty the fridge", "Close windows and lock up", "Take out the rubbish"],
    "sv": ["Stäng av vattnet", "Vattna blommorna eller be någon", "Djurvakt fixad", "Töm kylskåpet", "Stäng fönster och lås", "Ta ut soporna"],
    "nb": ["Steng vannet", "Vann blomstene eller spør noen", "Dyrepasser ordnet", "Tøm kjøleskapet", "Lukk vinduer og lås", "Ta ut søpla"],
    "da": ["Luk for vandet", "Vand blomsterne eller spørg nogen", "Dyrepasser på plads", "Tøm køleskabet", "Luk vinduer og lås", "Tag skraldet ud"],
    "fi": ["Sulje vesi", "Kastele kasvit tai pyydä joku", "Lemmikinhoitaja sovittu", "Tyhjennä jääkaappi", "Sulje ikkunat ja lukitse", "Vie roskat"],
}


class TripIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    destination: str = Field(default="", max_length=200)
    start_date: date
    end_date: date
    member_ids: list[uuid.UUID] = Field(default=[], max_length=30)
    budget: float | None = Field(default=None, ge=0, le=10_000_000)
    notes: str = Field(default="", max_length=5000)


class ItemIn(BaseModel):
    kind: Literal["travel", "stay", "activity", "other"] = "activity"
    title: str = Field(min_length=1, max_length=200)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    place: str = Field(default="", max_length=300)
    notes: str = Field(default="", max_length=3000)
    document_id: uuid.UUID | None = None


class PackIn(BaseModel):
    user_id: uuid.UUID | None = None
    text: str = Field(min_length=1, max_length=120)


class TemplateIn(BaseModel):
    template: Literal["beach", "ski", "weekend"]
    user_id: uuid.UUID | None = None


class DoneIn(BaseModel):
    done: bool


class ExpenseIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    amount: float = Field(gt=0, le=10_000_000)
    paid_by: uuid.UUID | None = None


class CheckIn(BaseModel):
    text: str = Field(min_length=1, max_length=120)


class TripSummary(BaseModel):
    id: uuid.UUID
    name: str
    destination: str
    start_date: date
    end_date: date
    member_ids: list[uuid.UUID]
    budget: float | None
    notes: str
    packed: int
    to_pack: int
    checks_left: int
    spent: float


class TripDetail(TripSummary):
    items: list[dict]
    packing: list[dict]
    expenses: list[dict]
    checks: list[dict]
    can_plan: bool
    # The day it's time to pack: a task for each traveller (2.9.0).
    pack_tasks: list[PackTask] = []


def _adult(user: User) -> bool:
    return user.role in {"admin", "adult"}


def may_see(user: User, trip: Trip) -> bool:
    return trip.family_id == user.family_id and (not trip.member_ids or str(user.id) in trip.member_ids or _adult(user))


async def _trip(db: AsyncSession, user: User, trip_id: uuid.UUID, plan: bool = False) -> Trip:
    trip = await db.get(Trip, trip_id)
    if trip is None or not may_see(user, trip):
        raise HTTPException(status_code=404, detail="Trip not found")
    if plan and not _adult(user):
        raise HTTPException(status_code=403, detail="Adults plan the trip")
    return trip


async def _members(db: AsyncSession, family_id: uuid.UUID, ids: list[uuid.UUID]) -> list[str]:
    if not ids:
        return []
    found = set((await db.execute(select(User.id).where(User.family_id == family_id, User.id.in_(ids)))).scalars())
    if len(found) != len(set(ids)):
        raise HTTPException(status_code=422, detail="Unknown family member")
    return list(dict.fromkeys(str(i) for i in ids))


async def _rows(db: AsyncSession, model, trip_id: uuid.UUID, order):
    return (await db.execute(select(model).where(model.trip_id == trip_id).order_by(order))).scalars().all()


async def _summary(db: AsyncSession, trip: Trip) -> dict:
    packing = await _rows(db, TripPackingItem, trip.id, TripPackingItem.created_at)
    checks = await _rows(db, TripCheck, trip.id, TripCheck.position)
    expenses = await _rows(db, TripExpense, trip.id, TripExpense.created_at)
    return {
        "id": trip.id, "name": trip.name, "destination": trip.destination, "start_date": trip.start_date, "end_date": trip.end_date,
        "member_ids": trip.member_ids or [], "budget": float(trip.budget) if trip.budget is not None else None, "notes": trip.notes,
        "packed": sum(p.done for p in packing), "to_pack": sum(not p.done for p in packing),
        "checks_left": sum(not c.done for c in checks), "spent": float(sum(e.amount for e in expenses)),
    }


async def _detail(db: AsyncSession, user: User, trip: Trip) -> TripDetail:
    items = await _rows(db, TripItem, trip.id, TripItem.starts_at)
    packing = await _rows(db, TripPackingItem, trip.id, TripPackingItem.created_at)
    expenses = await _rows(db, TripExpense, trip.id, TripExpense.created_at)
    checks = await _rows(db, TripCheck, trip.id, TripCheck.position)
    return TripDetail(
        **await _summary(db, trip),
        items=[
            {"id": i.id, "kind": i.kind, "title": i.title, "starts_at": i.starts_at, "ends_at": i.ends_at, "place": i.place, "notes": i.notes, "document_id": i.document_id}
            for i in sorted(items, key=lambda i: (i.starts_at is None, i.starts_at or datetime.min.replace(tzinfo=timezone.utc)))
        ],
        packing=[{"id": p.id, "user_id": p.user_id, "text": p.text, "done": p.done} for p in packing],
        expenses=[{"id": e.id, "title": e.title, "amount": float(e.amount), "paid_by": e.paid_by} for e in expenses],
        checks=[{"id": c.id, "text": c.text, "done": c.done} for c in checks],
        can_plan=_adult(user),
        pack_tasks=await pack_tasks(db, trip.family_id, trip_id=trip.id),
    )


@router.get("", response_model=list[TripSummary])
async def list_trips(user: CurrentUser, db: DB) -> list[TripSummary]:
    """Coming and ongoing trips first (soonest first), then past ones (newest first)."""
    trips = [t for t in (await db.execute(select(Trip).where(Trip.family_id == user.family_id))).scalars().all() if may_see(user, t)]
    today = date.today()
    ahead = sorted((t for t in trips if t.end_date >= today), key=lambda t: t.start_date)
    past = sorted((t for t in trips if t.end_date < today), key=lambda t: t.start_date, reverse=True)
    return [TripSummary(**await _summary(db, t)) for t in ahead + past]


@router.post("", response_model=TripDetail, status_code=status.HTTP_201_CREATED)
async def create_trip(payload: TripIn, user: CurrentUser, db: DB) -> TripDetail:
    if not _adult(user):
        raise HTTPException(status_code=403, detail="Adults plan the trip")
    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=422, detail="The trip can't end before it starts")
    trip = Trip(
        family_id=user.family_id, name=payload.name.strip(), destination=payload.destination.strip(), start_date=payload.start_date,
        end_date=payload.end_date, member_ids=await _members(db, user.family_id, payload.member_ids), budget=payload.budget,
        notes=payload.notes.strip(), created_by=user.id,
    )
    db.add(trip)
    await db.flush()
    for i, text in enumerate(CHECKLIST.get(user.language or "en", CHECKLIST["en"])):
        db.add(TripCheck(family_id=user.family_id, trip_id=trip.id, text=text, position=i))
    await db.commit()
    return await _detail(db, user, trip)


@router.get("/{trip_id}", response_model=TripDetail)
async def get_trip(trip_id: uuid.UUID, user: CurrentUser, db: DB) -> TripDetail:
    return await _detail(db, user, await _trip(db, user, trip_id))


@router.put("/{trip_id}", response_model=TripDetail)
async def update_trip(trip_id: uuid.UUID, payload: TripIn, user: CurrentUser, db: DB) -> TripDetail:
    trip = await _trip(db, user, trip_id, plan=True)
    if payload.end_date < payload.start_date:
        raise HTTPException(status_code=422, detail="The trip can't end before it starts")
    if trip.start_date != payload.start_date:
        trip.reminded_at = None
    trip.name, trip.destination = payload.name.strip(), payload.destination.strip()
    trip.start_date, trip.end_date = payload.start_date, payload.end_date
    trip.member_ids = await _members(db, user.family_id, payload.member_ids)
    trip.budget, trip.notes = payload.budget, payload.notes.strip()
    await db.commit()
    return await _detail(db, user, trip)


@router.delete("/{trip_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_trip(trip_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    trip = await _trip(db, user, trip_id, plan=True)
    await drop_pack_tasks(db, trip.family_id, trip_id=trip.id)
    for model in (TripItem, TripPackingItem, TripExpense, TripCheck):
        for row in await _rows(db, model, trip.id, model.id):
            await db.delete(row)
    await db.delete(trip)
    await db.commit()


# --- Itinerary (adults) ---------------------------------------------------------------------


@router.post("/{trip_id}/items", response_model=TripDetail, status_code=status.HTTP_201_CREATED)
async def add_item(trip_id: uuid.UUID, payload: ItemIn, user: CurrentUser, db: DB) -> TripDetail:
    trip = await _trip(db, user, trip_id, plan=True)
    if payload.document_id:
        doc = await db.get(Document, payload.document_id)
        if doc is None or doc.family_id != user.family_id:
            raise HTTPException(status_code=422, detail="Unknown document")
    db.add(TripItem(family_id=user.family_id, trip_id=trip.id, **payload.model_dump()))
    await db.commit()
    return await _detail(db, user, trip)


@router.delete("/{trip_id}/items/{item_id}", response_model=TripDetail)
async def delete_item(trip_id: uuid.UUID, item_id: uuid.UUID, user: CurrentUser, db: DB) -> TripDetail:
    trip = await _trip(db, user, trip_id, plan=True)
    item = await db.get(TripItem, item_id)
    if item is None or item.trip_id != trip.id:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(item)
    await db.commit()
    return await _detail(db, user, trip)


# --- Packing (everyone going) ---------------------------------------------------------------


async def _check_owner(db: AsyncSession, user: User, trip: Trip, owner: uuid.UUID | None) -> None:
    """Children pack their own things; adults pack for anyone going."""
    if owner is not None:
        member = await db.get(User, owner)
        if member is None or member.family_id != user.family_id:
            raise HTTPException(status_code=422, detail="Unknown family member")
    if not _adult(user) and owner != user.id:
        raise HTTPException(status_code=403, detail="Children pack their own things")


@router.post("/{trip_id}/packing", response_model=TripDetail, status_code=status.HTTP_201_CREATED)
async def add_packing(trip_id: uuid.UUID, payload: PackIn, user: CurrentUser, db: DB) -> TripDetail:
    trip = await _trip(db, user, trip_id)
    await _check_owner(db, user, trip, payload.user_id)
    db.add(TripPackingItem(family_id=user.family_id, trip_id=trip.id, user_id=payload.user_id, text=payload.text.strip()))
    await db.commit()
    return await _detail(db, user, trip)


class PackTaskIn(BaseModel):
    day: date | None = None
    member_ids: list[uuid.UUID] = Field(default=[], max_length=20)
    points: int = Field(default=10, ge=0, le=100)


@router.put("/{trip_id}/pack-task", response_model=TripDetail)
async def set_pack_task(trip_id: uuid.UUID, payload: PackTaskIn, user: CurrentUser, db: DB) -> TripDetail:
    """The day it's time to pack (adults): each chosen traveller gets a task that day. No day = none."""
    trip = await _trip(db, user, trip_id, plan=True)
    if payload.day is not None and payload.day > trip.start_date:
        raise HTTPException(status_code=422, detail="Pack before the trip starts")
    await _members(db, user.family_id, payload.member_ids)
    await set_pack_tasks(db, user, name=trip.name, day=payload.day, member_ids=payload.member_ids, points=payload.points, trip_id=trip.id)
    await db.commit()
    return await _detail(db, user, trip)


@router.post("/{trip_id}/packing/template", response_model=TripDetail)
async def add_template(trip_id: uuid.UUID, payload: TemplateIn, user: CurrentUser, db: DB) -> TripDetail:
    trip = await _trip(db, user, trip_id)
    await _check_owner(db, user, trip, payload.user_id)
    have = {(p.user_id, p.text) for p in await _rows(db, TripPackingItem, trip.id, TripPackingItem.created_at)}
    for text in TEMPLATES[payload.template].get(user.language or "en", TEMPLATES[payload.template]["en"]):
        if (payload.user_id, text) not in have:
            db.add(TripPackingItem(family_id=user.family_id, trip_id=trip.id, user_id=payload.user_id, text=text))
    await db.commit()
    return await _detail(db, user, trip)


async def _packing(db: AsyncSession, user: User, trip_id: uuid.UUID, item_id: uuid.UUID) -> tuple[Trip, TripPackingItem]:
    trip = await _trip(db, user, trip_id)
    item = await db.get(TripPackingItem, item_id)
    if item is None or item.trip_id != trip.id:
        raise HTTPException(status_code=404, detail="Not found")
    if not _adult(user) and item.user_id not in (None, user.id):
        raise HTTPException(status_code=403, detail="That's someone else's packing")
    return trip, item


@router.put("/{trip_id}/packing/{item_id}", response_model=TripDetail)
async def tick_packing(trip_id: uuid.UUID, item_id: uuid.UUID, payload: DoneIn, user: CurrentUser, db: DB) -> TripDetail:
    trip, item = await _packing(db, user, trip_id, item_id)
    item.done = payload.done
    await db.commit()
    return await _detail(db, user, trip)


@router.delete("/{trip_id}/packing/{item_id}", response_model=TripDetail)
async def delete_packing(trip_id: uuid.UUID, item_id: uuid.UUID, user: CurrentUser, db: DB) -> TripDetail:
    trip, item = await _packing(db, user, trip_id, item_id)
    await db.delete(item)
    await db.commit()
    return await _detail(db, user, trip)


# --- Budget (adults) and the checklist ------------------------------------------------------


@router.post("/{trip_id}/expenses", response_model=TripDetail, status_code=status.HTTP_201_CREATED)
async def add_expense(trip_id: uuid.UUID, payload: ExpenseIn, user: CurrentUser, db: DB) -> TripDetail:
    trip = await _trip(db, user, trip_id, plan=True)
    db.add(TripExpense(family_id=user.family_id, trip_id=trip.id, title=payload.title.strip(), amount=payload.amount, paid_by=payload.paid_by or user.id))
    await db.commit()
    return await _detail(db, user, trip)


@router.delete("/{trip_id}/expenses/{expense_id}", response_model=TripDetail)
async def delete_expense(trip_id: uuid.UUID, expense_id: uuid.UUID, user: CurrentUser, db: DB) -> TripDetail:
    trip = await _trip(db, user, trip_id, plan=True)
    row = await db.get(TripExpense, expense_id)
    if row is None or row.trip_id != trip.id:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(row)
    await db.commit()
    return await _detail(db, user, trip)


@router.post("/{trip_id}/checks", response_model=TripDetail, status_code=status.HTTP_201_CREATED)
async def add_check(trip_id: uuid.UUID, payload: CheckIn, user: CurrentUser, db: DB) -> TripDetail:
    trip = await _trip(db, user, trip_id)
    position = len(await _rows(db, TripCheck, trip.id, TripCheck.position))
    db.add(TripCheck(family_id=user.family_id, trip_id=trip.id, text=payload.text.strip(), position=position))
    await db.commit()
    return await _detail(db, user, trip)


@router.put("/{trip_id}/checks/{check_id}", response_model=TripDetail)
async def tick_check(trip_id: uuid.UUID, check_id: uuid.UUID, payload: DoneIn, user: CurrentUser, db: DB) -> TripDetail:
    trip = await _trip(db, user, trip_id)
    row = await db.get(TripCheck, check_id)
    if row is None or row.trip_id != trip.id:
        raise HTTPException(status_code=404, detail="Not found")
    row.done = payload.done
    await db.commit()
    return await _detail(db, user, trip)


@router.delete("/{trip_id}/checks/{check_id}", response_model=TripDetail)
async def delete_check(trip_id: uuid.UUID, check_id: uuid.UUID, user: CurrentUser, db: DB) -> TripDetail:
    trip = await _trip(db, user, trip_id)
    row = await db.get(TripCheck, check_id)
    if row is None or row.trip_id != trip.id:
        raise HTTPException(status_code=404, detail="Not found")
    await db.delete(row)
    await db.commit()
    return await _detail(db, user, trip)


# --- The evening before -----------------------------------------------------------------------

_TEXT = {
    "en": ("Tomorrow: {name}", "{pack} things left to pack · {checks} on the checklist", "Everything is packed – have a good trip!"),
    "sv": ("Imorgon: {name}", "{pack} saker kvar att packa · {checks} kvar på checklistan", "Allt är packat – trevlig resa!"),
    "nb": ("I morgen: {name}", "{pack} ting igjen å pakke · {checks} igjen på sjekklisten", "Alt er pakket – god tur!"),
    "da": ("I morgen: {name}", "{pack} ting tilbage at pakke · {checks} tilbage på tjeklisten", "Alt er pakket – god tur!"),
    "fi": ("Huomenna: {name}", "{pack} asiaa pakkaamatta · {checks} tarkistuslistalla", "Kaikki on pakattu – hyvää matkaa!"),
}


async def run_trip_reminders(db: AsyncSession, now: datetime | None = None) -> int:
    """From 17 UTC (≈ 18–19 in the Nordics) the day before departure: each traveller is told what
    is left – their own and the shared packing, and the checklist."""
    now = now or datetime.now(timezone.utc)
    if now.hour < 17:
        return 0
    tomorrow = now.date() + timedelta(days=1)
    sent = 0
    for trip in (await db.execute(select(Trip).where(Trip.start_date == tomorrow, Trip.reminded_at.is_(None)))).scalars().all():
        trip.reminded_at = now
        await db.commit()
        members = (await db.execute(select(User).where(User.family_id == trip.family_id))).scalars().all()
        packing = await _rows(db, TripPackingItem, trip.id, TripPackingItem.created_at)
        checks_left = sum(not c.done for c in await _rows(db, TripCheck, trip.id, TripCheck.position))
        for member in members:
            if "trips" not in member.apps or (trip.member_ids and str(member.id) not in trip.member_ids):
                continue
            left = sum(1 for p in packing if not p.done and p.user_id in (None, member.id))
            title, body, ready = _TEXT.get(member.language or "en", _TEXT["en"])
            text = body.format(pack=left, checks=checks_left) if left or checks_left else ready
            await notify(db, member, {"title": title.format(name=trip.name), "body": text, "route": "/trips", "kind": "trip"})
            sent += 1
    return sent

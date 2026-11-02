"""The household's economy (2.8.5), for the family's adults: see services/economy.py."""
import uuid
from datetime import date, datetime

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.deps import DB, AdultUser, require_app
from app.models import EconomyBudget, EconomyEntry
from app.services import economy

router = APIRouter(prefix="/api/economy", tags=["economy"], dependencies=[require_app("property")])


class EntryIn(BaseModel):
    kind: str = Field(default="out", pattern="^(in|out)$")
    category: str = Field(min_length=1, max_length=60)
    amount: float = Field(gt=0, le=100_000_000)
    day: date
    note: str = Field(default="", max_length=200)
    # once (empty) | monthly | quarterly | yearly – a salary, the rent, a subscription.
    recurring: str = Field(default="", pattern="^(|monthly|quarterly|yearly)$")
    # Only the one who added it sees it.
    private: bool = False


class EntryOut(BaseModel):
    id: uuid.UUID
    kind: str
    category: str
    amount: float
    day: date
    note: str
    recurring: str
    private: bool
    source: str
    mine: bool
    created_at: datetime


class BudgetsIn(BaseModel):
    # category → per month; 0 removes the budget.
    budgets: dict[str, float] = Field(max_length=100)


def _out(e: EconomyEntry, user) -> EntryOut:
    return EntryOut(
        id=e.id, kind=e.kind, category=e.category, amount=float(e.amount), day=e.day, note=e.note or "", recurring=e.recurring or "",
        private=e.private, source=e.source, mine=e.created_by == user.id, created_at=e.created_at,
    )


async def _entry(db, user, entry_id: uuid.UUID) -> EconomyEntry:
    e = await db.get(EconomyEntry, entry_id)
    if e is None or e.family_id != user.family_id or (e.private and e.created_by != user.id):
        raise HTTPException(status_code=404, detail="Entry not found")
    return e


@router.get("")
async def get_overview(user: AdultUser, db: DB, year: int | None = Query(default=None, ge=1900, le=2200)) -> dict:
    return await economy.overview(db, user, year or date.today().year)


@router.get("/entries", response_model=list[EntryOut])
async def list_entries(user: AdultUser, db: DB, year: int | None = Query(default=None, ge=1900, le=2200)) -> list[EntryOut]:
    year = year or date.today().year
    rows = (await db.execute(select(EconomyEntry).where(EconomyEntry.family_id == user.family_id).order_by(EconomyEntry.day.desc()))).scalars().all()
    return [_out(e, user) for e in rows if (not e.private or e.created_by == user.id) and (e.day.year == year or (e.recurring and e.day.year <= year))]


@router.post("/entries", response_model=EntryOut, status_code=status.HTTP_201_CREATED)
async def add_entry(payload: EntryIn, user: AdultUser, db: DB) -> EntryOut:
    if not economy.valid_key(payload.category, payload.kind):
        raise HTTPException(status_code=422, detail="Unknown category")
    e = EconomyEntry(
        family_id=user.family_id, created_by=user.id, kind=payload.kind, category=payload.category, amount=payload.amount, day=payload.day,
        note=payload.note.strip(), recurring=payload.recurring or None, private=payload.private, source="manual",
    )
    db.add(e)
    await db.commit()
    return _out(e, user)


@router.patch("/entries/{entry_id}", response_model=EntryOut)
async def update_entry(entry_id: uuid.UUID, payload: EntryIn, user: AdultUser, db: DB) -> EntryOut:
    e = await _entry(db, user, entry_id)
    if not economy.valid_key(payload.category, payload.kind):
        raise HTTPException(status_code=422, detail="Unknown category")
    e.kind, e.category, e.amount, e.day, e.note = payload.kind, payload.category, payload.amount, payload.day, payload.note.strip()
    e.recurring, e.private = payload.recurring or None, payload.private
    await db.commit()
    return _out(e, user)


@router.delete("/entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_entry(entry_id: uuid.UUID, user: AdultUser, db: DB) -> None:
    await db.delete(await _entry(db, user, entry_id))
    await db.commit()


@router.put("/budgets")
async def set_budgets(payload: BudgetsIn, user: AdultUser, db: DB) -> dict:
    """The family's budget per category and month."""
    for key, amount in payload.budgets.items():
        if not economy.valid_key(key, "out") or amount < 0 or amount > 100_000_000:
            raise HTTPException(status_code=422, detail=f"Unknown category {key}")
        row = (await db.execute(select(EconomyBudget).where(EconomyBudget.family_id == user.family_id, EconomyBudget.category == key))).scalar_one_or_none()
        if amount == 0:
            if row is not None:
                await db.delete(row)
        elif row is None:
            db.add(EconomyBudget(family_id=user.family_id, category=key, monthly=amount))
        else:
            row.monthly = amount
    await db.commit()
    return {"ok": True}

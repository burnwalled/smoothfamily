"""The household's subscriptions (3.4.0), for the adults: everything paid for regularly in one place, with
what it comes to a month and a year. A subscription can point to a login in the vault, which stays under
the vault's rules: nothing of the account is kept here. A bank file's recurring payments become suggestions."""

import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.deps import DB, AdultUser, require_app
from app.models import Family, Subscription, SubscriptionSuggestion, User, VaultLogin
from app.services import bank_csv
from app.services.subscription_reminders import next_payment

router = APIRouter(prefix="/api/subscriptions", tags=["subscriptions"], dependencies=[require_app("property")])

CATEGORY = r"^(streaming|music|phone|internet|insurance|membership|software|news|other)$"
INTERVAL = r"^(week|month|quarter|year)$"
PER_YEAR = {"week": 52, "month": 12, "quarter": 4, "year": 1}


class SubscriptionIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    category: str = Field(default="other", pattern=CATEGORY)
    amount: float = Field(ge=0, le=10_000_000)
    interval: str = Field(default="month", pattern=INTERVAL)
    next_payment: date | None = None
    cancel_by: date | None = None
    who: str = Field(default="", max_length=120)
    url: str = Field(default="", max_length=500, pattern=r"^$|^https?://")
    login_id: uuid.UUID | None = None
    note: str = Field(default="", max_length=1000)
    private: bool = False


class SubscriptionChange(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    category: str | None = Field(default=None, pattern=CATEGORY)
    amount: float | None = Field(default=None, ge=0, le=10_000_000)
    interval: str | None = Field(default=None, pattern=INTERVAL)
    next_payment: date | None = None
    cancel_by: date | None = None
    who: str | None = Field(default=None, max_length=120)
    url: str | None = Field(default=None, max_length=500, pattern=r"^$|^https?://")
    login_id: uuid.UUID | None = None
    note: str | None = Field(default=None, max_length=1000)
    private: bool | None = None
    ended_on: date | None = None


def _visible(row: Subscription, user: User) -> bool:
    return row.family_id == user.family_id and (not row.private or row.created_by == user.id)


def _out(row: Subscription, today: date) -> dict:
    amount = float(row.amount)
    seen = float(row.seen_amount) if row.seen_amount is not None else None
    return {
        "id": row.id, "name": row.name, "category": row.category, "amount": amount, "interval": row.interval, "per_month": round(amount * PER_YEAR[row.interval] / 12, 2),
        "next_payment": next_payment(row, today), "cancel_by": row.cancel_by, "cancel_passed": row.cancel_by is not None and row.cancel_by < today, "who": row.who, "url": row.url, "login_id": row.login_id, "note": row.note, "private": row.private,
        "ended_on": row.ended_on, "from_bank": bool(row.pattern), "seen_amount": seen, "seen_on": row.seen_on,
        # What the bank's file says against what's written here.
        "price_changed": seen is not None and row.ended_on is None and abs(seen - amount) > 0.5,
        "still_paid": row.ended_on is not None and row.seen_on is not None and row.seen_on > row.ended_on,
    }


async def _overview(db: AsyncSession, user: User) -> dict:
    today = datetime.now(timezone.utc).date()
    rows = [r for r in (await db.execute(select(Subscription).where(Subscription.family_id == user.family_id).order_by(Subscription.name))).scalars().all() if _visible(r, user)]
    active = [r for r in rows if r.ended_on is None or r.ended_on > today]
    per_year = sum(float(r.amount) * PER_YEAR[r.interval] for r in active)
    suggestions = (await db.execute(select(SubscriptionSuggestion).where(SubscriptionSuggestion.user_id == user.id).order_by(SubscriptionSuggestion.name))).scalars().all()
    family = await db.get(Family, user.family_id)
    idea = lambda s: {"id": s.id, "name": s.name, "category": s.category, "amount": float(s.amount), "interval": s.interval, "last_seen": s.last_seen}  # noqa: E731
    return {
        "currency": (family.currency if family else "") or "", "per_month": round(per_year / 12, 2), "per_year": round(per_year, 2),
        "items": [_out(r, today) for r in rows],
        "suggestions": [idea(s) for s in suggestions if s.status == "new"], "dismissed": [idea(s) for s in suggestions if s.status == "dismissed"],
    }


async def _check_login(db: AsyncSession, user: User, login_id: uuid.UUID | None) -> None:
    """Only a login this person may see themself can be linked."""
    from app.routers.vault import _may_see

    if login_id is None:
        return
    login = await db.get(VaultLogin, login_id)
    owner = await db.get(User, login.owner_id) if login else None
    if login is None or not _may_see(user, login, owner):
        raise HTTPException(status_code=404, detail="Login not found")


async def _mine(db: AsyncSession, user: User, sub_id: uuid.UUID) -> Subscription:
    row = await db.get(Subscription, sub_id)
    if row is None or not _visible(row, user):
        raise HTTPException(status_code=404, detail="Subscription not found")
    return row


async def _suggestion(db: AsyncSession, user: User, suggestion_id: uuid.UUID) -> SubscriptionSuggestion:
    row = await db.get(SubscriptionSuggestion, suggestion_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Suggestion not found")
    return row


@router.get("")
async def overview(user: AdultUser, db: DB) -> dict:
    return await _overview(db, user)


@router.post("", status_code=status.HTTP_201_CREATED)
async def add(payload: SubscriptionIn, user: AdultUser, db: DB) -> dict:
    await _check_login(db, user, payload.login_id)
    db.add(Subscription(family_id=user.family_id, created_by=user.id, **{**payload.model_dump(), "name": payload.name.strip(), "who": payload.who.strip()}))
    await db.commit()
    return await _overview(db, user)


@router.put("/{sub_id}")
async def change(sub_id: uuid.UUID, payload: SubscriptionChange, user: AdultUser, db: DB) -> dict:
    row = await _mine(db, user, sub_id)
    changes = payload.model_dump(exclude_unset=True)
    if "login_id" in changes:
        await _check_login(db, user, changes["login_id"])
    for key, value in changes.items():
        if value is None and key not in ("next_payment", "cancel_by", "login_id", "ended_on"):
            continue
        setattr(row, key, value)
    # "Only me" means the one who says so, also for something another adult added.
    if changes.get("private"):
        row.created_by = user.id
    await db.commit()
    return await _overview(db, user)


@router.delete("/{sub_id}")
async def remove(sub_id: uuid.UUID, user: AdultUser, db: DB) -> dict:
    await db.delete(await _mine(db, user, sub_id))
    await db.commit()
    return await _overview(db, user)


@router.post("/suggestions/{suggestion_id}/accept", status_code=status.HTTP_201_CREATED)
async def accept(suggestion_id: uuid.UUID, user: AdultUser, db: DB) -> dict:
    """A suggestion becomes a subscription, which the bank's file then keeps an eye on."""
    idea = await _suggestion(db, user, suggestion_id)
    db.add(Subscription(
        family_id=user.family_id, created_by=user.id, name=idea.name, category=idea.category, amount=idea.amount, interval=idea.interval,
        pattern=idea.pattern, seen_amount=idea.amount, seen_on=idea.last_seen,
    ))
    await db.delete(idea)
    await db.commit()
    return await _overview(db, user)


@router.post("/suggestions/{suggestion_id}/dismiss")
async def dismiss(suggestion_id: uuid.UUID, user: AdultUser, db: DB) -> dict:
    """Not a subscription: it isn't suggested again, also after the next file."""
    (await _suggestion(db, user, suggestion_id)).status = "dismissed"
    await db.commit()
    return await _overview(db, user)


@router.post("/suggestions/{suggestion_id}/restore")
async def restore(suggestion_id: uuid.UUID, user: AdultUser, db: DB) -> dict:
    (await _suggestion(db, user, suggestion_id)).status = "new"
    await db.commit()
    return await _overview(db, user)


async def note_from_bank(db: AsyncSession, user: User, rows: list[bank_csv.Txn]) -> int:
    """What a bank file says: recurring payments become suggestions for the one who brought it, and those
    they already see update what was last paid. Only these lines are kept of the file, nothing else.
    Returns how many new suggestions."""
    subs = [s for s in (await db.execute(select(Subscription).where(Subscription.family_id == user.family_id))).scalars().all() if _visible(s, user)]
    ideas = {s.pattern: s for s in (await db.execute(select(SubscriptionSuggestion).where(SubscriptionSuggestion.user_id == user.id))).scalars().all()}
    fresh = 0
    for found in bank_csv.recurring(rows):
        known = next((s for s in subs if s.pattern == found.pattern), None) or next((s for s in subs if not s.pattern and s.name.casefold() in found.pattern), None)
        if known is not None:
            known.pattern = found.pattern
            if known.seen_on is None or found.last_day >= known.seen_on:
                known.seen_amount, known.seen_on = found.amount, found.last_day
            continue
        idea = ideas.get(found.pattern)
        if idea is None:
            db.add(SubscriptionSuggestion(family_id=user.family_id, user_id=user.id, pattern=found.pattern, name=found.name, category=found.category, amount=found.amount, interval=found.interval, last_seen=found.last_day))
            fresh += 1
        elif found.last_day >= idea.last_seen:
            idea.amount, idea.interval, idea.last_seen = found.amount, found.interval, found.last_day
    return fresh

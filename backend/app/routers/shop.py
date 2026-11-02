"""Reward shop: members spend their own points on rewards the adults have set up.

A member's balance is every approved task point they have earned, minus what they have spent in
the shop (approved purchases) and what is held by purchases waiting for an adult. Spending does
not change the level, achievements, family goals or the allowance – those count earned points.
"""
import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, select

from app.deps import DB, CurrentUser, require_app
from app.models import ShopItem, ShopPurchase, TaskCompletion, User
from app.services.notify import notify

router = APIRouter(prefix="/api/shop", tags=["shop"], dependencies=[require_app("shop")])

_TEXT = {
    "pending": {
        "en": ("Reward to approve", "{name} wants {item} ({price} p)"),
        "sv": ("Belöning att godkänna", "{name} vill ha {item} ({price} p)"),
        "nb": ("Belønning å godkjenne", "{name} vil ha {item} ({price} p)"),
        "da": ("Belønning at godkende", "{name} vil have {item} ({price} p)"),
        "fi": ("Hyväksyttävä palkinto", "{name} haluaa: {item} ({price} p)"),
    },
    "approved": {
        "en": ("Reward approved", "{item} – enjoy!"),
        "sv": ("Belöning godkänd", "{item} – njut!"),
        "nb": ("Belønning godkjent", "{item} – kos deg!"),
        "da": ("Belønning godkendt", "{item} – nyd det!"),
        "fi": ("Palkinto hyväksytty", "{item} – nauti!"),
    },
    "rejected": {
        "en": ("Reward declined", "{item} – your points are back"),
        "sv": ("Belöning nekad", "{item} – du har fått tillbaka poängen"),
        "nb": ("Belønning avslått", "{item} – du har fått poengene tilbake"),
        "da": ("Belønning afvist", "{item} – du har fået pointene tilbage"),
        "fi": ("Palkinto hylätty", "{item} – pisteet palautettiin"),
    },
}


def _text(key: str, user: User, **values) -> tuple[str, str]:
    title, body = _TEXT[key].get(user.language or "en", _TEXT[key]["en"])
    return title, body.format(**values)


class ItemIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    price: int = Field(ge=1, le=100000)
    limit_count: int | None = Field(default=None, ge=1, le=100)
    limit_period: str | None = Field(default=None, pattern=r"^(week|month)$")
    active: bool = True

    @model_validator(mode="after")
    def _limit(self) -> "ItemIn":
        if (self.limit_count is None) != (self.limit_period is None):
            raise ValueError("Give both a limit and its period, or neither")
        return self


class ItemOut(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None
    price: int
    limit_count: int | None
    limit_period: str | None
    active: bool
    # For the asking member: how many more they may buy in this period (None = no limit).
    left_this_period: int | None = None

    model_config = {"from_attributes": True}


class PurchaseOut(BaseModel):
    id: uuid.UUID
    item_id: uuid.UUID
    user_id: uuid.UUID
    user_name: str
    title: str
    price: int
    status: str
    note: str | None
    created_at: datetime
    reviewed_at: datetime | None


class WalletOut(BaseModel):
    balance: int
    earned: int
    spent: int
    held: int
    purchases: list[PurchaseOut]


class ReviewIn(BaseModel):
    action: str = Field(pattern=r"^(approve|reject)$")
    note: str | None = Field(default=None, max_length=500)


class AttentionOut(BaseModel):
    pending: int


def _is_adult(user: User) -> bool:
    return user.role in {"admin", "adult"}


def _require_adult(user: User) -> None:
    if not _is_adult(user):
        raise HTTPException(status_code=403, detail="Only adults manage the shop")


def period_start(today: date, period: str) -> date:
    return today - timedelta(days=today.weekday()) if period == "week" else today.replace(day=1)


async def wallet(db, user: User) -> tuple[int, int, int]:
    """(earned, spent, held) in points."""
    earned = (
        await db.execute(
            select(func.coalesce(func.sum(TaskCompletion.points_awarded), 0)).where(
                TaskCompletion.user_id == user.id, TaskCompletion.status == "approved"
            )
        )
    ).scalar_one()
    rows = (
        await db.execute(
            select(ShopPurchase.status, func.coalesce(func.sum(ShopPurchase.price), 0))
            .where(ShopPurchase.user_id == user.id, ShopPurchase.status.in_(["approved", "pending"]))
            .group_by(ShopPurchase.status)
        )
    ).all()
    by_status = dict(rows)
    return int(earned), int(by_status.get("approved", 0)), int(by_status.get("pending", 0))


async def _bought_in_period(db, user: User, item: ShopItem, today: date) -> int:
    since = datetime.combine(period_start(today, item.limit_period), datetime.min.time(), tzinfo=timezone.utc)
    return (
        await db.execute(
            select(func.count(ShopPurchase.id)).where(
                ShopPurchase.user_id == user.id,
                ShopPurchase.item_id == item.id,
                ShopPurchase.status.in_(["approved", "pending"]),
                ShopPurchase.created_at >= since,
            )
        )
    ).scalar_one()


async def _item_out(db, user: User, item: ShopItem, today: date) -> ItemOut:
    out = ItemOut.model_validate(item)
    if item.limit_count is not None:
        out.left_this_period = max(0, item.limit_count - await _bought_in_period(db, user, item, today))
    return out


async def _item(db, user: User, item_id: uuid.UUID) -> ShopItem:
    item = await db.get(ShopItem, item_id)
    if item is None or item.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Reward not found")
    return item


def _purchase_out(p: ShopPurchase, names: dict[uuid.UUID, str]) -> PurchaseOut:
    return PurchaseOut(
        id=p.id,
        item_id=p.item_id,
        user_id=p.user_id,
        user_name=names.get(p.user_id, ""),
        title=p.title,
        price=p.price,
        status=p.status,
        note=p.note,
        created_at=p.created_at,
        reviewed_at=p.reviewed_at,
    )


async def _names(db, family_id: uuid.UUID) -> dict[uuid.UUID, str]:
    return dict((await db.execute(select(User.id, User.display_name).where(User.family_id == family_id))).all())


@router.get("/items", response_model=list[ItemOut])
async def list_items(user: CurrentUser, db: DB) -> list[ItemOut]:
    query = select(ShopItem).where(ShopItem.family_id == user.family_id).order_by(ShopItem.price, ShopItem.title)
    if not _is_adult(user):
        query = query.where(ShopItem.active.is_(True))
    today = date.today()
    return [await _item_out(db, user, item, today) for item in (await db.execute(query)).scalars().all()]


@router.post("/items", response_model=ItemOut, status_code=status.HTTP_201_CREATED)
async def create_item(payload: ItemIn, user: CurrentUser, db: DB) -> ItemOut:
    _require_adult(user)
    item = ShopItem(family_id=user.family_id, created_by=user.id, **payload.model_dump())
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return await _item_out(db, user, item, date.today())


@router.patch("/items/{item_id}", response_model=ItemOut)
async def update_item(item_id: uuid.UUID, payload: ItemIn, user: CurrentUser, db: DB) -> ItemOut:
    _require_adult(user)
    item = await _item(db, user, item_id)
    for field, value in payload.model_dump().items():
        setattr(item, field, value)
    await db.commit()
    await db.refresh(item)
    return await _item_out(db, user, item, date.today())


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(item_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    _require_adult(user)
    item = await _item(db, user, item_id)
    if (await db.execute(select(func.count(ShopPurchase.id)).where(ShopPurchase.item_id == item.id))).scalar_one():
        # Keep the history: a reward that has been bought is only hidden.
        item.active = False
    else:
        await db.delete(item)
    await db.commit()


@router.get("/me", response_model=WalletOut)
async def my_wallet(user: CurrentUser, db: DB) -> WalletOut:
    earned, spent, held = await wallet(db, user)
    purchases = (
        await db.execute(
            select(ShopPurchase).where(ShopPurchase.user_id == user.id).order_by(ShopPurchase.created_at.desc()).limit(50)
        )
    ).scalars().all()
    names = {user.id: user.display_name}
    return WalletOut(
        balance=earned - spent - held,
        earned=earned,
        spent=spent,
        held=held,
        purchases=[_purchase_out(p, names) for p in purchases],
    )


@router.post("/items/{item_id}/buy", response_model=PurchaseOut, status_code=status.HTTP_201_CREATED)
async def buy(item_id: uuid.UUID, user: CurrentUser, db: DB) -> PurchaseOut:
    item = await _item(db, user, item_id)
    if not item.active:
        raise HTTPException(status_code=404, detail="Reward not found")
    if item.limit_count is not None and await _bought_in_period(db, user, item, date.today()) >= item.limit_count:
        raise HTTPException(status_code=409, detail="Limit reached for this period")
    earned, spent, held = await wallet(db, user)
    if earned - spent - held < item.price:
        raise HTTPException(status_code=409, detail="Not enough points")
    # Adults buying for themselves need nobody's approval.
    approved = _is_adult(user)
    purchase = ShopPurchase(
        family_id=user.family_id,
        item_id=item.id,
        user_id=user.id,
        title=item.title,
        price=item.price,
        status="approved" if approved else "pending",
        reviewed_by=user.id if approved else None,
        reviewed_at=datetime.now(timezone.utc) if approved else None,
    )
    db.add(purchase)
    await db.commit()
    await db.refresh(purchase)
    if not approved:
        adults = (
            await db.execute(select(User).where(User.family_id == user.family_id, User.role.in_(["admin", "adult"])))
        ).scalars().all()
        for adult in adults:
            title, body = _text("pending", adult, name=user.display_name, item=item.title, price=item.price)
            await notify(db, adult, {"title": title, "body": body, "route": "/shop", "kind": "shop_pending"}, pref="approvals")
    return _purchase_out(purchase, {user.id: user.display_name})


@router.post("/purchases/{purchase_id}/cancel", response_model=PurchaseOut)
async def cancel(purchase_id: uuid.UUID, user: CurrentUser, db: DB) -> PurchaseOut:
    purchase = await db.get(ShopPurchase, purchase_id)
    if purchase is None or purchase.user_id != user.id:
        raise HTTPException(status_code=404, detail="Purchase not found")
    if purchase.status != "pending":
        raise HTTPException(status_code=409, detail="Only a waiting purchase can be cancelled")
    await db.delete(purchase)
    await db.commit()
    purchase.status = "cancelled"
    return _purchase_out(purchase, {user.id: user.display_name})


@router.get("/purchases", response_model=list[PurchaseOut])
async def list_purchases(user: CurrentUser, db: DB) -> list[PurchaseOut]:
    """Adults: waiting purchases first, then the latest handled ones."""
    _require_adult(user)
    rows = (
        await db.execute(
            select(ShopPurchase)
            .where(ShopPurchase.family_id == user.family_id)
            .order_by((ShopPurchase.status == "pending").desc(), ShopPurchase.created_at.desc())
            .limit(100)
        )
    ).scalars().all()
    names = await _names(db, user.family_id)
    return [_purchase_out(p, names) for p in rows]


@router.post("/purchases/{purchase_id}", response_model=PurchaseOut)
async def review(purchase_id: uuid.UUID, payload: ReviewIn, user: CurrentUser, db: DB) -> PurchaseOut:
    _require_adult(user)
    purchase = await db.get(ShopPurchase, purchase_id)
    if purchase is None or purchase.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Purchase not found")
    if purchase.status != "pending":
        raise HTTPException(status_code=409, detail="Already handled")
    purchase.status = "approved" if payload.action == "approve" else "rejected"
    purchase.note = (payload.note or "").strip() or None
    purchase.reviewed_by = user.id
    purchase.reviewed_at = datetime.now(timezone.utc)
    await db.commit()
    buyer = await db.get(User, purchase.user_id)
    if buyer is not None:
        title, body = _text(purchase.status, buyer, item=purchase.title)
        if purchase.note:
            body = f"{body} – {purchase.note}"
        await notify(db, buyer, {"title": title, "body": body, "route": "/shop", "kind": "shop_reviewed"}, pref="approvals")
    return _purchase_out(purchase, await _names(db, user.family_id))


@router.get("/attention", response_model=AttentionOut)
async def attention(user: CurrentUser, db: DB) -> AttentionOut:
    """Purchases waiting for an adult (badge on the shop); always 0 for children."""
    if not _is_adult(user):
        return AttentionOut(pending=0)
    pending = (
        await db.execute(
            select(func.count(ShopPurchase.id)).where(ShopPurchase.family_id == user.family_id, ShopPurchase.status == "pending")
        )
    ).scalar_one()
    return AttentionOut(pending=pending)

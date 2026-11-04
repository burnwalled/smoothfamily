"""Importing the bank's CSV export into Vehicles and Property (2.7.5, #47).

Upload the file, look over the suggestions – "Circle K → the Volvo, fuel", "Vattenfall → the house,
utilities" – and choose what goes in. A choice can be remembered as a rule for next time. Nothing
is stored of the file or of the rows not imported, apart from recurring payments as suggestions of
subscriptions, which only the one who brought the file sees; of the imported ones only a hash, so the
same purchase isn't imported twice. Only for adults (the bank's rows are the family's economy).
"""
import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.deps import DB, AdultUser
from app.models import BankImported, BankRule, Property, Vehicle
from app.routers import property as homes
from app.routers import vehicles
from app.routers.subscriptions import note_from_bank
from app.services import bank_csv

router = APIRouter(prefix="/api/bank", tags=["bank"])

MAX_FILE = 5 * 1024 * 1024
Target = Literal["vehicle", "property", "economy", "ignore"]


class Suggestion(BaseModel):
    target: str
    target_id: uuid.UUID | None
    category: str
    # rule: the family's own rule | known: a known merchant | none
    source: str


class RowOut(BaseModel):
    day: date
    text: str
    amount: float
    digest: str
    imported: bool
    suggestion: Suggestion
    pattern: str
    # A receipt in the vault with the same amount within a few days (2.8.4).
    has_receipt: bool = False


class Choice(BaseModel):
    day: date
    text: str = Field(min_length=1, max_length=300)
    amount: float
    digest: str = Field(min_length=64, max_length=64)
    target: Target
    target_id: uuid.UUID | None = None
    category: str = Field(default="other", max_length=60)
    name: str = Field(default="", max_length=200)
    # Remember: rows containing `pattern` go the same way next time.
    remember: bool = False
    pattern: str = Field(default="", max_length=80)


class ImportIn(BaseModel):
    rows: list[Choice] = Field(min_length=1, max_length=2000)


class ImportOut(BaseModel):
    imported: int
    skipped: int
    rules: int


class RuleOut(BaseModel):
    id: uuid.UUID
    pattern: str
    target: str
    target_id: uuid.UUID | None
    category: str


async def _targets(db, user) -> tuple[list[Vehicle], list[Property]]:
    cars = [v for v in (await db.execute(select(Vehicle).where(Vehicle.family_id == user.family_id))).scalars().all() if vehicles._may_see(v, user)] if "vehicles" in user.apps else []
    homes_ = list((await db.execute(select(Property).where(Property.family_id == user.family_id))).scalars().all()) if "property" in user.apps else []
    return cars, homes_


@router.post("/parse", response_model=list[RowOut])
async def parse_file(file: UploadFile, user: AdultUser, db: DB) -> list[RowOut]:
    """The file's purchases (money out) with a suggestion each – read here, not kept. What looks like a
    subscription stays as a suggestion for this person."""
    data = await file.read()
    if len(data) > MAX_FILE:
        raise HTTPException(status_code=413, detail="The file is larger than 5 MB")
    try:
        rows = bank_csv.parse(data)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    # What looks like a subscription becomes a suggestion, and those already known see what was paid.
    await note_from_bank(db, user, rows)
    await db.commit()
    rules = (await db.execute(select(BankRule).where(BankRule.family_id == user.family_id))).scalars().all()
    done = set((await db.execute(select(BankImported.digest).where(BankImported.family_id == user.family_id))).scalars().all())
    cars, houses = await _targets(db, user)
    only_car = cars[0].id if len(cars) == 1 else None
    only_home = houses[0].id if len(houses) == 1 else None
    from app.models import Receipt

    kept = [(float(r.amount), r.purchased_on) for r in (await db.execute(select(Receipt).where(Receipt.family_id == user.family_id, Receipt.amount.is_not(None), Receipt.purchased_on.is_not(None)))).scalars().all()]

    def receipt_for(amount: float, day: date) -> bool:
        return any(abs(a - amount) < 0.01 and abs((d - day).days) <= 3 for a, d in kept)

    out = []
    for txn in rows:
        if txn.amount >= 0:
            continue  # money in: not a cost
        low = txn.text.casefold()
        rule = next((r for r in sorted(rules, key=lambda r: -len(r.pattern)) if r.pattern and r.pattern in low), None)
        if rule:
            sug = Suggestion(target=rule.target, target_id=rule.target_id, category=rule.category, source="rule")
        elif known := bank_csv.suggest(txn.text):
            target, category = known
            sug = Suggestion(target=target, target_id=only_car if target == "vehicle" else only_home if target == "property" else None, category=category, source="known")
        else:
            sug = Suggestion(target="ignore", target_id=None, category="other", source="none")
        out.append(RowOut(day=txn.day, text=txn.text, amount=round(-txn.amount, 2), digest=txn.digest, imported=txn.digest in done, suggestion=sug, pattern=bank_csv.pattern_of(txn.text), has_receipt=receipt_for(round(-txn.amount, 2), txn.day)))
    return sorted(out, key=lambda r: r.day, reverse=True)


@router.post("/import", response_model=ImportOut)
async def import_rows(payload: ImportIn, user: AdultUser, db: DB) -> ImportOut:
    done = set((await db.execute(select(BankImported.digest).where(BankImported.family_id == user.family_id))).scalars().all())
    imported = skipped = rules = 0
    for row in payload.rows:
        if row.remember and row.pattern.strip():
            pattern = row.pattern.strip().casefold()
            rule = (await db.execute(select(BankRule).where(BankRule.family_id == user.family_id, BankRule.pattern == pattern))).scalar_one_or_none()
            if rule is None:
                rule = BankRule(family_id=user.family_id, pattern=pattern)
                db.add(rule)
            rule.target, rule.target_id, rule.category = row.target, row.target_id, row.category
            rules += 1
        if row.target == "ignore" or row.digest in done:
            skipped += 1
            continue
        if row.target == "economy":
            # The economy's own category (2.8.5): food, clothes, subscriptions …
            from app.models import EconomyEntry
            from app.services import economy

            if "property" not in user.apps or not economy.valid_key(row.category, "out"):
                raise HTTPException(status_code=422, detail=f"Choose a category for '{row.text}'")
            db.add(EconomyEntry(family_id=user.family_id, created_by=user.id, kind="out", category=row.category, amount=abs(row.amount), day=row.day, note=(row.name or row.text).strip()[:200], source="bank"))
            db.add(BankImported(family_id=user.family_id, digest=row.digest))
            done.add(row.digest)
            imported += 1
            continue
        if row.target_id is None:
            raise HTTPException(status_code=422, detail=f"Choose where '{row.text}' goes")
        if ("vehicles" if row.target == "vehicle" else "property") not in user.apps:
            raise HTTPException(status_code=403, detail="This app is not enabled for you")
        name = (row.name or row.text).strip()[:200]
        amount = abs(row.amount)
        if row.target == "vehicle":
            await vehicles.add_expense(db, user, vehicles.VehicleExpenseIn(vehicle_id=row.target_id, name=name, amount=amount, expense_date=row.day, category=row.category))
        else:
            await homes.add_expense(db, user, homes.ExpenseIn(property_id=row.target_id, name=name, amount=amount, expense_date=row.day, category=row.category))
        db.add(BankImported(family_id=user.family_id, digest=row.digest))
        done.add(row.digest)
        imported += 1
    await db.commit()
    return ImportOut(imported=imported, skipped=skipped, rules=rules)


@router.get("/rules", response_model=list[RuleOut])
async def list_rules(user: AdultUser, db: DB) -> list[RuleOut]:
    rows = (await db.execute(select(BankRule).where(BankRule.family_id == user.family_id).order_by(BankRule.pattern))).scalars().all()
    return [RuleOut(id=r.id, pattern=r.pattern, target=r.target, target_id=r.target_id, category=r.category) for r in rows]


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(rule_id: uuid.UUID, user: AdultUser, db: DB) -> None:
    rule = await db.get(BankRule, rule_id)
    if rule is None or rule.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Rule not found")
    await db.delete(rule)
    await db.commit()

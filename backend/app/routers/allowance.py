"""Allowance: what children have earned from approved task points, and payout bookkeeping.

Each child earns in one of two ways: a rate (how many points make one unit of money, e.g.
10 points = 1 kr) or a point goal (a fixed amount for every week/month reaching the goal).
Adults set this up and record payouts; children see their own earnings.

Savings jars (optional per child): adults add jars ("Skateboard", "Give") that each get a share
of new earnings; Spend gets the rest. A jar with a target is a savings goal. The split is booked as
entries when it happens, so changing the shares later doesn't rewrite old balances. Payouts are
taken from a jar; adults can add a bonus ("interest") or move money, children can put money aside.
"""

import uuid
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, select

from app.deps import AdultUser, CurrentUser, DB, FamilyManager, require_app
from app.models import AllowancePayout, Family, JarEntry, SavingsJar, Task, TaskCompletion, User
from app.services.notify import notify
from app.schemas import (
    AllowanceMe,
    AllowanceOverviewItem,
    AllowancePayoutCreate,
    AllowancePayoutOut,
    AllowanceRateIn,
    FamilySettingsOut,
    FamilySettingsPatch,
)

router = APIRouter(prefix="/api/allowance", tags=["allowance"], dependencies=[require_app("allowance")])


def _to_money(value: Decimal) -> float:
    return float(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _earned(points: int, user: User) -> Decimal:
    """Money for `points`: points per unit if set, else the older money-per-point rate."""
    if user.allowance_points_per_unit:
        return Decimal(points) / Decimal(user.allowance_points_per_unit)
    if user.allowance_rate is not None:
        return Decimal(points) * Decimal(str(user.allowance_rate))
    return Decimal("0")


def _month_start(today: date) -> date:
    return date(today.year, today.month, 1)


def _period_start(day: date, period: str) -> date:
    return _month_start(day) if period == "month" else day - timedelta(days=day.weekday())


class _Earnings:
    """Approved points bucketed per allowance period, earning by the child's mode.

    In goal mode a period earns the fixed amount when its points reach the goal. Periods before
    the current setup (allowance_min_points_since) keep the points rate, so changing the setup
    never takes money back.
    """

    def __init__(self, user: User, rows: list[tuple[int, date]], today: date):
        self.period = user.allowance_period or "week"
        buckets: dict[date, int] = defaultdict(int)
        for points, day in rows:
            buckets[_period_start(day, self.period)] += points
        goal_mode = user.allowance_mode == "goal" and user.allowance_min_points and user.allowance_amount is not None
        since = _period_start(user.allowance_min_points_since, self.period) if user.allowance_min_points_since else None

        def uses_goal(start: date) -> bool:
            return bool(goal_mode) and (since is None or start >= since)

        def money(start: date, points: int) -> Decimal:
            if uses_goal(start):
                return Decimal(str(user.allowance_amount)) if points >= user.allowance_min_points else Decimal("0")
            return _earned(points, user)

        self.lifetime = sum((money(start, p) for start, p in buckets.items()), Decimal("0"))
        current = _period_start(today, self.period)
        self.period_points = buckets.get(current, 0)
        self.period_reached = not uses_goal(current) or self.period_points >= user.allowance_min_points
        self.period_earned = money(current, self.period_points)


def _mode_fields(user: User, earnings: _Earnings) -> dict:
    return {
        "mode": user.allowance_mode or "points",
        "period": earnings.period,
        "min_points": user.allowance_min_points,
        "amount": float(user.allowance_amount) if user.allowance_amount is not None else None,
        "period_points": earnings.period_points,
        "period_reached": earnings.period_reached,
        "period_earned": _to_money(earnings.period_earned),
    }


async def _approved_rows(db: DB, user_id: uuid.UUID) -> list[tuple[int, date]]:
    when = _approval_or_created_ts_expr()
    rows = (
        await db.execute(
            select(TaskCompletion.points_awarded, when).where(
                TaskCompletion.user_id == user_id, TaskCompletion.status == "approved"
            )
        )
    ).all()
    out = []
    for points, ts in rows:
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        out.append((int(points or 0), ts.date()))
    return out


def _approval_or_created_ts_expr():
    return func.coalesce(TaskCompletion.reviewed_at, TaskCompletion.created_at)


async def _points(db: DB, user_id: uuid.UUID, status_value: str = "approved", since: datetime | None = None) -> int:
    query = select(func.coalesce(func.sum(TaskCompletion.points_awarded), 0)).where(
        TaskCompletion.user_id == user_id,
        TaskCompletion.status == status_value,
    )
    if since is not None:
        query = query.where(_approval_or_created_ts_expr() >= since)
    return int((await db.execute(query)).scalar_one() or 0)


async def _pending_points(db: DB, user_id: uuid.UUID) -> int:
    """Points waiting for approval (stored as 0 until approved, so sum the tasks' points)."""
    value = (
        await db.execute(
            select(func.coalesce(func.sum(Task.points), 0))
            .select_from(TaskCompletion)
            .join(Task, Task.id == TaskCompletion.task_id)
            .where(TaskCompletion.user_id == user_id, TaskCompletion.status == "pending")
        )
    ).scalar_one()
    return int(value or 0)


async def _payout_total(db: DB, user_id: uuid.UUID) -> Decimal:
    value = (
        await db.execute(
            select(func.coalesce(func.sum(AllowancePayout.amount), 0)).where(AllowancePayout.user_id == user_id)
        )
    ).scalar_one()
    return Decimal(str(value or 0))


def _week_start_ts(today: date) -> datetime:
    return datetime.combine(today - timedelta(days=today.weekday()), datetime.min.time(), tzinfo=timezone.utc)


@router.get("/me", response_model=AllowanceMe)
async def allowance_me(user: CurrentUser, db: DB) -> AllowanceMe:
    family = await db.get(Family, user.family_id)
    today = date.today()
    month_start_ts = datetime.combine(_month_start(today), datetime.min.time(), tzinfo=timezone.utc)

    lifetime_points = await _points(db, user.id)
    week_points = await _points(db, user.id, since=_week_start_ts(today))
    month_points = await _points(db, user.id, since=month_start_ts)
    earnings = _Earnings(user, await _approved_rows(db, user.id), today)
    earned_lifetime = earnings.lifetime
    payouts_total = await _payout_total(db, user.id)

    return AllowanceMe(
        rate=float(user.allowance_rate) if user.allowance_rate is not None else None,
        points_per_unit=user.allowance_points_per_unit,
        currency=family.currency,
        earned_week=_to_money(_earned(week_points, user)),
        earned_month=_to_money(_earned(month_points, user)),
        earned_lifetime=_to_money(earned_lifetime),
        payouts_total=_to_money(payouts_total),
        balance=_to_money(earned_lifetime - payouts_total),
        points_week=week_points,
        points_lifetime=lifetime_points,
        points_pending=await _pending_points(db, user.id),
        **_mode_fields(user, earnings),
    )


@router.get("/overview", response_model=list[AllowanceOverviewItem])
async def allowance_overview(adult: AdultUser, db: DB) -> list[AllowanceOverviewItem]:
    family = await db.get(Family, adult.family_id)
    members = (
        await db.execute(
            select(User)
            .where(User.family_id == adult.family_id, User.role == "child")
            .order_by(User.display_name)
        )
    ).scalars().all()

    week_ts = _week_start_ts(date.today())
    items: list[AllowanceOverviewItem] = []
    for member in members:
        week_points = await _points(db, member.id, since=week_ts)
        earnings = _Earnings(member, await _approved_rows(db, member.id), date.today())
        earned_lifetime = earnings.lifetime
        payouts_total = await _payout_total(db, member.id)
        items.append(
            AllowanceOverviewItem(
                user_id=member.id,
                display_name=member.display_name,
                color=member.color,
                rate=float(member.allowance_rate) if member.allowance_rate is not None else None,
                points_per_unit=member.allowance_points_per_unit,
                currency=family.currency,
                earned_week=_to_money(_earned(week_points, member)),
                earned_lifetime=_to_money(earned_lifetime),
                payouts_total=_to_money(payouts_total),
                balance=_to_money(earned_lifetime - payouts_total),
                points_week=week_points,
                points_pending=await _pending_points(db, member.id),
                **_mode_fields(member, earnings),
            )
        )
    return items


@router.put("/children/{member_id}/rate", response_model=AllowanceOverviewItem)
async def set_child_rate(member_id: uuid.UUID, payload: AllowanceRateIn, adult: FamilyManager, db: DB) -> AllowanceOverviewItem:
    """How one child earns: points per unit (None turns it off) or a point goal per period."""
    member = await db.get(User, member_id)
    if member is None or member.family_id != adult.family_id or member.role != "child":
        raise HTTPException(status_code=404, detail="Child not found")
    member.allowance_points_per_unit = payload.points_per_unit
    member.allowance_rate = None  # the points-per-unit rate replaces the older one
    min_points = payload.min_points if payload.mode == "goal" else None
    amount = Decimal(str(payload.amount)).quantize(Decimal("0.01")) if payload.mode == "goal" else None
    current_amount = Decimal(str(member.allowance_amount)) if member.allowance_amount is not None else None
    if (
        payload.mode != (member.allowance_mode or "points")
        or min_points != member.allowance_min_points
        or amount != current_amount
        or payload.period != member.allowance_period
    ):
        # A new setup applies from the current period on; earlier periods keep what they earned.
        member.allowance_min_points_since = _period_start(date.today(), payload.period)
    member.allowance_mode = payload.mode
    member.allowance_min_points = min_points
    member.allowance_amount = amount
    member.allowance_period = payload.period
    await db.commit()
    return next(item for item in await allowance_overview(adult, db) if item.user_id == member.id)


@router.get("/payouts", response_model=list[AllowancePayoutOut])
async def list_payouts(user: CurrentUser, db: DB, user_id: uuid.UUID | None = None) -> list[AllowancePayout]:
    """Payout history: your own, or (adults) a child's."""
    target = user_id or user.id
    if target != user.id:
        if user.role not in {"admin", "adult"}:
            raise HTTPException(status_code=403, detail="Adult or admin privileges required")
        member = await db.get(User, target)
        if member is None or member.family_id != user.family_id:
            raise HTTPException(status_code=404, detail="Member not found")
    rows = (
        await db.execute(
            select(AllowancePayout)
            .where(AllowancePayout.user_id == target, AllowancePayout.family_id == user.family_id)
            .order_by(AllowancePayout.paid_at.desc())
            .limit(100)
        )
    ).scalars().all()
    return list(rows)


@router.post("/payouts", response_model=AllowancePayoutOut, status_code=status.HTTP_201_CREATED)
async def create_payout(payload: AllowancePayoutCreate, adult: AdultUser, db: DB) -> AllowancePayout:
    member = await db.get(User, payload.user_id)
    if member is None or member.family_id != adult.family_id:
        raise HTTPException(status_code=404, detail="Member not found")

    has_jars = bool(await _active_jars(db, member))
    jar = await _jar(db, member, payload.jar_id)
    if has_jars:
        if Decimal(str(payload.amount)) > (await _balances(db, member))[jar.id if jar else None]:
            raise HTTPException(status_code=409, detail="There isn't that much in the jar")
    payout = AllowancePayout(
        family_id=adult.family_id,
        user_id=member.id,
        amount=payload.amount,
        note=payload.note,
        jar_id=jar.id if jar else None,
        paid_at=datetime.now(timezone.utc),
        created_by=adult.id,
    )
    db.add(payout)
    if has_jars:
        db.add(
            JarEntry(
                family_id=adult.family_id,
                user_id=member.id,
                jar_id=jar.id if jar else None,
                amount=-payload.amount,
                kind="payout",
                note=payload.note,
                created_by=adult.id,
            )
        )
    await db.commit()
    await db.refresh(payout)
    return payout


@router.patch("/settings")
async def patch_allowance_settings(payload: FamilySettingsPatch, admin: FamilyManager, db: DB) -> dict:
    family = await db.get(Family, admin.family_id)
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(family, field, value)
    await db.commit()
    return {"ok": True}


@router.get("/settings", response_model=FamilySettingsOut)
async def get_allowance_settings(user: CurrentUser, db: DB) -> FamilySettingsOut:
    family = await db.get(Family, user.family_id)
    return FamilySettingsOut(
        currency=family.currency,
        shopping_task_points=family.shopping_task_points,
        child_approval=family.child_approval,
    )


# --- Savings jars ---------------------------------------------------------------------------

CENT = Decimal("0.01")

_GOAL_TEXT = {
    "en": ("Savings goal reached!", "{name} has saved up for {goal}"),
    "sv": ("Sparmålet nått!", "{name} har sparat ihop till {goal}"),
    "nb": ("Sparemålet nådd!", "{name} har spart til {goal}"),
    "da": ("Sparemålet nået!", "{name} har sparet op til {goal}"),
    "fi": ("Säästötavoite saavutettu!", "{name} on säästänyt: {goal}"),
}


class JarIn(BaseModel):
    user_id: uuid.UUID
    name: str = Field(min_length=1, max_length=60)
    pct: int = Field(default=0, ge=0, le=100)
    target: float | None = Field(default=None, gt=0, le=1_000_000)


class JarRequestIn(BaseModel):
    """A child's own savings goal: what for, how much, and how much of their money should go in."""

    name: str = Field(min_length=1, max_length=60)
    target: float = Field(gt=0, le=1_000_000)
    pct: int = Field(default=20, ge=0, le=100)


class JarApproveIn(BaseModel):
    # The adult may change the share before approving.
    pct: int = Field(ge=0, le=100)


class JarPatch(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    pct: int = Field(ge=0, le=100)
    target: float | None = Field(default=None, gt=0, le=1_000_000)


class JarMoveIn(BaseModel):
    user_id: uuid.UUID
    # None = Spend.
    from_jar_id: uuid.UUID | None = None
    to_jar_id: uuid.UUID | None = None
    amount: float = Field(gt=0, le=1_000_000)


class JarBonusIn(BaseModel):
    user_id: uuid.UUID
    jar_id: uuid.UUID | None = None
    amount: float = Field(gt=0, le=1_000_000)
    note: str | None = Field(default=None, max_length=200)


class JarOut(BaseModel):
    id: uuid.UUID
    name: str
    pct: int
    target: float | None
    balance: float
    progress: float | None  # 0–1 towards the target
    reached_at: datetime | None


class JarEntryOut(BaseModel):
    id: uuid.UUID
    jar_id: uuid.UUID | None
    jar_name: str | None  # None = Spend
    amount: float
    kind: str
    note: str | None
    created_at: datetime


class JarRequestOut(BaseModel):
    id: uuid.UUID
    name: str
    pct: int
    target: float
    created_at: datetime


class JarsOut(BaseModel):
    enabled: bool  # the child has at least one jar besides Spend
    currency: str
    spend: float
    spend_pct: int
    jars: list[JarOut]
    entries: list[JarEntryOut]
    # Goals the child has proposed, waiting for an adult (2.8.3).
    requests: list[JarRequestOut] = []


def _is_adult(user: User) -> bool:
    return user.role in {"admin", "adult"}


async def _member(db, viewer: User, user_id: uuid.UUID | None, adult_only: bool = False) -> User:
    """Whose jars: yourself, or (adults) anyone in the family."""
    target_id = user_id or viewer.id
    if (target_id != viewer.id or adult_only) and not _is_adult(viewer):
        raise HTTPException(status_code=403, detail="Adult or admin privileges required")
    member = await db.get(User, target_id)
    if member is None or member.family_id != viewer.family_id:
        raise HTTPException(status_code=404, detail="Member not found")
    return member


async def _active_jars(db, member: User) -> list[SavingsJar]:
    return list(
        (
            await db.execute(
                select(SavingsJar)
                .where(SavingsJar.user_id == member.id, SavingsJar.archived.is_(False), SavingsJar.pending.is_(False))
                .order_by(SavingsJar.created_at)
            )
        ).scalars().all()
    )


async def _jar(db, member: User, jar_id: uuid.UUID | None) -> SavingsJar | None:
    """An active jar of the member; None stands for Spend."""
    if jar_id is None:
        return None
    jar = await db.get(SavingsJar, jar_id)
    if jar is None or jar.user_id != member.id or jar.archived:
        raise HTTPException(status_code=404, detail="Jar not found")
    return jar


async def _balances(db, member: User) -> dict[uuid.UUID | None, Decimal]:
    """Books earnings not yet split into the jars, then returns the balance per jar (None = Spend).

    Invariant: all entries add up to earned − paid out + bonuses. What is missing is new
    earnings, split by each jar's share (Spend gets the rest); a shortfall (e.g. a payout made
    before the jars existed) is taken from Spend."""
    jars = await _active_jars(db, member)
    earned = _Earnings(member, await _approved_rows(db, member.id), date.today()).lifetime
    payouts = await _payout_total(db, member.id)
    rows = (
        await db.execute(
            select(JarEntry.jar_id, JarEntry.kind, func.coalesce(func.sum(JarEntry.amount), 0))
            .where(JarEntry.user_id == member.id)
            .group_by(JarEntry.jar_id, JarEntry.kind)
        )
    ).all()
    balances: dict[uuid.UUID | None, Decimal] = {None: Decimal("0"), **{j.id: Decimal("0") for j in jars}}
    total = bonuses = Decimal("0")
    for jar_id, kind, amount in rows:
        amount = Decimal(str(amount))
        total += amount
        if kind == "bonus":
            bonuses += amount
        if jar_id in balances:
            balances[jar_id] += amount
    missing = (earned - payouts + bonuses - total).quantize(CENT, rounding=ROUND_HALF_UP)
    if missing != 0 and jars:
        if missing > 0:
            rest = missing
            for jar in jars:
                share = (missing * jar.pct / 100).quantize(CENT, rounding=ROUND_HALF_UP)
                if share != 0:
                    db.add(JarEntry(family_id=member.family_id, user_id=member.id, jar_id=jar.id, amount=share, kind="allocation"))
                    balances[jar.id] += share
                    rest -= share
            if rest != 0:
                db.add(JarEntry(family_id=member.family_id, user_id=member.id, jar_id=None, amount=rest, kind="allocation"))
                balances[None] += rest
        else:
            db.add(JarEntry(family_id=member.family_id, user_id=member.id, jar_id=None, amount=missing, kind="adjust"))
            balances[None] += missing
        await db.commit()
    await _check_goals(db, member, jars, balances)
    return balances


async def _check_goals(db, member: User, jars: list[SavingsJar], balances: dict) -> None:
    """Celebrates jars that reached their target (once): the child and the adults are notified."""
    reached = [j for j in jars if j.target and not j.reached_at and balances[j.id] >= Decimal(str(j.target))]
    if not reached:
        return
    for jar in reached:
        jar.reached_at = datetime.now(timezone.utc)
    await db.commit()
    family = (await db.execute(select(User).where(User.family_id == member.family_id))).scalars().all()
    for jar in reached:
        for person in family:
            if person.id != member.id and not _is_adult(person):
                continue
            title, body = _GOAL_TEXT.get(person.language or "en", _GOAL_TEXT["en"])
            await notify(
                db,
                person,
                {"title": title, "body": body.format(name=member.display_name, goal=jar.name), "route": "/allowance", "kind": "savings_goal"},
            )


async def _jars_out(db, member: User) -> JarsOut:
    family = await db.get(Family, member.family_id)
    jars = await _active_jars(db, member)
    balances = await _balances(db, member) if jars else {None: Decimal("0")}
    all_jars = (await db.execute(select(SavingsJar).where(SavingsJar.user_id == member.id))).scalars().all()
    names = {j.id: j.name for j in all_jars}
    entries = (
        await db.execute(select(JarEntry).where(JarEntry.user_id == member.id).order_by(JarEntry.created_at.desc()).limit(50))
    ).scalars().all()

    def progress(jar: SavingsJar) -> float | None:
        if not jar.target:
            return None
        if jar.reached_at:
            return 1.0
        return max(0.0, min(1.0, float(balances[jar.id]) / float(jar.target)))

    return JarsOut(
        enabled=bool(jars),
        currency=family.currency,
        spend=_to_money(balances[None]),
        spend_pct=100 - sum(j.pct for j in jars),
        jars=[
            JarOut(
                id=j.id,
                name=j.name,
                pct=j.pct,
                target=float(j.target) if j.target else None,
                balance=_to_money(balances[j.id]),
                progress=progress(j),
                reached_at=j.reached_at,
            )
            for j in jars
        ],
        entries=[
            JarEntryOut(id=e.id, jar_id=e.jar_id, jar_name=names.get(e.jar_id), amount=float(e.amount), kind=e.kind, note=e.note, created_at=e.created_at)
            for e in entries
        ],
        requests=[
            JarRequestOut(id=j.id, name=j.name, pct=j.pct, target=float(j.target or 0), created_at=j.created_at)
            for j in all_jars
            if j.pending and not j.archived
        ],
    )


def _check_total(jars: list[SavingsJar], changed: SavingsJar | None, pct: int) -> None:
    others = sum(j.pct for j in jars if changed is None or j.id != changed.id)
    if others + pct > 100:
        raise HTTPException(status_code=422, detail="The jars can't get more than 100 % together")


@router.get("/jars", response_model=JarsOut)
async def get_jars(user: CurrentUser, db: DB, user_id: uuid.UUID | None = None) -> JarsOut:
    return await _jars_out(db, await _member(db, user, user_id))


@router.post("/jars", response_model=JarsOut, status_code=status.HTTP_201_CREATED)
async def add_jar(payload: JarIn, adult: AdultUser, db: DB) -> JarsOut:
    """Adults add a jar for a child; only new earnings are split into it."""
    member = await _member(db, adult, payload.user_id, adult_only=True)
    jars = await _active_jars(db, member)
    _check_total(jars, None, payload.pct)
    if jars:
        await _balances(db, member)  # book earnings so far with the old split
    db.add(
        SavingsJar(
            family_id=member.family_id,
            user_id=member.id,
            name=payload.name.strip(),
            pct=payload.pct,
            target=payload.target,
            created_by=adult.id,
        )
    )
    await db.commit()
    return await _jars_out(db, member)


_REQUEST_TEXT = {
    "en": ("A savings goal to approve", "{name} wants to save up for {goal} ({amount})"),
    "sv": ("Ett sparmål att godkänna", "{name} vill spara till {goal} ({amount})"),
    "nb": ("Et sparemål å godkjenne", "{name} vil spare til {goal} ({amount})"),
    "da": ("Et sparemål at godkende", "{name} vil spare op til {goal} ({amount})"),
    "fi": ("Säästötavoite hyväksyttäväksi", "{name} haluaa säästää: {goal} ({amount})"),
}
_ANSWER_TEXT = {
    "en": ("Your savings goal is approved", "Your savings goal wasn't approved", "{goal}"),
    "sv": ("Ditt sparmål är godkänt", "Ditt sparmål blev inte godkänt", "{goal}"),
    "nb": ("Sparemålet ditt er godkjent", "Sparemålet ditt ble ikke godkjent", "{goal}"),
    "da": ("Dit sparemål er godkendt", "Dit sparemål blev ikke godkendt", "{goal}"),
    "fi": ("Säästötavoitteesi hyväksyttiin", "Säästötavoitettasi ei hyväksytty", "{goal}"),
}


@router.post("/jars/request", response_model=JarsOut, status_code=status.HTTP_201_CREATED)
async def request_jar(payload: JarRequestIn, user: CurrentUser, db: DB) -> JarsOut:
    """A child proposes a savings goal of their own; it waits for an adult (no money goes in until then)."""
    if _is_adult(user):
        raise HTTPException(status_code=422, detail="Adults add jars directly")
    db.add(SavingsJar(family_id=user.family_id, user_id=user.id, name=payload.name.strip(), pct=payload.pct, target=payload.target, pending=True, created_by=user.id))
    await db.commit()
    family = await db.get(Family, user.family_id)
    for adult in (await db.execute(select(User).where(User.family_id == user.family_id, User.role.in_(["admin", "adult"])))).scalars().all():
        title, body = _REQUEST_TEXT.get(adult.language or "en", _REQUEST_TEXT["en"])
        amount = f"{payload.target:g} {family.currency}"
        await notify(db, adult, {"title": title, "body": body.format(name=user.display_name, goal=payload.name.strip(), amount=amount), "route": "/allowance", "kind": "savings_request"})
    return await _jars_out(db, user)


async def _tell_child(db, jar: SavingsJar, approved: bool) -> None:
    child = await db.get(User, jar.user_id)
    if child is None:
        return
    yes, no, body = _ANSWER_TEXT.get(child.language or "en", _ANSWER_TEXT["en"])
    await notify(db, child, {"title": yes if approved else no, "body": body.format(goal=jar.name), "route": "/allowance", "kind": "savings_answer"})


@router.post("/jars/{jar_id}/approve", response_model=JarsOut)
async def approve_jar(jar_id: uuid.UUID, payload: JarApproveIn, adult: AdultUser, db: DB) -> JarsOut:
    jar = await db.get(SavingsJar, jar_id)
    if jar is None or jar.family_id != adult.family_id or not jar.pending or jar.archived:
        raise HTTPException(status_code=404, detail="No such request")
    member = await _member(db, adult, jar.user_id, adult_only=True)
    jars = await _active_jars(db, member)
    _check_total(jars, None, payload.pct)
    if jars:
        await _balances(db, member)  # earnings so far keep the old split
    jar.pending = False
    jar.pct = payload.pct
    await db.commit()
    await _tell_child(db, jar, True)
    return await _jars_out(db, member)


@router.patch("/jars/{jar_id}", response_model=JarsOut)
async def update_jar(jar_id: uuid.UUID, payload: JarPatch, adult: AdultUser, db: DB) -> JarsOut:
    jar = await db.get(SavingsJar, jar_id)
    if jar is None or jar.family_id != adult.family_id or jar.archived:
        raise HTTPException(status_code=404, detail="Jar not found")
    member = await _member(db, adult, jar.user_id, adult_only=True)
    _check_total(await _active_jars(db, member), jar, payload.pct)
    await _balances(db, member)
    jar.name = payload.name.strip()
    jar.pct = payload.pct
    if payload.target != (float(jar.target) if jar.target else None):
        jar.target = payload.target
        jar.reached_at = None  # a new goal can be celebrated again
    await db.commit()
    return await _jars_out(db, member)


@router.delete("/jars/{jar_id}", response_model=JarsOut)
async def remove_jar(jar_id: uuid.UUID, adult: AdultUser, db: DB) -> JarsOut:
    """The jar's money goes back to Spend; the jar stays in the history. A proposed goal that is
    turned down is simply removed (it never had money)."""
    jar = await db.get(SavingsJar, jar_id)
    if jar is not None and jar.pending and jar.family_id == adult.family_id:
        member = await _member(db, adult, jar.user_id, adult_only=True)
        await _tell_child(db, jar, False)
        await db.delete(jar)
        await db.commit()
        return await _jars_out(db, member)
    if jar is None or jar.family_id != adult.family_id or jar.archived:
        raise HTTPException(status_code=404, detail="Jar not found")
    member = await _member(db, adult, jar.user_id, adult_only=True)
    left = (await _balances(db, member))[jar.id]
    if left != 0:
        db.add(JarEntry(family_id=member.family_id, user_id=member.id, jar_id=jar.id, amount=-left, kind="move", created_by=adult.id))
        db.add(JarEntry(family_id=member.family_id, user_id=member.id, jar_id=None, amount=left, kind="move", note=jar.name, created_by=adult.id))
    jar.archived = True
    await db.commit()
    return await _jars_out(db, member)


@router.post("/jars/move", response_model=JarsOut)
async def move_between_jars(payload: JarMoveIn, user: CurrentUser, db: DB) -> JarsOut:
    member = await _member(db, user, payload.user_id)
    source = await _jar(db, member, payload.from_jar_id)
    target = await _jar(db, member, payload.to_jar_id)
    if payload.from_jar_id == payload.to_jar_id:
        raise HTTPException(status_code=422, detail="Choose two different jars")
    # Children may put money aside, not take it back out of a jar.
    if not _is_adult(user) and source is not None:
        raise HTTPException(status_code=403, detail="Ask an adult to move money out of this jar")
    amount = Decimal(str(payload.amount)).quantize(CENT)
    if amount > (await _balances(db, member))[payload.from_jar_id]:
        raise HTTPException(status_code=409, detail="There isn't that much in the jar")
    db.add(JarEntry(family_id=member.family_id, user_id=member.id, jar_id=source.id if source else None, amount=-amount, kind="move", created_by=user.id))
    db.add(JarEntry(family_id=member.family_id, user_id=member.id, jar_id=target.id if target else None, amount=amount, kind="move", created_by=user.id))
    await db.commit()
    return await _jars_out(db, member)


@router.post("/jars/bonus", response_model=JarsOut)
async def add_bonus(payload: JarBonusIn, adult: AdultUser, db: DB) -> JarsOut:
    """A gift from the parents into a jar, e.g. interest or matching."""
    member = await _member(db, adult, payload.user_id, adult_only=True)
    jar = await _jar(db, member, payload.jar_id)
    await _balances(db, member)  # book earnings first, so the bonus isn't split
    db.add(
        JarEntry(
            family_id=member.family_id,
            user_id=member.id,
            jar_id=jar.id if jar else None,
            amount=Decimal(str(payload.amount)).quantize(CENT),
            kind="bonus",
            note=payload.note,
            created_by=adult.id,
        )
    )
    await db.commit()
    return await _jars_out(db, member)

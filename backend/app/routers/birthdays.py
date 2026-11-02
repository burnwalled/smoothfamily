"""Birthdays and wish lists.

People: family members (linked with user_id) and others (grandparents, friends). Adults manage
the people. Wishes: the person themself or an adult adds them; anyone else can reserve one
("I'm buying this") – hidden from the person the wish is for. Gift ideas (kind "idea") are
notes only adults see, never the person themself.
"""
import uuid
from datetime import date

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, select

from app.deps import CurrentUser, DB, FamilyManager, require_app
from app.models import Person, User, WishItem

router = APIRouter(prefix="/api/birthdays", tags=["birthdays"], dependencies=[require_app("birthdays")])


def next_birthday(month: int, day: int, today: date) -> date:
    """The next date the birthday falls on (today counts); 29 Feb becomes 28 Feb in other years."""
    for year in (today.year, today.year + 1):
        try:
            when = date(year, month, day)
        except ValueError:  # 29 February in a non-leap year
            when = date(year, 2, 28)
        if when >= today:
            return when
    raise AssertionError("unreachable")


class PersonIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    user_id: uuid.UUID | None = None
    birth_month: int | None = Field(default=None, ge=1, le=12)
    birth_day: int | None = Field(default=None, ge=1, le=31)
    birth_year: int | None = Field(default=None, ge=1900, le=2100)

    @model_validator(mode="after")
    def _valid_date(self) -> "PersonIn":
        if (self.birth_month is None) != (self.birth_day is None):
            raise ValueError("Give both month and day, or neither")
        if self.birth_month is not None:
            try:
                date(2000, self.birth_month, self.birth_day)  # a leap year allows 29 Feb
            except ValueError as exc:
                raise ValueError("No such date") from exc
        return self


class PersonOut(BaseModel):
    id: uuid.UUID
    name: str
    user_id: uuid.UUID | None
    birth_month: int | None
    birth_day: int | None
    birth_year: int | None
    next_birthday: date | None
    days_until: int | None
    turns: int | None  # the age on the next birthday, when the year is known
    wish_count: int


class WishIn(BaseModel):
    kind: str = Field(default="wish", pattern=r"^(wish|idea)$")
    title: str = Field(min_length=1, max_length=200)
    url: str | None = Field(default=None, max_length=1000, pattern=r"^$|^https?://")
    note: str | None = Field(default=None, max_length=2000)


class WishOut(BaseModel):
    id: uuid.UUID
    kind: str
    title: str
    url: str | None
    note: str | None
    # None for the person the wish is for: they must not know.
    reserved: bool | None
    reserved_by_me: bool
    reserved_by_name: str | None
    can_edit: bool


def _is_adult(user: User) -> bool:
    return user.role in {"admin", "adult"}


def _person_out(person: Person, today: date, wish_count: int) -> PersonOut:
    when = turns = days = None
    if person.birth_month and person.birth_day:
        when = next_birthday(person.birth_month, person.birth_day, today)
        days = (when - today).days
        turns = when.year - person.birth_year if person.birth_year else None
    return PersonOut(
        id=person.id,
        name=person.name,
        user_id=person.user_id,
        birth_month=person.birth_month,
        birth_day=person.birth_day,
        birth_year=person.birth_year,
        next_birthday=when,
        days_until=days,
        turns=turns,
        wish_count=wish_count,
    )


async def _person(db, user: User, person_id: uuid.UUID) -> Person:
    person = await db.get(Person, person_id)
    if person is None or person.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Person not found")
    return person


def _require_adult(user: User) -> None:
    if not _is_adult(user):
        raise HTTPException(status_code=403, detail="Only adults manage birthdays")


async def _check_member(db, user: User, user_id: uuid.UUID | None) -> None:
    if user_id is None:
        return
    member = await db.get(User, user_id)
    if member is None or member.family_id != user.family_id:
        raise HTTPException(status_code=422, detail="Unknown family member")


@router.get("/people", response_model=list[PersonOut])
async def list_people(user: CurrentUser, db: DB) -> list[PersonOut]:
    today = date.today()
    people = (await db.execute(select(Person).where(Person.family_id == user.family_id))).scalars().all()
    counts = dict(
        (
            await db.execute(
                select(WishItem.person_id, func.count(WishItem.id))
                .where(WishItem.family_id == user.family_id, WishItem.kind == "wish")
                .group_by(WishItem.person_id)
            )
        ).all()
    )
    out = [_person_out(p, today, counts.get(p.id, 0)) for p in people]
    # Soonest birthday first; people without a date last.
    return sorted(out, key=lambda p: (p.days_until is None, p.days_until or 0, p.name.lower()))


@router.post("/people", response_model=PersonOut, status_code=status.HTTP_201_CREATED)
async def create_person(payload: PersonIn, user: FamilyManager, db: DB) -> PersonOut:
    _require_adult(user)
    await _check_member(db, user, payload.user_id)
    person = Person(family_id=user.family_id, created_by=user.id, **payload.model_dump())
    db.add(person)
    await db.commit()
    await db.refresh(person)
    return _person_out(person, date.today(), 0)


@router.patch("/people/{person_id}", response_model=PersonOut)
async def update_person(person_id: uuid.UUID, payload: PersonIn, user: FamilyManager, db: DB) -> PersonOut:
    _require_adult(user)
    person = await _person(db, user, person_id)
    await _check_member(db, user, payload.user_id)
    for field, value in payload.model_dump().items():
        setattr(person, field, value)
    await db.commit()
    await db.refresh(person)
    count = (
        await db.execute(select(func.count(WishItem.id)).where(WishItem.person_id == person.id, WishItem.kind == "wish"))
    ).scalar_one()
    return _person_out(person, date.today(), count)


@router.delete("/people/{person_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_person(person_id: uuid.UUID, user: FamilyManager, db: DB) -> None:
    _require_adult(user)
    person = await _person(db, user, person_id)
    for wish in (await db.execute(select(WishItem).where(WishItem.person_id == person.id))).scalars().all():
        await db.delete(wish)
    await db.delete(person)
    await db.commit()


def _wish_out(wish: WishItem, person: Person, user: User, names: dict[uuid.UUID, str]) -> WishOut:
    is_owner = person.user_id == user.id
    # Reserved in the app, or by a relative through a share link.
    reserved = None if is_owner else (wish.reserved_by is not None or wish.reserved_by_guest is not None)
    guest = wish.reserved_by_guest
    return WishOut(
        id=wish.id,
        kind=wish.kind,
        title=wish.title,
        url=wish.url,
        note=wish.note,
        reserved=reserved,
        reserved_by_me=not is_owner and wish.reserved_by == user.id,
        reserved_by_name=None if is_owner else names.get(wish.reserved_by) if wish.reserved_by else guest,
        can_edit=wish.created_by == user.id or (wish.kind == "wish" and is_owner) or _is_adult(user),
    )


def _may_see(wish: WishItem, person: Person, user: User) -> bool:
    if wish.kind == "idea":
        return _is_adult(user) and person.user_id != user.id
    return True


@router.get("/people/{person_id}/wishes", response_model=list[WishOut])
async def list_wishes(person_id: uuid.UUID, user: CurrentUser, db: DB) -> list[WishOut]:
    person = await _person(db, user, person_id)
    wishes = (
        await db.execute(select(WishItem).where(WishItem.person_id == person.id).order_by(WishItem.created_at))
    ).scalars().all()
    names = dict((await db.execute(select(User.id, User.display_name).where(User.family_id == user.family_id))).all())
    return [_wish_out(w, person, user, names) for w in wishes if _may_see(w, person, user)]


@router.post("/people/{person_id}/wishes", response_model=WishOut, status_code=status.HTTP_201_CREATED)
async def add_wish(person_id: uuid.UUID, payload: WishIn, user: CurrentUser, db: DB) -> WishOut:
    person = await _person(db, user, person_id)
    is_owner = person.user_id == user.id
    if payload.kind == "idea" and (not _is_adult(user) or is_owner):
        raise HTTPException(status_code=403, detail="Gift ideas are for adults, about someone else")
    if payload.kind == "wish" and not (is_owner or _is_adult(user)):
        raise HTTPException(status_code=403, detail="Only the person themself or an adult adds wishes")
    wish = WishItem(
        family_id=user.family_id,
        person_id=person.id,
        kind=payload.kind,
        title=payload.title.strip(),
        url=payload.url or None,
        note=payload.note or None,
        created_by=user.id,
    )
    db.add(wish)
    await db.commit()
    await db.refresh(wish)
    return _wish_out(wish, person, user, {})


async def _wish(db, user: User, wish_id: uuid.UUID) -> tuple[WishItem, Person]:
    wish = await db.get(WishItem, wish_id)
    if wish is None or wish.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Wish not found")
    person = await db.get(Person, wish.person_id)
    if not _may_see(wish, person, user):
        raise HTTPException(status_code=404, detail="Wish not found")
    return wish, person


@router.patch("/wishes/{wish_id}", response_model=WishOut)
async def update_wish(wish_id: uuid.UUID, payload: WishIn, user: CurrentUser, db: DB) -> WishOut:
    wish, person = await _wish(db, user, wish_id)
    if not _wish_out(wish, person, user, {}).can_edit or payload.kind != wish.kind:
        raise HTTPException(status_code=403, detail="You can't change this wish")
    wish.title = payload.title.strip()
    wish.url = payload.url or None
    wish.note = payload.note or None
    await db.commit()
    return _wish_out(wish, person, user, {})


@router.delete("/wishes/{wish_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_wish(wish_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    wish, person = await _wish(db, user, wish_id)
    if not _wish_out(wish, person, user, {}).can_edit:
        raise HTTPException(status_code=403, detail="You can't remove this wish")
    await db.delete(wish)
    await db.commit()


@router.post("/wishes/{wish_id}/reserve", response_model=WishOut)
async def reserve_wish(wish_id: uuid.UUID, user: CurrentUser, db: DB) -> WishOut:
    wish, person = await _wish(db, user, wish_id)
    if wish.kind != "wish" or person.user_id == user.id:
        raise HTTPException(status_code=403, detail="You can't reserve this")
    if (wish.reserved_by is not None and wish.reserved_by != user.id) or wish.reserved_by_guest is not None:
        raise HTTPException(status_code=409, detail="Someone is already buying this")
    wish.reserved_by = user.id
    await db.commit()
    return _wish_out(wish, person, user, {user.id: user.display_name})


@router.delete("/wishes/{wish_id}/reserve", response_model=WishOut)
async def unreserve_wish(wish_id: uuid.UUID, user: CurrentUser, db: DB) -> WishOut:
    wish, person = await _wish(db, user, wish_id)
    if person.user_id == user.id or (wish.reserved_by != user.id and not _is_adult(user)):
        raise HTTPException(status_code=403, detail="You can't undo this reservation")
    wish.reserved_by = None
    if _is_adult(user):  # adults can also undo a reservation made through a share link
        wish.reserved_by_guest = None
        wish.guest_key_hash = None
    await db.commit()
    return _wish_out(wish, person, user, {})

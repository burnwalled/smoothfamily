"""Reminders for pet care that is due: a week before and on the day, to the adults."""
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AppSetting, Pet, PetCare, User
from app.services.notify import notify

REMIND_DAYS = (7, 0)

_TEXT = {
    "en": ("{pet}: {title}", {7: "Due in a week", 0: "Due today"}),
    "sv": ("{pet}: {title}", {7: "Om en vecka", 0: "Idag"}),
    "nb": ("{pet}: {title}", {7: "Om en uke", 0: "I dag"}),
    "da": ("{pet}: {title}", {7: "Om en uge", 0: "I dag"}),
    "fi": ("{pet}: {title}", {7: "Viikon päästä", 0: "Tänään"}),
}


async def run_pet_care_reminders(db: AsyncSession, now: datetime | None = None) -> int:
    now = now or datetime.now(timezone.utc)
    if now.hour < 7:  # mornings, not in the night
        return 0
    today = now.date()
    sent = 0
    rows = (await db.execute(select(PetCare, Pet).join(Pet, Pet.id == PetCare.pet_id).where(PetCare.next_due.is_not(None)))).all()
    for care, pet in rows:
        days = (care.next_due - today).days
        if days not in REMIND_DAYS:
            continue
        key = f"petcare.sent:{care.id}:{care.next_due.isoformat()}:{days}"
        if await db.get(AppSetting, key) is not None:
            continue
        adults = (
            await db.execute(select(User).where(User.family_id == pet.family_id, User.role.in_(["admin", "adult"])))
        ).scalars().all()
        for adult in adults:
            if "pets" not in adult.apps:
                continue
            title, when = _TEXT.get(adult.language or "en", _TEXT["en"])
            await notify(db, adult, {"title": title.format(pet=pet.name, title=care.title), "body": when[days], "route": "/pets", "kind": "pet_care"}, pref="calendar_mine")
            sent += 1
        db.add(AppSetting(key=key, value=now.isoformat()))
        await db.commit()
    return sent


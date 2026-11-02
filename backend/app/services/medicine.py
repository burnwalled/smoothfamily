"""Medicine schedules, who may see them, and the reminders.

Times are local (the server's time zone); a dose is identified by its UTC time. At the time of a
dose the member is reminded (for a pet: the adults); an hour later, if it hasn't been ticked off
and the medicine asks for it, the adults are told it was missed (for an adult's own medicine:
only that adult).
"""
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Medication, MedicationDose, Pet, Task, User
from app.services.notify import notify

MISSED_AFTER = timedelta(hours=1)
# Older doses are left alone (e.g. after the server was off for a while).
MISSED_WINDOW = timedelta(hours=12)
# Doses older than this are not reminded any more (e.g. after the server was off).
REMIND_WINDOW = timedelta(minutes=30)

_TEXT = {
    "reminder": {
        "en": ("Time for medicine", "{who}: {name} {dose}"),
        "sv": ("Dags för medicin", "{who}: {name} {dose}"),
        "nb": ("Tid for medisin", "{who}: {name} {dose}"),
        "da": ("Tid til medicin", "{who}: {name} {dose}"),
        "fi": ("Lääkkeen aika", "{who}: {name} {dose}"),
    },
    "missed": {
        "en": ("Dose not ticked off", "{who} hasn't had {name} at {time}"),
        "sv": ("Dos inte avbockad", "{who} har inte fått {name} kl. {time}"),
        "nb": ("Dose ikke krysset av", "{who} har ikke fått {name} kl. {time}"),
        "da": ("Dosis ikke krydset af", "{who} har ikke fået {name} kl. {time}"),
        "fi": ("Annosta ei ole merkitty", "{who} ei ole saanut lääkettä {name} klo {time}"),
    },
}


def _zone() -> ZoneInfo:
    return ZoneInfo(get_settings().timezone)


async def sync_tasks(db: AsyncSession, med: Medication) -> None:
    """A child's or a pet's medicine is done as tasks (2.9.0): one daily task per time of day, worth
    the medicine's points, for the course's days. A pet's doses take turns like its other chores.
    An adult's own medicine stays private – no task. Ticking a task off ticks the dose off.
    The caller commits."""
    owner = await db.get(User, med.user_id) if med.user_id else None
    pet = await db.get(Pet, med.pet_id) if med.pet_id else None
    wanted = list(med.times or []) if med.active and (pet is not None or (owner is not None and owner.role == "child")) else []
    tasks = {t.dose_time: t for t in (await db.execute(select(Task).where(Task.medication_id == med.id))).scalars().all()}

    # Whose turn: like the pet's own chores, or the child it's for.
    assignee, rotation, mode = (owner.id if owner else None), [], "done"
    if pet is not None:
        chore = (
            await db.execute(
                select(Task).where(Task.pet_id == pet.id, Task.medication_id.is_(None), Task.active.is_(True)).order_by(Task.created_at).limit(1)
            )
        ).scalar_one_or_none()
        if chore is not None:
            assignee, rotation, mode = chore.assignee_id, list(chore.rotation_user_ids or []), chore.rotation_mode
    label = f"{med.name} {med.dose}".strip()
    for dose_time in wanted:
        task = tasks.pop(dose_time, None)
        if task is None:
            task = Task(family_id=med.family_id, created_by=med.created_by, medication_id=med.id, dose_time=dose_time, recurrence="daily")
            task.assignee_id, task.rotation_user_ids, task.rotation_mode = assignee, rotation, mode
            db.add(task)
        task.title = f"{pet.name}: {label} · {dose_time}" if pet else f"{label} · {dose_time}"
        task.description = med.notes
        task.points = med.points
        task.pet_id = med.pet_id
        task.anchor_date = med.start_date
        task.until_date = med.end_date
        task.picture = "💊"
        task.active = True
    # Times no longer given, a stopped medicine or one that became an adult's: kept for the history.
    for task in tasks.values():
        task.active = False


async def tick_from_task(db: AsyncSession, task: Task, by: User, day: date) -> None:
    """A dose task was ticked off: the dose is taken (the caller commits)."""
    med = await db.get(Medication, task.medication_id)
    if med is None or not task.dose_time:
        return
    at = next((moment for t, moment in dose_times_on(med, day) if t == task.dose_time), None)
    if at is None:
        return
    dose = (
        await db.execute(select(MedicationDose).where(MedicationDose.medication_id == med.id, MedicationDose.scheduled_at == at))
    ).scalar_one_or_none()
    if dose is None:
        dose = MedicationDose(family_id=med.family_id, medication_id=med.id, scheduled_at=at)
        db.add(dose)
    if dose.taken_at is None:
        dose.taken_at, dose.taken_by = datetime.now(timezone.utc), by.id


def dose_times_on(med: Medication, day: date) -> list[tuple[str, datetime]]:
    """(local "HH:MM", UTC moment) for each dose on a day; none outside the course or when stopped."""
    if not med.active or day < med.start_date or (med.end_date and day > med.end_date):
        return []
    out = []
    for t in med.times or []:
        hour, minute = (int(x) for x in t.split(":"))
        local = datetime.combine(day, time(hour, minute), tzinfo=_zone())
        out.append((t, local.astimezone(timezone.utc)))
    return out


def _is_adult(user: User) -> bool:
    return user.role in {"admin", "adult"}


async def may_see(db: AsyncSession, user: User, med: Medication) -> bool:
    if med.family_id != user.family_id:
        return False
    if med.pet_id is not None:
        return True
    if med.user_id == user.id:
        return True
    owner = await db.get(User, med.user_id)
    # A child's medicines are seen by the adults; an adult's only by that adult.
    return owner is not None and owner.role == "child" and _is_adult(user)


def may_tick(user: User, med: Medication) -> bool:
    return med.user_id == user.id or _is_adult(user) or med.pet_id is not None


async def run_medicine_reminders(db: AsyncSession, now: datetime | None = None) -> int:
    now = now or datetime.now(timezone.utc)
    sent = 0
    meds = (await db.execute(select(Medication).where(Medication.active.is_(True)))).scalars().all()
    for med in meds:
        # Medicines from before 2.9.0 get their tasks here; afterwards it keeps them in step.
        await sync_tasks(db, med)
        owner = await db.get(User, med.user_id) if med.user_id else None
        pet = await db.get(Pet, med.pet_id) if med.pet_id else None
        who = owner.display_name if owner else pet.name if pet else ""
        family = (await db.execute(select(User).where(User.family_id == med.family_id))).scalars().all()
        adults = [m for m in family if _is_adult(m)]
        local_day = now.astimezone(_zone()).date()
        # Yesterday too: a late-evening dose is missed only after midnight.
        doses = dose_times_on(med, local_day - timedelta(days=1)) + dose_times_on(med, local_day)
        for time_str, at in doses:
            if at > now or now - at > MISSED_WINDOW:
                continue
            dose = (
                await db.execute(select(MedicationDose).where(MedicationDose.medication_id == med.id, MedicationDose.scheduled_at == at))
            ).scalar_one_or_none()
            if dose is None:
                dose = MedicationDose(family_id=med.family_id, medication_id=med.id, scheduled_at=at)
                db.add(dose)
                await db.flush()
            if dose.taken_at:
                continue
            if dose.reminded_at is None and now - at <= REMIND_WINDOW:
                # The one it is for; for a child or a pet the adults too (2.8.2) – an adult's own
                # medicine stays theirs.
                recipients = [owner] if owner and _is_adult(owner) else ([owner] if owner else []) + adults
                for person in recipients:
                    title, body = _TEXT["reminder"].get(person.language or "en", _TEXT["reminder"]["en"])
                    await notify(db, person, {"title": title, "body": body.format(who=who, name=med.name, dose=med.dose).strip(), "route": "/tasks", "kind": "medicine"})
                    sent += 1
                dose.reminded_at = now
            if med.alert_adults and dose.missed_alerted_at is None and now - at >= MISSED_AFTER:
                # An adult's own medicine stays private: only they are told.
                recipients = [owner] if owner and _is_adult(owner) else adults
                for person in recipients:
                    title, body = _TEXT["missed"].get(person.language or "en", _TEXT["missed"]["en"])
                    await notify(db, person, {"title": title, "body": body.format(who=who, name=med.name, time=time_str), "route": "/tasks", "kind": "medicine_missed"})
                    sent += 1
                dose.missed_alerted_at = now
            await db.commit()
    await db.commit()
    return sent

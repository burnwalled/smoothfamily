"""Memories (#71): photos from the same day in earlier years – in Photos, on Today and on the
kitchen display – and an optional weekly "memory" notification.

A photo's date is when it was taken (EXIF), else when it was uploaded. Only the family's photo
albums count – never chat pictures, which follow their conversation. Nothing leaves the server.
"""
import io
import uuid
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Album, AppSetting, MediaItem, User
from app.services.notify import notify
from app.services.storage import get_storage

EXIF_IFD = 0x8769
DATE_TAKEN = 36867  # DateTimeOriginal
DATE_DIGITIZED = 36868
DATE_TIME = 306
BACKFILL_BATCH = 50


def _zone() -> ZoneInfo:
    return ZoneInfo(get_settings().timezone)


def exif_taken(data: bytes) -> datetime | None:
    """When the picture was taken, from its EXIF (camera time is local time)."""
    try:
        from PIL import Image

        exif = Image.open(io.BytesIO(data)).getexif()
        value = exif.get_ifd(EXIF_IFD).get(DATE_TAKEN) or exif.get_ifd(EXIF_IFD).get(DATE_DIGITIZED) or exif.get(DATE_TIME)
        if not value:
            return None
        return datetime.strptime(str(value).strip()[:19], "%Y:%m:%d %H:%M:%S").replace(tzinfo=_zone())
    except Exception:
        return None


async def backfill_taken(db: AsyncSession) -> int:
    """Gives older photos their date, a few at a time (the worker calls it every minute)."""
    rows = (
        await db.execute(select(MediaItem).where(MediaItem.taken_at.is_(None)).order_by(MediaItem.created_at).limit(BACKFILL_BATCH))
    ).scalars().all()
    storage = get_storage()
    for item in rows:
        taken = None
        if item.kind == "image":
            try:
                taken = exif_taken(storage.open(item.family_id, item.storage_key).read_bytes())
            except Exception:
                taken = None
        item.taken_at = taken or item.created_at
    if rows:
        await db.commit()
    return len(rows)


def _local(value: datetime) -> date:
    value = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return value.astimezone(_zone()).date()


async def _photos(db: AsyncSession, family_id: uuid.UUID) -> list[MediaItem]:
    return list(
        (
            await db.execute(
                select(MediaItem)
                .join(Album, Album.id == MediaItem.album_id)
                .where(MediaItem.family_id == family_id, Album.kind == "user", MediaItem.kind == "image", MediaItem.taken_at.is_not(None))
            )
        ).scalars().all()
    )


async def on_this_day(db: AsyncSession, family_id: uuid.UUID, day: date, window: int = 0) -> list[tuple[int, list[MediaItem]]]:
    """[(year, photos)] from earlier years on the same day (± `window` days), newest year first."""
    days = {(day + timedelta(days=d)).strftime("%m-%d") for d in range(-window, window + 1)}
    by_year: dict[int, list[MediaItem]] = {}
    for item in await _photos(db, family_id):
        taken = _local(item.taken_at)
        if taken.year < day.year and taken.strftime("%m-%d") in days:
            by_year.setdefault(taken.year, []).append(item)
    return [(year, sorted(items, key=lambda i: i.taken_at)) for year, items in sorted(by_year.items(), reverse=True)]


async def slideshow(db: AsyncSession, family_id: uuid.UUID, day: date, limit: int = 30) -> list[MediaItem]:
    """For the kitchen display: today's memories first, then the newest photos."""
    memories = [i for _, items in await on_this_day(db, family_id, day, window=3) for i in items]
    seen = {i.id for i in memories}
    newest = sorted((i for i in await _photos(db, family_id) if i.id not in seen), key=lambda i: i.taken_at, reverse=True)
    return (memories + newest)[:limit]


_TEXT = {
    "en": ("A memory", "This week {n} years ago – {count} photos"),
    "sv": ("Ett minne", "Den här veckan för {n} år sedan – {count} bilder"),
    "nb": ("Et minne", "Denne uka for {n} år siden – {count} bilder"),
    "da": ("Et minde", "Denne uge for {n} år siden – {count} billeder"),
    "fi": ("Muisto", "Tällä viikolla {n} vuotta sitten – {count} kuvaa"),
}


async def run_memory_push(db: AsyncSession, now: datetime | None = None) -> int:
    """Sunday from 10: one memory per family member with Photos (the "memories" setting decides
    whether it is also pushed; it is always in the notification centre)."""
    now_local = (now or datetime.now(timezone.utc)).astimezone(_zone())
    if now_local.weekday() != 6 or now_local.hour < 10:
        return 0
    today = now_local.date()
    sent = 0
    families = set((await db.execute(select(MediaItem.family_id).distinct())).scalars())
    for family_id in families:
        key = f"memories.sent:{family_id}:{today.isoformat()}"
        if await db.get(AppSetting, key) is not None:
            continue
        db.add(AppSetting(key=key, value=now_local.isoformat()))
        await db.commit()
        years = await on_this_day(db, family_id, today, window=3)
        if not years:
            continue
        year, items = years[0]
        members = (await db.execute(select(User).where(User.family_id == family_id))).scalars().all()
        for member in members:
            if "photos" not in member.apps:
                continue
            title, body = _TEXT.get(member.language or "en", _TEXT["en"])
            await notify(db, member, {"title": title, "body": body.format(n=today.year - year, count=len(items)), "route": "/photos", "kind": "memory"}, pref="memories")
            sent += 1
    return sent


def start_of(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=_zone())

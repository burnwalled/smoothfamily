"""Memories (#71): photos from this day in earlier years, the weekly memory and the slideshow."""
import io
from datetime import date, datetime, timedelta, timezone

import pytest

pytestmark = pytest.mark.asyncio


def _jpeg(taken: datetime | None) -> bytes:
    from PIL import Image

    img = Image.new("RGB", (40, 30), (200, 120, 60))
    exif = Image.Exif()
    if taken:
        exif.get_ifd(0x8769)[36867] = taken.strftime("%Y:%m:%d %H:%M:%S")
    buf = io.BytesIO()
    img.save(buf, "JPEG", exif=exif.tobytes())
    return buf.getvalue()


@pytest.fixture
def media(tmp_path, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "media_root", str(tmp_path))
    monkeypatch.setattr(get_settings(), "timezone", "UTC")


async def _upload(client, album_id, data, name="p.jpg"):
    resp = await client.post(f"/api/albums/{album_id}/media", files={"file": (name, data, "image/jpeg")})
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_on_this_day(client, db_session, media):
    from app.models import MediaItem
    from app.services.memories import backfill_taken, run_memory_push

    await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123"},
    )
    album = (await client.post("/api/albums", json={"name": "Summer"})).json()
    today = date.today()
    two_years = datetime(today.year - 2, today.month, min(today.day, 28), 15, 0)
    if two_years.day != today.day:
        today = date(today.year, today.month, 28)
    beach = await _upload(client, album["id"], _jpeg(two_years))
    await _upload(client, album["id"], _jpeg(datetime(today.year - 1, 1 if today.month != 1 else 2, 1, 12)))
    await _upload(client, album["id"], _jpeg(None))  # no EXIF: the upload date (today) – not a memory

    years = (await client.get(f"/api/albums/memories?day={today}")).json()
    assert [(y["year"], y["years_ago"], [i["id"] for i in y["items"]]) for y in years] == [(today.year - 2, 2, [beach["id"]])]
    # Nothing on the exact day: the days around it are offered.
    near = (await client.get(f"/api/albums/memories?day={today + timedelta(days=2)}")).json()
    assert [y["year"] for y in near] == [today.year - 2]

    # Older photos without a date get one from their EXIF.
    import uuid as _uuid

    row = await db_session.get(MediaItem, _uuid.UUID(beach["id"]))
    row.taken_at = None
    await db_session.commit()
    assert await backfill_taken(db_session) == 1
    await db_session.refresh(row)
    assert row.taken_at.year == today.year - 2

    # The weekly memory on Sunday morning, once.
    sunday = datetime.combine(today, datetime.min.time(), tzinfo=timezone.utc) + timedelta(days=(6 - today.weekday()) % 7, hours=10)
    if abs((sunday.date() - today).days) > 3:
        sunday -= timedelta(days=7)
    assert await run_memory_push(db_session, sunday.replace(hour=9)) == 0
    assert await run_memory_push(db_session, sunday) == 1
    assert await run_memory_push(db_session, sunday + timedelta(minutes=1)) == 0
    [note] = (await client.get("/api/notifications")).json()
    assert note["kind"] == "memory" and "2" in note["body"]


async def test_kitchen_display_slideshow(client, media):
    await client.post(
        "/api/auth/setup",
        json={"email": "a@example.com", "family_name": "F", "display_name": "Anna", "username": "admin", "password": "secret123"},
    )
    album = (await client.post("/api/albums", json={"name": "Family"})).json()
    photo = await _upload(client, album["id"], _jpeg(datetime(2024, 5, 1, 12)))
    screen = (await client.post("/api/kiosks", json={"name": "Kitchen"})).json()
    token = screen["url"].rsplit("/", 1)[1]
    client.cookies.clear()
    slides = (await client.get(f"/api/kiosk/{token}/photos")).json()
    assert [s["id"] for s in slides] == [photo["id"]]
    img = await client.get(f"/api/kiosk/{token}/photos/{photo['id']}")
    assert img.status_code == 200 and img.headers["content-type"] == "image/jpeg"
    assert (await client.get(f"/api/kiosk/not-a-screen/photos/{photo['id']}")).status_code == 404

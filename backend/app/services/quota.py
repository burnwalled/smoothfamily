"""How much a family may keep on the server (2.8.2): the server admin sets a ceiling per family
(families.storage_quota_mb, None = no ceiling). Every upload is checked against what the family's
folder already holds."""
import time
import uuid
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Family

# Walking a big folder on every upload is slow: a size is reused for a minute, plus what was added.
_CACHE_SECONDS = 60
_cache: dict[uuid.UUID, tuple[float, int]] = {}


def folder_size(path: Path) -> int:
    if not path.is_dir():
        return 0
    return sum(f.stat().st_size for f in path.rglob("*") if f.is_file())


def used_bytes(family_id: uuid.UUID, fresh: bool = False) -> int:
    hit = _cache.get(family_id)
    if hit and not fresh and time.monotonic() - hit[0] < _CACHE_SECONDS:
        return hit[1]
    size = folder_size(Path(get_settings().media_root) / str(family_id))
    _cache[family_id] = (time.monotonic(), size)
    return size


def forget(family_id: uuid.UUID) -> None:
    _cache.pop(family_id, None)


async def check(db: AsyncSession, family_id: uuid.UUID, incoming: int) -> None:
    """413 when this upload would take the family over its ceiling."""
    family = await db.get(Family, family_id)
    if family is None or family.storage_quota_mb is None:
        return
    used = used_bytes(family_id)
    if used + incoming > family.storage_quota_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"The family's storage is full ({family.storage_quota_mb} MB) – remove something or ask the server's admin for more")
    # Count it at once, so uploads in a row don't slip past the ceiling.
    _cache[family_id] = (_cache.get(family_id, (time.monotonic(), used))[0], used + incoming)

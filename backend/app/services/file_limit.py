"""How large a file the vault takes (2.8.2): set by the server admin.

Files in the vault and the documents' scans are encrypted with the family's key as a whole, in
memory – so keeping or opening one takes roughly three times its size in memory for a moment. A
small server (a NAS with 1 GB) needs a limit; a big one may need none.
"""
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AppSetting

KEY = "vault_max_file_mb"
DEFAULT_MB = 50
# Keeping or opening a file takes about this many times its size in memory.
MEMORY_FACTOR = 3


async def max_file_mb(db: AsyncSession) -> int | None:
    """The limit in MB, or None for no limit."""
    row = await db.get(AppSetting, KEY)
    if row is None:
        return DEFAULT_MB
    return None if row.value == "none" else int(row.value)


async def set_max_file_mb(db: AsyncSession, mb: int | None) -> None:
    row = await db.get(AppSetting, KEY)
    value = "none" if mb is None else str(mb)
    if row is None:
        db.add(AppSetting(key=KEY, value=value))
    else:
        row.value = value
    await db.commit()


async def too_large(db: AsyncSession, size: int) -> int | None:
    """The limit in MB when a file of this size is over it, else None."""
    limit = await max_file_mb(db)
    return limit if limit is not None and size > limit * 1024 * 1024 else None


def memory_mb() -> int | None:
    """The server's memory (what the container sees), if it can be read."""
    try:
        for line in Path("/proc/meminfo").read_text().splitlines():
            if line.startswith("MemTotal:"):
                return int(line.split()[1]) // 1024
    except (OSError, ValueError):
        pass
    return None


def suggested_mb(memory: int | None) -> int | None:
    """A limit that leaves room for the rest of the server: a fifth of the memory, shared by the factor."""
    if not memory:
        return None
    return max(10, (memory // 5) // MEMORY_FACTOR // 10 * 10)

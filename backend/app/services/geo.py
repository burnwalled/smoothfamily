"""Which country an address belongs to (3.4.1), from a table kept on the server – DB-IP's free
country table (IP Geolocation by DB-IP, https://db-ip.com, CC BY 4.0) – so that no address ever
leaves the server to be looked up. The server's admin fetches the table under Server settings →
Security; it's refreshed by itself once it's over a month old. Without a table every address is
simply "unknown", and nothing is refused on that account."""
import gzip
import io
import ipaddress
import json
import os
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import httpx
import maxminddb
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import AppSetting

SOURCE = "https://download.db-ip.com/free/dbip-country-lite-{month}.mmdb.gz"
ATTRIBUTION = "IP Geolocation by DB-IP"
ATTRIBUTION_URL = "https://db-ip.com"
MAX_BYTES = 64 * 1024 * 1024
REFRESH_AFTER = timedelta(days=35)
SETTING = "geo.table"
_reader: tuple[float, maxminddb.Reader] | None = None
_policy: tuple[float, list[str]] = (0.0, [])


def table_path() -> Path:
    return Path(get_settings().media_root) / "_geo" / "country.mmdb"


def _open() -> maxminddb.Reader | None:
    global _reader
    path = table_path()
    try:
        stamp = path.stat().st_mtime
    except OSError:
        _reader = None
        return None
    if _reader is None or _reader[0] != stamp:
        try:
            _reader = (stamp, maxminddb.open_database(str(path)))
        except (OSError, maxminddb.InvalidDatabaseError):
            _reader = None
            return None
    return _reader[1]


def country_of(ip: str) -> str | None:
    """The two-letter country of a public address, None for a home address or when it can't be known."""
    try:
        address = ipaddress.ip_address(ip)
    except ValueError:
        return None
    if not address.is_global:
        return None
    reader = _open()
    if reader is None:
        return None
    try:
        found = reader.get(ip)
    except ValueError:
        return None
    code = ((found or {}).get("country") or {}).get("iso_code") if isinstance(found, dict) else None
    return code.upper() if isinstance(code, str) and len(code) == 2 else None


def flag(code: str | None) -> str:
    if not code or len(code) != 2 or not code.isalpha():
        return ""
    return "".join(chr(0x1F1E6 + ord(c) - ord("A")) for c in code.upper())


def allowed(country: str | None, countries: list[str], travel_until: date | None = None, today: date | None = None) -> bool:
    """May someone sign in from this country: no rule, an unknown or home address, a country on the
    list, or a member who's travelling until a day that hasn't passed."""
    if not countries or country is None or country in countries:
        return True
    today = today or datetime.now(timezone.utc).date()
    return travel_until is not None and travel_until >= today


async def countries(db: AsyncSession) -> list[str]:
    """The countries sign-ins are allowed from (empty = all), read at most once a minute."""
    global _policy
    now = time.monotonic()
    if now - _policy[0] > 60:
        from app.services.security_policy import get_policy

        _policy = (now, list((await get_policy(db)).get("signin_countries") or []))
    return _policy[1]


def forget_policy() -> None:
    global _policy
    _policy = (0.0, [])


async def outside(db: AsyncSession, ip: str) -> bool:
    """From a country the sign-in rule doesn't name: the brake is stricter there."""
    rule = await countries(db)
    code = country_of(ip)
    return bool(rule) and code is not None and code not in rule


async def status(db: AsyncSession) -> dict:
    row = await db.get(AppSetting, SETTING)
    about = json.loads(row.value) if row else {}
    path = table_path()
    return {
        "loaded": _open() is not None, "fetched_at": about.get("fetched_at"), "month": about.get("month"),
        "size": path.stat().st_size if path.is_file() else 0, "attribution": ATTRIBUTION, "attribution_url": ATTRIBUTION_URL,
    }


async def _fetch(month: str) -> bytes | None:
    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
        async with client.stream("GET", SOURCE.format(month=month)) as resp:
            if resp.status_code == 404:
                return None
            resp.raise_for_status()
            body = bytearray()
            async for chunk in resp.aiter_bytes():
                body.extend(chunk)
                if len(body) > MAX_BYTES:
                    raise ValueError("The table is larger than expected")
            return bytes(body)


def _verify(raw: bytes) -> None:
    """A table that opens and knows a public address."""
    reader = maxminddb.open_database(io.BytesIO(raw), maxminddb.MODE_FD)
    try:
        if not reader.get("8.8.8.8"):
            raise ValueError("The table doesn't look like a country table")
    finally:
        reader.close()


async def download(db: AsyncSession, now: datetime | None = None) -> dict:
    """This month's table (or last month's, until the new one is out), checked and put in place."""
    now = now or datetime.now(timezone.utc)
    first = now.date().replace(day=1)
    months = [first.strftime("%Y-%m"), (first - timedelta(days=1)).strftime("%Y-%m")]
    got = None
    for month in months:
        packed = await _fetch(month)
        if packed is not None:
            got = (month, packed)
            break
    if got is None:
        raise ValueError("The table couldn't be fetched")
    month, packed = got
    raw = gzip.decompress(packed)
    if len(raw) > MAX_BYTES:
        raise ValueError("The table is larger than expected")
    _verify(raw)
    path = table_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_bytes(raw)
    os.replace(tmp, path)
    global _reader
    _reader = None
    about = {"fetched_at": now.isoformat(), "month": month}
    row = await db.get(AppSetting, SETTING)
    if row is None:
        db.add(AppSetting(key=SETTING, value=json.dumps(about)))
    else:
        row.value = json.dumps(about)
    await db.commit()
    return await status(db)


async def run_geo_refresh(db: AsyncSession, now: datetime | None = None) -> bool:
    """A table over a month old is fetched again – tried once a day, so a failure doesn't hammer."""
    now = now or datetime.now(timezone.utc)
    row = await db.get(AppSetting, SETTING)
    if row is None:
        return False
    about = json.loads(row.value)
    fetched = datetime.fromisoformat(about["fetched_at"]) if about.get("fetched_at") else None
    if fetched is not None and now - fetched < REFRESH_AFTER:
        return False
    if about.get("tried") == now.date().isoformat():
        return False
    about["tried"] = now.date().isoformat()
    row.value = json.dumps(about)
    await db.commit()
    try:
        await download(db, now)
    except Exception:
        return False
    return True

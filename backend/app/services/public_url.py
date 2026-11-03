"""The server's external address (2.8.4): what links sent out of the app point to.

The server admin sets it in Server settings; PUBLIC_URL in the environment is the fallback, and
without either the browser's own address is used (fine at home, but links then only work there).
"""
from urllib.parse import urlparse

from fastapi import HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import AppSetting

KEY = "external_url"


def env_url() -> str:
    return get_settings().public_url.strip().rstrip("/")


async def stored_url(db: AsyncSession) -> str:
    setting = (await db.execute(select(AppSetting).where(AppSetting.key == KEY))).scalar_one_or_none()
    return (setting.value or "").rstrip("/") if setting else ""


async def configured_url(db: AsyncSession) -> str:
    """The address set by the admin, else PUBLIC_URL – empty when neither is set."""
    return await stored_url(db) or env_url()


async def public_base(db: AsyncSession, request: Request | None = None) -> str:
    """Where links sent out of the app should point."""
    base = await configured_url(db)
    if not base and request is not None:
        base = request.headers.get("origin") or ""
        referer = request.headers.get("referer") or ""
        if not base and referer:
            parsed = urlparse(referer)
            base = f"{parsed.scheme}://{parsed.netloc}" if parsed.scheme in ("http", "https") and parsed.netloc else ""
    return base.rstrip("/")


def normalise(url: str) -> str:
    """Scheme and host (and port) only – a path would break every link built on it."""
    url = url.strip().rstrip("/")
    if not url:
        return ""
    if "://" not in url:
        url = "https://" + url
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.path not in ("", "/") or parsed.query or parsed.fragment:
        raise HTTPException(status_code=422, detail="Give the address as https://name.example (no path)")
    return f"{parsed.scheme}://{parsed.netloc}".lower()


async def relying_party(db: AsyncSession, request: Request) -> tuple[str, str]:
    """(rp_id, expected_origin) for passkeys. A passkey belongs to the domain it was made on, so
    both the admin's address and PUBLIC_URL are accepted: changing the address then doesn't lock
    out passkeys made on the old one. In dev, with neither set, the browser's Origin is used."""
    origin = (request.headers.get("origin") or "").rstrip("/")
    allowed = [u for u in (await stored_url(db), env_url()) if u]
    if allowed and origin not in allowed:
        origin = allowed[0]
    host = urlparse(origin).hostname
    if not host:
        raise HTTPException(status_code=400, detail="Passkeys need the server's address or an Origin header")
    return host, origin

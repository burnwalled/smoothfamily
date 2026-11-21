"""A speaker's library, remembered.

Home Assistant's Spotify integration lets an account's library be browsed only while something is
playing on it. So every level a speaker shows is saved here, and when the speaker can't be asked the
saved level is shown instead – what is played from it works either way. When an account starts
playing, its library is fetched two levels down (the folders and what is in them), so the playlists
are there the next time someone builds a flow with nothing playing.
"""
import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import SessionLocal
from app.models import ExposedDevice, MediaLibraryPage, SmarthomeConnection
from app.services import homeassistant as ha
from app.services.crypto import decrypt_token

log = logging.getLogger(__name__)

# Integrations whose media player is an account that plays on its own devices, not a speaker.
# SpotifyPlus (HACS) is the Spotify integration that also finds the Connect devices on the home network.
ACCOUNT_PLATFORMS = {"spotify", "spotifyplus"}
# How often an account's library is fetched again when it starts playing.
REFRESH_AFTER = timedelta(hours=1)
# One level never holds more than this, and no more folders than this are opened in one go.
MAX_ITEMS = 500
MAX_FOLDERS = 40


def page_key(content_id: str | None, content_type: str | None) -> str:
    """The top level is the empty key; a folder is its type and id."""
    return f"{content_type}|{content_id}"[:700] if content_id and content_type else ""


def children(result: dict | None) -> list[dict]:
    """What Home Assistant listed, down to the fields the picker shows."""
    return [
        {
            "title": c.get("title") or "", "media_content_id": c.get("media_content_id") or "", "media_content_type": c.get("media_content_type") or "",
            "can_play": bool(c.get("can_play")), "can_expand": bool(c.get("can_expand")), "thumbnail": c.get("thumbnail"),
        }
        for c in ((result or {}).get("children") or [])[:MAX_ITEMS]
    ]


async def remember(db: AsyncSession, device: ExposedDevice, key: str, items: list[dict]) -> None:
    page = (await db.execute(select(MediaLibraryPage).where(MediaLibraryPage.device_id == device.id, MediaLibraryPage.content_key == key))).scalar_one_or_none()
    if page is None:
        db.add(MediaLibraryPage(family_id=device.family_id, device_id=device.id, content_key=key, items=items))
    else:
        page.items = items
        page.fetched_at = datetime.now(timezone.utc)


async def saved(db: AsyncSession, device: ExposedDevice, key: str) -> MediaLibraryPage | None:
    return (await db.execute(select(MediaLibraryPage).where(MediaLibraryPage.device_id == device.id, MediaLibraryPage.content_key == key))).scalar_one_or_none()


async def is_account(base_url: str, token: str, entity_id: str) -> bool:
    """Whether the media player is a music account. False when Home Assistant can't be asked."""
    try:
        entry = await ha.ws_call(base_url, token, {"type": "config/entity_registry/get", "entity_id": entity_id})
    except Exception:
        return False
    return (entry or {}).get("platform") in ACCOUNT_PLATFORMS


async def refresh_on_playing(family_id: uuid.UUID, entity_id: str) -> None:
    """An account has started playing: fetch its library while it can be asked. Never raises."""
    try:
        async with SessionLocal() as db:
            devices = (await db.execute(select(ExposedDevice).where(ExposedDevice.family_id == family_id, ExposedDevice.entity_id == entity_id, ExposedDevice.domain == "media_player"))).scalars().all()
            for device in devices:
                conn = await db.get(SmarthomeConnection, device.connection_id)
                if conn is None:
                    continue
                top = await saved(db, device, "")
                fetched = top.fetched_at.replace(tzinfo=timezone.utc) if top and top.fetched_at.tzinfo is None else (top.fetched_at if top else None)
                if fetched and datetime.now(timezone.utc) - fetched < REFRESH_AFTER:
                    continue
                token = decrypt_token(conn.token_encrypted)
                if not await is_account(conn.base_url, token, entity_id):
                    continue
                await _fetch(db, device, conn.base_url, token)
                await db.commit()
    except Exception:
        log.exception("Media library: could not fetch %s for family %s", entity_id, family_id)


async def _fetch(db: AsyncSession, device: ExposedDevice, base_url: str, token: str) -> None:
    request = {"type": "media_player/browse_media", "entity_id": device.entity_id}
    top = children(await ha.ws_call(base_url, token, request))
    await remember(db, device, "", top)
    for folder in [c for c in top if c.get("can_expand")][:MAX_FOLDERS]:
        try:
            inside = children(await ha.ws_call(base_url, token, request | {"media_content_id": folder["media_content_id"], "media_content_type": folder["media_content_type"]}))
        except Exception:
            # The account stopped, or the folder can't be opened: keep what was fetched.
            continue
        await remember(db, device, page_key(folder["media_content_id"], folder["media_content_type"]), inside)

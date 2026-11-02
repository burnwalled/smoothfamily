"""The one place that notifies a member: kept in the notification centre, then sent as push
when the member's preference allows it.

Push is only a delivery channel – a notification is never lost when push is off, missed or the
phone has no subscription.
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Notification, User
from app.services.events import publish_user
from app.services.push import send_to_user, user_pref_enabled


async def notify(db: AsyncSession, user: User, payload: dict, pref: str | None = None) -> None:
    """payload: title, body, route, kind (+ extra push fields). `pref` is the push preference
    (e.g. "approvals") that decides whether it is pushed; it is always kept in the centre."""
    db.add(
        Notification(
            family_id=user.family_id,
            user_id=user.id,
            kind=str(payload.get("kind", "other"))[:40],
            title=str(payload.get("title", ""))[:200],
            body=str(payload.get("body", "")),
            route=payload.get("route"),
        )
    )
    await db.commit()
    await publish_user(user.id, ["notifications"])
    if pref is None or user_pref_enabled(user, pref):
        await send_to_user(db, user.id, payload)


async def prune_notifications(db: AsyncSession, now: datetime | None = None) -> None:
    cutoff = (now or datetime.now(timezone.utc)) - timedelta(days=get_settings().notifications_keep_days)
    await db.execute(delete(Notification).where(Notification.created_at < cutoff))
    await db.commit()

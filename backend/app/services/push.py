"""Web Push helpers (VAPID keys, subscription management, sends)."""

import base64
import json
import uuid
from datetime import datetime, timezone

from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid01
from pywebpush import WebPushException, webpush
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import AppSetting, PushSubscription, User

VAPID_PUBLIC_KEY = "push.vapid.public"
VAPID_PRIVATE_KEY = "push.vapid.private"
NOTIFICATION_DEFAULTS = {
    "chat": True,
    "approvals": True,
    "calendar_mine": True,
    "calendar_family": False,
    "memories": True,
    "subs_cancel": True,
    "subs_quarter": True,
    "subs_year": True,
}


def _to_b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


async def ensure_vapid_keys(db: AsyncSession) -> tuple[str, str]:
    public = await db.get(AppSetting, VAPID_PUBLIC_KEY)
    private = await db.get(AppSetting, VAPID_PRIVATE_KEY)
    if public and private:
        return public.value, private.value

    vapid = Vapid01()
    vapid.generate_keys()
    public_key = _to_b64url(
        vapid.public_key.public_bytes(
            encoding=serialization.Encoding.X962,
            format=serialization.PublicFormat.UncompressedPoint,
        )
    )
    private_key = _to_b64url(vapid.private_key.private_numbers().private_value.to_bytes(32, "big"))

    db.add(AppSetting(key=VAPID_PUBLIC_KEY, value=public_key))
    db.add(AppSetting(key=VAPID_PRIVATE_KEY, value=private_key))
    await db.commit()
    return public_key, private_key


async def get_vapid_public_key(db: AsyncSession) -> str:
    public, _ = await ensure_vapid_keys(db)
    return public


async def get_vapid_private_key(db: AsyncSession) -> str:
    _, private = await ensure_vapid_keys(db)
    return private


def user_pref_enabled(user: User, key: str) -> bool:
    prefs = user.notification_prefs or {}
    if key not in prefs:
        return bool(NOTIFICATION_DEFAULTS.get(key, False))
    return bool(prefs.get(key))


async def vapid_subject(db: AsyncSession, user_id: uuid.UUID) -> str:
    """Contact for the push services (VAPID "sub"). Apple rejects placeholder
    addresses, so use a family admin's e-mail, else the public HTTPS address."""
    family_id = select(User.family_id).where(User.id == user_id).scalar_subquery()
    email = (
        await db.execute(
            select(User.email)
            .where(User.family_id == family_id, User.role == "admin", User.email.is_not(None))
            .order_by(User.created_at)
            .limit(1)
        )
    ).scalar_one_or_none()
    if email:
        return f"mailto:{email}"
    public_url = get_settings().public_url.rstrip("/")
    return public_url or "mailto:noreply@smooth-family.local"


async def send_to_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    payload: dict,
    subject: str | None = None,
) -> int:
    private_key = await get_vapid_private_key(db)
    subs = (
        await db.execute(select(PushSubscription).where(PushSubscription.user_id == user_id))
    ).scalars().all()
    if not subs:
        return 0

    subject = subject or await vapid_subject(db, user_id)
    sent = 0
    body = json.dumps(payload, ensure_ascii=False)
    for sub in subs:
        subscription_info = {
            "endpoint": sub.endpoint,
            "keys": {"p256dh": sub.p256dh, "auth": sub.auth},
        }
        try:
            webpush(
                subscription_info=subscription_info,
                data=body,
                vapid_private_key=private_key,
                vapid_claims={"sub": subject},
            )
            sent += 1
        except WebPushException as exc:
            # Dead subscriptions should be cleaned up to keep sends fast and reliable.
            status_code = getattr(getattr(exc, "response", None), "status_code", None)
            if status_code in {404, 410}:
                await db.delete(sub)
            else:
                # Keep the subscription for transient failures.
                continue

    await db.commit()
    return sent


async def upsert_subscription(
    db: AsyncSession,
    user_id: uuid.UUID,
    endpoint: str,
    p256dh: str,
    auth: str,
    user_agent: str | None,
) -> PushSubscription:
    existing = (
        await db.execute(select(PushSubscription).where(PushSubscription.endpoint == endpoint))
    ).scalar_one_or_none()

    if existing:
        existing.user_id = user_id
        existing.p256dh = p256dh
        existing.auth = auth
        existing.user_agent = user_agent
        await db.commit()
        await db.refresh(existing)
        return existing

    sub = PushSubscription(
        user_id=user_id,
        endpoint=endpoint,
        p256dh=p256dh,
        auth=auth,
        user_agent=user_agent,
        created_at=datetime.now(timezone.utc),
    )
    db.add(sub)
    await db.commit()
    await db.refresh(sub)
    return sub


async def delete_subscription(db: AsyncSession, user_id: uuid.UUID, endpoint: str) -> None:
    await db.execute(
        delete(PushSubscription).where(
            PushSubscription.user_id == user_id,
            PushSubscription.endpoint == endpoint,
        )
    )
    await db.commit()


async def list_subscriptions(db: AsyncSession, user_id: uuid.UUID) -> list[PushSubscription]:
    rows = (
        await db.execute(
            select(PushSubscription)
            .where(PushSubscription.user_id == user_id)
            .order_by(PushSubscription.created_at.desc())
        )
    ).scalars().all()
    return list(rows)

"""Push subscription management and VAPID public key endpoint."""

from fastapi import APIRouter, Header

from app.deps import CurrentUser, DB
from app.schemas import PushSubscriptionDelete, PushSubscriptionIn, PushSubscriptionOut, PushVapidKeyOut
from app.services.push import (
    delete_subscription,
    get_vapid_public_key,
    list_subscriptions,
    upsert_subscription,
)

router = APIRouter(prefix="/api/push", tags=["push"])


@router.get("/vapid-public-key", response_model=PushVapidKeyOut)
async def vapid_public_key(user: CurrentUser, db: DB) -> PushVapidKeyOut:
    del user
    return PushVapidKeyOut(public_key=await get_vapid_public_key(db))


@router.get("/subscriptions", response_model=list[PushSubscriptionOut])
async def my_subscriptions(user: CurrentUser, db: DB) -> list[PushSubscriptionOut]:
    return await list_subscriptions(db, user.id)


@router.post("/subscribe", response_model=PushSubscriptionOut)
async def subscribe(
    payload: PushSubscriptionIn,
    user: CurrentUser,
    db: DB,
    user_agent: str | None = Header(default=None, alias="User-Agent"),
) -> PushSubscriptionOut:
    return await upsert_subscription(
        db,
        user.id,
        endpoint=payload.endpoint,
        p256dh=payload.keys.p256dh,
        auth=payload.keys.auth,
        user_agent=user_agent,
    )


@router.delete("/subscribe")
async def unsubscribe(payload: PushSubscriptionDelete, user: CurrentUser, db: DB) -> dict:
    await delete_subscription(db, user.id, payload.endpoint)
    return {"ok": True}

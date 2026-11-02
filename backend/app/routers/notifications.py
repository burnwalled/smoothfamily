"""Notification centre: the member's own notifications, newest first, with read state."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, status
from pydantic import BaseModel
from sqlalchemy import func, select, update

from app.deps import DB, CurrentUser
from app.models import Notification

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

LIST_LIMIT = 200


class NotificationOut(BaseModel):
    id: uuid.UUID
    kind: str
    title: str
    body: str
    route: str | None
    created_at: datetime
    read_at: datetime | None

    model_config = {"from_attributes": True}


class UnreadOut(BaseModel):
    unread: int


class ReadIn(BaseModel):
    # None = mark every notification read.
    ids: list[uuid.UUID] | None = None


@router.get("", response_model=list[NotificationOut])
async def list_notifications(user: CurrentUser, db: DB) -> list[Notification]:
    rows = await db.execute(
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(LIST_LIMIT)
    )
    return list(rows.scalars().all())


@router.get("/unread", response_model=UnreadOut)
async def unread_count(user: CurrentUser, db: DB) -> UnreadOut:
    count = (
        await db.execute(
            select(func.count(Notification.id)).where(Notification.user_id == user.id, Notification.read_at.is_(None))
        )
    ).scalar_one()
    return UnreadOut(unread=count)


@router.post("/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_read(payload: ReadIn, user: CurrentUser, db: DB) -> None:
    query = update(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None))
    if payload.ids is not None:
        query = query.where(Notification.id.in_(payload.ids))
    await db.execute(query.values(read_at=datetime.now(timezone.utc)))
    await db.commit()

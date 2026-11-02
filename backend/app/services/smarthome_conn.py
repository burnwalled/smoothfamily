"""The family's Home Assistants (2.8.4): the main one – reached directly, used by flows, presence,
meters and the live updates – and those of other homes, reached through the gateway."""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AppSetting, SmarthomeConnection
from app.services import gateway

HOSTED_KEY = "hosted_smarthome"


async def hosted_allowed(db: AsyncSession) -> bool:
    """Hosted families may connect their own Home Assistant through the gateway (default on). Never
    directly: the server must not call addresses in another family's network."""
    row = await db.get(AppSetting, HOSTED_KEY)
    return row is None or row.value != "off"


async def set_hosted_allowed(db: AsyncSession, allowed: bool) -> None:
    row = await db.get(AppSetting, HOSTED_KEY)
    if row is None:
        db.add(AppSetting(key=HOSTED_KEY, value="on" if allowed else "off"))
    else:
        row.value = "on" if allowed else "off"
    await db.commit()


async def primary(db: AsyncSession, family_id: uuid.UUID) -> SmarthomeConnection | None:
    """The main Home Assistant: the first one reached directly."""
    return (
        await db.execute(
            select(SmarthomeConnection)
            .where(SmarthomeConnection.family_id == family_id, ~SmarthomeConnection.base_url.like(f"{gateway.PREFIX}%"))
            .order_by(SmarthomeConnection.created_at)
            .limit(1)
        )
    ).scalar_one_or_none()


async def all_for(db: AsyncSession, family_id: uuid.UUID) -> list[SmarthomeConnection]:
    rows = (await db.execute(select(SmarthomeConnection).where(SmarthomeConnection.family_id == family_id).order_by(SmarthomeConnection.created_at))).scalars().all()
    # The main one first.
    return sorted(rows, key=lambda c: gateway.is_gateway(c.base_url))

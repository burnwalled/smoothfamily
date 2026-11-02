"""The setup guides (2.9.0): the server admin's at the first sign-in on a new server, then the family
admin's for a new family. Each is shown once – finished or skipped – and can be opened again from
the settings; nothing here changes a setting, the guides use the settings' own endpoints."""
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.deps import DB, CurrentUser
from app.models import AppSetting, Family

router = APIRouter(prefix="/api/guide", tags=["guide"])

SERVER_KEY = "guide_server_done"


class GuideOut(BaseModel):
    # In order: the server's guide comes before the family's.
    pending: list[Literal["server", "family"]]


async def _pending(db, user) -> list[str]:
    pending = []
    if user.is_server_admin and await db.get(AppSetting, SERVER_KEY) is None:
        pending.append("server")
    family = await db.get(Family, user.family_id)
    if user.role == "admin" and family.kind != "demo" and family.guide_done_at is None:
        pending.append("family")
    return pending


@router.get("", response_model=GuideOut)
async def guides(user: CurrentUser, db: DB) -> GuideOut:
    return GuideOut(pending=await _pending(db, user))


@router.post("/{which}/done", response_model=GuideOut)
async def done(which: Literal["server", "family"], user: CurrentUser, db: DB) -> GuideOut:
    """Finished or skipped – either way not shown by itself again."""
    now = datetime.now(timezone.utc)
    if which == "server":
        if not user.is_server_admin:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the server admin")
        if await db.get(AppSetting, SERVER_KEY) is None:
            db.add(AppSetting(key=SERVER_KEY, value=now.isoformat()))
    else:
        if user.role != "admin":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the family admin")
        family = await db.get(Family, user.family_id)
        family.guide_done_at = family.guide_done_at or now
    await db.commit()
    return GuideOut(pending=await _pending(db, user))

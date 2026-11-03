"""Address suggestions from OpenStreetMap (3.4.0), for the family's own address fields."""
from fastapi import APIRouter, HTTPException, Query

from app.deps import DB, CurrentUser
from app.services import places

router = APIRouter(prefix="/api/places", tags=["places"])


@router.get("")
async def search(user: CurrentUser, db: DB, q: str = Query(min_length=1, max_length=200)) -> list[dict]:
    try:
        return await places.search(db, q, user.language or "en")
    except places.PlacesError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/status")
async def status(user: CurrentUser, db: DB) -> dict:
    """Whether the address fields offer suggestions."""
    return {"enabled": (await places.settings(db))["enabled"]}

"""Public transport departures (SL, Stockholm) proxied for dashboard widgets.

The backend proxies Trafiklab's keyless SL Transport API so the browser never
talks to third parties directly and responses can be cached centrally.
"""
import httpx
from fastapi import APIRouter, HTTPException, Query

from app.deps import CurrentUser
from app.schemas import SlDeparture, SlSite
from app.services.sl import departures, search_sites

router = APIRouter(prefix="/api/transit", tags=["transit"])


@router.get("/sl/sites", response_model=list[SlSite])
async def sl_site_search(
    user: CurrentUser, q: str = Query(min_length=2, max_length=80)
) -> list[SlSite]:
    try:
        return [SlSite(**site) for site in await search_sites(q)]
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Could not reach the SL API")


@router.get("/sl/departures", response_model=list[SlDeparture])
async def sl_departures(
    user: CurrentUser,
    site_id: int = Query(ge=1),
    forecast: int = Query(default=60, ge=5, le=180),
) -> list[SlDeparture]:
    try:
        return [SlDeparture(**dep) for dep in await departures(site_id, forecast)]
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Could not reach the SL API")

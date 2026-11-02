"""Searching the web from the apps (2.8.4): a wish or a gift idea to link, a manual for something
in the home, facts about the car, things to do nearby. Through the server's own search engine
(SearXNG) and only when the server admin has turned it on – only the search words leave the server."""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.deps import CurrentUser, DB
from app.models import Family
from app.services import recipe_search

router = APIRouter(prefix="/api/search", tags=["search"])


class WebHit(BaseModel):
    title: str
    url: str
    site: str
    snippet: str


@router.get("/status")
async def search_status(user: CurrentUser, db: DB) -> dict:
    """Whether web search is on, and the family's place (from the weather) to suggest for
    "things to do nearby" – never sent anywhere unless the member searches with it."""
    family = await db.get(Family, user.family_id)
    return {"enabled": await recipe_search.get_url(db) is not None, "place": family.weather_place if family else None}


@router.get("/web", response_model=list[WebHit])
async def search_web(user: CurrentUser, db: DB, q: str = Query(min_length=2, max_length=160)) -> list[WebHit]:
    url = await recipe_search.get_url(db)
    if url is None:
        raise HTTPException(status_code=404, detail="Web search isn't turned on on this server")
    try:
        hits = await recipe_search.search(url, q, user.language or "en", recipe=False)
    except recipe_search.RecipeSearchError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return [WebHit(**h.__dict__) for h in hits]

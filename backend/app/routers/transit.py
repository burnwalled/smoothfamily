"""Public transport departures for the Departures widget (3.4.0: several providers).

The backend asks the providers so the browser never talks to third parties directly, and answers
are cached centrally. SL needs no key, as before; the others' keys are added by the server admin.
The old SL addresses stay for widgets and apps that use them.
"""
import httpx
from fastapi import APIRouter, HTTPException, Query

from app.deps import DB, CurrentUser
from app.schemas import SlDeparture, SlSite, TransitProviderOut, TransitStop
from app.services import transit
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
    site_id: int | None = Query(default=None, ge=1),
    # The same address as every provider's ({provider}/departures?stop=).
    stop: int | None = Query(default=None, ge=1),
    forecast: int = Query(default=60, ge=5, le=180),
) -> list[SlDeparture]:
    site = site_id or stop
    if site is None:
        raise HTTPException(status_code=422, detail="Choose a stop")
    try:
        return [SlDeparture(**dep) for dep in await departures(site, forecast)]
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Could not reach the SL API")


@router.get("/providers", response_model=list[TransitProviderOut])
async def providers(user: CurrentUser, db: DB) -> list[TransitProviderOut]:
    """Every provider, whether it can be used on this server, and the family's own first."""
    have = await transit.keys(db)
    first = transit.BY_LANGUAGE.get(user.language or "", "sl")
    rows = [
        TransitProviderOut(id=pid, name=name, area=area, needs_key=need == "required", available=transit.available(pid, have), suggested=pid == first)
        for pid, (name, area, need, _) in transit.PROVIDERS.items()
    ]
    return sorted(rows, key=lambda r: (not r.suggested, not r.available))


def _known(provider: str) -> None:
    if provider not in transit.PROVIDERS:
        raise HTTPException(status_code=404, detail="Unknown provider")


@router.get("/{provider}/stops", response_model=list[TransitStop])
async def stops(provider: str, user: CurrentUser, db: DB, q: str = Query(min_length=2, max_length=80)) -> list[TransitStop]:
    _known(provider)
    try:
        return [TransitStop(**s) for s in await transit.search(db, provider, q)]
    except transit.TransitError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        raise HTTPException(status_code=502, detail="The provider isn't answering right now")


@router.get("/{provider}/departures", response_model=list[SlDeparture])
async def provider_departures(provider: str, user: CurrentUser, db: DB, stop: str = Query(min_length=1, max_length=120)) -> list[SlDeparture]:
    _known(provider)
    try:
        return [SlDeparture(**d) for d in await transit.departures(db, provider, stop)]
    except ValueError:
        raise HTTPException(status_code=422, detail="Not a stop of this provider")
    except transit.TransitError as exc:
        raise HTTPException(status_code=409 if "key" in str(exc) else 502, detail=str(exc))
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="The provider isn't answering right now")

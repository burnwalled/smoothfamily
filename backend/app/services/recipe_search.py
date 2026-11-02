"""Searching the web through the server's own SearXNG (a self-hosted metasearch engine), only when
the server admin has turned it on. Only the search words leave the server – never what the family
has at home or who they are.

Used for real recipes (2.8.3: a hit is imported from its page like any recipe link, see
services/recipe_import.py) and for wishes on a wish list (2.8.4: a hit becomes the wish's link)."""
import json
from dataclasses import dataclass
from urllib.parse import urlparse

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AppSetting

KEY = "recipe_search"
TIMEOUT = httpx.Timeout(10.0, connect=5.0)
# Added to the search words, in the member's language, so the hits are recipes.
RECIPE_WORD = {"en": "recipe", "sv": "recept", "nb": "oppskrift", "da": "opskrift", "fi": "resepti"}
MAX_RESULTS = 12


class RecipeSearchError(Exception):
    """Shown to the user: the search couldn't be made."""


@dataclass
class Hit:
    title: str
    url: str
    site: str
    snippet: str


async def get_url(db: AsyncSession) -> str | None:
    row = await db.get(AppSetting, KEY)
    return json.loads(row.value).get("url") if row else None


async def set_url(db: AsyncSession, url: str | None) -> None:
    row = await db.get(AppSetting, KEY)
    if url is None:
        if row is not None:
            await db.delete(row)
    elif row is None:
        db.add(AppSetting(key=KEY, value=json.dumps({"url": url})))
    else:
        row.value = json.dumps({"url": url})
    await db.commit()


async def search(base_url: str, words: str, language: str = "en", recipe: bool = True) -> list[Hit]:
    """Web pages for the words (plus "recipe" unless recipe=False), from SearXNG's JSON API."""
    query = f"{words.strip()} {RECIPE_WORD.get(language, 'recipe')}" if recipe else words.strip()
    rows, _ = await _ask(base_url, query, language)
    hits: list[Hit] = []
    seen: set[str] = set()
    for row in rows:
        url = str(row.get("url") or "")
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https") or not parsed.hostname or url in seen:
            continue
        seen.add(url)
        site = parsed.hostname.removeprefix("www.")
        hits.append(Hit(title=str(row.get("title") or site)[:200], url=url, site=site, snippet=str(row.get("content") or "")[:300]))
        if len(hits) >= MAX_RESULTS:
            break
    return hits


async def health(base_url: str, test_search: bool = True) -> dict:
    """For Server settings: the SearXNG version, whether a test search gives hits, and which of its
    search engines didn't answer (e.g. a site that changed or asks it to slow down). While the search
    is off nothing is searched (test_search=False): only SearXNG itself is asked for its version."""
    version = None
    reached = False
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, headers={"User-Agent": "SmoothFamily (recipe search)"}) as client:
            resp = await client.get(f"{base_url.rstrip('/')}/config")
        reached = resp.status_code == 200
        if reached:
            version = str(resp.json().get("version") or "") or None
    except (httpx.HTTPError, ValueError):
        pass
    if not test_search:
        return {"ok": reached, "version": version, "hits": None, "unresponsive": [], "error": None if reached else "The search engine couldn't be reached"}
    try:
        rows, unresponsive = await _ask(base_url, "pancakes recipe", "en")
    except RecipeSearchError as exc:
        return {"ok": False, "version": version, "hits": 0, "unresponsive": [], "error": str(exc)}
    return {
        "ok": bool(rows),
        "version": version,
        "hits": len(rows),
        "unresponsive": [{"engine": str(e[0]), "reason": str(e[1])} for e in unresponsive if isinstance(e, (list, tuple)) and len(e) == 2],
        "error": None,
    }


async def _ask(base_url: str, query: str, language: str) -> tuple[list[dict], list]:
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, headers={"User-Agent": "SmoothFamily (recipe search)"}) as client:
            resp = await client.get(f"{base_url.rstrip('/')}/search", params={"q": query, "format": "json", "language": language, "safesearch": 1})
    except httpx.HTTPError as exc:
        raise RecipeSearchError("The search engine couldn't be reached") from exc
    if resp.status_code == 403:
        raise RecipeSearchError("The search engine doesn't allow format=json – turn it on in SearXNG's settings.yml")
    if resp.status_code != 200:
        raise RecipeSearchError(f"The search engine answered {resp.status_code}")
    try:
        data = resp.json()
    except ValueError as exc:
        raise RecipeSearchError("The search engine didn't answer with JSON") from exc
    return list(data.get("results", [])), list(data.get("unresponsive_engines", []))

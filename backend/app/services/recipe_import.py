"""Recipe from a link: fetch the page and read its schema.org Recipe (JSON-LD), which most
recipe sites publish for search engines.

The fetch is guarded against SSRF: http(s) only, every address the host name resolves to must be
public (no loopback, private, link-local or reserved ranges – also after each redirect), and the
response is capped in time and size.
"""
import asyncio
import ipaddress
import json
import re
import socket
from dataclasses import dataclass, field
from html import unescape
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

import httpx

MAX_BYTES = 3 * 1024 * 1024
MAX_IMAGE_BYTES = 8 * 1024 * 1024
TIMEOUT = httpx.Timeout(10.0, connect=5.0)
MAX_REDIRECTS = 4
USER_AGENT = "Mozilla/5.0 (compatible; SmoothFamily recipe import)"


# Big recipe sites a server can't import from right now (checked 2026-10-30): their import buttons
# are greyed out with the reason, instead of failing after a wait. The family can paste the text or
# let the local AI read a screenshot. Never worked around by pretending to be a browser.
NOT_IMPORTABLE = {
    "ica.se": "ICA turns servers away (403)",
    "coop.se": "Coop builds its recipe pages in the browser",
}


def not_importable(url: str) -> str | None:
    host = (urlparse(url.strip()).hostname or "").lower().removeprefix("www.")
    for site, reason in NOT_IMPORTABLE.items():
        if host == site or host.endswith("." + site):
            return reason
    return None


class RecipeImportError(Exception):
    """Shown to the user: the page can't be used."""


@dataclass
class ParsedIngredient:
    name: str
    amount: float | None = None
    unit: str | None = None


@dataclass
class ParsedRecipe:
    name: str
    description: str | None = None
    servings: int = 4
    ingredients: list[ParsedIngredient] = field(default_factory=list)
    steps: list[str] = field(default_factory=list)
    image_url: str | None = None


# --- Safe fetching -------------------------------------------------------------------------


async def _check_public(host: str) -> None:
    try:
        infos = await asyncio.get_running_loop().getaddrinfo(host, None, type=socket.SOCK_STREAM)
    except socket.gaierror as exc:
        raise RecipeImportError("The address could not be found") from exc
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global or ip.is_multicast:
            raise RecipeImportError("Only public web addresses can be imported")


async def safe_get(url: str, limit: int = MAX_BYTES) -> tuple[bytes, str, str]:
    """GET a public http(s) URL; returns (body, content type, final URL)."""
    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=False, headers={"User-Agent": USER_AGENT}) as client:
        for _ in range(MAX_REDIRECTS + 1):
            parsed = urlparse(url)
            if parsed.scheme not in {"http", "https"} or not parsed.hostname:
                raise RecipeImportError("Only http and https links can be imported")
            await _check_public(parsed.hostname)
            async with client.stream("GET", url) as resp:
                if resp.is_redirect and "location" in resp.headers:
                    url = urljoin(url, resp.headers["location"])
                    continue
                if resp.status_code >= 400:
                    raise RecipeImportError(f"The page answered {resp.status_code}")
                body = bytearray()
                async for chunk in resp.aiter_bytes():
                    body.extend(chunk)
                    if len(body) > limit:
                        raise RecipeImportError("The page is too large")
                return bytes(body), resp.headers.get("content-type", ""), url
    raise RecipeImportError("Too many redirects")


# --- Reading the page ------------------------------------------------------------------------


class _JsonLd(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.blocks: list[str] = []
        self._inside = False

    def handle_starttag(self, tag, attrs):
        if tag == "script" and dict(attrs).get("type", "").lower().strip() == "application/ld+json":
            self._inside = True
            self.blocks.append("")

    def handle_endtag(self, tag):
        if tag == "script":
            self._inside = False

    def handle_data(self, data):
        if self._inside:
            self.blocks[-1] += data


def _is_recipe(node: dict) -> bool:
    kind = node.get("@type")
    kinds = kind if isinstance(kind, list) else [kind]
    return any(isinstance(k, str) and k.lower() == "recipe" for k in kinds)


def _find_recipe(data) -> dict | None:
    if isinstance(data, list):
        for item in data:
            if (found := _find_recipe(item)) is not None:
                return found
    elif isinstance(data, dict):
        if _is_recipe(data):
            return data
        for key in ("@graph", "mainEntity", "mainEntityOfPage"):
            if key in data and (found := _find_recipe(data[key])) is not None:
                return found
    return None


def _text(value) -> str:
    """Plain text: tags stripped, entities decoded, whitespace collapsed."""
    if value is None:
        return ""
    if isinstance(value, list):
        value = " ".join(_text(v) for v in value)
    if isinstance(value, dict):
        value = value.get("text") or value.get("name") or ""
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", str(value)))).strip()


def _steps(value) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        parts = re.split(r"\n+|(?<=[.!?])\s+(?=\d+[.)]\s)", unescape(value))
        return [s for s in (_text(p) for p in parts) if s]
    if isinstance(value, dict):
        if "itemListElement" in value:  # HowToSection
            return _steps(value["itemListElement"])
        return [t] if (t := _text(value)) else []
    steps: list[str] = []
    for item in value:
        steps.extend(_steps(item))
    return steps


def _servings(value) -> int:
    if isinstance(value, list):
        value = value[0] if value else None
    match = re.search(r"\d+", str(value or ""))
    return max(1, min(20, int(match.group()))) if match else 4


def _image(value, base: str) -> str | None:
    if isinstance(value, list):
        value = value[0] if value else None
    if isinstance(value, dict):
        value = value.get("url") or value.get("contentUrl")
    return urljoin(base, value) if isinstance(value, str) and value.strip() else None


# --- Ingredients -----------------------------------------------------------------------------

UNITS = {
    "dl": "dl", "cl": "cl", "ml": "ml", "l": "l", "liter": "l",
    "msk": "msk", "tsk": "tsk", "krm": "krm", "matsked": "msk", "matskedar": "msk", "tesked": "tsk", "teskedar": "tsk",
    "g": "g", "gram": "g", "kg": "kg", "hg": "hg",
    "st": "st", "stycken": "st", "förp": "förp", "förpackning": "förp", "paket": "paket", "pkt": "paket",
    "burk": "burk", "burkar": "burk", "nypa": "nypa", "kruka": "kruka", "klyfta": "klyfta", "klyftor": "klyfta",
    "skiva": "skiva", "skivor": "skiva", "knippe": "knippe", "påse": "påse", "påsar": "påse",
    "tbsp": "msk", "tsp": "tsk", "cup": "cup", "cups": "cup", "oz": "oz", "lb": "lb",
}
FRACTIONS = {"½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3}
_AMOUNT = r"(\d+(?:[.,]\d+)?(?:\s+(?:\d+/\d+|[½¼¾⅓⅔]))?|\d+/\d+|[½¼¾⅓⅔])(?:\s*[-–]\s*(?:\d+(?:[.,]\d+)?|[½¼¾⅓⅔]))?"


def _number(text: str) -> float:
    text = text.strip()
    total = 0.0
    for part in text.split():
        if part in FRACTIONS:
            total += FRACTIONS[part]
        elif "/" in part:
            top, bottom = part.split("/")
            total += int(top) / int(bottom)
        else:
            total += float(part.replace(",", "."))
    return round(total, 3)


def parse_ingredient(line: str) -> ParsedIngredient:
    """'2 dl vetemjöl' → (2, dl, vetemjöl); '1 1/2 msk smör'; '2–3 ägg' takes the first number."""
    text = _text(line)
    for symbol in FRACTIONS:  # "1½" → "1 ½"
        text = re.sub(rf"(\d){symbol}", rf"\1 {symbol}", text)
    match = re.match(rf"^{_AMOUNT}\s*(.*)$", text)
    if not match:
        return ParsedIngredient(name=text[:200])
    amount = _number(match.group(1))
    rest = match.group(2).strip()
    word, _, remainder = rest.partition(" ")
    unit = UNITS.get(word.lower().rstrip("."))
    name = remainder.strip() if unit and remainder.strip() else rest
    return ParsedIngredient(name=(name or text)[:200], amount=amount, unit=unit if unit and remainder.strip() else None)


# --- Pasted text ----------------------------------------------------------------------------

_AMOUNT_ONLY = re.compile(rf"^{_AMOUNT}\s*(\S+)?$")
_STEP_NUMBER = re.compile(r"^(?:(?:steg|step|vaihe|trin|trinn)\s*)?\d+\s*[.):-]?\s+", re.I)
_HEADINGS = {"ingredienser", "ingredients", "ainekset", "ainesosat", "gör så här", "instruktioner", "instructions", "steg", "tillbehör", "ingredienser:", "så här gör du", "fremgangsmåde", "slik gjør du", "valmistus"}


def _is_heading(line: str) -> bool:
    low = line.lower().strip()
    return low in _HEADINGS or (low.endswith(":") and len(low) < 40)


def parse_ingredient_lines(text: str) -> list[ParsedIngredient]:
    """One ingredient per line, as copied from a recipe page. Section headings ("Sås:") are
    skipped, and an amount on its own line ("500 g") is joined with the next line ("nötfärs")."""
    lines = [re.sub(r"\s+", " ", l.replace("	", " ")).strip(" •-–*·") for l in text.splitlines()]
    lines = [l for l in lines if l and not _is_heading(l)]
    out: list[ParsedIngredient] = []
    i = 0
    while i < len(lines):
        line = lines[i]
        match = _AMOUNT_ONLY.match(line)
        word = (match.group(2) or "").lower().rstrip(".") if match else ""
        if match and (not word or word in UNITS) and i + 1 < len(lines) and not _AMOUNT_ONLY.match(lines[i + 1]):
            line = f"{line} {lines[i + 1]}"
            i += 1
        out.append(parse_ingredient(line))
        i += 1
    return out[:100]


def parse_step_lines(text: str) -> list[str]:
    """One step per paragraph or line; numbering like "1." or "Steg 2" is removed."""
    steps = []
    for line in text.splitlines():
        line = re.sub(r"\s+", " ", line).strip()
        if not line or _is_heading(line) or re.fullmatch(r"\d+[.)]?", line):
            continue
        steps.append(_STEP_NUMBER.sub("", line))
    return steps[:50]


# --- Entry point ------------------------------------------------------------------------------


def parse_recipe_html(html: str, base_url: str) -> ParsedRecipe:
    reader = _JsonLd()
    reader.feed(html)
    for block in reader.blocks:
        try:
            data = json.loads(block.strip())
        except ValueError:
            continue
        node = _find_recipe(data)
        if node is None:
            continue
        name = _text(node.get("name"))
        if not name:
            continue
        return ParsedRecipe(
            name=name[:200],
            description=_text(node.get("description"))[:2000] or None,
            servings=_servings(node.get("recipeYield")),
            ingredients=[parse_ingredient(i) for i in node.get("recipeIngredient") or node.get("ingredients") or [] if _text(i)],
            steps=_steps(node.get("recipeInstructions"))[:50],
            image_url=_image(node.get("image"), base_url),
        )
    raise RecipeImportError("No recipe was found on the page")


async def import_recipe(url: str) -> ParsedRecipe:
    body, content_type, final_url = await safe_get(url.strip())
    if "html" not in content_type and not body.lstrip()[:15].lower().startswith((b"<!doctype", b"<html")):
        raise RecipeImportError("The link isn't a web page")
    return parse_recipe_html(body.decode("utf-8", errors="replace"), final_url)


async def fetch_image(url: str) -> tuple[bytes, str] | None:
    """The recipe photo, or None when it can't be fetched safely (the recipe is kept anyway)."""
    try:
        body, content_type, _ = await safe_get(url, limit=MAX_IMAGE_BYTES)
    except (RecipeImportError, httpx.HTTPError):
        return None
    return (body, content_type.split(";")[0].strip()) if content_type.startswith("image/") else None

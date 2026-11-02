"""Local AI (#61, in 2.5.0): tasks for Ollama on a computer at home, queued until it is on.

- Optional: without it every task is done by hand, and even with it a member can always choose to
  do it by hand. The AI never changes anything itself – its answer is a suggestion to look at.
- Only at home: the AI's address must be on the home network (private addresses, `.local` …);
  nothing goes to a cloud service.
- Queued: jobs wait until the computer answers. The server checks every few minutes (the server
  admin chooses), or wakes it with Wake-on-LAN and lets a small helper on the computer put it to
  sleep again when the queue is empty (docs/LOCAL_AI.md).
- Hosted families only when the server admin allows it and their own admin turns it on.
"""
import asyncio
import base64
import ipaddress
import json
import logging
import secrets
import socket
import uuid
from datetime import date, datetime, timedelta, timezone
from urllib.parse import urlparse

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AiJob, AppSetting, Family, PantryItem, Recipe, User
from app.services.notify import notify
from app.services.storage import get_storage

log = logging.getLogger(__name__)

CONFIG_KEY = "ai.config"
STATE_KEY = "ai.state"
KINDS = ("receipt", "recipe", "quick_add", "cook_ideas", "vehicle_receipt", "property_receipt", "meal_plan", "chores")
TIMEOUT = 300.0
TICK_SECONDS = 15
WOL_EVERY = timedelta(minutes=10)
LANGUAGES = {"en": "English", "sv": "Swedish", "nb": "Norwegian", "da": "Danish", "fi": "Finnish"}
# Units as the family writes them.
UNITS = {"en": "g, kg, ml, dl, l, tbsp, tsp, pcs", "sv": "g, kg, ml, dl, l, msk, tsk, krm, st", "nb": "g, kg, ml, dl, l, ss, ts, stk", "da": "g, kg, ml, dl, l, spsk, tsk, stk", "fi": "g, kg, ml, dl, l, rkl, tl, kpl"}

DEFAULTS = {
    "url": "",
    "text_model": "",
    "vision_model": "",
    "poll_minutes": 5,
    "allow_hosted": False,
    "keep_days": 14,
    "wol_enabled": False,
    "wol_mac": "",
    "wol_broadcast": "255.255.255.255",
    "helper_key": "",
}


class AiError(Exception):
    pass


# --- Settings (server-wide) -------------------------------------------------------------------


async def config(db: AsyncSession) -> dict:
    row = await db.get(AppSetting, CONFIG_KEY)
    stored = json.loads(row.value) if row else {}
    return {**DEFAULTS, **stored}


async def save_config(db: AsyncSession, values: dict) -> dict:
    current = await config(db)
    current.update(values)
    if not current["helper_key"]:
        current["helper_key"] = secrets.token_urlsafe(24)
    row = await db.get(AppSetting, CONFIG_KEY)
    if row is None:
        db.add(AppSetting(key=CONFIG_KEY, value=json.dumps(current)))
    else:
        row.value = json.dumps(current)
    await db.commit()
    return current


async def state(db: AsyncSession) -> dict:
    row = await db.get(AppSetting, STATE_KEY)
    return json.loads(row.value) if row else {}


async def set_state(db: AsyncSession, **values) -> None:
    current = {**await state(db), **values}
    row = await db.get(AppSetting, STATE_KEY)
    if row is None:
        db.add(AppSetting(key=STATE_KEY, value=json.dumps(current, default=str)))
    else:
        row.value = json.dumps(current, default=str)
    await db.commit()


_HOME_SUFFIXES = (".local", ".lan", ".home", ".home.arpa", ".internal")


def is_home_address(url: str) -> bool:
    """Only addresses on the home network: private IPs, localhost and local names."""
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if parsed.scheme not in ("http", "https") or not host:
        return False
    if host in ("localhost", "host.docker.internal") or host.endswith(_HOME_SUFFIXES) or "." not in host:
        return True
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        try:
            ip = ipaddress.ip_address(socket.gethostbyname(host))
        except OSError:
            return False
    return ip.is_private or ip.is_loopback or ip.is_link_local


def configured(cfg: dict) -> bool:
    return bool(cfg["url"] and cfg["text_model"])


async def family_may_use(db: AsyncSession, family: Family, cfg: dict | None = None) -> bool:
    cfg = cfg or await config(db)
    if not configured(cfg) or family.kind == "demo":
        return False
    if family.kind == "owner":
        return family.ai_enabled is not False
    return bool(cfg["allow_hosted"]) and family.ai_enabled is True


# --- Ollama -------------------------------------------------------------------------------


async def version(url: str) -> str | None:
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(url.rstrip("/") + "/api/version")
        return resp.json().get("version") if resp.status_code == 200 else None
    except Exception:
        return None


async def models(url: str) -> list[dict]:
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url.rstrip("/") + "/api/tags")
    resp.raise_for_status()
    return [{"name": m["name"], "size": m.get("size", 0)} for m in resp.json().get("models", [])]


async def chat(url: str, model: str, prompt: str, schema: dict, images: list[bytes] | None = None) -> dict:
    """One answer as JSON following `schema` (Ollama's structured outputs)."""
    message = {"role": "user", "content": prompt}
    if images:
        message["images"] = [base64.b64encode(i).decode() for i in images]
    body = {"model": model, "messages": [message], "stream": False, "format": schema, "options": {"temperature": 0.2, "num_ctx": 16384}}
    # No "thinking" first where the model allows it: it is slower and can use up the room before
    # the answer comes. gpt-oss can't turn it off and answers best when not asked to.
    if not model.startswith("gpt-oss"):
        body["think"] = False
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        resp = await client.post(url.rstrip("/") + "/api/chat", json=body)
        content = resp.json().get("message", {}).get("content", "") if resp.status_code == 200 else ""
        if resp.status_code == 200 and not content.strip() and "think" in body:
            # Some models don't take the setting: once more without it.
            body.pop("think")
            resp = await client.post(url.rstrip("/") + "/api/chat", json=body)
            content = resp.json().get("message", {}).get("content", "") if resp.status_code == 200 else ""
    if resp.status_code != 200:
        raise AiError(f"Ollama answered {resp.status_code}: {resp.text[:150]}")
    if not content.strip():
        raise AiError(f"{model} gave no answer – try another model under Server → Local AI")
    try:
        return json.loads(content)
    except json.JSONDecodeError as exc:
        raise AiError("The AI's answer wasn't valid JSON") from exc


def wake_on_lan(mac: str, broadcast: str = "255.255.255.255") -> None:
    """The magic packet: 6 × 0xFF and the MAC 16 times, as UDP to port 9."""
    raw = bytes.fromhex(mac.replace(":", "").replace("-", ""))
    if len(raw) != 6:
        raise AiError("A MAC address has 6 parts, e.g. 3C:7C:3F:12:34:56")
    packet = b"\xff" * 6 + raw * 16
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        sock.sendto(packet, (broadcast, 9))


# --- The tasks --------------------------------------------------------------------------------

PLACES = ["freezer", "fridge", "pantry"]
CATEGORIES = ["produce", "bread", "dairy", "meat_fish", "frozen", "pantry", "snacks", "beverages", "household", "other"]

# Step one for a receipt: the picture model only copies the lines; the text model makes sense of them.
LINES_SCHEMA = {"type": "object", "properties": {"store": {"type": ["string", "null"]}, "lines": {"type": "array", "items": {"type": "string"}}}, "required": ["lines"]}
READ_LINES = (
    "Copy every line of this receipt exactly as printed, one string per line (keep the letters "
    "å, ä, ö as they are). Put the shop's name in store."
)

VEHICLE_CATEGORIES = ["fuel", "charging", "service", "repair", "tyres", "insurance", "tax", "parking", "toll", "other"]

PROPERTY_CATEGORIES = ["maintenance", "renovation", "repair", "tax", "insurance", "utility", "loan", "other"]

SCHEMAS = {
    # The same answers the copy-the-prompt way asks for (services/prompts.py), as a schema.
    "meal_plan": {
        "type": "object",
        "properties": {
            "meals": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "weekday": {"type": "integer", "minimum": 0, "maximum": 6},
                        "name": {"type": "string"},
                        "description": {"type": ["string", "null"]},
                        "servings": {"type": "integer"},
                        "ingredients": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {"name": {"type": "string"}, "amount": {"type": ["number", "null"]}, "unit": {"type": ["string", "null"]}, "category": {"type": "string", "enum": CATEGORIES}},
                                "required": ["name", "category"],
                            },
                        },
                        "steps": {"type": "array", "items": {"type": "string"}},
                    },
                    "required": ["weekday", "name", "ingredients", "steps"],
                },
            }
        },
        "required": ["meals"],
    },
    "chores": {
        "type": "object",
        "properties": {
            "chores": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "description": {"type": ["string", "null"]},
                        "points": {"type": "integer"},
                        "recurrence": {"type": "string", "enum": ["daily", "weekly", "none"]},
                        "weekday": {"type": ["integer", "null"]},
                        "due_date": {"type": ["string", "null"]},
                        "assignee": {"type": ["string", "null"]},
                    },
                    "required": ["title", "points", "recurrence"],
                },
            }
        },
        "required": ["chores"],
    },
    "property_receipt": {
        "type": "object",
        "properties": {
            "expenses": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "amount": {"type": "number"},
                        "expense_date": {"type": ["string", "null"]},
                        "category": {"type": "string", "enum": PROPERTY_CATEGORIES},
                    },
                    "required": ["name", "amount", "category"],
                },
            }
        },
        "required": ["expenses"],
    },
    "vehicle_receipt": {
        "type": "object",
        "properties": {
            "expenses": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "amount": {"type": "number"},
                        "expense_date": {"type": ["string", "null"]},
                        "category": {"type": "string", "enum": VEHICLE_CATEGORIES},
                        "mileage_at": {"type": ["integer", "null"]},
                        "volume": {"type": ["number", "null"]},
                        "volume_unit": {"type": ["string", "null"], "enum": ["l", "kWh", None]},
                    },
                    "required": ["name", "amount", "category"],
                },
            }
        },
        "required": ["expenses"],
    },
    "receipt": {
        "type": "object",
        "properties": {
            "store": {"type": ["string", "null"]},
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "amount": {"type": ["number", "null"]},
                        "unit": {"type": "string"},
                        "place": {"type": "string", "enum": PLACES},
                        "keeps_days": {"type": ["integer", "null"]},
                        "food": {"type": "boolean"},
                    },
                    "required": ["name", "place", "food"],
                },
            },
        },
        "required": ["items"],
    },
    "recipe": {
        "type": "object",
        "properties": {
            "name": {"type": "string"},
            "servings": {"type": "integer"},
            "ingredients": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {"name": {"type": "string"}, "amount": {"type": ["number", "null"]}, "unit": {"type": ["string", "null"]}},
                    "required": ["name"],
                },
            },
            "steps": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["name", "ingredients", "steps"],
    },
    "quick_add": {
        "type": "object",
        "properties": {
            "items": {
                "type": "array",
                "items": {"type": "object", "properties": {"name": {"type": "string"}, "category": {"type": "string", "enum": CATEGORIES}}, "required": ["name", "category"]},
            }
        },
        "required": ["items"],
    },
    "complaint_letter": {
        "type": "object",
        "properties": {"subject": {"type": "string"}, "body": {"type": "string"}},
        "required": ["subject", "body"],
    },
    "receipt_info": {
        "type": "object",
        "properties": {
            "store": {"type": ["string", "null"]},
            "total": {"type": ["number", "null"]},
            "currency": {"type": ["string", "null"]},
            "purchased_on": {"type": ["string", "null"]},
            "category": {"type": "string", "enum": ["food", "home", "vehicle", "clothes", "children", "health", "leisure", "electronics", "gifts", "travel", "other"]},
        },
        "required": ["store", "total", "purchased_on", "category"],
    },
    "web_question": {
        "type": "object",
        "properties": {"answer": {"type": "string"}, "sources": {"type": "array", "items": {"type": "integer"}}},
        "required": ["answer", "sources"],
    },
    "cook_ideas": {
        "type": "object",
        "properties": {
            "ideas": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {"title": {"type": "string"}, "uses": {"type": "array", "items": {"type": "string"}}, "recipe": {"type": ["string", "null"]}, "why": {"type": "string"}},
                    "required": ["title", "uses", "why"],
                },
            }
        },
        "required": ["ideas"],
    },
}


async def prompt_for(db: AsyncSession, job: AiJob, language: str) -> str:
    lang = LANGUAGES.get(language, "English")
    units = UNITS.get(language, UNITS["en"])
    data = job.input or {}
    if job.kind == "receipt":
        lines = "\n".join(data.get("lines", []))
        return (
            "These are the lines of a grocery receipt. List every item bought. Clean up the names (no "
            f"product codes or abbreviations) and write them in {lang}. amount and unit as bought "
            f"with these units: {units}. place: where it is kept at home – 'freezer' for frozen "
            "things (words like fryst, frysta, frozen, glass), 'fridge' for dairy, butter and "
            "spreads, meat, fish, chicken and most fresh food, else 'pantry' (dry goods, tins, "
            "bread, fruit that keeps outside). The printed letters may be misread (Å/Ä/Ö mixed up): "
            "use the word that makes sense. keeps_days: roughly how many days it keeps from today "
            "where it is kept (null if months or more). "
            "food: false for things that aren't food or drink (bags, deposits, discounts, cleaning). "
            "Write names in normal case, e.g. 'Mjölk 3 %' not 'ARLA MJÖLK 3% 1L'. Skip lines that "
            "aren't things bought (shop name, date, totals, payment, VAT). Take amount and unit from "
            "the line itself (600G → 600 g, 1,12KG → 1.12 kg, 1L → 1 l); if it says nothing, 1 and "
            "the unit for one piece. One item per bought line – never invent items.\n"
            "Examples: 'BREGOTT NORMALSALT 600G 54,90' → name 'Bregott normalsaltat', amount 600, "
            "unit 'g', place 'fridge', keeps_days 60, food true. 'FRYSTA ÄRTER 750G 24,50' → name "
            "'Frysta ärter', amount 750, unit 'g', place 'freezer', keeps_days null, food true.\n\n"
            "Lines:\n" + lines
        )
    if job.kind == "meal_plan":
        from app.services.prompts import meals_prompt

        members = (await db.execute(select(func.count(User.id)).where(User.family_id == job.family_id))).scalar_one()
        return meals_prompt(date.fromisoformat(data["week_start"]), int(data.get("servings") or 4), str(data.get("preferences") or ""), members, language)
    if job.kind == "chores":
        from app.models import HomeProfile, Room
        from app.services.prompts import chores_prompt

        profile = (await db.execute(select(HomeProfile).where(HomeProfile.family_id == job.family_id))).scalar_one_or_none()
        rooms = (await db.execute(select(Room).where(Room.family_id == job.family_id))).scalars().all()
        members = (await db.execute(select(User).where(User.family_id == job.family_id))).scalars().all()
        return chores_prompt(profile, list(rooms), list(members), language)
    if job.kind == "property_receipt":
        source = "\n".join(data.get("lines", [])) or str(data.get("text", ""))[:12000]
        return (
            "This is a receipt or an invoice for a home (a craftsman, a builders' merchant, the "
            f"electricity or water bill, the insurance, the loan). List what was paid, in {lang}: "
            "usually one expense with the total to pay (VAT included); several only if it is clearly "
            "several separate bills. name: short, e.g. 'Elräkning oktober' or 'Målarfärg Bauhaus'. "
            "category: maintenance (upkeep, cleaning, small fixes), renovation (building or changing "
            "something), repair (something broken), tax (property tax/fee), insurance, utility (electricity, "
            "water, heating, waste, broadband), loan (interest, amortisation), else other. "
            "expense_date as YYYY-MM-DD – the invoice or receipt date (null if not printed). Never "
            "invent numbers that aren't there.\n\n" + source
        )
    if job.kind == "vehicle_receipt":
        source = "\n".join(data.get("lines", [])) or str(data.get("text", ""))[:12000]
        return (
            "This is a receipt or a service history for a car. List what was paid for, in "
            f"{lang}. One expense per receipt (the total paid, VAT included) – or, for a service "
            "history with several visits, one per visit. name: short, e.g. 'Tankning Circle K' or "
            "'Service 4 000 mil'. category: fuel (petrol, diesel), charging (electricity for the car), "
            "service, repair, tyres (tyres, tyre change, tyre hotel), insurance, tax, parking, toll, "
            "else other. expense_date as YYYY-MM-DD (null if not printed). mileage_at: the odometer "
            "in km if printed (a Swedish 'mil' is 10 km; mätarställning 12 345 mil → 123450), else "
            "null. volume and volume_unit: litres ('l') for fuel, kWh for charging, else null. Never "
            "invent numbers that aren't there.\n\n" + source
        )
    if job.kind == "recipe":
        return (
            f"Turn this into a recipe in {lang}: a name, servings, ingredients (amount as a number, "
            f"unit one of {units}) and the steps in order, one short step each."
            + ("\n\n" + str(data.get("text", ""))[:8000] if data.get("text") else " The recipe is in the photo.")
        )
    if job.kind == "complaint_letter":
        bought = ", ".join(x for x in (str(data.get("note") or ""), str(data.get("purchased_on") or ""), f"{data.get('amount')} {data.get('currency') or ''}".strip() if data.get("amount") is not None else "") if x)
        return (
            f"Write a short, polite complaint (a claim about a fault) to the shop, in {lang}. The buyer "
            f"is {data.get('name')}. Shop: {data.get('store') or 'the shop'}. Bought: {bought or 'see the receipt'}. "
            "Say what is wrong, that the receipt is attached, and ask for a repair, a new one or the money "
            "back. If the purchase is less than six months old, say the fault is presumed to have been "
            "there at purchase. No made-up facts, no placeholders except where the buyer must fill in "
            "something (in square brackets). subject: a short subject line.\n\nWhat is wrong: "
            + str(data.get("text", ""))[:2000]
        )
    if job.kind == "receipt_info":
        return (
            "These are the lines of a receipt (any shop). Read: store – the shop's name; total – the "
            "amount paid, VAT included, as a number; currency – a three-letter code if printed (SEK, "
            "NOK, EUR …); purchased_on – the date as YYYY-MM-DD; category – what was bought: food "
            "(groceries), home (furniture, tools, building), vehicle (fuel, car parts), clothes, "
            "children (toys, children's things), health (pharmacy), leisure (sport, hobbies, "
            "restaurants, cinema), electronics, gifts, travel (tickets, hotels), else other. Use null "
            "for what isn't printed – never invent numbers.\n\nLines:\n" + "\n".join(data.get("lines", []))
        )
    if job.kind == "web_question":
        sources = data.get("sources", [])
        listed = "\n".join(f"[{i + 1}] {s.get('title', '')} ({s.get('site', '')}): {s.get('snippet', '')}" for i, s in enumerate(sources))
        return (
            f"Answer the question in {lang}, briefly and plainly, using only these search results. "
            "Mark each fact with the number of its result, e.g. [2]. If the results don't answer it, "
            "say so – never guess. sources: the numbers of the results you used.\n\n"
            f"Question: {str(data.get('text', ''))[:500]}\n\nSearch results:\n{listed}"
        )
    if job.kind == "quick_add":
        return (
            f"Split this into separate shopping list items in {lang}, each with the shop category "
            f"({', '.join(CATEGORIES)}). Keep amounts in the name (e.g. '2 packs of butter').\n\n" + str(data.get("text", ""))[:2000]
        )
    # cook_ideas: what is about to run out, and the family's own recipes.
    soon = (
        await db.execute(
            select(PantryItem).where(PantryItem.family_id == job.family_id, PantryItem.best_before <= date.today() + timedelta(days=4))
        )
    ).scalars().all()
    stock = (await db.execute(select(PantryItem.name).where(PantryItem.family_id == job.family_id))).scalars().all()
    recipes = (await db.execute(select(Recipe.name).where(Recipe.family_id == job.family_id))).scalars().all()
    return (
        f"Suggest up to 5 family dinners in {lang} that use up what is about to run out. Prefer the "
        "family's own recipes (set 'recipe' to its exact name) and say which items each one uses and why.\n"
        f"About to run out: {', '.join(i.name for i in soon) or 'nothing'}\n"
        f"Also at home: {', '.join(stock[:80]) or 'nothing'}\n"
        f"The family's recipes: {', '.join(recipes[:80]) or 'none'}"
    )


def describe(job: AiJob) -> str:
    """For the notification: what the AI came up with."""
    r = job.result or {}
    if job.kind == "receipt":
        return str(len([i for i in r.get("items", []) if i.get("food", True)]))
    if job.kind == "recipe":
        return r.get("name", "")
    if job.kind == "quick_add":
        return str(len(r.get("items", [])))
    if job.kind in ("vehicle_receipt", "property_receipt"):
        return str(len(r.get("expenses", [])))
    if job.kind == "meal_plan":
        return str(len(r.get("meals", [])))
    if job.kind == "chores":
        return str(len(r.get("chores", [])))
    if job.kind == "web_question":
        return ""
    if job.kind == "receipt_info":
        return str(r.get("store") or "")
    if job.kind == "complaint_letter":
        return str(r.get("subject") or "")
    return str(len(r.get("ideas", [])))


_DONE = {
    "receipt": {"en": "The receipt is read – {x} items to look at", "sv": "Kvittot är läst – {x} varor att titta på", "nb": "Kvitteringen er lest – {x} varer å se på", "da": "Kvitteringen er læst – {x} varer at se på", "fi": "Kuitti on luettu – {x} tuotetta tarkistettavaksi"},
    "recipe": {"en": "The recipe is ready: {x}", "sv": "Receptet är klart: {x}", "nb": "Oppskriften er klar: {x}", "da": "Opskriften er klar: {x}", "fi": "Resepti on valmis: {x}"},
    "quick_add": {"en": "{x} items ready for the list", "sv": "{x} varor klara för listan", "nb": "{x} varer klare for listen", "da": "{x} varer klar til listen", "fi": "{x} tuotetta valmiina listalle"},
    "meal_plan": {"en": "The week's dinners are ready – {x} to look at", "sv": "Veckans middagar är klara – {x} att titta på", "nb": "Ukens middager er klare – {x} å se på", "da": "Ugens aftensmåltider er klar – {x} at se på", "fi": "Viikon päivälliset ovat valmiit – {x} tarkistettavaksi"},
    "chores": {"en": "{x} chores suggested for the home", "sv": "{x} sysslor föreslagna för hemmet", "nb": "{x} gjøremål foreslått for hjemmet", "da": "{x} gøremål foreslået til hjemmet", "fi": "{x} kotityötä ehdotettu"},
    "property_receipt": {"en": "The receipt is read – {x} costs for the home to look at", "sv": "Kvittot är läst – {x} kostnader för bostaden att titta på", "nb": "Kvitteringen er lest – {x} kostnader for boligen å se på", "da": "Kvitteringen er læst – {x} udgifter til boligen at se på", "fi": "Kuitti on luettu – {x} asunnon kulua tarkistettavaksi"},
    "vehicle_receipt": {"en": "The receipt is read – {x} costs to look at", "sv": "Kvittot är läst – {x} kostnader att titta på", "nb": "Kvitteringen er lest – {x} kostnader å se på", "da": "Kvitteringen er læst – {x} udgifter at se på", "fi": "Kuitti on luettu – {x} kulua tarkistettavaksi"},
    "complaint_letter": {"en": "The complaint is written: {x}", "sv": "Reklamationen är skriven: {x}", "nb": "Reklamasjonen er skrevet: {x}", "da": "Reklamationen er skrevet: {x}", "fi": "Reklamaatio on kirjoitettu: {x}"},
    "receipt_info": {"en": "The receipt is read: {x}", "sv": "Kvittot är läst: {x}", "nb": "Kvitteringen er lest: {x}", "da": "Kvitteringen er læst: {x}", "fi": "Kuitti on luettu: {x}"},
    "web_question": {"en": "Your question is answered", "sv": "Din fråga är besvarad", "nb": "Spørsmålet ditt er besvart", "da": "Dit spørgsmål er besvaret", "fi": "Kysymykseesi on vastattu"},
    "cook_ideas": {"en": "{x} dinner ideas from what you have", "sv": "{x} middagsidéer av det ni har", "nb": "{x} middagsideer av det dere har", "da": "{x} aftensmadsidéer af det, I har", "fi": "{x} päivällisideaa siitä, mitä on"},
}
_FAILED = {"en": "The AI couldn't do it – you can do it by hand", "sv": "AI:n klarade det inte – du kan göra det för hand", "nb": "AI-en klarte det ikke – du kan gjøre det for hånd", "da": "AI'en klarede det ikke – du kan gøre det i hånden", "fi": "Tekoäly ei onnistunut – voit tehdä sen käsin"}
_EXPIRED = {"en": "The AI computer wasn't on in time – the job was removed", "sv": "AI-datorn var inte igång i tid – jobbet togs bort", "nb": "AI-maskinen var ikke på i tide – jobben ble fjernet", "da": "AI-computeren var ikke tændt i tide – opgaven blev fjernet", "fi": "Tekoälykone ei ollut ajoissa päällä – työ poistettiin"}
TITLE = {"en": "Local AI", "sv": "Lokal AI", "nb": "Lokal AI", "da": "Lokal AI", "fi": "Paikallinen tekoäly"}


async def run_job(db: AsyncSession, job: AiJob, cfg: dict) -> None:
    user = await db.get(User, job.user_id)
    lang = (user.language if user else None) or "en"
    job.status, job.started_at = "running", datetime.now(timezone.utc)
    await db.commit()
    storage = get_storage()
    try:
        images = [storage.open(job.family_id, job.file_key).read_bytes()] if job.file_key else None
        if images and not cfg["vision_model"]:
            raise AiError("No model for pictures is chosen")
        if job.kind in ("receipt", "vehicle_receipt", "property_receipt", "receipt_info") and images:
            # Two steps: the picture model reads, the text model (better at judging) sorts it out.
            read = await chat(cfg["url"], cfg["vision_model"], READ_LINES, LINES_SCHEMA, images)
            job.input = {**(job.input or {}), "lines": read.get("lines", [])[:150], "store": read.get("store")}
            job.result = await chat(cfg["url"], cfg["text_model"], await prompt_for(db, job, lang), SCHEMAS[job.kind])
            job.result.setdefault("store", read.get("store"))
        elif job.kind in ("vehicle_receipt", "property_receipt"):
            job.result = await chat(cfg["url"], cfg["text_model"], await prompt_for(db, job, lang), SCHEMAS[job.kind])
        else:
            model = cfg["vision_model"] if images else cfg["text_model"]
            job.result = await chat(cfg["url"], model, await prompt_for(db, job, lang), SCHEMAS[job.kind], images)
        job.status, job.error = "done", None
    except Exception as exc:
        job.status, job.error = "failed", str(exc)[:300] or exc.__class__.__name__
    job.finished_at = datetime.now(timezone.utc)
    if job.file_key:
        # A vehicle receipt is the expense's own photo (kept); other pictures go once read.
        if not (job.input or {}).get("keep_file"):
            storage.delete(job.family_id, job.file_key)
        job.file_key = None
    await db.commit()
    if user:
        body = _DONE[job.kind].get(lang, _DONE[job.kind]["en"]).format(x=describe(job)) if job.status == "done" else _FAILED.get(lang, _FAILED["en"])
        await notify(db, user, {"title": TITLE.get(lang, TITLE["en"]), "body": body, "route": f"/ai?job={job.id}", "kind": "ai"})


async def expire_old(db: AsyncSession, cfg: dict, now: datetime) -> int:
    cutoff = now - timedelta(days=int(cfg["keep_days"]))
    old = (await db.execute(select(AiJob).where(AiJob.status == "queued", AiJob.created_at < cutoff))).scalars().all()
    for job in old:
        job.status = "expired"
        if job.file_key:
            if not (job.input or {}).get("keep_file"):
                get_storage().delete(job.family_id, job.file_key)
            job.file_key = None
        await db.commit()
        user = await db.get(User, job.user_id)
        if user:
            lang = user.language or "en"
            await notify(db, user, {"title": TITLE.get(lang, TITLE["en"]), "body": _EXPIRED.get(lang, _EXPIRED["en"]), "route": "/ai", "kind": "ai"})
    return len(old)


async def next_job(db: AsyncSession, cfg: dict) -> AiJob | None:
    for job in (await db.execute(select(AiJob).where(AiJob.status == "queued").order_by(AiJob.created_at))).scalars():
        family = await db.get(Family, job.family_id)
        if family and await family_may_use(db, family, cfg):
            return job
    return None


async def queued_count(db: AsyncSession) -> int:
    return (await db.execute(select(func.count()).select_from(AiJob).where(AiJob.status.in_(["queued", "running"])))).scalar_one()


async def tick(db: AsyncSession, now: datetime | None = None) -> int:
    """One round of the queue: expire, check whether the computer is on (and wake it), run what waits."""
    now = now or datetime.now(timezone.utc)
    cfg = await config(db)
    if not configured(cfg):
        return 0
    await expire_old(db, cfg, now)
    if not await next_job(db, cfg):
        return 0
    st = await state(db)
    last_probe = datetime.fromisoformat(st["last_probe"]) if st.get("last_probe") else None
    woke = datetime.fromisoformat(st["woke_at"]) if st.get("woke_at") else None
    waking = woke is not None and now - woke < timedelta(minutes=10)
    due = st.get("kick") or last_probe is None or waking or now - last_probe >= timedelta(minutes=int(cfg["poll_minutes"]))
    if not due:
        return 0
    online = await version(cfg["url"]) is not None
    await set_state(db, last_probe=now.isoformat(), kick=False, **({"last_online": now.isoformat()} if online else {}))
    if not online:
        if cfg["wol_enabled"] and cfg["wol_mac"]:
            last_wol = datetime.fromisoformat(st["last_wol"]) if st.get("last_wol") else None
            if last_wol is None or now - last_wol >= WOL_EVERY:
                try:
                    wake_on_lan(cfg["wol_mac"], cfg["wol_broadcast"] or "255.255.255.255")
                    await set_state(db, last_wol=now.isoformat(), woke_at=now.isoformat(), woken_by_server=True)
                except Exception as exc:
                    log.info("Wake-on-LAN failed: %s", exc)
        return 0
    ran = 0
    while (job := await next_job(db, cfg)) is not None:
        await run_job(db, job, cfg)
        ran += 1
    await set_state(db, queue_empty_since=datetime.now(timezone.utc).isoformat())
    return ran


async def kick(db: AsyncSession) -> None:
    """A new job: check the computer at the next tick instead of waiting for the interval."""
    await set_state(db, kick=True)


async def ai_worker(stop: asyncio.Event) -> None:
    """The queue runs on its own, beside the minute-based reminders: a job can take minutes."""
    import redis.asyncio as aioredis

    from app.config import get_settings
    from app.database import SessionLocal

    redis = aioredis.from_url(get_settings().redis_url, decode_responses=True)
    while not stop.is_set():
        try:
            if await redis.set("ai:runner:lock", "1", ex=int(TIMEOUT) + 60, nx=True):
                try:
                    async with SessionLocal() as db:
                        await tick(db)
                finally:
                    await redis.delete("ai:runner:lock")
        except Exception:
            log.exception("Local AI queue")
        try:
            await asyncio.wait_for(stop.wait(), timeout=TICK_SECONDS)
        except asyncio.TimeoutError:
            pass


def new_job_id() -> uuid.UUID:
    return uuid.uuid4()

"""A shopping list linked to one of Home Assistant's to-do lists (2.8.4, not fully tested yet).

Home Assistant passes the list on to the shop's app through the shop's own integration (ICA, Coop
…). Both ways, every couple of minutes (and at "Sync now"):

- new items here are added there, and items added there (in the shop's app) come here;
- an item ticked off there is ticked off here and offered for the pantry ("Just bought");
- an item ticked off here is ticked off there.

Each item remembers its Home Assistant uid, so nothing is added twice. It only works as well as the
shop's integration syncs ticks back to Home Assistant – which differs between integrations.
"""
import logging
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ListHaLink, ListItem, ListModel, SmarthomeConnection
from app.services import homeassistant as ha
from app.services.crypto import decrypt_token

log = logging.getLogger(__name__)

EVERY = timedelta(minutes=2)
# An item that disappeared in Home Assistant (removed in the shop's app): never added again.
GONE = "-"


async def sync(db: AsyncSession, link: ListHaLink) -> dict:
    """One round both ways. Returns what changed; a failure is kept on the link for the app to show."""
    conn = await db.get(SmarthomeConnection, link.connection_id)
    lst = await db.get(ListModel, link.list_id)
    if conn is None or lst is None:
        return {"error": "gone"}
    token = decrypt_token(conn.token_encrypted)
    counts = {"added_there": 0, "added_here": 0, "ticked_here": 0, "ticked_there": 0}
    try:
        there = await ha.todo_items(conn.base_url, token, link.entity_id)
        by_uid = {i["uid"]: i for i in there if i.get("uid")}
        rows = list((await db.execute(select(ListItem).where(ListItem.list_id == lst.id).order_by(ListItem.position))).scalars().all())
        mapped = {r.ha_uid for r in rows if r.ha_uid and r.ha_uid != GONE}

        for row in rows:
            if not row.ha_uid or row.ha_uid == GONE:
                continue
            item = by_uid.get(row.ha_uid)
            if item is None:
                row.ha_uid = GONE
            elif item.get("status") == "completed" and not row.done:
                row.done = True
                row.pantry_pending = True
                counts["ticked_here"] += 1
            elif row.done and item.get("status") == "needs_action":
                await ha.call_service(conn.base_url, token, "todo", "update_item", link.entity_id, {"item": row.ha_uid, "status": "completed"})
                counts["ticked_there"] += 1

        # New here → there. One already there by the same name is the same item (a list linked
        # anew); Home Assistant gives no uid back for an added item, so it is matched by name after.
        def same_name(row: ListItem, items: list[dict]) -> dict | None:
            return next((i for i in items if i.get("uid") and i["uid"] not in mapped and i.get("status") == "needs_action" and i.get("summary") == row.name[:255]), None)

        for row in [r for r in rows if not r.ha_uid and not r.done]:
            if match := same_name(row, there):
                row.ha_uid = match["uid"]
                mapped.add(match["uid"])
        fresh = [r for r in rows if not r.ha_uid and not r.done]
        for row in fresh:
            await ha.call_service(conn.base_url, token, "todo", "add_item", link.entity_id, {"item": row.name[:255]})
            counts["added_there"] += 1
        if fresh:
            there = await ha.todo_items(conn.base_url, token, link.entity_id)
            for row in fresh:
                if match := same_name(row, there):
                    row.ha_uid = match["uid"]
                    mapped.add(match["uid"])

        # New there (added in the shop's app) → here.
        position = len(rows)
        for item in there:
            if item.get("uid") and item["uid"] not in mapped and item.get("status") == "needs_action" and item.get("summary"):
                db.add(ListItem(list_id=lst.id, family_id=lst.family_id, name=str(item["summary"])[:255], category="other", position=position, ha_uid=item["uid"]))
                mapped.add(item["uid"])
                position += 1
                counts["added_here"] += 1
        link.last_error = None
    except ha.HomeAssistantError as exc:
        link.last_error = str(exc)[:300]
        counts["error"] = link.last_error
    link.last_sync = datetime.now(timezone.utc)
    await db.commit()
    if counts.get("ticked_here") or counts.get("added_here"):
        from app.services.events import publish_family

        await publish_family(lst.family_id, ["lists", "pantry"])
    if counts.get("ticked_here"):
        await _tell_bought(db, lst, counts["ticked_here"])
    return counts


_BOUGHT = {
    "en": ("Just bought", "{n} from {list} – into the pantry?"),
    "sv": ("Nyköpt", "{n} från {list} – in i skafferiet?"),
    "nb": ("Nettopp kjøpt", "{n} fra {list} – inn i spiskammeret?"),
    "da": ("Lige købt", "{n} fra {list} – ind i spisekammeret?"),
    "fi": ("Juuri ostettu", "{n} listalta {list} – ruokavarastoon?"),
}


async def _tell_bought(db: AsyncSession, lst: ListModel, n: int) -> None:
    """The adults who keep the pantry are asked once per round."""
    from app.models import User
    from app.routers.lists import _visible_to_user
    from app.services.notify import notify

    for user in (await db.execute(select(User).where(User.family_id == lst.family_id, User.role.in_(["admin", "adult"])))).scalars().all():
        if "pantry" in user.apps and _visible_to_user(lst, user):
            title, body = _BOUGHT.get(user.language or "en", _BOUGHT["en"])
            await notify(db, user, {"title": title, "body": body.format(n=n, list=lst.name), "route": "/pantry#bought", "kind": "pantry_bought"})


async def run_list_sync(db: AsyncSession, now: datetime | None = None) -> int:
    """Every couple of minutes, from the notification worker."""
    now = now or datetime.now(timezone.utc)
    done = 0
    for link in (await db.execute(select(ListHaLink))).scalars().all():
        last = link.last_sync if link.last_sync is None or link.last_sync.tzinfo else link.last_sync.replace(tzinfo=timezone.utc)
        if last is not None and now - last < EVERY:
            continue
        try:
            await sync(db, link)
            done += 1
        except Exception:  # one family's list must not stop the others'
            log.exception("List sync failed for %s", link.id)
            await db.rollback()
    return done


def guess_place(name: str, category: str | None) -> str:
    """Where a bought thing goes – the shop category first, then a word or two."""
    low = name.lower()
    if category == "frozen" or any(w in low for w in ("fryst", "frozen", "frossen", "pakaste", "glass")):
        return "freezer"
    if category in ("dairy", "meat_fish") or any(w in low for w in ("mjölk", "ost", "smör", "yoghurt", "grädde", "skinka", "kyckling", "fisk", "milk", "cheese", "butter")):
        return "fridge"
    return "pantry"


def not_food(category: str | None) -> bool:
    return category == "household"


async def new_link(db: AsyncSession, family_id: uuid.UUID, list_id: uuid.UUID, connection_id: uuid.UUID, entity_id: str) -> ListHaLink:
    link = (await db.execute(select(ListHaLink).where(ListHaLink.list_id == list_id))).scalar_one_or_none()
    if link is None:
        link = ListHaLink(family_id=family_id, list_id=list_id, connection_id=connection_id, entity_id=entity_id)
        db.add(link)
    else:
        link.connection_id, link.entity_id, link.last_error, link.last_sync = connection_id, entity_id, None, None
    # A new link starts afresh: every item is matched again.
    for row in (await db.execute(select(ListItem).where(ListItem.list_id == list_id))).scalars().all():
        row.ha_uid = None
    await db.commit()
    return link

"""Named household lists with per-member visibility.

Secret-list rule: excluded members must get 404 (never 403) so list existence is not leaked.
"""

import uuid
from datetime import datetime

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.deps import CurrentUser, DB, require_app
from app.models import ListItem, ListModel, User
from app.schemas import (
    ListCreate,
    ListItemCreate,
    ListItemOut,
    ListItemReorder,
    ListItemUpdate,
    ListOut,
    ListUpdate,
)

router = APIRouter(prefix="/api/lists", tags=["lists"], dependencies=[require_app("lists")])

CATEGORY_ORDER = [
    "produce",
    "bread",
    "dairy",
    "meat_fish",
    "frozen",
    "pantry",
    "snacks",
    "beverages",
    "household",
    "other",
]


def _is_admin(user: User) -> bool:
    return user.role == "admin"


def _visible_to_user(lst: ListModel, user: User) -> bool:
    if not lst.allowed_user_ids:
        return True
    return str(user.id) in {str(x) for x in lst.allowed_user_ids}


async def _load_list_or_404(list_id: uuid.UUID, user: User, db: DB) -> ListModel:
    lst = await db.get(ListModel, list_id)
    if lst is None or lst.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="List not found")
    if not _visible_to_user(lst, user):
        # Deliberately 404 to avoid secret-list leakage.
        raise HTTPException(status_code=404, detail="List not found")
    return lst


async def _validate_allowed_users(allowed_user_ids: list[uuid.UUID], family_id: uuid.UUID, db: DB) -> None:
    if not allowed_user_ids:
        return
    users = (
        await db.execute(
            select(User.id).where(User.family_id == family_id, User.id.in_(allowed_user_ids))
        )
    ).scalars().all()
    if len(users) != len(set(allowed_user_ids)):
        raise HTTPException(status_code=422, detail="Invalid allowed_user_ids")


@router.get("", response_model=list[ListOut])
async def list_lists(user: CurrentUser, db: DB, include_archived: bool = Query(default=False)) -> list[ListModel]:
    rows = (
        await db.execute(
            select(ListModel)
            .where(ListModel.family_id == user.family_id)
            .order_by(ListModel.archived, ListModel.created_at, ListModel.name)
        )
    ).scalars().all()
    visible = [lst for lst in rows if _visible_to_user(lst, user)]
    if not include_archived:
        visible = [lst for lst in visible if not lst.archived]
    if visible:
        counts = dict(
            (
                await db.execute(
                    select(ListItem.list_id, func.count())
                    .where(ListItem.list_id.in_([lst.id for lst in visible]), ListItem.done == False)  # noqa: E712
                    .group_by(ListItem.list_id)
                )
            ).all()
        )
        for lst in visible:
            lst.open_items = counts.get(lst.id, 0)
    return visible


@router.post("", response_model=ListOut, status_code=status.HTTP_201_CREATED)
async def create_list(payload: ListCreate, user: CurrentUser, db: DB) -> ListModel:
    await _validate_allowed_users(payload.allowed_user_ids, user.family_id, db)
    lst = ListModel(
        family_id=user.family_id,
        name=payload.name.strip(),
        allowed_user_ids=[str(uid) for uid in payload.allowed_user_ids],
        created_by=user.id,
        archived=payload.archived,
    )
    db.add(lst)
    await db.commit()
    await db.refresh(lst)
    return lst


@router.get("/{list_id}", response_model=ListOut)
async def get_list(list_id: uuid.UUID, user: CurrentUser, db: DB) -> ListModel:
    return await _load_list_or_404(list_id, user, db)


@router.patch("/{list_id}", response_model=ListOut)
async def patch_list(list_id: uuid.UUID, payload: ListUpdate, user: CurrentUser, db: DB) -> ListModel:
    lst = await _load_list_or_404(list_id, user, db)
    data = payload.model_dump(exclude_unset=True)
    # Any adult may rename a list they see (as they may remove it); who sees it stays the creator's
    # and the admin's choice.
    renaming_only = set(data) <= {"name"} and user.role == "adult"
    if not (_is_admin(user) or lst.created_by == user.id or renaming_only):
        raise HTTPException(status_code=403, detail="Only creator or admin can edit this list")

    if "allowed_user_ids" in data and data["allowed_user_ids"] is not None:
        await _validate_allowed_users(data["allowed_user_ids"], user.family_id, db)
        data["allowed_user_ids"] = [str(uid) for uid in data["allowed_user_ids"]]

    for field, value in data.items():
        setattr(lst, field, value)

    await db.commit()
    await db.refresh(lst)
    return lst


@router.delete("/{list_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_list(list_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    lst = await _load_list_or_404(list_id, user, db)
    # Children may only delete their own lists; adults may tidy up any family list.
    if not (_is_admin(user) or user.role == "adult" or lst.created_by == user.id):
        raise HTTPException(status_code=403, detail="Only the creator or an adult can delete this list")
    await db.delete(lst)
    await db.commit()


@router.get("/{list_id}/items", response_model=list[ListItemOut])
async def list_items(list_id: uuid.UUID, user: CurrentUser, db: DB) -> list[ListItem]:
    lst = await _load_list_or_404(list_id, user, db)
    items = (
        await db.execute(
            select(ListItem)
            .where(ListItem.list_id == lst.id, ListItem.family_id == user.family_id)
            .order_by(ListItem.done, ListItem.position, ListItem.created_at)
        )
    ).scalars().all()
    return list(items)


@router.post("/{list_id}/items", response_model=ListItemOut, status_code=status.HTTP_201_CREATED)
async def create_item(list_id: uuid.UUID, payload: ListItemCreate, user: CurrentUser, db: DB) -> ListItem:
    lst = await _load_list_or_404(list_id, user, db)
    max_position = (
        await db.execute(
            select(ListItem.position)
            .where(ListItem.list_id == lst.id)
            .order_by(ListItem.position.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    item = ListItem(
        list_id=lst.id,
        family_id=user.family_id,
        name=payload.name.strip(),
        category=payload.category,
        position=0 if max_position is None else max_position + 1,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.patch("/{list_id}/items/{item_id}", response_model=ListItemOut)
async def patch_item(
    list_id: uuid.UUID, item_id: uuid.UUID, payload: ListItemUpdate, user: CurrentUser, db: DB
) -> ListItem:
    lst = await _load_list_or_404(list_id, user, db)
    item = await db.get(ListItem, item_id)
    if item is None or item.list_id != lst.id or item.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Item not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, field, value)

    await db.commit()
    await db.refresh(item)
    return item


@router.post("/{list_id}/items/reorder", response_model=list[ListItemOut])
async def reorder_items(list_id: uuid.UUID, payload: list[ListItemReorder], user: CurrentUser, db: DB) -> list[ListItem]:
    lst = await _load_list_or_404(list_id, user, db)
    ids = [item.id for item in payload]
    rows = (
        await db.execute(
            select(ListItem).where(
                ListItem.family_id == user.family_id,
                ListItem.list_id == lst.id,
                ListItem.id.in_(ids),
            )
        )
    ).scalars().all()
    if len(rows) != len(ids):
        raise HTTPException(status_code=404, detail="One or more items not found")

    by_id = {item.id: item for item in rows}
    for item in payload:
        by_id[item.id].position = item.position

    await db.commit()

    ordered = (
        await db.execute(
            select(ListItem)
            .where(ListItem.family_id == user.family_id, ListItem.list_id == lst.id)
            .order_by(ListItem.done, ListItem.position, ListItem.created_at)
        )
    ).scalars().all()
    return list(ordered)


@router.delete("/{list_id}/done", status_code=status.HTTP_204_NO_CONTENT)
async def clear_done(list_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    lst = await _load_list_or_404(list_id, user, db)
    rows = (
        await db.execute(
            select(ListItem).where(ListItem.family_id == user.family_id, ListItem.list_id == lst.id, ListItem.done == True)  # noqa: E712
        )
    ).scalars().all()
    for row in rows:
        await db.delete(row)
    await db.commit()


@router.delete("/{list_id}/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_item(list_id: uuid.UUID, item_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    lst = await _load_list_or_404(list_id, user, db)
    item = await db.get(ListItem, item_id)
    if item is None or item.list_id != lst.id or item.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Item not found")
    if item.ha_uid and item.ha_uid != "-":
        await _remove_there(db, lst.id, [item.ha_uid])
    await db.delete(item)
    await db.commit()


async def _remove_there(db, list_id: uuid.UUID, uids: list[str]) -> None:
    """A linked list's items removed here go there too – if Home Assistant answers now."""
    from app.models import ListHaLink, SmarthomeConnection
    from app.services import homeassistant as ha
    from app.services.crypto import decrypt_token

    link = (await db.execute(select(ListHaLink).where(ListHaLink.list_id == list_id))).scalar_one_or_none()
    conn = await db.get(SmarthomeConnection, link.connection_id) if link else None
    if conn is None:
        return
    try:
        await ha.call_service(conn.base_url, decrypt_token(conn.token_encrypted), "todo", "remove_item", link.entity_id, {"item": uids})
    except ha.HomeAssistantError:
        pass


@router.get("/{list_id}/export-text")
async def export_text(list_id: uuid.UUID, user: CurrentUser, db: DB) -> dict:
    lst = await _load_list_or_404(list_id, user, db)
    rows = (
        await db.execute(
            select(ListItem)
            .where(ListItem.family_id == user.family_id, ListItem.list_id == lst.id)
            .order_by(ListItem.position, ListItem.created_at)
        )
    ).scalars().all()

    grouped: dict[str, list[str]] = {cat: [] for cat in CATEGORY_ORDER}
    for row in rows:
        grouped[row.category or "other"].append(row.name)

    lines: list[str] = []
    for cat in CATEGORY_ORDER:
        if not grouped[cat]:
            continue
        lines.append(f"[{cat}]")
        lines.extend(grouped[cat])
        lines.append("")

    text = "\n".join(lines).strip() + ("\n" if lines else "")
    return {"text": text}



# ── To a Home Assistant to-do list (2.8.4) ─────────────────────────────────────
# Home Assistant passes the list on to the shop's app through its own integration (ICA, Coop …);
# Smooth Family never logs in to a shop.


class HaTarget(BaseModel):
    connection_id: uuid.UUID
    home: str | None
    entity_id: str
    name: str


class HaLinkOut(BaseModel):
    connection_id: uuid.UUID
    entity_id: str
    name: str
    home: str | None
    last_sync: datetime | None
    last_error: str | None


class HaLinkIn(BaseModel):
    connection_id: uuid.UUID
    entity_id: str = Field(pattern=r"^todo\.[a-z0-9_]{1,200}$")


class ToHaIn(BaseModel):
    connection_id: uuid.UUID
    entity_id: str = Field(pattern=r"^todo\.[a-z0-9_]{1,200}$")
    # Only what isn't ticked off yet.
    open_only: bool = True


async def _ha_allowed(db, user) -> bool:
    from app.deps import require_smarthome_host

    try:
        await require_smarthome_host(user, db)
    except HTTPException:
        return False
    return True


@router.get("/ha/targets", response_model=list[HaTarget])
async def ha_targets(user: CurrentUser, db: DB) -> list[HaTarget]:
    """The to-do lists in the family's Home Assistants (a gateway that is away is left out)."""
    from app.models import Property
    from app.services import homeassistant as ha
    from app.services import smarthome_conn
    from app.services.crypto import decrypt_token

    if not await _ha_allowed(db, user):
        return []
    out = []
    conns = await smarthome_conn.all_for(db, user.family_id)
    for conn in conns:
        try:
            states = await ha.get_states(conn.base_url, decrypt_token(conn.token_encrypted))
        except ha.HomeAssistantError:
            continue
        prop = await db.get(Property, conn.property_id) if conn.property_id else None
        home = (conn.name or (prop.name if prop else None)) if len(conns) > 1 else None
        for s in states:
            eid = str(s.get("entity_id", ""))
            if eid.startswith("todo."):
                out.append(HaTarget(connection_id=conn.id, home=home, entity_id=eid, name=str(s.get("attributes", {}).get("friendly_name") or eid)))
    return out


@router.post("/{list_id}/to-ha")
async def list_to_ha(list_id: uuid.UUID, payload: ToHaIn, user: CurrentUser, db: DB) -> dict:
    """Add the list's items to a Home Assistant to-do list, one by one."""
    from app.models import SmarthomeConnection
    from app.services import homeassistant as ha
    from app.services.crypto import decrypt_token

    lst = await _load_list_or_404(list_id, user, db)
    if not await _ha_allowed(db, user):
        raise HTTPException(status_code=403, detail="Smart home is not available for this family")
    conn = await db.get(SmarthomeConnection, payload.connection_id)
    if conn is None or conn.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="No such Home Assistant")
    rows = (await db.execute(select(ListItem).where(ListItem.list_id == lst.id).order_by(ListItem.position))).scalars().all()
    items = [i for i in rows if not (payload.open_only and i.done)]
    token = decrypt_token(conn.token_encrypted)
    sent = 0
    try:
        for item in items:
            await ha.call_service(conn.base_url, token, "todo", "add_item", payload.entity_id, {"item": item.name[:255]})
            sent += 1
    except ha.HomeAssistantError as exc:
        raise HTTPException(status_code=502, detail=f"Home Assistant stopped after {sent} of {len(items)}: {exc}") from exc
    return {"sent": sent}



async def _link_out(db, link) -> HaLinkOut:
    from app.models import Property, SmarthomeConnection
    from app.services import smarthome_conn

    conn = await db.get(SmarthomeConnection, link.connection_id)
    prop = await db.get(Property, conn.property_id) if conn and conn.property_id else None
    several = len(await smarthome_conn.all_for(db, link.family_id)) > 1
    return HaLinkOut(
        connection_id=link.connection_id, entity_id=link.entity_id, name=link.entity_id,
        home=((conn.name or (prop.name if prop else None)) if several and conn else None), last_sync=link.last_sync, last_error=link.last_error,
    )


@router.get("/{list_id}/ha", response_model=HaLinkOut | None)
async def get_ha_link(list_id: uuid.UUID, user: CurrentUser, db: DB) -> HaLinkOut | None:
    from app.models import ListHaLink

    lst = await _load_list_or_404(list_id, user, db)
    link = (await db.execute(select(ListHaLink).where(ListHaLink.list_id == lst.id))).scalar_one_or_none()
    return await _link_out(db, link) if link else None


@router.put("/{list_id}/ha", response_model=HaLinkOut)
async def link_to_ha(list_id: uuid.UUID, payload: HaLinkIn, user: CurrentUser, db: DB) -> HaLinkOut:
    """Keep the list in step with a Home Assistant to-do list, both ways (synced at once, then
    every couple of minutes)."""
    from app.models import SmarthomeConnection
    from app.services import list_sync

    lst = await _load_list_or_404(list_id, user, db)
    if not await _ha_allowed(db, user):
        raise HTTPException(status_code=403, detail="Smart home is not available for this family")
    conn = await db.get(SmarthomeConnection, payload.connection_id)
    if conn is None or conn.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="No such Home Assistant")
    link = await list_sync.new_link(db, user.family_id, lst.id, conn.id, payload.entity_id)
    await list_sync.sync(db, link)
    return await _link_out(db, link)


@router.delete("/{list_id}/ha", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_from_ha(list_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    from app.models import ListHaLink

    lst = await _load_list_or_404(list_id, user, db)
    link = (await db.execute(select(ListHaLink).where(ListHaLink.list_id == lst.id))).scalar_one_or_none()
    if link is not None:
        await db.delete(link)
    for row in (await db.execute(select(ListItem).where(ListItem.list_id == lst.id))).scalars().all():
        row.ha_uid = None
    await db.commit()


@router.post("/{list_id}/ha/sync")
async def sync_with_ha(list_id: uuid.UUID, user: CurrentUser, db: DB) -> dict:
    from app.models import ListHaLink
    from app.services import list_sync

    lst = await _load_list_or_404(list_id, user, db)
    link = (await db.execute(select(ListHaLink).where(ListHaLink.list_id == lst.id))).scalar_one_or_none()
    if link is None:
        raise HTTPException(status_code=404, detail="The list isn't linked to Home Assistant")
    return await list_sync.sync(db, link)

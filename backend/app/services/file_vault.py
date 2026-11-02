"""The vault (2.8.1): every file the family keeps, in one place – photos, chat pictures, receipts and
documents. Nothing is moved; each file stays where it lives and is shown to those its own app shows
it to."""
import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Album,
    ChatMessage,
    Conversation,
    ConversationMember,
    MediaItem,
    Property,
    PropertyExpense,
    PropertyItem,
    Receipt,
    User,
    Vehicle,
    VehicleExpense,
)


@dataclass
class ReceiptRef:
    """Where a receipt photo belongs: a vehicle's expense, a home's expense or a thing in the home."""

    app: str  # vehicles | property | photos (a receipt kept in the vault)
    context: str
    link: str
    vehicle: Vehicle | None = None
    adults_only: bool = False


def may_see_vehicle(vehicle: Vehicle, user: User) -> bool:
    """As in Vehicles: admins see every vehicle; others those open to everyone or to them."""
    allowed = [str(uid) for uid in vehicle.allowed_user_ids or []]
    return user.role == "admin" or not allowed or str(user.id) in allowed


async def receipt_refs(db: AsyncSession, family_id: uuid.UUID, media_ids: list[uuid.UUID] | None = None) -> dict[uuid.UUID, list[ReceiptRef]]:
    """The receipts of the family (or of the given photos) and what each belongs to."""
    refs: dict[uuid.UUID, list[ReceiptRef]] = {}

    def only(col):
        return [col.is_not(None)] + ([col.in_(media_ids)] if media_ids is not None else [])

    rows = await db.execute(
        select(VehicleExpense, Vehicle)
        .join(Vehicle, Vehicle.id == VehicleExpense.vehicle_id)
        .where(VehicleExpense.family_id == family_id, *only(VehicleExpense.receipt_media_id))
    )
    for expense, vehicle in rows.all():
        refs.setdefault(expense.receipt_media_id, []).append(
            ReceiptRef("vehicles", f"{vehicle.name} · {expense.name}", "/vehicles", vehicle)
        )
    rows = await db.execute(
        select(PropertyExpense, Property)
        .join(Property, Property.id == PropertyExpense.property_id)
        .where(PropertyExpense.family_id == family_id, *only(PropertyExpense.receipt_media_id))
    )
    for expense, prop in rows.all():
        refs.setdefault(expense.receipt_media_id, []).append(ReceiptRef("property", f"{prop.name} · {expense.name}", "/property"))
    rows = await db.execute(
        select(PropertyItem, Property)
        .join(Property, Property.id == PropertyItem.property_id)
        .where(PropertyItem.family_id == family_id, *only(PropertyItem.receipt_media_id))
    )
    for item, prop in rows.all():
        refs.setdefault(item.receipt_media_id, []).append(ReceiptRef("property", f"{prop.name} · {item.name}", "/property"))
    for receipt in (await db.execute(select(Receipt).where(Receipt.family_id == family_id, *only(Receipt.media_id)))).scalars().all():
        vehicle = await db.get(Vehicle, receipt.vehicle_id) if receipt.vehicle_id else None
        refs.setdefault(receipt.media_id, []).append(ReceiptRef("photos", receipt.store or "", "/vault?view=receipt", vehicle, adults_only=True))
    return refs


def visible_refs(refs: list[ReceiptRef], user: User) -> list[ReceiptRef]:
    return [
        r
        for r in refs
        if r.app in user.apps and (r.vehicle is None or may_see_vehicle(r.vehicle, user)) and (not r.adults_only or user.role in ("admin", "adult"))
    ]


async def may_see_receipt(db: AsyncSession, user: User, item: MediaItem) -> bool:
    """A receipt is seen by the one who took it, and by those who may see what it belongs to."""
    if item.uploaded_by == user.id:
        return True
    refs = (await receipt_refs(db, item.family_id, [item.id])).get(item.id, [])
    return bool(visible_refs(refs, user))


async def receipts_album(db: AsyncSession, user: User) -> Album:
    album = (
        await db.execute(select(Album).where(Album.family_id == user.family_id, Album.kind == "receipts"))
    ).scalars().first()
    if album is None:
        album = Album(family_id=user.family_id, name="Receipts", kind="receipts", created_by=user.id)
        db.add(album)
        await db.flush()
    return album


async def my_chats(db: AsyncSession, user: User) -> dict[uuid.UUID, str]:
    """The chats this member is in, by name: the group's name, or the other one in a chat for two."""
    conv_ids = (
        await db.execute(select(ConversationMember.conversation_id).where(ConversationMember.user_id == user.id))
    ).scalars().all()
    if not conv_ids:
        return {}
    convs = (await db.execute(select(Conversation).where(Conversation.id.in_(conv_ids), Conversation.family_id == user.family_id))).scalars().all()
    members = (await db.execute(select(ConversationMember).where(ConversationMember.conversation_id.in_(conv_ids)))).scalars().all()
    by_conv: dict[uuid.UUID, list[uuid.UUID]] = {}
    for m in members:
        by_conv.setdefault(m.conversation_id, []).append(m.user_id)
    people = {u.id: u.display_name for u in (await db.execute(select(User).where(User.family_id == user.family_id))).scalars().all()}
    names: dict[uuid.UUID, str] = {}
    for conv in convs:
        ids = by_conv.get(conv.id, [])
        if len(ids) == 2:
            other = next((i for i in ids if i != user.id), None)
            names[conv.id] = people.get(other, conv.name or "Chat")
        else:
            names[conv.id] = conv.name or ", ".join(people[i] for i in ids if i != user.id and i in people) or "Chat"
    return names


async def chat_media(db: AsyncSession, user: User, conv_id: uuid.UUID | None = None) -> list[tuple[MediaItem, uuid.UUID]]:
    """The pictures sent in this member's chats (newest first), with the chat each was sent in."""
    chats = await my_chats(db, user)
    ids = [conv_id] if conv_id is not None else list(chats)
    ids = [i for i in ids if i in chats]
    if not ids:
        return []
    rows = await db.execute(
        select(MediaItem, ChatMessage.conversation_id)
        .join(ChatMessage, ChatMessage.media_id == MediaItem.id)
        .where(ChatMessage.conversation_id.in_(ids), MediaItem.family_id == user.family_id)
        .order_by(MediaItem.created_at.desc())
    )
    seen: set[uuid.UUID] = set()
    out = []
    for item, cid in rows.all():
        if item.id not in seen:
            seen.add(item.id)
            out.append((item, cid))
    return out

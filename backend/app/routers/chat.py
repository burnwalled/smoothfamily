"""Family chat v2 — user-created conversations, emoji, image attachments."""

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Path, Query, Response, UploadFile, status
from sqlalchemy import func, select, or_

from app.deps import CurrentUser, DB, require_app
from app.models import Album, Conversation, ConversationMember, ChatMessage, MediaItem, User
from app.routers.albums import ALLOWED_IMAGE_TYPES, MediaOut, store_upload
from app.services import giphy
from app.schemas import (
    ChatConversationOut,
    ChatMessageCreate,
    ChatMessageOut,
    ChatMessagesPage,
    ChatReadRequest,
    ConversationCreate,
    ConversationMembersUpdate,
)
from app.services.push import send_to_user, user_pref_enabled

router = APIRouter(prefix="/api/chat", tags=["chat"], dependencies=[require_app("chat")])

PAGE_SIZE = 30


def _snippet(text: str, max_len: int = 120) -> str:
    flat = " ".join(text.split())
    if len(flat) <= max_len:
        return flat
    return f"{flat[: max_len - 1]}…"


def _message_snippet(message: ChatMessage, max_len: int = 120) -> str:
    if message.body.strip():
        return _snippet(message.body, max_len)
    if message.gif_id:
        return "GIF"
    if message.media_id:
        return "📷"
    return ""


def _epoch() -> datetime:
    return datetime(1970, 1, 1, tzinfo=timezone.utc)


async def _get_conversation(conv_id: uuid.UUID, user: User, db: DB) -> Conversation:
    conv = await db.get(Conversation, conv_id)
    if conv is None or conv.family_id != user.family_id:
        raise HTTPException(status_code=404, detail="Conversation not found")
    member = (
        await db.execute(
            select(ConversationMember).where(
                ConversationMember.conversation_id == conv_id,
                ConversationMember.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return conv


async def _member_map(family_id: uuid.UUID, db: DB) -> dict[uuid.UUID, User]:
    rows = (
        await db.execute(select(User).where(User.family_id == family_id))
    ).scalars().all()
    return {row.id: row for row in rows}


async def _conv_out(conv: Conversation, user: User, db: DB) -> ChatConversationOut:
    members = (
        await db.execute(
            select(ConversationMember).where(ConversationMember.conversation_id == conv.id)
        )
    ).scalars().all()

    my_member = next((m for m in members if m.user_id == user.id), None)
    read_at = my_member.last_read_at if my_member else _epoch()

    last_msg = (
        await db.execute(
            select(ChatMessage)
            .where(ChatMessage.conversation_id == conv.id)
            .order_by(ChatMessage.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    unread = (
        await db.execute(
            select(func.count())
            .select_from(ChatMessage)
            .where(
                ChatMessage.conversation_id == conv.id,
                or_(ChatMessage.sender_id.is_(None), ChatMessage.sender_id != user.id),
                ChatMessage.created_at > (read_at or _epoch()),
            )
        )
    ).scalar_one()

    member_users = (
        await db.execute(
            select(User).where(
                User.id.in_([m.user_id for m in members]),
                User.id != user.id,
            )
        )
    ).scalars().all()

    is_dm = len(members) == 2 and conv.party_id is None
    if is_dm and member_users:
        other = member_users[0]
        peer_name = other.display_name
        peer_color = other.color
        peer_user_id = other.id
    else:
        peer_name = conv.name or "Group"
        peer_color = None
        peer_user_id = None

    return ChatConversationOut(
        peer_key=str(conv.id),
        peer_type="dm" if is_dm else "group",
        peer_user_id=peer_user_id,
        peer_name=peer_name,
        peer_color=peer_color,
        last_message_snippet=_message_snippet(last_msg) if last_msg else None,
        last_message_at=last_msg.created_at if last_msg else None,
        unread_count=unread,
        conversation_id=conv.id,
        conversation_name=conv.name,
        member_ids=[m.user_id for m in members],
        # A party's chat is the party's to manage.
        is_creator=(conv.created_by == user.id and conv.party_id is None),
    )


@router.get("/conversations", response_model=list[ChatConversationOut])
async def list_conversations(user: CurrentUser, db: DB) -> list[ChatConversationOut]:
    member_rows = (
        await db.execute(
            select(ConversationMember.conversation_id)
            .where(ConversationMember.user_id == user.id)
        )
    ).scalars().all()

    if not member_rows:
        # Auto-create the family conversation on first use
        await _ensure_family_conversation(user, db)
        member_rows = (
            await db.execute(
                select(ConversationMember.conversation_id)
                .where(ConversationMember.user_id == user.id)
            )
        ).scalars().all()

    conv_ids = list(member_rows)
    convs = (
        await db.execute(
            select(Conversation).where(Conversation.id.in_(conv_ids))
        )
    ).scalars().all()

    results = [await _conv_out(conv, user, db) for conv in convs]
    results.sort(key=lambda c: (c.last_message_at is not None, c.last_message_at or _epoch(), c.peer_name.casefold()), reverse=True)
    return results


async def _ensure_family_conversation(user: User, db: DB) -> Conversation:
    """The family's own chat (marked is_family – a group someone names "Family" is not it): made on first
    use with everyone in it, and anyone who has joined the family since is let in."""
    existing = (
        await db.execute(
            select(Conversation).where(
                Conversation.family_id == user.family_id,
                Conversation.is_family.is_(True),
            ).order_by(Conversation.created_at)
        )
    ).scalars().first()
    if existing:
        mine = (
            await db.execute(
                select(ConversationMember).where(
                    ConversationMember.conversation_id == existing.id, ConversationMember.user_id == user.id
                )
            )
        ).scalar_one_or_none()
        if mine is None:
            db.add(ConversationMember(conversation_id=existing.id, user_id=user.id, joined_at=datetime.now(timezone.utc)))
            await db.commit()
        return existing

    members = (
        await db.execute(select(User).where(User.family_id == user.family_id))
    ).scalars().all()

    conv = Conversation(
        family_id=user.family_id,
        name="Family",
        created_by=user.id,
        is_family=True,
    )
    db.add(conv)
    await db.flush()

    now = datetime.now(timezone.utc)
    for m in members:
        db.add(ConversationMember(conversation_id=conv.id, user_id=m.id, joined_at=now))
    await db.commit()
    return conv


@router.post("/conversations", response_model=ChatConversationOut, status_code=status.HTTP_201_CREATED)
async def create_conversation(payload: ConversationCreate, user: CurrentUser, db: DB) -> ChatConversationOut:
    # Validate all member IDs belong to the family
    all_ids = list({user.id, *[uuid.UUID(str(mid)) for mid in payload.member_ids]})
    family_members = (
        await db.execute(select(User).where(User.id.in_(all_ids), User.family_id == user.family_id))
    ).scalars().all()
    if len(family_members) != len(all_ids):
        raise HTTPException(status_code=422, detail="Some members not found in your family")

    conv = Conversation(
        family_id=user.family_id,
        name=payload.name or "",
        created_by=user.id,
    )
    db.add(conv)
    await db.flush()

    now = datetime.now(timezone.utc)
    for member in family_members:
        db.add(ConversationMember(conversation_id=conv.id, user_id=member.id, joined_at=now))
    await db.commit()
    return await _conv_out(conv, user, db)


@router.patch("/conversations/{conv_id}", response_model=ChatConversationOut)
async def update_conversation(conv_id: uuid.UUID, payload: ConversationMembersUpdate, user: CurrentUser, db: DB) -> ChatConversationOut:
    conv = await _get_conversation(conv_id, user, db)
    if conv.party_id is not None:
        raise HTTPException(status_code=403, detail="The party decides who's in this chat")
    if conv.is_family and payload.remove_member_ids:
        raise HTTPException(status_code=403, detail="Everyone in the family is in the family's chat")
    if conv.created_by != user.id and user.role not in ("admin",):
        raise HTTPException(status_code=403, detail="Only creator or admin can manage this conversation")

    if payload.name is not None:
        conv.name = payload.name

    if payload.add_member_ids:
        for mid in payload.add_member_ids:
            member = await db.get(User, mid)
            if member is None or member.family_id != user.family_id:
                continue
            existing = (
                await db.execute(
                    select(ConversationMember).where(
                        ConversationMember.conversation_id == conv_id,
                        ConversationMember.user_id == mid,
                    )
                )
            ).scalar_one_or_none()
            if existing is None:
                db.add(ConversationMember(conversation_id=conv_id, user_id=mid))

    if payload.remove_member_ids:
        for mid in payload.remove_member_ids:
            if mid == conv.created_by:
                continue  # Can't remove creator
            row = (
                await db.execute(
                    select(ConversationMember).where(
                        ConversationMember.conversation_id == conv_id,
                        ConversationMember.user_id == mid,
                    )
                )
            ).scalar_one_or_none()
            if row:
                await db.delete(row)

    await db.commit()
    return await _conv_out(conv, user, db)


@router.post("/conversations/{conv_id}/leave", status_code=status.HTTP_204_NO_CONTENT)
async def leave_conversation(conv_id: uuid.UUID, user: CurrentUser, db: DB) -> None:
    await _get_conversation(conv_id, user, db)
    row = (
        await db.execute(
            select(ConversationMember).where(
                ConversationMember.conversation_id == conv_id,
                ConversationMember.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if row:
        await db.delete(row)
        await db.commit()


@router.get("/messages", response_model=ChatMessagesPage)
async def list_messages(
    user: CurrentUser,
    db: DB,
    peer: str = Query(..., min_length=1, max_length=50),
    before: uuid.UUID | None = Query(default=None),
) -> ChatMessagesPage:
    # peer is now a conversation UUID (or the legacy "family" string for backwards compat)
    if peer == "family":
        conv = await _ensure_family_conversation(user, db)
        conv_id = conv.id
    else:
        try:
            conv_id = uuid.UUID(peer)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="Invalid peer") from exc
        await _get_conversation(conv_id, user, db)

    filters = [ChatMessage.conversation_id == conv_id]

    if before is not None:
        cursor = await db.get(ChatMessage, before)
        if cursor is None or cursor.conversation_id != conv_id:
            raise HTTPException(status_code=404, detail="Cursor not found")
        filters.append(ChatMessage.created_at < cursor.created_at)

    rows = (
        await db.execute(
            select(ChatMessage)
            .where(*filters)
            .order_by(ChatMessage.created_at.desc())
            .limit(PAGE_SIZE)
        )
    ).scalars().all()

    members = await _member_map(user.family_id, db)
    ordered = list(reversed(rows))
    items = [
        ChatMessageOut(
            id=row.id,
            sender_id=row.sender_id,
            sender_name=row.sender_name or (members.get(row.sender_id).display_name if members.get(row.sender_id) else "Unknown"),
            sender_color=members.get(row.sender_id).color if members.get(row.sender_id) else "#4F7A5B",
            recipient_id=None,
            body=row.body,
            media_id=row.media_id,
            gif_id=row.gif_id,
            created_at=row.created_at,
        )
        for row in ordered
    ]

    next_before = rows[-1].id if len(rows) == PAGE_SIZE else None
    return ChatMessagesPage(items=items, next_before=next_before)


@router.post("/messages", response_model=ChatMessageOut, status_code=status.HTTP_201_CREATED)
async def create_message(payload: ChatMessageCreate, user: CurrentUser, db: DB) -> ChatMessageOut:
    if payload.peer == "family":
        conv = await _ensure_family_conversation(user, db)
        conv_id = conv.id
    else:
        try:
            conv_id = uuid.UUID(payload.peer)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="Invalid peer") from exc
        conv = await _get_conversation(conv_id, user, db)

    body = payload.body.strip()
    if not body and not payload.media_id and not payload.gif_id:
        raise HTTPException(status_code=422, detail="Message must contain text, an image or a GIF")

    # Only the sender's own chat uploads can be attached – attaching a family
    # photo here would leak it to conversation members outside the album.
    media_id = None
    if payload.media_id:
        media = await db.get(MediaItem, payload.media_id)
        album = await db.get(Album, media.album_id) if media else None
        if media is None or media.family_id != user.family_id or media.uploaded_by != user.id or album is None or album.kind != "chat":
            raise HTTPException(status_code=404, detail="Media not found")
        media_id = media.id

    if payload.gif_id and await giphy.get_api_key(db) is None:
        raise HTTPException(status_code=404, detail="GIF search not configured")

    message = ChatMessage(
        family_id=user.family_id,
        conversation_id=conv_id,
        sender_id=user.id,
        body=body,
        media_id=media_id,
        gif_id=payload.gif_id,
    )
    db.add(message)
    await db.commit()
    await db.refresh(message)

    # Push notifications
    members = (
        await db.execute(
            select(ConversationMember).where(ConversationMember.conversation_id == conv_id)
        )
    ).scalars().all()
    for cm in members:
        if cm.user_id == user.id:
            continue
        recipient = await db.get(User, cm.user_id)
        if recipient and user_pref_enabled(recipient, "chat"):
            await send_to_user(
                db,
                recipient.id,
                {
                    "title": user.display_name,
                    "body": _message_snippet(message, max_len=180),
                    "route": "/chat",
                    "kind": "chat",
                    "peer": str(conv_id),
                },
            )

    return ChatMessageOut(
        id=message.id,
        sender_id=user.id,
        sender_name=user.display_name,
        sender_color=user.color,
        recipient_id=None,
        body=message.body,
        media_id=message.media_id,
        gif_id=message.gif_id,
        created_at=message.created_at,
    )


@router.post("/read")
async def mark_read(payload: ChatReadRequest, user: CurrentUser, db: DB) -> dict:
    peer = payload.peer
    if peer == "family":
        conv = await _ensure_family_conversation(user, db)
        conv_id = conv.id
    else:
        try:
            conv_id = uuid.UUID(peer)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail="Invalid peer") from exc
        await _get_conversation(conv_id, user, db)

    row = (
        await db.execute(
            select(ConversationMember).where(
                ConversationMember.conversation_id == conv_id,
                ConversationMember.user_id == user.id,
            )
        )
    ).scalar_one_or_none()

    if row:
        row.last_read_at = datetime.now(timezone.utc)
        await db.commit()
    return {"ok": True}


@router.post("/conversations/{conv_id}/attachments", response_model=MediaOut, status_code=status.HTTP_201_CREATED)
async def upload_attachment(conv_id: uuid.UUID, file: UploadFile, user: CurrentUser, db: DB) -> MediaOut:
    """Upload an image for a chat message. It lands in the family's hidden chat
    album, so it never shows up under Photos; viewing it requires membership of
    a conversation where it was sent."""
    await _get_conversation(conv_id, user, db)
    album = (
        await db.execute(select(Album).where(Album.family_id == user.family_id, Album.kind == "chat"))
    ).scalar_one_or_none()
    if album is None:
        album = Album(family_id=user.family_id, name="Chat attachments", kind="chat", created_by=user.id)
        db.add(album)
        await db.flush()
    return await store_upload(file, album, user, db, ALLOWED_IMAGE_TYPES)


@router.get("/gifs/status")
async def gif_status(user: CurrentUser, db: DB) -> dict:
    return {"enabled": await giphy.get_api_key(db) is not None}


@router.get("/gifs")
async def search_gifs(user: CurrentUser, db: DB, q: str = Query(..., min_length=1, max_length=100)) -> dict:
    """GIF search proxy — 404 when GIPHY is not configured. Returns ids only;
    images are fetched through /gifs/{id}.gif so the browser never hits GIPHY."""
    api_key = await giphy.get_api_key(db)
    if api_key is None:
        raise HTTPException(status_code=404, detail="GIF search not configured")
    try:
        ids = await giphy.search(api_key, q)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="GIF search failed") from exc
    return {"gifs": [{"id": gif_id, "url": f"/api/chat/gifs/{gif_id}.gif"} for gif_id in ids]}


@router.get("/gifs/{gif_id}.gif")
async def get_gif(
    user: CurrentUser,
    db: DB,
    gif_id: str = Path(..., max_length=64, pattern=r"^[A-Za-z0-9]+$"),
) -> Response:
    if await giphy.get_api_key(db) is None:
        raise HTTPException(status_code=404, detail="GIF search not configured")
    try:
        data = await giphy.fetch_gif(gif_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Could not fetch GIF") from exc
    return Response(content=data, media_type="image/gif", headers={"Cache-Control": "private, max-age=604800"})

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.context import AuthContext, get_current_context
from app.chat.schemas import (
    ChatGroupCreateRequest,
    ChatGroupResponse,
    ChatGroupsListResponse,
    ChatGroupUpdateMembersRequest,
    ChatMessageCreateRequest,
    ChatMessageResponse,
    ChatMessagesListResponse,
    UnreadChatMessageResponse,
    UnreadChatWidgetResponse,
)
from app.chat.service import (
    create_group,
    create_message,
    get_family_role_for_user,
    get_group_or_404,
    list_groups_for_user,
    list_messages,
    list_unread_messages,
    mark_group_as_read,
    update_group_members,
)
from app.core.database import get_db

router = APIRouter()


@router.get("/{family_id}/chat/groups", response_model=ChatGroupsListResponse)
async def list_chat_groups(
    family_id: UUID,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> ChatGroupsListResponse:
    if not ctx.has_family_access(family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this family",
        )

    groups = await list_groups_for_user(db, family_id=family_id, user_id=ctx.user_id)
    return ChatGroupsListResponse(
        groups=[
            ChatGroupResponse(
                id=group.id,
                family_id=group.family_id,
                name=group.name,
                description=group.description,
                created_by_user_id=group.created_by_user_id,
                member_user_ids=member_user_ids,
                created_at=group.created_at,
                updated_at=group.updated_at,
            )
            for group, member_user_ids in groups
        ]
    )


@router.post("/{family_id}/chat/groups", response_model=ChatGroupResponse)
async def create_chat_group(
    family_id: UUID,
    body: ChatGroupCreateRequest,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> ChatGroupResponse:
    if not ctx.has_family_access(family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this family",
        )

    role = await get_family_role_for_user(db, family_id=family_id, user_id=ctx.user_id)
    group, member_user_ids = await create_group(
        db,
        family_id=family_id,
        creator_user_id=ctx.user_id,
        role=role,
        body=body,
    )

    return ChatGroupResponse(
        id=group.id,
        family_id=group.family_id,
        name=group.name,
        description=group.description,
        created_by_user_id=group.created_by_user_id,
        member_user_ids=member_user_ids,
        created_at=group.created_at,
        updated_at=group.updated_at,
    )


@router.put("/{family_id}/chat/groups/{group_id}/members", response_model=ChatGroupResponse)
async def update_chat_group_members(
    family_id: UUID,
    group_id: UUID,
    body: ChatGroupUpdateMembersRequest,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> ChatGroupResponse:
    if not ctx.has_family_access(family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this family",
        )

    role = await get_family_role_for_user(db, family_id=family_id, user_id=ctx.user_id)
    member_user_ids = await update_group_members(
        db,
        family_id=family_id,
        group_id=group_id,
        role=role,
        body=body,
    )
    group = await get_group_or_404(db, family_id=family_id, group_id=group_id)
    return ChatGroupResponse(
        id=group.id,
        family_id=group.family_id,
        name=group.name,
        description=group.description,
        created_by_user_id=group.created_by_user_id,
        member_user_ids=member_user_ids,
        created_at=group.created_at,
        updated_at=group.updated_at,
    )


@router.get("/{family_id}/chat/groups/{group_id}/messages", response_model=ChatMessagesListResponse)
async def list_chat_messages(
    family_id: UUID,
    group_id: UUID,
    limit: int = Query(default=50, ge=1, le=200),
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> ChatMessagesListResponse:
    if not ctx.has_family_access(family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this family",
        )

    rows = await list_messages(
        db,
        family_id=family_id,
        group_id=group_id,
        current_user_id=ctx.user_id,
        limit=limit,
    )
    return ChatMessagesListResponse(
        messages=[
            ChatMessageResponse(
                id=message.id,
                family_id=message.family_id,
                group_id=message.group_id,
                sender_user_id=message.sender_user_id,
                sender_email=sender_email,
                content=message.content,
                created_at=message.created_at,
            )
            for message, sender_email in rows
        ]
    )


@router.post("/{family_id}/chat/groups/{group_id}/messages", response_model=ChatMessageResponse)
async def create_chat_message(
    family_id: UUID,
    group_id: UUID,
    body: ChatMessageCreateRequest,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> ChatMessageResponse:
    if not ctx.has_family_access(family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this family",
        )

    message, sender_email = await create_message(
        db,
        family_id=family_id,
        group_id=group_id,
        sender_user_id=ctx.user_id,
        body=body,
    )
    return ChatMessageResponse(
        id=message.id,
        family_id=message.family_id,
        group_id=message.group_id,
        sender_user_id=message.sender_user_id,
        sender_email=sender_email,
        content=message.content,
        created_at=message.created_at,
    )


@router.post("/{family_id}/chat/groups/{group_id}/read", status_code=204)
async def mark_chat_group_read(
    family_id: UUID,
    group_id: UUID,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    if not ctx.has_family_access(family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this family",
        )
    await mark_group_as_read(db, family_id=family_id, group_id=group_id, user_id=ctx.user_id)


@router.get("/{family_id}/chat/widgets/unread", response_model=UnreadChatWidgetResponse)
async def get_chat_unread_widget(
    family_id: UUID,
    limit: int = Query(default=5, ge=1, le=20),
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> UnreadChatWidgetResponse:
    if not ctx.has_family_access(family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this family",
        )

    unread_count, rows = await list_unread_messages(
        db,
        family_id=family_id,
        current_user_id=ctx.user_id,
        limit=limit,
    )
    return UnreadChatWidgetResponse(
        family_id=family_id,
        unread_count=unread_count,
        messages=[
            UnreadChatMessageResponse(
                id=message.id,
                group_id=message.group_id,
                group_name=group_name,
                sender_user_id=message.sender_user_id,
                sender_email=sender_email,
                content=message.content,
                created_at=message.created_at,
            )
            for message, sender_email, group_name in rows
        ],
    )

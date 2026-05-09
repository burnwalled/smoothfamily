from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import and_, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.chat.models import ChatGroup, ChatGroupMember, ChatMessage
from app.chat.schemas import (
    ChatGroupCreateRequest,
    ChatGroupUpdateMembersRequest,
    ChatMessageCreateRequest,
)
from app.families.models import Family, UserFamilyMembership
from app.families.rbac import resolve_effective_family_role


@dataclass(frozen=True)
class ChatPermissions:
    can_manage_groups: bool


def permissions_for_chat_role(role: str) -> ChatPermissions:
    return ChatPermissions(can_manage_groups=role in {"owner", "parent"})


async def get_family_role_for_user(
    db: AsyncSession,
    *,
    family_id: UUID,
    user_id: UUID,
) -> str:
    membership_result = await db.execute(
        select(UserFamilyMembership).where(
            UserFamilyMembership.family_id == family_id,
            UserFamilyMembership.user_id == user_id,
        )
    )
    membership = membership_result.scalar_one_or_none()
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this family",
        )

    family_result = await db.execute(select(Family.owner_user_id).where(Family.id == family_id))
    owner_user_id = family_result.scalar_one_or_none()
    if owner_user_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Family not found")

    return resolve_effective_family_role(
        family_owner_user_id=owner_user_id,
        user_id=user_id,
        membership_role=membership.role,
    )


async def list_family_member_ids(db: AsyncSession, family_id: UUID) -> set[UUID]:
    result = await db.execute(
        select(UserFamilyMembership.user_id).where(UserFamilyMembership.family_id == family_id)
    )
    return set(result.scalars().all())


def ensure_can_manage_groups(role: str) -> None:
    permissions = permissions_for_chat_role(role)
    if not permissions.can_manage_groups:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to manage chat groups",
        )


async def get_group_or_404(
    db: AsyncSession,
    *,
    family_id: UUID,
    group_id: UUID,
) -> ChatGroup:
    result = await db.execute(
        select(ChatGroup).where(
            ChatGroup.id == group_id,
            ChatGroup.family_id == family_id,
        )
    )
    group = result.scalar_one_or_none()
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat group not found")
    return group


async def ensure_group_membership(
    db: AsyncSession,
    *,
    group_id: UUID,
    user_id: UUID,
) -> None:
    membership_result = await db.execute(
        select(ChatGroupMember).where(
            ChatGroupMember.group_id == group_id,
            ChatGroupMember.user_id == user_id,
        )
    )
    if membership_result.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this chat group",
        )


async def list_groups_for_user(
    db: AsyncSession,
    *,
    family_id: UUID,
    user_id: UUID,
) -> list[tuple[ChatGroup, list[UUID]]]:
    rows = await db.execute(
        select(ChatGroup)
        .join(ChatGroupMember, ChatGroupMember.group_id == ChatGroup.id)
        .where(
            ChatGroup.family_id == family_id,
            ChatGroupMember.user_id == user_id,
        )
        .order_by(ChatGroup.created_at.asc())
    )
    groups = rows.scalars().all()

    if not groups:
        return []

    group_ids = [group.id for group in groups]
    member_rows = await db.execute(
        select(ChatGroupMember.group_id, ChatGroupMember.user_id).where(
            ChatGroupMember.group_id.in_(group_ids)
        )
    )
    members_by_group: dict[UUID, list[UUID]] = {}
    for group_id, member_user_id in member_rows.all():
        members_by_group.setdefault(group_id, []).append(member_user_id)

    return [(group, members_by_group.get(group.id, [])) for group in groups]


async def create_group(
    db: AsyncSession,
    *,
    family_id: UUID,
    creator_user_id: UUID,
    role: str,
    body: ChatGroupCreateRequest,
) -> tuple[ChatGroup, list[UUID]]:
    ensure_can_manage_groups(role)

    family_member_ids = await list_family_member_ids(db, family_id)
    requested_members = set(body.member_user_ids)
    requested_members.add(creator_user_id)

    if not requested_members:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Chat group must contain at least one member",
        )

    invalid_members = [
        member_id for member_id in requested_members if member_id not in family_member_ids
    ]
    if invalid_members:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="member_user_ids contains users outside this family",
        )

    group = ChatGroup(
        family_id=family_id,
        name=body.name.strip(),
        description=body.description.strip() if body.description else None,
        created_by_user_id=creator_user_id,
    )
    db.add(group)
    await db.flush()

    db.add_all(
        [ChatGroupMember(group_id=group.id, user_id=member_id) for member_id in requested_members]
    )
    await db.flush()

    return group, sorted(requested_members, key=str)


async def update_group_members(
    db: AsyncSession,
    *,
    family_id: UUID,
    group_id: UUID,
    role: str,
    body: ChatGroupUpdateMembersRequest,
) -> list[UUID]:
    ensure_can_manage_groups(role)
    await get_group_or_404(db, family_id=family_id, group_id=group_id)

    family_member_ids = await list_family_member_ids(db, family_id)
    requested_members = set(body.member_user_ids)

    if not requested_members:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Chat group must contain at least one member",
        )

    invalid_members = [
        member_id for member_id in requested_members if member_id not in family_member_ids
    ]
    if invalid_members:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="member_user_ids contains users outside this family",
        )

    await db.execute(delete(ChatGroupMember).where(ChatGroupMember.group_id == group_id))
    db.add_all(
        [ChatGroupMember(group_id=group_id, user_id=member_id) for member_id in requested_members]
    )
    await db.flush()

    return sorted(requested_members, key=str)


async def list_messages(
    db: AsyncSession,
    *,
    family_id: UUID,
    group_id: UUID,
    current_user_id: UUID,
    limit: int,
) -> list[tuple[ChatMessage, str]]:
    await get_group_or_404(db, family_id=family_id, group_id=group_id)
    await ensure_group_membership(db, group_id=group_id, user_id=current_user_id)

    rows = await db.execute(
        select(ChatMessage, User.email)
        .join(User, User.id == ChatMessage.sender_user_id)
        .where(
            ChatMessage.family_id == family_id,
            ChatMessage.group_id == group_id,
        )
        .order_by(ChatMessage.created_at.asc())
        .limit(limit)
    )
    return rows.all()


async def create_message(
    db: AsyncSession,
    *,
    family_id: UUID,
    group_id: UUID,
    sender_user_id: UUID,
    body: ChatMessageCreateRequest,
) -> tuple[ChatMessage, str]:
    await get_group_or_404(db, family_id=family_id, group_id=group_id)
    await ensure_group_membership(db, group_id=group_id, user_id=sender_user_id)

    message = ChatMessage(
        family_id=family_id,
        group_id=group_id,
        sender_user_id=sender_user_id,
        content=body.content.strip(),
    )
    db.add(message)
    await db.flush()

    sender_result = await db.execute(select(User.email).where(User.id == sender_user_id))
    sender_email = sender_result.scalar_one_or_none() or ""
    return message, sender_email


async def mark_group_as_read(
    db: AsyncSession,
    *,
    family_id: UUID,
    group_id: UUID,
    user_id: UUID,
) -> None:
    await get_group_or_404(db, family_id=family_id, group_id=group_id)
    result = await db.execute(
        select(ChatGroupMember).where(
            ChatGroupMember.group_id == group_id,
            ChatGroupMember.user_id == user_id,
        )
    )
    membership = result.scalar_one_or_none()
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this chat group",
        )
    membership.last_read_at = datetime.now(tz=UTC)
    await db.flush()


async def list_unread_messages(
    db: AsyncSession,
    *,
    family_id: UUID,
    current_user_id: UUID,
    limit: int,
) -> tuple[int, list[tuple[ChatMessage, str, str]]]:
    membership_rows = await db.execute(
        select(ChatGroupMember)
        .join(ChatGroup, ChatGroup.id == ChatGroupMember.group_id)
        .where(
            ChatGroup.family_id == family_id,
            ChatGroupMember.user_id == current_user_id,
        )
    )
    memberships = membership_rows.scalars().all()
    if not memberships:
        return 0, []

    conditions = []
    for membership in memberships:
        cutoff = membership.last_read_at
        cond = and_(
            ChatMessage.group_id == membership.group_id,
            ChatMessage.sender_user_id != current_user_id,
        )
        if cutoff is not None:
            cond = and_(cond, ChatMessage.created_at > cutoff)
        conditions.append(cond)

    unread_filter = or_(*conditions)

    count_result = await db.execute(
        select(func.count(ChatMessage.id)).where(unread_filter)
    )
    total_count = count_result.scalar_one()

    if total_count == 0:
        return 0, []

    rows = await db.execute(
        select(ChatMessage, User.email, ChatGroup.name)
        .join(User, User.id == ChatMessage.sender_user_id)
        .join(ChatGroup, ChatGroup.id == ChatMessage.group_id)
        .where(unread_filter)
        .order_by(ChatMessage.created_at.desc())
        .limit(limit)
    )
    return total_count, rows.all()

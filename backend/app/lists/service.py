from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.chat.models import ChatGroup, ChatGroupMember
from app.families.models import Family, UserFamilyMembership
from app.families.rbac import resolve_effective_family_role
from app.lists.models import (
    SharedList,
    SharedListItem,
    SharedListVisibleChatGroup,
    SharedListVisibleMember,
)
from app.lists.schemas import (
    SharedListItemCreateRequest,
    SharedListItemUpdateRequest,
    SharedListUpsertRequest,
)


@dataclass(frozen=True)
class ListPermissions:
    can_manage_lists: bool


def permissions_for_lists_role(role: str) -> ListPermissions:
    return ListPermissions(can_manage_lists=role in {"owner", "parent"})


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


def ensure_can_manage_lists(role: str) -> None:
    if not permissions_for_lists_role(role).can_manage_lists:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to manage lists",
        )


async def list_family_member_ids(db: AsyncSession, family_id: UUID) -> set[UUID]:
    result = await db.execute(
        select(UserFamilyMembership.user_id).where(UserFamilyMembership.family_id == family_id)
    )
    return set(result.scalars().all())


async def list_family_chat_group_ids(db: AsyncSession, family_id: UUID) -> set[UUID]:
    result = await db.execute(select(ChatGroup.id).where(ChatGroup.family_id == family_id))
    return set(result.scalars().all())


async def list_user_chat_group_ids(db: AsyncSession, user_id: UUID) -> set[UUID]:
    result = await db.execute(
        select(ChatGroupMember.group_id).where(ChatGroupMember.user_id == user_id)
    )
    return set(result.scalars().all())


async def get_shared_list_or_404(
    db: AsyncSession,
    *,
    family_id: UUID,
    list_id: UUID,
) -> SharedList:
    result = await db.execute(
        select(SharedList).where(
            SharedList.id == list_id,
            SharedList.family_id == family_id,
        )
    )
    shared_list = result.scalar_one_or_none()
    if shared_list is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="List not found")
    return shared_list


async def _load_visibility_for_lists(
    db: AsyncSession,
    *,
    list_ids: list[UUID],
) -> tuple[dict[UUID, set[UUID]], dict[UUID, set[UUID]]]:
    if not list_ids:
        return {}, {}

    member_rows = await db.execute(
        select(SharedListVisibleMember.list_id, SharedListVisibleMember.user_id).where(
            SharedListVisibleMember.list_id.in_(list_ids)
        )
    )
    group_rows = await db.execute(
        select(
            SharedListVisibleChatGroup.list_id,
            SharedListVisibleChatGroup.chat_group_id,
        ).where(SharedListVisibleChatGroup.list_id.in_(list_ids))
    )

    member_map: dict[UUID, set[UUID]] = {}
    group_map: dict[UUID, set[UUID]] = {}

    for list_id, user_id in member_rows.all():
        member_map.setdefault(list_id, set()).add(user_id)

    for list_id, chat_group_id in group_rows.all():
        group_map.setdefault(list_id, set()).add(chat_group_id)

    return member_map, group_map


def _is_list_visible_to_user(
    *,
    shared_list_id: UUID,
    user_id: UUID,
    user_group_ids: set[UUID],
    visible_member_ids_by_list: dict[UUID, set[UUID]],
    visible_chat_group_ids_by_list: dict[UUID, set[UUID]],
) -> bool:
    member_ids = visible_member_ids_by_list.get(shared_list_id, set())
    chat_group_ids = visible_chat_group_ids_by_list.get(shared_list_id, set())

    if not member_ids and not chat_group_ids:
        return True
    if user_id in member_ids:
        return True
    if chat_group_ids.intersection(user_group_ids):
        return True
    return False


async def _replace_visibility(
    db: AsyncSession,
    *,
    family_id: UUID,
    list_id: UUID,
    visible_member_user_ids: list[UUID],
    visible_chat_group_ids: list[UUID],
) -> tuple[list[UUID], list[UUID]]:
    unique_member_ids = sorted(set(visible_member_user_ids), key=str)
    unique_chat_group_ids = sorted(set(visible_chat_group_ids), key=str)

    if unique_member_ids:
        valid_member_ids = await list_family_member_ids(db, family_id)
        invalid_members = [
            user_id for user_id in unique_member_ids if user_id not in valid_member_ids
        ]
        if invalid_members:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="visible_member_user_ids contains users outside this family",
            )

    if unique_chat_group_ids:
        valid_chat_group_ids = await list_family_chat_group_ids(db, family_id)
        invalid_chat_groups = [
            group_id for group_id in unique_chat_group_ids if group_id not in valid_chat_group_ids
        ]
        if invalid_chat_groups:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="visible_chat_group_ids contains groups outside this family",
            )

    await db.execute(
        delete(SharedListVisibleMember).where(SharedListVisibleMember.list_id == list_id)
    )
    await db.execute(
        delete(SharedListVisibleChatGroup).where(SharedListVisibleChatGroup.list_id == list_id)
    )

    if unique_member_ids:
        db.add_all(
            [
                SharedListVisibleMember(list_id=list_id, user_id=user_id)
                for user_id in unique_member_ids
            ]
        )

    if unique_chat_group_ids:
        db.add_all(
            [
                SharedListVisibleChatGroup(list_id=list_id, chat_group_id=group_id)
                for group_id in unique_chat_group_ids
            ]
        )

    await db.flush()
    return unique_member_ids, unique_chat_group_ids


async def _count_items_for_lists(
    db: AsyncSession,
    *,
    list_ids: list[UUID],
) -> tuple[dict[UUID, int], dict[UUID, int]]:
    if not list_ids:
        return {}, {}

    totals_result = await db.execute(
        select(SharedListItem.list_id, func.count(SharedListItem.id))
        .where(SharedListItem.list_id.in_(list_ids))
        .group_by(SharedListItem.list_id)
    )
    totals: dict[UUID, int] = {list_id: int(total) for list_id, total in totals_result.all()}

    open_result = await db.execute(
        select(SharedListItem.list_id, func.count(SharedListItem.id))
        .where(
            SharedListItem.list_id.in_(list_ids),
            SharedListItem.is_completed.is_(False),
        )
        .group_by(SharedListItem.list_id)
    )
    open_counts: dict[UUID, int] = {list_id: int(total) for list_id, total in open_result.all()}

    return totals, open_counts


async def list_visible_lists(
    db: AsyncSession,
    *,
    family_id: UUID,
    user_id: UUID,
) -> list[tuple[SharedList, list[UUID], list[UUID], int, int]]:
    rows = await db.execute(
        select(SharedList)
        .where(SharedList.family_id == family_id)
        .order_by(SharedList.updated_at.desc(), SharedList.created_at.desc())
    )
    lists = list(rows.scalars().all())
    list_ids = [shared_list.id for shared_list in lists]

    visible_member_ids_by_list, visible_chat_group_ids_by_list = await _load_visibility_for_lists(
        db, list_ids=list_ids
    )
    user_group_ids = await list_user_chat_group_ids(db, user_id)
    totals, open_counts = await _count_items_for_lists(db, list_ids=list_ids)

    visible_lists: list[tuple[SharedList, list[UUID], list[UUID], int, int]] = []
    for shared_list in lists:
        if not _is_list_visible_to_user(
            shared_list_id=shared_list.id,
            user_id=user_id,
            user_group_ids=user_group_ids,
            visible_member_ids_by_list=visible_member_ids_by_list,
            visible_chat_group_ids_by_list=visible_chat_group_ids_by_list,
        ):
            continue

        visible_lists.append(
            (
                shared_list,
                sorted(visible_member_ids_by_list.get(shared_list.id, set()), key=str),
                sorted(visible_chat_group_ids_by_list.get(shared_list.id, set()), key=str),
                totals.get(shared_list.id, 0),
                open_counts.get(shared_list.id, 0),
            )
        )

    return visible_lists


async def ensure_list_visible_for_user(
    db: AsyncSession,
    *,
    family_id: UUID,
    list_id: UUID,
    user_id: UUID,
) -> SharedList:
    shared_list = await get_shared_list_or_404(db, family_id=family_id, list_id=list_id)
    visible_member_ids_by_list, visible_chat_group_ids_by_list = await _load_visibility_for_lists(
        db, list_ids=[list_id]
    )
    user_group_ids = await list_user_chat_group_ids(db, user_id)

    if not _is_list_visible_to_user(
        shared_list_id=list_id,
        user_id=user_id,
        user_group_ids=user_group_ids,
        visible_member_ids_by_list=visible_member_ids_by_list,
        visible_chat_group_ids_by_list=visible_chat_group_ids_by_list,
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this list",
        )

    return shared_list


async def create_shared_list(
    db: AsyncSession,
    *,
    family_id: UUID,
    user_id: UUID,
    role: str,
    body: SharedListUpsertRequest,
) -> tuple[SharedList, list[UUID], list[UUID], int, int]:
    ensure_can_manage_lists(role)

    shared_list = SharedList(
        family_id=family_id,
        title=body.title.strip(),
        description=body.description.strip() if body.description else None,
        created_by_user_id=user_id,
    )
    db.add(shared_list)
    await db.flush()

    member_ids, chat_group_ids = await _replace_visibility(
        db,
        family_id=family_id,
        list_id=shared_list.id,
        visible_member_user_ids=body.visible_member_user_ids,
        visible_chat_group_ids=body.visible_chat_group_ids,
    )

    return shared_list, member_ids, chat_group_ids, 0, 0


async def update_shared_list(
    db: AsyncSession,
    *,
    family_id: UUID,
    list_id: UUID,
    role: str,
    body: SharedListUpsertRequest,
) -> tuple[SharedList, list[UUID], list[UUID], int, int]:
    ensure_can_manage_lists(role)

    shared_list = await get_shared_list_or_404(db, family_id=family_id, list_id=list_id)
    shared_list.title = body.title.strip()
    shared_list.description = body.description.strip() if body.description else None

    member_ids, chat_group_ids = await _replace_visibility(
        db,
        family_id=family_id,
        list_id=list_id,
        visible_member_user_ids=body.visible_member_user_ids,
        visible_chat_group_ids=body.visible_chat_group_ids,
    )

    totals, open_counts = await _count_items_for_lists(db, list_ids=[list_id])
    await db.flush()

    return (
        shared_list,
        member_ids,
        chat_group_ids,
        totals.get(list_id, 0),
        open_counts.get(list_id, 0),
    )


async def delete_shared_list(
    db: AsyncSession,
    *,
    family_id: UUID,
    list_id: UUID,
    role: str,
) -> None:
    ensure_can_manage_lists(role)
    shared_list = await get_shared_list_or_404(db, family_id=family_id, list_id=list_id)

    await db.execute(delete(SharedListItem).where(SharedListItem.list_id == list_id))
    await db.execute(
        delete(SharedListVisibleMember).where(SharedListVisibleMember.list_id == list_id)
    )
    await db.execute(
        delete(SharedListVisibleChatGroup).where(SharedListVisibleChatGroup.list_id == list_id)
    )
    await db.delete(shared_list)
    await db.flush()


async def list_items_for_list(
    db: AsyncSession,
    *,
    family_id: UUID,
    list_id: UUID,
    user_id: UUID,
) -> list[SharedListItem]:
    await ensure_list_visible_for_user(db, family_id=family_id, list_id=list_id, user_id=user_id)

    rows = await db.execute(
        select(SharedListItem)
        .where(
            SharedListItem.family_id == family_id,
            SharedListItem.list_id == list_id,
        )
        .order_by(SharedListItem.sort_order.asc(), SharedListItem.created_at.asc())
    )
    return list(rows.scalars().all())


async def create_list_item(
    db: AsyncSession,
    *,
    family_id: UUID,
    list_id: UUID,
    user_id: UUID,
    body: SharedListItemCreateRequest,
) -> SharedListItem:
    await ensure_list_visible_for_user(db, family_id=family_id, list_id=list_id, user_id=user_id)

    order_result = await db.execute(
        select(func.coalesce(func.max(SharedListItem.sort_order), -1)).where(
            SharedListItem.family_id == family_id,
            SharedListItem.list_id == list_id,
        )
    )
    next_order = int(order_result.scalar_one()) + 1

    item = SharedListItem(
        list_id=list_id,
        family_id=family_id,
        title=body.title.strip(),
        sort_order=next_order,
        created_by_user_id=user_id,
    )
    db.add(item)
    await db.flush()
    return item


async def get_item_or_404(
    db: AsyncSession,
    *,
    family_id: UUID,
    list_id: UUID,
    item_id: UUID,
) -> SharedListItem:
    result = await db.execute(
        select(SharedListItem).where(
            SharedListItem.id == item_id,
            SharedListItem.family_id == family_id,
            SharedListItem.list_id == list_id,
        )
    )
    item = result.scalar_one_or_none()
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="List item not found")
    return item


async def update_list_item(
    db: AsyncSession,
    *,
    family_id: UUID,
    list_id: UUID,
    item_id: UUID,
    user_id: UUID,
    body: SharedListItemUpdateRequest,
) -> SharedListItem:
    await ensure_list_visible_for_user(db, family_id=family_id, list_id=list_id, user_id=user_id)
    item = await get_item_or_404(db, family_id=family_id, list_id=list_id, item_id=item_id)

    item.title = body.title.strip()
    item.sort_order = body.sort_order
    item.is_completed = body.is_completed
    item.completed_at = datetime.now(tz=UTC) if body.is_completed else None

    await db.flush()
    return item


async def delete_list_item(
    db: AsyncSession,
    *,
    family_id: UUID,
    list_id: UUID,
    item_id: UUID,
    user_id: UUID,
) -> None:
    await ensure_list_visible_for_user(db, family_id=family_id, list_id=list_id, user_id=user_id)
    item = await get_item_or_404(db, family_id=family_id, list_id=list_id, item_id=item_id)
    await db.delete(item)
    await db.flush()


async def list_open_lists_for_widget(
    db: AsyncSession,
    *,
    family_id: UUID,
    user_id: UUID,
    limit: int,
) -> list[tuple[SharedList, int, int]]:
    visible_lists = await list_visible_lists(db, family_id=family_id, user_id=user_id)
    open_lists = [
        (shared_list, open_items_count, total_items_count)
        for shared_list, _member_ids, _group_ids, total_items_count, open_items_count in visible_lists
        if open_items_count > 0
    ]
    open_lists.sort(key=lambda row: row[1], reverse=True)
    return open_lists[:limit]

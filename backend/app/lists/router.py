from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.context import AuthContext, get_current_context
from app.core.database import get_db
from app.lists.schemas import (
    OpenListsWidgetItemResponse,
    OpenListsWidgetResponse,
    SharedListItemCreateRequest,
    SharedListItemResponse,
    SharedListItemsListResponse,
    SharedListItemUpdateRequest,
    SharedListResponse,
    SharedListsListResponse,
    SharedListUpsertRequest,
)
from app.lists.service import (
    create_list_item,
    create_shared_list,
    delete_list_item,
    delete_shared_list,
    get_family_role_for_user,
    list_items_for_list,
    list_open_lists_for_widget,
    list_visible_lists,
    update_list_item,
    update_shared_list,
)

router = APIRouter()


@router.get("/{family_id}/lists", response_model=SharedListsListResponse)
async def list_shared_lists(
    family_id: UUID,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> SharedListsListResponse:
    if not ctx.has_family_access(family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this family",
        )

    rows = await list_visible_lists(db, family_id=family_id, user_id=ctx.user_id)
    return SharedListsListResponse(
        lists=[
            SharedListResponse(
                id=shared_list.id,
                family_id=shared_list.family_id,
                title=shared_list.title,
                description=shared_list.description,
                created_by_user_id=shared_list.created_by_user_id,
                created_at=shared_list.created_at,
                updated_at=shared_list.updated_at,
                visible_member_user_ids=visible_member_ids,
                visible_chat_group_ids=visible_chat_group_ids,
                total_items_count=total_items_count,
                open_items_count=open_items_count,
            )
            for shared_list, visible_member_ids, visible_chat_group_ids, total_items_count, open_items_count in rows
        ]
    )


@router.post("/{family_id}/lists", response_model=SharedListResponse)
async def create_shared_list_endpoint(
    family_id: UUID,
    body: SharedListUpsertRequest,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> SharedListResponse:
    if not ctx.has_family_access(family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this family",
        )

    role = await get_family_role_for_user(db, family_id=family_id, user_id=ctx.user_id)
    (
        shared_list,
        visible_member_ids,
        visible_chat_group_ids,
        total_items_count,
        open_items_count,
    ) = await create_shared_list(
        db,
        family_id=family_id,
        user_id=ctx.user_id,
        role=role,
        body=body,
    )

    return SharedListResponse(
        id=shared_list.id,
        family_id=shared_list.family_id,
        title=shared_list.title,
        description=shared_list.description,
        created_by_user_id=shared_list.created_by_user_id,
        created_at=shared_list.created_at,
        updated_at=shared_list.updated_at,
        visible_member_user_ids=visible_member_ids,
        visible_chat_group_ids=visible_chat_group_ids,
        total_items_count=total_items_count,
        open_items_count=open_items_count,
    )


@router.put("/{family_id}/lists/{list_id}", response_model=SharedListResponse)
async def update_shared_list_endpoint(
    family_id: UUID,
    list_id: UUID,
    body: SharedListUpsertRequest,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> SharedListResponse:
    if not ctx.has_family_access(family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this family",
        )

    role = await get_family_role_for_user(db, family_id=family_id, user_id=ctx.user_id)
    (
        shared_list,
        visible_member_ids,
        visible_chat_group_ids,
        total_items_count,
        open_items_count,
    ) = await update_shared_list(
        db,
        family_id=family_id,
        list_id=list_id,
        role=role,
        body=body,
    )

    return SharedListResponse(
        id=shared_list.id,
        family_id=shared_list.family_id,
        title=shared_list.title,
        description=shared_list.description,
        created_by_user_id=shared_list.created_by_user_id,
        created_at=shared_list.created_at,
        updated_at=shared_list.updated_at,
        visible_member_user_ids=visible_member_ids,
        visible_chat_group_ids=visible_chat_group_ids,
        total_items_count=total_items_count,
        open_items_count=open_items_count,
    )


@router.delete("/{family_id}/lists/{list_id}", status_code=204)
async def delete_shared_list_endpoint(
    family_id: UUID,
    list_id: UUID,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    if not ctx.has_family_access(family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this family",
        )

    role = await get_family_role_for_user(db, family_id=family_id, user_id=ctx.user_id)
    await delete_shared_list(db, family_id=family_id, list_id=list_id, role=role)


@router.get("/{family_id}/lists/{list_id}/items", response_model=SharedListItemsListResponse)
async def list_shared_list_items(
    family_id: UUID,
    list_id: UUID,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> SharedListItemsListResponse:
    if not ctx.has_family_access(family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this family",
        )

    items = await list_items_for_list(
        db,
        family_id=family_id,
        list_id=list_id,
        user_id=ctx.user_id,
    )
    return SharedListItemsListResponse(
        items=[
            SharedListItemResponse(
                id=item.id,
                list_id=item.list_id,
                family_id=item.family_id,
                title=item.title,
                is_completed=item.is_completed,
                completed_at=item.completed_at,
                sort_order=item.sort_order,
                created_by_user_id=item.created_by_user_id,
                created_at=item.created_at,
                updated_at=item.updated_at,
            )
            for item in items
        ]
    )


@router.post("/{family_id}/lists/{list_id}/items", response_model=SharedListItemResponse)
async def create_shared_list_item_endpoint(
    family_id: UUID,
    list_id: UUID,
    body: SharedListItemCreateRequest,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> SharedListItemResponse:
    if not ctx.has_family_access(family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this family",
        )

    item = await create_list_item(
        db,
        family_id=family_id,
        list_id=list_id,
        user_id=ctx.user_id,
        body=body,
    )
    return SharedListItemResponse(
        id=item.id,
        list_id=item.list_id,
        family_id=item.family_id,
        title=item.title,
        is_completed=item.is_completed,
        completed_at=item.completed_at,
        sort_order=item.sort_order,
        created_by_user_id=item.created_by_user_id,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


@router.put("/{family_id}/lists/{list_id}/items/{item_id}", response_model=SharedListItemResponse)
async def update_shared_list_item_endpoint(
    family_id: UUID,
    list_id: UUID,
    item_id: UUID,
    body: SharedListItemUpdateRequest,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> SharedListItemResponse:
    if not ctx.has_family_access(family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this family",
        )

    item = await update_list_item(
        db,
        family_id=family_id,
        list_id=list_id,
        item_id=item_id,
        user_id=ctx.user_id,
        body=body,
    )
    return SharedListItemResponse(
        id=item.id,
        list_id=item.list_id,
        family_id=item.family_id,
        title=item.title,
        is_completed=item.is_completed,
        completed_at=item.completed_at,
        sort_order=item.sort_order,
        created_by_user_id=item.created_by_user_id,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


@router.delete("/{family_id}/lists/{list_id}/items/{item_id}", status_code=204)
async def delete_shared_list_item_endpoint(
    family_id: UUID,
    list_id: UUID,
    item_id: UUID,
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> None:
    if not ctx.has_family_access(family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this family",
        )

    await delete_list_item(
        db,
        family_id=family_id,
        list_id=list_id,
        item_id=item_id,
        user_id=ctx.user_id,
    )


@router.get("/{family_id}/lists/widgets/open", response_model=OpenListsWidgetResponse)
async def get_open_lists_widget(
    family_id: UUID,
    limit: int = Query(default=5, ge=1, le=20),
    ctx: AuthContext = Depends(get_current_context),
    db: AsyncSession = Depends(get_db),
) -> OpenListsWidgetResponse:
    if not ctx.has_family_access(family_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this family",
        )

    rows = await list_open_lists_for_widget(
        db,
        family_id=family_id,
        user_id=ctx.user_id,
        limit=limit,
    )
    return OpenListsWidgetResponse(
        family_id=family_id,
        lists=[
            OpenListsWidgetItemResponse(
                id=shared_list.id,
                title=shared_list.title,
                open_items_count=open_items_count,
                total_items_count=total_items_count,
            )
            for shared_list, open_items_count, total_items_count in rows
        ],
    )

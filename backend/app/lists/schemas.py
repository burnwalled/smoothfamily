from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class SharedListUpsertRequest(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=240)
    visible_member_user_ids: list[UUID] = Field(default_factory=list)
    visible_chat_group_ids: list[UUID] = Field(default_factory=list)


class SharedListItemCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=240)


class SharedListItemUpdateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=240)
    is_completed: bool
    sort_order: int = Field(default=0, ge=0)


class SharedListItemResponse(BaseModel):
    id: UUID
    list_id: UUID
    family_id: UUID
    title: str
    is_completed: bool
    completed_at: datetime | None
    sort_order: int
    created_by_user_id: UUID
    created_at: datetime
    updated_at: datetime


class SharedListResponse(BaseModel):
    id: UUID
    family_id: UUID
    title: str
    description: str | None
    created_by_user_id: UUID
    created_at: datetime
    updated_at: datetime
    visible_member_user_ids: list[UUID]
    visible_chat_group_ids: list[UUID]
    total_items_count: int
    open_items_count: int


class SharedListsListResponse(BaseModel):
    lists: list[SharedListResponse]


class SharedListItemsListResponse(BaseModel):
    items: list[SharedListItemResponse]


class OpenListsWidgetItemResponse(BaseModel):
    id: UUID
    title: str
    open_items_count: int
    total_items_count: int


class OpenListsWidgetResponse(BaseModel):
    family_id: UUID
    lists: list[OpenListsWidgetItemResponse]

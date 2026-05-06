from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ChatGroupCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=240)
    member_user_ids: list[UUID] = Field(default_factory=list)


class ChatGroupUpdateMembersRequest(BaseModel):
    member_user_ids: list[UUID] = Field(default_factory=list)


class ChatGroupResponse(BaseModel):
    id: UUID
    family_id: UUID
    name: str
    description: str | None
    created_by_user_id: UUID
    member_user_ids: list[UUID]
    created_at: datetime
    updated_at: datetime


class ChatGroupsListResponse(BaseModel):
    groups: list[ChatGroupResponse]


class ChatMessageCreateRequest(BaseModel):
    content: str = Field(min_length=1, max_length=4000)


class ChatMessageResponse(BaseModel):
    id: UUID
    family_id: UUID
    group_id: UUID
    sender_user_id: UUID
    sender_email: str
    content: str
    created_at: datetime


class ChatMessagesListResponse(BaseModel):
    messages: list[ChatMessageResponse]


class UnreadChatMessageResponse(BaseModel):
    id: UUID
    group_id: UUID
    group_name: str
    sender_user_id: UUID
    sender_email: str
    content: str
    created_at: datetime


class UnreadChatWidgetResponse(BaseModel):
    family_id: UUID
    unread_count: int
    messages: list[UnreadChatMessageResponse]

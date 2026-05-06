import pytest
from fastapi import HTTPException

from app.chat.service import ensure_can_manage_groups, permissions_for_chat_role


def test_child_cannot_manage_chat_groups() -> None:
    permissions = permissions_for_chat_role("child")
    assert not permissions.can_manage_groups


def test_parent_can_manage_chat_groups() -> None:
    permissions = permissions_for_chat_role("parent")
    assert permissions.can_manage_groups


def test_owner_can_manage_chat_groups() -> None:
    permissions = permissions_for_chat_role("owner")
    assert permissions.can_manage_groups


def test_ensure_can_manage_groups_rejects_child() -> None:
    with pytest.raises(HTTPException, match="Insufficient permissions"):
        ensure_can_manage_groups("child")

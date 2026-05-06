from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.calendar.service import (
    can_modify_event,
    permissions_for_calendar_role,
    validate_hidden_members,
    validate_tagged_members,
)


def test_child_can_modify_only_own_event() -> None:
    child_user_id = uuid4()
    assert can_modify_event(
        role="child",
        current_user_id=child_user_id,
        creator_user_id=child_user_id,
    )
    assert not can_modify_event(
        role="child",
        current_user_id=child_user_id,
        creator_user_id=uuid4(),
    )


def test_parent_can_modify_any_event() -> None:
    assert can_modify_event(
        role="parent",
        current_user_id=uuid4(),
        creator_user_id=uuid4(),
    )


def test_child_cannot_create_hidden_events() -> None:
    permissions = permissions_for_calendar_role("child")
    assert not permissions.can_create_hidden_events


def test_validate_tagged_members_rejects_external_user() -> None:
    in_family = uuid4()
    outside_family = uuid4()

    with pytest.raises(HTTPException, match="outside this family"):
        validate_tagged_members(
            family_member_ids={in_family},
            tagged_user_ids=[in_family, outside_family],
        )


def test_validate_hidden_members_rejects_external_user() -> None:
    in_family = uuid4()
    outside_family = uuid4()

    with pytest.raises(HTTPException, match="outside this family"):
        validate_hidden_members(
            family_member_ids={in_family},
            hidden_for_user_ids=[outside_family],
        )

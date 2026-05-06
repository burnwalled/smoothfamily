from uuid import uuid4

import pytest

from app.families.rbac import (
    ensure_owner_not_downgraded,
    permissions_for_role,
    resolve_effective_family_role,
)


def test_parent_role_has_settings_access() -> None:
    permissions = permissions_for_role("parent")
    assert permissions.can_manage_settings
    assert permissions.can_manage_members


def test_child_role_is_restricted() -> None:
    permissions = permissions_for_role("child")
    assert not permissions.can_manage_settings
    assert not permissions.can_manage_members
    assert not permissions.can_manage_calendar_integrations


def test_owner_is_always_resolved_for_family_owner() -> None:
    owner_id = uuid4()
    resolved_role = resolve_effective_family_role(
        family_owner_user_id=owner_id,
        user_id=owner_id,
        membership_role="child",
    )
    assert resolved_role == "owner"


def test_owner_cannot_be_downgraded_to_child() -> None:
    owner_id = uuid4()
    with pytest.raises(ValueError, match="Owner cannot be downgraded"):
        ensure_owner_not_downgraded(
            family_owner_user_id=owner_id,
            target_user_id=owner_id,
            new_role="child",
        )

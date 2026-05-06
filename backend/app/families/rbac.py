from dataclasses import dataclass
from typing import Literal
from uuid import UUID

FamilyRole = Literal["owner", "parent", "child"]
InviteRole = Literal["parent", "child"]


@dataclass(frozen=True)
class FamilyPermissions:
    can_manage_settings: bool
    can_manage_members: bool
    can_manage_calendar_integrations: bool


def resolve_effective_family_role(
    *,
    family_owner_user_id: UUID,
    user_id: UUID,
    membership_role: str,
) -> FamilyRole:
    if user_id == family_owner_user_id:
        return "owner"
    if membership_role == "child":
        return "child"
    return "parent"


def permissions_for_role(role: FamilyRole) -> FamilyPermissions:
    if role == "child":
        return FamilyPermissions(
            can_manage_settings=False,
            can_manage_members=False,
            can_manage_calendar_integrations=False,
        )

    return FamilyPermissions(
        can_manage_settings=True,
        can_manage_members=True,
        can_manage_calendar_integrations=True,
    )


def normalize_invite_role(value: str) -> InviteRole:
    if value == "parent":
        return "parent"
    if value == "child":
        return "child"
    raise ValueError("Invite role must be 'parent' or 'child'")


def ensure_owner_not_downgraded(
    *,
    family_owner_user_id: UUID,
    target_user_id: UUID,
    new_role: str,
) -> None:
    if target_user_id == family_owner_user_id and new_role == "child":
        raise ValueError("Owner cannot be downgraded to child")

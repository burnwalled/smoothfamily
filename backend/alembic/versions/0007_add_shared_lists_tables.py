"""add shared lists tables

Revision ID: 0007
Revises: 0006
Create Date: 2026-05-06
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "shared_lists",
        sa.Column(
            "id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("family_id", UUID(as_uuid=True), sa.ForeignKey("families.id"), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("description", sa.String(length=240), nullable=True),
        sa.Column(
            "created_by_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_shared_lists_family_id", "shared_lists", ["family_id"])
    op.create_index("ix_shared_lists_created_by_user_id", "shared_lists", ["created_by_user_id"])

    op.create_table(
        "shared_list_items",
        sa.Column(
            "id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("list_id", UUID(as_uuid=True), sa.ForeignKey("shared_lists.id"), nullable=False),
        sa.Column("family_id", UUID(as_uuid=True), sa.ForeignKey("families.id"), nullable=False),
        sa.Column("title", sa.String(length=240), nullable=False),
        sa.Column("is_completed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column(
            "created_by_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_shared_list_items_list_id", "shared_list_items", ["list_id"])
    op.create_index("ix_shared_list_items_family_id", "shared_list_items", ["family_id"])
    op.create_index(
        "ix_shared_list_items_created_by_user_id", "shared_list_items", ["created_by_user_id"]
    )

    op.create_table(
        "shared_list_visible_members",
        sa.Column(
            "id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("list_id", UUID(as_uuid=True), sa.ForeignKey("shared_lists.id"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.UniqueConstraint("list_id", "user_id", name="uq_shared_list_visible_member"),
    )
    op.create_index(
        "ix_shared_list_visible_members_list_id", "shared_list_visible_members", ["list_id"]
    )
    op.create_index(
        "ix_shared_list_visible_members_user_id", "shared_list_visible_members", ["user_id"]
    )

    op.create_table(
        "shared_list_visible_chat_groups",
        sa.Column(
            "id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("list_id", UUID(as_uuid=True), sa.ForeignKey("shared_lists.id"), nullable=False),
        sa.Column(
            "chat_group_id", UUID(as_uuid=True), sa.ForeignKey("chat_groups.id"), nullable=False
        ),
        sa.UniqueConstraint("list_id", "chat_group_id", name="uq_shared_list_visible_chat_group"),
    )
    op.create_index(
        "ix_shared_list_visible_chat_groups_list_id",
        "shared_list_visible_chat_groups",
        ["list_id"],
    )
    op.create_index(
        "ix_shared_list_visible_chat_groups_chat_group_id",
        "shared_list_visible_chat_groups",
        ["chat_group_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_shared_list_visible_chat_groups_chat_group_id",
        table_name="shared_list_visible_chat_groups",
    )
    op.drop_index(
        "ix_shared_list_visible_chat_groups_list_id", table_name="shared_list_visible_chat_groups"
    )
    op.drop_table("shared_list_visible_chat_groups")

    op.drop_index(
        "ix_shared_list_visible_members_user_id", table_name="shared_list_visible_members"
    )
    op.drop_index(
        "ix_shared_list_visible_members_list_id", table_name="shared_list_visible_members"
    )
    op.drop_table("shared_list_visible_members")

    op.drop_index("ix_shared_list_items_created_by_user_id", table_name="shared_list_items")
    op.drop_index("ix_shared_list_items_family_id", table_name="shared_list_items")
    op.drop_index("ix_shared_list_items_list_id", table_name="shared_list_items")
    op.drop_table("shared_list_items")

    op.drop_index("ix_shared_lists_created_by_user_id", table_name="shared_lists")
    op.drop_index("ix_shared_lists_family_id", table_name="shared_lists")
    op.drop_table("shared_lists")

"""add chat tables

Revision ID: 0006
Revises: 0005
Create Date: 2026-05-06
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "chat_groups",
        sa.Column(
            "id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("family_id", UUID(as_uuid=True), sa.ForeignKey("families.id"), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
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
    op.create_index("ix_chat_groups_family_id", "chat_groups", ["family_id"])
    op.create_index("ix_chat_groups_created_by_user_id", "chat_groups", ["created_by_user_id"])

    op.create_table(
        "chat_group_members",
        sa.Column(
            "id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("group_id", UUID(as_uuid=True), sa.ForeignKey("chat_groups.id"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("last_read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "added_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("group_id", "user_id", name="uq_chat_group_member"),
    )
    op.create_index("ix_chat_group_members_group_id", "chat_group_members", ["group_id"])
    op.create_index("ix_chat_group_members_user_id", "chat_group_members", ["user_id"])

    op.create_table(
        "chat_messages",
        sa.Column(
            "id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("family_id", UUID(as_uuid=True), sa.ForeignKey("families.id"), nullable=False),
        sa.Column("group_id", UUID(as_uuid=True), sa.ForeignKey("chat_groups.id"), nullable=False),
        sa.Column("sender_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index("ix_chat_messages_family_id", "chat_messages", ["family_id"])
    op.create_index("ix_chat_messages_group_id", "chat_messages", ["group_id"])
    op.create_index("ix_chat_messages_sender_user_id", "chat_messages", ["sender_user_id"])


def downgrade() -> None:
    op.drop_index("ix_chat_messages_sender_user_id", table_name="chat_messages")
    op.drop_index("ix_chat_messages_group_id", table_name="chat_messages")
    op.drop_index("ix_chat_messages_family_id", table_name="chat_messages")
    op.drop_table("chat_messages")

    op.drop_index("ix_chat_group_members_user_id", table_name="chat_group_members")
    op.drop_index("ix_chat_group_members_group_id", table_name="chat_group_members")
    op.drop_table("chat_group_members")

    op.drop_index("ix_chat_groups_created_by_user_id", table_name="chat_groups")
    op.drop_index("ix_chat_groups_family_id", table_name="chat_groups")
    op.drop_table("chat_groups")

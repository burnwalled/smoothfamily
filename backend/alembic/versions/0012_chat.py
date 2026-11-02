"""Phase L: family chat with read markers.

Revision ID: 0012_chat
Revises: 0011_recipes
Create Date: 2026-06-12
"""

from alembic import op
import sqlalchemy as sa


revision = "0012_chat"
down_revision = "0011_recipes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "chat_messages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("family_id", sa.Uuid(), nullable=False),
        sa.Column("sender_id", sa.Uuid(), nullable=False),
        sa.Column("recipient_id", sa.Uuid(), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"]),
        sa.ForeignKeyConstraint(["sender_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["recipient_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_chat_messages_family_id", "chat_messages", ["family_id"])
    op.create_index("ix_chat_messages_created_at", "chat_messages", ["created_at"])

    op.create_table(
        "chat_reads",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("peer_key", sa.String(length=50), nullable=False),
        sa.Column("last_read_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "peer_key", name="uq_chat_reads_user_peer"),
    )
    op.create_index("ix_chat_reads_user_id", "chat_reads", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_chat_reads_user_id", table_name="chat_reads")
    op.drop_table("chat_reads")

    op.drop_index("ix_chat_messages_created_at", table_name="chat_messages")
    op.drop_index("ix_chat_messages_family_id", table_name="chat_messages")
    op.drop_table("chat_messages")

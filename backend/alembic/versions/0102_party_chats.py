"""Parties (3.4.0): a chat with the guests and one for those planning, in the chat app, where people
from outside the family write under their name.

Revision ID: 0102_party_chats
Revises: 0101_party_guest_groups
Create Date: 2026-11-04
"""

from alembic import op
import sqlalchemy as sa

revision = "0102_party_chats"
down_revision = "0101_party_guest_groups"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("parties", sa.Column("guest_chat", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("parties", sa.Column("planner_chat", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("conversations", sa.Column("party_id", sa.Uuid(), sa.ForeignKey("parties.id", ondelete="CASCADE"), nullable=True, index=True))
    op.add_column("conversations", sa.Column("party_kind", sa.String(10), nullable=True))
    op.add_column("chat_messages", sa.Column("sender_name", sa.String(80), nullable=True))
    op.alter_column("chat_messages", "sender_id", existing_type=sa.Uuid(), nullable=True)


def downgrade() -> None:
    op.execute("DELETE FROM chat_messages WHERE sender_id IS NULL")
    op.alter_column("chat_messages", "sender_id", existing_type=sa.Uuid(), nullable=False)
    op.drop_column("chat_messages", "sender_name")
    op.execute("DELETE FROM conversations WHERE party_id IS NOT NULL")
    op.drop_column("conversations", "party_kind")
    op.drop_column("conversations", "party_id")
    op.drop_column("parties", "planner_chat")
    op.drop_column("parties", "guest_chat")

"""Chat media: hidden system albums for chat attachments and GIF references.

Revision ID: 0018_chat_media
Revises: 0017_external_access
Create Date: 2026-10-24
"""

from alembic import op
import sqlalchemy as sa

revision = "0018_chat_media"
down_revision = "0017_external_access"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # "user" albums show up under Photos; "chat" albums hold chat attachments
    # and are only reachable through conversation membership.
    op.add_column("albums", sa.Column("kind", sa.String(20), nullable=False, server_default="user"))
    op.add_column("chat_messages", sa.Column("gif_id", sa.String(64), nullable=True))


def downgrade() -> None:
    op.drop_column("chat_messages", "gif_id")
    op.drop_column("albums", "kind")

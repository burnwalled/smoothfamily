"""Memories: when each photo was taken.

Revision ID: 0041_memories
Revises: 0040_flows_in_ha
Create Date: 2026-10-28
"""

from alembic import op
import sqlalchemy as sa

revision = "0041_memories"
down_revision = "0040_flows_in_ha"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Filled in by the worker from each photo's EXIF (services/memories.py).
    op.add_column("media_items", sa.Column("taken_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_media_items_taken_at", "media_items", ["taken_at"])


def downgrade() -> None:
    op.drop_index("ix_media_items_taken_at", "media_items")
    op.drop_column("media_items", "taken_at")

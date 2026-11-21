"""A speaker's library, remembered: each level a speaker has shown, so it can be shown again when
the speaker can't be asked – a Spotify account only shows its library while something is playing.

Revision ID: 0110_media_library
Revises: 0109_wish_occasion
Create Date: 2026-11-21
"""

from alembic import op
import sqlalchemy as sa

revision = "0110_media_library"
down_revision = "0109_wish_occasion"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "media_library_pages",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("device_id", sa.Uuid(), sa.ForeignKey("exposed_devices.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("content_key", sa.String(700), nullable=False),
        sa.Column("items", sa.JSON(), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("device_id", "content_key", name="uq_media_library_device_key"),
    )


def downgrade() -> None:
    op.drop_table("media_library_pages")

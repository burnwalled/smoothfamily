"""Calendar feed privacy fields.

Revision ID: 0008
Revises: 0007
Create Date: 2026-06-12
"""
from alembic import op
import sqlalchemy as sa

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "calendar_feeds",
        sa.Column("visible_to", sa.JSON(), nullable=False, server_default="[]"),
    )
    op.add_column(
        "calendar_feeds",
        sa.Column("details_for", sa.JSON(), nullable=False, server_default="[]"),
    )


def downgrade() -> None:
    op.drop_column("calendar_feeds", "details_for")
    op.drop_column("calendar_feeds", "visible_to")

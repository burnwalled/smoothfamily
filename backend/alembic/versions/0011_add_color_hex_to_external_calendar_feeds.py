"""add color_hex to external_calendar_feeds

Revision ID: 0011
Revises: 0010
Create Date: 2026-05-08
"""

from alembic import op
import sqlalchemy as sa

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "external_calendar_feeds",
        sa.Column("color_hex", sa.String(7), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("external_calendar_feeds", "color_hex")

"""rename ical_url_encrypted to ical_url

Revision ID: 0010
Revises: 0009
Create Date: 2026-05-08
"""

from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "external_calendar_feeds",
        "ical_url_encrypted",
        new_column_name="ical_url",
    )


def downgrade() -> None:
    op.alter_column(
        "external_calendar_feeds",
        "ical_url",
        new_column_name="ical_url_encrypted",
    )

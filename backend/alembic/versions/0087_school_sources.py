"""The children's school from Home Assistant (3.4.0): the school accounts linked to a child.

Revision ID: 0087_school_sources
Revises: 0086_ride_text
Create Date: 2026-11-03
"""

from alembic import op
import sqlalchemy as sa

revision = "0087_school_sources"
down_revision = "0086_ride_text"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("school_sources", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "school_sources")

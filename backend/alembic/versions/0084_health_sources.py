"""Health from Home Assistant (3.4.0): the sensors each person reads their health from.

Revision ID: 0084_health_sources
Revises: 0083_health_family
Create Date: 2026-11-03
"""

from alembic import op
import sqlalchemy as sa

revision = "0084_health_sources"
down_revision = "0083_health_family"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("health_sources", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "health_sources")

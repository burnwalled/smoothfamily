"""Health from Home Assistant per account (3.4.0): the family admin links a member's health accounts,
and the member turns fetching on. Those who already picked their sensors themselves keep it on.

Revision ID: 0085_health_import
Revises: 0084_health_sources
Create Date: 2026-11-03
"""

from alembic import op
import sqlalchemy as sa

revision = "0085_health_import"
down_revision = "0084_health_sources"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("health_import", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.execute("UPDATE users SET health_import = true WHERE health_sources IS NOT NULL")


def downgrade() -> None:
    op.drop_column("users", "health_import")

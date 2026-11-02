"""Per-user menu: order of the sections and which ones are hidden.

Revision ID: 0023_nav_prefs
Revises: 0022_event_members
Create Date: 2026-10-25
"""

from alembic import op
import sqlalchemy as sa

revision = "0023_nav_prefs"
down_revision = "0022_event_members"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("nav_order", sa.JSON(), nullable=False, server_default="[]"))
    op.add_column("users", sa.Column("nav_hidden", sa.JSON(), nullable=False, server_default="[]"))


def downgrade() -> None:
    op.drop_column("users", "nav_hidden")
    op.drop_column("users", "nav_order")

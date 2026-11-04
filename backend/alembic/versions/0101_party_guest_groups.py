"""Parties (3.4.0): guests who belong together, each with their own reply and link.

Revision ID: 0101_party_guest_groups
Revises: 0100_party_day_tools
Create Date: 2026-11-04
"""

from alembic import op
import sqlalchemy as sa

revision = "0101_party_guest_groups"
down_revision = "0100_party_day_tools"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("party_guests", sa.Column("group_id", sa.String(16), nullable=True))


def downgrade() -> None:
    op.drop_column("party_guests", "group_id")

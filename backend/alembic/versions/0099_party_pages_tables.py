"""Parties (3.4.0): the pages a party has, when the portal's link ends, the seating, and tasks the app
can help with.

Revision ID: 0099_party_pages_tables
Revises: 0098_party_one_theme
Create Date: 2026-11-04
"""

from alembic import op
import sqlalchemy as sa

revision = "0099_party_pages_tables"
down_revision = "0098_party_one_theme"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("parties", sa.Column("pages", sa.JSON(), nullable=True))
    op.add_column("parties", sa.Column("portal_until", sa.DateTime(timezone=True), nullable=True))
    op.add_column("parties", sa.Column("tables", sa.JSON(), nullable=True))
    op.add_column("party_guests", sa.Column("table_id", sa.String(20), nullable=True))
    op.add_column("party_tasks", sa.Column("action", sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column("party_tasks", "action")
    op.drop_column("party_guests", "table_id")
    op.drop_column("parties", "tables")
    op.drop_column("parties", "portal_until")
    op.drop_column("parties", "pages")

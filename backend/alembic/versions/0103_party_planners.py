"""Parties (3.4.0): who plans a party, apart from who's being celebrated.

Revision ID: 0103_party_planners
Revises: 0102_party_chats
Create Date: 2026-11-04
"""

from alembic import op
import sqlalchemy as sa

revision = "0103_party_planners"
down_revision = "0102_party_chats"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("parties", sa.Column("planners", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("parties", "planners")

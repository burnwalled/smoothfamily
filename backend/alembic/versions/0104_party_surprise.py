"""Parties (3.4.0): a surprise party, in the calendar only for those planning it.

Revision ID: 0104_party_surprise
Revises: 0103_party_planners
Create Date: 2026-11-04
"""

from alembic import op
import sqlalchemy as sa

revision = "0104_party_surprise"
down_revision = "0103_party_planners"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("parties", sa.Column("surprise", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("family_events", sa.Column("private_to", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("family_events", "private_to")
    op.drop_column("parties", "surprise")

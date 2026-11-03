"""Parties (3.4.0): a vote on the date (for a dinner), and one reply per family with how many
adults and children are coming.

Revision ID: 0090_party_poll_households
Revises: 0089_party_themes_mail
Create Date: 2026-11-03
"""

from alembic import op
import sqlalchemy as sa

revision = "0090_party_poll_households"
down_revision = "0089_party_themes_mail"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("parties", sa.Column("date_poll", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("parties", sa.Column("date_options", sa.JSON(), nullable=True))
    op.add_column("parties", sa.Column("households", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("party_guests", sa.Column("date_votes", sa.JSON(), nullable=True))
    op.add_column("party_guests", sa.Column("adults", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("party_guests", sa.Column("children", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    for col in ("children", "adults", "date_votes"):
        op.drop_column("party_guests", col)
    for col in ("households", "date_options", "date_poll"):
        op.drop_column("parties", col)

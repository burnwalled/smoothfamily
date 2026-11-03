"""Parties (3.4.0): the poster of each invitation, made of blocks, and its own pictures.

Revision ID: 0092_party_layout
Revises: 0091_party_theme_style
Create Date: 2026-11-03
"""

from alembic import op
import sqlalchemy as sa

revision = "0092_party_layout"
down_revision = "0091_party_theme_style"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("parties", sa.Column("layout", sa.JSON(), nullable=True))
    op.add_column("parties", sa.Column("assets", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("parties", "assets")
    op.drop_column("parties", "layout")

"""Parties (3.4.0): an own theme's typefaces and the moving effect behind the page.

Revision ID: 0091_party_theme_style
Revises: 0090_party_guests_themes
Create Date: 2026-11-03
"""

from alembic import op
import sqlalchemy as sa

revision = "0091_party_theme_style"
down_revision = "0090_party_guests_themes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("party_themes", sa.Column("font", sa.String(12), nullable=False, server_default="playful"))
    op.add_column("party_themes", sa.Column("effect", sa.String(12), nullable=False, server_default="confetti"))


def downgrade() -> None:
    op.drop_column("party_themes", "effect")
    op.drop_column("party_themes", "font")

"""Parties (3.4.0): one theme for all of a party's pages - the thank-you no longer has its own.

Revision ID: 0098_party_one_theme
Revises: 0097_party_templates
Create Date: 2026-11-04
"""

from alembic import op
import sqlalchemy as sa

revision = "0098_party_one_theme"
down_revision = "0097_party_templates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("parties", "thanks_custom_id")
    op.drop_column("parties", "thanks_theme")


def downgrade() -> None:
    op.add_column("parties", sa.Column("thanks_theme", sa.String(20), nullable=False, server_default=""))
    op.add_column("parties", sa.Column("thanks_custom_id", sa.Uuid(), sa.ForeignKey("party_themes.id", ondelete="SET NULL"), nullable=True))

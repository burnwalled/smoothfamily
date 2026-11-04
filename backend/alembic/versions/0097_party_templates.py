"""Parties (3.4.0): a family's own templates - a party's posters and its look, to use again.

Revision ID: 0097_party_templates
Revises: 0096_party_journey
Create Date: 2026-11-04
"""

from alembic import op
import sqlalchemy as sa

revision = "0097_party_templates"
down_revision = "0096_party_journey"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "party_templates",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("name", sa.String(60), nullable=False),
        sa.Column("theme", sa.String(40), nullable=True),
        sa.Column("look", sa.JSON(), nullable=True),
        sa.Column("layouts", sa.JSON(), nullable=False),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("party_templates")

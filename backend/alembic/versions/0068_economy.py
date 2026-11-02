"""The household's economy: entries of its own (incomes, costs, bank rows) and budgets.

Revision ID: 0068_economy
Revises: 0067_list_ha_links
Create Date: 2026-10-30
"""

from alembic import op
import sqlalchemy as sa

revision = "0068_economy"
down_revision = "0067_list_ha_links"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "economy_entries",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("kind", sa.String(3), nullable=False),
        sa.Column("category", sa.String(60), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("note", sa.String(200), nullable=True),
        sa.Column("recurring", sa.String(10), nullable=True),
        sa.Column("private", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("source", sa.String(10), nullable=False, server_default="manual"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_economy_entries_family_id", "economy_entries", ["family_id"])
    op.create_table(
        "economy_budgets",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False),
        sa.Column("category", sa.String(60), nullable=False),
        sa.Column("monthly", sa.Numeric(12, 2), nullable=False),
        sa.UniqueConstraint("family_id", "category", name="uq_economy_budget"),
    )
    op.create_index("ix_economy_budgets_family_id", "economy_budgets", ["family_id"])
    # A bank rule can point at an economy category ("home:<uuid>" is 41 characters).
    op.alter_column("bank_rules", "category", type_=sa.String(60), existing_nullable=False)


def downgrade() -> None:
    op.drop_table("economy_budgets")
    op.drop_table("economy_entries")

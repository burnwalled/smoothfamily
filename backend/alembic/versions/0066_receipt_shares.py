"""A child's receipts shared with the other home: whose, and the other home's share.

Revision ID: 0066_receipt_shares
Revises: 0065_recipe_book
Create Date: 2026-10-30
"""

from alembic import op
import sqlalchemy as sa

revision = "0066_receipt_shares"
down_revision = "0065_recipe_book"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("receipts", sa.Column("child_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True))
    op.add_column("receipts", sa.Column("split_pct", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("receipts", "split_pct")
    op.drop_column("receipts", "child_id")

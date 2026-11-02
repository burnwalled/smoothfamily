"""The vault: receipts get their own album, shown only to those who may see what they belong to.

Revision ID: 0053_vault_receipts
Revises: 0052_family_managers
Create Date: 2026-10-29
"""

from alembic import op

revision = "0053_vault_receipts"
down_revision = "0052_family_managers"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The app made a plain album called "Receipts" for them until now.
    op.execute("UPDATE albums SET kind = 'receipts' WHERE kind = 'user' AND lower(name) = 'receipts'")


def downgrade() -> None:
    op.execute("UPDATE albums SET kind = 'user' WHERE kind = 'receipts'")

"""The vault's logins: an adult chooses whom to share each one with.

Revision ID: 0055_vault_sharing
Revises: 0054_vault_logins
Create Date: 2026-10-29
"""

from alembic import op
import sqlalchemy as sa

revision = "0055_vault_sharing"
down_revision = "0054_vault_logins"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("vault_logins", sa.Column("shared_with", sa.JSON(), nullable=False, server_default="[]"))


def downgrade() -> None:
    op.drop_column("vault_logins", "shared_with")

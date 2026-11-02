"""Adults the admin lets change the family's settings.

Revision ID: 0052_family_managers
Revises: 0051_custody_bank
Create Date: 2026-10-29
"""

from alembic import op
import sqlalchemy as sa

revision = "0052_family_managers"
down_revision = "0051_custody_bank"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("can_manage_family", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("users", "can_manage_family")

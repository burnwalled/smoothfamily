"""add revoked_at to family_invites

Revision ID: 0008
Revises: 0007
Create Date: 2026-05-06
"""

import sqlalchemy as sa

from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "family_invites", sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("family_invites", "revoked_at")

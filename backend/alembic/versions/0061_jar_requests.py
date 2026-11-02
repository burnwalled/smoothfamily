"""A child proposes a savings goal of their own; an adult approves it.

Revision ID: 0061_jar_requests
Revises: 0060_coparents
Create Date: 2026-10-30
"""

from alembic import op
import sqlalchemy as sa

revision = "0061_jar_requests"
down_revision = "0060_coparents"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("savings_jars", sa.Column("pending", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("savings_jars", "pending")

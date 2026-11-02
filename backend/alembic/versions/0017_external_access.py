"""Phase R: external URL setting and per-user iCal token.

Revision ID: 0017_external_access
Revises: 0016_chat_v2
Create Date: 2026-06-12
"""

from alembic import op
import sqlalchemy as sa

revision = "0017_external_access"
down_revision = "0016_chat_v2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("ical_token", sa.String(64), nullable=True))
    op.create_index("ix_users_ical_token", "users", ["ical_token"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_users_ical_token", table_name="users")
    op.drop_column("users", "ical_token")

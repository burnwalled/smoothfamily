"""A family's own backup key (the public half); the server's lives in app_settings.

Revision ID: 0069_backup_keys
Revises: 0068_economy
Create Date: 2026-10-31
"""

from alembic import op
import sqlalchemy as sa

revision = "0069_backup_keys"
down_revision = "0068_economy"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("families", sa.Column("backup_public_key", sa.String(60), nullable=True))


def downgrade() -> None:
    op.drop_column("families", "backup_public_key")

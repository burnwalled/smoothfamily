"""How much each family may keep on the server.

Revision ID: 0059_family_quota
Revises: 0058_kiosk_widgets
Create Date: 2026-10-30
"""

from alembic import op
import sqlalchemy as sa

revision = "0059_family_quota"
down_revision = "0058_kiosk_widgets"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("families", sa.Column("storage_quota_mb", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("families", "storage_quota_mb")

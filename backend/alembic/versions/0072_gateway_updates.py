"""Gateway updates: the newer version a family was told about, once per version.

Revision ID: 0072_gateway_updates
Revises: 0071_task_links
Create Date: 2026-10-31
"""

from alembic import op
import sqlalchemy as sa

revision = "0072_gateway_updates"
down_revision = "0071_task_links"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("smarthome_connections", sa.Column("gateway_update_told", sa.String(40), nullable=True))


def downgrade() -> None:
    op.drop_column("smarthome_connections", "gateway_update_told")

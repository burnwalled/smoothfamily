"""Flows that run in Home Assistant (published as automations).

Revision ID: 0040_flows_in_ha
Revises: 0039_kiosk_electricity
Create Date: 2026-10-28
"""

from alembic import op
import sqlalchemy as sa

revision = "0040_flows_in_ha"
down_revision = "0039_kiosk_electricity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("smarthome_flows", sa.Column("run_in", sa.String(4), nullable=False, server_default="app"))
    op.add_column("smarthome_flows", sa.Column("ha_synced_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("smarthome_flows", "ha_synced_at")
    op.drop_column("smarthome_flows", "run_in")

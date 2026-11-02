"""Several Home Assistants per family, each for one of the homes; the others through the gateway.

Revision ID: 0064_home_gateways
Revises: 0063_receipts
Create Date: 2026-10-30
"""

from alembic import op
import sqlalchemy as sa

revision = "0064_home_gateways"
down_revision = "0063_receipts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index("ix_smarthome_connections_family_id", table_name="smarthome_connections")
    op.create_index("ix_smarthome_connections_family_id", "smarthome_connections", ["family_id"])
    op.add_column("smarthome_connections", sa.Column("property_id", sa.Uuid(), sa.ForeignKey("properties.id", ondelete="SET NULL"), nullable=True))
    op.add_column("smarthome_connections", sa.Column("name", sa.String(120), nullable=False, server_default=""))
    op.add_column("smarthome_connections", sa.Column("gateway_key_hash", sa.String(64), nullable=True, unique=True))
    op.add_column("smarthome_connections", sa.Column("gateway_code_hash", sa.String(64), nullable=True, unique=True))
    op.add_column("smarthome_connections", sa.Column("gateway_code_expires", sa.DateTime(timezone=True), nullable=True))
    op.add_column("smarthome_connections", sa.Column("gateway_last_seen", sa.DateTime(timezone=True), nullable=True))
    op.add_column("smarthome_connections", sa.Column("gateway_version", sa.String(40), nullable=True))


def downgrade() -> None:
    for column in ("gateway_version", "gateway_last_seen", "gateway_code_expires", "gateway_code_hash", "gateway_key_hash", "name", "property_id"):
        op.drop_column("smarthome_connections", column)
    op.execute("DELETE FROM smarthome_connections WHERE base_url LIKE 'gateway://%'")
    op.drop_index("ix_smarthome_connections_family_id", table_name="smarthome_connections")
    op.create_index("ix_smarthome_connections_family_id", "smarthome_connections", ["family_id"], unique=True)

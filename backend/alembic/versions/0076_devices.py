"""The devices that use the family's account (3.1.0): each browser or phone a member signs in on, the
kitchen displays' app version and where a gateway runs – for the family admin's and the server
admin's overview of who is connected and whether all is well.

Revision ID: 0076_devices
Revises: 0075_feedback_on_the_server
Create Date: 2026-11-02
"""

from alembic import op
import sqlalchemy as sa

revision = "0076_devices"
down_revision = "0075_feedback_on_the_server"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "client_devices",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("device_key", sa.String(64), nullable=False),
        sa.Column("kind", sa.String(12), nullable=False, server_default="computer"),
        sa.Column("browser", sa.String(40), nullable=False, server_default=""),
        sa.Column("os", sa.String(40), nullable=False, server_default=""),
        sa.Column("app_version", sa.String(40), nullable=True),
        sa.Column("installed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("first_seen", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "device_key", name="uq_client_device"),
    )
    op.add_column("kiosk_screens", sa.Column("app_version", sa.String(40), nullable=True))
    op.add_column("smarthome_connections", sa.Column("gateway_runs_in", sa.String(10), nullable=True))


def downgrade() -> None:
    op.drop_column("smarthome_connections", "gateway_runs_in")
    op.drop_column("kiosk_screens", "app_version")
    op.drop_table("client_devices")

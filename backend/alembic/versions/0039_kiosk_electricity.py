"""Kitchen display screens and the electricity price area.

Revision ID: 0039_kiosk_electricity
Revises: 0038_smarthome_flows
Create Date: 2026-10-28
"""

from alembic import op
import sqlalchemy as sa

revision = "0039_kiosk_electricity"
down_revision = "0038_smarthome_flows"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("families", sa.Column("electricity_area", sa.String(3), nullable=True))
    op.create_table(
        "kiosk_screens",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True, index=True),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("kiosk_screens")
    op.drop_column("families", "electricity_area")

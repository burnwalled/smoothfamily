"""The security log (3.4.1): failed sign-ins, the brake, invalid links, new devices, changed passwords.

Revision ID: 0107_security_events
Revises: 0106_security_round
Create Date: 2026-11-05
"""

from alembic import op
import sqlalchemy as sa

revision = "0107_security_events"
down_revision = "0106_security_round"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "security_events",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("family_id", sa.Uuid(), nullable=True, index=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("username", sa.String(60), nullable=False, server_default=""),
        sa.Column("ip", sa.String(45), nullable=False, server_default=""),
        sa.Column("detail", sa.String(200), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, index=True),
    )


def downgrade() -> None:
    op.drop_table("security_events")

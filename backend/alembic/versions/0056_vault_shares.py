"""Links out of the vault that run out.

Revision ID: 0056_vault_shares
Revises: 0055_vault_sharing
Create Date: 2026-10-29
"""

from alembic import op
import sqlalchemy as sa

revision = "0056_vault_shares"
down_revision = "0055_vault_sharing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "vault_shares",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("target_id", sa.Uuid(), nullable=False),
        sa.Column("label", sa.String(80), nullable=False, server_default=""),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True, index=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("one_time", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("allow_download", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("views", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("first_opened_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_opened_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("vault_shares")

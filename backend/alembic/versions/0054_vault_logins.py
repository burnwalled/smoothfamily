"""The vault's password manager: accounts encrypted with the family's key.

Revision ID: 0054_vault_logins
Revises: 0053_vault_receipts
Create Date: 2026-10-29
"""

from alembic import op
import sqlalchemy as sa

revision = "0054_vault_logins"
down_revision = "0053_vault_receipts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "vault_logins",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("url", sa.String(500), nullable=False, server_default=""),
        sa.Column("username_encrypted", sa.Text(), nullable=True),
        sa.Column("password_encrypted", sa.Text(), nullable=True),
        sa.Column("notes_encrypted", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("vault_logins")

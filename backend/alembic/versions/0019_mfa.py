"""Passkeys (WebAuthn) and authenticator-app codes (TOTP), with a per-family policy.

Revision ID: 0019_mfa
Revises: 0018_chat_media
Create Date: 2026-10-24
"""

from alembic import op
import sqlalchemy as sa

revision = "0019_mfa"
down_revision = "0018_chat_media"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("families", sa.Column("passkeys_enabled", sa.Boolean(), nullable=False, server_default=sa.true()))
    # off | optional | required (required applies to adults and admins, not children)
    op.add_column("families", sa.Column("totp_policy", sa.String(10), nullable=False, server_default="optional"))

    op.add_column("users", sa.Column("totp_secret_encrypted", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("totp_pending_encrypted", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("totp_last_step", sa.BigInteger(), nullable=True))

    op.create_table(
        "webauthn_credentials",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("credential_id", sa.LargeBinary(), nullable=False),
        sa.Column("public_key", sa.LargeBinary(), nullable=False),
        sa.Column("sign_count", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("transports", sa.JSON(), nullable=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("credential_id", name="uq_webauthn_credential_id"),
    )
    op.create_index("ix_webauthn_credentials_user_id", "webauthn_credentials", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_webauthn_credentials_user_id", table_name="webauthn_credentials")
    op.drop_table("webauthn_credentials")
    op.drop_column("users", "totp_last_step")
    op.drop_column("users", "totp_pending_encrypted")
    op.drop_column("users", "totp_secret_encrypted")
    op.drop_column("families", "totp_policy")
    op.drop_column("families", "passkeys_enabled")

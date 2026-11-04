"""Sessions that can be ended (users.session_version) and the family chat marked as such.

Revision ID: 0106_security_round
Revises: 0105_subscriptions
Create Date: 2026-11-04
"""

from alembic import op
import sqlalchemy as sa

revision = "0106_security_round"
down_revision = "0105_subscriptions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("session_version", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("conversations", sa.Column("is_family", sa.Boolean(), nullable=False, server_default=sa.false()))
    # The family chat so far: the oldest conversation named "Family" in each family.
    op.execute(
        """
        UPDATE conversations SET is_family = TRUE
        WHERE name = 'Family' AND party_id IS NULL AND created_at = (
            SELECT MIN(c2.created_at) FROM conversations c2
            WHERE c2.family_id = conversations.family_id AND c2.name = 'Family' AND c2.party_id IS NULL
        )
        """
    )


def downgrade() -> None:
    op.drop_column("conversations", "is_family")
    op.drop_column("users", "session_version")

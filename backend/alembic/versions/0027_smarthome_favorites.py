"""Per-user favourite smart home devices (shown on the Today card).

Revision ID: 0027_smarthome_favorites
Revises: 0026_suggestions_goals
Create Date: 2026-10-26
"""

from alembic import op
import sqlalchemy as sa

revision = "0027_smarthome_favorites"
down_revision = "0026_suggestions_goals"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # NULL = never chosen: every device the user may control counts as a favourite.
    op.add_column("users", sa.Column("smarthome_favorites", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "smarthome_favorites")

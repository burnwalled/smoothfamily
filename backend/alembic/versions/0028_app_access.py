"""Per-member app access and per-vehicle visibility.

Revision ID: 0028_app_access
Revises: 0027_smarthome_favorites
Create Date: 2026-10-27
"""

from alembic import op
import sqlalchemy as sa

revision = "0028_app_access"
down_revision = "0027_smarthome_favorites"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # NULL = the role's default apps (see app/apps.py).
    op.add_column("users", sa.Column("app_access", sa.JSON(), nullable=True))
    # Empty = every member with the Vehicles app may see the vehicle.
    op.add_column("vehicles", sa.Column("allowed_user_ids", sa.JSON(), nullable=False, server_default="[]"))


def downgrade() -> None:
    op.drop_column("vehicles", "allowed_user_ids")
    op.drop_column("users", "app_access")

"""Phase P1: add steps JSON column to meals and recipes.

Revision ID: 0015_cooking_steps
Revises: 0014_property_vehicle
Create Date: 2026-06-12
"""

from alembic import op
import sqlalchemy as sa

revision = "0015_cooking_steps"
down_revision = "0014_property_vehicle"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("meals", sa.Column("steps", sa.JSON(), nullable=True))
    op.add_column("recipes", sa.Column("steps", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("recipes", "steps")
    op.drop_column("meals", "steps")

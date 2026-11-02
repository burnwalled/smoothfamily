"""Pantry: what the family has in the freezer, fridge and pantry.

Revision ID: 0043_pantry
Revises: 0042_trips
Create Date: 2026-10-29
"""

import json

from alembic import op
import sqlalchemy as sa

revision = "0043_pantry"
down_revision = "0042_trips"
branch_labels = None
depends_on = None

NEW_APPS = ["pantry"]


def upgrade() -> None:
    op.create_table(
        "pantry_items",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("place", sa.String(10), nullable=False, server_default="pantry"),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("amount", sa.Float(), nullable=True),
        sa.Column("unit", sa.String(20), nullable=False, server_default=""),
        sa.Column("best_before", sa.Date(), nullable=True, index=True),
        sa.Column("reminded_for", sa.Date(), nullable=True),
        sa.Column("added_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    conn = op.get_bind()
    users = sa.table("users", sa.column("id", sa.Uuid()), sa.column("app_access", sa.JSON()))
    for row in conn.execute(sa.select(users.c.id, users.c.app_access).where(users.c.app_access.is_not(None))):
        apps = row.app_access if isinstance(row.app_access, list) else json.loads(row.app_access)
        conn.execute(users.update().where(users.c.id == row.id).values(app_access=sorted(set(apps) | set(NEW_APPS))))


def downgrade() -> None:
    op.drop_table("pantry_items")

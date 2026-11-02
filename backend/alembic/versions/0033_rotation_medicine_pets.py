"""Rotating chores, medicine reminders, pets and wish list share links.

Revision ID: 0033_rotation_medicine_pets
Revises: 0032_family_hosting
Create Date: 2026-10-28
"""

import json

from alembic import op
import sqlalchemy as sa

revision = "0033_rotation_medicine_pets"
down_revision = "0032_family_hosting"
branch_labels = None
depends_on = None

NEW_APPS = ["medicine", "pets"]


def upgrade() -> None:
    op.create_table(
        "pets",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("species", sa.String(20), nullable=False, server_default="other"),
        sa.Column("birth_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "pet_care",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("pet_id", sa.Uuid(), sa.ForeignKey("pets.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("kind", sa.String(20), nullable=False, server_default="vet"),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("date", sa.Date(), nullable=True),
        sa.Column("next_due", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "medications",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("pet_id", sa.Uuid(), sa.ForeignKey("pets.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("dose", sa.String(120), nullable=False, server_default=""),
        sa.Column("times", sa.JSON(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("alert_adults", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "medication_doses",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("medication_id", sa.Uuid(), sa.ForeignKey("medications.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("scheduled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reminded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("taken_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("taken_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("missed_alerted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("medication_id", "scheduled_at", name="uq_dose_medication_time"),
    )
    op.create_table(
        "wish_shares",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("person_id", sa.Uuid(), sa.ForeignKey("people.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True, index=True),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column("tasks", sa.Column("rotation_user_ids", sa.JSON(), nullable=False, server_default="[]"))
    op.add_column("tasks", sa.Column("rotation_mode", sa.String(10), nullable=False, server_default="done"))
    op.add_column("tasks", sa.Column("rotation_index", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("tasks", sa.Column("pet_id", sa.Uuid(), sa.ForeignKey("pets.id", ondelete="SET NULL"), nullable=True))
    op.add_column("people", sa.Column("pet_id", sa.Uuid(), sa.ForeignKey("pets.id", ondelete="CASCADE"), nullable=True))
    op.add_column("wish_items", sa.Column("reserved_by_guest", sa.String(80), nullable=True))
    op.add_column("wish_items", sa.Column("guest_key_hash", sa.String(64), nullable=True))
    # Members whose apps the admin has chosen get the new apps too; the admin can turn them off.
    conn = op.get_bind()
    users = sa.table("users", sa.column("id", sa.Uuid()), sa.column("app_access", sa.JSON()))
    for row in conn.execute(sa.select(users.c.id, users.c.app_access).where(users.c.app_access.is_not(None))):
        apps = row.app_access if isinstance(row.app_access, list) else json.loads(row.app_access)
        conn.execute(users.update().where(users.c.id == row.id).values(app_access=sorted(set(apps) | set(NEW_APPS))))


def downgrade() -> None:
    op.drop_column("wish_items", "guest_key_hash")
    op.drop_column("wish_items", "reserved_by_guest")
    op.drop_column("people", "pet_id")
    op.drop_column("tasks", "pet_id")
    op.drop_column("tasks", "rotation_index")
    op.drop_column("tasks", "rotation_mode")
    op.drop_column("tasks", "rotation_user_ids")
    op.drop_table("wish_shares")
    op.drop_table("medication_doses")
    op.drop_table("medications")
    op.drop_table("pet_care")
    op.drop_table("pets")

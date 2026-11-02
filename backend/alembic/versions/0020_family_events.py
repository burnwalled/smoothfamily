"""Events created in the app (not from an iCal feed), shared with the whole family.

Revision ID: 0020_family_events
Revises: 0019_mfa
Create Date: 2026-10-25
"""

from alembic import op
import sqlalchemy as sa

revision = "0020_family_events"
down_revision = "0019_mfa"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "family_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("family_id", sa.Uuid(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("all_day", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("location", sa.String(200), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("color", sa.String(20), nullable=False, server_default="#C2703D"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_family_events_family_id", "family_events", ["family_id"])
    op.create_index("ix_family_events_start", "family_events", ["start"])


def downgrade() -> None:
    op.drop_index("ix_family_events_start", table_name="family_events")
    op.drop_index("ix_family_events_family_id", table_name="family_events")
    op.drop_table("family_events")

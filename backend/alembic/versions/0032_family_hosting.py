"""Family hosting: server admin, family kinds and status, invitations and the server log.

Revision ID: 0032_family_hosting
Revises: 0031_jars_today_cards
Create Date: 2026-10-27
"""

from alembic import op
import sqlalchemy as sa

revision = "0032_family_hosting"
down_revision = "0031_jars_today_cards"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "invitations",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True, index=True),
        sa.Column("label", sa.String(120), nullable=False),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id", ondelete="SET NULL"), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("demo_family_id", sa.Uuid(), sa.ForeignKey("families.id", ondelete="SET NULL"), nullable=True),
    )
    op.add_column("families", sa.Column("kind", sa.String(10), nullable=False, server_default="owner"))
    op.add_column("families", sa.Column("status", sa.String(10), nullable=False, server_default="active"))
    op.add_column("families", sa.Column("invitation_id", sa.Uuid(), sa.ForeignKey("invitations.id", ondelete="SET NULL"), nullable=True))
    op.add_column("users", sa.Column("is_server_admin", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_table(
        "server_log",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("actor_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("actor_name", sa.String(120), nullable=False, server_default=""),
        sa.Column("action", sa.String(40), nullable=False),
        sa.Column("family_id", sa.Uuid(), nullable=True, index=True),
        sa.Column("detail", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, index=True),
    )
    # The family that set up the server owns it; its admins become server admins. Any other
    # family that already exists counts as hosted.
    conn = op.get_bind()
    families = sa.table("families", sa.column("id", sa.Uuid()), sa.column("created_at", sa.DateTime()), sa.column("kind", sa.String()))
    users = sa.table("users", sa.column("family_id", sa.Uuid()), sa.column("role", sa.String()), sa.column("is_server_admin", sa.Boolean()))
    first = conn.execute(sa.select(families.c.id).order_by(families.c.created_at).limit(1)).scalar()
    if first is not None:
        conn.execute(families.update().where(families.c.id != first).values(kind="hosted"))
        conn.execute(users.update().where(users.c.family_id == first, users.c.role == "admin").values(is_server_admin=True))


def downgrade() -> None:
    op.drop_table("server_log")
    op.drop_column("users", "is_server_admin")
    op.drop_column("families", "invitation_id")
    op.drop_column("families", "status")
    op.drop_column("families", "kind")
    op.drop_table("invitations")

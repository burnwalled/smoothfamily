"""Parties (3.4.0): a vote on the date, the ones a guest brings (a +1 or the family), the family's
own themes with their pictures, a picture on the invitation, and more than one whose party it is.

Revision ID: 0090_party_guests_themes
Revises: 0089_party_themes_mail
Create Date: 2026-11-03
"""

from alembic import op
import sqlalchemy as sa

revision = "0090_party_guests_themes"
down_revision = "0089_party_themes_mail"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "party_themes",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("name", sa.String(60), nullable=False),
        sa.Column("bg", sa.String(7), nullable=False),
        sa.Column("bg2", sa.String(7), nullable=False),
        sa.Column("accent", sa.String(7), nullable=False),
        sa.Column("ink", sa.String(7), nullable=False),
        sa.Column("pattern", sa.String(12), nullable=False),
        sa.Column("decor", sa.String(60), nullable=False),
        sa.Column("header_key", sa.String(200), nullable=True),
        sa.Column("background_key", sa.String(200), nullable=True),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.add_column("parties", sa.Column("person_ids", sa.JSON(), nullable=True))
    op.add_column("parties", sa.Column("bring", sa.String(10), nullable=False, server_default="none"))
    op.add_column("parties", sa.Column("page_custom_id", sa.Uuid(), sa.ForeignKey("party_themes.id", ondelete="SET NULL"), nullable=True))
    op.add_column("parties", sa.Column("thanks_custom_id", sa.Uuid(), sa.ForeignKey("party_themes.id", ondelete="SET NULL"), nullable=True))
    op.add_column("parties", sa.Column("invite_image_key", sa.String(200), nullable=True))
    op.add_column("parties", sa.Column("date_poll", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("parties", sa.Column("date_options", sa.JSON(), nullable=True))
    op.add_column("party_guests", sa.Column("companions", sa.JSON(), nullable=True))
    op.add_column("party_guests", sa.Column("date_votes", sa.JSON(), nullable=True))

    # What was there before: a +1 allowed, a +1 brought, whose party.
    bind = op.get_bind()
    parties = sa.table("parties", sa.column("id", sa.Uuid()), sa.column("plus_one", sa.Boolean()), sa.column("bring", sa.String()), sa.column("person_id", sa.Uuid()), sa.column("person_ids", sa.JSON()))
    for row in bind.execute(sa.select(parties.c.id, parties.c.plus_one, parties.c.person_id)).all():
        bind.execute(parties.update().where(parties.c.id == row.id).values(bring="one" if row.plus_one else "none", person_ids=[str(row.person_id)] if row.person_id else None))
    guests = sa.table("party_guests", sa.column("id", sa.Uuid()), sa.column("plus_first_name", sa.String()), sa.column("plus_last_name", sa.String()), sa.column("plus_allergies", sa.String()), sa.column("companions", sa.JSON()))
    for row in bind.execute(sa.select(guests.c.id, guests.c.plus_first_name, guests.c.plus_last_name, guests.c.plus_allergies).where(guests.c.plus_first_name.is_not(None))).all():
        bind.execute(guests.update().where(guests.c.id == row.id).values(companions=[{"first_name": row.plus_first_name, "last_name": row.plus_last_name or "", "child": False, "allergies": row.plus_allergies or ""}]))
    op.drop_column("parties", "plus_one")
    for col in ("plus_first_name", "plus_last_name", "plus_allergies"):
        op.drop_column("party_guests", col)


def downgrade() -> None:
    op.add_column("parties", sa.Column("plus_one", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("party_guests", sa.Column("plus_first_name", sa.String(80), nullable=True))
    op.add_column("party_guests", sa.Column("plus_last_name", sa.String(80), nullable=True))
    op.add_column("party_guests", sa.Column("plus_allergies", sa.String(300), nullable=False, server_default=""))
    for col in ("date_votes", "companions"):
        op.drop_column("party_guests", col)
    for col in ("date_options", "date_poll", "invite_image_key", "thanks_custom_id", "page_custom_id", "bring", "person_ids"):
        op.drop_column("parties", col)
    op.drop_table("party_themes")

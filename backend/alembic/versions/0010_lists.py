"""Phase I: lists and list items with migration from shopping_items.

Revision ID: 0010_lists
Revises: 0009_allowance
Create Date: 2026-06-12
"""

import uuid

from alembic import op
import sqlalchemy as sa


revision = "0010_lists"
down_revision = "0009_allowance"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "lists",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("family_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("allowed_user_ids", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("linked_task_id", sa.Uuid(), nullable=True),
        sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"]),
        sa.ForeignKeyConstraint(["linked_task_id"], ["tasks.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_lists_family_id", "lists", ["family_id"])

    op.create_table(
        "list_items",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("list_id", sa.Uuid(), nullable=False),
        sa.Column("family_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("category", sa.String(length=20), nullable=True),
        sa.Column("done", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("position", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"]),
        sa.ForeignKeyConstraint(["list_id"], ["lists.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_list_items_list_id", "list_items", ["list_id"])
    op.create_index("ix_list_items_family_id", "list_items", ["family_id"])

    bind = op.get_bind()
    meta = sa.MetaData()

    users = sa.Table("users", meta, sa.Column("id", sa.Uuid()), sa.Column("family_id", sa.Uuid()))
    shopping_items = sa.Table(
        "shopping_items",
        meta,
        sa.Column("id", sa.Uuid()),
        sa.Column("family_id", sa.Uuid()),
        sa.Column("name", sa.String()),
        sa.Column("done", sa.Boolean()),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )
    lists = sa.Table(
        "lists",
        meta,
        sa.Column("id", sa.Uuid()),
        sa.Column("family_id", sa.Uuid()),
        sa.Column("name", sa.String()),
        sa.Column("allowed_user_ids", sa.JSON()),
        sa.Column("created_by", sa.Uuid()),
        sa.Column("linked_task_id", sa.Uuid()),
        sa.Column("archived", sa.Boolean()),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )
    list_items = sa.Table(
        "list_items",
        meta,
        sa.Column("id", sa.Uuid()),
        sa.Column("list_id", sa.Uuid()),
        sa.Column("family_id", sa.Uuid()),
        sa.Column("name", sa.String()),
        sa.Column("category", sa.String()),
        sa.Column("done", sa.Boolean()),
        sa.Column("position", sa.Integer()),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )

    family_ids = [r[0] for r in bind.execute(sa.select(sa.distinct(shopping_items.c.family_id))).fetchall()]

    for family_id in family_ids:
        creator_row = bind.execute(
            sa.select(users.c.id).where(users.c.family_id == family_id).order_by(users.c.id).limit(1)
        ).first()
        if creator_row is None:
            continue

        list_id = uuid.uuid4()
        bind.execute(
            lists.insert().values(
                id=list_id,
                family_id=family_id,
                name="Shopping",
                allowed_user_ids=[],
                created_by=creator_row[0],
                linked_task_id=None,
                archived=False,
            )
        )

        rows = bind.execute(
            sa.select(
                shopping_items.c.name,
                shopping_items.c.done,
                shopping_items.c.created_at,
            )
            .where(shopping_items.c.family_id == family_id)
            .order_by(shopping_items.c.created_at, shopping_items.c.id)
        ).fetchall()

        for position, row in enumerate(rows):
            bind.execute(
                list_items.insert().values(
                    id=uuid.uuid4(),
                    list_id=list_id,
                    family_id=family_id,
                    name=row[0],
                    category=None,
                    done=bool(row[1]),
                    position=position,
                    created_at=row[2],
                )
            )

    op.drop_table("shopping_items")


def downgrade() -> None:
    op.create_table(
        "shopping_items",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("done", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    bind = op.get_bind()
    meta = sa.MetaData()

    lists = sa.Table(
        "lists",
        meta,
        sa.Column("id", sa.Uuid()),
        sa.Column("family_id", sa.Uuid()),
        sa.Column("name", sa.String()),
    )
    list_items = sa.Table(
        "list_items",
        meta,
        sa.Column("id", sa.Uuid()),
        sa.Column("list_id", sa.Uuid()),
        sa.Column("family_id", sa.Uuid()),
        sa.Column("name", sa.String()),
        sa.Column("done", sa.Boolean()),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )
    shopping_items = sa.Table(
        "shopping_items",
        meta,
        sa.Column("id", sa.Uuid()),
        sa.Column("family_id", sa.Uuid()),
        sa.Column("name", sa.String()),
        sa.Column("done", sa.Boolean()),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )

    shopping_lists = bind.execute(sa.select(lists.c.id, lists.c.family_id).where(lists.c.name == "Shopping")).fetchall()
    for list_id, family_id in shopping_lists:
        items = bind.execute(
            sa.select(list_items.c.name, list_items.c.done, list_items.c.created_at).where(list_items.c.list_id == list_id)
        ).fetchall()
        for name, done, created_at in items:
            bind.execute(
                shopping_items.insert().values(
                    id=uuid.uuid4(),
                    family_id=family_id,
                    name=name,
                    done=bool(done),
                    created_at=created_at,
                )
            )

    op.drop_index("ix_list_items_family_id", table_name="list_items")
    op.drop_index("ix_list_items_list_id", table_name="list_items")
    op.drop_table("list_items")
    op.drop_index("ix_lists_family_id", table_name="lists")
    op.drop_table("lists")

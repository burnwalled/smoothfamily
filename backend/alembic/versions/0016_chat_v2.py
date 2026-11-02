"""Phase Q: chat v2 — user-created conversations, emoji, image attachments.

⚠️  Contains a data migration: existing family-channel messages → one
"Family" conversation; each DM pair → a 2-person conversation.
Run scripts/backup.sh before applying this migration.

Revision ID: 0016_chat_v2
Revises: 0015_cooking_steps
Create Date: 2026-06-12
"""

import uuid as _uuid
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa

revision = "0016_chat_v2"
down_revision = "0015_cooking_steps"
branch_labels = None
depends_on = None

_NOW = datetime.now(timezone.utc)


def upgrade() -> None:
    op.create_table(
        "conversations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("family_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(80), nullable=False, server_default=""),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_conversations_family_id", "conversations", ["family_id"])

    op.create_table(
        "conversation_members",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("conversation_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("last_read_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("conversation_id", "user_id", name="uq_conv_member"),
    )
    op.create_index("ix_conversation_members_conversation_id", "conversation_members", ["conversation_id"])
    op.create_index("ix_conversation_members_user_id", "conversation_members", ["user_id"])

    # Add new columns to chat_messages
    op.add_column("chat_messages", sa.Column("conversation_id", sa.Uuid(), nullable=True))
    op.add_column("chat_messages", sa.Column("media_id", sa.Uuid(), nullable=True))

    # ── Data migration ──────────────────────────────────────────────────────────
    conn = op.get_bind()

    families = conn.execute(sa.text("SELECT id FROM families")).fetchall()
    for (family_id,) in families:
        fid = str(family_id)
        members = conn.execute(
            sa.text("SELECT id FROM users WHERE family_id = :fid"), {"fid": fid}
        ).fetchall()
        if not members:
            continue
        creator_id = str(members[0][0])

        # Family conversation
        family_conv_id = str(_uuid.uuid4())
        conn.execute(
            sa.text(
                "INSERT INTO conversations (id, family_id, name, created_by, created_at)"
                " VALUES (:id, :fid, :name, :creator, :now)"
            ),
            {"id": family_conv_id, "fid": fid, "name": "Family", "creator": creator_id, "now": _NOW},
        )
        for (member_id,) in members:
            uid = str(member_id)
            read_at = conn.execute(
                sa.text("SELECT last_read_at FROM chat_reads WHERE user_id = :uid AND peer_key = 'family'"),
                {"uid": uid},
            ).scalar_one_or_none()
            conn.execute(
                sa.text(
                    "INSERT INTO conversation_members (id, conversation_id, user_id, joined_at, last_read_at)"
                    " VALUES (:id, :cid, :uid, :now, :rat)"
                ),
                {"id": str(_uuid.uuid4()), "cid": family_conv_id, "uid": uid, "now": _NOW, "rat": read_at},
            )
        conn.execute(
            sa.text(
                "UPDATE chat_messages SET conversation_id = :cid"
                " WHERE family_id = :fid AND recipient_id IS NULL"
            ),
            {"cid": family_conv_id, "fid": fid},
        )

        # DM pairs: normalise pair key so we don't double-count
        dm_rows = conn.execute(
            sa.text(
                "SELECT DISTINCT sender_id, recipient_id FROM chat_messages"
                " WHERE family_id = :fid AND recipient_id IS NOT NULL"
            ),
            {"fid": fid},
        ).fetchall()
        seen_pairs: set[frozenset] = set()
        for (sid, rid) in dm_rows:
            pair = frozenset([str(sid), str(rid)])
            if pair in seen_pairs:
                continue
            seen_pairs.add(pair)
            user_a, user_b = sorted([str(sid), str(rid)])

            dm_conv_id = str(_uuid.uuid4())
            conn.execute(
                sa.text(
                    "INSERT INTO conversations (id, family_id, name, created_by, created_at)"
                    " VALUES (:id, :fid, :name, :creator, :now)"
                ),
                {"id": dm_conv_id, "fid": fid, "name": "", "creator": user_a, "now": _NOW},
            )
            for uid in [user_a, user_b]:
                peer = user_b if uid == user_a else user_a
                read_at = conn.execute(
                    sa.text("SELECT last_read_at FROM chat_reads WHERE user_id = :uid AND peer_key = :peer"),
                    {"uid": uid, "peer": peer},
                ).scalar_one_or_none()
                conn.execute(
                    sa.text(
                        "INSERT INTO conversation_members (id, conversation_id, user_id, joined_at, last_read_at)"
                        " VALUES (:id, :cid, :uid, :now, :rat)"
                    ),
                    {"id": str(_uuid.uuid4()), "cid": dm_conv_id, "uid": uid, "now": _NOW, "rat": read_at},
                )
            conn.execute(
                sa.text(
                    "UPDATE chat_messages SET conversation_id = :cid"
                    " WHERE family_id = :fid AND recipient_id IS NOT NULL"
                    " AND ((sender_id = :ua AND recipient_id = :ub)"
                    "   OR (sender_id = :ub AND recipient_id = :ua))"
                ),
                {"cid": dm_conv_id, "fid": fid, "ua": user_a, "ub": user_b},
            )

    # Drop old structures
    op.drop_index("ix_chat_reads_user_id", table_name="chat_reads")
    op.drop_table("chat_reads")

    with op.batch_alter_table("chat_messages") as batch_op:
        batch_op.drop_column("recipient_id")


def downgrade() -> None:
    with op.batch_alter_table("chat_messages") as batch_op:
        batch_op.drop_column("conversation_id")
        batch_op.drop_column("media_id")

    op.drop_index("ix_conversation_members_user_id", table_name="conversation_members")
    op.drop_index("ix_conversation_members_conversation_id", table_name="conversation_members")
    op.drop_table("conversation_members")

    op.drop_index("ix_conversations_family_id", table_name="conversations")
    op.drop_table("conversations")

    # Recreate chat_reads stub (empty)
    op.create_table(
        "chat_reads",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("peer_key", sa.String(length=50), nullable=False),
        sa.Column("last_read_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "peer_key", name="uq_chat_reads_user_peer"),
    )
    op.create_index("ix_chat_reads_user_id", "chat_reads", ["user_id"])

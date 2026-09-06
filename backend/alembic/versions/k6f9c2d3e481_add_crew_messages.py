"""add crew communication messages

Revision ID: k6f9c2d3e481
Revises: j5e8f1a2b347
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "k6f9c2d3e481"
down_revision: Union[str, Sequence[str], None] = "j5e8f1a2b347"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "crew_messages",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("messageId", sa.UUID(), nullable=False),
        sa.Column("clientEventId", sa.UUID(), nullable=False),
        sa.Column("boat_id", sa.UUID(), nullable=False),
        sa.Column("source_user_id", sa.UUID(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=16), server_default="QUEUED", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("dispatched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["boat_id"], ["boats.id"]),
        sa.ForeignKeyConstraint(["source_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("messageId", name="uq_crew_messages_message_id"),
        sa.UniqueConstraint("clientEventId", name="uq_crew_messages_client_event_id"),
    )
    op.create_index("ix_crew_messages_boat_id", "crew_messages", ["boat_id"])
    op.create_index("ix_crew_messages_status", "crew_messages", ["status"])


def downgrade() -> None:
    op.drop_index("ix_crew_messages_status", table_name="crew_messages")
    op.drop_index("ix_crew_messages_boat_id", table_name="crew_messages")
    op.drop_table("crew_messages")

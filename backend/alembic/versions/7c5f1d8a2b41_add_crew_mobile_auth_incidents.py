"""add crew mobile auth and incidents

Revision ID: 7c5f1d8a2b41
Revises: 335c409c3e91
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "7c5f1d8a2b41"
down_revision: Union[str, Sequence[str], None] = "335c409c3e91"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    user_role = sa.Enum("crew", "rescuer", "operator", "admin", name="user_role")
    incident_type = sa.Enum("SOS", "MOB", "FALL", name="incident_type")
    incident_status = sa.Enum("open", "acknowledged", "resolved", name="incident_status")
    op.create_table(
        "users",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("username", sa.String(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("role", user_role, nullable=False),
        sa.Column("assigned_boat_id", sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(["assigned_boat_id"], ["boats.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("username"),
    )
    op.create_table(
        "incidents",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("incidentId", sa.UUID(), nullable=False),
        sa.Column("clientEventId", sa.UUID(), nullable=False),
        sa.Column("type", incident_type, nullable=False),
        sa.Column("boat_id", sa.UUID(), nullable=False),
        sa.Column("source_latitude", sa.Numeric(9, 6), nullable=True),
        sa.Column("source_longitude", sa.Numeric(9, 6), nullable=True),
        sa.Column("status", incident_status, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_offline", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["boat_id"], ["boats.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("incidentId"),
        sa.UniqueConstraint("clientEventId"),
    )
    op.create_index("ix_incidents_boat_id", "incidents", ["boat_id"])
    op.create_index("ix_incidents_status", "incidents", ["status"])


def downgrade() -> None:
    op.drop_index("ix_incidents_status", table_name="incidents")
    op.drop_index("ix_incidents_boat_id", table_name="incidents")
    op.drop_table("incidents")
    op.drop_table("users")
    bind = op.get_bind()
    sa.Enum(name="incident_status").drop(bind, checkfirst=True)
    sa.Enum(name="incident_type").drop(bind, checkfirst=True)
    sa.Enum(name="user_role").drop(bind, checkfirst=True)

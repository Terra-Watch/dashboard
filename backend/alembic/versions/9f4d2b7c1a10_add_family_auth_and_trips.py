"""add family authentication, assignments, OTP records and trips

Revision ID: 9f4d2b7c1a10
Revises: 7c5f1d8a2b41
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "9f4d2b7c1a10"
down_revision: Union[str, Sequence[str], None] = "7c5f1d8a2b41"
branch_labels = None
depends_on = None


def upgrade() -> None:
    role = sa.Enum("FAMILY", "FISHERMAN", "OPERATOR", "ADMIN", "CREW", "RESCUER", name="user_role")
    trip_status = sa.Enum("ACTIVE", "COMPLETED", "INTERRUPTED", name="trip_status")

    op.create_table(
        "users",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("phone", sa.String(), nullable=True),
        sa.Column("hashed_password", sa.String(), nullable=False),
        sa.Column("role", role, nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_index("ix_users_email", "users", ["email"])
    op.create_index("ix_users_role", "users", ["role"])

    op.create_table(
        "user_boats",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("boat_id", sa.UUID(), nullable=False),
        sa.Column("relationship_type", sa.String(), nullable=False, server_default="FAMILY_CONTACT"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["boat_id"], ["boats.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "boat_id"),
    )

    op.create_table(
        "otp_verifications",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("identifier", sa.String(), nullable=False),
        sa.Column("code_hash", sa.String(), nullable=False),
        sa.Column("purpose", sa.String(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("max_attempts", sa.Integer(), nullable=False),
        sa.Column("is_used", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_otp_identifier", "otp_verifications", ["identifier"])
    op.create_index("ix_otp_expires_at", "otp_verifications", ["expires_at"])

    op.create_table(
        "trips",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("boat_id", sa.UUID(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("departure_port", sa.String(), nullable=False),
        sa.Column("arrival_port", sa.String(), nullable=True),
        sa.Column("start_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", trip_status, nullable=False),
        sa.Column("distance_nautical_miles", sa.Numeric(6, 2), nullable=True),
        sa.Column("waypoints", sa.JSON(), nullable=True),
        sa.Column("safety_warnings", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(["boat_id"], ["boats.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_trips_boat_id", "trips", ["boat_id"])
    op.create_index("ix_trips_status", "trips", ["status"])
    op.create_index("ix_trips_start_time", "trips", ["start_time"])


def downgrade() -> None:
    op.drop_index("ix_trips_start_time", table_name="trips")
    op.drop_index("ix_trips_status", table_name="trips")
    op.drop_index("ix_trips_boat_id", table_name="trips")
    op.drop_table("trips")
    op.drop_index("ix_otp_expires_at", table_name="otp_verifications")
    op.drop_index("ix_otp_identifier", table_name="otp_verifications")
    op.drop_table("otp_verifications")
    op.drop_table("user_boats")
    op.drop_index("ix_users_role", table_name="users")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
    sa.Enum(name="trip_status").drop(op.get_bind(), checkfirst=True)
    sa.Enum(name="user_role").drop(op.get_bind(), checkfirst=True)

"""add devices and operator boat scope

Revision ID: h3c6e9a1b425
Revises: g2b5d8f0a314
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "h3c6e9a1b425"
down_revision = "g2b5d8f0a314"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("boats", "nodeId", existing_type=sa.Integer(), nullable=True)
    op.create_table(
        "boat_devices",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("device_id", sa.String(), nullable=False),
        sa.Column("device_type", sa.String(), nullable=False),
        sa.Column("node_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="UNASSOCIATED"),
        sa.Column("boat_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("registered_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("associated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("unassociated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_seen", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["boat_id"], ["boats.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("device_id", name="uq_boat_devices_device_id"),
    )
    op.create_index("ix_boat_devices_status", "boat_devices", ["status"])
    op.create_index("ix_boat_devices_boat_id", "boat_devices", ["boat_id"])
    op.create_table(
        "operator_boat_access",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("boat_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="ACTIVE"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["boat_id"], ["boats.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    # Existing Boat.nodeId values are preserved as registered device identities.
    op.execute(sa.text("""
        INSERT INTO boat_devices (id, device_id, device_type, node_id, status, boat_id, registered_at, associated_at, created_at, updated_at)
        SELECT gen_random_uuid(), 'node-' || b."nodeId", 'BOATNODE', b."nodeId", 'ACTIVE', b.id, b."registeredAt", b."registeredAt", now(), now()
        FROM boats b
        WHERE b."nodeId" IS NOT NULL
    """))


def downgrade() -> None:
    op.drop_table("operator_boat_access")
    op.drop_index("ix_boat_devices_boat_id", table_name="boat_devices")
    op.drop_index("ix_boat_devices_status", table_name="boat_devices")
    op.drop_table("boat_devices")
    op.alter_column("boats", "nodeId", existing_type=sa.Integer(), nullable=False)

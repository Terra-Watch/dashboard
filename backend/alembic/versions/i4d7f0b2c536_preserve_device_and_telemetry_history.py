"""preserve device associations and telemetry device identity

Revision ID: i4d7f0b2c536
Revises: h3c6e9a1b425
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "i4d7f0b2c536"
down_revision = "h3c6e9a1b425"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "device_associations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("device_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("boat_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["device_id"], ["boat_devices.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["boat_id"], ["boats.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_device_associations_device_id", "device_associations", ["device_id"])
    op.add_column("telemetry", sa.Column("device_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_index("ix_telemetry_device_id", "telemetry", ["device_id"])
    op.create_foreign_key("fk_telemetry_device_id", "telemetry", "boat_devices", ["device_id"], ["id"], ondelete="SET NULL")
    op.execute(sa.text("""
        INSERT INTO device_associations (id, device_id, boat_id, status, started_at, created_at)
        SELECT gen_random_uuid(), d.id, d.boat_id, 'ACTIVE', COALESCE(d.associated_at, d.registered_at), now()
        FROM boat_devices d
        WHERE d.boat_id IS NOT NULL AND d.status = 'ACTIVE'
    """))


def downgrade() -> None:
    op.drop_constraint("fk_telemetry_device_id", "telemetry", type_="foreignkey")
    op.drop_index("ix_telemetry_device_id", table_name="telemetry")
    op.drop_column("telemetry", "device_id")
    op.drop_index("ix_device_associations_device_id", table_name="device_associations")
    op.drop_table("device_associations")

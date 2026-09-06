"""normalize legacy boat relationship values

Revision ID: g2b5d8f0a314
Revises: f1a4c7e9b203
"""
from alembic import op
import sqlalchemy as sa

revision = "g2b5d8f0a314"
down_revision = "f1a4c7e9b203"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    bind.execute(sa.text("UPDATE user_boats ub SET relationship_type = 'FAMILY_VIEWER' FROM users u WHERE u.id = ub.user_id AND u.role = 'FAMILY' AND ub.relationship_type = 'FAMILY_CONTACT'"))
    bind.execute(sa.text("UPDATE user_boats ub SET relationship_type = 'CREW' FROM users u WHERE u.id = ub.user_id AND u.role IN ('FISHERMAN', 'CREW') AND ub.relationship_type = 'FAMILY_CONTACT'"))


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(sa.text("UPDATE user_boats SET relationship_type = 'FAMILY_CONTACT' WHERE relationship_type IN ('FAMILY_VIEWER', 'CREW')"))

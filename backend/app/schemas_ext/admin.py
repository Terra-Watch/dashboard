"""Staff administration: deactivating accounts (instead of deleting people who have history) and handling access requests."""
from sqlalchemy import text


def ensure(db) -> None:
    db.execute(text('ALTER TABLE resq_users ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ'))
    db.execute(text('ALTER TABLE resq_access_requests ADD COLUMN IF NOT EXISTS handled_at TIMESTAMPTZ'))
    db.execute(text('ALTER TABLE resq_access_requests ADD COLUMN IF NOT EXISTS handled_by INTEGER REFERENCES resq_users(id) ON DELETE SET NULL'))

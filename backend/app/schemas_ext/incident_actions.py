"""Questions staff ask a reporter, and the merge record for duplicate incidents. Idempotent."""
from sqlalchemy import text


def ensure(db) -> None:
    db.execute(text('''CREATE TABLE IF NOT EXISTS resq_incident_questions (
        id BIGSERIAL PRIMARY KEY,
        incident_id INTEGER NOT NULL REFERENCES resq_incidents(id) ON DELETE CASCADE,
        asked_by INTEGER REFERENCES resq_users(id) ON DELETE SET NULL,
        question VARCHAR(300) NOT NULL,
        asked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        answer VARCHAR(1000),
        answered_at TIMESTAMPTZ
    )'''))
    db.execute(text('CREATE INDEX IF NOT EXISTS resq_incident_questions_incident_idx ON resq_incident_questions (incident_id, asked_at)'))
    db.execute(text('ALTER TABLE resq_incidents ADD COLUMN IF NOT EXISTS merged_into INTEGER REFERENCES resq_incidents(id) ON DELETE SET NULL'))

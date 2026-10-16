"""Shift handover notes: what the outgoing shift wants the incoming shift to know. Idempotent."""
from sqlalchemy import text


def ensure(db) -> None:
    db.execute(text('''CREATE TABLE IF NOT EXISTS resq_handover_notes (
        id BIGSERIAL PRIMARY KEY,
        author_id INTEGER NOT NULL REFERENCES resq_users(id),
        state VARCHAR(2) NOT NULL,
        body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
        incident_id INTEGER REFERENCES resq_incidents(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        acknowledged_by INTEGER REFERENCES resq_users(id),
        acknowledged_at TIMESTAMPTZ
    )'''))
    db.execute(text('CREATE INDEX IF NOT EXISTS resq_handover_notes_feed ON resq_handover_notes (state, created_at DESC)'))

"""What people say about an active fire (docs/23): still burning, handled, out, or not a forest fire. A detection newer than the mark reopens the fire."""
from sqlalchemy import text


def ensure(db) -> None:
    for sql in (
        """CREATE TABLE IF NOT EXISTS resq_fire_marks (
            id BIGSERIAL PRIMARY KEY,
            fire_id TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('burning','handled','out','not_forest_fire')),
            note TEXT NOT NULL DEFAULT '',
            user_id BIGINT,
            lat DOUBLE PRECISION NOT NULL,
            lon DOUBLE PRECISION NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )""",
        'CREATE INDEX IF NOT EXISTS resq_fire_marks_fire ON resq_fire_marks (fire_id, created_at DESC)',
    ):
        db.execute(text(sql))

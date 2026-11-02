"""Where a report points: the observer position, compass direction and distance band a citizen sent with a report. Idempotent."""
from sqlalchemy import text


def ensure(db) -> None:
    db.execute(text('''CREATE TABLE IF NOT EXISTS resq_report_bearings (
        incident_id INTEGER PRIMARY KEY REFERENCES resq_incidents(id) ON DELETE CASCADE,
        observer_lat DOUBLE PRECISION NOT NULL CHECK (observer_lat BETWEEN -90 AND 90),
        observer_lon DOUBLE PRECISION NOT NULL CHECK (observer_lon BETWEEN -180 AND 180),
        observer_accuracy_m REAL CHECK (observer_accuracy_m IS NULL OR observer_accuracy_m >= 0),
        bearing_deg REAL NOT NULL CHECK (bearing_deg >= 0 AND bearing_deg < 360),
        source VARCHAR(8) NOT NULL CHECK (source IN ('compass','rose')),
        distance_band VARCHAR(8) NOT NULL CHECK (distance_band IN ('close','medium','far','unsure')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )'''))

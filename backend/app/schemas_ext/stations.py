"""Lookout stations: the registry, the readings the gateway bridge sends, and the node ids heard that nobody registered. Idempotent."""
from sqlalchemy import text


def ensure(db) -> None:
    db.execute(text('''CREATE TABLE IF NOT EXISTS resq_stations (
        id SERIAL PRIMARY KEY,
        node_id INTEGER NOT NULL UNIQUE CHECK (node_id BETWEEN 1 AND 253),
        name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
        latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
        longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
        state VARCHAR(2) NOT NULL,
        community_id INTEGER,
        kind TEXT NOT NULL DEFAULT 'lookout',
        expected_interval_s INTEGER NOT NULL DEFAULT 600 CHECK (expected_interval_s >= 5),
        active BOOLEAN NOT NULL DEFAULT TRUE,
        installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        notes TEXT NOT NULL DEFAULT ''
    )'''))
    db.execute(text('''CREATE TABLE IF NOT EXISTS resq_station_readings (
        id BIGSERIAL PRIMARY KEY,
        station_id INTEGER NOT NULL REFERENCES resq_stations(id) ON DELETE CASCADE,
        received_at TIMESTAMPTZ NOT NULL,
        node_seq INTEGER NOT NULL DEFAULT 0,
        rssi SMALLINT, snr REAL, hops SMALLINT,
        temp_c REAL, humidity_pct REAL, pm25 INTEGER, pm10 INTEGER, battery_mv INTEGER,
        flags SMALLINT NOT NULL DEFAULT 0,
        UNIQUE (station_id, received_at, node_seq)
    )'''))
    db.execute(text('CREATE INDEX IF NOT EXISTS resq_station_readings_latest ON resq_station_readings (station_id, received_at DESC)'))
    db.execute(text('''CREATE TABLE IF NOT EXISTS resq_station_unknown (
        node_id INTEGER PRIMARY KEY, first_heard TIMESTAMPTZ NOT NULL DEFAULT now(), last_heard TIMESTAMPTZ NOT NULL DEFAULT now(), heard INTEGER NOT NULL DEFAULT 1
    )'''))

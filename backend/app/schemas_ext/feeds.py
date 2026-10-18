"""Tables for live data feeds (satellite hotspots, weather context)."""
from sqlalchemy import text


def ensure(db) -> None:
    for sql in (
        """CREATE TABLE IF NOT EXISTS resq_hotspots (
            id BIGSERIAL PRIMARY KEY,
            satellite TEXT NOT NULL,
            acq_datetime TIMESTAMPTZ NOT NULL,
            latitude DOUBLE PRECISION NOT NULL,
            longitude DOUBLE PRECISION NOT NULL,
            brightness DOUBLE PRECISION,
            frp DOUBLE PRECISION,
            confidence TEXT NOT NULL DEFAULT 'nominal',
            daynight VARCHAR(1),
            state VARCHAR(2),
            fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (satellite, acq_datetime, latitude, longitude)
        )""",
        'CREATE INDEX IF NOT EXISTS resq_hotspots_acq ON resq_hotspots (acq_datetime)',
        'CREATE INDEX IF NOT EXISTS resq_hotspots_latlon ON resq_hotspots (latitude, longitude)',
        """CREATE TABLE IF NOT EXISTS resq_weather_context (
            id BIGSERIAL PRIMARY KEY,
            lat_cell DOUBLE PRECISION NOT NULL,
            lon_cell DOUBLE PRECISION NOT NULL,
            valid_time TIMESTAMPTZ NOT NULL,
            wind_speed_ms DOUBLE PRECISION NOT NULL,
            wind_dir_deg DOUBLE PRECISION NOT NULL,
            temperature_c DOUBLE PRECISION,
            humidity_pct DOUBLE PRECISION,
            source TEXT NOT NULL CHECK (source IN ('open-meteo','era5')),
            fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            UNIQUE (lat_cell, lon_cell, valid_time, source)
        )""",
        'CREATE INDEX IF NOT EXISTS resq_weather_cell ON resq_weather_context (lat_cell, lon_cell, valid_time)',
    ):
        db.execute(text(sql))

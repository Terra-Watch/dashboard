"""Official notices (D-09): notice table plus every saved revision. Idempotent."""
from sqlalchemy import text


def ensure(db) -> None:
    db.execute(text('''CREATE TABLE IF NOT EXISTS resq_notices (
        id BIGSERIAL PRIMARY KEY,
        title VARCHAR(120) NOT NULL,
        body VARCHAR(1000) NOT NULL,
        severity TEXT NOT NULL,
        regions TEXT[] NOT NULL,
        area_geojson JSONB,
        starts_at TIMESTAMPTZ NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        author_id INTEGER NOT NULL REFERENCES resq_users(id),
        approver_id INTEGER REFERENCES resq_users(id),
        return_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        published_at TIMESTAMPTZ,
        withdrawn_at TIMESTAMPTZ,
        withdrawn_reason TEXT,
        CONSTRAINT resq_notices_status_chk CHECK (status IN ('draft','pending_approval','published','withdrawn')),
        CONSTRAINT resq_notices_severity_chk CHECK (severity IN ('info','advisory','warning')),
        CONSTRAINT resq_notices_regions_chk CHECK (cardinality(regions) >= 1),
        CONSTRAINT resq_notices_window_chk CHECK (expires_at > starts_at)
    )'''))
    db.execute(text('''CREATE TABLE IF NOT EXISTS resq_notice_revisions (
        id BIGSERIAL PRIMARY KEY,
        notice_id BIGINT NOT NULL REFERENCES resq_notices(id) ON DELETE CASCADE,
        revision_no INTEGER NOT NULL,
        title VARCHAR(120) NOT NULL,
        body VARCHAR(1000) NOT NULL,
        severity TEXT NOT NULL,
        regions TEXT[] NOT NULL,
        edited_by INTEGER REFERENCES resq_users(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (notice_id, revision_no)
    )'''))
    db.execute(text('CREATE INDEX IF NOT EXISTS resq_notices_status_idx ON resq_notices (status, expires_at)'))

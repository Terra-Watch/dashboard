import bcrypt
from sqlalchemy import create_engine, text
from ..core.config import DATABASE_URL

engine = create_engine(DATABASE_URL, pool_pre_ping=True)

def init_db() -> None:
    with engine.begin() as db:
        db.execute(text('CREATE EXTENSION IF NOT EXISTS postgis'))
        statements = [
            """CREATE TABLE IF NOT EXISTS resq_users (id SERIAL PRIMARY KEY, email VARCHAR(255) UNIQUE NOT NULL, name VARCHAR(255) NOT NULL, password_hash VARCHAR(255) NOT NULL, role VARCHAR(20) NOT NULL CHECK (role IN ('admin','officer','viewer')), created_at TIMESTAMPTZ NOT NULL DEFAULT now())""",
            """CREATE TABLE IF NOT EXISTS resq_access_requests (id SERIAL PRIMARY KEY, name TEXT NOT NULL, designation TEXT NOT NULL, department TEXT NOT NULL, email TEXT NOT NULL, state TEXT NOT NULL, reason TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())""",
            """CREATE TABLE IF NOT EXISTS resq_password_reset_requests (id BIGSERIAL PRIMARY KEY, email TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now())""",
            """CREATE TABLE IF NOT EXISTS resq_plans (id SERIAL PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES resq_users(id), plan_date DATE NOT NULL, region TEXT NOT NULL, teams INTEGER NOT NULL, priority_cells INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'draft', created_at TIMESTAMPTZ NOT NULL DEFAULT now())""",
            """CREATE TABLE IF NOT EXISTS resq_incidents (id SERIAL PRIMARY KEY, reporter_id INTEGER NOT NULL REFERENCES resq_users(id), source TEXT NOT NULL, size TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'reported', created_at TIMESTAMPTZ NOT NULL DEFAULT now())""",
            """CREATE TABLE IF NOT EXISTS resq_alerts (id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES resq_users(id), kind TEXT NOT NULL, message TEXT NOT NULL, read BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now())""",
            """CREATE TABLE IF NOT EXISTS resq_alert_rules (id SERIAL PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES resq_users(id), name TEXT NOT NULL, kind TEXT NOT NULL, enabled BOOLEAN NOT NULL DEFAULT true, channel TEXT NOT NULL DEFAULT 'in-app', created_at TIMESTAMPTZ NOT NULL DEFAULT now())""",
            """CREATE TABLE IF NOT EXISTS resq_user_settings (user_id INTEGER PRIMARY KEY REFERENCES resq_users(id) ON DELETE CASCADE, locale TEXT NOT NULL DEFAULT 'English', theme TEXT NOT NULL DEFAULT 'auto', email_alerts BOOLEAN NOT NULL DEFAULT false, push_alerts BOOLEAN NOT NULL DEFAULT false, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())""",
            """CREATE TABLE IF NOT EXISTS forecast_runs (id BIGSERIAL PRIMARY KEY, forecast_date DATE NOT NULL, mode VARCHAR(10) NOT NULL CHECK (mode IN ('replay','live')), model_version VARCHAR(120) NOT NULL, grid_version VARCHAR(120) NOT NULL, status VARCHAR(20) NOT NULL, issued_at TIMESTAMPTZ NOT NULL DEFAULT now(), data_cutoffs JSONB NOT NULL DEFAULT '{}'::jsonb, bridged_days JSONB NOT NULL DEFAULT '[]'::jsonb, UNIQUE (forecast_date, mode, model_version))""",
            """CREATE TABLE IF NOT EXISTS cells (id BIGINT PRIMARY KEY, grid_version VARCHAR(120) NOT NULL, state VARCHAR(3) NOT NULL, place_name TEXT, geom geometry(Polygon,4326), centroid geometry(Point,4326))""",
            """CREATE TABLE IF NOT EXISTS cell_scores (run_id BIGINT NOT NULL REFERENCES forecast_runs(id) ON DELETE CASCADE, cell_id BIGINT NOT NULL REFERENCES cells(id), rank INTEGER NOT NULL, rank_percentile DOUBLE PRECISION NOT NULL, band VARCHAR(20) NOT NULL, drivers JSONB NOT NULL DEFAULT '[]'::jsonb, PRIMARY KEY (run_id, cell_id))""",
        ]
        for statement in statements: db.execute(text(statement))
        db.execute(text('ALTER TABLE resq_incidents ADD COLUMN IF NOT EXISTS client_key VARCHAR(120)'))
        db.execute(text('CREATE UNIQUE INDEX IF NOT EXISTS resq_incidents_client_key ON resq_incidents (client_key) WHERE client_key IS NOT NULL'))
        db.execute(text('CREATE INDEX IF NOT EXISTS cells_geom_gist ON cells USING GIST (geom)'))
        db.execute(text('CREATE INDEX IF NOT EXISTS cell_scores_run_band ON cell_scores (run_id, band)'))
        db.execute(text('CREATE INDEX IF NOT EXISTS cell_scores_run_rank ON cell_scores (run_id, rank)'))
        users = [('admin@resq.local', 'Forest control', 'admin'), ('officer@resq.local', 'Field officer', 'officer'), ('viewer@resq.local', 'Read-only viewer', 'viewer')]
        for email, name, role in users:
            if not db.execute(text('SELECT 1 FROM resq_users WHERE email=:email'), {'email': email}).first():
                db.execute(text('INSERT INTO resq_users (email,name,password_hash,role) VALUES (:email,:name,:hash,:role)'), {'email': email, 'name': name, 'hash': bcrypt.hashpw(b'resq-demo', bcrypt.gensalt()).decode(), 'role': role})
        db.execute(text("INSERT INTO resq_user_settings (user_id) SELECT id FROM resq_users WHERE NOT EXISTS (SELECT 1 FROM resq_user_settings s WHERE s.user_id=resq_users.id)"))

import os
import secrets

import bcrypt
from sqlalchemy import create_engine, text
from ..core.config import DATABASE_URL
from ..core.security import hash_password_argon2

engine = create_engine(DATABASE_URL, pool_pre_ping=True)


def init_db() -> None:
    with engine.begin() as db:
        db.execute(text('CREATE EXTENSION IF NOT EXISTS postgis'))
        statements = [
            """CREATE TABLE IF NOT EXISTS resq_users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                name VARCHAR(255) NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                role VARCHAR(30) NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )""",
            """CREATE TABLE IF NOT EXISTS resq_user_scopes (
                user_id INTEGER NOT NULL REFERENCES resq_users(id) ON DELETE CASCADE,
                state VARCHAR(2) NOT NULL,
                PRIMARY KEY (user_id, state)
            )""",
            """CREATE TABLE IF NOT EXISTS resq_refresh_tokens (
                id BIGSERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES resq_users(id) ON DELETE CASCADE,
                token_hash VARCHAR(128) UNIQUE NOT NULL,
                issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                expires_at TIMESTAMPTZ NOT NULL,
                revoked_at TIMESTAMPTZ,
                device_id TEXT,
                user_agent TEXT
            )""",
            """CREATE TABLE IF NOT EXISTS resq_invites (
                id BIGSERIAL PRIMARY KEY,
                email VARCHAR(255) NOT NULL,
                role VARCHAR(30) NOT NULL,
                scopes TEXT[] NOT NULL DEFAULT '{}',
                token_hash VARCHAR(128) UNIQUE NOT NULL,
                created_by INTEGER NOT NULL REFERENCES resq_users(id),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                expires_at TIMESTAMPTZ NOT NULL,
                accepted_at TIMESTAMPTZ
            )""",
            """CREATE TABLE IF NOT EXISTS resq_password_resets (
                id BIGSERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES resq_users(id) ON DELETE CASCADE,
                token_hash VARCHAR(128) UNIQUE NOT NULL,
                created_by INTEGER NOT NULL REFERENCES resq_users(id),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                expires_at TIMESTAMPTZ NOT NULL,
                used_at TIMESTAMPTZ
            )""",
            """CREATE TABLE IF NOT EXISTS resq_login_attempts (
                id BIGSERIAL PRIMARY KEY,
                email VARCHAR(255) NOT NULL,
                ip VARCHAR(64) NOT NULL,
                attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                success BOOLEAN NOT NULL
            )""",
            """CREATE TABLE IF NOT EXISTS resq_audit_log (
                id BIGSERIAL PRIMARY KEY,
                occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                user_id INTEGER REFERENCES resq_users(id),
                device_id TEXT,
                action VARCHAR(60) NOT NULL,
                previous_state TEXT,
                entity_type VARCHAR(30) NOT NULL,
                entity_id TEXT NOT NULL,
                metadata JSONB NOT NULL DEFAULT '{}'
            )""",
            """CREATE TABLE IF NOT EXISTS resq_access_requests (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                designation TEXT NOT NULL,
                department TEXT NOT NULL,
                email TEXT NOT NULL,
                state TEXT NOT NULL,
                reason TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )""",
            """CREATE TABLE IF NOT EXISTS resq_password_reset_requests (
                id BIGSERIAL PRIMARY KEY,
                email TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )""",
            """CREATE TABLE IF NOT EXISTS resq_plans (
                id SERIAL PRIMARY KEY,
                owner_id INTEGER NOT NULL REFERENCES resq_users(id),
                plan_date DATE NOT NULL,
                region TEXT NOT NULL,
                teams INTEGER NOT NULL,
                priority_cells INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'draft',
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )""",
            """CREATE TABLE IF NOT EXISTS resq_incidents (
                id SERIAL PRIMARY KEY,
                reporter_id INTEGER NOT NULL REFERENCES resq_users(id),
                source TEXT NOT NULL,
                size TEXT NOT NULL,
                notes TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'reported',
                state VARCHAR(2),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )""",
            """CREATE TABLE IF NOT EXISTS resq_field_reports (
                idempotency_key VARCHAR(120) PRIMARY KEY,
                task_id TEXT NOT NULL,
                incident_id INTEGER REFERENCES resq_incidents(id) ON DELETE SET NULL,
                reporter_id INTEGER REFERENCES resq_users(id) ON DELETE SET NULL,
                note TEXT NOT NULL DEFAULT '',
                photo_name TEXT,
                device_id TEXT NOT NULL,
                state VARCHAR(2),
                captured_at TIMESTAMPTZ NOT NULL,
                received_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )""",
            """CREATE TABLE IF NOT EXISTS resq_alert_rules (
                id SERIAL PRIMARY KEY,
                owner_id INTEGER NOT NULL REFERENCES resq_users(id),
                name TEXT NOT NULL,
                kind TEXT NOT NULL,
                enabled BOOLEAN NOT NULL DEFAULT true,
                channel TEXT NOT NULL DEFAULT 'in-app',
                state VARCHAR(2),
                severity VARCHAR(20) NOT NULL DEFAULT 'warning',
                conditions JSONB NOT NULL DEFAULT '{}',
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )""",
            """CREATE TABLE IF NOT EXISTS resq_alerts (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES resq_users(id),
                rule_id INTEGER REFERENCES resq_alert_rules(id) ON DELETE SET NULL,
                kind TEXT NOT NULL,
                message TEXT NOT NULL,
                state VARCHAR(2),
                severity VARCHAR(20) NOT NULL DEFAULT 'warning',
                status VARCHAR(20) NOT NULL DEFAULT 'generated',
                entity_type VARCHAR(30),
                entity_id TEXT,
                read BOOLEAN NOT NULL DEFAULT false,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )""",
            """CREATE TABLE IF NOT EXISTS resq_user_settings (
                user_id INTEGER PRIMARY KEY REFERENCES resq_users(id) ON DELETE CASCADE,
                locale TEXT NOT NULL DEFAULT 'English',
                theme TEXT NOT NULL DEFAULT 'auto',
                email_alerts BOOLEAN NOT NULL DEFAULT false,
                push_alerts BOOLEAN NOT NULL DEFAULT false,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )""",
            """CREATE TABLE IF NOT EXISTS forecast_runs (
                id BIGSERIAL PRIMARY KEY,
                forecast_date DATE NOT NULL,
                mode VARCHAR(10) NOT NULL CHECK (mode IN ('replay','live')),
                model_version VARCHAR(120) NOT NULL,
                grid_version VARCHAR(120) NOT NULL,
                status VARCHAR(20) NOT NULL,
                issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                data_cutoffs JSONB NOT NULL DEFAULT '{}'::jsonb,
                bridged_days JSONB NOT NULL DEFAULT '[]'::jsonb,
                UNIQUE (forecast_date, mode, model_version)
            )""",
            """CREATE TABLE IF NOT EXISTS cells (
                id BIGINT PRIMARY KEY,
                grid_version VARCHAR(120) NOT NULL,
                state VARCHAR(3) NOT NULL,
                place_name TEXT,
                geom geometry(Polygon,4326),
                centroid geometry(Point,4326)
            )""",
            """CREATE TABLE IF NOT EXISTS cell_scores (
                run_id BIGINT NOT NULL REFERENCES forecast_runs(id) ON DELETE CASCADE,
                cell_id BIGINT NOT NULL REFERENCES cells(id),
                rank INTEGER NOT NULL,
                rank_percentile DOUBLE PRECISION NOT NULL,
                band VARCHAR(20) NOT NULL,
                drivers JSONB NOT NULL DEFAULT '[]'::jsonb,
                PRIMARY KEY (run_id, cell_id)
            )""",
        ]
        for statement in statements:
            db.execute(text(statement))

        # Schema updates and constraints
        db.execute(text("ALTER TABLE resq_users ALTER COLUMN role TYPE VARCHAR(50)"))
        db.execute(text("ALTER TABLE resq_users DROP CONSTRAINT IF EXISTS resq_users_role_check"))
        db.execute(text(
            "ALTER TABLE resq_users ADD CONSTRAINT resq_users_role_check CHECK (role IN "
            "('admin','officer','viewer','range_officer','control_room_operator','field_crew','incident_commander'))"
        ))
        db.execute(text("ALTER TABLE resq_users ADD COLUMN IF NOT EXISTS password_algo VARCHAR(10) NOT NULL DEFAULT 'bcrypt'"))
        db.execute(text("ALTER TABLE resq_users ADD COLUMN IF NOT EXISTS home_state VARCHAR(2)"))

        db.execute(text('ALTER TABLE resq_incidents ADD COLUMN IF NOT EXISTS client_key VARCHAR(120)'))
        db.execute(text('ALTER TABLE resq_incidents ADD COLUMN IF NOT EXISTS state VARCHAR(2)'))
        db.execute(text('ALTER TABLE resq_incidents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now()'))
        db.execute(text('CREATE UNIQUE INDEX IF NOT EXISTS resq_incidents_client_key ON resq_incidents (client_key) WHERE client_key IS NOT NULL'))

        db.execute(text('ALTER TABLE resq_alerts ADD COLUMN IF NOT EXISTS state VARCHAR(2)'))
        db.execute(text("ALTER TABLE resq_alerts ADD COLUMN IF NOT EXISTS severity VARCHAR(20) NOT NULL DEFAULT 'warning'"))
        db.execute(text("ALTER TABLE resq_alerts ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'generated'"))
        db.execute(text('ALTER TABLE resq_alerts ADD COLUMN IF NOT EXISTS entity_type VARCHAR(30)'))
        db.execute(text('ALTER TABLE resq_alerts ADD COLUMN IF NOT EXISTS entity_id TEXT'))
        db.execute(text('ALTER TABLE resq_alerts ADD COLUMN IF NOT EXISTS rule_id INTEGER REFERENCES resq_alert_rules(id) ON DELETE SET NULL'))

        db.execute(text('ALTER TABLE resq_alert_rules ADD COLUMN IF NOT EXISTS state VARCHAR(2)'))
        db.execute(text("ALTER TABLE resq_alert_rules ADD COLUMN IF NOT EXISTS severity VARCHAR(20) NOT NULL DEFAULT 'warning'"))
        db.execute(text("ALTER TABLE resq_alert_rules ADD COLUMN IF NOT EXISTS conditions JSONB NOT NULL DEFAULT '{}'"))

        db.execute(text('CREATE INDEX IF NOT EXISTS resq_refresh_tokens_user_idx ON resq_refresh_tokens (user_id)'))
        db.execute(text('CREATE INDEX IF NOT EXISTS resq_login_attempts_email_idx ON resq_login_attempts (email, attempted_at)'))
        db.execute(text('CREATE INDEX IF NOT EXISTS resq_audit_log_entity_idx ON resq_audit_log (entity_type, entity_id, occurred_at DESC)'))
        db.execute(text('CREATE INDEX IF NOT EXISTS resq_alerts_state_status_idx ON resq_alerts (state, status)'))
        db.execute(text('CREATE INDEX IF NOT EXISTS resq_alerts_dedup_idx ON resq_alerts (entity_type, entity_id, kind, status, created_at DESC)'))
        db.execute(text('CREATE INDEX IF NOT EXISTS cells_geom_gist ON cells USING GIST (geom)'))
        db.execute(text('CREATE INDEX IF NOT EXISTS cell_scores_run_band ON cell_scores (run_id, band)'))
        db.execute(text('CREATE INDEX IF NOT EXISTS cell_scores_run_rank ON cell_scores (run_id, rank)'))

        # Seed standard users
        users = [
            ('admin@resq.local', 'Forest control', 'admin'),
            ('officer@resq.local', 'Field officer', 'officer'),
            ('viewer@resq.local', 'Read-only viewer', 'viewer'),
        ]
        for email, name, role in users:
            if not db.execute(text('SELECT 1 FROM resq_users WHERE email=:email'), {'email': email}).first():
                db.execute(
                    text('INSERT INTO resq_users (email,name,password_hash,role,password_algo) VALUES (:email,:name,:hash,:role,\'bcrypt\')'),
                    {'email': email, 'name': name, 'hash': bcrypt.hashpw(b'resq-demo', bcrypt.gensalt()).decode(), 'role': role},
                )
        db.execute(text("INSERT INTO resq_user_settings (user_id) SELECT id FROM resq_users WHERE NOT EXISTS (SELECT 1 FROM resq_user_settings s WHERE s.user_id=resq_users.id)"))

        # Seed trainee account for local workflow tests
        if not db.execute(text("SELECT 1 FROM resq_users WHERE email='trainee@resq.local'")).first():
            trainee_password = os.getenv('RESQ_TRAINEE_PASSWORD', 'trainee-demo-pass')
            db.execute(
                text(
                    "INSERT INTO resq_users (email,name,password_hash,role,password_algo,home_state) "
                    "VALUES ('trainee@resq.local','Trainee account',:hash,'range_officer','argon2','OD')"
                ),
                {'hash': hash_password_argon2(trainee_password)},
            )
        trainee_id = db.execute(text("SELECT id FROM resq_users WHERE email='trainee@resq.local'")).scalar()
        if trainee_id:
            for state in ('OD', 'CG', 'TS', 'MP', 'MH', 'JH'):
                db.execute(
                    text("INSERT INTO resq_user_scopes (user_id, state) VALUES (:uid, :state) ON CONFLICT DO NOTHING"),
                    {'uid': trainee_id, 'state': state},
                )

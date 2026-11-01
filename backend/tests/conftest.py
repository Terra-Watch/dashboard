import os

# The tests create thousands of users, reports and photos. They run in their own database (<name>_test, made on first use) so the development database stays clean.
# Only a local database is ever touched this way; TEST_DATABASE_URL overrides the choice.
def _use_a_separate_test_database() -> None:
    from pathlib import Path
    from dotenv import dotenv_values
    from sqlalchemy import create_engine, text
    from sqlalchemy.engine import make_url
    explicit = os.environ.get("TEST_DATABASE_URL")
    if explicit:
        os.environ["DATABASE_URL"] = explicit; os.environ.pop("DATABASE_URL_DATABASE_URL", None); return
    url = os.environ.get("DATABASE_URL") or dotenv_values(Path(__file__).resolve().parents[1] / ".env").get("DATABASE_URL")
    if not url or os.environ.get("DATABASE_URL_DATABASE_URL"):
        return
    parsed = make_url(url)
    if parsed.host not in (None, "", "localhost", "127.0.0.1") or not parsed.database or parsed.database.endswith("_test"):
        return
    name = f"{parsed.database}_test"
    admin = create_engine(parsed.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin.connect() as db:
        if not db.execute(text("SELECT 1 FROM pg_database WHERE datname=:n"), {"n": name}).first():
            db.execute(text(f'CREATE DATABASE "{name}"'))
    admin.dispose()
    os.environ["DATABASE_URL"] = parsed.set(database=name).render_as_string(hide_password=False)


_use_a_separate_test_database()

# The test suite signs in as the development accounts, so it opts in explicitly. Production never seeds them.
os.environ.setdefault("RESQ_SEED_DEV_ACCOUNTS", "true")
os.environ.setdefault("RESQ_SECRET_KEY", "test-signing-secret-key-at-least-32-bytes-long")

# The local .env may turn media-integrity reporting on; the tests assume the documented default (off) unless a test sets it itself.
os.environ.setdefault("FIRE_EVIDENCE_REPORT_AUTHENTICITY_ENABLED", "false")

# Likewise for shadow mode and the remote model host: the tests assume results are shown and the model runs in-process unless a test sets otherwise.
os.environ.setdefault("FIRE_EVIDENCE_SHADOW_MODE", "false")
os.environ.setdefault("FIRE_EVIDENCE_REMOTE_URL", "")

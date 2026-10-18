import os
from pathlib import Path
from dotenv import load_dotenv

env_path = Path(__file__).resolve().parents[2] / '.env'
if env_path.exists():
    load_dotenv(env_path)
else:
    load_dotenv()

def normalize_database_url(value: str) -> str:
    """Accept provider-style Postgres URLs while selecting the psycopg SQLAlchemy driver explicitly."""
    if value.startswith('postgres://'):
        return 'postgresql+psycopg://' + value[len('postgres://'):]
    if value.startswith('postgresql://'):
        return 'postgresql+psycopg://' + value[len('postgresql://'):]
    return value


# The production provider names this variable DATABASE_URL_DATABASE_URL; keep DATABASE_URL
# as the local/backward-compatible fallback used by the development setup.
DATABASE_URL = normalize_database_url(os.getenv('DATABASE_URL_DATABASE_URL') or os.getenv('DATABASE_URL', 'postgresql+psycopg://resq:resq@localhost:55432/resq'))
RESQ_SECRET_KEY = os.getenv('RESQ_SECRET_KEY')
_LOCAL_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173']
API_ORIGINS = [origin.strip().rstrip('/') for origin in os.getenv('API_ORIGINS', ','.join(_LOCAL_ORIGINS)).split(',') if origin.strip()]
INGEST_LIVE = os.getenv('INGEST_LIVE', 'false').lower() in ('true', '1')

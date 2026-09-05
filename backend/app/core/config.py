import os
from pathlib import Path


def _load_env_file() -> None:
    for filename in [".env", "backend.env"]:
        env_path = Path(__file__).resolve().parent.parent.parent / filename
        if env_path.exists():
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        key, val = line.split("=", 1)
                        key = key.strip()
                        val = val.strip().strip("'\"")
                        if key not in os.environ:
                            os.environ[key] = val


_load_env_file()


def get_database_url() -> str:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL must be set before database access or migrations")
    return database_url


def get_environment() -> str:
    return os.getenv("JALRI_ENVIRONMENT", "development")


def get_secret_key() -> str:
    return os.getenv("JALRI_SECRET_KEY", "jalari-maritime-secret-key-2026-very-secure-jwt-signing")


def get_token_expire_minutes() -> int:
    return int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))  # 24 hours

import os


def get_database_url() -> str:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL must be set before database access or migrations")
    return database_url


def get_environment() -> str:
    return os.getenv("JALRI_ENVIRONMENT", "production")


def get_secret_key() -> str:
    secret = os.getenv("JALRI_SECRET_KEY")
    if not secret or len(secret) < 32:
        raise RuntimeError("JALRI_SECRET_KEY must be set to at least 32 characters")
    return secret


def get_token_expire_minutes() -> int:
    return int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))  # 24 hours

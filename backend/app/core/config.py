import os


def get_database_url() -> str:
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL must be set before database access or migrations")
    return database_url


def get_jwt_secret() -> str:
    secret = os.getenv("JALARI_JWT_SECRET")
    if not secret:
        raise RuntimeError("JALARI_JWT_SECRET must be set before issuing or validating tokens")
    return secret

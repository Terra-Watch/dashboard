from collections.abc import Generator

from sqlalchemy.orm import Session

from app.core.database import get_db


DbSession = Generator[Session, None, None]


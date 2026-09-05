from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import create_access_token, verify_password
from app.models.user import User


class AuthenticationError(Exception):
    pass


class AuthService:
    def authenticate(self, db: Session, username: str, password: str) -> tuple[User, str]:
        user = db.scalar(select(User).where(User.username == username))
        if user is None or not verify_password(password, user.passwordHash):
            raise AuthenticationError("Invalid credentials")
        return user, create_access_token(str(user.id), user.role.value)

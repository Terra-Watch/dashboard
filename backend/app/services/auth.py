from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import create_access_token, verify_password
from app.models.user import User


class AuthenticationError(Exception):
    pass


class AuthService:
    def authenticate(self, db: Session, username: str, password: str) -> tuple[User, str]:
        normalized = username.strip().lower()
        user = db.scalar(select(User).where((User.email == normalized) | (User.phone == normalized)))
        if user is None or not verify_password(password, user.hashed_password):
            raise AuthenticationError("Invalid credentials")
        return user, create_access_token({"sub": str(user.id), "email": user.email, "role": user.role.value})

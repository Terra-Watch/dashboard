"""Create the local development accounts used by the login page."""

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.core.config import get_database_url, get_environment
from app.core.security import hash_password
from app.models.enums import UserRole
from app.models.user import User


ACCOUNTS = (
    ("family@jalari.in", "Lakshmi Rao", "9876543210", "FamilyPass123!", UserRole.FAMILY),
    ("fisherman@jalari.in", "Captain Rajesh", "9123456780", "FishermanPass123!", UserRole.FISHERMAN),
)


def main() -> None:
    if get_environment() != "development":
        raise SystemExit("Refusing to seed accounts outside JALRI_ENVIRONMENT=development")

    engine = create_engine(get_database_url())
    with Session(engine) as db:
        for email, name, phone, password, role in ACCOUNTS:
            user = db.query(User).filter(User.email == email).first()
            if user is None:
                user = User(email=email, name=name, phone=phone, role=role, is_active=True)
                db.add(user)
            else:
                user.name = name
                user.phone = phone
                user.role = role
                user.is_active = True
            user.hashed_password = hash_password(password)
        db.commit()

    print("Development accounts are ready.")
    for email, _, _, password, _ in ACCOUNTS:
        print(f"{email} / {password}")


if __name__ == "__main__":
    main()

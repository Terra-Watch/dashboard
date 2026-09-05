from collections.abc import Generator
from datetime import datetime, timezone
import os
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

os.environ["JALRI_ENVIRONMENT"] = "development"
os.environ["JALRI_SECRET_KEY"] = "test-secret-key-for-jalari-maritime-suite"
# Do NOT set DATABASE_URL here — old integration tests use skipif(not DATABASE_URL)
# to guard against running without a real Postgres DB. Our new tests use a
# FastAPI dependency override and the TestingSessionLocal, so no env var is needed.

from app.api.dependencies.database import get_db
from app.core.security import hash_password
from app.main import app

# Unset DATABASE_URL in unit-test environment so that external Postgres integration tests skip cleanly
if not os.environ.get("RUN_POSTGRES_TESTS"):
    os.environ.pop("DATABASE_URL", None)

from app.models.alert import Alert, AlertSeverity, AlertStatus, AlertType
from app.models.base import Base
from app.models.boat import Boat
from app.models.enums import BoatStatus, DataSource
from app.models.trip import Trip, TripStatus
from app.models.user import User, UserRole

# Thread-safe SQLite in-memory engine
test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)


@pytest.fixture(scope="session", autouse=True)
def create_schema():
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db_session: Session) -> Generator[TestClient, None, None]:
    def override_get_db():
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def seeded_data(db_session: Session):
    """Seed clean state before each test."""
    # Clean prior data
    for table in reversed(Base.metadata.sorted_tables):
        db_session.execute(table.delete())
    db_session.commit()

    now = datetime.now(timezone.utc)

    # Boats
    boat_1 = Boat(
        id=uuid.uuid4(),
        boatId="AP-07-FISH-12",
        nodeId=1001,
        status=BoatStatus.ONLINE,
        sos=False,
        latitude=16.9823,
        longitude=82.2541,
        lastSeen=now,
        registeredAt=now,
        dataSource=DataSource.GATEWAY,
    )
    boat_2 = Boat(
        id=uuid.uuid4(),
        boatId="AP-07-FISH-99",
        nodeId=1002,
        status=BoatStatus.OFFLINE,
        sos=False,
        latitude=17.2000,
        longitude=83.1000,
        lastSeen=now,
        registeredAt=now,
        dataSource=DataSource.GATEWAY,
    )
    db_session.add_all([boat_1, boat_2])
    db_session.flush()

    # Users
    family_user = User(
        id=uuid.uuid4(),
        email="family@jalari.in",
        name="Lakshmi Rao",
        phone="9876543210",
        hashed_password=hash_password("FamilyPass123!"),
        role=UserRole.FAMILY,
        is_active=True,
    )
    family_user.boats.append(boat_1)  # Only boat_1 assigned!

    fisherman_user = User(
        id=uuid.uuid4(),
        email="fisherman@jalari.in",
        name="Captain Rajesh",
        phone="9123456780",
        hashed_password=hash_password("FishermanPass123!"),
        role=UserRole.FISHERMAN,
        is_active=True,
    )
    fisherman_user.boats.append(boat_1)

    db_session.add_all([family_user, fisherman_user])
    db_session.flush()

    # Trip
    trip = Trip(
        id=uuid.uuid4(),
        boat_id=boat_1.id,
        title="Morning Trawl",
        departure_port="Visakhapatnam Fishing Harbour",
        arrival_port=None,
        start_time=now,
        status=TripStatus.ACTIVE,
        distance_nautical_miles=18.5,
        waypoints=[{"lat": 16.98, "lng": 82.25}],
        safety_warnings=["Moderate swell 1.5m"],
    )
    db_session.add(trip)

    # Incident
    alert = Alert(
        id=uuid.uuid4(),
        alertId=uuid.uuid4(),
        boat_id=boat_1.id,
        type=AlertType.SOS,
        severity=AlertSeverity.CRITICAL,
        status=AlertStatus.ACTIVE,
        message="Emergency SOS beacon triggered",
        latitude=16.9823,
        longitude=82.2541,
        createdAt=now,
    )
    db_session.add(alert)
    db_session.commit()

    return {
        "family_user": family_user,
        "fisherman_user": fisherman_user,
        "boat_1": boat_1,
        "boat_2": boat_2,
        "trip": trip,
        "alert": alert,
    }

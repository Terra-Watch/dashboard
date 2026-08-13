from sqlalchemy import ForeignKeyConstraint, UniqueConstraint

from app.models import Alert, Base, Boat, Gateway, HistoricalEvent, Telemetry
from app.models.enums import AlertSeverity, AlertStatus, AlertType, BoatStatus, DataSource, HistoricalEventType


def test_all_canonical_tables_are_registered() -> None:
    assert set(Base.metadata.tables) == {"boats", "gateways", "telemetry", "alerts", "historical_events"}


def test_shared_enums_have_canonical_values() -> None:
    assert {member.value for member in BoatStatus} == {"ONLINE", "OFFLINE"}
    assert {member.value for member in AlertType} == {"SOS", "SYSTEM", "COMMUNICATION"}
    assert {member.value for member in AlertStatus} == {"ACTIVE", "ACKNOWLEDGED", "RESOLVED"}
    assert {member.value for member in AlertSeverity} == {"CRITICAL", "WARNING", "INFO"}
    assert {member.value for member in DataSource} == {"gateway", "mock"}
    assert "HEARTBEAT_RECEIVED" in {member.value for member in HistoricalEventType}


def test_unique_constraints_exist() -> None:
    boat_constraints = {constraint.name for constraint in Boat.__table__.constraints if isinstance(constraint, UniqueConstraint)}
    gateway_constraints = {constraint.name for constraint in Gateway.__table__.constraints if isinstance(constraint, UniqueConstraint)}
    assert {"uq_boats_boat_id", "uq_boats_node_id"} <= boat_constraints
    assert "uq_gateways_gateway_id" in gateway_constraints


def test_documented_foreign_keys_exist() -> None:
    assert any(isinstance(constraint, ForeignKeyConstraint) and str(constraint.elements[0].target_fullname) == "boats.id" for constraint in Telemetry.__table__.constraints)
    assert any(isinstance(constraint, ForeignKeyConstraint) and str(constraint.elements[0].target_fullname) == "boats.id" for constraint in Alert.__table__.constraints)
    historical_targets = {
        str(element.target_fullname)
        for constraint in HistoricalEvent.__table__.constraints
        if isinstance(constraint, ForeignKeyConstraint)
        for element in constraint.elements
    }
    assert historical_targets == {"boats.id", "gateways.id"}


def test_documented_relationships_are_available() -> None:
    assert {relationship.key for relationship in Boat.__mapper__.relationships} == {"telemetry", "alerts", "historical_events"}
    assert {relationship.key for relationship in Gateway.__mapper__.relationships} == {"historical_events"}


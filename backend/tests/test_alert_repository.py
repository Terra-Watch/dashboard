from datetime import datetime, timezone
from uuid import uuid4

from app.models.alert import Alert, AlertSeverity, AlertStatus, AlertType
from app.repositories.alerts import AlertRepository


def test_list_for_boat_returns_only_that_boats_alerts(db_session, seeded_data) -> None:
    boat_1 = seeded_data["boat_1"]
    boat_2 = seeded_data["boat_2"]
    db_session.add(
        Alert(
            id=uuid4(),
            alertId=uuid4(),
            boat_id=boat_2.id,
            type=AlertType.SYSTEM,
            severity=AlertSeverity.WARNING,
            status=AlertStatus.ACTIVE,
            message="Other boat alert",
            createdAt=datetime.now(timezone.utc),
        )
    )
    db_session.commit()

    alerts = AlertRepository().list_for_boat(db_session, boat_1.id)

    assert alerts
    assert all(alert.boat_id == boat_1.id for alert in alerts)
    assert all(alert.message != "Other boat alert" for alert in alerts)

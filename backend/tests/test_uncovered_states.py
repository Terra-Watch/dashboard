"""A state nobody in the Control Room covers must not leave its reports unseen: every operator and commander can see and act on them, until someone is given that state."""
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from sqlalchemy import text  # noqa: E402

from app.database.session import engine, init_db  # noqa: E402
from tests.test_citizen_report_route import body, citizen  # noqa: E402
from tests.test_fire_evidence_routes import actor  # noqa: E402

UNCOVERED = "LD"   # Lakshadweep: not used by any other test


@pytest.fixture(scope="module", autouse=True)
def database():
    init_db()
    with engine.begin() as db:
        db.execute(text("DELETE FROM resq_user_scopes WHERE state=:s"), {"s": UNCOVERED})


def test_an_uncovered_state_is_seen_by_the_whole_control_room_until_someone_covers_it():
    reporter, headers, _ = citizen()
    rid = reporter.post("/api/citizen/reports", headers=headers, json=body(latitude=10.57, longitude=72.64)).json()["report"]["id"]
    od, oh, _ = actor("control_room_operator", scopes=["OD"])
    ranger, rh, _ = actor("field_crew", scopes=["OD"])
    assert rid in [i["id"] for i in od.get("/api/incidents", headers=oh).json()]                       # uncovered: visible to a Control Room user from another state
    assert od.get(f"/api/incidents/{rid}", headers=oh).status_code == 200
    assert od.patch(f"/api/incidents/{rid}/status", headers=oh, json={"status": "verified"}).status_code == 200      # and they can act on it
    assert rid not in [i["id"] for i in ranger.get("/api/incidents", headers=rh).json()] if ranger.get("/api/incidents", headers=rh).status_code == 200 else True   # not for rangers
    mine = engine.connect().execute(text("SELECT count(*) FROM resq_alerts WHERE kind='citizen_report_received' AND entity_id=:i"), {"i": str(rid)}).scalar()
    assert mine >= 1                                                                                    # they were told too
    cover, ch, cover_id = actor("control_room_operator", scopes=[UNCOVERED])
    try:
        assert rid in [i["id"] for i in cover.get("/api/incidents", headers=ch).json()]
        assert rid not in [i["id"] for i in od.get("/api/incidents", headers=oh).json()]                  # now only its own people see it
        assert od.get(f"/api/incidents/{rid}", headers=oh).status_code == 403
    finally:
        with engine.begin() as db:
            db.execute(text("DELETE FROM resq_user_scopes WHERE state=:s"), {"s": UNCOVERED})

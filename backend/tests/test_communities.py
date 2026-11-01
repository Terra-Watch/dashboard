import uuid

from app.services import communities
from tests.test_fire_evidence_routes import actor, database, isolated  # noqa: F401
from app.database.session import engine, init_db


def test_point_inside_and_outside():
    init_db()
    with engine.connect() as db:
        assert communities.at_point(db, 10.90158, 76.90577) is not None   # the seeded Bolampatti community
        assert communities.at_point(db, 10.9, 76.5) is None               # well outside every circle
        ids = {communities.at_point(db, *p) for p in [(10.90158, 76.90577), (10.9642, 76.7010), (11.0338, 76.8188)]}
        assert len(ids) == 3 and None not in ids                          # each centre falls in its own community
        assert communities.at_point(db, None, None) is None


def test_report_inside_a_community_is_tagged_and_the_reporter_joins_it():
    c, h, _ = actor("citizen"); ops, oh, _ = actor("control_room_operator", scopes=["TN"])
    r = c.post("/api/citizen/reports", headers=h, json={"client_key": f"com-{uuid.uuid4().hex[:8]}", "description": "Smoke on the slope above the village",
                                                         "latitude": 10.90158, "longitude": 76.90577, "observed_at": "2026-10-16T08:00:00+00:00"})
    assert r.status_code == 201, r.text
    listed = ops.get("/api/incidents", headers=oh).json()
    assert next(i for i in listed if i["id"] == r.json()["report"]["id"])["community"] == "Bolampatti forest community"
    assert c.get("/api/community/mine", headers=h).json()["community"]["slug"] == "bolampatti"

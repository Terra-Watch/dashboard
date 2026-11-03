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


def test_device_position_places_the_person_by_software():
    c, h, _ = actor("field_crew")
    assert c.get("/api/community/mine", headers=h).json()["community"] is None
    inside = c.post("/api/community/locate", headers=h, json={"latitude": 10.9642, "longitude": 76.7010}).json()["community"]
    assert inside["slug"] == "bolampatti-west"
    moved_out = c.post("/api/community/locate", headers=h, json={"latitude": 10.9, "longitude": 76.5}).json()["community"]
    assert moved_out["slug"] == "bolampatti-west"          # outside every circle: stays where they were
    assert c.post("/api/community/locate", headers=h, json={"latitude": 10.90158, "longitude": 76.90577}).json()["community"]["slug"] == "bolampatti"


def test_admin_gives_communities_and_the_person_can_work_there():
    admin, ah, _ = actor("admin"); ops, oh, uid = actor("control_room_operator", scopes=["OD"])
    r = admin.put(f"/api/admin/people/{uid}/communities", headers=ah, json={"communities": ["bolampatti", "bolampatti-west"]})
    assert r.status_code == 200, r.text
    assert ops.get("/api/auth/me", headers=oh).json()["scopes"] == ["TN"]            # worked out from the communities
    assert admin.put(f"/api/admin/people/{uid}/communities", headers=ah, json={"communities": ["nowhere"]}).status_code == 422
    assert admin.put(f"/api/admin/people/{uid}/communities", headers=ah, json={"communities": []}).status_code == 422


def _staff_in(admin, ah, role, slug):
    c, h, uid = actor(role, scopes=["TN"])
    assert admin.put(f"/api/admin/people/{uid}/communities", headers=ah, json={"communities": [slug]}).status_code == 200
    return c, h, uid


def test_a_person_in_one_community_cannot_see_another_in_the_same_state():
    admin, ah, _ = actor("admin")
    a, ha, uid_a = _staff_in(admin, ah, "control_room_operator", "bolampatti")
    b, hb, uid_b = _staff_in(admin, ah, "control_room_operator", "bolampatti-west")
    citizen, hc, _ = actor("citizen")
    r = citizen.post("/api/citizen/reports", headers=hc, json={"client_key": f"iso-{uuid.uuid4().hex[:8]}", "description": "Smoke on the slope above the village",
                                                                "latitude": 10.90158, "longitude": 76.90577, "observed_at": "2026-10-16T08:00:00+00:00"})
    rid = r.json()["report"]["id"]
    assert a.get(f"/api/incidents/{rid}", headers=ha).status_code == 200
    assert b.get(f"/api/incidents/{rid}", headers=hb).status_code == 403                      # same state, other community
    assert rid in [i["id"] for i in a.get("/api/incidents", headers=ha).json()]
    assert rid not in [i["id"] for i in b.get("/api/incidents", headers=hb).json()]
    assert b.patch(f"/api/incidents/{rid}/status", headers=hb, json={"status": "verified", "notes": "x"}).status_code == 403
    # staff told about the report: A yes, B no
    from app.services.recipients import incident_staff_recipients
    told = incident_staff_recipients("TN", incident_id=rid)
    assert uid_a in told and uid_b not in told

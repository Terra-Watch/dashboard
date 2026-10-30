"""A Range Officer can report what they find with no task behind it; it reaches the Control Room queue as an unchecked report."""
import uuid

from tests.test_fire_evidence_routes import actor, database, db_scalar, files, isolated, jpeg_bytes  # noqa: F401  (fixtures)


def key() -> str:
    return f"rr-{uuid.uuid4().hex}"


def body(**over):
    return {"client_key": key(), "notes": "Smoke over the ridge", "size": "small", "latitude": 20.31, "longitude": 85.82, **over}


def test_ranger_report_reaches_the_queue_and_a_retry_does_not_duplicate_it():
    ranger, rh, rid = actor("field_crew", scopes=["OD"]); control, ch, _ = actor("control_room_operator", scopes=["OD"])
    payload = body()
    made = ranger.post("/api/ranger/reports", headers=rh, json=payload)
    assert made.status_code == 201, made.text
    again = ranger.post("/api/ranger/reports", headers=rh, json=payload)                       # a phone that lost its connection retries
    assert again.status_code == 201 and again.json()["id"] == made.json()["id"]
    assert db_scalar("SELECT count(*) FROM resq_incidents WHERE client_key=:k", k=payload["client_key"]) == 1
    assert db_scalar("SELECT reporter_id FROM resq_incidents WHERE id=:i", i=made.json()["id"]) == rid
    listed = {i["id"]: i for i in control.get("/api/incidents", headers=ch).json()}
    assert listed[made.json()["id"]]["state"] == "OD" and listed[made.json()["id"]]["status"] == "reported"
    assert db_scalar("SELECT count(*) FROM resq_audit_log WHERE action='ranger_report_created' AND entity_id=:i", i=str(made.json()["id"])) == 1


def test_ranger_report_state_comes_from_the_position_and_must_be_in_scope():
    ranger, rh, _ = actor("field_crew", scopes=["OD"])
    assert ranger.post("/api/ranger/reports", headers=rh, json=body(latitude=21.0, longitude=82.0)).status_code == 403   # position is in CG: outside scope
    assert ranger.post("/api/ranger/reports", headers=rh, json=body(state="CG")).json()["state"] == "OD"                   # a state sent by the client is ignored
    assert ranger.post("/api/ranger/reports", headers=rh, json=body(latitude=13.6, longitude=79.4)).status_code == 422    # outside every supported state
    two, th, _ = actor("field_crew", scopes=["OD", "CG"])
    assert two.post("/api/ranger/reports", headers=th, json=body()).status_code == 201                                      # two states: the position decides


def test_only_range_officers_can_use_it_and_csrf_is_required():
    citizen, zh, _ = actor("citizen"); control, ch, _ = actor("control_room_operator", scopes=["OD"])
    assert citizen.post("/api/ranger/reports", headers=zh, json=body()).status_code == 403
    assert control.post("/api/ranger/reports", headers=ch, json=body()).status_code == 403
    ranger, rh, _ = actor("field_crew", scopes=["OD"])
    no_csrf = {k: v for k, v in rh.items() if k.lower() != "x-resq-csrf"}
    assert ranger.post("/api/ranger/reports", headers=no_csrf, json=body()).status_code == 403
    assert ranger.post("/api/ranger/reports", headers=rh, json={**body(), "latitude": 120}).status_code == 422


def test_a_key_used_by_someone_else_is_refused():
    one, oh, _ = actor("field_crew", scopes=["OD"]); two, th, _ = actor("field_crew", scopes=["OD"])
    payload = body()
    assert one.post("/api/ranger/reports", headers=oh, json=payload).status_code == 201
    assert two.post("/api/ranger/reports", headers=th, json=payload).status_code == 409


def test_photo_goes_only_to_the_officers_own_report():
    ranger, rh, _ = actor("field_crew", scopes=["OD"]); other, oh, _ = actor("field_crew", scopes=["OD"])
    report = ranger.post("/api/ranger/reports", headers=rh, json=body()).json()["id"]
    up = ranger.post(f"/api/ranger/reports/{report}/evidence", headers=rh, files=files(jpeg_bytes()))
    assert up.status_code == 201, up.text
    assert db_scalar("SELECT count(*) FROM resq_incident_images WHERE incident_id=:i", i=report) == 1
    assert other.post(f"/api/ranger/reports/{report}/evidence", headers=oh, files=files(jpeg_bytes())).status_code == 404

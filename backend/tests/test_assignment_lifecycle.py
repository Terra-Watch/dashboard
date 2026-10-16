"""Assignment lifecycle (accept -> observe (many) -> complete) and structured incident closure, on real PostgreSQL."""
import pytest

from tests.test_fire_evidence_routes import actor, citizen_report, database, db_one, db_scalar, isolated  # noqa: F401


def assigned(control, ch, rid, ranger_id):
    r = control.post(f"/api/control-room/incidents/{rid}/assignments", headers=ch, json={"ranger_id": ranger_id})
    assert r.status_code == 201, r.text
    return r.json()["assignment"]["id"]


def observe(ranger, rh, aid, outcome="confirmed", notes="Smoke visible near the ridge"):
    return ranger.post(f"/api/ranger/assignments/{aid}/verification", headers=rh, json={"outcome": outcome, "notes": notes, "observed_at": "2026-10-16T09:00:00+00:00"})


def status_of(aid):
    return db_scalar("SELECT status FROM resq_incident_assignments WHERE id=:a", a=aid)


def setup():
    control, ch, _ = actor("control_room_operator", scopes=["OD"])
    citizen, _zh, cuid = actor("citizen"); rid = citizen_report(cuid)
    ranger, rh, ruid = actor("field_crew")
    return control, ch, rid, ranger, rh, assigned(control, ch, rid, ruid)


def test_observation_requires_acceptance_first():
    _c, _ch, _rid, ranger, rh, aid = setup()
    r = observe(ranger, rh, aid)
    assert r.status_code == 409 and "accept" in r.json()["detail"].lower()
    assert db_scalar("SELECT count(*) FROM resq_field_verifications WHERE assignment_id=:a", a=aid) == 0


def test_several_observations_keep_the_assignment_open_until_explicit_completion():
    _c, _ch, rid, ranger, rh, aid = setup()
    assert ranger.post(f"/api/ranger/assignments/{aid}/decision", headers=rh, json={"decision": "accepted"}).status_code == 200
    assert observe(ranger, rh, aid, "inconclusive", "Too much haze to tell").status_code == 201
    assert status_of(aid) == "in_progress"
    assert observe(ranger, rh, aid, "confirmed", "Flames seen on the east slope").status_code == 201
    assert status_of(aid) == "in_progress"
    assert db_scalar("SELECT count(*) FROM resq_field_verifications WHERE assignment_id=:a", a=aid) == 2
    done = ranger.post(f"/api/ranger/assignments/{aid}/complete", headers=rh)
    assert done.status_code == 200 and done.json()["assignment"]["status"] == "completed"
    assert db_scalar("SELECT completed_at FROM resq_incident_assignments WHERE id=:a", a=aid) is not None
    assert observe(ranger, rh, aid).status_code == 409                      # closed for further observations
    assert db_scalar("SELECT status FROM resq_incidents WHERE id=:i", i=rid) == "reported"   # field work never changes incident status


def test_completion_needs_an_observation_and_acceptance():
    _c, _ch, _rid, ranger, rh, aid = setup()
    assert ranger.post(f"/api/ranger/assignments/{aid}/complete", headers=rh).status_code == 409   # not accepted
    ranger.post(f"/api/ranger/assignments/{aid}/decision", headers=rh, json={"decision": "accepted"})
    r = ranger.post(f"/api/ranger/assignments/{aid}/complete", headers=rh)
    assert r.status_code == 409 and "observation" in r.json()["detail"].lower()


def test_only_the_owning_ranger_can_complete():
    _c, _ch, _rid, ranger, rh, aid = setup()
    ranger.post(f"/api/ranger/assignments/{aid}/decision", headers=rh, json={"decision": "accepted"}); observe(ranger, rh, aid)
    other, oh, _ = actor("field_crew")
    assert other.post(f"/api/ranger/assignments/{aid}/complete", headers=oh).status_code == 404
    citizen, zh, _ = actor("citizen")
    assert citizen.post(f"/api/ranger/assignments/{aid}/complete", headers=zh).status_code == 403
    assert status_of(aid) == "in_progress"


def test_decline_reason_is_recorded_in_the_audit_trail():
    _c, _ch, _rid, ranger, rh, aid = setup()
    r = ranger.post(f"/api/ranger/assignments/{aid}/decision", headers=rh, json={"decision": "declined", "reason": "Off duty until Monday"})
    assert r.status_code == 200 and status_of(aid) == "cancelled"
    row = db_one("SELECT metadata FROM resq_audit_log WHERE action='assignment_declined' AND entity_id=:e ORDER BY id DESC LIMIT 1", e=str(aid))
    assert row and row["metadata"]["reason"] == "Off duty until Monday"


@pytest.mark.parametrize("payload,code", [
    ({"status": "closed"}, 422),
    ({"status": "closed", "close_reason": "bogus"}, 422),
    ({"status": "closed", "close_reason": "other"}, 422),
    ({"status": "closed", "close_reason": "other", "notes": "ok"}, 422),
    ({"status": "verified", "close_reason": "resolved"}, 422),
])
def test_closing_requires_a_valid_structured_reason(payload, code):
    control, ch, _ = actor("control_room_operator", scopes=["OD"])
    _cl, _zh, cuid = actor("citizen"); rid = citizen_report(cuid)
    control.patch(f"/api/incidents/{rid}/status", headers=ch, json={"status": "verified"})
    r = control.patch(f"/api/incidents/{rid}/status", headers=ch, json=payload)
    assert r.status_code == code, r.text
    assert db_scalar("SELECT close_reason FROM resq_incidents WHERE id=:i", i=rid) is None


def test_close_reason_is_stored_audited_and_cleared_never_leaked_on_other_states():
    control, ch, _ = actor("control_room_operator", scopes=["OD"])
    _cl, _zh, cuid = actor("citizen"); rid = citizen_report(cuid)
    control.patch(f"/api/incidents/{rid}/status", headers=ch, json={"status": "verified"})
    r = control.patch(f"/api/incidents/{rid}/status", headers=ch, json={"status": "closed", "close_reason": "false_alarm", "notes": "Controlled burn"})
    assert r.status_code == 200 and r.json()["close_reason"] == "false_alarm"
    assert db_scalar("SELECT close_reason FROM resq_incidents WHERE id=:i", i=rid) == "false_alarm"
    row = db_one("SELECT metadata FROM resq_audit_log WHERE action='incident_status_closed' AND entity_id=:e ORDER BY id DESC LIMIT 1", e=str(rid))
    assert row["metadata"]["close_reason"] == "false_alarm"
    assert control.patch(f"/api/incidents/{rid}/status", headers=ch, json={"status": "responding"}).status_code == 422   # closed is terminal


# ------------------------------------------------------------------ region-scoped notifications
def _alerts(user_id, kind=None):
    return db_scalar("SELECT count(*) FROM resq_alerts WHERE user_id=:u AND (CAST(:k AS text) IS NULL OR kind=:k)", u=user_id, k=kind)


def test_staff_are_notified_only_for_incidents_in_their_scope_and_admins_for_all():
    _c1, _h1, in_scope = actor("control_room_operator", scopes=["OD"])
    _c2, _h2, out_of_scope = actor("control_room_operator", scopes=["WB"])
    _c3, _h3, no_scope = actor("incident_commander", scopes=[])
    _c4, _h4, admin = actor("admin")
    before = {u: _alerts(u) for u in (in_scope, out_of_scope, no_scope, admin)}
    citizen, zh, _uid = actor("citizen")
    r = citizen.post("/api/citizen/reports", headers=zh, json={"client_key": "scope-test-" + str(in_scope), "description": "Smoke over the ridge near the village", "state": "OD", "latitude": 20.3, "longitude": 85.8, "observed_at": "2026-10-16T08:00:00+00:00"})
    assert r.status_code == 201, r.text
    assert _alerts(in_scope) == before[in_scope] + 1
    assert _alerts(admin) == before[admin] + 1
    assert _alerts(out_of_scope) == before[out_of_scope]
    assert _alerts(no_scope) == before[no_scope]


def test_field_events_notify_only_staff_in_scope():
    inside, _hi, in_uid = actor("control_room_operator", scopes=["OD"])
    _o, _ho, out_uid = actor("control_room_operator", scopes=["WB"])
    control, ch, _ = actor("control_room_operator", scopes=["OD"])
    _cl, _zh, cuid = actor("citizen"); rid = citizen_report(cuid)
    ranger, rh, ruid = actor("field_crew"); aid = assigned(control, ch, rid, ruid)
    out_before, in_before = _alerts(out_uid, "assignment_accepted"), _alerts(in_uid, "assignment_accepted")
    ranger.post(f"/api/ranger/assignments/{aid}/decision", headers=rh, json={"decision": "accepted"})
    assert _alerts(in_uid, "assignment_accepted") == in_before + 1
    assert _alerts(out_uid, "assignment_accepted") == out_before


def test_every_recipient_of_one_event_gets_their_own_notification():
    _a, _ha, one = actor("control_room_operator", scopes=["OD"])
    _b, _hb, two = actor("control_room_operator", scopes=["OD"])
    citizen, zh, _uid = actor("citizen")
    r = citizen.post("/api/citizen/reports", headers=zh, json={"client_key": f"multi-{one}", "description": "Smoke over the ridge near the village", "state": "OD", "latitude": 20.3, "longitude": 85.8, "observed_at": "2026-10-16T08:00:00+00:00"})
    assert r.status_code == 201, r.text
    assert _alerts(one, "citizen_report_received") == 1 and _alerts(two, "citizen_report_received") == 1


def test_a_ranger_can_list_only_their_own_observations():
    _c, _ch, _rid, ranger, rh, aid = setup()
    ranger.post(f"/api/ranger/assignments/{aid}/decision", headers=rh, json={"decision": "accepted"})
    observe(ranger, rh, aid, "inconclusive", "Haze, cannot tell")
    listed = ranger.get(f"/api/ranger/assignments/{aid}/verifications", headers=rh)
    assert listed.status_code == 200 and [i["outcome"] for i in listed.json()["items"]] == ["inconclusive"]
    other, oh, _ = actor("field_crew")
    assert other.get(f"/api/ranger/assignments/{aid}/verifications", headers=oh).status_code == 404


def test_a_retried_observation_is_saved_once():
    _c, _ch, _rid, ranger, rh, aid = setup()
    ranger.post(f"/api/ranger/assignments/{aid}/decision", headers=rh, json={"decision": "accepted"})
    body = {"outcome": "confirmed", "notes": "Flames on the east slope", "observed_at": "2026-10-16T09:00:00+00:00", "idempotency_key": "retry-key-0001"}
    first = ranger.post(f"/api/ranger/assignments/{aid}/verification", headers=rh, json=body)
    again = ranger.post(f"/api/ranger/assignments/{aid}/verification", headers=rh, json=body)
    assert first.status_code == 201 and again.status_code == 200
    assert first.json()["verification"]["id"] == again.json()["verification"]["id"]
    assert db_scalar("SELECT count(*) FROM resq_field_verifications WHERE assignment_id=:a", a=aid) == 1

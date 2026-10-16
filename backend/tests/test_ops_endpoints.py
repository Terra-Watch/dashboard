"""Control Room read models: incident list fields, all open assignments, handover notes (real PostgreSQL)."""
import uuid

from tests.test_fire_evidence_routes import actor, citizen_report, database, db_scalar, isolated  # noqa: F401


def test_incident_list_includes_place_and_closure_for_staff_in_scope_only():
    ops, oh, _ = actor("control_room_operator", scopes=["OD"])
    other, wh, _ = actor("control_room_operator", scopes=["WB"])
    _c, _h, cuid = actor("citizen"); rid = citizen_report(cuid)
    mine = {i["id"]: i for i in ops.get("/api/incidents", headers=oh).json()}
    assert rid in mine and mine[rid]["latitude"] == 20.3 and "close_reason" in mine[rid] and "observed_at" in mine[rid]
    assert rid not in {i["id"] for i in other.get("/api/incidents", headers=wh).json()}


def test_all_open_assignments_are_scoped_and_show_progress():
    ops, oh, _ = actor("control_room_operator", scopes=["OD"])
    out, wh, _ = actor("control_room_operator", scopes=["WB"])
    _c, _h, cuid = actor("citizen"); rid = citizen_report(cuid)
    ranger, rh, ruid = actor("field_crew")
    aid = ops.post(f"/api/control-room/incidents/{rid}/assignments", headers=oh, json={"ranger_id": ruid}).json()["assignment"]["id"]
    seen = {a["id"]: a for a in ops.get("/api/control-room/assignments", headers=oh).json()["items"]}
    assert seen[aid]["ranger_name"] and seen[aid]["incident_status"] == "reported" and seen[aid]["observations"] == 0
    assert aid not in {a["id"] for a in out.get("/api/control-room/assignments", headers=wh).json()["items"]}
    citizen, zh, _ = actor("citizen")
    assert citizen.get("/api/control-room/assignments", headers=zh).status_code == 403


def test_handover_notes_are_scoped_and_acknowledged_by_the_next_shift():
    night, nh, nuid = actor("control_room_operator", scopes=["OD"])
    day, dh, duid = actor("incident_commander", scopes=["OD"])
    far, fh, _ = actor("control_room_operator", scopes=["WB"])
    r = night.post("/api/handover/notes", headers=nh, json={"state": "OD", "body": "Ridge incident: waiting for the second officer."})
    assert r.status_code == 201
    note_id = r.json()["note"]["id"]
    assert far.post("/api/handover/notes", headers=fh, json={"state": "OD", "body": "x"}).status_code == 403          # outside scope
    assert note_id in {n["id"] for n in day.get("/api/handover/notes", headers=dh).json()["items"]}
    assert note_id not in {n["id"] for n in far.get("/api/handover/notes", headers=fh).json()["items"]}
    assert night.post(f"/api/handover/notes/{note_id}/acknowledge", headers=nh).status_code == 409                   # not the author
    assert day.post(f"/api/handover/notes/{note_id}/acknowledge", headers=dh).status_code == 200
    got = {n["id"]: n for n in day.get("/api/handover/notes", headers=dh).json()["items"]}[note_id]
    assert got["acknowledged_at"] and got["acknowledged_by_name"]
    ranger, rh, _ = actor("field_crew"); citizen, zh, _ = actor("citizen")
    assert ranger.get("/api/handover/notes", headers=rh).status_code == 403 and citizen.get("/api/handover/notes", headers=zh).status_code == 403


def test_ops_settings_come_only_from_configuration(monkeypatch):
    ops, oh, _ = actor("control_room_operator", scopes=["OD"])
    for name in ("CORROBORATION_RADIUS_KM", "CORROBORATION_WINDOW_MINUTES", "EXPOSURE_RADII_KM", "SCENARIO_PLANNER_ENABLED", "FEED_STALE_MINUTES"):
        monkeypatch.delenv(name, raising=False)
    off = ops.get("/api/ops/settings", headers=oh).json()
    assert off == {"corroboration": None, "exposure_radii_km": None, "feed_stale_minutes": None, "scenario_enabled": False}
    monkeypatch.setenv("CORROBORATION_RADIUS_KM", "2"); monkeypatch.setenv("CORROBORATION_WINDOW_MINUTES", "40")
    monkeypatch.setenv("EXPOSURE_RADII_KM", "5, 1, 3"); monkeypatch.setenv("SCENARIO_PLANNER_ENABLED", "true"); monkeypatch.setenv("FEED_STALE_MINUTES", "90")
    on = ops.get("/api/ops/settings", headers=oh).json()
    assert on == {"corroboration": {"radius_km": 2.0, "window_minutes": 40.0}, "exposure_radii_km": [1.0, 3.0, 5.0], "feed_stale_minutes": 90.0, "scenario_enabled": True}
    monkeypatch.setenv("CORROBORATION_RADIUS_KM", "-1")
    assert ops.get("/api/ops/settings", headers=oh).json()["corroboration"] is None
    citizen, zh, _ = actor("citizen")
    assert citizen.get("/api/ops/settings", headers=zh).status_code == 403


def test_scenario_notes_need_the_switch_scope_and_a_control_room_role(monkeypatch):
    ops, oh, _ = actor("control_room_operator", scopes=["OD"])
    far, fh, _ = actor("control_room_operator", scopes=["WB"])
    ranger, rh, _ = actor("field_crew"); citizen, zh, cuid = actor("citizen")
    rid = citizen_report(cuid)
    body = {"inputs": {"headRosKmh": 1.2}, "results": {"outerReachKm": 3.1}, "note": "Briefing at 06:00"}
    url = f"/api/ops/incidents/{rid}/scenario-notes"
    monkeypatch.delenv("SCENARIO_PLANNER_ENABLED", raising=False)
    assert ops.post(url, headers=oh, json=body).status_code == 404                  # switch off
    monkeypatch.setenv("SCENARIO_PLANNER_ENABLED", "true")
    assert ranger.post(url, headers=rh, json=body).status_code == 403               # officers never get scenarios
    assert citizen.post(url, headers=zh, json=body).status_code == 403
    assert far.post(url, headers=fh, json=body).status_code == 403                  # outside scope
    assert ops.post(url, headers=oh, json=body).status_code == 201
    history = ops.get(f"/api/incidents/{rid}/history", headers=oh).json()["history"]
    assert any(h["action"] == "scenario_note" and h["metadata"]["note"] == "Briefing at 06:00" for h in history)
    assert ops.post(f"/api/ops/incidents/999999/scenario-notes", headers=oh, json=body).status_code == 404


def test_unattended_reports_reach_the_lead_once_and_only_when_configured(monkeypatch):
    from sqlalchemy import text
    from app.database.session import engine
    from app.services.escalation import escalate_unattended
    lead, lh, luid = actor("incident_commander", scopes=["OD"])
    other, oh, ouid = actor("incident_commander", scopes=["WB"])
    _c, _h, cuid = actor("citizen"); rid = citizen_report(cuid)
    monkeypatch.delenv("REPORT_ESCALATION_MINUTES", raising=False)
    assert escalate_unattended() == []                                     # off without configuration
    with engine.begin() as db:
        db.execute(text("UPDATE resq_incidents SET created_at=now() WHERE id<>:i AND status='reported'"), {"i": rid})   # leftovers of other tests are not under test
        db.execute(text("UPDATE resq_incidents SET created_at=now()-interval '2 hours' WHERE id=:i"), {"i": rid})
    monkeypatch.setenv("REPORT_ESCALATION_MINUTES", "30")
    assert rid in escalate_unattended()
    assert escalate_unattended().count(rid) == 0                           # once only
    with engine.connect() as db:
        told = set(db.execute(text("SELECT user_id FROM resq_alerts WHERE kind='report_unattended' AND entity_id=:i"), {"i": str(rid)}).scalars().all())
    assert luid in told and ouid not in told                               # the lead in scope is told, a lead elsewhere is not


def test_inbox_shows_only_my_notifications_and_marks_only_mine_read():
    from sqlalchemy import text
    from app.database.session import engine
    a, ah, auid = actor("control_room_operator", scopes=["OD"])
    b, bh, buid = actor("control_room_operator", scopes=["OD"])
    with engine.begin() as db:
        ids = [db.execute(text("INSERT INTO resq_alerts (kind,message,state,severity,status,entity_type,entity_id,user_id) VALUES ('t','for a','OD','info','generated','incident','1',:u) RETURNING id"), {"u": u}).scalar() for u in (auid, buid)]
    mine = a.get("/api/inbox", headers=ah).json()
    assert ids[0] in {i["id"] for i in mine["items"]} and ids[1] not in {i["id"] for i in mine["items"]} and mine["unread"] >= 1
    assert a.post("/api/inbox/read", headers=ah, json={"ids": [ids[1]]}).json()["marked"] == 0     # someone else's row
    assert a.post("/api/inbox/read", headers=ah, json={"ids": [ids[0]]}).json()["marked"] == 1
    assert b.get("/api/inbox", headers=bh).json()["unread"] >= 1                                   # b's is untouched
    assert a.post("/api/inbox/read", headers=ah, json={"all": True}).status_code == 200
    assert a.get("/api/inbox", headers=ah).json()["unread"] == 0
    anon_status = a.get("/api/inbox").status_code
    assert anon_status == 401


def test_staff_can_log_a_report_with_a_place_and_patrol_planning_stays_off(monkeypatch):
    ops, oh, _ = actor("control_room_operator", scopes=["OD"])
    key = f"phone-{uuid.uuid4().hex}"
    body = {"client_key": key, "source": "phone", "size": "unknown", "notes": "Caller sees smoke", "state": "OD", "latitude": 20.31, "longitude": 85.82, "observed_at": "2026-10-16T05:30:00Z"}
    made = ops.post("/api/incidents", headers=oh, json=body)
    assert made.status_code == 201, made.text
    listed = {i["id"]: i for i in ops.get("/api/incidents", headers=oh).json()}[made.json()["id"]]
    assert listed["latitude"] == 20.31 and listed["longitude"] == 85.82 and listed["observed_at"].startswith("2026-10-16T05:30")
    assert ops.post("/api/incidents", headers=oh, json={**body, "client_key": key + "x", "longitude": None}).status_code == 422   # a place needs both numbers
    assert ops.post("/api/incidents", headers=oh, json={**body, "client_key": key + "y", "latitude": 95}).status_code == 422
    monkeypatch.delenv("FEATURE_PATROL_PLANNING", raising=False)
    assert ops.get("/api/plans", headers=oh).status_code == 404
    monkeypatch.setenv("FEATURE_PATROL_PLANNING", "true")
    assert ops.get("/api/plans", headers=oh).status_code == 200

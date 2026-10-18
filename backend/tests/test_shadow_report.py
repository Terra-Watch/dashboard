"""scripts/shadow_report.py against seeded rows: read-only, no invented labels, thresholds only from arguments."""
import json
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from sqlalchemy import text

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.database.session import engine  # noqa: E402
from scripts import shadow_report as sr  # noqa: E402
from tests.test_fire_evidence_routes import actor, database, db_scalar, isolated  # noqa: E402,F401

NOW = datetime(2026, 11, 10, 12, tzinfo=timezone.utc)


def a(label="NO_VISIBLE_FIRE", priority="STANDARD", status="COMPLETED", code=None):
    return {"assessment_status": status, "derived_label": label if status == "COMPLETED" else None, "review_priority": priority, "error_code": code, "shadow": True}


def row(i, assessment, review="NOT_REVIEWED", close=None, confirmed=False, not_confirmed=False, day=0):
    return {"id": i, "incident_id": i, "assessment": assessment, "assessment_error": None, "human_review_status": review, "at": NOW + timedelta(days=day),
            "incident_status": "reported", "close_reason": close, "verification_confirmed": confirmed, "verification_not_confirmed": not_confirmed}


ROWS = [
    row(1, a("ACTIVE_FIRE", "HIGH"), review="VERIFIED_AUTHENTIC"),                       # agree (human positive, model fire)
    row(2, a("NO_VISIBLE_FIRE"), review="VERIFIED_AUTHENTIC", day=1),                    # missed fire
    row(3, a("NO_VISIBLE_FIRE"), close="resolved", day=1),                               # missed fire (outcome)
    row(4, a("SMOKE_ONLY", "HIGH"), close="false_alarm"),                                # false alarm
    row(5, a("NO_VISIBLE_FIRE"), not_confirmed=True, day=2),                             # correct negative
    row(6, a("UNCERTAIN"), review="REVIEWED", day=2),                                    # uncertain, no usable label
    row(7, a(status="UNAVAILABLE", code="MODEL_TIMEOUT")), row(8, a(status="UNAVAILABLE", code="MODEL_TIMEOUT"), day=2),
    row(9, a(status="UNAVAILABLE", code="MODEL_BUSY")),
    row(10, a("ACTIVE_FIRE", "HIGH"), review="VERIFIED_AUTHENTIC", close="false_alarm"),  # conflicting human evidence: not a label
]


def test_counts_matrix_and_error_rates():
    rep = sr.build_report(ROWS)
    m = rep["metrics"]
    assert m["shadow_images"] == 10 and m["completed"] == 7 and m["unavailable"] == 3
    assert rep["model_labels"] == {"ACTIVE_FIRE": 2, "SMOKE_ONLY": 1, "NO_VISIBLE_FIRE": 3, "UNCERTAIN": 1, "UNAVAILABLE": 3}
    assert m["missed_fire_count"] == 2 and sorted(rep["missed_fire_image_ids"]) == [2, 3]
    assert m["false_alarm_count"] == 1 and rep["false_alarm_image_ids"] == [4]
    assert m["human_positive"] == 3 and m["human_negative"] == 2 and m["human_conflicting"] == 1 and m["human_labelled"] == 5
    assert m["missed_fire_rate_of_positive"] == round(2 / 3, 4) and m["false_alarm_rate_of_negative"] == 0.5
    assert m["uncertain_share"] == round(1 / 7, 4) and m["high_priority_share"] == round(3 / 7, 4) and m["unavailable_rate"] == 0.3
    cells = rep["agreement_matrix"]["cells"]
    assert cells["ACTIVE_FIRE"]["VERIFIED_AUTHENTIC"] == 2 and cells["NO_VISIBLE_FIRE"]["VERIFIED_AUTHENTIC"] == 1 and cells["UNCERTAIN"]["REVIEWED"] == 1
    assert cells["UNAVAILABLE"]["NOT_REVIEWED"] == 3
    assert rep["unavailable_by_error_code"] == {"MODEL_BUSY": {"count": 1, "rate": 0.1}, "MODEL_TIMEOUT": {"count": 2, "rate": 0.2}}
    v = rep["daily_review_volume"]
    assert v["calendar_days_spanned"] == 3 and v["images_per_day"] == round(10 / 3, 2)


def test_no_thresholds_means_no_decision():
    rep = sr.build_report(ROWS)
    assert rep["go_no_go"]["verdict"] == "INCOMPLETE" and {c["result"] for c in rep["go_no_go"]["checks"]} == {"NOT_EVALUATED"}
    assert sr.parse_args([]).max_missed_fire_count is None and sr.parse_args([]).min_shadow_images is None      # no defaults pretending to be decisions


def test_thresholds_come_only_from_arguments_and_drive_the_verdict():
    full = dict(min_shadow_images=5, min_human_labelled=5, max_missed_fire_count=2, max_false_alarm_rate=0.6, max_uncertain_share=0.2,
                max_high_priority_share=0.5, max_unavailable_rate=0.3, max_daily_review_volume=4)
    rep = sr.build_report(ROWS, thresholds=full)
    assert rep["go_no_go"]["verdict"] == "GO" and {c["result"] for c in rep["go_no_go"]["checks"]} == {"PASS"}
    strict = sr.build_report(ROWS, thresholds={**full, "max_missed_fire_count": 1})
    assert strict["go_no_go"]["verdict"] == "NO_GO" and [c["check"] for c in strict["go_no_go"]["checks"] if c["result"] == "FAIL"] == ["max_missed_fire_count"]
    partial = sr.build_report(ROWS, thresholds={"max_missed_fire_count": 5})
    assert partial["go_no_go"]["verdict"] == "INCOMPLETE"
    md = sr.to_markdown(rep)
    assert "Agreement matrix" in md and "Go / no-go" in md and "approves nothing" in md.lower() or "approves nothing" in md


def test_empty_window_is_not_a_pass():
    rep = sr.build_report([], thresholds={"max_false_alarm_rate": 0.1, "min_shadow_images": 1})
    assert rep["metrics"]["shadow_images"] == 0 and rep["go_no_go"]["verdict"] == "NO_GO"
    assert {c["check"]: c["result"] for c in rep["go_no_go"]["checks"]}["max_false_alarm_rate"] == "NO_DATA"


def test_label_mapping_is_explicit_and_configurable_not_invented():
    rep = sr.build_report(ROWS, positive_reviews=["REVIEWED"])
    assert rep["human_label_mapping"]["positive_image_reviews"] == ["REVIEWED"]
    assert sr.human_label(row(1, a(), review="POTENTIALLY_SYNTHETIC"), ["VERIFIED_AUTHENTIC"]) == (None, [])
    assert sr.human_label(row(1, a(), close="unable_to_verify"), ["VERIFIED_AUTHENTIC"]) == (None, [])


def test_end_to_end_against_seeded_database_rows_is_read_only(tmp_path):
    _, _, uid = actor("citizen")
    marker = datetime(3000, 1, 1, tzinfo=timezone.utc) + timedelta(days=uuid.uuid4().int % 2_000_000 // 10)   # a window no other run uses (shared database)
    ids = []
    with engine.begin() as db:
        for n, (label, review, close) in enumerate([("ACTIVE_FIRE", "VERIFIED_AUTHENTIC", None), ("NO_VISIBLE_FIRE", "VERIFIED_AUTHENTIC", None), ("SMOKE_ONLY", "NOT_REVIEWED", "false_alarm")]):
            iid = db.execute(text("""INSERT INTO resq_incidents (reporter_id,client_key,source,size,notes,state,latitude,longitude,observed_at,close_reason)
                VALUES (:r,:k,'citizen','unknown','x','OD',20.3,85.8,now(),:c) RETURNING id"""), {"r": uid, "k": f"sr-{uuid.uuid4().hex[:8]}", "c": close}).scalar()
            ids.append(iid)
            db.execute(text("""INSERT INTO resq_incident_images (incident_id,storage_key,original_filename,content_type,size_bytes,sha256,assessment_status,model_version,assessment,human_review_status,assessed_at)
                VALUES (:i,:k,'a.jpg','image/jpeg',1,:h,'SHADOW','v',CAST(:a AS JSONB),:r,:t)"""),
                       {"i": iid, "k": f"sr/{uuid.uuid4().hex}", "h": uuid.uuid4().hex + uuid.uuid4().hex, "a": json.dumps(a(label, "HIGH" if n == 0 else "STANDARD")), "r": review, "t": marker})
        # a non-shadow row in the same window must be ignored
        iid = db.execute(text("""INSERT INTO resq_incidents (reporter_id,client_key,source,size,notes,state,latitude,longitude,observed_at) VALUES (:r,:k,'citizen','unknown','x','OD',20.3,85.8,now()) RETURNING id"""),
                         {"r": uid, "k": f"sr-{uuid.uuid4().hex[:8]}"}).scalar()
        db.execute(text("""INSERT INTO resq_incident_images (incident_id,storage_key,original_filename,content_type,size_bytes,sha256,assessment_status,assessment,assessed_at)
            VALUES (:i,:k,'a.jpg','image/jpeg',1,:h,'COMPLETED',CAST(:a AS JSONB),:t)"""), {"i": iid, "k": f"sr/{uuid.uuid4().hex}", "h": uuid.uuid4().hex + uuid.uuid4().hex, "a": json.dumps(a("ACTIVE_FIRE")), "t": marker})
    counts = lambda: db_scalar("SELECT count(*) FROM resq_incident_images") + 1000 * db_scalar("SELECT count(*) FROM resq_incidents")  # noqa: E731
    before = counts()
    jf, mf = tmp_path / "r.json", tmp_path / "r.md"
    assert sr.main(["--since", marker.date().isoformat(), "--until", (marker + timedelta(days=1)).date().isoformat(), "--json-out", str(jf), "--md-out", str(mf), "--max-missed-fire-count", "0"]) == 0
    rep = json.loads(jf.read_text())
    assert rep["metrics"]["shadow_images"] == 3 and rep["metrics"]["missed_fire_count"] == 1 and rep["metrics"]["false_alarm_count"] == 1
    assert rep["go_no_go"]["verdict"] == "NO_GO" and "Agreement matrix" in mf.read_text()
    assert counts() == before
    with engine.connect() as conn:                                  # the fetch itself runs in a READ ONLY transaction
        sr.fetch_rows(conn, marker, marker + timedelta(days=1))
        with pytest.raises(Exception):
            conn.execute(text("UPDATE resq_incident_images SET assessment_error='x' WHERE false"))
        conn.rollback()

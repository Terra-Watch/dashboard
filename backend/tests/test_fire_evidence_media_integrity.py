"""Advisory `media_integrity` on fire-report (incident image) assessments.

Covers: the single mapping (all 7 display states), the flag (default off) and the artifact's authenticity component, UNAVAILABLE never reading
as clean, fire/smoke fields unaffected by authenticity, no effect whatsoever on incident status, assignments, alerts, notices, public map,
list/detail/citizen views or ordering, human review still required, citizen/ranger/public responses never carrying it, the staff list field
`image_media_integrity_status`, the community path staying a separate policy, and source scans proving no router/workflow code branches on it.
Real: app, auth, routers, SQL (PostgreSQL). Fake: the assessor service.
"""
import ast
import copy
import json
import re
import sys
import uuid
from pathlib import Path
from types import SimpleNamespace

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.core.security import make_token  # noqa: E402
from app.services import community_image_assessment as media  # noqa: E402
from app.services import image_assessment as ia  # noqa: E402
from tests.test_auth import fresh_client, make_user  # noqa: E402
from tests.test_fire_evidence_adapter import good, jpeg_bytes  # noqa: E402
from tests.test_fire_evidence_isolation import create_incident, world  # noqa: E402
from tests.test_fire_evidence_routes import (actor, citizen_report, database, db_one, db_scalar, files, image_row, isolated, with_csrf)  # noqa: E402,F401

FLAG = "FIRE_EVIDENCE_REPORT_AUTHENTICITY_ENABLED"
BANNED = re.compile(r"\b(fake|forged|authentic|genuine)\b", re.I)
EXTREME_FIRE = {"scores": {"flames_visible": 1.0, "smoke_visible": 1.0}, "derived_label": "ACTIVE_FIRE", "review_priority": "HIGH", "ood_flag": False}


def completed(auth="NO_CONCERNS_FOUND", signals=(), **kw):
    r = good()
    r["authenticity"] = {"status": auth, "signals": list(signals)}
    r.update(kw)
    return r


def fire_fields(a):
    return {k: a[k] for k in ("assessment_status", "artifact_status", "model_version", "scores", "derived_label", "decision", "review_required",
                              "review_priority", "quality_flags", "ood_flag", "error_code")}


@pytest.fixture
def flag_on(monkeypatch):
    monkeypatch.setenv(FLAG, "true")


# ======================================================================================= (a) the single mapping: 7 display states
@pytest.mark.parametrize("auth,expected", [
    ("NO_CONCERNS_FOUND", "NO_CONCERN_DETECTED"), ("POSSIBLE_SYNTHETIC", "POSSIBLE_SYNTHETIC"), ("POSSIBLE_EDITED", "POSSIBLE_EDITED"),
    ("REUSED", "POSSIBLE_REUSED"), ("INCONSISTENT", "POSSIBLE_EDITED"), ("INCONCLUSIVE", "INCONCLUSIVE"), ("NOT_ASSESSED", "NOT_ASSESSED"),
])
def test_completed_approved_results_map_to_the_display_states(flag_on, auth, expected):
    out = ia.sanitize_assessment(completed(auth, ["GENERATOR_TAG_IN_METADATA"] if auth == "POSSIBLE_SYNTHETIC" else []))
    mi = out["media_integrity"]
    assert mi["status"] == expected and mi["advisory"] is True and mi["affects_incident"] is False and set(mi) == {"status", "note", "advisory", "affects_incident"}
    assert "advisory" in mi["note"].lower() and "does not verify or reject the report" in mi["note"] and "priority, status, dispatch or visibility" in mi["note"]
    assert not BANNED.search(mi["note"])
    if auth == "NO_CONCERNS_FOUND":
        assert "not proof" in mi["note"]
    if auth == "INCONSISTENT":
        assert "inconsistent" in mi["note"].lower()
    assert out["authenticity"]["status"] == auth                       # authenticity/indications keep their existing meaning
    assert out["review_required"] is True and out["decision"] == "REQUIRES_REVIEW"


def test_every_other_assessment_state_has_a_safe_display_state(flag_on):
    un = ia.unavailable(ia.TIMEOUT)["media_integrity"]
    assert un["status"] == "UNAVAILABLE" and "not a negative result" in un["note"]
    exp = {"assessment_status": "EXPERIMENTAL", "artifact_status": ia.EXPERIMENTAL_ARTIFACT_STATUS, "checkpoint_sha256": ia.EXPERIMENTAL_ALLOWED_SHA256,
           "raw_logits": {"flames_visible": 1.0, "smoke_visible": 1.0}, "model_version": "e"}
    assert ia.sanitize_experimental(exp)["media_integrity"]["status"] == "NOT_ASSESSED"
    assert ia.shadow_view("v")["media_integrity"]["status"] == "NOT_ASSESSED"
    # missing / unreadable stored rows: NOT_ASSESSED, never clean
    for stored in (None, {}, "x", [], 7):
        shown = ia.present_assessment(stored, "PENDING", None)
        assert shown["media_integrity"]["status"] == "NOT_ASSESSED" and shown["scores"] is None
    # a stored UNAVAILABLE row or an invalid COMPLETED row is UNAVAILABLE
    assert ia.present_assessment({"assessment_status": "UNAVAILABLE", "error_code": ia.BUSY})["media_integrity"]["status"] == "UNAVAILABLE"
    assert ia.present_assessment({"assessment_status": "COMPLETED"})["media_integrity"]["status"] == "UNAVAILABLE"
    for s in (ia.unavailable(ia.TIMEOUT), ia.shadow_view(), ia.present_assessment(None), ia.sanitize_assessment(completed("POSSIBLE_EDITED", artifact_status=None))):
        assert s["media_integrity"]["status"] != "NO_CONCERN_DETECTED" and not BANNED.search(json.dumps(s["media_integrity"]))


def test_pending_status_row_is_not_assessed_not_clean():
    assert ia.present_assessment(None, "PENDING")["media_integrity"]["status"] == "NOT_ASSESSED"
    assert ia.media_integrity_for("PENDING")["status"] == "NOT_ASSESSED"


def test_legacy_rows_without_media_integrity_are_presented_with_it(flag_on):
    legacy = ia.sanitize_assessment(completed("POSSIBLE_EDITED"))
    legacy.pop("media_integrity")
    assert ia.present_assessment(legacy, "COMPLETED")["media_integrity"]["status"] == "POSSIBLE_EDITED"
    assert ia.present_assessment(ia.sanitize_assessment(completed("REUSED")))["media_integrity"]["status"] == "POSSIBLE_REUSED"


# ======================================================================================= (e) flag, component, failures
def test_flag_defaults_off_and_hides_a_head_bearing_result(monkeypatch):
    monkeypatch.delenv(FLAG, raising=False)
    assert ia.report_authenticity_enabled() is False
    out = ia.sanitize_assessment(completed("POSSIBLE_SYNTHETIC", ["GENERATOR_TAG_IN_METADATA"]))
    assert out["media_integrity"]["status"] == "NOT_ASSESSED" and "No approved authenticity component" in out["media_integrity"]["note"]
    assert out["authenticity"] == {"status": "NOT_ASSESSED", "signals": []} and set(out["indications"].values()) == {"NOT_ASSESSED"}
    for junk in ("", "1", "yes", "True ", "TRUE", "on", "false"):
        monkeypatch.setenv(FLAG, junk)
        assert ia.report_authenticity_enabled() is (junk.strip() == "true")
    monkeypatch.setenv(FLAG, "true")
    assert ia.report_authenticity_enabled() is True


def test_flag_does_not_change_any_fire_field(monkeypatch):
    base = completed("POSSIBLE_SYNTHETIC", ["GENERATOR_TAG_IN_METADATA"], **EXTREME_FIRE)
    monkeypatch.delenv(FLAG, raising=False)
    off = ia.sanitize_assessment(copy.deepcopy(base))
    monkeypatch.setenv(FLAG, "true")
    on = ia.sanitize_assessment(copy.deepcopy(base))
    other = ia.sanitize_assessment(completed("NO_CONCERNS_FOUND", **EXTREME_FIRE))
    assert fire_fields(off) == fire_fields(on) == fire_fields(other)
    assert off["media_integrity"]["status"] == "NOT_ASSESSED" and on["media_integrity"]["status"] == "POSSIBLE_SYNTHETIC"


class Assessor:
    def __init__(self, result, auth):
        self.result, self.artifact = result, SimpleNamespace(model_version="fake-v1", authenticity=auth)

    def assess_bytes(self, data, image_id):
        return SimpleNamespace(model_dump=lambda: copy.deepcopy(self.result))


def run(monkeypatch, result, auth, config="report"):
    monkeypatch.setattr(ia, "configuration_error", lambda *a: None)
    monkeypatch.setattr(ia, "_load_service", lambda *a: Assessor(result, auth))
    return ia.assess_image(b"x", "img", config)


def test_an_artifact_without_a_provided_authenticity_component_is_not_assessed_even_with_the_flag(flag_on, monkeypatch):
    head = completed("POSSIBLE_EDITED", ["LEARNED_EDITED_SCORE:0.9"])
    for auth in ({"status": "EXCLUDED_BY_POLICY", "reason": "x"}, {}):
        out = run(monkeypatch, head, auth)
        assert out["media_integrity"]["status"] == "NOT_ASSESSED" and out["authenticity"]["status"] == "NOT_ASSESSED"
    assert run(monkeypatch, head, {"status": "PROVIDED"})["media_integrity"]["status"] == "POSSIBLE_EDITED"


@pytest.mark.parametrize("code", [c for c in ia.ALL_ERROR_CODES])
def test_unavailable_outcomes_are_never_clean(flag_on, code):
    out = ia.unavailable(code)
    assert out["media_integrity"]["status"] == "UNAVAILABLE" and ia.present_assessment(out)["media_integrity"]["status"] == "UNAVAILABLE"
    assert out["authenticity"]["status"] == "NOT_ASSESSED"


def test_not_configured_and_disabled_runs_report_unavailable(monkeypatch):
    for name in ("FIRE_EVIDENCE_REPO", "FIRE_EVIDENCE_ARTIFACT_DIR", "FIRE_EVIDENCE_INFERENCE_ENABLED"):
        monkeypatch.delenv(name, raising=False)
    out = ia.assess_image(jpeg_bytes(), "i")
    assert out["error_code"] == ia.NOT_CONFIGURED and out["media_integrity"]["status"] == "UNAVAILABLE"


def test_persistence_stores_the_mapped_status_only_when_exposed(monkeypatch):
    monkeypatch.setenv(FLAG, "true")
    on = ia.persistence_fields(ia.sanitize_assessment(completed("REUSED")))
    assert on["status"] == "COMPLETED" and on["auth"] == "POSSIBLE_REUSED"
    assert ia.persistence_fields(ia.sanitize_assessment(completed("NOT_ASSESSED")))["auth"] is None
    assert ia.persistence_fields(ia.unavailable(ia.BUSY))["auth"] is None
    monkeypatch.delenv(FLAG)
    assert ia.persistence_fields(ia.sanitize_assessment(completed("REUSED")))["auth"] is None


# ======================================================================================= (b)(c)(d) no effect on anything
VARIANTS = [("NO_CONCERNS_FOUND", []), ("POSSIBLE_SYNTHETIC", ["GENERATOR_TAG_IN_METADATA"]), ("POSSIBLE_EDITED", ["LEARNED_EDITED_SCORE:0.9"]),
            ("REUSED", ["REUSED_MATCHES:1/a.jpg"])]


@pytest.fixture
def holder(monkeypatch):
    monkeypatch.setenv("FIRE_EVIDENCE_REPO", "/nonexistent-assessor")
    monkeypatch.setenv("FIRE_EVIDENCE_ARTIFACT_DIR", "/nonexistent-artifact")
    monkeypatch.setenv("FIRE_EVIDENCE_INFERENCE_ENABLED", "true")
    ia.reset_for_tests()
    h = SimpleNamespace(result=None)
    monkeypatch.setattr(ia, "_scorer_factory", lambda *a: None)
    monkeypatch.setattr(ia, "_load_service", lambda *a: Assessor(h.result, {"status": "PROVIDED"}))
    return h


def snapshot(client, bearer, iid):
    d = client.get(f"/api/incidents/{iid}", headers=bearer).json()
    img = d["images"][0]
    return {"incident": {k: d[k] for k in ("status", "state", "close_reason", "source", "size", "notes")},
            "fire": fire_fields(img["assessment"]), "human": img["human_review_status"], "world": world(iid)}


def staff_actor():
    officer_id = make_user("officer", scopes=["OD"])[0]
    return {"Authorization": f"Bearer {make_token(officer_id, 'officer')}"}


@pytest.mark.parametrize("flag_value", ["true", "false"])
def test_flagged_reports_are_treated_exactly_like_unflagged_ones(holder, monkeypatch, flag_value):
    monkeypatch.setenv(FLAG, flag_value)
    monkeypatch.setenv("PUBLIC_MAP_ENABLED", "true")
    bearer = staff_actor(); staff = fresh_client(); h = with_csrf(staff, bearer)
    ids = [create_incident(staff, h) for _ in VARIANTS]                        # same parameters, created in order
    order_before = [i["id"] for i in staff.get("/api/incidents", headers=bearer).json() if i["id"] in ids]
    alerts_before, notices_before = db_scalar("SELECT count(*) FROM resq_alerts"), db_scalar("SELECT count(*) FROM resq_notices")
    public_before = staff.get("/api/public/incidents").json()
    notif_before = staff.get("/api/notifications", headers=bearer).json()
    shots = []
    for iid, (auth, signals) in zip(ids, VARIANTS):
        holder.result = completed(auth, signals, **EXTREME_FIRE)
        assert staff.post(f"/api/incidents/{iid}/images", headers=h, files=files(jpeg_bytes())).status_code == 201
        shots.append(snapshot(staff, bearer, iid))
    base = shots[0]
    for shot in shots[1:]:                                                     # (b) status, assignments, alerts, fire fields, human review: identical
        assert shot == base
    assert db_scalar("SELECT count(*) FROM resq_alerts") == alerts_before and db_scalar("SELECT count(*) FROM resq_notices") == notices_before
    assert db_scalar("SELECT count(*) FROM resq_incident_assignments WHERE incident_id = ANY(:ids)", ids=ids) == 0
    assert staff.get("/api/public/incidents").json() == public_before            # public map unchanged
    assert staff.get("/api/notifications", headers=bearer).json() == notif_before
    listing = staff.get("/api/incidents", headers=bearer).json()
    rows = [i for i in listing if i["id"] in ids]
    assert [i["id"] for i in rows] == order_before and len(rows) == len(ids)   # (c) same membership and ordering as before any upload
    assert {i["status"] for i in rows} == {"reported"} and {i["image_assessment_status"] for i in rows} == {"COMPLETED"}
    assert len({tuple(sorted(i)) for i in rows}) == 1 and "image_media_integrity_status" in rows[0]
    by_id = {i["id"]: i for i in rows}
    for iid, (auth, _) in zip(ids, VARIANTS):
        expected = ia.sanitize_assessment(completed(auth), authenticity_assessed=None)["media_integrity"]["status"]
        assert by_id[iid]["image_media_integrity_status"] == expected          # display text only, from the single mapping
    assert [i["id"] for i in staff.get("/api/incidents?state=OD", headers=bearer).json() if i["id"] in ids] == order_before
    assert "_image_assessment" not in rows[0] and "_image_error" not in rows[0]
    # (d) review is still required and the human review PATCH works unchanged
    for iid, shot in zip(ids, shots):
        img = staff.get(f"/api/incidents/{iid}", headers=bearer).json()["images"][0]
        assert img["assessment"]["review_required"] is True and img["human_review_status"] == "NOT_REVIEWED"
        r = staff.patch(f"/api/incidents/{iid}/images/{img['id']}/review", headers=h, json={"status": "REVIEWED", "note": "seen"})
        assert r.status_code == 200 and r.json()["image"]["human_review_status"] == "REVIEWED"
        assert db_scalar("SELECT status FROM resq_incidents WHERE id=:i", i=iid) == "reported"


def test_list_field_is_null_without_an_image_and_membership_is_flag_independent(holder, monkeypatch):
    bearer = staff_actor(); staff = fresh_client(); h = with_csrf(staff, bearer)
    bare, withimg = create_incident(staff, h), create_incident(staff, h)
    holder.result = completed("POSSIBLE_EDITED", ["LEARNED_EDITED_SCORE:0.9"], **EXTREME_FIRE)
    results = {}
    for value in ("true", "false"):
        monkeypatch.setenv(FLAG, value)
        if value == "true":
            assert staff.post(f"/api/incidents/{withimg}/images", headers=h, files=files(jpeg_bytes())).status_code == 201
        rows = {i["id"]: i for i in staff.get("/api/incidents", headers=bearer).json()}
        results[value] = [i["id"] for i in staff.get("/api/incidents", headers=bearer).json()]
        assert rows[bare]["image_media_integrity_status"] is None and rows[bare]["image_assessment_status"] is None
    assert results["true"] == results["false"]
    monkeypatch.setenv(FLAG, "true")
    assert {i["id"]: i for i in staff.get("/api/incidents", headers=bearer).json()}[withimg]["image_media_integrity_status"] == "POSSIBLE_EDITED"
    monkeypatch.setenv(FLAG, "false")      # a stored value is not displayed while the flag is off
    row = {i["id"]: i for i in staff.get("/api/incidents", headers=bearer).json()}[withimg]
    assert row["image_media_integrity_status"] == "NOT_ASSESSED" and row["authenticity_status"] is None
    detail = staff.get(f"/api/incidents/{withimg}", headers=bearer).json()["images"][0]
    assert detail["assessment"]["media_integrity"]["status"] == "NOT_ASSESSED" and detail["authenticity_status"] is None
    assert detail["assessment"]["authenticity"] == {"status": "NOT_ASSESSED", "signals": []}


def test_citizen_ranger_and_public_responses_never_carry_media_integrity(holder, monkeypatch):
    monkeypatch.setenv(FLAG, "true"); monkeypatch.setenv("PUBLIC_MAP_ENABLED", "true")
    holder.result = completed("POSSIBLE_SYNTHETIC", ["GENERATOR_TAG_IN_METADATA"], **EXTREME_FIRE)
    citizen, zh, uid = actor("citizen"); rid = citizen_report(uid)
    ranger, rh, ranger_id = actor("field_crew")
    control, ch, _ = actor("control_room_operator", scopes=["OD"])
    aid = control.post(f"/api/control-room/incidents/{rid}/assignments", headers=ch, json={"ranger_id": ranger_id}).json()["assignment"]["id"]
    c = citizen.post(f"/api/citizen/reports/{rid}/evidence", headers=zh, files=files(jpeg_bytes()))
    r = ranger.post(f"/api/ranger/assignments/{aid}/evidence", headers=rh, files=files(jpeg_bytes()))
    assert c.status_code == 201 and r.status_code == 201
    surfaces = [c.text, r.text, citizen.get(f"/api/citizen/reports/{rid}", headers=zh).text, citizen.get("/api/citizen/reports", headers=zh).text,
                citizen.get(f"/api/citizen/reports/{rid}/timeline", headers=zh).text, ranger.get(f"/api/ranger/assignments/{aid}", headers=rh).text,
                ranger.get("/api/ranger/assignments", headers=rh).text, fresh_client().get("/api/public/incidents").text, fresh_client().get("/api/public/status").text]
    for text_ in surfaces:
        for leaked in ("media_integrity", "image_media_integrity_status", "POSSIBLE_SYNTHETIC", "authenticity", "GENERATOR_TAG", "flames_visible"):
            assert leaked not in text_
    assert set(c.json()["evidence"]) == {"id", "original_filename", "size_bytes", "assessment_status", "created_at"}


# ======================================================================================= (f) community stays a separate policy
def test_community_result_is_unchanged_and_independent_of_the_report_flag(monkeypatch):
    raw = completed("POSSIBLE_SYNTHETIC", ["GENERATOR_TAG_IN_METADATA"], **EXTREME_FIRE)
    results = []
    for value in ("true", "false"):
        monkeypatch.setenv(FLAG, value)
        san = ia.sanitize_community_assessment(copy.deepcopy(raw))
        assert "media_integrity" not in san and san["authenticity"]["status"] == "POSSIBLE_SYNTHETIC"
        res = media.map_assessment(san)
        assert set(res) == set(media.RESULT_KEYS) and res["status"] == "POSSIBLE_SYNTHETIC" and res["moderator_review_recommended"] is True
        assert "media_integrity" not in json.dumps(res) and "scores" not in res
        results.append(res)
    assert results[0] == results[1]
    out = run(monkeypatch, raw, {"status": "PROVIDED"}, config="community")      # community path: the report flag does not apply
    monkeypatch.delenv(FLAG, raising=False)
    assert run(monkeypatch, raw, {"status": "PROVIDED"}, config="community") == out and "media_integrity" not in out


# ======================================================================================= (g) nothing branches on it
APP = BACKEND / "app"
ALLOWED = {APP / "services" / "image_assessment.py"}
NAMES = ("media_integrity", "authenticity", "image_media_integrity_status")


def _mentions(node) -> bool:
    for n in ast.walk(node):
        if isinstance(n, ast.Name) and any(x in n.id for x in NAMES):
            return True
        if isinstance(n, ast.Attribute) and any(x in n.attr for x in NAMES):
            return True
        if isinstance(n, ast.Constant) and isinstance(n.value, str) and any(x in n.value for x in NAMES):
            return True
    return False


def test_no_application_code_branches_on_media_integrity_or_authenticity():
    offenders = []
    for path in APP.rglob("*.py"):
        if path in ALLOWED or path.name == "community_image_assessment.py":
            continue
        tree = ast.parse(path.read_text())
        for n in ast.walk(tree):
            tests = []
            if isinstance(n, (ast.If, ast.IfExp, ast.While, ast.Assert)):
                tests.append(n.test)
            elif isinstance(n, ast.comprehension):
                tests += n.ifs
            elif isinstance(n, ast.Match):
                tests.append(n.subject)
            elif isinstance(n, ast.Call) and isinstance(n.func, (ast.Name, ast.Attribute)) and getattr(n.func, "attr", getattr(n.func, "id", "")) in ("sorted", "sort", "filter", "min", "max"):
                tests += list(n.args) + [k.value for k in n.keywords]
            offenders += [f"{path.relative_to(APP)}:{t.lineno}" for t in tests if _mentions(t)]
    assert not offenders, offenders


def test_only_the_adapter_and_the_list_helpers_name_media_integrity_in_the_application():
    holders = {str(p.relative_to(APP)) for p in APP.rglob("*.py") if "media_integrity" in p.read_text()}
    assert holders == {"services/image_assessment.py", "routers/operations.py"}, holders
    ops = (APP / "routers" / "operations.py").read_text()
    assert set(re.findall(r"\w*media_integrity\w*", ops)) == {"attach_media_integrity_status"}   # only the display helper, never the data itself
    # the list query only SELECTS the helper columns; they appear in no WHERE / ORDER BY / GROUP BY
    q = re.search(r'query = """(.*?)"""', ops, re.S).group(1)
    assert "_image_assessment" in q and q.split("FROM resq_incidents i")[1].strip() == ""     # the literal ends with the FROM; the helper columns are inside SELECT subqueries
    appended = [l for l in ops.splitlines() if l.strip().startswith(("query +=", "clauses.append", "params["))]
    assert appended and not [l for l in appended if "_image_" in l or "authenticity" in l or "media_integrity" in l]
    for name in ("citizen.py", "workflow.py"):
        assert "media_integrity" not in (APP / "routers" / name).read_text()
    assert "media_integrity" not in (APP / "routers_ext" / "public.py").read_text()

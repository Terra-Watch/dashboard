"""Official notices (D-09) against the real database and the real app: approval, visibility, expiry, revisions, audit."""
from datetime import datetime, timedelta, timezone

import pytest

from tests.test_fire_evidence_routes import actor, database, db_one, db_scalar, isolated  # noqa: F401

NOW = datetime.now(timezone.utc)


def body(**over):
    data = {"title": "Smoke advisory", "body": "Avoid the ridge road.", "severity": "advisory", "regions": ["OD"],
            "starts_at": (NOW - timedelta(hours=1)).isoformat(), "expires_at": (NOW + timedelta(hours=6)).isoformat()}
    data.update(over)
    return data


def create(author, **over):
    client, headers, _ = author
    resp = client.post("/api/notices", json=body(**over), headers=headers)
    assert resp.status_code == 201, resp.text
    return resp.json()


def post(who, path, payload=None):
    client, headers, _ = who
    return client.post(path, json=payload, headers=headers)


def published(author, approver, **over):
    notice = create(author, **over)
    assert post(author, f"/api/notices/{notice['id']}/submit").status_code == 200
    resp = post(approver, f"/api/notices/{notice['id']}/approve")
    assert resp.status_code == 200, resp.text
    return resp.json()


def ids(who, **params):
    client, headers, _ = who
    resp = client.get("/api/notices", params=params, headers=headers)
    assert resp.status_code == 200, resp.text
    return {item["id"] for item in resp.json()["items"]}


@pytest.fixture
def team():
    return {"author": actor("control_room_operator", scopes=["OD"]), "lead": actor("incident_commander", scopes=["OD"]),
            "citizen": actor("citizen"), "ranger": actor("field_crew", scopes=["OD"]), "officer": actor("range_officer", scopes=["OD"])}


def test_happy_path_publish_and_audit_and_revisions(team):
    notice = create(team["author"])
    nid = notice["id"]
    assert notice["status"] == "draft"
    edit = team["author"][0].patch(f"/api/notices/{nid}", json={"title": "Smoke advisory v2"}, headers=team["author"][1])
    assert edit.status_code == 200 and edit.json()["title"] == "Smoke advisory v2"
    assert db_scalar("SELECT count(*) FROM resq_notice_revisions WHERE notice_id=:i", i=nid) == 2
    assert post(team["author"], f"/api/notices/{nid}/submit").json()["status"] == "pending_approval"
    done = post(team["lead"], f"/api/notices/{nid}/approve").json()
    assert done["status"] == "published" and done["approver_id"] == team["lead"][2] and done["published_at"]
    actions = {r[0] for r in [(a,) for a in
              [db_scalar("SELECT action FROM resq_audit_log WHERE entity_type='notice' AND entity_id=:e AND action=:a LIMIT 1", e=str(nid), a=a)
               for a in ("notice_created", "notice_edited", "notice_submitted", "notice_approved")]]}
    assert actions == {"notice_created", "notice_edited", "notice_submitted", "notice_approved"}
    revs = team["author"][0].get(f"/api/notices/{nid}/revisions", headers=team["author"][1]).json()["items"]
    assert [r["revision_no"] for r in revs] == [1, 2] and revs[0]["title"] == "Smoke advisory"


def test_self_approval_refused_even_for_lead(team):
    lead_author = team["lead"]
    notice = create(lead_author)
    post(lead_author, f"/api/notices/{notice['id']}/submit")
    resp = post(lead_author, f"/api/notices/{notice['id']}/approve")
    assert resp.status_code == 403
    assert db_scalar("SELECT status FROM resq_notices WHERE id=:i", i=notice["id"]) == "pending_approval"


def test_operator_cannot_approve_and_nothing_unpending_can_be_approved(team):
    notice = create(team["author"])
    other_operator = actor("control_room_operator", scopes=["OD"])
    assert post(other_operator, f"/api/notices/{notice['id']}/approve").status_code == 403
    assert post(team["lead"], f"/api/notices/{notice['id']}/approve").status_code == 409  # still a draft
    assert db_scalar("SELECT status FROM resq_notices WHERE id=:i", i=notice["id"]) == "draft"


def test_return_needs_reason_then_author_can_edit_and_resubmit(team):
    notice = create(team["author"])
    nid = notice["id"]
    post(team["author"], f"/api/notices/{nid}/submit")
    assert post(team["lead"], f"/api/notices/{nid}/return", {"reason": "  "}).status_code == 422
    assert post(team["lead"], f"/api/notices/{nid}/return", {}).status_code == 422
    resp = post(team["lead"], f"/api/notices/{nid}/return", {"reason": "Name the district"})
    assert resp.json()["status"] == "draft" and resp.json()["return_reason"] == "Name the district"
    assert db_scalar("SELECT count(*) FROM resq_audit_log WHERE entity_type='notice' AND entity_id=:e AND action='notice_returned'", e=str(nid)) == 1
    assert team["author"][0].patch(f"/api/notices/{nid}", json={"regions": ["OD-KHU"]}, headers=team["author"][1]).status_code == 200
    assert post(team["author"], f"/api/notices/{nid}/submit").status_code == 200


def test_published_notice_cannot_be_edited_or_resubmitted(team):
    notice = published(team["author"], team["lead"])
    assert team["author"][0].patch(f"/api/notices/{notice['id']}", json={"title": "x"}, headers=team["author"][1]).status_code == 409
    assert post(team["author"], f"/api/notices/{notice['id']}/submit").status_code == 409


def test_citizen_never_sees_drafts_or_pending(team):
    draft = create(team["author"], title="Draft only")
    pending = create(team["author"], title="Pending")
    post(team["author"], f"/api/notices/{pending['id']}/submit")
    live = published(team["author"], team["lead"], title="Live")
    for role in ("citizen", "ranger", "officer"):
        seen = ids(team[role])
        assert live["id"] in seen and draft["id"] not in seen and pending["id"] not in seen
        item = next(i for i in team[role][0].get("/api/notices", headers=team[role][1]).json()["items"] if i["id"] == live["id"])
        assert "author_id" not in item and "status" not in item
    assert draft["id"] in ids(team["author"]) and pending["id"] in ids(team["lead"])


def test_expired_and_not_yet_started_hidden_from_public_but_visible_to_staff(team):
    fresh = datetime.now(timezone.utc)
    old = create(team["author"], starts_at=(fresh - timedelta(days=2)).isoformat(), expires_at=(fresh + timedelta(seconds=6)).isoformat())
    post(team["author"], f"/api/notices/{old['id']}/submit")
    assert post(team["lead"], f"/api/notices/{old['id']}/approve").status_code == 200
    assert old["id"] in ids(team["citizen"])
    import time
    time.sleep(max(0.0, 6.3 - (datetime.now(timezone.utc) - fresh).total_seconds()))
    assert old["id"] not in ids(team["citizen"])
    staff_item = next(i for i in team["author"][0].get("/api/notices", headers=team["author"][1]).json()["items"] if i["id"] == old["id"])
    assert staff_item["expired"] is True
    future = published(team["author"], team["lead"], starts_at=(NOW + timedelta(hours=2)).isoformat(), expires_at=(NOW + timedelta(hours=3)).isoformat())
    assert future["id"] not in ids(team["citizen"])


def test_region_filter_and_withdraw(team):
    od = published(team["author"], team["lead"], regions=["OD"])
    khu = published(team["author"], team["lead"], regions=["OD-KHU"])
    assert {od["id"], khu["id"]} <= ids(team["citizen"])
    assert od["id"] in ids(team["citizen"], region="OD-KHU") and khu["id"] in ids(team["citizen"], region="OD-KHU")
    assert khu["id"] not in ids(team["citizen"], region="OD-PUR") and od["id"] in ids(team["citizen"], region="OD-PUR")
    assert od["id"] not in ids(team["citizen"], region="CG")
    assert post(team["author"], f"/api/notices/{od['id']}/withdraw", {}).status_code == 422
    assert post(team["citizen"], f"/api/notices/{od['id']}/withdraw", {"reason": "x"}).status_code == 403
    resp = post(team["author"], f"/api/notices/{od['id']}/withdraw", {"reason": "Fire contained"})
    assert resp.status_code == 200 and resp.json()["status"] == "withdrawn"
    assert od["id"] not in ids(team["citizen"])
    assert db_scalar("SELECT count(*) FROM resq_audit_log WHERE entity_type='notice' AND entity_id=:e AND action='notice_withdrawn'", e=str(od["id"])) == 1


def test_officer_reads_published_but_cannot_create(team):
    live = published(team["author"], team["lead"])
    assert live["id"] in ids(team["officer"])
    client, headers, _ = team["officer"]
    assert client.post("/api/notices", json=body(), headers=headers).status_code == 403
    citizen = team["citizen"]
    assert citizen[0].post("/api/notices", json=body(), headers=citizen[1]).status_code == 403


def test_scope_limits_staff_and_authoring(team):
    other = actor("control_room_operator", scopes=["CG"])
    mine = create(team["author"])
    assert mine["id"] not in ids(other)
    assert other[0].post("/api/notices", json=body(), headers=other[1]).status_code == 403
    admin = actor("admin")
    assert mine["id"] in ids(admin)


def test_validation_and_csrf(team):
    client, headers, _ = team["author"]
    assert client.post("/api/notices", json=body(regions=[]), headers=headers).status_code == 422
    assert client.post("/api/notices", json=body(title="x" * 121), headers=headers).status_code == 422
    assert client.post("/api/notices", json=body(body="x" * 1001), headers=headers).status_code == 422
    assert client.post("/api/notices", json=body(severity="panic"), headers=headers).status_code == 422
    assert client.post("/api/notices", json=body(expires_at=(NOW - timedelta(hours=2)).isoformat()), headers=headers).status_code == 422
    bearer_only = {"Authorization": headers["Authorization"]}
    client.cookies.clear()
    assert client.post("/api/notices", json=body(), headers=bearer_only).status_code == 403
    assert client.get("/api/notices").status_code == 401


def test_database_constraints_reject_bad_rows(team):
    from sqlalchemy import text
    from app.database.session import engine
    with pytest.raises(Exception):
        with engine.begin() as db:
            db.execute(text("""INSERT INTO resq_notices (title,body,severity,regions,starts_at,expires_at,status,author_id)
                VALUES ('t','b','info','{}',now(),now()+interval '1 hour','draft',:a)"""), {"a": team["author"][2]})
    with pytest.raises(Exception):
        with engine.begin() as db:
            db.execute(text("""INSERT INTO resq_notices (title,body,severity,regions,starts_at,expires_at,status,author_id)
                VALUES ('t','b','info','{OD}',now(),now()+interval '1 hour','bogus',:a)"""), {"a": team["author"][2]})

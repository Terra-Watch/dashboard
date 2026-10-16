"""Citizen's own data: report timeline, export, and account deletion (real PostgreSQL)."""
import json

from tests.test_citizen_auth import GOOD, email, register
from tests.test_auth import fresh_client
from tests.test_fire_evidence_routes import actor, citizen_report, database, db_one, db_scalar, isolated  # noqa: F401


def test_timeline_shows_only_status_changes_and_the_closure_reason():
    c, h, uid = actor("citizen"); rid = citizen_report(uid)
    ops, oh, _ = actor("control_room_operator", scopes=["OD"])
    ops.patch(f"/api/incidents/{rid}/status", headers=oh, json={"status": "verified", "notes": "internal staff note"})
    ops.patch(f"/api/incidents/{rid}/status", headers=oh, json={"status": "closed", "close_reason": "false_alarm"})
    r = c.get(f"/api/citizen/reports/{rid}/timeline", headers=h)
    assert r.status_code == 200
    kinds = [e["kind"] for e in r.json()["items"]]
    assert kinds == ["received", "verified", "closed"]
    assert r.json()["items"][-1]["close_reason"] == "false_alarm"
    assert "internal staff note" not in r.text and "notes" not in r.text


def test_timeline_belongs_to_the_reporter_only():
    c, h, uid = actor("citizen"); rid = citizen_report(uid)
    other, oh, _ = actor("citizen")
    assert other.get(f"/api/citizen/reports/{rid}/timeline", headers=oh).status_code == 404


def test_export_contains_my_data_and_nobody_elses():
    c, h, uid = actor("citizen"); rid = citizen_report(uid)
    other, oh, ouid = actor("citizen"); orid = citizen_report(ouid)
    data = c.get("/api/citizen/account/export", headers=h).json()
    assert data["account"]["id"] == uid and [r["id"] for r in data["reports"]] == [rid]
    assert str(orid) not in json.dumps([r["id"] for r in data["reports"]])
    assert "password" not in json.dumps(data).lower()


def test_delete_needs_the_password_then_removes_sign_in_and_writing_but_keeps_the_report_record():
    c = fresh_client(); address = email(); created = register(c, address)
    uid = created.json()["user"]["id"]; headers = {"Authorization": f"Bearer {created.json()['access_token']}", "x-resq-csrf": c.cookies.get("resq_csrf")}
    rid = citizen_report(uid)
    post = c.post("/api/community/posts", headers=headers, json={"content": "A question about water points"})
    assert post.status_code == 201
    assert c.request("DELETE", "/api/citizen/account", headers=headers, json={"password": "wrong-password-here"}).status_code == 403
    assert db_scalar("SELECT deleted_at FROM resq_users WHERE id=:i", i=uid) is None
    done = c.request("DELETE", "/api/citizen/account", headers=headers, json={"password": GOOD})
    assert done.status_code == 200
    row = db_one("SELECT name,email,deleted_at FROM resq_users WHERE id=:i", i=uid)
    assert row["name"] == "Deleted member" and row["email"].endswith("@deleted.invalid") and row["deleted_at"] is not None
    assert fresh_client().post("/api/auth/sign-in", json={"email": address, "password": GOOD}).status_code == 401
    assert db_scalar("SELECT removed_at FROM resq_community_posts WHERE author_id=:i", i=uid) is not None
    assert db_scalar("SELECT status FROM resq_community_posts WHERE author_id=:i", i=uid) == 'removed'
    assert db_scalar("SELECT count(*) FROM resq_incidents WHERE id=:r", r=rid) == 1               # the report stays as a safety record
    assert db_scalar("SELECT count(*) FROM resq_refresh_tokens WHERE user_id=:i", i=uid) == 0


def test_evidence_is_never_cached_publicly():
    import io
    from tests.test_fire_evidence_adapter import jpeg_bytes
    c, h, uid = actor("citizen"); rid = citizen_report(uid)
    up = c.post(f"/api/citizen/reports/{rid}/evidence", headers=h, files={"image": ("a.jpg", jpeg_bytes(), "image/jpeg")})
    assert up.status_code == 201
    got = c.get(f"/api/citizen/reports/{rid}/evidence/{up.json()['evidence']['id']}", headers=h)
    assert got.status_code == 200 and got.headers["cache-control"] == "private, no-store"

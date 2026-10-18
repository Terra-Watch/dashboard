"""Community: author edit window, deletion, moderator removal with a reason, reporting and the moderation queue (real PostgreSQL)."""
import pytest

from app.database.session import engine
from sqlalchemy import text
from tests.test_fire_evidence_routes import actor, database, db_one, db_scalar, isolated  # noqa: F401


def post(client, headers, text_="How do I know if smoke near my village is dangerous?"):
    r = client.post("/api/community/posts", headers=headers, json={"content": text_, "post_type": "question", "region": "Similipal"})
    assert r.status_code == 201, r.text
    return r.json()["post"]["id"]


def test_author_can_edit_inside_the_window_and_not_after():
    c, h, _ = actor("citizen"); pid = post(c, h)
    r = c.patch(f"/api/community/posts/{pid}", headers=h, json={"content": "Corrected question text"})
    assert r.status_code == 200 and r.json()["post"]["edited_at"]
    with engine.begin() as db:
        db.execute(text("UPDATE resq_community_posts SET created_at = now() - interval '16 minutes' WHERE id=:i"), {"i": pid})
    late = c.patch(f"/api/community/posts/{pid}", headers=h, json={"content": "Too late"})
    assert late.status_code == 409 and "15 minutes" in late.json()["detail"]
    assert db_scalar("SELECT content FROM resq_community_posts WHERE id=:i", i=pid) == "Corrected question text"


def test_window_is_configurable(monkeypatch):
    monkeypatch.setenv("COMMUNITY_EDIT_WINDOW_MINUTES", "0")
    c, h, _ = actor("citizen"); pid = post(c, h)
    with engine.begin() as db:
        db.execute(text("UPDATE resq_community_posts SET created_at = now() - interval '1 minute' WHERE id=:i"), {"i": pid})
    assert c.patch(f"/api/community/posts/{pid}", headers=h, json={"content": "x y z"}).status_code == 409


def test_only_the_author_edits_and_others_cannot_remove():
    c, h, _ = actor("citizen"); pid = post(c, h)
    other, oh, _ = actor("citizen")
    assert other.patch(f"/api/community/posts/{pid}", headers=oh, json={"content": "hijack"}).status_code == 403
    assert other.delete(f"/api/community/posts/{pid}", headers=oh).status_code == 403
    assert db_scalar("SELECT removed_at FROM resq_community_posts WHERE id=:i", i=pid) is None


def test_author_delete_hides_text_but_keeps_the_place_in_the_thread():
    c, h, _ = actor("citizen"); pid = post(c, h, "Please delete this later")
    assert c.delete(f"/api/community/posts/{pid}", headers=h).status_code == 200
    items = c.get("/api/community/posts", headers=h).json()["items"]
    mine = next(i for i in items if i["id"] == pid)
    assert mine["content"] is None and mine["removed"] == {"by": "author", "reason": None}
    assert c.patch(f"/api/community/posts/{pid}", headers=h, json={"content": "again"}).status_code == 409
    assert c.post(f"/api/community/posts/{pid}/comments", headers=h, json={"content": "reply"}).status_code == 404


def test_moderator_removal_needs_a_reason_and_is_shown_to_readers_and_audited():
    c, h, _ = actor("citizen"); pid = post(c, h, "Buy cheap fireworks here")
    mod, mh, mod_id = actor("control_room_operator", scopes=["OD"])
    assert mod.delete(f"/api/community/posts/{pid}", headers=mh).status_code == 422
    assert mod.request("DELETE", f"/api/community/posts/{pid}", headers=mh, json={"reason": "Advertising"}).status_code == 200
    item = next(i for i in c.get("/api/community/posts", headers=h).json()["items"] if i["id"] == pid)
    assert item["content"] is None and item["removed"] == {"by": "moderator", "reason": "Advertising"}
    row = db_one("SELECT metadata FROM resq_audit_log WHERE action='community_post_removed_by_moderator' AND entity_id=:e", e=str(pid))
    assert row["metadata"]["reason"] == "Advertising"


def test_report_queue_and_resolution_flow():
    with engine.begin() as db:  # the shared test database keeps open reports from earlier runs; the queue shows the 100 most severe
        db.execute(text("UPDATE resq_community_reports SET status='resolved', resolution='dismissed' WHERE status='open'"))
    c, h, _ = actor("citizen"); pid = post(c, h, "Burn the forest to clear land")
    r1, h1, _ = actor("citizen"); r2, h2, _ = actor("citizen")
    assert r1.post(f"/api/community/posts/{pid}/report", headers=h1, json={"reason": "Unsafe advice"}).status_code == 201
    assert r2.post(f"/api/community/posts/{pid}/report", headers=h2, json={"reason": "Harmful"}).status_code == 201
    mod, mh, _ = actor("incident_commander", scopes=["OD"])
    assert c.get("/api/community/moderation/queue", headers=h).status_code == 403          # citizens cannot see the queue
    queue = mod.get("/api/community/moderation/queue", headers=mh).json()["items"]
    mine = [q for q in queue if q["post_id"] == pid]
    assert len(mine) == 2 and mine[0]["open_reports"] == 2
    assert mod.post(f"/api/community/moderation/reports/{mine[0]['id']}/resolve", headers=mh, json={"action": "remove", "reason": "x"}).status_code == 422
    done = mod.post(f"/api/community/moderation/reports/{mine[0]['id']}/resolve", headers=mh, json={"action": "remove", "reason": "Unsafe advice"})
    assert done.status_code == 200 and done.json()["status"] == "removed"
    assert db_scalar("SELECT removal_kind FROM resq_community_posts WHERE id=:i", i=pid) == "moderator"
    assert not [q for q in mod.get("/api/community/moderation/queue", headers=mh).json()["items"] if q["post_id"] == pid]   # all reports on it resolved


def test_a_user_cannot_report_the_same_item_twice_and_comments_can_be_reported():
    c, h, _ = actor("citizen"); pid = post(c, h)
    cm = c.post(f"/api/community/posts/{pid}/comments", headers=h, json={"content": "A comment"}).json()["comment"]["id"]
    other, oh, _ = actor("citizen")
    for _ in range(2):
        assert other.post(f"/api/community/comments/{cm}/report", headers=oh, json={"reason": "Rude"}).status_code == 201
    assert db_scalar("SELECT count(*) FROM resq_community_reports WHERE comment_id=:c", c=cm) == 1


def test_current_discussion_needs_sign_in_but_the_archive_stays_readable():
    c, h, _ = actor("citizen"); post(c, h)
    from tests.test_auth import fresh_client
    anon = fresh_client()
    assert anon.get("/api/community/posts").status_code == 401
    assert anon.get("/api/community/posts?archived=true").status_code == 200
    assert c.get("/api/community/posts", headers=h).status_code == 200

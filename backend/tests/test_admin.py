"""Administrator tools and staff lifecycle (real PostgreSQL)."""
import uuid

from tests.test_fire_evidence_routes import actor, csrf_headers, database, db_scalar, fresh_client, isolated, login, make_user  # noqa: F401


def test_only_admins_see_people_and_the_list_has_scopes():
    adm, ah, _ = actor("admin")
    ops, oh, ouid = actor("control_room_operator", scopes=["OD"])
    assert ops.get("/api/admin/people", headers=oh).status_code == 403
    body = adm.get("/api/admin/people", headers=ah).json()
    me = next(s for s in body["staff"] if s["id"] == ouid)
    assert me["scopes"] == ["OD"] and me["role"] == "control_room_operator" and body["citizens"] >= 0


def test_invite_needs_a_state_and_a_good_password_and_gives_a_link():
    adm, ah, _ = actor("admin")
    email = f"new-{uuid.uuid4().hex[:8]}@resq.local"
    assert adm.post("/api/auth/invites", headers=ah, json={"email": email, "role": "control_room_operator", "scopes": []}).status_code == 422
    assert adm.post("/api/auth/invites", headers=ah, json={"email": "not-an-email", "role": "control_room_operator", "scopes": ["OD"]}).status_code == 422
    made = adm.post("/api/auth/invites", headers=ah, json={"email": email, "role": "control_room_operator", "scopes": ["od"]})
    assert made.status_code == 200, made.text
    got = made.json()
    assert got["scopes"] == ["OD"] and got["link"].endswith(f"/invite/{got['token']}") and got["emailed"] is False
    assert adm.post("/api/auth/invites", headers=ah, json={"email": email, "role": "control_room_operator", "scopes": ["OD"]}).status_code in (200, 409)
    weak = fresh_client().post(f"/api/auth/invites/{got['token']}/accept", json={"password": "password123"})
    assert weak.status_code == 422
    ok = fresh_client().post(f"/api/auth/invites/{got['token']}/accept", json={"password": "a-long-unrelated-phrase-7", "name": "Asha Rao"})
    assert ok.status_code == 200
    assert db_scalar("SELECT name FROM resq_users WHERE email=:e", e=email) == "Asha Rao"
    assert db_scalar("SELECT count(*) FROM resq_user_scopes s JOIN resq_users u ON u.id=s.user_id WHERE u.email=:e AND s.state='OD'", e=email) == 1


def test_deactivating_blocks_sign_in_and_refresh_but_not_the_last_admin_or_yourself():
    adm, ah, auid = actor("admin")
    uid, email = make_user("control_room_operator", scopes=["OD"])
    client = fresh_client()
    assert login(client, email).status_code == 200
    assert adm.post(f"/api/admin/people/{uid}/deactivate", headers=ah).json() == {"deactivated": True}
    assert client.post("/api/auth/refresh").status_code == 401                          # the open session cannot renew
    assert login(fresh_client(), email).status_code == 401                              # and cannot sign in again
    assert adm.post(f"/api/admin/people/{auid}/deactivate", headers=ah).status_code == 409   # not yourself
    assert adm.post(f"/api/admin/people/{uid}/reactivate", headers=ah).json() == {"reactivated": True}
    assert login(fresh_client(), email).status_code == 200


def test_scopes_can_be_changed_and_are_audited():
    adm, ah, _ = actor("admin")
    uid, _email = make_user("control_room_operator", scopes=["OD"])
    assert adm.put(f"/api/admin/people/{uid}/scopes", headers=ah, json={"states": []}).status_code == 422
    assert adm.put(f"/api/admin/people/{uid}/scopes", headers=ah, json={"states": ["wb", "OD"]}).json() == {"states": ["OD", "WB"]}
    assert db_scalar("SELECT count(*) FROM resq_audit_log WHERE action='staff_scopes_changed' AND entity_id=:i", i=str(uid)) == 1
    citizen, zh, cuid = actor("citizen")
    assert adm.put(f"/api/admin/people/{cuid}/scopes", headers=ah, json={"states": ["OD"]}).status_code == 404   # citizens are not staff


def test_access_requests_can_be_marked_handled():
    adm, ah, _ = actor("admin")
    r = fresh_client().post("/api/auth/access-requests", json={"name": "N", "designation": "D", "department": "Forest", "email": f"{uuid.uuid4().hex[:6]}@x.in", "state": "OD", "reason": "Range work"})
    assert r.status_code == 202
    rid = adm.get("/api/admin/people", headers=ah).json()["requests"][0]["id"]
    assert adm.post(f"/api/admin/access-requests/{rid}/handled", headers=ah).status_code == 200
    assert rid not in {x["id"] for x in adm.get("/api/admin/people", headers=ah).json()["requests"]}
    assert adm.post(f"/api/admin/access-requests/{rid}/handled", headers=ah).status_code == 404


def test_a_deactivated_persons_existing_token_stops_working_at_once():
    adm, ah, _ = actor("admin")
    uid, email = make_user("control_room_operator", scopes=["OD"])
    client = fresh_client()
    token = login(client, email).json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/handover/notes", headers=headers).status_code == 200
    adm.post(f"/api/admin/people/{uid}/deactivate", headers=ah)
    assert client.get("/api/handover/notes", headers=headers).status_code == 401
    adm.post(f"/api/admin/people/{uid}/reactivate", headers=ah)
    assert client.get("/api/handover/notes", headers=headers).status_code == 200


def test_alert_rules_are_limited_to_the_states_the_person_covers():
    ops, oh, _ = actor("control_room_operator", scopes=["OD"])
    base = {"name": "r", "kind": "incident", "enabled": True, "channel": "in-app", "severity": "warning", "conditions": {}}
    assert ops.post("/api/alerts/rules", headers=oh, json={**base, "state": None}).status_code == 422
    assert ops.post("/api/alerts/rules", headers=oh, json={**base, "state": "TS"}).status_code == 403
    assert ops.post("/api/alerts/rules", headers=oh, json={**base, "state": "OD"}).status_code == 201

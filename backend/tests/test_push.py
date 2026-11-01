"""Alerts on a phone: subscribe per state, one push per alert, forgotten when the phone is gone, nothing when not configured."""
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from sqlalchemy import text  # noqa: E402

from app.database.session import engine, init_db  # noqa: E402
from app.services import push  # noqa: E402
from tests.test_citizen_report_route import body, citizen  # noqa: E402
from tests.test_fire_evidence_routes import actor  # noqa: E402
from tests.test_incident_alert import confirmed_incident  # noqa: E402


@pytest.fixture(scope="module", autouse=True)
def database():
    init_db()


@pytest.fixture
def configured(monkeypatch):
    with engine.begin() as db:                                                       # leftovers of earlier runs would also be pushed to
        db.execute(text("DELETE FROM resq_push_subscriptions WHERE endpoint LIKE 'https://push.example/%'"))
    monkeypatch.setenv("PUSH_VAPID_PUBLIC_KEY", "BPublicKeyForTests"); monkeypatch.setenv("PUSH_VAPID_PRIVATE_KEY", "private-for-tests")
    sent = []
    def fake(subscription, payload):
        sent.append((subscription["endpoint"], payload))
        return 410 if "gone" in subscription["endpoint"] else 201
    monkeypatch.setattr(push, "_send_one", fake)
    return sent


def sub(endpoint, state="OD"):
    return {"endpoint": f"https://push.example/{endpoint}", "keys": {"p256dh": "k" * 20, "auth": "a" * 12}, "state": state}


def alert(client_state_lat=20.3, lon=85.8):
    reporter, rh, _ = citizen()
    rid = reporter.post("/api/citizen/reports", headers=rh, json=body(latitude=client_state_lat, longitude=lon)).json()["report"]["id"]
    staff, sh, _ = actor("control_room_operator", scopes=["OD"]); confirmed_incident(staff, sh, rid)
    return staff.post(f"/api/notices/from-incident/{rid}", headers=sh, json={"radius_km": 5}).json()


def test_nothing_is_offered_when_push_is_not_configured(monkeypatch):
    monkeypatch.delenv("PUSH_VAPID_PUBLIC_KEY", raising=False); monkeypatch.delenv("PUSH_VAPID_PRIVATE_KEY", raising=False)
    client, headers, _ = citizen()
    assert client.get("/api/push/config", headers=headers).json() == {"enabled": False, "public_key": None}
    assert client.post("/api/push/subscribe", headers=headers, json=sub("a")).status_code == 503


def test_an_alert_pushes_once_to_each_phone_in_its_state_and_forgets_dead_ones(configured):
    mine, mh, _ = citizen(); other, oh, _ = citizen(); elsewhere, eh, _ = citizen(); dead, dh, _ = citizen()
    tag = __import__("uuid").uuid4().hex[:8]
    assert mine.post("/api/push/subscribe", headers=mh, json=sub(f"mine-{tag}")).status_code == 201
    assert other.post("/api/push/subscribe", headers=oh, json=sub(f"other-{tag}")).status_code == 201
    assert elsewhere.post("/api/push/subscribe", headers=eh, json=sub(f"far-{tag}", "MH")).status_code == 201
    assert dead.post("/api/push/subscribe", headers=dh, json=sub(f"gone-{tag}")).status_code == 201
    notice = alert()
    endpoints = [e for e, _ in configured if tag in e]
    assert sorted(endpoints) == sorted([f"https://push.example/mine-{tag}", f"https://push.example/other-{tag}", f"https://push.example/gone-{tag}"])   # not the MH phone
    assert all('"url": "/citizen/near-me"' in p for _, p in configured)
    with engine.connect() as db:
        left = db.execute(text("SELECT endpoint FROM resq_push_subscriptions WHERE endpoint LIKE :t"), {"t": f"%{tag}"}).scalars().all()
        logged = db.execute(text("SELECT count(*) FROM resq_push_log WHERE notice_id=:n"), {"n": notice["id"]}).scalar()
    assert not any("gone" in e for e in left) and any("far" in e for e in left)                  # the dead phone is forgotten
    assert logged >= 2
    before = len(configured)
    push.send_for_notice(notice["id"], "OD", "t")
    assert not [e for e, _ in configured[before:] if tag in e and "gone" not in e]               # nobody gets it twice


def test_unsubscribe_removes_only_your_own_phone(configured):
    a, ah, _ = citizen(); b, bh, _ = citizen()
    url = sub(f"mine-{__import__('uuid').uuid4().hex[:8]}")
    a.post("/api/push/subscribe", headers=ah, json=url)
    b.post("/api/push/unsubscribe", headers=bh, json={"endpoint": url["endpoint"]})
    with engine.connect() as db:
        assert db.execute(text("SELECT count(*) FROM resq_push_subscriptions WHERE endpoint=:e"), {"e": url["endpoint"]}).scalar() == 1
    a.post("/api/push/unsubscribe", headers=ah, json={"endpoint": url["endpoint"]})
    with engine.connect() as db:
        assert db.execute(text("SELECT count(*) FROM resq_push_subscriptions WHERE endpoint=:e"), {"e": url["endpoint"]}).scalar() == 0

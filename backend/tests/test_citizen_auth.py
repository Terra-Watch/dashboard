"""Citizen sign-up and password reset: password policy, recorded consent, neutral answers, expiring single-use links, session revocation."""
import uuid

import pytest
from sqlalchemy import text

from app.database.session import engine
from app.services import mailer
from tests.test_auth import fresh_client
from tests.test_fire_evidence_routes import database, db_one, db_scalar, isolated  # noqa: F401

GOOD = "correct-horse-battery-staple-9"


def email():
    return f"cit-{uuid.uuid4().hex[:10]}@resq.local"


def register(client, address=None, password=GOOD, terms=True):
    return client.post("/api/auth/citizen/register", json={"name": "Asha", "email": address or email(), "password": password, "accepted_terms": terms})


def test_registration_records_consent_and_requires_it():
    c = fresh_client(); address = email()
    assert register(c, address, terms=False).status_code == 422
    assert db_scalar("SELECT count(*) FROM resq_users WHERE email=:e", e=address) == 0
    assert register(c, address).status_code == 201
    assert db_scalar("SELECT consented_at FROM resq_users WHERE email=:e", e=address) is not None


@pytest.mark.parametrize("password,fragment", [("short1", "at least 10"), ("password123", "too easy"), ("aaaaaaaaaaaa", "too easy"), ("asha.rao-2026!", "email")])
def test_weak_passwords_are_refused_with_a_plain_reason(password, fragment):
    c = fresh_client()
    r = register(c, "asha.rao@resq.local", password=password)
    assert r.status_code == 422 and fragment in r.json()["detail"]


def test_reset_request_is_neutral_and_honest_when_email_is_not_configured(monkeypatch):
    for name in ("SMTP_HOST", "SMTP_FROM", "PUBLIC_BASE_URL"):
        monkeypatch.delenv(name, raising=False)
    c = fresh_client(); address = email(); register(c, address)
    known = c.post("/api/auth/citizen/password-reset/request", json={"email": address})
    unknown = c.post("/api/auth/citizen/password-reset/request", json={"email": email()})
    assert known.status_code == unknown.status_code == 202 and known.json() == unknown.json() == {"status": "received", "delivery": "unavailable"}
    assert db_scalar("SELECT count(*) FROM resq_password_resets r JOIN resq_users u ON u.id=r.user_id WHERE u.email=:e", e=address) == 0


def configured(monkeypatch):
    monkeypatch.setenv("SMTP_HOST", "smtp.invalid"); monkeypatch.setenv("SMTP_FROM", "noreply@terrawatch.invalid"); monkeypatch.setenv("PUBLIC_BASE_URL", "https://terrawatch.invalid")
    sent = []
    monkeypatch.setattr("app.routers.auth.send_email", lambda to, subject, body: sent.append((to, subject, body)) or True)
    return sent


def test_reset_flow_sends_one_link_that_works_once_and_ends_old_sessions(monkeypatch):
    sent = configured(monkeypatch)
    c = fresh_client(); address = email(); first = register(c, address); assert first.status_code == 201
    uid = first.json()["user"]["id"]
    assert c.post("/api/auth/citizen/password-reset/request", json={"email": address}).json()["delivery"] == "email"
    assert c.post("/api/auth/citizen/password-reset/request", json={"email": email()}).status_code == 202
    assert len(sent) == 1 and sent[0][0] == address and "https://terrawatch.invalid/citizen/reset?token=" in sent[0][2]
    token = sent[0][2].split("token=")[1].split()[0]
    assert c.post(f"/api/auth/password-reset/{token}/complete", json={"password": "password123"}).status_code == 422       # policy applies here too
    assert c.post(f"/api/auth/password-reset/{token}/complete", json={"password": "a-brand-new-long-passphrase"}).status_code == 200
    assert c.post(f"/api/auth/password-reset/{token}/complete", json={"password": "another-long-passphrase-1"}).status_code == 400   # single use
    assert db_scalar("SELECT count(*) FROM resq_refresh_tokens WHERE user_id=:u AND revoked_at IS NULL", u=uid) == 0
    fresh = fresh_client()
    assert fresh.post("/api/auth/citizen/login", json={"email": address, "password": GOOD}).status_code == 401
    assert fresh.post("/api/auth/citizen/login", json={"email": address, "password": "a-brand-new-long-passphrase"}).status_code == 200


def test_reset_links_are_rate_limited_and_expire(monkeypatch):
    sent = configured(monkeypatch)
    c = fresh_client(); address = email(); register(c, address)
    for _ in range(5):
        assert c.post("/api/auth/citizen/password-reset/request", json={"email": address}).status_code == 202
    assert len(sent) == 3                                                                                 # three per hour, then silence
    token = sent[0][2].split("token=")[1].split()[0]
    with engine.begin() as db:
        db.execute(text("UPDATE resq_password_resets SET expires_at = now() - interval '1 minute'"))
    assert c.post(f"/api/auth/password-reset/{token}/complete", json={"password": "a-brand-new-long-passphrase"}).status_code == 400


def test_a_staff_account_cannot_use_the_citizen_reset(monkeypatch):
    sent = configured(monkeypatch)
    from tests.test_auth import make_user
    _uid, staff_email = make_user("control_room_operator")
    assert fresh_client().post("/api/auth/citizen/password-reset/request", json={"email": staff_email}).status_code == 202
    assert sent == []


def test_mailer_sends_nothing_when_unconfigured(monkeypatch):
    for name in ("SMTP_HOST", "SMTP_FROM", "PUBLIC_BASE_URL"):
        monkeypatch.delenv(name, raising=False)
    assert mailer.email_configured() is False and mailer.send_email("a@b.c", "s", "b") is False


def test_one_sign_in_endpoint_serves_citizens_and_staff():
    from tests.test_auth import make_user
    c = fresh_client(); address = email(); register(c, address)
    citizen = fresh_client().post("/api/auth/sign-in", json={"email": address, "password": GOOD})
    assert citizen.status_code == 200 and citizen.json()["user"]["role"] == "citizen"
    _uid, staff_email = make_user("field_crew")
    staff = fresh_client().post("/api/auth/sign-in", json={"email": staff_email, "password": "test-pass-123"})
    assert staff.status_code == 200 and staff.json()["user"]["role"] == "field_crew"
    bad = fresh_client().post("/api/auth/sign-in", json={"email": address, "password": "wrong-password-here"})
    assert bad.status_code == 401 and bad.json()["detail"] == "Invalid email or password."
    other = fresh_client().post("/api/auth/sign-in", json={"email": email(), "password": "wrong-password-here"})
    assert other.json() == bad.json()                                                       # same answer whether or not the account exists


def test_development_accounts_are_off_unless_enabled_and_never_in_production(monkeypatch):
    from app.database import session
    monkeypatch.delenv("RESQ_SEED_DEV_ACCOUNTS", raising=False)
    assert session.dev_accounts_enabled() is False
    monkeypatch.setenv("RESQ_SEED_DEV_ACCOUNTS", "true")
    assert session.dev_accounts_enabled() is True
    monkeypatch.setenv("RESQ_ENV", "production")
    assert session.dev_accounts_enabled() is False

"""The system check finds the settings problems that otherwise only show when a person hits them."""
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

import pytest  # noqa: E402

from app.database.session import init_db  # noqa: E402
from app.services.diagnostics import config_findings, dev_account_findings  # noqa: E402
from tests.test_fire_evidence_routes import actor  # noqa: E402

@pytest.fixture(scope="module", autouse=True)
def database():
    init_db()


GOOD = {"VERCEL": "1", "RESQ_ENV": "production", "TERRAWATCH_ENV": "production", "RESQ_SECRET_KEY": "x" * 40, "FIRE_EVIDENCE_INFERENCE_ENABLED": "true", "FIRE_EVIDENCE_REMOTE_URL": "https://host.example",
        "FIRE_EVIDENCE_REMOTE_TOKEN": "t", "FIRE_EVIDENCE_REPORT_AUTHENTICITY_ENABLED": "true", "BLOB_STORAGE_ENABLED": "true", "BLOB_READ_WRITE_TOKEN": "b", "COMMUNITY_IMAGES_ENABLED": "true",
        "FIRE_EVIDENCE_COMMUNITY_ENABLED": "true", "PUSH_VAPID_PUBLIC_KEY": "p", "PUSH_VAPID_PRIVATE_KEY": "q", "CORROBORATION_RADIUS_KM": "2", "CORROBORATION_WINDOW_MINUTES": "360"}


def ids(env, level=None):
    return {f["id"] for f in config_findings(env) if level is None or f["level"] == level}


def test_a_healthy_production_setup_has_no_failures_or_warnings():
    assert ids(GOOD) == {"settings"}


def test_the_conflict_that_stopped_every_photo_check_is_caught():
    assert "experimental_conflict" in ids({**GOOD, "FIRE_EVIDENCE_EXPERIMENTAL_ENABLED": "true", "TERRAWATCH_ENV": "development"}, "fail")
    assert "environment_name" in ids({**GOOD, "TERRAWATCH_ENV": "development"}, "fail")


def test_missing_pieces_are_caught():
    assert "remote_token" in ids({**GOOD, "FIRE_EVIDENCE_REMOTE_TOKEN": ""}, "fail")
    assert "no_model" in ids({k: v for k, v in GOOD.items() if k != "FIRE_EVIDENCE_REMOTE_URL"} | {"VERCEL": ""}, "fail")
    assert "storage" in ids({**GOOD, "BLOB_STORAGE_ENABLED": ""}, "fail")
    assert "storage_token" in ids({**GOOD, "BLOB_READ_WRITE_TOKEN": ""}, "fail")
    assert "secret_key" in ids({**GOOD, "RESQ_SECRET_KEY": "short"}, "fail")
    assert "push_keys" in ids({**GOOD, "PUSH_VAPID_PRIVATE_KEY": ""}, "fail")
    assert "seed_dev_accounts" in ids({**GOOD, "RESQ_SEED_DEV_ACCOUNTS": "true"}, "fail")


def test_things_that_work_but_hide_results_are_warned_about():
    w = ids({**GOOD, "FIRE_EVIDENCE_SHADOW_MODE": "true", "FIRE_EVIDENCE_REPORT_AUTHENTICITY_ENABLED": "", "FIRE_EVIDENCE_COMMUNITY_ENABLED": "", "CORROBORATION_RADIUS_KM": ""}, "warn")
    assert {"shadow_on", "report_authenticity_off", "community_unchecked", "corroboration_off"} <= w


def test_test_accounts_in_production_are_a_failure():
    assert dev_account_findings(["a@x.org", "citizen.dev@terrawatch.local"], True)[0]["level"] == "fail"
    assert dev_account_findings(["citizen.dev@terrawatch.local"], False) == []


def test_only_staff_may_run_it_and_it_reports_the_database():
    staff, headers, _ = actor("control_room_operator", scopes=["OD"])
    body = staff.get("/api/ops/diagnostics", headers=headers).json()
    assert {"summary", "findings"} <= set(body) and any(f["id"] == "database" and f["level"] == "ok" for f in body["findings"])
    citizen, ch, _ = actor("citizen")
    assert citizen.get("/api/ops/diagnostics", headers=ch).status_code == 403

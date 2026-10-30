import io, json
import pytest
from app.services import image_assessment as ia


class _Resp(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *a): return False


@pytest.fixture
def remote(monkeypatch):
    for k, v in {"FIRE_EVIDENCE_REMOTE_URL": "https://model.example", "FIRE_EVIDENCE_REMOTE_TOKEN": "t", "FIRE_EVIDENCE_INFERENCE_ENABLED": "true"}.items():
        monkeypatch.setenv(k, v)


def _answer(monkeypatch, body):
    seen = {}
    def fake(req, timeout):
        seen["req"] = req
        return _Resp(json.dumps(body).encode())
    monkeypatch.setattr("urllib.request.urlopen", fake)
    return seen


def test_remote_good_result_passes_and_sends_token(remote, monkeypatch):
    good = {**ia.unavailable("X"), "assessment_status": "COMPLETED", "artifact_status": "APPROVED", "model_version": ia.model_version_for("report")}
    seen = _answer(monkeypatch, good)
    assert ia.configuration_error("report") is None
    assert ia._assess_remote(b"img", "i1", "report")["assessment_status"] == "COMPLETED"
    assert seen["req"].get_header("X-service-token") == "t"


def test_remote_unapproved_or_wrong_version_is_unavailable(remote, monkeypatch):
    bad = {**ia.unavailable("X"), "assessment_status": "COMPLETED", "artifact_status": None, "model_version": ia.model_version_for("report")}
    _answer(monkeypatch, bad)
    assert ia._assess_remote(b"img", "i1", "report")["error_code"] == ia.RESULT_INVALID


def test_remote_network_error_is_unavailable(remote, monkeypatch):
    def boom(req, timeout): raise OSError("down")
    monkeypatch.setattr("urllib.request.urlopen", boom)
    assert ia._assess_remote(b"img", "i1", "report")["error_code"] == ia.INFERENCE_FAILED


def test_remote_without_token_is_not_configured(monkeypatch):
    monkeypatch.setenv("FIRE_EVIDENCE_REMOTE_URL", "https://model.example"); monkeypatch.delenv("FIRE_EVIDENCE_REMOTE_TOKEN", raising=False)
    assert ia.configuration_error("report") == ia.NOT_CONFIGURED

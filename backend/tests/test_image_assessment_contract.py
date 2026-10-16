from pathlib import Path

from PIL import Image


def test_assessor_adapter_fails_closed_without_artifact(monkeypatch):
    monkeypatch.delenv("FIRE_EVIDENCE_REPO", raising=False)
    monkeypatch.delenv("FIRE_EVIDENCE_ARTIFACT_DIR", raising=False)
    from app.services import image_assessment

    image_assessment.reset_for_tests()
    result = image_assessment.assess_image(b"not-a-model-input", "test-image")
    assert result["assessment_status"] == "UNAVAILABLE"
    assert result["error_code"] == "MODEL_ARTIFACT_NOT_CONFIGURED"


def test_supported_image_can_be_encoded_for_upload(tmp_path: Path):
    output = tmp_path / "evidence.jpg"
    Image.new("RGB", (64, 64), (210, 80, 20)).save(output, format="JPEG")
    assert output.stat().st_size > 0

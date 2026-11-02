"""Face blur for public copies: a real face is flattened, a faceless picture is untouched, and a missing model fails closed (no copy)."""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
from app.services import privacy_blur  # noqa: E402

FACE = BACKEND / "tests" / "fixtures" / "face_public_domain.jpg"   # one clear frontal face, centre of the picture, 700 x 525


def _array(img):
    return np.asarray(img.convert("RGB")).astype(int)


def test_a_face_is_flattened_and_the_rest_is_untouched():
    original = Image.open(FACE).convert("RGB")
    blurred, faces = privacy_blur.blur_faces(original)
    before, after = _array(original), _array(blurred)
    assert faces >= 1
    face = (slice(130, 270), slice(290, 400))          # rows, columns inside the face
    detail = lambda a: np.abs(np.diff(a[face], axis=1)).mean()   # pixel-to-pixel change: a mosaic has almost none
    assert detail(after) < 0.3 * detail(before)
    assert (after[400:525, 0:100] == before[400:525, 0:100]).all()   # far from any face: identical


def test_a_picture_without_faces_is_returned_unchanged():
    rng = np.random.default_rng(1)
    flat = Image.fromarray((rng.random((200, 300, 3)) * 255).astype("uint8"))
    out, faces = privacy_blur.blur_faces(flat)
    assert faces == 0 and (_array(out) == _array(flat)).all()


def test_a_missing_model_fails_closed(monkeypatch, tmp_path):
    monkeypatch.setattr(privacy_blur, "MODEL", tmp_path / "nope.onnx")
    with pytest.raises(privacy_blur.BlurUnavailable):
        privacy_blur.blur_faces(Image.open(FACE))


def _face_detail(jpeg_bytes):
    from io import BytesIO
    a = np.asarray(Image.open(BytesIO(jpeg_bytes)).convert("RGB")).astype(int)
    return np.abs(np.diff(a[130:270, 290:400], axis=1)).mean()


def test_the_public_report_copy_and_the_community_image_both_come_out_blurred():
    from app.services import community_image_assessment as community, public_photo
    data = FACE.read_bytes()
    plain = _face_detail(data)
    assert _face_detail(public_photo.clean_copy(data)) < 0.3 * plain
    clean, mime = community.validate_and_reencode(data, "image/jpeg")
    assert mime == "image/jpeg" and _face_detail(clean) < 0.3 * plain


def test_without_the_model_nothing_is_published(monkeypatch, tmp_path):
    from app.services import community_image_assessment as community, public_photo
    monkeypatch.setattr(privacy_blur, "MODEL", tmp_path / "nope.onnx")
    with pytest.raises(privacy_blur.BlurUnavailable):
        public_photo.clean_copy(FACE.read_bytes())            # publish_copy catches this and makes no public copy
    with pytest.raises(community.ImageRejected) as err:
        community.validate_and_reencode(FACE.read_bytes(), "image/jpeg")
    assert err.value.status == 503

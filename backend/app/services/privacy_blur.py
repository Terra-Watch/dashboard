"""Blur faces in a photo before anyone but staff can see it (public copies of report photos, community post images).

Detector: YuNet (OpenCV Zoo, MIT licence, 232 KB ONNX, file in backend/app/assets/yunet). Faces are found at the size the copy will have, grown by MARGIN and
pixelated hard. Raises BlurUnavailable when OpenCV or the model file is missing, so the caller makes no public copy (it fails closed).
Limits, stated so nobody relies on more than this: faces that are very small, turned away, masked or partly out of frame can be missed; NUMBER PLATES ARE NOT
COVERED (no reliable open detector for Indian plates). Staff can still withdraw any copy.
"""
from __future__ import annotations

from pathlib import Path

MODEL = Path(__file__).resolve().parents[1] / "assets" / "yunet" / "face_detection_yunet_2023mar.onnx"
DETECT_SIDE = 1280  # large photos are searched at this size (faster); the blur is applied at full size
SCORE = 0.5      # below the detector's usual 0.9: a missed face is worse than a needless blur
MARGIN = 0.4     # grow each box by this share of its size on every side
BLOCKS = 6       # a blurred face becomes at most BLOCKS x BLOCKS flat squares


class BlurUnavailable(RuntimeError):
    pass


def blur_faces(pixels):
    """pixels: a PIL RGB image. Returns (new PIL image, number of faces blurred)."""
    try:
        import cv2
        import numpy as np
        from PIL import Image
    except ImportError as exc:
        raise BlurUnavailable("OpenCV is not installed") from exc
    if not MODEL.is_file():
        raise BlurUnavailable("face model file is missing")
    rgb = np.asarray(pixels.convert("RGB"))
    h, w = rgb.shape[:2]
    bgr = np.ascontiguousarray(rgb[:, :, ::-1])
    scale = min(1.0, DETECT_SIDE / max(w, h))
    small = bgr if scale == 1.0 else cv2.resize(bgr, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA)
    try:
        detector = cv2.FaceDetectorYN.create(str(MODEL), "", (small.shape[1], small.shape[0]), SCORE, 0.3, 5000, cv2.dnn.DNN_BACKEND_OPENCV, cv2.dnn.DNN_TARGET_CPU)   # one per call: not thread-safe
        _, faces = detector.detect(small)
    except Exception as exc:
        raise BlurUnavailable("face detector failed") from exc
    if faces is None or len(faces) == 0:
        return pixels.convert("RGB"), 0
    faces = faces[:, :4] / scale
    out = bgr.copy()
    for x, y, fw, fh in faces:
        x0, y0 = max(0, int(x - MARGIN * fw)), max(0, int(y - MARGIN * fh))
        x1, y1 = min(w, int(x + fw * (1 + MARGIN))), min(h, int(y + fh * (1 + MARGIN)))
        if x1 - x0 < 2 or y1 - y0 < 2:
            continue
        patch = out[y0:y1, x0:x1]
        small = cv2.resize(patch, (min(BLOCKS, x1 - x0), min(BLOCKS, y1 - y0)), interpolation=cv2.INTER_AREA)
        out[y0:y1, x0:x1] = cv2.resize(small, (x1 - x0, y1 - y0), interpolation=cv2.INTER_NEAREST)
    return Image.fromarray(np.ascontiguousarray(out[:, :, ::-1])), len(faces)

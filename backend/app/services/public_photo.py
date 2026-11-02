"""Public copies of incident photos (design: docs/REPORT_TO_ALERT_DESIGN.md, sections 8 and 11).

Each uploaded photo gets a second, cleaned copy: re-encoded JPEG, long side at most 1200 px, no camera, location or text data. The copy is stored in the
same private store as the originals and is served to anyone only through /api/public, and only while the incident is unverified or confirmed. A copy that an
automatic check flags is held (public_state 'held') until staff release it. Staff can withdraw a copy at any time, and a closed incident shows nothing.

Off unless PUBLIC_REPORTS_ENABLED is "true". Never raises into the upload that called it.
Faces are blurred (services/privacy_blur.py); if that cannot run, no public copy is made. shortcut: number plates are not blurred (no reliable open detector for Indian plates), so staff can still withdraw a copy.
"""
from __future__ import annotations

import hashlib
import logging
import os
import re
from io import BytesIO
from pathlib import Path
from typing import Any

from sqlalchemy import text

from ..database.session import engine
from . import blob_storage, privacy_blur

logger = logging.getLogger(__name__)
MAX_SIDE = 1200
QUALITY = 80
LINK_OR_NUMBER = re.compile(r"https?://|www\.|\b\d[\d\s().-]{7,}\d\b", re.I)
POSSIBLE_FIELDS = (("synthetic", "possible generated image"), ("edited", "possible edit"), ("reused", "possible reused photo"))


def enabled() -> bool:
    return os.getenv("PUBLIC_REPORTS_ENABLED", "").strip().lower() in {"1", "true", "yes", "on"}


def unverified_hours() -> int:
    raw = os.getenv("PUBLIC_REPORTS_UNVERIFIED_HOURS", "6").strip()
    return int(raw) if raw.isdigit() and int(raw) > 0 else 6


def _root() -> Path:
    return Path(os.getenv("PUBLIC_PHOTO_STORAGE_DIR", str(Path(__file__).resolve().parents[2] / "runtime_data" / "public_photos")))


def _path(key: str) -> Path:
    return _root() / key


def clean_copy(data: bytes) -> bytes:
    """A fresh JPEG of the pixels only. Raises ValueError for anything that is not a readable single-frame image."""
    from PIL import Image, ImageOps
    try:
        with Image.open(BytesIO(data)) as img:
            if getattr(img, "n_frames", 1) > 1:
                raise ValueError("animated image")
            img.load()
            pixels = ImageOps.exif_transpose(img).convert("RGB")
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError("unreadable image") from exc
    pixels.thumbnail((MAX_SIDE, MAX_SIDE))
    pixels, _faces = privacy_blur.blur_faces(pixels)   # BlurUnavailable propagates: the caller then publishes nothing
    out = BytesIO()
    pixels.save(out, format="JPEG", quality=QUALITY, optimize=True)
    return out.getvalue()


def text_is_public_safe(note: str | None) -> bool:
    """False when a note carries a link or something that looks like a phone number; such a report is not shown publicly."""
    return not LINK_OR_NUMBER.search(note or "")


def hold_reason(assessment: dict[str, Any] | None, note: str | None, earlier_holds: int) -> str | None:
    """Why this photo must wait for staff, or None. An unavailable evidence check does not hold a photo by itself: the label already says unverified."""
    indications = (assessment or {}).get("indications") or {}
    for field, words in POSSIBLE_FIELDS:
        if indications.get(field) == "POSSIBLE":
            return f"auto: {words}"
    if not text_is_public_safe(note):
        return "auto: link or phone number in the note"
    if earlier_holds > 0:
        return "auto: an earlier photo from this account was held"
    return None


async def publish_copy(incident_id: int, image_id: int, original: bytes, assessment: dict[str, Any] | None) -> str:
    """Make and store the public copy, then mark it visible or held. Returns the resulting public_state ('none' when off or on any failure)."""
    if not enabled():
        return "none"
    try:
        copy = clean_copy(original)
        sha = hashlib.sha256(copy).hexdigest()
        key = f"public/{incident_id}/{image_id}.jpg"
        with engine.connect() as db:
            note = db.execute(text("SELECT notes FROM resq_incidents WHERE id=:id"), {"id": incident_id}).scalar()
            earlier = db.execute(text("""SELECT count(*) FROM resq_incident_images g JOIN resq_incidents i ON i.id=g.incident_id
                WHERE g.public_state='held' AND g.created_at > now() - interval '24 hours'
                AND i.reporter_id=(SELECT reporter_id FROM resq_incidents WHERE id=:id)"""), {"id": incident_id}).scalar() or 0
        reason = hold_reason(assessment, note, int(earlier))
        await blob_storage.write_or_local(key, _path(key), copy, "image/jpeg")
        state = "held" if reason else "visible"
        with engine.begin() as db:
            db.execute(text("UPDATE resq_incident_images SET public_state=:s, public_key=:k, public_sha256=:h, public_hold_reason=:r, public_at=now() WHERE id=:i"),
                       {"s": state, "k": key, "h": sha, "r": reason, "i": image_id})
        return state
    except Exception:
        logger.exception("public copy of image %s could not be made", image_id)
        return "none"


async def read_copy(key: str, sha256: str) -> bytes | None:
    return await blob_storage.read_or_local(key, _path(key), sha256)


async def withdraw_copy(image_id: int) -> bool:
    """Staff pull-down: the copy stops being served at once and the stored file is deleted. Returns whether a copy existed."""
    with engine.begin() as db:
        row = db.execute(text("UPDATE resq_incident_images SET public_state='withdrawn' WHERE id=:i AND public_key IS NOT NULL RETURNING public_key"), {"i": image_id}).first()
    if not row:
        return False
    try:
        await blob_storage.delete_or_local(row[0], _path(row[0]))
    except Exception:
        logger.exception("stored public copy of image %s could not be deleted", image_id)
    return True


def release_copy(image_id: int) -> bool:
    """Staff release of a held copy."""
    with engine.begin() as db:
        return db.execute(text("UPDATE resq_incident_images SET public_state='visible', public_hold_reason=NULL WHERE id=:i AND public_state='held'"), {"i": image_id}).rowcount > 0

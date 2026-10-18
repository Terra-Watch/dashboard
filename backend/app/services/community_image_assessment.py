"""Community media moderation: a policy SEPARATE from incident evidence.

What this module is
-------------------
* Accepts one image per community post, re-encodes it (so EXIF/GPS/ICC/text chunks are not stored) and stores the clean copy.
* Optionally runs the shared media-authenticity assessment on the ORIGINAL upload bytes (kept in memory only, because provenance markers such
  as generator tags live in the metadata that is stripped from the stored copy) and maps the result to a moderator-only schema.
* Decides whether a post must be held for a human moderator.

What it is not
--------------
* It never touches resq_incident_images and never reads or writes an incident, assignment, alert or notification. A test scans this file and
  routers/community.py for such references.
* It never publishes-as-verified, removes or mutes anything. The only action an assessment can trigger is "hold the post for a human
  moderator" through the existing community moderation-report mechanism; the moderator then approves or removes it.
* Fire/smoke output of the shared model (scores, derived label, priority, OOD flag, decision) is NEVER copied into the moderator result. The
  mapping below reads only the authenticity verdict, image-quality flags, model version and error code.

Flags (both default OFF; read on every call):
    COMMUNITY_IMAGES_ENABLED          accept one image on a post
    FIRE_EVIDENCE_COMMUNITY_ENABLED   run the media assessment on it (only effective when COMMUNITY_IMAGES_ENABLED is on)
The shared model additionally needs its own configuration (see docs/fire_evidence_integration.md); when it is unavailable the result is
UNAVAILABLE and the post is held.

Mapping (shared model authenticity verdict -> community status), see `map_assessment`:
    COMPLETED + NO_CONCERNS_FOUND, no low-quality flag   -> AUTHENTIC_NO_CONCERN   (means "no concern found", NOT "verified authentic")
    COMPLETED + NO_CONCERNS_FOUND + TOO_SMALL|NEAR_UNIFORM|EXTREME_BLUR -> INCONCLUSIVE (a clean verdict on an unusable image means nothing)
    COMPLETED + POSSIBLE_SYNTHETIC                       -> POSSIBLE_SYNTHETIC
    COMPLETED + POSSIBLE_EDITED | INCONSISTENT           -> POSSIBLE_EDITED     (INCONSISTENT carries an explanatory limitation)
    COMPLETED + REUSED                                   -> REUSED
    COMPLETED + INCONCLUSIVE | NOT_ASSESSED | anything else -> INCONCLUSIVE
    UNAVAILABLE / EXPERIMENTAL / malformed               -> UNAVAILABLE
Every status except AUTHENTIC_NO_CONCERN sets moderator_review_recommended and holds the post.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
import re
from io import BytesIO
from pathlib import Path
from typing import Any

from sqlalchemy import text

from . import image_assessment as shared_model

logger = logging.getLogger(__name__)

TRUE_VALUES = ("1", "true", "yes", "on")
STATUSES = ("AUTHENTIC_NO_CONCERN", "POSSIBLE_SYNTHETIC", "POSSIBLE_EDITED", "REUSED", "INCONCLUSIVE", "UNAVAILABLE")
INDICATION_VALUES = ("NOT_ASSESSED", "NONE_FOUND", "POSSIBLE")
LOW_QUALITY_FLAGS = ("TOO_SMALL", "NEAR_UNIFORM", "EXTREME_BLUR")
ALLOWED_MIMES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
_FORMAT_TO_MIME = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}
MAX_PIXELS = 25_000_000
_FLAG_SHAPE = re.compile(r"^[A-Z0-9_]{1,40}$")
_CODE_SHAPE = re.compile(r"^[A-Z0-9_]{1,64}$")
# Only these keys can ever leave this module in a moderator assessment.
RESULT_KEYS = ("status", "indications", "quality_flags", "moderator_review_recommended", "advisory", "model_version", "error_code", "limitations")

BASE_LIMITATIONS = (
    "Advisory only. A moderator decides; this result never publishes, removes or mutes anything.",
    "'No concern found' does not mean the image is verified authentic, and the checks do not establish where or when it was taken.",
)
INCONSISTENT_NOTE = "Capture metadata was inconsistent; shown as a possible edit. This can have an innocent explanation (for example a wrong camera clock)."
UNAVAILABLE_NOTE = "The media check could not run for this image, so it is not a negative result. A moderator should look at it."
QUALITY_NOTE = "The image quality is too low for the media check to say anything useful."
REUSE_NOTE = "Reuse of earlier images is not checked by this deployment."


class ImageRejected(Exception):
    """An upload that must not be stored. `status` is the HTTP status the route should answer with."""

    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status, self.detail = status, detail


# ----------------------------------------------------------------------------------------------------------------------------
# flags and limits
# ----------------------------------------------------------------------------------------------------------------------------
def images_enabled() -> bool:
    return os.getenv("COMMUNITY_IMAGES_ENABLED", "").strip().lower() in TRUE_VALUES


def assessment_enabled() -> bool:
    return images_enabled() and os.getenv("FIRE_EVIDENCE_COMMUNITY_ENABLED", "").strip().lower() in TRUE_VALUES


def max_image_bytes() -> int:
    try:
        return min(10 * 1024 * 1024, max(10 * 1024, int(os.getenv("COMMUNITY_IMAGE_MAX_BYTES", str(5 * 1024 * 1024)))))
    except ValueError:
        return 5 * 1024 * 1024


def image_root() -> Path:
    return Path(os.getenv("COMMUNITY_IMAGE_STORAGE_DIR", str(Path(__file__).resolve().parents[2] / "runtime_data" / "community_images")))


# ----------------------------------------------------------------------------------------------------------------------------
# upload validation, EXIF-stripping re-encode, storage (same layout idea as incident images: <id>/<sha256>.<ext>, hash re-checked on read)
# ----------------------------------------------------------------------------------------------------------------------------
def validate_and_reencode(data: bytes, declared_type: str | None) -> tuple[bytes, str]:
    """Return (clean_bytes, mime). Raises ImageRejected. Accepts only jpeg/png/webp that decode with Pillow, are size-limited, single-frame,
    and whose decoded format equals the declared type. The returned bytes are a fresh encode of the pixels: no EXIF, GPS, ICC or text chunks."""
    if declared_type not in ALLOWED_MIMES:
        raise ImageRejected(415, "Upload a JPEG, PNG, or WebP image")
    if not data:
        raise ImageRejected(422, "Image is empty")
    if len(data) > max_image_bytes():
        raise ImageRejected(413, f"Image must be {max_image_bytes() // (1024 * 1024) or 1} MB or smaller")
    try:
        from PIL import Image, ImageOps
        with Image.open(BytesIO(data)) as probe:
            probe.verify()
        with Image.open(BytesIO(data)) as img:
            detected = _FORMAT_TO_MIME.get((img.format or "").upper())
            if detected is None:
                raise ImageRejected(415, "Upload a JPEG, PNG, or WebP image")
            if detected != declared_type:
                raise ImageRejected(415, "The declared image type does not match the decoded image")
            if img.width * img.height > MAX_PIXELS:
                raise ImageRejected(413, "Image dimensions are too large")
            if getattr(img, "n_frames", 1) > 1:
                raise ImageRejected(422, "Animated images are not accepted")
            img.load()
            pixels = ImageOps.exif_transpose(img)  # honour orientation before the EXIF that carries it is dropped
            out = BytesIO()
            if detected == "image/jpeg":
                pixels.convert("RGB" if pixels.mode not in ("RGB", "L") else pixels.mode).save(out, format="JPEG", quality=90, optimize=True)
            elif detected == "image/png":
                pixels.convert("RGBA" if pixels.mode not in ("RGB", "RGBA", "L", "LA", "P") else pixels.mode).save(out, format="PNG", optimize=True)
            else:
                pixels.convert("RGBA" if pixels.mode == "RGBA" else "RGB").save(out, format="WEBP", quality=90)
    except ImageRejected:
        raise
    except Exception as exc:  # truncated, corrupt, decompression bomb, unsupported variants
        raise ImageRejected(422, "The uploaded file is not a readable image") from exc
    clean = out.getvalue()
    if not clean:
        raise ImageRejected(422, "The uploaded file is not a readable image")
    return clean, detected


def storage_key(post_id: int, sha256: str, mime: str) -> str:
    return f"{int(post_id)}/{sha256}.{ALLOWED_MIMES[mime]}"


def stored_path(key: str) -> Path | None:
    """Resolve a stored key without permitting filesystem escape; None if it escapes."""
    root = image_root().resolve()
    candidate = (root / key).resolve()
    return candidate if candidate != root and root in candidate.parents else None


def read_verified(key: str, expected_sha256: str) -> bytes | None:
    """The stored bytes, or None if missing, escaping the root, or altered on disk."""
    path = stored_path(key)
    if path is None or not path.is_file():
        return None
    data = path.read_bytes()
    return data if hmac.compare_digest(hashlib.sha256(data).hexdigest(), expected_sha256) else None


def write_clean_copy(key: str, data: bytes) -> bool:
    """Write the clean copy. Returns True if this call created the file (so a failed transaction can remove exactly what it added)."""
    path = stored_path(key)
    if path is None:
        raise ImageRejected(422, "Image could not be stored")
    if path.is_file():
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return True


def discard(key: str) -> None:
    path = stored_path(key)
    try:
        if path is not None and path.is_file():
            path.unlink()
    except OSError:
        logger.exception("could not remove a community image after a failed save")


# ----------------------------------------------------------------------------------------------------------------------------
# policy: shared model output -> moderator result
# ----------------------------------------------------------------------------------------------------------------------------
def unavailable_result(code: str | None = None, model_version: str | None = None) -> dict[str, Any]:
    safe = code if isinstance(code, str) and _CODE_SHAPE.fullmatch(code) else shared_model.RESULT_INVALID
    return {
        "status": "UNAVAILABLE", "indications": {"synthetic": "NOT_ASSESSED", "edited": "NOT_ASSESSED", "reused": "NOT_ASSESSED"}, "quality_flags": [],
        "moderator_review_recommended": True, "advisory": True, "model_version": str(model_version or "unconfigured")[:120], "error_code": safe,
        "limitations": [*BASE_LIMITATIONS, UNAVAILABLE_NOTE],
    }


def map_assessment(raw: Any) -> dict[str, Any]:
    """Pure policy function. `raw` is whatever the shared model adapter returned (normally its sanitized dict). Reads ONLY: assessment_status,
    authenticity.status, authenticity.signals, quality_flags, model_version, error_code. Every other key, in particular scores, derived_label,
    review_priority, ood_flag, decision and anything dispatch-like, is ignored and cannot appear in the result."""
    if not isinstance(raw, dict):
        return unavailable_result(shared_model.RESULT_INVALID)
    version = raw.get("model_version")
    if raw.get("assessment_status") != "COMPLETED":  # UNAVAILABLE, EXPERIMENTAL (never approved for any use) or junk
        code = raw.get("error_code")
        if raw.get("assessment_status") == shared_model.EXPERIMENTAL_STATUS:
            code = "MODEL_NOT_APPROVED_FOR_COMMUNITY"
        return unavailable_result(code if isinstance(code, str) and code else shared_model.INFERENCE_FAILED, version)
    auth = raw.get("authenticity") if isinstance(raw.get("authenticity"), dict) else {}
    auth_status = auth.get("status")
    signals = [str(s) for s in (auth.get("signals") or [])][:shared_model.MAX_SIGNALS] if isinstance(auth.get("signals"), list) else []
    flags = [f for f in (raw.get("quality_flags") if isinstance(raw.get("quality_flags"), list) else []) if isinstance(f, str) and _FLAG_SHAPE.fullmatch(f)][:10]
    notes: list[str] = []
    if auth_status == "NO_CONCERNS_FOUND":
        status = "INCONCLUSIVE" if any(f in LOW_QUALITY_FLAGS for f in flags) else "AUTHENTIC_NO_CONCERN"
        if status == "INCONCLUSIVE":
            notes.append(QUALITY_NOTE)
    elif auth_status == "POSSIBLE_SYNTHETIC":
        status = "POSSIBLE_SYNTHETIC"
    elif auth_status in ("POSSIBLE_EDITED", "INCONSISTENT"):
        status = "POSSIBLE_EDITED"
        if auth_status == "INCONSISTENT":
            notes.append(INCONSISTENT_NOTE)
    elif auth_status == "REUSED":
        status = "REUSED"
    else:
        status = "INCONCLUSIVE"
    indications, more = shared_model.indications_for(auth_status if isinstance(auth_status, str) else shared_model.NOT_ASSESSED, signals)
    if status == "INCONCLUSIVE":  # an inconclusive verdict makes no per-concern claim, even if the model also said NO_CONCERNS_FOUND
        indications = {"synthetic": "NOT_ASSESSED", "edited": "NOT_ASSESSED", "reused": "NOT_ASSESSED"}
    if not shared_model.REUSE_CHECK_ACTIVE and indications["reused"] == "NONE_FOUND":
        indications["reused"] = "NOT_ASSESSED"
    if indications["reused"] == "NOT_ASSESSED" and status == "AUTHENTIC_NO_CONCERN":
        notes.append(REUSE_NOTE)
    return {
        "status": status, "indications": indications, "quality_flags": flags, "moderator_review_recommended": status != "AUTHENTIC_NO_CONCERN",
        "advisory": True, "model_version": str(version or "unconfigured")[:120], "error_code": None, "limitations": [*BASE_LIMITATIONS, *notes],
    }


def present_stored(stored: Any, status: str | None = None, error: str | None = None) -> dict[str, Any]:
    """Moderator view of a stored assessment: re-applies the key whitelist, never trusts the stored JSON."""
    if not isinstance(stored, dict) or stored.get("status") not in STATUSES:
        return unavailable_result(error)
    ind = stored.get("indications") if isinstance(stored.get("indications"), dict) else {}
    indications = {k: (ind.get(k) if ind.get(k) in INDICATION_VALUES else "NOT_ASSESSED") for k in ("synthetic", "edited", "reused")}
    flags = [f for f in (stored.get("quality_flags") or []) if isinstance(f, str) and _FLAG_SHAPE.fullmatch(f)][:10]
    limits = [str(x)[:300] for x in (stored.get("limitations") or [])][:10]
    code = stored.get("error_code")
    return {"status": stored["status"], "indications": indications, "quality_flags": flags,
            "moderator_review_recommended": stored["status"] != "AUTHENTIC_NO_CONCERN", "advisory": True,
            "model_version": str(stored.get("model_version") or "unconfigured")[:120],
            "error_code": code if isinstance(code, str) and _CODE_SHAPE.fullmatch(code) else None, "limitations": limits}


def hold_reason(result: dict[str, Any]) -> str | None:
    """Moderation-queue reason when the post must wait for a human, else None. Only AUTHENTIC_NO_CONCERN lets a post stay published."""
    status = result.get("status")
    if status == "AUTHENTIC_NO_CONCERN":
        return None
    return "auto: media " + (str(status).lower().replace("_", " ") if status in STATUSES else "unavailable")


async def assess_upload(original_bytes: bytes, key: str) -> dict[str, Any]:
    """Run the shared model on the original upload. Never raises; any failure is an UNAVAILABLE result (which holds the post)."""
    try:
        return map_assessment(await shared_model.assess_image_async(original_bytes, f"community/{key}", config=shared_model.COMMUNITY))
    except Exception:
        logger.exception("community media assessment failed")
        return unavailable_result(shared_model.INFERENCE_FAILED)


# ----------------------------------------------------------------------------------------------------------------------------
# persistence (callers pass an open transaction)
# ----------------------------------------------------------------------------------------------------------------------------
def insert_image(db, *, post_id: int, author_id: int, key: str, sha256: str, mime: str, size_bytes: int) -> dict:
    return dict(db.execute(text('''INSERT INTO resq_community_post_images (post_id,author_id,storage_key,sha256,mime,size_bytes)
        VALUES (:p,:a,:k,:h,:m,:s) RETURNING id,post_id,mime,size_bytes,created_at'''),
                                 {"p": post_id, "a": author_id, "k": key, "h": sha256, "m": mime, "s": size_bytes}).mappings().one())


def insert_assessment(db, *, image_id: int, result: dict[str, Any]) -> None:
    import json
    db.execute(text('''INSERT INTO resq_community_image_assessments (image_id,status,assessment,error_code)
        VALUES (:i,:s,CAST(:a AS JSONB),:e)'''), {"i": image_id, "s": result["status"], "a": json.dumps({k: result[k] for k in RESULT_KEYS}), "e": result.get("error_code")})


def record_moderator_decision(db, *, post_id: int, resolution: str, moderator_id: int, note: str | None) -> None:
    """Remember what the human decided about the image's post (approved / removed / dismissed). Does nothing for posts without an assessment."""
    db.execute(text('''UPDATE resq_community_image_assessments a SET moderator_decision=:d, moderator_id=:m, moderator_decided_at=now(), moderator_note=:n
        FROM resq_community_post_images i WHERE a.image_id=i.id AND i.post_id=:p'''),
               {"d": resolution, "m": moderator_id, "n": (note or None) and note[:500], "p": post_id})


def moderator_media_for_posts(db, post_ids: list[int]) -> dict[int, dict[str, Any]]:
    """{post_id: {image, assessment|None, moderator_decision}} for the moderation queue. Call from moderator-only routes."""
    if not post_ids:
        return {}
    rows = db.execute(text('''SELECT i.post_id,i.id AS image_id,i.mime,i.size_bytes,a.status,a.assessment,a.error_code,a.assessed_at,
          a.moderator_decision,a.moderator_decided_at
        FROM resq_community_post_images i LEFT JOIN resq_community_image_assessments a ON a.image_id=i.id WHERE i.post_id = ANY(:ids)'''),
                      {"ids": post_ids}).mappings().all()
    out = {}
    for r in rows:
        entry = {"image": {"id": r["image_id"], "mime": r["mime"], "size_bytes": r["size_bytes"], "url": f"/api/community/posts/{r['post_id']}/image"}}
        if r["status"] is not None:
            entry["assessment"] = present_stored(r["assessment"], r["status"], r["error_code"])
            entry["assessed_at"] = r["assessed_at"]
            entry["moderator_decision"] = r["moderator_decision"]
        out[r["post_id"]] = entry
    return out

"""Community media moderation: a policy SEPARATE from incident evidence (real PostgreSQL, real app; the model is a fake).

Covers the flags (both default off -> feature absent), the upload hardening (type/size/decode, EXIF/GPS stripping, one image per post), every
assessment status, UNAVAILABLE holding, "nothing is ever auto-published, auto-removed or auto-muted", moderator-only visibility of signals,
the stripping of fire/smoke fields, and the guarantee that community posts never enter the fire incident workflow.
"""
import ast
import io
import json
import random
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from PIL import Image  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.database.session import engine, init_db  # noqa: E402
from app.routers import community  # noqa: E402
from app.schemas_ext import community_images  # noqa: E402
from app.services import community_image_assessment as media  # noqa: E402
from app.services import image_assessment as ia  # noqa: E402
from tests.test_auth import fresh_client  # noqa: E402
from tests.test_fire_evidence_routes import actor, database, db_one, db_scalar, isolated  # noqa: E402,F401

MODEL_FIELDS = ("flames_visible", "smoke_visible", "derived_label", "ACTIVE_FIRE", "SMOKE_ONLY", "NO_VISIBLE_FIRE", "review_priority", "ood_flag", "scores", "decision",
                "dispatch", "incident")


@pytest.fixture(autouse=True)
def community_env(monkeypatch, tmp_path):
    for name in ("COMMUNITY_IMAGES_ENABLED", "FIRE_EVIDENCE_COMMUNITY_ENABLED", "COMMUNITY_IMAGE_MAX_BYTES"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("COMMUNITY_IMAGE_STORAGE_DIR", str(tmp_path / "community_images"))
    with engine.begin() as db:  # the shared test database keeps open reports from earlier runs; the queue shows the 100 most severe
        db.execute(text("UPDATE resq_community_reports SET status='resolved', resolution='dismissed' WHERE status='open'"))
    yield


def enable(monkeypatch, *, assess=False):
    monkeypatch.setenv("COMMUNITY_IMAGES_ENABLED", "true")
    if assess:
        monkeypatch.setenv("FIRE_EVIDENCE_COMMUNITY_ENABLED", "true")


def model_returns(monkeypatch, result=None, *, raises=None):
    calls = []

    async def fake(data, image_id):
        calls.append(image_id)
        if raises:
            raise raises
        return result
    monkeypatch.setattr(ia, "assess_image_async", fake)
    return calls


def completed(auth_status="NO_CONCERNS_FOUND", signals=(), quality=(), **extra):
    return {"assessment_status": "COMPLETED", "model_version": "fake-v1", "artifact_status": "APPROVED", "error_code": None,
            "scores": {"flames_visible": 0.99, "smoke_visible": 0.97}, "derived_label": "ACTIVE_FIRE", "decision": "REQUIRES_REVIEW", "review_priority": "HIGH",
            "quality_flags": list(quality), "ood_flag": True, "authenticity": {"status": auth_status, "signals": list(signals)},
            "limitations": ["This does not verify a fire or an incident."], "dispatch_rangers": True, "incident_status": "verified", **extra}


def picture(fmt="JPEG", *, exif=False, size=(96, 72), seed=3) -> bytes:
    rnd = random.Random(seed)
    img = Image.new("RGB", size)
    img.putdata([(rnd.randrange(256), rnd.randrange(256), rnd.randrange(256)) for _ in range(size[0] * size[1])])
    buf = io.BytesIO()
    kwargs = {}
    if exif and fmt in ("JPEG", "WEBP"):
        tags = Image.Exif()
        tags[0x010F] = "SecretCameraMaker"
        tags[0x0132] = "2026:10:16 08:00:00"
        gps = tags.get_ifd(0x8825)
        gps[1], gps[2], gps[3], gps[4] = "N", (20.0, 18.0, 0.0), "E", (85.0, 48.0, 0.0)
        kwargs["exif"] = tags.tobytes()
    img.save(buf, fmt, **kwargs)
    return buf.getvalue()


MIME = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}


def upload(client, headers, post_id, data=None, mime="image/jpeg", name="photo.jpg"):
    return client.post(f"/api/community/posts/{post_id}/image", headers=headers, files={"image": (name, data if data is not None else picture(), mime)})


def new_post(client, headers, content="Photo of the trail after the rain today"):
    r = client.post("/api/community/posts", headers=headers, json={"content": content, "post_type": "information", "region": "Similipal"})
    assert r.status_code == 201, r.text
    return r.json()["post"]["id"]


def post_status(pid):
    return db_scalar("SELECT status FROM resq_community_posts WHERE id=:i", i=pid)


def world() -> dict:
    return {t: db_scalar(f"SELECT count(*) FROM {t}") for t in ("resq_incidents", "resq_incident_images", "resq_incident_assignments", "resq_alerts", "resq_notices",
                                                                "resq_field_verifications", "resq_community_sanctions")}


def queue_item(mod, mh, pid):
    items = mod.get("/api/community/moderation/queue", headers=mh).json()["items"]
    return next((i for i in items if i["post_id"] == pid), None)


# ======================================================================================= flags: off means absent
def test_both_flags_default_off(monkeypatch):
    assert media.images_enabled() is False and media.assessment_enabled() is False
    monkeypatch.setenv("FIRE_EVIDENCE_COMMUNITY_ENABLED", "true")
    assert media.assessment_enabled() is False          # assessment alone is not enough: images must be on
    monkeypatch.setenv("COMMUNITY_IMAGES_ENABLED", "true")
    assert media.images_enabled() and media.assessment_enabled()
    for junk in ("", "0", "false", "maybe", "no"):
        monkeypatch.setenv("COMMUNITY_IMAGES_ENABLED", junk)
        assert media.images_enabled() is False


def test_with_the_flags_off_the_feature_is_absent_everywhere(monkeypatch):
    calls = model_returns(monkeypatch, completed("POSSIBLE_SYNTHETIC"))
    c, h, _ = actor("citizen"); pid = new_post(c, h)
    mod, mh, _ = actor("control_room_operator", scopes=["OD"])
    assert upload(c, h, pid).status_code == 404
    assert c.get(f"/api/community/posts/{pid}/image", headers=h).status_code == 404
    listed = c.get("/api/community/posts", headers=h).json()["items"]
    assert all("image" not in item for item in listed)
    assert all("image" not in i and "media_assessment" not in i for i in mod.get("/api/community/moderation/queue", headers=mh).json()["items"])
    assert calls == [] and post_status(pid) == "published"
    assert db_scalar("SELECT count(*) FROM resq_community_post_images WHERE post_id=:p", p=pid) == 0


def test_images_on_assessment_off_stores_the_image_and_never_calls_the_model(monkeypatch):
    enable(monkeypatch)
    calls = model_returns(monkeypatch, completed("POSSIBLE_SYNTHETIC"))
    c, h, _ = actor("citizen"); pid = new_post(c, h)
    r = upload(c, h, pid)
    assert r.status_code == 201 and r.json()["post_status"] == "published"
    assert calls == [] and post_status(pid) == "published"
    assert db_scalar("SELECT count(*) FROM resq_community_image_assessments a JOIN resq_community_post_images i ON i.id=a.image_id WHERE i.post_id=:p", p=pid) == 0
    assert db_scalar("SELECT count(*) FROM resq_community_reports WHERE post_id=:p", p=pid) == 0


# ======================================================================================= upload hardening
@pytest.mark.parametrize("fmt", ["JPEG", "PNG", "WEBP"])
def test_accepted_formats_are_reencoded_and_stored_with_a_matching_hash(monkeypatch, fmt):
    enable(monkeypatch)
    c, h, _ = actor("citizen"); pid = new_post(c, h)
    original = picture(fmt, exif=True)
    r = upload(c, h, pid, original, MIME[fmt])
    assert r.status_code == 201, r.text
    row = db_one("SELECT * FROM resq_community_post_images WHERE post_id=:p", p=pid)
    stored = (media.image_root() / row["storage_key"]).read_bytes()
    import hashlib
    assert row["mime"] == MIME[fmt] and row["size_bytes"] == len(stored) and row["sha256"] == hashlib.sha256(stored).hexdigest()
    assert row["storage_key"] == f"{pid}/{row['sha256']}.{ {'JPEG': 'jpg', 'PNG': 'png', 'WEBP': 'webp'}[fmt] }"
    with Image.open(io.BytesIO(stored)) as img:
        assert img.format == fmt and img.size == (96, 72) and len(img.getexif()) == 0
    served = c.get(f"/api/community/posts/{pid}/image", headers=h)
    assert served.status_code == 200 and served.content == stored and served.headers["content-type"] == MIME[fmt]
    assert served.headers["cache-control"] == "private, no-store" and served.headers["x-content-type-options"] == "nosniff"


@pytest.mark.parametrize("fmt", ["JPEG", "WEBP"])
def test_exif_and_gps_are_stripped_from_the_stored_copy(monkeypatch, fmt):
    enable(monkeypatch)
    original = picture(fmt, exif=True)
    assert b"SecretCameraMaker" in original and len(Image.open(io.BytesIO(original)).getexif()) > 0     # the fixture really carries EXIF + GPS
    clean, mime = media.validate_and_reencode(original, MIME[fmt])
    assert b"SecretCameraMaker" not in clean and b"Exif" not in clean and mime == MIME[fmt]
    assert len(Image.open(io.BytesIO(clean)).getexif()) == 0 and not Image.open(io.BytesIO(clean)).getexif().get_ifd(0x8825)


def test_png_text_chunks_and_icc_profiles_are_dropped():
    buf = io.BytesIO()
    from PIL import PngImagePlugin
    meta = PngImagePlugin.PngInfo(); meta.add_text("Comment", "GPS 20.3,85.8 secret")
    Image.new("RGB", (32, 32), (10, 200, 30)).save(buf, "PNG", pnginfo=meta)
    assert b"GPS 20.3" in buf.getvalue()
    clean, _ = media.validate_and_reencode(buf.getvalue(), "image/png")
    assert b"GPS 20.3" not in clean and b"tEXt" not in clean


def test_exif_orientation_is_applied_before_the_metadata_is_dropped():
    tags = Image.Exif(); tags[0x0112] = 6   # rotate 270 on display
    buf = io.BytesIO(); Image.new("RGB", (80, 40), (255, 0, 0)).save(buf, "JPEG", exif=tags.tobytes())
    clean, _ = media.validate_and_reencode(buf.getvalue(), "image/jpeg")
    assert Image.open(io.BytesIO(clean)).size == (40, 80)


@pytest.mark.parametrize("data,mime,expected", [
    (b"", "image/jpeg", 422),
    (b"GIF89a not an image at all", "image/jpeg", 422),
    (b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>", "image/svg+xml", 415),
    (picture("PNG"), "image/jpeg", 415),                       # declared type does not match the decoded format
    (picture("JPEG"), "image/gif", 415),
    (picture("JPEG")[:200], "image/jpeg", 422),                # truncated
    (b"\xff\xd8\xff\xe0" + b"\x00" * 64, "image/jpeg", 422),   # a JPEG header with nothing behind it
])
def test_unacceptable_uploads_are_rejected_and_leave_nothing_behind(monkeypatch, data, mime, expected):
    enable(monkeypatch)
    c, h, _ = actor("citizen"); pid = new_post(c, h)
    r = upload(c, h, pid, data, mime)
    assert r.status_code == expected, r.text
    assert db_scalar("SELECT count(*) FROM resq_community_post_images WHERE post_id=:p", p=pid) == 0
    assert not list(media.image_root().rglob("*.*")) if media.image_root().exists() else True


def test_oversized_animated_and_huge_dimension_images_are_rejected(monkeypatch):
    enable(monkeypatch)
    monkeypatch.setenv("COMMUNITY_IMAGE_MAX_BYTES", str(20 * 1024))
    c, h, _ = actor("citizen"); pid = new_post(c, h)
    assert upload(c, h, pid, picture("PNG", size=(300, 300)), "image/png").status_code == 413
    monkeypatch.delenv("COMMUNITY_IMAGE_MAX_BYTES")
    frames = [Image.new("RGB", (16, 16), (i * 40, 0, 0)) for i in range(4)]
    buf = io.BytesIO(); frames[0].save(buf, "WEBP", save_all=True, append_images=frames[1:], duration=50)
    assert upload(c, h, pid, buf.getvalue(), "image/webp").status_code == 422
    monkeypatch.setattr(media, "MAX_PIXELS", 100)
    assert upload(c, h, pid, picture("PNG", size=(40, 40)), "image/png").status_code == 413
    assert db_scalar("SELECT count(*) FROM resq_community_post_images WHERE post_id=:p", p=pid) == 0


def test_only_the_author_can_attach_one_image_once_and_csrf_is_required(monkeypatch):
    enable(monkeypatch)
    c, h, _ = actor("citizen"); pid = new_post(c, h)
    other, oh, _ = actor("citizen")
    assert upload(other, oh, pid).status_code == 404                                   # someone else's post
    assert upload(fresh_client(), {}, pid).status_code in (401, 403)                   # anonymous
    no_csrf = {k: v for k, v in h.items() if k.lower() != "x-resq-csrf"}
    assert upload(c, no_csrf, pid).status_code == 403
    first = upload(c, h, pid)
    assert first.status_code == 201
    assert upload(c, h, pid, picture(seed=9)).status_code == 409                       # one image per post
    assert db_scalar("SELECT count(*) FROM resq_community_post_images WHERE post_id=:p", p=pid) == 1
    ranger, rh, _ = actor("field_crew")                                                # roles outside the community cannot use it
    assert upload(ranger, rh, pid).status_code == 403


def test_a_removed_post_cannot_get_an_image_and_a_muted_author_cannot_upload(monkeypatch):
    enable(monkeypatch)
    c, h, uid = actor("citizen"); gone = new_post(c, h)
    assert c.delete(f"/api/community/posts/{gone}", headers=h).status_code == 200
    assert upload(c, h, gone).status_code == 404
    pid = new_post(c, h)
    mod, mh, _ = actor("admin")
    assert mod.post("/api/community/sanctions", headers=mh, json={"user_id": uid, "kind": "mute", "reason": "spam", "hours": 1}).status_code == 201
    assert upload(c, h, pid).status_code == 403


def test_schema_is_idempotent_and_enforces_one_image_per_post(monkeypatch):
    enable(monkeypatch)
    init_db(); init_db()
    with engine.begin() as db:
        community_images.ensure(db); community_images.ensure(db)
    c, h, _ = actor("citizen"); pid = new_post(c, h)
    assert upload(c, h, pid).status_code == 201
    from sqlalchemy.exc import IntegrityError
    with pytest.raises(IntegrityError):
        with engine.begin() as db:
            media.insert_image(db, post_id=pid, author_id=1, key=f"{pid}/dup.jpg", sha256="0" * 64, mime="image/jpeg", size_bytes=1)
    with pytest.raises(IntegrityError):
        with engine.begin() as db:
            db.execute(text("INSERT INTO resq_community_image_assessments (image_id,status,assessment) SELECT id,'VERIFIED_REAL','{}' FROM resq_community_post_images WHERE post_id=:p"), {"p": pid})


# ======================================================================================= pure policy mapping
@pytest.mark.parametrize("auth,signals,quality,expected,recommended", [
    ("NO_CONCERNS_FOUND", [], [], "AUTHENTIC_NO_CONCERN", False),
    ("NO_CONCERNS_FOUND", [], ["TOO_DARK"], "AUTHENTIC_NO_CONCERN", False),
    ("NO_CONCERNS_FOUND", [], ["EXTREME_BLUR"], "INCONCLUSIVE", True),
    ("NO_CONCERNS_FOUND", [], ["NEAR_UNIFORM"], "INCONCLUSIVE", True),
    ("POSSIBLE_SYNTHETIC", ["GENERATOR_TAG_IN_METADATA"], [], "POSSIBLE_SYNTHETIC", True),
    ("POSSIBLE_EDITED", ["LEARNED_EDITED_SCORE:0.9"], [], "POSSIBLE_EDITED", True),
    ("INCONSISTENT", ["EXIF_CAPTURE_AFTER_UPLOAD"], [], "POSSIBLE_EDITED", True),
    ("REUSED", ["REUSED_MATCHES:7/abc.jpg"], [], "REUSED", True),
    ("INCONCLUSIVE", [], [], "INCONCLUSIVE", True),
    ("NOT_ASSESSED", [], [], "INCONCLUSIVE", True),
    ("SOMETHING_NEW", [], [], "INCONCLUSIVE", True),
])
def test_status_mapping(auth, signals, quality, expected, recommended):
    out = media.map_assessment(completed(auth, signals, quality))
    assert out["status"] == expected and out["moderator_review_recommended"] is recommended and out["advisory"] is True
    assert set(out) == set(media.RESULT_KEYS) and out["error_code"] is None and out["model_version"] == "fake-v1"
    assert all(v in media.INDICATION_VALUES for v in out["indications"].values()) and set(out["indications"]) == {"synthetic", "edited", "reused"}
    assert media.hold_reason(out) == (None if expected == "AUTHENTIC_NO_CONCERN" else "auto: media " + expected.lower().replace("_", " "))


def test_indications_in_the_moderator_result():
    assert media.map_assessment(completed("POSSIBLE_SYNTHETIC", ["GENERATOR_TAG_IN_METADATA"]))["indications"] == {"synthetic": "POSSIBLE", "edited": "NOT_ASSESSED", "reused": "NOT_ASSESSED"}
    assert media.map_assessment(completed("NO_CONCERNS_FOUND"))["indications"] == {"synthetic": "NONE_FOUND", "edited": "NONE_FOUND", "reused": "NOT_ASSESSED"}
    inc = media.map_assessment(completed("INCONSISTENT", ["EXIF_GPS_FAR_FROM_REPORTED_LOCATION"]))
    assert inc["indications"]["edited"] == "POSSIBLE" and media.INCONSISTENT_NOTE in inc["limitations"]
    assert set(media.map_assessment(completed("INCONCLUSIVE"))["indications"].values()) == {"NOT_ASSESSED"}


@pytest.mark.parametrize("raw", [None, "x", [], {}, {"assessment_status": "UNAVAILABLE", "error_code": "MODEL_TIMEOUT"},
                                 {"assessment_status": "COMPLETED_BUT_NOT_REALLY"}, {"assessment_status": "EXPERIMENTAL", "raw_logits": {"flames_visible": 9}}])
def test_anything_but_completed_is_unavailable_and_holds(raw):
    out = media.map_assessment(raw)
    assert out["status"] == "UNAVAILABLE" and out["moderator_review_recommended"] is True and set(out) == set(media.RESULT_KEYS)
    assert set(out["indications"].values()) == {"NOT_ASSESSED"} and media.hold_reason(out) == "auto: media unavailable" and out["quality_flags"] == []


def test_fire_and_smoke_fields_never_survive_the_mapping():
    out = media.map_assessment(completed("POSSIBLE_EDITED", ["LEARNED_EDITED_SCORE:0.9"], ["TOO_DARK"]))
    text_ = json.dumps(out)
    assert not [f for f in MODEL_FIELDS if f in text_], text_
    assert set(out) == set(media.RESULT_KEYS)
    stored = media.present_stored({**out, "scores": {"flames_visible": 1}, "derived_label": "ACTIVE_FIRE", "quality_flags": ["bad flag!", "TOO_DARK"]})
    assert set(stored) == set(media.RESULT_KEYS) and stored["quality_flags"] == ["TOO_DARK"] and "flames" not in json.dumps(stored)


def test_stored_assessment_view_is_whitelisted_and_unreadable_rows_are_unavailable():
    assert media.present_stored(None, None, "MODEL_TIMEOUT")["status"] == "UNAVAILABLE"
    assert media.present_stored({"status": "VERIFIED_REAL"})["status"] == "UNAVAILABLE"
    odd = media.present_stored({"status": "REUSED", "indications": {"synthetic": "YES", "edited": "POSSIBLE"}})
    assert odd["indications"] == {"synthetic": "NOT_ASSESSED", "edited": "POSSIBLE", "reused": "NOT_ASSESSED"}


# ======================================================================================= route behaviour per status
def run_case(monkeypatch, result, *, content="Photo of the trail after the rain today"):
    enable(monkeypatch, assess=True)
    model_returns(monkeypatch, result)
    c, h, uid = actor("citizen"); pid = new_post(c, h, content)
    before = world()
    return c, h, uid, pid, before, upload(c, h, pid, picture(exif=True))


def test_no_concern_found_leaves_the_post_published_and_records_the_advisory_result(monkeypatch):
    c, h, uid, pid, before, r = run_case(monkeypatch, completed("NO_CONCERNS_FOUND"))
    assert r.status_code == 201 and r.json()["post_status"] == "published" and post_status(pid) == "published"
    row = db_one("SELECT a.status,a.assessment,a.error_code,a.moderator_decision FROM resq_community_image_assessments a JOIN resq_community_post_images i ON i.id=a.image_id WHERE i.post_id=:p", p=pid)
    assert row["status"] == "AUTHENTIC_NO_CONCERN" and row["assessment"]["moderator_review_recommended"] is False and row["moderator_decision"] is None
    assert db_scalar("SELECT count(*) FROM resq_community_reports WHERE post_id=:p", p=pid) == 0
    assert world() == before


@pytest.mark.parametrize("auth,signals,status", [
    ("POSSIBLE_SYNTHETIC", ["GENERATOR_TAG_IN_METADATA"], "POSSIBLE_SYNTHETIC"),
    ("POSSIBLE_EDITED", ["LEARNED_EDITED_SCORE:0.88"], "POSSIBLE_EDITED"),
    ("INCONSISTENT", ["EXIF_CAPTURE_AFTER_UPLOAD"], "POSSIBLE_EDITED"),
    ("REUSED", ["REUSED_MATCHES:3/x.jpg"], "REUSED"),
    ("INCONCLUSIVE", [], "INCONCLUSIVE"),
])
def test_every_concern_holds_the_post_for_a_human_and_does_nothing_else(monkeypatch, auth, signals, status):
    c, h, uid, pid, before, r = run_case(monkeypatch, completed(auth, signals))
    assert r.status_code == 201 and r.json()["post_status"] == "held" and r.json()["message"] == community.HELD_MESSAGE
    assert post_status(pid) == "held" and db_scalar("SELECT removed_at FROM resq_community_posts WHERE id=:i", i=pid) is None
    reports = db_one("SELECT reason,reporter_id,status FROM resq_community_reports WHERE post_id=:p", p=pid)
    assert reports["reason"] == "auto: media " + status.lower().replace("_", " ") and reports["reporter_id"] is None and reports["status"] == "open"
    assert world() == before            # no incident, image row, assignment, alert, notice, verification, sanction
    # the author is told only that a moderator will look: no verdict, no signal, no model field
    body = r.text + json.dumps(c.get("/api/community/posts", headers=h).json())
    for leaked in (status, "POSSIBLE", "REUSED", "synthetic", "EXIF_CAPTURE", "LEARNED", "GENERATOR", "fake-v1", "indications", "media_assessment", *MODEL_FIELDS):
        assert leaked not in body, leaked
    # a human then decides
    mod, mh, mod_id = actor("incident_commander", scopes=["OD"])
    item = queue_item(mod, mh, pid)
    assert item["held"] is True and item["severity"] == "held" and item["media_assessment"]["status"] == status
    assert mod.post(f"/api/community/moderation/reports/{item['id']}/resolve", headers=mh, json={"action": "approve"}).status_code == 200
    assert post_status(pid) == "published"
    decided = db_one("SELECT a.moderator_decision,a.moderator_id,a.moderator_decided_at FROM resq_community_image_assessments a JOIN resq_community_post_images i ON i.id=a.image_id WHERE i.post_id=:p", p=pid)
    assert decided["moderator_decision"] == "approved" and decided["moderator_id"] == mod_id and decided["moderator_decided_at"] is not None


def test_moderator_can_remove_and_the_decision_is_recorded(monkeypatch):
    c, h, uid, pid, before, r = run_case(monkeypatch, completed("POSSIBLE_SYNTHETIC", ["GENERATOR_TAG_IN_METADATA"]))
    mod, mh, mod_id = actor("control_room_operator", scopes=["OD"])
    item = queue_item(mod, mh, pid)
    assert mod.post(f"/api/community/moderation/reports/{item['id']}/resolve", headers=mh, json={"action": "remove", "reason": "Looks generated"}).status_code == 200
    assert post_status(pid) == "removed"
    assert db_scalar("SELECT a.moderator_decision FROM resq_community_image_assessments a JOIN resq_community_post_images i ON i.id=a.image_id WHERE i.post_id=:p", p=pid) == "removed"
    assert c.get(f"/api/community/posts/{pid}/image", headers=h).status_code == 404       # a removed post's image is gone for everyone, author included
    assert mod.get(f"/api/community/posts/{pid}/image", headers=mh).status_code == 404


@pytest.mark.parametrize("code", [ia.TIMEOUT, ia.BUSY, ia.NOT_CONFIGURED, ia.INFERENCE_DISABLED, ia.INFERENCE_FAILED])
def test_unavailable_model_holds_the_post_and_the_upload_still_persists(monkeypatch, code):
    c, h, uid, pid, before, r = run_case(monkeypatch, ia.unavailable(code))
    assert r.status_code == 201 and post_status(pid) == "held" and db_scalar("SELECT count(*) FROM resq_community_post_images WHERE post_id=:p", p=pid) == 1
    a = db_one("SELECT a.status,a.error_code,a.assessment FROM resq_community_image_assessments a JOIN resq_community_post_images i ON i.id=a.image_id WHERE i.post_id=:p", p=pid)
    assert a["status"] == "UNAVAILABLE" and a["error_code"] == code and a["assessment"]["moderator_review_recommended"] is True
    assert db_scalar("SELECT reason FROM resq_community_reports WHERE post_id=:p", p=pid) == "auto: media unavailable"
    assert world() == before


def test_a_crashing_model_adapter_holds_the_post_it_never_fails_the_upload(monkeypatch):
    enable(monkeypatch, assess=True)
    model_returns(monkeypatch, raises=RuntimeError("model exploded"))
    c, h, _ = actor("citizen"); pid = new_post(c, h)
    r = upload(c, h, pid)
    assert r.status_code == 201 and post_status(pid) == "held"
    assert db_scalar("SELECT error_code FROM resq_community_image_assessments a JOIN resq_community_post_images i ON i.id=a.image_id WHERE i.post_id=:p", p=pid) == ia.INFERENCE_FAILED


def test_the_real_unconfigured_adapter_is_unavailable_and_holds(monkeypatch):
    for name in ("FIRE_EVIDENCE_REPO", "FIRE_EVIDENCE_ARTIFACT_DIR", "FIRE_EVIDENCE_INFERENCE_ENABLED"):
        monkeypatch.delenv(name, raising=False)
    ia.reset_for_tests()
    enable(monkeypatch, assess=True)
    c, h, _ = actor("citizen"); pid = new_post(c, h)
    assert upload(c, h, pid).status_code == 201 and post_status(pid) == "held"
    assert db_scalar("SELECT error_code FROM resq_community_image_assessments a JOIN resq_community_post_images i ON i.id=a.image_id WHERE i.post_id=:p", p=pid) == "MODEL_ARTIFACT_NOT_CONFIGURED"


def test_nothing_is_ever_auto_removed_or_auto_muted(monkeypatch):
    c, h, uid = actor("citizen")
    enable(monkeypatch, assess=True)
    model_returns(monkeypatch, completed("POSSIBLE_SYNTHETIC", ["IPTC_DIGITAL_SOURCE_ALGORITHMIC"]))
    sanctions = db_scalar("SELECT count(*) FROM resq_community_sanctions WHERE user_id=:u", u=uid)
    for i in range(3):
        pid = new_post(c, h, f"Trail photo number {i} after the rain")
        assert upload(c, h, pid, picture(seed=20 + i)).status_code == 201
        assert post_status(pid) == "held" and db_scalar("SELECT removed_at FROM resq_community_posts WHERE id=:i", i=pid) is None
    assert db_scalar("SELECT count(*) FROM resq_community_sanctions WHERE user_id=:u", u=uid) == sanctions
    assert new_post(c, h, "Still able to post after three held photos") > 0               # not muted
    assert db_scalar("SELECT count(*) FROM resq_audit_log WHERE action LIKE 'community_%removed%' AND metadata->>'author_id'=:a", a=str(uid)) == 0


def test_a_post_that_was_already_held_for_a_link_stays_held_and_queued_once_more(monkeypatch):
    enable(monkeypatch, assess=True)
    model_returns(monkeypatch, completed("NO_CONCERNS_FOUND"))
    c, h, _ = actor("citizen"); pid = new_post(c, h, "See https://example.com for the trail map")
    assert post_status(pid) == "held"
    assert upload(c, h, pid).status_code == 201 and post_status(pid) == "held"          # a clean image never releases a held post


# ======================================================================================= visibility
def test_signals_are_visible_to_moderators_only(monkeypatch):
    c, h, uid, pid, before, r = run_case(monkeypatch, completed("REUSED", ["REUSED_MATCHES:3/x.jpg"], ["TOO_SMALL"]))
    mod, mh, _ = actor("control_room_operator", scopes=["OD"])
    item = queue_item(mod, mh, pid)
    shown = item["media_assessment"]
    assert set(shown) == set(media.RESULT_KEYS) and shown["status"] == "REUSED" and shown["advisory"] is True and shown["indications"]["reused"] == "POSSIBLE"
    assert shown["quality_flags"] == ["TOO_SMALL"] and item["image"]["url"] == f"/api/community/posts/{pid}/image" and item["media_moderator_decision"] is None
    assert not [f for f in MODEL_FIELDS if f in json.dumps(item["media_assessment"])]
    other, oh, _ = actor("citizen")
    assert other.get("/api/community/moderation/queue", headers=oh).status_code == 403
    for client, headers in ((c, h), (other, oh)):
        listed = client.get("/api/community/posts", headers=headers).json()["items"]
        assert all("media_assessment" not in i and "assessment" not in i for i in listed)
        assert "REUSED" not in json.dumps(listed) and "TOO_SMALL" not in json.dumps(listed)
    assert fresh_client().get("/api/community/moderation/queue").status_code in (401, 403)


def test_a_held_posts_image_is_hidden_from_the_public_until_a_moderator_approves(monkeypatch):
    c, h, uid, pid, before, r = run_case(monkeypatch, completed("POSSIBLE_EDITED", ["LEARNED_EDITED_SCORE:0.9"]))
    other, oh, _ = actor("citizen")
    mod, mh, _ = actor("incident_commander", scopes=["OD"])
    assert other.get(f"/api/community/posts/{pid}/image", headers=oh).status_code == 404
    assert other.get("/api/community/posts", headers=oh).json()["items"] == [i for i in other.get("/api/community/posts", headers=oh).json()["items"] if i["id"] != pid]
    assert c.get(f"/api/community/posts/{pid}/image", headers=h).status_code == 200            # the author sees their own upload
    mine = next(i for i in c.get("/api/community/posts", headers=h).json()["items"] if i["id"] == pid)
    assert mine["image"] == {"url": f"/api/community/posts/{pid}/image", "mime": "image/jpeg"} and mine["state"] == "held for review"
    assert mod.get(f"/api/community/posts/{pid}/image", headers=mh).status_code == 200         # moderators can inspect it
    item = queue_item(mod, mh, pid)
    assert mod.post(f"/api/community/moderation/reports/{item['id']}/resolve", headers=mh, json={"action": "approve"}).status_code == 200
    assert other.get(f"/api/community/posts/{pid}/image", headers=oh).status_code == 200
    shown = next(i for i in other.get("/api/community/posts", headers=oh).json()["items"] if i["id"] == pid)
    assert shown["image"]["url"].endswith(f"/{pid}/image") and shown["verified"] is False and set(shown["image"]) == {"url", "mime"}


def test_a_tampered_stored_file_is_not_served(monkeypatch):
    enable(monkeypatch)
    c, h, _ = actor("citizen"); pid = new_post(c, h)
    assert upload(c, h, pid).status_code == 201
    key = db_scalar("SELECT storage_key FROM resq_community_post_images WHERE post_id=:p", p=pid)
    (media.image_root() / key).write_bytes(b"tampered")
    assert c.get(f"/api/community/posts/{pid}/image", headers=h).status_code == 404


def test_a_database_key_cannot_escape_the_storage_root(monkeypatch):
    enable(monkeypatch)
    assert media.stored_path("../../etc/passwd") is None and media.stored_path("") is None
    assert media.read_verified("../outside.jpg", "0" * 64) is None


# ======================================================================================= separation from the fire incident workflow
def test_community_posts_do_not_enter_the_fire_incident_workflow(monkeypatch):
    enable(monkeypatch, assess=True)
    model_returns(monkeypatch, completed("POSSIBLE_SYNTHETIC", ["GENERATOR_TAG_IN_METADATA"], derived_label="ACTIVE_FIRE"))
    c, h, uid = actor("citizen")
    before = world()
    pid = new_post(c, h, "Big fire at the north gate, smoke everywhere")          # even emergency wording stays a community post
    assert upload(c, h, pid, picture(seed=31)).status_code == 201
    assert world() == before
    assert db_scalar("SELECT count(*) FROM resq_incidents WHERE reporter_id=:u", u=uid) == 0
    assert db_scalar("SELECT count(*) FROM resq_incident_images i JOIN resq_community_post_images c ON c.sha256=i.sha256") == 0
    fks = {r[0] for r in engine.connect().execute(text("""SELECT ccu.table_name FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name
        WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_name IN ('resq_community_post_images','resq_community_image_assessments')""")).all()}
    assert fks <= {"resq_community_posts", "resq_users", "resq_community_post_images"}


# ======================================================================================= source scans: the two policies cannot cross
APP = BACKEND / "app"
FORBIDDEN_NAMES = {"alert_service", "escalation", "generate_alert", "create_incident", "update_incident_status", "assign_ranger", "dispatch", "notify_staff",
                   "assess_image", "persistence_fields", "resq_incidents", "resq_incident_images", "resq_incident_assignments", "resq_alerts", "resq_field_verifications",
                   "resq_notices"}
FORBIDDEN_MODULE_PARTS = ("operations", "workflow", "citizen", "alert_service", "escalation", "redesign", "simulation", "ingest")


def strip_docstrings(tree):
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and node.body and isinstance(node.body[0], ast.Expr) \
                and isinstance(node.body[0].value, ast.Constant) and isinstance(node.body[0].value.value, str):
            node.body[0].value.value = ""
    return tree


def referenced(tree) -> set:
    names = set()
    for n in ast.walk(tree):
        if isinstance(n, ast.Name):
            names.add(n.id)
        elif isinstance(n, ast.Attribute):
            names.add(n.attr)
        elif isinstance(n, ast.Constant) and isinstance(n.value, str):
            names |= {w for w in FORBIDDEN_NAMES if w in n.value}
        elif isinstance(n, (ast.ImportFrom, ast.Import)):
            for part in ([n.module or ""] if isinstance(n, ast.ImportFrom) else []) + [a.name for a in n.names]:
                names |= {w for w in FORBIDDEN_NAMES if w in part}
    return names


def imported_modules(tree) -> list:
    out = []
    for n in ast.walk(tree):
        if isinstance(n, ast.ImportFrom):
            out.append(("." * n.level) + (n.module or "") + ":" + ",".join(a.name for a in n.names))
        elif isinstance(n, ast.Import):
            out += [a.name for a in n.names]
    return out


def test_the_community_media_module_cannot_reach_incident_alert_or_dispatch_code():
    tree = strip_docstrings(ast.parse((APP / "services" / "community_image_assessment.py").read_text()))
    assert not referenced(tree) & FORBIDDEN_NAMES
    mods = imported_modules(tree)
    assert not [m for m in mods if any(p in m.split(":")[0].lower() for p in FORBIDDEN_MODULE_PARTS)]
    app_imports = [m for m in mods if m.startswith(".")]
    assert sorted(app_imports) == [".:image_assessment"], app_imports        # the only project code it uses is the shared model adapter


def test_the_community_schema_extension_has_no_incident_references():
    tree = strip_docstrings(ast.parse((APP / "schemas_ext" / "community_images.py").read_text()))
    code = " ".join(n.value.lower() for n in ast.walk(tree) if isinstance(n, ast.Constant) and isinstance(n.value, str))
    assert not [w for w in ("incident", "alert", "assign", "notice", "dispatch") if w in code]


def test_the_community_router_never_imports_or_calls_incident_assignment_or_dispatch_code():
    tree = strip_docstrings(ast.parse((APP / "routers" / "community.py").read_text()))
    mods = imported_modules(tree)
    assert not [m for m in mods if any(p in m.split(":")[0].lower() for p in FORBIDDEN_MODULE_PARTS if p != "alert_service")]
    assert not any("image_assessment:" in m and "community_image_assessment" not in m for m in mods), mods          # the router has no direct model access
    assert not {"assess_image", "assess_image_async", "persistence_fields", "escalation", "create_incident", "dispatch", "assign_ranger"} & referenced(tree)
    assert not [w for w in ("resq_incidents", "resq_incident_images", "resq_incident_assignments", "resq_alerts", "resq_field_verifications", "resq_notices") if w in referenced(tree)]
    # the one pre-existing alert call (a warning to the sanctioned member) is the only one, and it lives in the sanction route, not in any media code path
    calls = []
    for fn in [n for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))]:
        for sub in ast.walk(fn):
            if isinstance(sub, ast.Attribute) and isinstance(sub.value, ast.Name) and sub.value.id == "alert_service":
                calls.append(fn.name)
    assert set(calls) <= {"create_sanction"}, calls
    for name in ("upload_post_image", "get_post_image", "_attach_image_links", "moderation_queue", "resolve_report", "_hold_with_reason"):
        fn = next(n for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == name)
        assert "alert_service" not in {x.id for x in ast.walk(fn) if isinstance(x, ast.Name)}, name


def test_the_incident_evidence_routers_do_not_use_the_community_module():
    for name in ("operations.py", "citizen.py", "workflow.py"):
        src = (APP / "routers" / name).read_text()
        assert "community_image_assessment" not in src and "resq_community_post_images" not in src and "resq_community_image_assessments" not in src, name
    assert "resq_community" not in (APP / "services" / "image_assessment.py").read_text()   # the shared model adapter knows nothing about either policy

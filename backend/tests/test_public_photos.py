"""Public copies of citizen photos: cleaned, coarse, labelled unverified, held on warning signs, gone on close or withdraw (docs/REPORT_TO_ALERT_DESIGN.md)."""
import io
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from sqlalchemy import text  # noqa: E402

from app.database.session import engine, init_db  # noqa: E402
from app.services import public_photo  # noqa: E402
from tests.test_citizen_report_route import body, citizen  # noqa: E402
from tests.test_fire_evidence_routes import actor, files  # noqa: E402


@pytest.fixture(scope="module", autouse=True)
def database():
    init_db()


@pytest.fixture(autouse=True)
def switched_on(monkeypatch, tmp_path):
    monkeypatch.setenv("PUBLIC_REPORTS_ENABLED", "true")
    monkeypatch.setenv("PUBLIC_PHOTO_STORAGE_DIR", str(tmp_path))
    monkeypatch.setenv("PUBLIC_RATE_LIMIT_PER_MINUTE", "")


def photo_with_exif(size=(2400, 1800)) -> bytes:
    from PIL import Image
    exif = Image.Exif(); exif[0x010F] = "SecretCameraMaker"; exif[0x0132] = "2026:10:30 10:00:00"
    out = io.BytesIO(); Image.new("RGB", size, (200, 80, 20)).save(out, "JPEG", exif=exif); return out.getvalue()


def report_with_photo(note="Smoke is rising", data=None):
    client, headers, user_id = citizen()
    made = client.post("/api/citizen/reports", headers=headers, json=body(description=note, latitude=20.3, longitude=85.8))
    assert made.status_code == 201, made.text
    rid = made.json()["report"]["id"]
    up = client.post(f"/api/citizen/reports/{rid}/evidence", headers=headers, files=files(data or photo_with_exif()))
    assert up.status_code == 201, up.text
    return client, headers, rid, up.json()["evidence"]["id"]


def listed(client, rid):
    return [i for i in client.get("/api/public/reports").json()["items"] if i["id"] == rid]


def test_clean_copy_drops_hidden_data_and_shrinks():
    from PIL import Image
    copy = public_photo.clean_copy(photo_with_exif())
    img = Image.open(io.BytesIO(copy))
    assert max(img.size) == 1200 and not img.getexif() and b"SecretCameraMaker" not in copy


def test_clean_copy_refuses_junk():
    with pytest.raises(ValueError):
        public_photo.clean_copy(b"not an image")


def test_hold_rules():
    assert public_photo.hold_reason({"indications": {"edited": "POSSIBLE"}}, "ok", 0) == "auto: possible edit"
    assert public_photo.hold_reason({"indications": {"synthetic": "POSSIBLE"}}, "ok", 0) == "auto: possible generated image"
    assert public_photo.hold_reason(None, "call 98765 43210 now", 0) == "auto: link or phone number in the note"
    assert public_photo.hold_reason(None, "see https://x.example", 0)
    assert public_photo.hold_reason({"indications": {"synthetic": "NOT_ASSESSED"}}, "Smoke is rising", 0) is None   # an unavailable check does not hold
    assert public_photo.hold_reason(None, "fine", 1) == "auto: an earlier photo from this account was held"


def test_an_unverified_report_is_public_labelled_coarse_and_clean():
    client, _, rid, image_id = report_with_photo()
    items = listed(client, rid)
    assert len(items) == 1
    item = items[0]
    assert item["label"] == "unverified" and "not checked by officials" in item["text"]
    assert (item["lat"], item["lon"]) != (20.3, 85.8) and abs(item["lat"] - 20.3) < 0.1
    assert not ({"reporter_id", "latitude", "longitude", "client_key"} & set(item))
    photo = client.get(item["photos"][0])
    assert photo.status_code == 200 and photo.headers["content-type"] == "image/jpeg" and b"SecretCameraMaker" not in photo.content


def test_a_note_with_a_phone_number_is_not_public():
    client, _, rid, _ = report_with_photo(note="Call me on 98765 43210")
    assert listed(client, rid) == []
    state = engine.connect().execute(text("SELECT public_state FROM resq_incident_images WHERE incident_id=:i"), {"i": rid}).scalar()
    assert state == "held"


def test_staff_can_withdraw_release_and_closing_hides_everything():
    client, _, rid, image_id = report_with_photo()
    url = listed(client, rid)[0]["photos"][0]
    staff, sh, _ = actor("control_room_operator", scopes=["OD"])
    assert staff.post(f"/api/incidents/{rid}/images/{image_id}/public", headers=sh, json={"action": "withdraw"}).json()["public_state"] == "withdrawn"
    assert listed(client, rid) == [] and client.get(url).status_code == 404
    client2, _, rid2, image2 = report_with_photo()
    url2 = listed(client2, rid2)[0]["photos"][0]
    assert staff.patch(f"/api/incidents/{rid2}/status", headers=sh, json={"status": "closed", "close_reason": "not_a_fire"}).status_code in (200, 422)
    with engine.begin() as db:
        db.execute(text("UPDATE resq_incidents SET status='closed' WHERE id=:i"), {"i": rid2})
    assert listed(client2, rid2) == [] and client2.get(url2).status_code == 404


def test_switched_off_shows_nothing(monkeypatch):
    client, _, rid, _ = report_with_photo()
    monkeypatch.setenv("PUBLIC_REPORTS_ENABLED", "false")
    assert client.get("/api/public/reports").json() == {"enabled": False, "items": []}


def test_a_citizen_can_see_their_own_photo_and_the_list_counts_it(monkeypatch):
    """The photo route must work when files live in blob storage (no local file exists)."""
    from app.services import blob_storage
    store = {}
    async def put(path, data, content_type): store[path] = data; return True
    async def get(path, sha): return store.get(path)
    monkeypatch.setattr(blob_storage, "enabled", lambda: True)
    monkeypatch.setattr(blob_storage, "put", put); monkeypatch.setattr(blob_storage, "get", get)
    client, headers, rid, image_id = report_with_photo()
    shown = client.get(f"/api/citizen/reports/{rid}/evidence/{image_id}", headers=headers)
    assert shown.status_code == 200 and shown.headers["content-type"] == "image/jpeg" and len(shown.content) > 100
    mine = [i for i in client.get("/api/citizen/reports", headers=headers).json()["items"] if i["id"] == rid][0]
    assert mine["photo_count"] == 1 and mine["first_photo_id"] == image_id


def test_nearby_hint_counts_other_peoples_reports_only():
    first, _, rid, _ = report_with_photo()                    # a report near 20.3, 85.8
    other, headers, _ = citizen()
    found = other.get("/api/citizen/reports/nearby", params={"lat": 20.31, "lon": 85.81}, headers=headers).json()
    assert found["count"] >= 1 and found["latest_minutes_ago"] <= 2 and found["nearest_km"] <= 3
    assert set(found) == {"count", "latest_minutes_ago", "nearest_km"}                        # nothing identifying
    far = other.get("/api/citizen/reports/nearby", params={"lat": 12.0, "lon": 77.0}, headers=headers).json()
    assert far["count"] == 0


def test_three_different_citizens_reporting_a_photo_takes_it_down_and_holds_it():
    owner, _, rid, image_id = report_with_photo()
    url = f"/api/citizen/public-photos/{rid}/{image_id}/flag"
    own = owner.post(url, headers=_headers_of(owner, rid))
    watchers = [citizen() for _ in range(3)]
    for index, (client, headers, _) in enumerate(watchers):
        assert client.post(url, headers=headers).status_code == 200
        shown = [i for i in client.get("/api/public/reports").json()["items"] if i["id"] == rid]
        assert bool(shown) == (index < 2)                                                      # gone after the third
    state, reason = engine.connect().execute(text("SELECT public_state,public_hold_reason FROM resq_incident_images WHERE id=:i"), {"i": image_id}).one()
    assert state == "held" and "citizens reported" in reason


def test_a_citizen_sees_that_a_photo_is_waiting_but_not_why():
    client, headers, rid, image_id = report_with_photo(note="Call me on 98765 43210")
    evidence = client.get(f"/api/citizen/reports/{rid}", headers=headers).json()["report"]["evidence"][0]
    assert evidence["waiting_for_check"] is True and "hold" not in str(evidence).lower() and "phone" not in str(evidence).lower()


def _headers_of(client, rid):
    return {"x-resq-csrf": client.cookies.get("resq_csrf") or ""}


def test_public_reports_show_only_positive_photo_check_marks():
    client, _, rid, image_id = report_with_photo()
    with engine.begin() as db:
        db.execute(text("UPDATE resq_incident_images SET authenticity_status='NO_CONCERN_DETECTED', assessment_status='COMPLETED', assessment=CAST(:a AS jsonb) WHERE id=:i"),
                   {"a": '{"derived_label": "SMOKE_ONLY"}', "i": image_id})
    item = listed(client, rid)[0]
    assert item["photo_check"] == {"no_sign_of_editing": True, "looks_like_flames_or_smoke": True}
    with engine.begin() as db:
        db.execute(text("UPDATE resq_incident_images SET authenticity_status='POSSIBLE_EDITED', assessment=CAST(:a AS jsonb) WHERE id=:i"), {"a": '{"derived_label": "UNCERTAIN"}', "i": image_id})
    assert listed(client, rid)[0]["photo_check"] == {"no_sign_of_editing": False, "looks_like_flames_or_smoke": False}      # nothing negative is ever said

"""The photo library: only photos whose owner agreed, labelled by staff in scope, withdrawable, exportable without hidden data."""
import csv
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from sqlalchemy import text  # noqa: E402

from app.database.session import engine, init_db  # noqa: E402
from tests.test_citizen_report_route import body, citizen  # noqa: E402
from tests.test_fire_evidence_routes import actor, files  # noqa: E402
from tests.test_public_photos import photo_with_exif  # noqa: E402


@pytest.fixture(scope="module", autouse=True)
def database():
    init_db()


def report(research: str, size=(1600, 1200)):
    client, headers, _ = citizen()
    rid = client.post("/api/citizen/reports", headers=headers, json=body(latitude=20.3, longitude=85.8)).json()["report"]["id"]
    sent = client.post(f"/api/citizen/reports/{rid}/evidence", headers=headers, files={**files(photo_with_exif(size)), **({"research": (None, research)} if research else {})})
    assert sent.status_code == 201, sent.text
    return client, headers, rid, sent.json()["evidence"]["id"]


def test_only_agreed_photos_are_in_the_library_and_staff_label_them():
    _, _, rid, agreed = report("1"); _, _, _, refused = report("")
    staff, sh, _ = actor("control_room_operator", scopes=["OD"])
    listed = {i["id"] for i in staff.get("/api/photo-library?status=unlabeled&limit=100", headers=sh).json()["items"]}
    assert agreed in listed and refused not in listed
    assert staff.put(f"/api/photo-library/{refused}/labels", headers=sh, json={"scene": "smoke", "origin": "camera"}).status_code == 404       # not agreed
    assert staff.put(f"/api/photo-library/{agreed}/labels", headers=sh, json={"scene": "smoke", "origin": "camera"}).status_code == 200
    assert staff.put(f"/api/photo-library/{agreed}/labels", headers=sh, json={"scene": "fire", "origin": "nonsense"}).status_code == 422
    other, oh, _ = actor("control_room_operator", scopes=["MH"])
    assert other.put(f"/api/photo-library/{agreed}/labels", headers=oh, json={"scene": "fire", "origin": "camera"}).status_code == 404         # outside their states
    stats = staff.get("/api/photo-library/stats", headers=sh).json()
    assert stats["labeled"] >= 1 and stats["target"] == 200 and stats["by_origin"].get("camera", 0) >= 1


def test_a_citizen_can_take_the_agreement_back_and_the_labels_go():
    client, headers, rid, image = report("1")
    staff, sh, _ = actor("control_room_operator", scopes=["OD"])
    staff.put(f"/api/photo-library/{image}/labels", headers=sh, json={"scene": "fire", "origin": "camera"})
    assert client.get(f"/api/citizen/reports/{rid}", headers=headers).json()["report"]["evidence"][0]["shared_for_research"] is True
    assert client.put(f"/api/citizen/photos/{image}/research", headers=headers, json={"allow": False}).status_code == 200
    with engine.connect() as db:
        assert db.execute(text("SELECT research_consent,research_scene,research_origin FROM resq_incident_images WHERE id=:i"), {"i": image}).one() == (False, None, None)
    other, oh, _ = citizen()
    assert other.put(f"/api/citizen/photos/{image}/research", headers=oh, json={"allow": True}).status_code == 404                              # not their photo


def test_the_export_writes_clean_labelled_photos(tmp_path):
    _, _, _, image = report("1")
    staff, sh, _ = actor("control_room_operator", scopes=["OD"])
    staff.put(f"/api/photo-library/{image}/labels", headers=sh, json={"scene": "smoke", "origin": "edited"})
    run = subprocess.run([sys.executable, str(BACKEND / "scripts" / "export_photo_library.py"), str(tmp_path)], capture_output=True, text=True, cwd=BACKEND)
    assert run.returncode == 0, run.stderr
    rows = list(csv.DictReader(open(tmp_path / "manifest.csv")))
    mine = [r for r in rows if r["group"] == "phone_edited"]
    assert mine and mine[-1]["want"] == "held" and mine[-1]["scene"] == "smoke"
    from PIL import Image
    assert not Image.open(tmp_path / mine[-1]["path"]).getexif()

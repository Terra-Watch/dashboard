"""Exports the labelled photo library for testing and recalibrating the photo check.
Only photos whose owner agreed, and that staff labelled. Each photo is re-encoded so no hidden data (time, place, device) comes with it; nothing identifies the person.
Writes OUT/img/NNNN.jpg and OUT/manifest.csv (path, group, want, scene), which scripts/eval_authenticity_sets.py reads as it is.
  group = phone_<origin>; want = published for a camera photo, held for edited, generated and screenshot photos.
usage: python scripts/export_photo_library.py OUT_DIR
"""
import asyncio, csv, io, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app.core.config  # noqa: E402,F401
from PIL import Image, ImageOps  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.database.session import engine  # noqa: E402
from app.services import blob_storage  # noqa: E402
from app.routers.citizen import _stored_image_path  # noqa: E402


async def main(out: Path) -> None:
    (out / "img").mkdir(parents=True, exist_ok=True)
    with engine.connect() as db:
        rows = db.execute(text("""SELECT id,storage_key,sha256,research_scene AS scene,research_origin AS origin FROM resq_incident_images
            WHERE research_consent AND research_scene IS NOT NULL AND research_origin IS NOT NULL ORDER BY id""")).mappings().all()
    written = []
    for n, row in enumerate(rows):
        data = await blob_storage.read_or_local(row["storage_key"], _stored_image_path(row["storage_key"]), row["sha256"])
        if data is None:
            print("skipped (file not found):", row["id"], file=sys.stderr); continue
        with Image.open(io.BytesIO(data)) as img:
            clean = ImageOps.exif_transpose(img).convert("RGB")
        path = f"img/{n:04d}.jpg"; clean.save(out / path, "JPEG", quality=92)
        written.append({"path": path, "group": f"phone_{row['origin']}", "want": "published" if row["origin"] == "camera" else "held", "scene": row["scene"]})
    with open(out / "manifest.csv", "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["path", "group", "want", "scene"]); writer.writeheader(); writer.writerows(written)
    print(f"{len(written)} photos exported to {out}")


asyncio.run(main(Path(sys.argv[1])))

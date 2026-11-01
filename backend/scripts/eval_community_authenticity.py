"""Tests the media-authenticity check exactly as a community post runs it (community_image_assessment.assess_upload with the signed community bundle).

Groups (a post is "held" when the check says anything but AUTHENTIC_NO_CONCERN):
  real_fire_scene   real D-Fire photos                  want: published (not held)
  real_lookalike    real photos of fog, sunsets, burns  want: published
  real_messaging    the first real photos sent through a messaging app (half size, JPEG q40)  want: published
  benign_edit       resize, brightness, crop            want: published
  edit_paste        a patch from another photo pasted in  want: held
  edit_cover        a region covered up                 want: held
Not covered: AI-generated images (no generator is installed here; the earlier test on generated sets ran on a cloud machine).
usage: python scripts/eval_community_authenticity.py [--n 40] [--out results.json]
"""
import argparse, asyncio, collections, io, json, os, random, sys, time
from pathlib import Path

os.environ.setdefault("FIRE_EVIDENCE_TIMEOUT_S", "90")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app.core.config  # noqa: E402,F401  (loads backend/.env: the signed community bundle location)
from PIL import Image, ImageEnhance, ImageFilter  # noqa: E402
from app.services import community_image_assessment as media  # noqa: E402

ROOT = Path(__file__).resolve().parents[3] / "fire-evidence-assessor" / "data"


def jpeg(img: Image.Image, q=92) -> bytes:
    out = io.BytesIO(); img.convert("RGB").save(out, "JPEG", quality=q); return out.getvalue()


def paste_patch(base: Image.Image, donor: Image.Image, rnd: random.Random) -> Image.Image:
    w, h = base.size; pw, ph = int(w * rnd.uniform(.2, .35)), int(h * rnd.uniform(.2, .35))
    dx, dy = rnd.randrange(0, max(1, donor.width - pw)), rnd.randrange(0, max(1, donor.height - ph))
    patch = donor.crop((dx, dy, dx + pw, dy + ph)).resize((pw, ph))
    out = base.copy(); out.paste(patch, (rnd.randrange(0, w - pw), rnd.randrange(0, h - ph))); return out


def cover(base: Image.Image, rnd: random.Random) -> Image.Image:
    w, h = base.size; cw, ch = int(w * .3), int(h * .3); x, y = rnd.randrange(0, w - cw), rnd.randrange(0, h - ch)
    out = base.copy(); region = out.crop((x, y, x + cw, y + ch)).filter(ImageFilter.GaussianBlur(25)); out.paste(region, (x, y)); return out


def benign(base: Image.Image, rnd: random.Random) -> Image.Image:
    kind = rnd.choice(["resize", "bright", "crop"])
    if kind == "resize": return base.resize((int(base.width * .6), int(base.height * .6)))
    if kind == "bright": return ImageEnhance.Brightness(base).enhance(rnd.uniform(1.15, 1.4))
    w, h = base.size; return base.crop((int(w * .08), int(h * .08), int(w * .92), int(h * .92)))


async def main() -> None:
    ap = argparse.ArgumentParser(); ap.add_argument("--n", type=int, default=40); ap.add_argument("--out"); a = ap.parse_args()
    rnd = random.Random(7)
    real = sorted((ROOT / "dfire/raw/data/test/images").glob("*.jpg")); rnd.shuffle(real); real = real[: a.n * 3]
    looks = sorted((ROOT / "lookalikes/img").glob("*/*.jpg")); rnd.shuffle(looks); looks = looks[: a.n]
    sets: dict[str, list[tuple[str, bytes]]] = collections.defaultdict(list)
    for p in real[: a.n]: sets["real_fire_scene"].append((p.name, p.read_bytes()))
    for p in looks: sets["real_lookalike"].append((p.name, p.read_bytes()))
    for p in real[: a.n // 2]:
        im = Image.open(p).convert("RGB"); sets["real_messaging"].append((p.name, jpeg(im.resize((im.width // 2, im.height // 2)), 40)))
    for p in real[a.n: 2 * a.n]:
        im = Image.open(p).convert("RGB"); sets["benign_edit"].append((p.name, jpeg(benign(im, rnd))))
    donors = [Image.open(p).convert("RGB") for p in real[2 * a.n: 3 * a.n]]
    for i, p in enumerate(real[: a.n]):
        im = Image.open(p).convert("RGB"); sets["edit_paste"].append((p.name, jpeg(paste_patch(im, donors[i % len(donors)], rnd))))
    for p in real[: a.n // 2]:
        im = Image.open(p).convert("RGB"); sets["edit_cover"].append((p.name, jpeg(cover(im, rnd))))
    want_held = {"edit_paste", "edit_cover"}
    table = {}
    for group, items in sets.items():
        counts = collections.Counter(); t0 = time.time()
        for name, data in items:
            result = await media.assess_upload(data, f"eval/{group}/{name}")
            counts[result["status"]] += 1
        held = sum(v for k, v in counts.items() if k != "AUTHENTIC_NO_CONCERN")
        table[group] = {"n": len(items), "held": held, "held_rate": round(held / len(items), 3), "statuses": dict(counts), "seconds": round(time.time() - t0, 1), "want": "held" if group in want_held else "published"}
        print(group, table[group], flush=True)
    if a.out: Path(a.out).write_text(json.dumps(table, indent=1))


asyncio.run(main())

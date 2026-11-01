"""Runs the media-authenticity check, exactly as a community post runs it, on labelled sets (a folder with a manifest.csv of path,group,want where want is 'held' or 'published').
Prints and saves, per group, how many were held and the status counts, and checks the rates against the targets in docs/CITIZEN_AI_USE_CASES.md.
usage: python scripts/eval_authenticity_sets.py MANIFEST.csv [--root DIR] [--out results.json] [--n 100]
"""
import argparse, asyncio, collections, csv, json, os, random, sys, time
from pathlib import Path

os.environ.setdefault("FIRE_EVIDENCE_TIMEOUT_S", "90")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app.core.config  # noqa: E402,F401
from app.services import community_image_assessment as media  # noqa: E402

TARGETS = {"published": ("held_rate", "<=", 0.10), "held": ("held_rate", ">=", 0.85)}   # real photos: at most 10% held; edited or generated: at least 85% held


async def main() -> None:
    ap = argparse.ArgumentParser(); ap.add_argument("manifest"); ap.add_argument("--root"); ap.add_argument("--out"); ap.add_argument("--n", type=int, default=100); a = ap.parse_args()
    root = Path(a.root or Path(a.manifest).parent); rows = list(csv.DictReader(open(a.manifest))); rnd = random.Random(11)
    groups: dict[str, list[dict]] = collections.defaultdict(list)
    for row in rows: groups[row["group"]].append(row)
    table = {}
    for group, items in groups.items():
        rnd.shuffle(items); items = items[: a.n]; counts = collections.Counter(); t0 = time.time()
        for row in items:
            result = await media.assess_upload((root / row["path"]).read_bytes(), f"eval/{group}/{Path(row['path']).name}")
            counts[result["status"]] += 1
        held = sum(v for k, v in counts.items() if k != "AUTHENTIC_NO_CONCERN"); want = items[0]["want"]
        rate = held / len(items); metric, op, limit = TARGETS[want]
        ok = rate <= limit if op == "<=" else rate >= limit
        table[group] = {"n": len(items), "held": held, "held_rate": round(rate, 3), "statuses": dict(counts), "want": want, "target": f"{op} {limit}", "meets_target": ok, "seconds": round(time.time() - t0, 1)}
        print(group, table[group], flush=True)
    if a.out: Path(a.out).write_text(json.dumps(table, indent=1))


asyncio.run(main())

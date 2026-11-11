"""Build the area forecast of one run: python area_forecast_job.py RUN_DIR --cells CELLS.parquet --fire FIRE_STORE.parquet --levels LEVELS.json [--places PLACES.parquet] [--runs RUNS_DIR]
Reads RUN_DIR/scores.parquet and run.json (score_daily.py) and writes RUN_DIR/area_forecast.json. Yesterday's record is added when the fire store already holds yesterday's detections."""
import argparse, json, os, sys
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import area_forecast as AF  # noqa: E402


def make(run_dir, cells_path, fire_path, levels_path, places_path=None, runs_dir=None):
    info = json.load(open(f"{run_dir}/run.json")); scores = pd.read_parquet(f"{run_dir}/scores.parquet"); levels = AF.load_levels(levels_path)
    places = pd.read_parquet(places_path) if places_path and os.path.exists(places_path) else None
    fd = pd.Timestamp(info["forecast_date"]); prev = None
    prev_path = f"{runs_dir or os.path.dirname(run_dir)}/{(fd - pd.Timedelta(days=2)).date()}/area_forecast.json"        # the run issued the day before: its forecast date is yesterday
    if os.path.exists(prev_path):
        prev = json.load(open(prev_path)); fire = pd.read_parquet(fire_path); cells = pd.read_parquet(cells_path, columns=["cell_id", "lat", "lon"])
        d = fire[(pd.to_datetime(fire.date).dt.normalize() == pd.Timestamp(prev["date"])) & (fire.forest.astype(bool))] if "forest" in fire else fire[pd.to_datetime(fire.date).dt.normalize() == pd.Timestamp(prev["date"])]
        if len(d): prev["outcome"] = AF.outcome_of(prev, cells, d.cell_id.values, levels["block_deg"])
    degraded = info.get("degraded") or []
    out = AF.build(fd, scores, levels, places=places, previous=prev, mode=info.get("mode", "live"), model={"id": info["model_id"], "version": info["model_version"], "degraded": degraded}, issued_at=info["issued_at"])
    out["status"] = info.get("status"); out["coverage"] = info.get("coverage")
    json.dump(out, open(f"{run_dir}/area_forecast.json", "w"), separators=(",", ":")); return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("run_dir"); [ap.add_argument(f"--{k}", required=(k in ("cells", "fire", "levels"))) for k in ("cells", "fire", "levels", "places", "runs")]; a = ap.parse_args()
    o = make(a.run_dir, a.cells, a.fire, a.levels, a.places, a.runs); print(json.dumps({"date": o["date"], "summary": o["summary"], "yesterday": o.get("yesterday")}))

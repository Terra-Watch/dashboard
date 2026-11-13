"""verify_forecasts.py must not fail when an old run folder has run.json but no scores.parquet (scores pruned from the state release): it skips that run and exits 0."""
import json, os, subprocess, sys, tempfile
import pandas as pd

SCRIPT = os.path.join(os.path.dirname(__file__), "..", "live", "verify_forecasts.py")


def test_a_run_without_scores_is_skipped_not_fatal():
    with tempfile.TemporaryDirectory() as t:
        os.makedirs(f"{t}/runs/2026-11-01"); json.dump({"forecast_date": "2026-11-01", "model_version": "x", "degraded": []}, open(f"{t}/runs/2026-11-01/run.json", "w"))
        pd.DataFrame({"date": pd.to_datetime(["2026-11-10"]), "cell_id": [1], "forest": [True]}).to_parquet(f"{t}/fire.parquet")
        r = subprocess.run([sys.executable, SCRIPT, "--runs", f"{t}/runs", "--fire", f"{t}/fire.parquet", "--out", f"{t}/v.csv"], capture_output=True, text=True)
        assert r.returncode == 0, r.stderr
        assert "skipped 1 run(s) without scores: 2026-11-01" in r.stdout

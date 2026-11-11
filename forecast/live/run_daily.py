"""One daily run for forecast day d (default: today, UTC):  python run_daily.py [YYYY-MM-DD]
Steps: verify earlier runs, refresh fire detections, refresh weather, fetch the GFS block, score every cell, import the run into the database.
State (bundle, stores, run outputs) lives in $WORK. Secrets come from the environment (FIRMS_MAP_KEY, RISK_BUNDLE_PUBLIC_KEY, and either RISK_INGEST_URL + RISK_INGEST_TOKEN or DATABASE_URL);
locally they are read from website/backend/.env when not set. The first failing step stops the run; the whole run is retried (RUN_ATTEMPTS, 20 minutes apart).
Exit code 0 only when the run was imported, so a scheduler can alert on failure.
"""
import os, subprocess, sys, time
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__)); BACKEND = os.environ.get("WEBSITE_BACKEND", os.path.abspath(os.path.join(HERE, "../../backend")))
WORK = os.environ.get("WORK", os.path.abspath(os.path.join(HERE, "../state"))); BUNDLE = os.environ.get("BUNDLE", f"{WORK}/bundle")
PY, PY_GFS, PY_WEB = sys.executable, os.environ.get("PY_GFS", sys.executable), os.environ.get("PY_WEB", sys.executable)  # PY_GFS / PY_WEB: other interpreters, only when one environment lacks eccodes or the database drivers


def load_env_file(path):
    if not os.path.exists(path): return
    for line in open(path).read().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1); os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def run(*cmd, cwd=None, optional=False):
    print("$", os.path.basename(cmd[1]) if len(cmd) > 1 else cmd[0], *[c for c in cmd[2:] if not c.startswith("/")][:6], flush=True)
    r = subprocess.run(list(cmd), cwd=cwd)
    if r.returncode and not optional: raise RuntimeError(f"step failed ({r.returncode}): {os.path.basename(cmd[1])}")
    return r.returncode


def once(day):
    compact, out = day.replace("-", ""), f"{WORK}/runs/{day}"
    os.makedirs(f"{WORK}/gfs", exist_ok=True); os.makedirs(out, exist_ok=True)
    cells = f"{BUNDLE}/cells.parquet"
    run(PY, f"{HERE}/verify_forecasts.py", "--runs", f"{WORK}/runs", "--fire", f"{WORK}/fire.parquet", "--out", f"{WORK}/verification.csv")
    run(PY, f"{HERE}/refresh_fire.py", "--day", day, "--cells", cells, "--store", f"{WORK}/fire.parquet")
    run(PY, f"{HERE}/refresh_weather.py", "--day", day, "--cells", cells, "--store", f"{WORK}/weather.parquet")
    run(PY_GFS, f"{HERE}/gfs_fetch.py", "--day", compact, "--cells", cells, "--out", f"{WORK}/gfs", optional=True)  # a missing run is flagged gfs_missing, not fatal
    gfs = f"{WORK}/gfs/gfs_{compact}.npz"
    run(PY, f"{HERE}/score_daily.py", "--day", day, "--bundle", BUNDLE, "--weather", f"{WORK}/weather.parquet", "--fire", f"{WORK}/fire.parquet",
        *(["--gfs", gfs] if os.path.exists(gfs) else []), "--out", out)
    levels = os.environ.get("AREA_LEVELS")                                                          # the area forecast: calibration and areas fitted on 2024 (wildfire-ignition-forecasting/scripts/13_forecast_levels.py)
    if levels and os.path.exists(levels):
        run(PY, f"{HERE}/area_forecast_job.py", out, "--cells", cells, "--fire", f"{WORK}/fire.parquet", "--levels", levels, *(["--places", os.environ["AREA_PLACES"]] if os.environ.get("AREA_PLACES") else []), optional=True)
    if os.environ.get("RISK_INGEST_URL") and os.environ.get("RISK_INGEST_TOKEN"):  # normal route: the dashboard stores it, no database password leaves its host
        run(PY, f"{HERE}/post_run.py", out, os.environ["RISK_INGEST_URL"])
        if os.path.exists(f"{out}/area_forecast.json") and os.environ.get("AREA_FORECAST_URL"): run(PY, f"{HERE}/post_area_forecast.py", out, os.environ["AREA_FORECAST_URL"], optional=True)
    else:
        run(PY_WEB, "-m", "inference.import_live_run", out, cwd=BACKEND)


def main(argv):
    day = argv[1] if len(argv) > 1 else datetime.now(timezone.utc).strftime("%Y-%m-%d")
    load_env_file(f"{BACKEND}/.env"); attempts = int(os.environ.get("RUN_ATTEMPTS", "6"))
    for n in range(1, attempts + 1):
        try:
            print(f"=== {datetime.now(timezone.utc):%FT%TZ} run for {day}, attempt {n}", flush=True); once(day); open(f"{WORK}/runs/{day}/imported.ok", "w").write(datetime.now(timezone.utc).isoformat()); print("done", flush=True); return 0   # the marker lets a later schedule skip a day that is finished
        except Exception as e:
            print(f"attempt {n} failed: {e}", flush=True)
            if n < attempts: time.sleep(int(os.environ.get("RUN_RETRY_WAIT", "1200")))
    if sys.platform == "darwin":
        subprocess.run(["osascript", "-e", f'display notification "Daily fire forecast failed for {day}" with title "TerraWatch"'], check=False)
    return 1


if __name__ == "__main__": sys.exit(main(sys.argv))

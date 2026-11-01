# Daily fire forecast job (cloud)

Scores every forest cell for tomorrow once a day and loads the run into the dashboard database (`forecast_runs`, `cell_scores`). The map reads it through `/api/risk/geojson` and `/api/risk/status`.

```
.github/workflows/daily-forecast.yml   11:40 UTC every day, or run by hand (Actions > daily-forecast > Run workflow)
forecast/live/run_daily.py             the whole run; exit code 0 only if the run was imported
forecast/live/*.py                     fire history, weather, GFS block, features, scoring, verification
forecast/live/vendor/                  the dataset feature code the model was trained with (copied, do not edit)
```

Everything comes from open sources without a key (Open-Meteo, NOAA GFS on AWS); only NASA FIRMS needs the free `FIRMS_MAP_KEY`.
Every network call is retried again and again (up to 2 hours per call, 90 minutes for the GFS run to appear), then the whole run is retried 6 times, 20 minutes apart.
A run that still fails exits non-zero, so GitHub emails the repository's watchers; the map then shows "stale" after 36 hours.

## One-time setup (needs someone with admin rights on this repository)

1. **Secrets** (Settings > Secrets and variables > Actions): `DATABASE_URL` (the production database), `FIRMS_MAP_KEY`, `RISK_BUNDLE_PUBLIC_KEY` (the public key printed by `make_bundle.py`; the bundle is refused if it is signed by any other key).
2. **State release.** The job keeps its model bundle, weather and fire stores and past runs in a release called `forecast-state`, so it never depends on a personal computer. Create it once from a prepared state folder:
   ```
   tar -czf state.tar.gz -C wildfire-ml-v4/live_state bundle fire.parquet weather.parquet forest_mask.npz verification.csv runs
   gh release create forecast-state state.tar.gz --title "forecast state" --notes "model bundle and stores for the daily forecast job"
   ```
   (`init_fire_store.py` and `make_bundle.py` in `wildfire-ml-v4/src/live/` build those files from the dataset and the finished study runs.)
3. Run the workflow once by hand and check the map's status line.
4. Then switch off the backup run on the Mac: `launchctl bootout gui/$(id -u)/com.terrawatch.dailyforecast`.

## Local run

```
WORK=wildfire-ml-v4/live_state python forecast/live/run_daily.py 2026-11-01
```

## Checks

`python -m unittest discover -s forecast/tests` (no data needed). The bundle golden test and the fire-history parity test need the study data and live in `wildfire-ml-v4/tests/`.

## What to know

- Vegetation is a seasonal average (no free live source). On the 2025 test year this cost 0.002 AUPRC (0.4728 to 0.4709); see `docs/12-open-meteo-weather-gap-check.md`.
- Open-Meteo's free API is for non-commercial use; fine for a public demo, not for a paid service.
- `forecast/state/verification.csv` gains one row per finished day: the forecast scored against the fire the satellite then saw. This is the silent-period check.

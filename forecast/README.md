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
   tar -czf state.tar.gz -C wildfire-ml-v4/live_state bundle detections.parquet fire.parquet weather.parquet forest_mask.npz quality verification.csv runs
   gh release create forecast-state state.tar.gz --title "forecast state" --notes "model bundle and stores for the daily forecast job"
   ```
   (`init_detection_store.py` and `make_bundle.py` in `wildfire-ml-v4/src/live/` build those files from the dataset and the finished study runs. `quality/` holds `classifier_v2.joblib`, `hide.json` and `industrial_sources.geojsonseq` from `wildfire-datasets-v4/audit/false_detections/`.)
3. Run the workflow once by hand and check the map's status line.
4. Then switch off the backup run on the Mac: `launchctl bootout gui/$(id -u)/com.terrawatch.dailyforecast`.

## Local run

```
WORK=wildfire-ml-v4/live_state python forecast/live/run_daily.py 2026-11-01
```

## The quality filter

Not every satellite hot spot is a vegetation fire. Before the fire-history inputs are built, every new detection is scored by the classifier of the dataset build (`detection_quality.py`, `quality/classifier_v2.joblib`): the chance that a burned scar follows within 1 km. Detections below the `hide` threshold (`quality/hide.json`, 0.0348) are dropped, as in the clean training data. About a third of the detections of 2026 were dropped. The features need the earlier detections of the same area, so `detections.parquet` keeps every detection since 2019 with its measurements and score, and `fire.parquet` is derived from it. `refresh_fire.py` re-fetches the last three days at every run because near-real-time rows change.

Checks: `tests/check_detection_quality.py` (features equal the dataset's for a month of detections, except the hour of the overpass, which the dataset build had attached to the wrong rows; 0.06 % of the keep-or-drop decisions change) and `tests/check_refresh_fire.py` (replay of three days through the live path: 0.5 % of decisions and 1.4 % of cell-days differ from the dataset build, which computed the neighbour counts per region table).

## Checks

`python -m unittest discover -s forecast/tests` (no data needed). The bundle golden test and the fire-history parity test need the study data and live in `wildfire-ml-v4/tests/`.

## What to know

- Vegetation is a seasonal average (no free live source). On the 2025 test year this cost 0.002 AUPRC (0.4728 to 0.4709); see `docs/12-open-meteo-weather-gap-check.md`.
- Open-Meteo's free API is for non-commercial use; fine for a public demo, not for a paid service.
- `forecast/state/verification.csv` gains one row per finished day: the forecast scored against the fire the satellite then saw. This is the silent-period check.

# Cell2Fire scenario visualization readiness

## Existing outputs

Saved outputs are under `results/resq6/dev_member_grids_horizon_aligned_20261015/`:

- `member_grids/<incident_id>/member_000.npz` through `member_059.npz` for each of the four development IDs. Each archive has `hour_06.npy`, `hour_12.npy`, `hour_24.npy`, `hour_48.npy` Boolean arrays. The archived grid sizes are 375×375, 338×338, 388×388, and 338×338 respectively; per-incident `manifest.json` records frame hours/source frame hours, SHA-256, member ID, last frame, and ignition row/column.
- `<incident_id>.json`, `dev_all.json`, and `fair_rescore.json` contain run/scoring summaries. `recovery_provenance.json` records environment, code/input hashes, Cell2Fire executable and lookup table hashes, and the four development IDs.
- `data/resq5/protocol_setup.json` contains EPSG:32644 domain geometry, cell size/origin, base ignition coordinates/time, and setup values. The raster convention is row 0 north; columns increase east. `data/resq2/<id>/weather_era5land_native_wind.csv` contains the base hourly wind series.

The saved NPZ archives can be animated or stepped at exact elapsed simulation times without rerunning Cell2Fire. A single member is a jittered conditional realization; a map averaged over members is ensemble burn frequency/probability, not a deterministic footprint. A faithful display should make that distinction clear, draw/identify the actual member ignition cell(s), include time, domain scale/CRS, base weather provenance and perturbation description, and label every frame **SIMULATED**. Do not overlay VIIRS as if it were a contemporaneous physical perimeter; if shown as context, separately label its acquisition time and detection-only semantics.

## Current limitations

- The current system Python is 3.14.7 and lacks NumPy, pandas, rasterio, matplotlib, Pillow, imageio, and xarray. `ffmpeg` exists, but no images/video frames or plotting renderer were found in the saved run folder. No dependencies were installed. Therefore a rendering command was not run in this audit.
- The temporary Cell2Fire `ForestGrid*.csv`, generated ASC layers, `Weather.csv`, and `Ignitions.csv` were created under `TemporaryDirectory` by `run_dev.py` and removed after each run. They are not available as a ready-to-map raw output/input bundle; the archived NPZ plus the setup domain are sufficient for rendering the saved arrays if a compatible renderer is supplied.
- Exact **simulation replay** is less reproducible than rendering: historical run-source hashes for `run_dev.py`/`rescore_fair.py` do not match current source; archived manifests omit jitter radius; member NPZs do not contain their wind speed factor/direction offset. The cached weather base series and source/code references remain, but exact original per-member environmental inputs cannot be independently recovered from the archives alone.
- No outputs from the future DMM-onset stage are linked to these Cell2Fire runs. The archived scenarios use the four prescribed protocol ignitions with ignition jitter, not DMM predicted ignitions.

## Readiness verdict

**Rendering saved simulation arrays: feasible without another Cell2Fire run, but not executable with the current Python environment as-is. Exact historical member-run recreation: provenance-incomplete. Physical-accuracy visualization/comparison: not supported by the local reference data.** The previously completed synthetic cardinal-wind artifacts in `results/resq6/wind_direction_cardinal_20261015_verified/` are a separate controlled demo and do not validate real-fire predictive accuracy. This audit did not create images or modify the saved outputs.

Minimum rendering work, when a compatible existing environment is available: load a chosen member's NPZ; plot at hours 6/12/24/48 using the incident's stored EPSG:32644 west/north origin and 30 m cell spacing; label prescribed protocol ignition plus member offset, elapsed time, and base weather/ensemble context; export a four-frame image sequence or animation with “simulated” watermark. For ensemble frequency, aggregate the same hour over all 60 archives and label the scale as fraction of members burning. Preserve historical files and output to a new uniquely named directory.

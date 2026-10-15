# RESQ6 simulated spread viewer

## Launch

From the RESQ6 worktree root, run:

```sh
python3 scripts/resq6/spread_viewer.py
```

The command starts a standard-library-only local HTTP server at
`http://127.0.0.1:8765/` and opens the default browser. Stop it with Ctrl-C.
To suppress automatic browser opening, add `--no-browser`; `--host` and
`--port` can select a different local bind address/port.

No Python imaging, scientific, browser, or geospatial package is required.
The page uses the browser's Canvas API. It serves only the fixed, allowlisted
development artifacts listed below; request parameters cannot select files or
paths.

## Use

- Select one of the four development scenarios.
- Select one archived ensemble member (000–059).
- Move the time slider, choose 6/12/24/48 h, or use Play/Pause to step through
  those four saved frames. Playback advances between snapshots; it does not
  synthesize intermediate times.
- Orange cells are burned in that saved model frame; slate cells are not
  burned in that saved frame; the yellow marker is that member's recorded
  ignition cell. The grid is north-up (row 0 at top, columns eastward), 30 m
  cells, EPSG:32644; projected grid extents and a 1 km scale bar are shown.

## Supported artifacts and limits

The viewer reads the existing `results/resq6/dev_member_grids_horizon_aligned_20261015/`
archives for `E2024-131853`, `E2024-135332`, `E2023-084925`, and
`E2024-155286`. Their NPZs contain genuine Boolean snapshots at exact 6, 12,
24, and 48 hour horizons and each member's ignition row/column. At request
time, the server checks the selected NPZ against its SHA-256 in that scenario's
existing `member_grids/<incident>/manifest.json`.

The Boolean arrays encode only burned/unburned; there is no unknown/no-data
state in these saved grids. No cells are interpolated. The member-specific
weather perturbation values are absent from the archives, so the viewer does
not claim exact scenario replay. Scenario identity, protocol `t0`, prescribed
base ignition, state, CRS/domain, cell size, member count, and recorded ROS
threshold are shown where available. This uses the historical archived
outputs only; it does not run Cell2Fire or overlay VIIRS detections.

The DMM onset-prediction task is distinct from Cell2Fire's conditional spread
simulation. VIIRS active-fire detections are not a complete physical perimeter.
This viewer demonstrates model behavior only and does not establish
real-world spread accuracy.

> Simulated fire spread under the selected scenario. The displayed footprint
> is a model output and is not a verified real-world fire perimeter.

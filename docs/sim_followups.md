# Simulation follow-ups

Open items from `docs/sim_diagnosis/REPORT.md` that were deliberately **not**
changed in the engineering-fix branch (they need new data, a model decision, or
change what the validation score means). In the order the report recommends.

0. **Correct the MCD64A1 pixel size (463.31 m, not 500 m) and re-centre the demo.** Found in RESQ-2 (`docs/RESQ2_INCIDENTS.md`, section 2): the 2024-03-31 burned pixels are at 22.463 N, 86.849 E, about 75 km north-east of the demo point; `validate_mcd64a1.py` and the demo origin constants carry the error. Code change, not made here.
1. **Larger domain (6-10 km or more).** The 1.2 km x 1.2 km grid is smaller than
   the 250 ha observed burn; the fire reaches the edge by hour 12 and fills 89 %
   of the grid by hour 48. Re-crop land cover and DEM from the local tiles (or
   coarsen cells) to cover the burn plus margin. The overlay, ignition-cell and
   zoom code now take the grid size from the manifest, so this should be a
   runner and input change only.
2. **Event-date hourly weather from the ignition pixel.** The wind is still the
   first row of the January 2024 GFS file (a Maharashtra pixel, one 12-hour
   profile repeated) against a March 2024 event. Needs GFS data for the event
   date; selecting the pixel from the ignition location and the day from the
   event date is code. The UI and manifest state that the profile is fixed.
3. **10+ incidents chosen from VIIRS clusters before simulating.** One event
   cannot support an accuracy claim, and the single event used was not
   independently confirmed (nearest VIIRS detection 5.8 km away).
4. **Proximity baseline.** Score a distance-to-current-footprint baseline on the
   same overpass pairs and domain as the simulation (see report step 9;
   `NextPass/scripts/score_footprint.py` is outside this repository).
5. **Slope decision.** For simulator `S` slope and aspect are not used and the
   elevation effect is at most about 2 %; synthetic test (c) fails
   (N/S extent 1.12, criterion 1.25). Decide the intended unit of `ps` in the
   fork or drive the spread rate with a physical model (`--ros-override-file`).
   Also open: a one-cell-thick diagonal non-fuel line does not stop spread
   (test d2 fails: 382 cells burned on the far side).
6. **Ensemble burn-probability map.** Replace the single deterministic run with
   an ensemble (varied wind, moisture, ignition position) and show burn
   probability.

Also not addressed (data or validation scope): fuel and canopy layers and fuel
moisture (item 3 of the report), the `validate_mcd64a1.py` IoU (a fully burned
square scores 0.73 against the simulation's 0.64), and the up to 11 % size
mismatch and ~60 m offset between the fuel and DEM windows and the nominal grid.

## UI needs for a burn-probability map (RESQ-5; not implemented, UI unchanged)

The replay in `docs/RESQ5_RESULTS.md` produces, per incident, an ensemble burn probability per cell at each VIIRS overpass time, not a single hourly animation. The current spread UI (`SpreadPage.tsx`, `SimulationCanvas.tsx`, hourly `frame-NN.png`) cannot show it. For the later redesign it would need:

1. **Data contract.** A manifest per incident: domain georeference (UTM zone, west and north edge in metres, cells per side, cell size 30 m, plus the four corner longitudes/latitudes, because a UTM-aligned square is a slightly rotated quadrilateral in WGS84), overpass list (time UTC, satellite, day/night, hours after ignition time), members per source, source names and labels (ERA5-Land primary, ERA5 0.25°, best_match, pooled), ignition point and jitter radius, ignition-time rule, fuel rule and "uncalibrated" flag, fixed temperature/RH note. Rasters: one probability image per source and overpass (the stored `burn_count_*.npz` divided by members; 340-390 px square, 8-bit is enough), and the observed cumulative footprint per overpass (375 m cells).
2. **Rendering.** An image source with four corner coordinates; a continuous probability colour ramp with a legend (not a binary footprint); a threshold control with the 50 % contour as the default and an explicit "no cell reaches 50 % (maximum p = x)" state; observed footprints and individual detections on the same map; ignition point with the 500 m jitter disc; domain boundary.
3. **Time control.** A slider keyed to overpass times (4-8 steps), not hours; label each step with UTC and IST and hours after the assumed ignition time.
4. **Source switch and disagreement.** Toggle the three wind sources and the pooled ensemble; show a small panel with the wind series (speed, direction) used and the hours below 0.145 m/s where the model cannot spread; make the result's dependence on the source visible (RESQ-5 section 3).
5. **Baselines and metrics.** Toggle the proximity and final-area-circle baselines; a metrics panel (AUC, AP, IoU at 50 %, precision, recall, area ratio) per overpass, with the baselines beside the simulation and a plain statement when a baseline is higher.
6. **Wording.** "Simulated burn probability (uncalibrated)", never "forecast"; show ensemble size, wind source, fuel rule and ignition assumption on the map; separate this from the fire-occurrence risk map.
7. **Backend.** An asynchronous job (90 members of 8-15 s, about 3-5 min with 7 workers) with progress and per-member failure reporting; domain and windows derived from the detection cluster; storage of rasters rather than frames; removal of the observed-comparison endpoint for the synthetic demo.
8. **Not in scope of the UI:** changing the simulator, the fuel crosswalk or the ROS (options in `docs/RESQ4_SPREAD_TEST.md`).

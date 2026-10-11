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

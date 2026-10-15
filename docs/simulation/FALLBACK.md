# RESQ-6 fallback: the simulator-free chance-of-burning output

Written because the dev gate failed (`docs/simulation/RESULTS_DEV.md`'s fix-pass section): under
fair (ignition-blurred) scoring, the Cell2Fire ensemble engine beat or tied the baselines on only
1 of 8 scorable development-set cells, short of the required 6. Per instruction, the test set is
not run. This document specifies what ships instead: a simulator-free, live-computable "chance of
burning" output, built from the same two ingredients already proven out in this task — the
wind-elongated ellipse baseline and the ignition-position ensemble blur — plus a slope term,
spec'd here for the first time.

No simulator call, no VIIRS footprint, no observed outcome of any kind is used to *compute* this
output at serving time — exactly like baseline (b) in `PROTOCOL.md` §3, it only ever needs the
ignition point, the horizon, and a wind series, now also the DEM slope near the ignition point.

## 1. The ellipse spec: axis ratio from wind speed and slope

Base formula unchanged from `PROTOCOL.md` §3(b) / `backend/inference/engine/baseline.py`:

```
scale(h)    = h / 12
L_cross(h)  = 1000 m * scale(h)
L_down(h)   = L_cross(h) * (1 + 1.0 * v_mean(h)) * (1 + 0.5 * tan(slope_rad))
r(cell, h)  = sqrt( (d_down / L_down(h))^2 + (d_cross / L_cross(h))^2 )
p(cell, h)  = exp(-r(cell, h))
```

**New term**: `(1 + 0.5 * tan(slope_rad))`, where `slope_rad` is the slope (in the "slope used,
never aspect" sense already fixed by `PROTOCOL.md` Amendment 1) of the DEM at the ignition pixel,
computed exactly the way `engine/domain.py`/`scripts/resq6/run_dev.py` already compute it
(`np.gradient` on bilinear-sampled Copernicus GLO-30 elevation, no aspect file, no directional
upslope axis — slope only scales the existing wind-direction axis, it does not add a second,
separately-aimed axis). `d_down`/`d_cross` keep using the wind-direction projection from
`PROTOCOL.md` §3(b) unchanged; slope is a magnitude multiplier on the downwind axis only, not a
new direction, so this stays a single-formula, single-direction ellipse.

**Where 0.5 comes from — chosen on the development set only, face-checked, not fit by any
regression, exactly the same standing as the existing 1.0-per-m/s wind constant**: the 4
development incidents' slope at their ignition pixel, computed this session, are 6.2°, 6.5°,
33.7°, 17.0° (`tan` = 0.109, 0.114, 0.669, 0.306). At `0.5`, the multiplier ranges from about
1.05× (near-flat incidents) to about 1.33× (the steepest, `E2023-084925`) — a modest, bounded
stretch, chosen so a steep incident's downwind axis is meaningfully but not extremely longer than
a flat one's. **This has not been scored against AP on any incident** — per instruction, this
fix pass does not run another tuning cycle; the constant is a documented, face-valid placeholder
for the next session to actually score, not a validated choice.

## 2. How the ensemble blur gives the chance-of-burning contour

The fix pass's fair-rescoring already showed the mechanism that matters here: averaging a
formula (baseline or engine) over many jittered ignition points, using the same `ignition_jitter()`
(±500 m, uniform over a disk, `scripts/resq6/run_dev.py`), turns a sharp point-formula into a
smooth probability contour exactly the shape a "chance of burning" map needs — this is precisely
what the engine's own ensemble already did, and what the fix pass applied to the baselines to
make the comparison fair. The fallback reuses the *same* mechanism, deliberately: Monte-Carlo
average the slope-aware ellipse formula above over N jittered ignition points (N=60, matching the
engine's own frozen ensemble size, for consistency — though nothing here needs a simulator, so a
much larger N costs only CPU, not wall-clock-per-member run time). The result is a smooth,
calibration-shaped probability field with no sharp edges at the 50%/80% band boundaries, the same
visual language `08_design_system.md`'s existing band legend already uses.

This is not a new idea invented for the fallback — it is exactly `rescore_fair.py`'s
`blurred_baseline()` function, generalized from a scoring tool into the product's actual serving
formula.

## 3. What the app can say honestly at 6h / 12h / 24h / 48h

- **6h and 12h: no development-set evidence either way.** None of the 4 development incidents had
  a VIIRS overpass that early (earliest usable overpass across all 4: 12.85h). This is not a
  property of the fallback specifically — the engine had the identical gap (`RESULTS_DEV.md`'s
  original table). **Any copy shown at 6h/12h is not backed by any dev-set accuracy check, in
  either direction, and must not imply otherwise** — e.g. no "validated" or "checked against
  observed fires" language at these two horizons specifically.
- **24h and 48h: the fallback (baseline formula, ignition-blurred) is the one honestly supported
  by this session's own numbers** — under fair scoring, it beat the simulator-based engine on 7
  of 8 scorable cells and tied on 1. The app may say, in plain language, that the shown chance-
  of-burning area is "a geometric estimate from wind direction/speed and terrain slope, not a
  physics simulation" — because, per this session's own result, the geometric estimate is not
  less accurate on this development set than the physics simulation was.
- **Never say the simulator (Cell2Fire) was used**, if this fallback ships instead — that would
  misstate which computation actually produced the shown contour, the same honesty standard
  `docs/simulation/ENGINE_DECISIONS.md` already applied to the temperature/RH fields.
- **The existing "Uncalibrated scenario" trust badge and the one-caveat-line rule
  (`docs/redesign/09_trust_rules.md`) still apply unchanged** — this document does not add a new
  UI claim of accuracy; it only says which computation is honestly supportable by this session's
  numbers.

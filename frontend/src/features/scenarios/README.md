# Scenario engines

Pure TypeScript (no React, no DOM) for the Control Room scenario planner and
the corroboration aid. A planning aid, **not a validated forecast**; the UI must
keep the "not validated" banner until a validation record exists (D4, D-27).

Code: `engine/` (this folder) and `../map/corroboration.ts`. Units: km, km/h,
degrees, GeoJSON `[lon, lat]`. Wind direction is meteorological (FROM).

## What is modelled

- Richards ellipse with the ignition at the rear focus; Anderson (1983)
  length-to-breadth ratio from midflame wind speed; head distance = typed head
  ROS x hours; head points downwind (`ellipse.ts`).
- Hour-by-hour wind schedule and "wind turns to X at hour h" (`wind.ts`).
- Nested envelopes at 1, 3, 6, 12, 24 h (`envelope.ts`).
- Inner/outer uncertainty bands from wind speed, wind direction and ROS ranges (`bands.ts`).
- Earliest hour an asset is inside the outer and inner band (`exposure.ts`).
- Reality check of observations against the outer band (`realityCheck.ts`).
- Overlap (IoU, under/over area) against an observed final extent and an aggregate (`validation.ts`).
- Corroboration grouping of claims close in space and time (`../map/corroboration.ts`).

## What is NOT modelled

- Spotting, crowning, fuel type or moisture change, fire-fighting, barriers
  (roads, rivers), burnout, diurnal change inside an hour.
- Slope. Slope effect must be folded into the typed head ROS by the planner.
- ROS does not respond to wind in the engine: head ROS is typed once (no
  default), so a wind change alters only the shape (LB), not the head rate.
- Terrain, land cover, and population are not used. Exposure uses points only.

## Known limitations (read before trusting a number)

1. **Units of the LB formula.** The constants 0.2566 and 0.1548 are Anderson's
   curve with wind in **m/s** (his mph form is 0.1147 and 0.0692, ratio 2.237).
   The engine converts km/h to m/s. Check: 10 mph (16.09344 km/h) gives LB 2.781.
2. **Shifting wind** is not re-seeded from the previous perimeter. The envelope
   at hour H is the union of one ellipse per constant-wind segment, each grown
   from the ignition for the time elapsed to the end of that segment. It is an
   **upper bound** on reach under each wind, not a fire track, and can overstate
   reach after a shift. With a constant wind it is exactly the single ellipse.
3. **Inner band** is the all-minus corner (speed, direction, ROS). Because ROS
   is the head rate, a lower wind speed widens the flanks, so inner is the
   smallest head reach but not strictly a subset of the nominal polygon. Outer
   (union of 8 corners plus nominal) always contains both. Uncertainty values are
   fractions (0.2 = +/-20 %), direction in degrees.
4. **Reality check** marks the scenario `unreliable` when a *field* observation
   is outside the outer band (configurable kinds). Signals/reports outside are
   listed but do not by themselves flip the status.
5. **Exposure** resolution is the requested hours; "never reached" means not
   inside the band within the horizon, not "safe".
6. **Geometry**: polygons are 72-vertex inscribed shapes (areas about 0.2-5 %
   low depending on elongation); areas use a local planar projection; polygons
   use outer rings only; point-in-polygon treats lon/lat as planar (fine under
   about 200 km); boundary points are not guaranteed either way.
7. **Corroboration** links claims within `radiusKm` and `windowMinutes` (both
   required, no defaults); groups are transitive; the centre is a plain mean.
   A group is a suggestion. There is no verified field; a person decides.

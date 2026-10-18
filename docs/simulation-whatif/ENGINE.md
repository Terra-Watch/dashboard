# What-if engine: equations, assumptions, measured accuracy

Code: `frontend/src/features/scenarios/whatif/` (pure TypeScript, no DOM, no network). Tests: `frontend/unit/whatifEngine.unit.ts`.
What-if scenario for planning and training. Not a forecast. Spread rates are not calibrated for Indian fuels.

## Conventions and units
- Grid: index = row * width + col, **row 0 = north**, col 0 = west, square cells of `cellSizeM` metres. Bearings are compass degrees (0 north, clockwise).
- `Grid.fuel` holds **fuel class ids** (`fuels.ts`), not raw WorldCover codes. Use `mapWorldCoverRaster(codes)` to convert. Ids at or above the table length are rejected (`invalid_fuel`).
- Rates in m/min, distances in m, wind in km/h (`ellipse.ts` converts to m/s inside), arrival in hours (Float32; Infinity = not reached).
- Wind `fromDeg` is where the wind blows FROM; the head goes toward `fromDeg + 180`.

## Equations (ros.ts)
- Wind factor `phi_w = k_w (U / 10 km/h)^1.2`; slope factor `phi_s = k_s min(tan s, 1.5)^2`, where tan s is the magnitude of the elevation gradient (central differences, one-sided at the edge).
- Rothermel-style vector addition: `phi_e = phi_w * (downwind unit vector) + phi_s * (uphill unit vector)`. Uphill is the direction of steepest ascent, the elevation gradient. Head direction is the direction of `phi_e`.
- `R_head = R0 (1 + |phi_e|)`. `R0` is the flat, no-wind rate (deviation from the brief, see below).
- Effective wind `U_eff = 10 (|phi_e| / k_w)^(1/1.2)` km/h, `LB = lengthToBreadth(U_eff)` (Anderson 1983, reused from `engine/ellipse.ts`, no constants duplicated), `e = sqrt(LB^2 - 1) / LB`.
- Rate along direction phi from the head, ignition at the rear focus: `R(phi) = R_head (1 - e) / (1 - e cos phi)`.
- `k_w`, `k_s`, `R0` per fuel are UNCALIBRATED ASSUMPTIONS (`fuels.ts`): grass 15 m/min, cropland 8, shrub 6, tree litter 2.5, wetland 1.5, mangrove 1, moss 1; built-up, bare, snow, water and unmapped do not burn.

## Travel time (mtt.ts)
- Dijkstra over arrival time, indexed binary heap on typed arrays (no per-cell objects). 16 neighbours (8 nearest plus 8 knight moves) by default; optional `neighbours: 32 | 48` for fewer directional errors.
- Edge cost = distance / R(edge direction), using the **source** cell: its fuel, slope, and the wind at the time the front settled it. The target cell does not enter the cost; at a fuel change the rate switches one cell late.
- Wind schedule: the step active at the source cell's arrival time; an edge that starts before a change keeps the old wind to its end (error at most one cell crossing time). Before the first step, the first wind applies.
- Impassable cells (blocked, non-burnable, fire line) get no arrival time and are never crossed. A diagonal or knight move is refused if any cell its segment touches is impassable (conservative on exact cell-edge ties), so any 8-connected line is a closed barrier. A one-cell gap lets fire through.
- Deterministic: no random numbers; heap ties break on cell index.
- `maxHours` stops the search (cells later than that stay Infinity).
- API: `simulate`, `frontAt` (burned mask), `arrivalAtPoints` (null for unreached, non-burnable or out-of-range), `contourCells` (burned cells that touch an unburned 4-neighbour, per time), `burnedAreaKm2`, `describeFuel`, `WhatIfInputError` (codes `invalid_grid`, `invalid_elevation`, `invalid_fuel`, `invalid_ignition`, `invalid_wind`, `invalid_hours`, `invalid_fire_lines`).

## Measured accuracy (30 m cells, grass, flat, 401 x 401, ignition at centre, cells at least 10 cells away)
Relative error of arrival time against the analytic ellipse from `ellipse.ts` (positive = grid is slower).

| Case | 16 neighbours | 32 | 48 |
|---|---|---|---|
| Zero wind (circle), max | **2.75%** (mean +1.34%) | 1.31% | 0.75% |
| 8 km/h wind from west (LB 1.59), max | 11.3% | 5.6% | 3.3% |
| 8 km/h wind from 300 deg (oblique), max | 10.8% (mean +2.3%) | not run | not run |
| 15 km/h from west (LB 2.57, e = 0.92), max | 27.9% | 14.7% | 8.9% |
| 15 km/h from 300 deg, max | 24.8% | 9.8% | 5.1% |
| 30 km/h from 225 deg (e near 1), max | 84% | 41% | 24% |

- Directional bias: the grid never beats the straight line (mean error is positive). The 16-neighbour circle error of 2.75% is the known lattice limit. With wind, the large errors sit in a narrow cone of about 30 degrees around the head, where the ellipse rate falls steeply with angle and the 16 directions (spacing up to 26.6 degrees) cut the tip; flank and back errors are about 1 to 5%.
- Along the lattice axes (head, back, flank for wind from a lattice direction) the result is exact to the cell: at 8 km/h head 1.710 vs 1.726 km, back 0.210 vs 0.218 km at 1 h (within one 30 m cell); maximum half-width within about 2%.
- Burned area at 8 km/h is **9.5 to 9.7% smaller** than the analytic ellipse area pi a b at 1, 2 and 3 h (16 neighbours), because the tip is cut.
- Recommendation for the UI: for strong wind (above about 10 km/h) use `neighbours: 32` or `48`; the cost is about 1.5 to 2.5 times the runtime.

## Measured performance (this machine, Node 22)
- 400 x 400 grid, random fuel and rolling terrain, wind schedule, 24 h, 16 neighbours: about 160 to 170 ms (94,767 cells reached). 401 x 401 flat grass: 100 to 230 ms. 48 neighbours: about 250 to 410 ms. The unit test asserts a generous bound of 5 s.

## Not modelled
Spotting, crown fire and transition to crown fire, fuel-moisture change (diurnal or seasonal), diurnal wind change (only a manual piecewise wind schedule), wind variation in space or by terrain, fuel-model differences from the standard Rothermel sets, fuel depth, fire acceleration from ignition, backing/heading differences by fuel at the edge, suppression and crews, burnout of fuel behind the front (cells stay burned), structures and settlement protection, smoke, any effect on incidents or dispatch. Values are not calibrated against observed Indian fires; the Phase 4 hindcast does that.

## Deviations from the brief
- `R0` is the head rate with no wind on flat ground (Rothermel convention), not the rate at a reference wind. Wind then multiplies it through `1 + phi_w`.
- Optional extra field `SimInput.neighbours`, extra `SimResult.width/height`, `Contour` and `FuelDescription` types. No renames.

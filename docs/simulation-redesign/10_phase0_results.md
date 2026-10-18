# 10. Phase 0 results (January to May 2024)

Status: **audit run, descriptive only.** No model was fitted and nothing was scored. Gate G0 is **not evaluated**: its threshold must be frozen first (file 03, section 4). This file says what the audit found and what it means for the plan.

## What was run
- Data: NASA FIRMS VIIRS 375 m, standard processing, Suomi-NPP (`VIIRS_SNPP_SP`) and NOAA-20 (`VIIRS_NOAA20_SP`), 2024-01-01 to 2024-05-31, bounding box 68E to 98E and 6N to 36N. 62 files, 1,206,325 detections after dropping non-vegetation types and low confidence.
- Tool: `scripts/simulation_redesign/phase0_audit.py` (tests pass). Parameters: link distance 1 km, event time gap 36 h, pass gap 30 min, growth tolerance 0.75 km, at least 2 new detections for "growth".
- Two runs: the whole bounding box (includes Myanmar, Bangladesh, Nepal and others), and detections inside the Natural Earth 10 m India polygon (a de facto boundary, not the Survey of India depiction). Outputs: [`phase0_2024_jan_may/`](phase0_2024_jan_may/). The large per-event and per-case CSVs are not committed.

## Counts
| | Whole bounding box | India polygon |
|---|---:|---:|
| Detections | 1,206,325 | 582,723 |
| Events | 454,187 | 249,055 |
| Events with 2 or more passes | 90,408 | 42,580 |
| Events with 3 or more passes | 31,025 | 12,786 |
| Forecast cases (consecutive pass pairs) | 172,651 | 72,549 |
| Cases with growth | 23,605 (13.7%) | 9,939 (13.7%) |
| Events with at least one growth case | 16,657 | 7,465 |
| Events with growth and prior growth (own-advance baseline usable) | 2,166 | 955 |

The whole-box run is dominated by Myanmar (the top 2-degree regions are all east of 94E), which is why the India mask matters.

## Findings
1. **Event count is not the bottleneck.** 7,465 India events have a growth case, against an illustrative need of 126 events to detect a standardised effect of 0.25. The binding constraints are definition and label quality, below.
2. **Most fires are one pixel.** The median event covers 0.14 km2 (one 375 m pixel), the 90th percentile 0.42 km2 and the 99th 1.97 km2. A 24 h forecast of such fires is a forecast of a few pixels, which supports scoring by advance distance and bearing, not pixel overlap.
3. **Growth is small and sits close to the tolerance.** The median 95th-percentile advance in a growth case is 1.23 km (10th percentile 0.91, 90th 2.14) with a 0.75 km tolerance. Part of this may be new nearby ignitions, spot fires or geolocation and pixel-size differences at the swath edge, not spread. Sensitivity runs are needed before any growth label is frozen.
4. **One fire becomes many events.** The first-study incidents each match 7 to 21 events at a 1 km, 36 h link. Events are therefore not independent, and the event definition and the split blocks must be coarser (spatial blocks, not single events).
5. **Pass gaps are short enough to score the next pass.** Gap shares for India: up to 6 h 42%, 6 to 12 h 18%, 12 to 24 h 31%, 24 to 48 h 9%. The first study could not score 6 h and 12 h; this event-based design can.
6. **Few events have two growth steps.** Only 955 India events have growth followed by another growth case, so the own-advance baseline (B1) has far less data than the others.
7. **Crop and agricultural burning is mixed in.** Large counts in the Punjab and Haryana region (30N, 74 to 76E) are probably crop-residue fires, not forest wildfires. Without a land-cover filter the sample does not match the product scope (file 02).
8. **Cloud is invisible here.** A case with no growth may mean no spread or no observation; this input cannot tell them apart.

## Consequences for the plan
- Keep Phase 1 as written, but add **Phase 0b** (sensitivity, days): link distance 1, 3 and 5 km; event gap 24, 36 and 72 h; growth tolerance 0.75, 1.0 and 1.5 km; and a land-cover filter (WorldCover forest and tree classes versus cropland) so the study population is stated.
- Define the unit of replication as a **spatial block** (for example districts or 25 km tiles) or a merged fire, not a 1 km event.
- Move the primary horizon to **next pass**, with 12 to 24 h as secondary, now that the data shows they are scorable.
- Gate G0 proposal (to freeze before any scoring): proceed if the number of independent spatial blocks with at least one growth case in the forest stratum exceeds a number derived from a pilot variance, not from this file's illustrative table.
- Season: this is one season (January to May 2024) and two satellites. NOAA-21 and other years are not included.

## Limits of this audit
Detections are not burned area; pass boundaries are inferred from acquisition times; the India boundary is a de facto polygon; the sample leans to fires VIIRS can see; nothing here is validated against ground truth.

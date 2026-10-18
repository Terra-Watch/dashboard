# 03. Data and the Phase 0 feasibility audit

Phase 0 decides whether the rest of the plan is worth doing. It builds no model.

## 1. Data sources

| Need | Source | Resolution | Known limits |
|---|---|---|---|
| Fire front over time | NASA FIRMS VIIRS 375 m active fire (SNPP from 2012, NOAA-20 from 2018, NOAA-21 from 2023) | 375 m, a few passes per day | Misses small and short fires; cloud, smoke and canopy hide fires; NASA advises against treating points as burned area |
| Independent extent for a subset | Sentinel-2 or Landsat burn-scar maps (dNBR) | 10 to 30 m | Final extent only, days to weeks later; cloud |
| Historical wind and dryness | ERA5-Land hourly | about 9 km | Reanalysis, not a forecast; terrain wind not resolved |
| Forecast wind (what the product will actually have) | A forecast archive (e.g. GFS, ECMWF open data, or the national model if accessible) | 0.1 to 0.25 deg | Needed so skill is not overstated (section 4) |
| Terrain | Copernicus GLO-30 | 30 m | Slope and aspect along wind direction |
| Land cover / fuel class | ESA WorldCover (and any Indian forest-type layer available) | 10 m | Not a fuel model; Indian fuel data is limited |
| Dryness proxies | ERA5 temperature, RH, precipitation (VPD, days since rain) | about 9 km | Proxy, not measured fuel moisture |
| Ground truth over time | Range Officer perimeters and close-out data from TerraWatch | field | Future; see roadmap Phase 5 |

All sources are open. Licences to be recorded in the dataset manifest. Nothing here needs a paid service.

## 2. Building events

An **event** is one fire tracked over several passes.

1. Pull VIIRS detections for India for the study years. Keep nominal and high confidence; keep low confidence as a flag, not a filter, so the choice is auditable.
2. Cluster detections in space and time into events. The clustering rule (distance and time gap thresholds) is a **proposal to be frozen in Phase 0 after looking at distributions only, never at model scores**. Starting values to test: 1 km and 24 to 48 h.
3. For each event, list passes in time order. Each consecutive pair (front at pass k, front at pass k+1) is one **forecast case**. Record the gap in hours, cloud/coverage status and the detection counts.
4. Attach inputs for each case: terrain, land cover, wind and dryness at the time of the earlier pass, and the forecast weather available at that time where an archive exists.

## 3. Phase 0 audit: questions and outputs

Run on a fixed set of years chosen before looking at results.

| Question | Output |
|---|---|
| How many events have two or more passes? | Count by state, year, land cover |
| How many forecast cases show growth (new detections beyond the previous front)? | Count and share |
| How big are the fires (pixels, km2)? | Size distribution |
| What are the pass gaps? | Histogram of hours; share under 12 h and under 24 h |
| How often is a gap caused by cloud? | Share with no valid observation |
| How many cases are in forest vs grassland/agriculture? | Counts; the label-quality split from the literature |
| Variance of the quantity we will forecast (advance distance) | Needed to size the study |
| Do any cases overlap spatially or in time with the 15 first-study incidents? | List, so they can be handled consistently |

## 4. Stop rule for Phase 0 (Gate G0)

Set the threshold **before** running the audit and write it into the frozen protocol. Proposed form:

- Proceed to Phase 1 if there are enough independent growth cases (events, not pixels) to detect a pre-stated improvement over the best baseline with a stated power, using the variance estimated in the audit. The number comes from that calculation; it is not guessed here.
- If not: stop. Ship the wind-ellipse envelope as an **indicative** layer with honest wording, record the audit as the reason, and spend the effort on the data flywheel (Phase 5) so a future study has ground truth.

## 5. Weather: reanalysis vs forecast

Validating on reanalysis (observed wind) overstates real skill because the product will run on forecasts, which are worse. Plan:

1. Primary evaluation uses a **forecast archive** for the weather available at forecast time, wherever one exists for the study years.
2. A secondary run uses reanalysis, labelled as an upper bound.
3. Report both. A model that only works on reanalysis is not operational.

## 6. What to record in the dataset manifest

For every case: event id, pass times, gap, coverage status, cluster parameters, source file hashes, wind source and version, forecast issue time, CRS and lattice origin. This is Gate B (output integrity) from the validation gate.

## 7. Known data traps

- Do not read unobserved cells as unburned. Use a valid-observation mask; where none exists, mark unknown.
- Do not use monthly MCD64A1 dates as hourly truth. If MCD64A1 is used at all, its pixel is 463.31 m.
- Do not pool pixels as if independent. The unit of replication is the event.
- Do not choose or drop events after seeing scores.

# Phase 0 feasibility audit

Descriptive counts only. No model, no scoring. Detections are not burned area; there is no cloud or coverage mask in the input.

## Parameters (as run; freeze them in the protocol)

```json
{
  "input_dir": "<scratch>/phase0/raw_2024",
  "out_dir": "<scratch>/phase0/out_2024_india",
  "eps_km": 1.0,
  "event_gap_h": 36.0,
  "pass_gap_min": 30.0,
  "growth_tol_km": 0.75,
  "min_new": 2,
  "min_confidence": "n",
  "min_events": null,
  "first_study_dir": "../../data/resq2",
  "mask_geojson": "<scratch>/ne/india.geojson",
  "n_input_files": 62
}
```

## Counts

| Item | Value |
|---|---|
| n_detections | 582723 |
| n_events | 249055 |
| events_with_2plus_passes | 42580 |
| events_with_3plus_passes | 12786 |
| n_cases | 72549 |
| n_cases_with_growth | 9939 |
| events_with_growth_case | 7465 |
| events_with_growth_and_prior_growth | 955 |

## Gap between consecutive passes

| Gap | Share of cases | Cases with growth |
|---|---:|---:|
| <=6h | 0.42 | 1856 |
| 6-12h | 0.18 | 2442 |
| 12-24h | 0.31 | 4500 |
| 24-48h | 0.09 | 1141 |
| >48h | 0.00 | 0 |

## Event size (area proxy, km2)

| Quantile | km2 |
|---|---:|
| 0.1 | 0.14 |
| 0.5 | 0.14 |
| 0.9 | 0.42 |
| 0.99 | 1.97 |

## Advance distance in growth cases (km, 95th percentile of new detections)

| Quantile | km |
|---|---:|
| 0.1 | 0.91 |
| 0.5 | 1.23 |
| 0.9 | 2.14 |

SD: 0.704816835354634

## Events needed (illustrative; paired design, 80% power, two-sided 5%)

Depends only on the standardised effect size d (mean paired difference divided by its SD). The real SD arrives with baseline results.

| d | Events |
|---|---:|
| 0.5 | 32 |
| 0.35 | 64 |
| 0.25 | 126 |

## Events by 2-degree region (top 15)

| Region | Events |
|---|---:|
| 18N_82E | 10152 |
| 18N_80E | 9786 |
| 30N_74E | 9568 |
| 24N_92E | 8605 |
| 20N_82E | 7808 |
| 16N_80E | 7316 |
| 28N_78E | 6263 |
| 18N_78E | 6083 |
| 22N_76E | 5955 |
| 12N_78E | 5933 |
| 20N_80E | 5870 |
| 26N_82E | 5573 |
| 18N_72E | 5522 |
| 22N_78E | 5482 |
| 30N_76E | 5371 |

## Overlap with the first-study incidents

| Incident | Event ids found |
|---|---|
| E2023-078506 | none |
| E2023-084925 | none |
| E2024-131853 | [40575, 40600, 43201, 43202, 43728, 45637, 46160, 46731, 47838, 47846, 49059, 49060, 49087, 50095, 52275, 52810] |
| E2024-133629 | [51464, 54787, 57348, 57352, 57353, 57784, 57787, 58264, 58890, 59391, 59890, 61733, 63158, 63259, 64294, 64296, 64836, 64838, 65493, 65496, 66034] |
| E2024-135332 | [62040, 69337, 70423, 72228, 74621, 74655, 79041] |
| E2024-155286 | [149854, 152418, 152420, 152437, 158085, 160844, 161666, 162990, 165097, 165119, 167227, 167433] |

## Gate G0

NOT EVALUATED (no --min-events given; the threshold must be frozen first)

## Reading this honestly

- A case with no growth may mean the fire stopped, or that it was not observed (cloud, swath edge). This input cannot tell them apart.
- Pass boundaries are inferred from acquisition times, not from satellite overpass metadata.
- Fires too small or short-lived for VIIRS are absent from the sample; the sample leans toward larger, longer fires.
- Regions are 2-degree boxes, not administrative areas.

# Phase 0 feasibility audit

Descriptive counts only. No model, no scoring. Detections are not burned area; there is no cloud or coverage mask in the input.

## Parameters (as run; freeze them in the protocol)

```json
{
  "input_dir": "<scratch>/phase0/raw_2024",
  "out_dir": "<scratch>/phase0/out_2024",
  "eps_km": 1.0,
  "event_gap_h": 36.0,
  "pass_gap_min": 30.0,
  "growth_tol_km": 0.75,
  "min_new": 2,
  "min_confidence": "n",
  "min_events": null,
  "first_study_dir": "../../data/resq2",
  "n_input_files": 62
}
```

## Counts

| Item | Value |
|---|---|
| n_detections | 1206325 |
| n_events | 454187 |
| events_with_2plus_passes | 90408 |
| events_with_3plus_passes | 31025 |
| n_cases | 172651 |
| n_cases_with_growth | 23605 |
| events_with_growth_case | 16657 |
| events_with_growth_and_prior_growth | 2166 |

## Gap between consecutive passes

| Gap | Share of cases | Cases with growth |
|---|---:|---:|
| <=6h | 0.41 | 4482 |
| 6-12h | 0.21 | 6211 |
| 12-24h | 0.30 | 10445 |
| 24-48h | 0.08 | 2467 |
| >48h | 0.00 | 0 |

## Event size (area proxy, km2)

| Quantile | km2 |
|---|---:|
| 0.1 | 0.14 |
| 0.5 | 0.14 |
| 0.9 | 0.56 |
| 0.99 | 2.39 |

## Advance distance in growth cases (km, 95th percentile of new detections)

| Quantile | km |
|---|---:|
| 0.1 | 0.90 |
| 0.5 | 1.21 |
| 0.9 | 2.15 |

SD: 0.8029388050645772

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
| 20N_96E | 25195 |
| 22N_96E | 19570 |
| 18N_94E | 18713 |
| 22N_94E | 15836 |
| 18N_96E | 15280 |
| 16N_94E | 13253 |
| 30N_74E | 10563 |
| 18N_82E | 10152 |
| 18N_80E | 9786 |
| 28N_80E | 8741 |
| 24N_92E | 8657 |
| 20N_94E | 8624 |
| 22N_92E | 8591 |
| 26N_82E | 7834 |
| 20N_82E | 7808 |

## Overlap with the first-study incidents

| Incident | Event ids found |
|---|---|
| E2023-078506 | none |
| E2023-084925 | none |
| E2024-131853 | [72632, 72657, 78695, 78696, 80126, 84055, 85241, 86431, 88938, 88946, 91376, 91377, 91404, 93691, 99446, 100728] |
| E2024-133629 | [97442, 105529, 111042, 111053, 111055, 111978, 111981, 112501, 114802, 115512, 117877, 121992, 125444, 125567, 127975, 127977, 129557, 129559, 130603, 130606, 132026] |
| E2024-135332 | [122319, 139481, 141980, 145997, 151272, 151306, 161152] |
| E2024-155286 | [301016, 307197, 307199, 307217, 316442, 320880, 321912, 324307, 327120, 327142, 329953, 331075] |

## Gate G0

NOT EVALUATED (no --min-events given; the threshold must be frozen first)

## Reading this honestly

- A case with no growth may mean the fire stopped, or that it was not observed (cloud, swath edge). This input cannot tell them apart.
- Pass boundaries are inferred from acquisition times, not from satellite overpass metadata.
- Fires too small or short-lived for VIIRS are absent from the sample; the sample leans toward larger, longer fires.
- Regions are 2-degree boxes, not administrative areas.

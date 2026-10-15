# Option B follow-up: can a single, servable model replace the archived replay?

Read-only. No app or model code touched. Sources: this repo (`backend/app/barv3.py`,
`backend/app/routers/risk.py`, `frontend/src/redesign/pages/TodayPage.tsx`) and
`~/wildfire-research/proposed-stage1` (read-only) — `docs/SPEC_EQUAL_INPUT.md`,
`results/EQUAL_INPUT_REPORT.md`. `~/wildfire-research/proposed-stage1` is a different
subtree than `00_audit.md` cited (`proposed/`); the EI work lives under `proposed-stage1/`.

## 1. Why Today can show risk cells with no model bundle on disk

It currently can't, on this machine: `barv3.py::_bundle_dir()` returns `None` (no
`backend/models/barv3/`, no `RESQ_MODEL_BUNDLE_DIR`), so `daily_geojson()` short-circuits to
an empty `FeatureCollection` (`barv3.py:114-117`) and `TodayPage.tsx` renders its
`EmptyState "Not validated here"` (`TodayPage.tsx:72`), not risk cells. `risk.py`'s
`/api/risk/geojson` has a second path — a Postgres `cell_scores`/`forecast_runs` fallback
(`risk.py:18-30`) — but that needs a live Postgres seeded via `import_barv3_replay.py`,
which the first audit flagged as **not verified** on any running instance. So: if a deployed
copy of Today is rendering cells today, it is doing so only via that unverified Postgres
path, never from a live model run. No contradiction found — the premise ("it renders cells")
doesn't hold on this machine; it may hold on a seeded deployment.

## 2. EI-1 boosting: a fittable-once, serializable candidate

`~/wildfire-research/proposed-stage1/docs/SPEC_EQUAL_INPUT.md` + `results/EQUAL_INPUT_REPORT.md`
define **EI-1 boosting**: the existing 251-column frozen boosting baseline plus the 80-value
GFS day-ahead forecast block, 4 own-cell detection-history columns (`C3`), and 4 fire-history
columns (`fh_*`), plus one missing-flag column = **340 columns**. Unlike Bar v3/A-prime (16-seed
or 5-member bagged ensembles), EI-1 boosting is **"a deterministic single fit"** (spec §3) —
LightGBM, fixed seed, no bagging. Fit time measured: **366s (2023) / 376s (2024)** on
1.97M rows, 32GB RAM VM, no GPU (report §7). It is trivially `booster_.save_model()`- or
`joblib.dump()`-able with a sha256 hash of the output file — nothing here discards the
fitted model the way Bar v3's `bag()` does.

**Accuracy**, fold 2024, all rows: AP 0.2804 vs A-prime's 0.2985 (closes 76–81% of the gap
over the EI-0 control, report §5); fold 2023: AP 0.2478 vs A-prime 0.2613 (closes 84–90%).
Per-state AP (fold 2024): CG 0.298, JH 0.413, MH 0.221, MP 0.293, OD 0.298, TS 0.222 — same
six states as this product's existing scope (SPEC §1 restricts to CG/JH/MH/MP/OD/TS, no UK/AP,
matching `00_audit.md`'s six-state finding).

**Daily columns needed, and whether a personal GCP/EE account is avoidable:**

| group | cols | daily? | open-API substitute, no personal GCP/EE |
|---|---|---|---|
| GFS 06Z forecast block | 80 | yes | Open-Meteo forecast API (public, free tier, GFS-backed) or NOAA NOMADS GFS GRIB directly (public, no key) |
| own-cell + ring detection history (C3, `fh_*`) | 8 | yes | NASA FIRMS API (free API key, no GCP/EE) — exactly what `resq8/firms-ingestion`'s `docs/ingest/00_design.md` already designs (`GET /ingest/health`, 3–4h realistic end-to-end latency) |
| daily weather D-1 + fire-weather codes + windows/anomalies | 11+6+180+17 | yes (derived) | **the one open question** — see §3; training used ERA5-Land reanalysis, which has multi-day latency (flagged in the first audit) |
| static terrain/land cover/human layers | 21 | no (fetch once, refresh rarely) | ESA WorldCover, Copernicus GLO-30 DEM, VIIRS annual night-lights, GRIP4 roads — all direct open downloads; EE was a convenience in research, not a requirement |
| burn history / rings | 12+2 | derived from FIRMS + static, not a new feed | same FIRMS source as above |

So: the forecast block and the fire-detection columns both have no-personal-account open
substitutes already scoped by this repo's own `resq8` track. The static layers need a one-time
download, not a daily EE call. The genuinely open question is the daily weather/fire-weather
block, which is the subject of Q3.

## 3. Reanalysis-vs-forecast shift: how to check it on archived days

EI-1 was trained on ERA5-Land-derived daily weather (`t2m, vpd, ws, rh, sw1, sw2, rain7, dsr,
tmax09` + fire-weather codes + 3/7/14/30/60-day windows + 17 anomalies). A live service would
have to substitute forecast weather (e.g., GFS day-0 analysis or a very-short GFS lead) for
"day D-1 observed," because ERA5-Land's own latency means D-1 reanalysis isn't actually
available on day D (flagged in `00_audit.md`, unresolved there).

**Backtest design, using only archived days already in the 2023/2024 validation folds:**
1. For each validation day, pull the archived GFS forecast that *would have been* available
   as of that day's run (NOAA's public `noaa-gfs-bdp-pds` S3 bucket keeps a rolling GFS
   archive; Open-Meteo's historical-forecast API also serves past model runs by issue time) —
   both are open, no personal account.
2. Rebuild the daily-weather + fire-weather-code + window/anomaly columns from that forecast
   source instead of ERA5-Land, for the same (cell, day) keys already scored in
   `EQUAL_INPUT_REPORT.md`.
3. Score the **same frozen EI-1 booster** (no retraining) on both versions of the row; compare
   AP, log loss, and per-cell rank correlation between the reanalysis-sourced and
   forecast-sourced scores.
4. This reuses the exact parity-check pattern `docs/05_prototype_gap_analysis.md` already
   calls for ("run parity checks against stored validation predictions before any wall-to-wall
   forecast") — not a new testing idea, applied to the weather-source swap specifically.

This is doable without fitting anything new and without any live infrastructure — it only
needs the two archived weather sources for the same historical days.

## 4. Daily runtime, memory, hosting — one model, not five bagged members

- **Fitting** (periodic, not daily — e.g. monthly/yearly retrain): ~6–10 min on the VM class
  already used (`n2-standard-8`, 32GB RAM, no GPU; report §9 "swap rule" — 8GB Macs needed
  LightGBM over scikit-learn specifically because scikit-learn's boosting upcasts to float64
  and didn't fit in 8GB for 400 cols). One fit, not five — no bagging multiplies this cost.
- **Daily inference**: LightGBM `predict()` over the six-state forest-cell grid (order
  ~hundreds of thousands to ~2M cells, based on the training row counts) is a sub-minute,
  single-CPU operation; the serialized booster file itself is tens of MB, not GB.
- **Daily feature build** (the actual cost center): fetching GFS + FIRMS, computing
  3/7/14/30/60-day weather windows, 17 anomalies, and 12 ring columns for the day. This is
  comparable in shape to `resq8`'s FIRMS-ingestion job plus a weather-fetch job — minutes, not
  hours, on a small VM; no measured figure exists yet because this job has never been built.
- **Hosting estimate**: a single small VM (2–4 vCPU, 4–8GB RAM) covers inference and feature
  assembly comfortably — this is an order of magnitude smaller than the 32GB fitting VM, and
  there is no GPU requirement anywhere in this pipeline.

## 5. Coverage and what the screen may honestly show

Same six states as today (CG, JH, MH, MP, OD, TS) — SPEC_EQUAL_INPUT.md never extends beyond
them (no UK/AP, no 2025). EI-1's gain over the baseline comes substantially from the
fire-detection columns it adds (C3, `fh_*`, rings) — the same model lineage this product
already documents as carrying an epistemic ceiling: conditioned on nearby active-fire context,
not an independent-ignition forecast. Today could honestly show, if EI-1 were ever served
live: "today's ranking, six states, driven in large part by recent nearby fire activity" — it
may **not** honestly claim ignition forecasting in areas with no recent fire signal, and must
carry forward the same "Not validated here" / no-UK-AP boundary already built into
`09_trust_rules.md` and the Playwright suite.

## 6. Recommendation

**Pursue Option B specifically via EI-1 boosting, not Bar v3, if a live ranking is wanted** —
it is weaker than Bar v3/A-prime (closes most but not all of the gap) but it is the only
candidate in this research programme that is (a) a single deterministic fit, (b) cheap enough
to retrain and serialize routinely, and (c) built from inputs that already have open,
account-free daily sources designed elsewhere in this same repo (`resq8`). Bar v3 itself
remains not viable for live serving (ensemble weights discarded by design, per the first
audit) without first re-architecting its own training step to persist weights — EI-1 sidesteps
that problem entirely because persisting a single LightGBM booster was never a blocker.

## 7. Build plan

### Steps
1. Decide and write the daily-weather source for serving (§3's backtest result) before
   building anything else — this is the one unresolved scientific question, not an
   engineering default.
2. Add `lightgbm`+`joblib` to `backend/requirements.txt` (currently has neither).
3. Port EI-1's feature-build (`~/wildfire-research/proposed-stage1/scripts/equal_input_fit.py`,
   `cloud/equal_input_vm.py`) into a job RESQ owns, reusing `resq8`'s FIRMS source for the
   fire-detection columns and an open GFS/Open-Meteo source for the forecast block.
4. Fit EI-1 boosting once on RESQ's own infrastructure; `joblib.dump()` the booster with a
   sha256 hash in its filename/manifest; load it for scoring rather than retraining per request.
5. Wire a `build_day(target_date)` function that assembles the day's 340-column row set and
   calls the loaded booster, writing into the same `cell_scores`/`forecast_runs` schema
   `risk.py`'s Postgres fallback already expects — `risk.py`'s contract is unchanged.

### Tests needed
- **Reanalysis-vs-forecast parity** (new, from §3): frozen booster scored on both weather
  sources for the same archived days; report the AP/log-loss/rank-correlation delta, no
  pass/fail threshold assumed in advance.
- **Freshness/fallback** (reuse the pattern from the first audit's build plan): before serving
  a day, verify GFS + FIRMS inputs are present and within tolerance; missing/stale → existing
  "Not validated here" empty state, never a silently degraded score.
- **Model-hash check** (new): the loaded booster file's hash must match the manifest recorded
  at fit time, so a corrupted or wrong-version model file fails loudly, not silently.
- **Determinism test** (new): same day, same inputs ⇒ same output, run twice (LightGBM with a
  fixed seed should already guarantee this; verify it holds through the serialize/reload step).
- **Scope test** (reuse): Today's ranked list never renders a state outside CG/JH/MH/MP/OD/TS,
  and never a 2025 or post-training date.
- **"Live" text rule**: unchanged by this doc — still the ranking-audit recommendation that a
  "Live" claim needs the owner's sign-off tied to a freshness check, not a blanket text change.

### Decisions needed from the user
1. Approve (or reject) using EI-1 boosting — a weaker-than-Bar-v3 model — as the one scoped for
   live serving, given it is the only one that is practically servable today.
2. Approve the daily-weather source once §3's backtest numbers exist (forecast weather vs.
   waiting out ERA5-Land's latency vs. some other proxy) — a scientific tradeoff, not
   engineering.
3. Who owns the recurring GFS/FIRMS fetch job and its (now account-free) hosting cost.
4. Whether "driven in large part by recent nearby fire activity" is acceptable framing for
   Today's copy before any live date is shown — ties into the existing `09_trust_rules.md`
   ceiling language.
5. Retrain cadence (monthly/yearly) and who re-runs/re-approves the ~10-minute refit.

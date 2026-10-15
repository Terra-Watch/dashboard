# 00. Ranking audit — what it takes to make Today's "tomorrow" ranking live

Audit only, branch `resq10/ranking-audit` off `redesign-v2`. No app code, no model code, nothing under `docs/sim_diagnosis/` touched. `~/wildfire-research` was read, never written. Every claim below is traced to a file; where something could not be verified, that is stated rather than assumed.

## 1. Current data path

The Today screen (`frontend/src/redesign/pages/TodayPage.tsx`) calls:

```
GET ${API}/api/risk/geojson?target=2024-03-10        // DEMO_DATE is hardcoded, line 11 — never "today"
```

That hits `backend/app/routers/risk.py`:

```python
@router.get("/geojson")
def risk_geojson_endpoint(target: date) -> dict[str, object]:
    replay = daily_geojson(target)
    if replay["features"]:
        return replay
    # ...else query Postgres cell_scores/forecast_runs where mode='replay'
```

`daily_geojson`/`daily_risk` live in `backend/app/barv3.py`, whose own docstring says exactly what it is: *"Read-only adapter for archived Bar v3 validation predictions ... it never returns model scores."* Mechanically:

- `_bundle_dir()` looks for `RESQ_MODEL_BUNDLE_DIR` env var, else `backend/models/barv3/` on disk.
- `_load(year)` opens `bar3_replay_<year>.npz` + `cell_centers.csv` from that bundle (or, if absent, falls back to `RESQ_BAR_V3_RESULTS_DIR`/`RESQ_BAR_V3_TABLE_PATH` pointing straight at a research-style `results/`+`model_table.pkl` pair).
- **`_load` hard-codes `if year not in (2023, 2024): return None`** (`barv3.py` line 51) — even a 2025 bundle would be refused by this function, independent of whether the data exists.
- Rows are filtered to `STATES = {"OD","CG","TS","MP","MH","JH"}`, sorted by score, and turned into percentile ranks/bands. No inference happens at request time — it is an index lookup into a pre-computed array by day number.

**Where that bundle would come from, traced into the research repo:** `backend/inference/export_barv3_replay.py` builds it by reading, from a `--research` root:
- `outputs/reproduction/features/model_table.pkl` (exists at `~/wildfire-research/outputs/reproduction/features/model_table.pkl`)
- `proposed/imagery/cells_in_rows.csv` (exists at `~/wildfire-research/proposed/imagery/`)
- `proposed/results/bar3_deployable_{2023,2024}_predictions.npz` (exist at `~/wildfire-research/proposed/results/`)

i.e. `--research` is meant to point at `~/wildfire-research` itself. `backend/inference/import_barv3_replay.py` can additionally load that bundle into Postgres (`cell_scores`/`forecast_runs`, mode `'replay'`), which is what the router's fallback branch reads.

**Verified on this machine, right now:** `backend/.env` does not exist (only `.env.example`), `RESQ_MODEL_BUNDLE_DIR` is unset, and no `backend/models/` directory exists at all. A machine-wide search (depth 6 under `/Users/kireeti`) for `bar3_replay_2023.npz`, `bar3_replay_2024.npz`, `cell_centers.csv` found nothing. So, as configured today, `/risk/geojson`'s filesystem path has **no bundle to read** — it would fall through to the Postgres branch. Whether a running Postgres instance has ever actually been seeded via `import_barv3_replay.py` was **not inspected live** (out of this audit's practical reach without starting the stack), and this exact gap was already flagged, independently, in `docs/redesign/00_audit.md` §5 ("Could not verify ... whether the PostGIS database currently holds any seeded data"). I can only add: the filesystem half of the fallback chain is confirmed empty, so if the DB is also unseeded, Today currently renders its own "Not validated here"/empty state for every date, not real archived numbers.

**So, in one sentence:** "Bar v3" on Today is a lookup into a frozen, pre-computed `.npz` array exported once from `~/wildfire-research`'s `proposed/results/` and `outputs/reproduction/` directories, filtered to six states and two archived years, served by index — never a live model run — and that export does not currently exist anywhere discoverable on this machine.

## 2. Which model should serve the ranking

**It's Bar v3 — and that is not a compromise.** `~/wildfire-research/proposed/src/bar_v3.py` shows the model is `sklearn.ensemble.HistGradientBoostingClassifier` (gradient-boosted trees), bagged 5 times at 80% subsample each, hyperparameters frozen by a tuning search and stored at `results/bar_v3_selection_2024.json`:

```json
{"winner_params": {"max_depth": 10, "learning_rate": 0.05, "max_iter": 800,
                    "l2_regularization": 10, "min_samples_leaf": 5, "max_leaf_nodes": 127},
 "winner_log_loss": 0.1528, "winner_ap_2024": 0.2866}
```

Inputs: 305 "baseline" tabular/engineered columns (static terrain/land-cover/human layers, calendar, 60-day antecedent weather + fire-weather codes, fire-history ring/lag counts) plus 80 GFS forecast columns for day D+1 — 385 columns total (`docs/SPEC.md` item 2, `src/dmm.py` line 16).

This is the model the research programme's own final report names as undefeated. `~/wildfire-research/proposed/docs/FINAL_REPORT.md` §1 and `docs/GATES.md`:
- The **deep multimodal 8-seed ensemble** (the research team's own "headline" by internal naming) **fails** against bagged Bar v3 on 2024 (AP 0.2913 vs 0.2929, Δ −0.0016, CI crosses zero) and is **significantly below** it on the 2023 replication fold (0.2532 vs 0.2600, Δ −0.0069, CI entirely negative).
- **A2s** (a distillation variant) is the only arm that clears the pre-declared gate against Bar v3, and only on one fold: 2024 Δ +0.0041 (CI above zero), but 2023 Δ +0.0010 with a CI that crosses zero — not replicated, so by the team's own pre-declared rule "A2s is a lift on 2024 that did not clear the gate on 2023; the headline stays the deep model; no relabelling."
- Every other arm tried (ablations E1–E8, candidate inputs C1–C6, cheap arms K1–K4, blends) either loses to Bar v3 or is not reliably better.

So among everything this research programme tried — including a GPU-trained multimodal transformer — nothing beats the much simpler gradient-boosted-trees model by a result that replicates across both evaluation folds. Bar v3 is simultaneously the simplest architecture tried and the strongest validated one. Using it live is not "settling for the simple model instead of the real one" — it *is* the real one.

**Do the trained weights exist? No — verified, not assumed.** `bar_v3.py`'s `bag()` function:

```python
m = HistGradientBoostingClassifier(random_state=seed, early_stopping=False, **params).fit(x, fd.y_fit[rows])
...
probs.append(np.concatenate([m.predict_proba(...)[:, 1] ...]))
```

fits the classifier **in memory**, uses it immediately to score the validation split, and the function returns without ever calling `joblib.dump`, `pickle.dump`, or any other serializer on `m`. I grepped `~/wildfire-research/proposed/src` for `joblib.dump|pickle.dump|save_model|to_pickle`: the only hits are `dmm_eval.py`'s calibrator pickle (a different model, the deep multimodal one) and unrelated `json.dump` calls for metadata. **No Bar v3 estimator object is ever written to disk anywhere in this repo.** The only reusable artifacts are (a) the hyperparameter JSON (so retraining is reproducible) and (b) the resulting prediction arrays (`bar3_deployable_<year>_predictions.npz` — scores, not weights).

I did not have credentials to browse `gs://kireeti-wildfire-507012` directly, so I cannot prove a negative about the bucket's contents. But `~/wildfire-research/proposed/jobs/GCP_JOBS.md` ("What goes to the bucket") documents exactly what is uploaded: `code/`, `packages/fold_2024`/`fold_2025` (feature packages), and `results/` ("one row and one array per trial or seed") — a serialized Bar v3 model is not among the described contents, and `STATUS.md` states Bar v3's own bagging stage ("S1") runs **locally**, never on a cloud VM. There is no documentary trail suggesting a cloud-saved checkpoint exists. **Plainly: the trained weights do not exist, locally or (as far as any doc records) in the cloud.** What exists is a frozen hyperparameter spec plus the large feature tables needed to refit it on demand.

## 3. Daily-run inputs

Derived from `docs/SPEC.md` (items 2, 23, 23a–23c) in the research repo, cross-checked against `docs/05_prototype_gap_analysis.md` and `docs/RESQ3_INPUTS.md` on the website side.

| Input | Source | Daily fetch method | Latency | Cost | Licence | Fetch already built? |
|---|---|---|---|---|---|---|
| Forecast weather (temp, RH, wind u/v, precip, day D+1) | NOAA GFS 0.25° (`NOAA/GFS0P25`), 06 UTC run of day d | Google Earth Engine export (`imagery/gfs_ee.py`, `gfs_ee_future.py`) under the researcher's personal GCP project (`space-debris-507012`, account `vkireeti16@gmail.com`) | Per `docs/SPEC.md` addendum 23a: 06 UTC run's hourly products complete ~within hours of the run; researcher's own margin estimate before end of UTC day d is **not independently confirmed**, only assumed | NOAA data itself: free. Earth Engine compute/export: free tier, tied to one Google account/project | GFS data: public domain (NOAA). **Earth Engine's commercial-use terms for a production daily fetch were not evaluated here — open question.** | **Yes, but research-only and account-bound** — `imagery/gfs_ee_future.py`/`gfs_runs.py`, not a generalized service; depends on one person's GCP credentials |
| Antecedent weather (60-day daily series + fire-weather codes FFMC/DMC/DC/ISI/BUI/FWI) | ERA5-Land (0.1°) / ERA5 (0.25°), Copernicus CDS | CDS API (`cdsapi`), or Open-Meteo for a quick read (used in `docs/RESQ3_INPUTS.md`'s incident fetches, not for Bar v3's production columns) | **ERA5-Land reanalysis has multi-day latency** — the near-real-time (ERA5T) product is typically available with roughly a 5-day lag before the final reanalysis record; `RESQ3_INPUTS.md` separately notes Open-Meteo's `era5_land` wind variables came back **null in a direct probe**, forcing a fallback to coarser 0.25° ERA5 wind | CDS: free, needs account registration | Copernicus licence — open, attribution required | Partially — `RESQ3_INPUTS.md`'s weather fetch exists for four incident points, not as a six-state daily production pipeline; the 60-day antecedent-window builder (`features/daily_weather`, `wp2/wind_series.npz`) is a one-time research artifact, not a daily job |
| Fire history (VIIRS/FIRMS detections → ring/lag counts, radiative power, days-since) | NASA FIRMS/LANCE VIIRS (375 m) | FIRMS near-real-time API or LANCE download | Near-real-time, typically ~3 hours after satellite overpass | Free | NASA open data, no restriction, attribution expected | Website has a VIIRS/FIRMS ingestion effort underway on a sibling branch (`resq8/firms-ingestion`, out of this audit's scope to inspect/touch) for *detections*; Bar v3's specific ring/lag/radiative-power feature engineering from those detections (`wp2/fire.npy`, the 4-channel token builder) is research-repo-only and not ported to the website at all |
| Land cover / vegetation proxy | ESA WorldCover 2021 v200 (10 m) | AWS `esa-worldcover` COG, windowed reads via GDAL `/vsicurl/` | Minutes (static layer, re-fetched rarely, not daily) | Free | CC-BY 4.0 | Yes — `backend/inference` already does windowed WorldCover fetches for incident domains (`docs/RESQ3_INPUTS.md` §2); not yet wired to the six-state ignition-risk grid |
| Terrain (DEM: slope, aspect, TPI) | Copernicus GLO-30 DSM (~30 m) | AWS `copernicus-dem-30m` COG, windowed reads | Minutes (static, not daily) | Free | Open, free registration | Yes, same as above — incident-domain windows only, not the six-state grid |
| Burn history (`bf_log_n10_nbhd`, `bf_years_since`) | MODIS MCD64A1 monthly burned area (463.31 m) | NASA LP DAAC / Microsoft Planetary Computer blob mirror (used anonymously in `RESQ3_INPUTS.md`) | Monthly product, so **not same-day fresh by nature** — usable as a slowly-varying static-ish input only | Free | NASA open data | Yes — `backend/inference/mcd64a1_geo.py`, `validate_mcd64a1.py` already fetch/validate this for incident windows |
| Human layers (`hb_log_pop`, `hb_ghm_aa`, `hb_ghm_bu`, `hb_nl_rank`, `hb_road_km`) | **Not identified.** Only column names were found (`docs/SPEC.md`, `src/dmm.py`); no README in the granted repo names the source dataset (population, Global Human Modification, night-lights, road-distance layers are all plausible candidates but unconfirmed) | Unknown | Unknown | Unknown | **Unverified — flagged, not guessed** | No fetch found for these columns anywhere in either repo |
| Fire-weather codes (FFMC/DMC/DC/ISI/BUI/FWI) | Derived from the antecedent weather series, computed in-pipeline | No separate fetch — downstream of the weather input above | Same as antecedent weather | Free (compute only) | N/A | Computation exists in the research repo (`docs/SPEC.md` weather-stream description); not ported |
| Static grid (cell geometry, forest mask, cell IDs) | Research repo's own frozen master grid | N/A — must stay fixed, not re-fetched daily | N/A | N/A | N/A | Exists as `proposed/imagery/cells_in_rows.csv` (used by the export script already); **`docs/DECISIONS.md` decision 42 notes the original grid construction data was lost and had to be reconstructed** — worth knowing before depending on it further |

**The single largest input by measured effect:** removing the GFS forecast block (ablation E1 in `FINAL_REPORT.md` §3) costs **−0.014 AP on 2024 and −0.018 AP on 2023**, both with intervals excluding zero — by far the largest ablation effect measured. Any live version that drops or degrades the GFS input inherits a large, already-quantified accuracy cost; any live version that keeps it inherits the GFS/Earth-Engine/personal-account dependency above.

## 4. Compute and hosting

**No GPU is needed for Bar v3.** It is a scikit-learn gradient-boosted-tree ensemble, not a neural net; the only GPU use in the whole research programme is for the deep multimodal model, which loses to Bar v3 (§2) and is not recommended.

Measured, not estimated, from the research repo's own logs (`~/wildfire-research/proposed/logs/`):

```
logs/bar_deployable_2025.log : bag 0 16:53:18 → bag 4 17:07:50   (5 bags, ≈15 min total, ≈3 min/bag)
logs/budget_bag2025.log      : bag 0 02:01:33 → bag 4 02:44:49   (5 bags, ≈43 min total, ≈8.6 min/bag)
logs/dmp_bag2023.log         : bag 0 04:43:49 → bag 3 ...         (≈9 min/bag)
```

`docs/STATUS.md`/`jobs/GCP_JOBS.md` state this plainly for the full pipeline (tune + anchors + bag, i.e. everything, not just bagging): *"S1 ... local estimate 70 to 90 minutes, under the 2-hour rule, so no CPU VM."* This was all run on a Mac laptop, CPU only.

**Memory:** not explicitly logged for Bar v3 itself. From `bar_v3.py`'s `joined()` function, training uses a disk-backed memmap (`np.lib.format.open_memmap`), not a fully in-core array, for a matrix of up to ~900,000 fit rows × 385 float64 columns (≈2.8 GB if fully materialized). No out-of-memory issue is recorded in any log for this stage. The one explicit memory figure in the repo (16 GB RAM on an L4 GPU VM, `docs/DECISIONS.md` decision 48) is for the unrelated deep model, not Bar v3 — do not reuse that number as if it applied here.

**What this means for hosting:** a small server (no GPU, a few GB of RAM, modest CPU) is sufficient for the *fit-and-score* step once it's running. The caveat is what §2 already established: because weights are never persisted, "daily run" today would mean retraining the 5-member ensemble from scratch every day (~15–45 min per the logs above) rather than loading a checkpoint and scoring in milliseconds. Persisting the fitted estimators (one `joblib.dump` after `bag()`) would convert this into fast, cheap, GPU-free daily inference — but that is a pipeline change nobody has made yet, and today's product dependency (`backend/requirements.txt`) does not even list `scikit-learn`.

**Not measured anywhere, in either repo:** the runtime of actually *building* one day's 385-column feature row from raw inputs (GFS/ERA5/FIRMS fetch + 60-day antecedent reconstruction + ring/lag fire-history features). The bagging/tuning timings above assume the feature table already exists (`cache/in_season/features/model_table.pkl`, 1.3 GB; `cache/in_season/screen/g06.npy`, 2.1 GB, both already built once, locally, in the research repo). Building that pipeline as a repeatable daily job, and timing it, is unstarted work — flagged honestly, not estimated from nothing.

## 5. Coverage

Per `backend/app/barv3.py` line 16 and `docs/redesign/00_audit.md`/`09_trust_rules.md` on `redesign-v2`, the only coverage definition that actually exists for this model is: **six fit states — Odisha (OD), Chhattisgarh (CG), Telangana (TS), Madhya Pradesh (MP), Maharashtra (MH), Jharkhand (JH) — and nothing else.**

The task framing that prompted this audit referenced "the six fit states plus the two zero-shot states this product's docs already reference." Having checked both named docs directly, that second tier **does not exist for this product or this model**. `docs/redesign/00_audit.md` says so explicitly, having already grepped for it: *"No 'two zero-shot states' exist anywhere in this codebase or its docs — grepped for 'zero-shot', 'held-out state', 'eight state' and found nothing. Do not invent a zero-shot-states claim for the Today screen."* `docs/redesign/09_trust_rules.md` matches: *"There is no second 'zero-shot' tier; outside the six states is simply not validated."*

**Where the "6+2" idea likely came from, traced (not guessed):** `~/wildfire-research/AUDIT.md` (a paper-vs-handoff check, unrelated to Bar v3) discusses *a different model entirely* — "the baseline" — being evaluated on two additional "fresh states," Uttarakhand (UK) and Andhra Pradesh (AP), as a post-hoc "second look." That baseline and its handoff document live in `~/wildfire/docs/PAPER_HANDOFF.md` — a **sibling repository explicitly outside this audit's granted read scope** (the task grants read access to `~/wildfire-research` only). I did not open `~/wildfire`, so I cannot independently confirm UK/AP's exact role or status there. What I can confirm is that this fresh-state evaluation belongs to a different model lineage, is not part of `proposed/` (where Bar v3 lives), and does not apply to the model that actually backs `/risk/geojson`. The six-states-only framing in `00_audit.md`/`09_trust_rules.md` is correct and should not be revised to add a second tier.

**What the app currently shows outside the six states:** confirmed in `frontend/src/redesign/pages/TodayPage.tsx` (lines 58–72), the UI already renders this correctly — an `EmptyState` with the exact text *"Not validated here" / "Outside the six scoped states, RESQ does not show a risk value"* — matching the trust-rules doc. On the backend side, `barv3.py`'s row filter (`rows[rows["state"].isin(STATES)]`) simply omits any other state's cells from the response; the frontend supplies the "Not validated here" copy for whatever the backend leaves out. This is consistent, already built, and does not need to change for any of the options below.

## 6. Options

### Option A — serve Bar v3 live, for real, daily
**Effort: high.** Requires: (1) a daily feature-build job reproducing all 385 columns, including the GFS/ERA5/FIRMS fetches in §3, ported out of researcher-account-bound scripts into something RESQ owns; (2) persisting trained weights (a one-line code change, `joblib.dump`, but currently absent, and every retrain needs re-verification against the parity check in §7); (3) adding `scikit-learn` to the backend; (4) resolving the ERA5-Land reanalysis latency problem (§3) since "today's" antecedent weather may not be available same-day; (5) accepting the model's own documented limits in product copy — `docs/SPEC.md` item under amendment 26's final-tables plan states the wording explicitly: *"short-term fire occurrence near active fire; no claim of independent-ignition forecasting."* This is a real, already-decided epistemic ceiling on what Bar v3 is allowed to claim, even once live.
**Risk: high.** Untested production fetch pipeline; personal-account cloud dependency; no persisted weights means every day is effectively a fresh, unverified training run unless parity-tested; six-state-only scope must be preserved exactly; Earth Engine commercial terms unconfirmed.
**What it lets Today honestly claim:** "This is today's live Bar v3 ranking for [real date], the same model validated in the research repo's FINAL_REPORT.md, covering six states" — with all of Bar v3's existing caveats (detection-conditioned, no causal claim, not independent-ignition forecasting) carried into the copy unchanged.

### Option B — serve a simplified model, live, daily
E.g. drop the GFS forecast block entirely (quantified cost: −0.014 to −0.018 AP, §3) to remove the most latency-sensitive, account-bound input, or use the research repo's own "frozen baseline" (tabular network, AP 0.19–0.21 vs Bar v3's 0.26–0.29, still far above the climatology baseline's 0.095).
**Effort: medium.** Same weight-persistence and `scikit-learn` dependency issues as A, but a smaller daily-fetch surface (no GFS/Earth-Engine dependency if that input is dropped).
**Risk: medium.** Weaker, but quantified and disclosable numbers; the ERA5-Land antecedent-weather latency issue (§3) is not solved by dropping GFS — it still applies to the inputs that remain.
**What it lets Today honestly claim:** "This is today's live ranking from a simpler model, covering six states" — a true live claim, with an honestly weaker headline number than Bar v3's own validated best.

### Option C — stay archived/replay, labelled honestly
**Effort: low.** Most of the honesty work is already done — `TodayPage.tsx` already shows a hardcoded demo date, `SampleDataBadge`, and "archived Bar v3 replay... not a real-time model run." The one concrete, immediate task is fixing the bug found in §1: the exported bundle this feature depends on does not exist anywhere on this machine, so the "replay" currently has nothing to replay from the filesystem path. That needs either committing/deploying the exported bundle, or confirming (and documenting) that Postgres is seeded via `import_barv3_replay.py`.
**Risk: low.**
**What it lets Today honestly claim:** exactly what it already says — a labelled replay of a real, validated model on a past date, not a live forecast.

### Recommendation
**C now; B is the only live path worth planning next; A is not recommended for the foreseeable term.**

Reasoning: the research programme did produce a genuinely strong, validated model (Bar v3, §2) — this is good news, and it means "live" is not inherently dishonest to claim *eventually*. But three separate, unresolved problems sit between here and any live claim, each requiring a decision only the product owner can make, not an engineering shortcut: (1) no persisted weights means "daily run" today is undefined behavior, not a deployment detail; (2) the feature pipeline is currently tied to one person's personal GCP/Earth-Engine account and has real, unresolved latency on its antecedent-weather input; (3) even a working live Bar v3 carries an explicit, already-written epistemic ceiling ("no claim of independent-ignition forecasting") that the product's own strict honesty rules (`09_trust_rules.md`) would need to carry through in full, including the existing Playwright test that currently asserts the word "live" appears nowhere in rendered UI text — which this product's own test suite would need to deliberately change, not accidentally violate. Given this user's demonstrated standard for this product (recompute every number from source, never approximate, never overclaim), shipping a live claim on an unverified daily pipeline is a bigger risk than shipping an honest, working replay. Fixing the replay's actual bug (§1) is higher-value, lower-risk, and immediately doable; B is the realistic first live milestone if and when the user decides to invest in it.

## 7. Build plan (for the recommendation: fix C now, scope B as the next milestone)

### Concrete steps — fixing C (immediate)
1. Decide and execute one of: (a) run `backend/inference/export_barv3_replay.py --research ~/wildfire-research --output backend/models/barv3` once and commit/deploy that bundle (small: the npz files are prediction arrays, not full feature tables), or (b) run `import_barv3_replay.py` against the deployed Postgres and confirm the DB-fallback path in `risk.py` actually serves rows. Either closes the gap found in §1.
2. Add a smoke test asserting `/api/risk/geojson?target=2024-03-10` (the hardcoded demo date) returns a non-empty `FeatureCollection` — this would have caught the current empty-bundle state immediately.
3. No UI copy changes needed — `TodayPage.tsx`'s existing labelling already matches Option C's honesty bar.

### Concrete steps — standing up B as a real live milestone (only once the step-4 decisions below are made)
1. Decide the feature scope (full 385 columns vs. GFS-dropped ~305-column variant) — this is the effort/accuracy tradeoff named in §3/§6 and needs the product owner's sign-off, not an engineering default.
2. Port the chosen feature-build steps (weather fetch, fire-history ring/lag features, static layers) out of `~/wildfire-research`'s researcher-account-bound scripts into a job RESQ owns and can run on its own infrastructure/credentials.
3. Add `scikit-learn` to `backend/requirements.txt`; modify the training step to `joblib.dump` the fitted bagged ensemble after fitting, versioned by date/commit; load it for scoring rather than retraining per request.
4. Wire a new `build_day(target_date)` function (named, not yet built, per `docs/05_prototype_gap_analysis.md`'s own Phase 1 item 4) that assembles the day's feature rows and calls the loaded model, writing results into the same `cell_scores`/`forecast_runs` schema the replay fallback already uses — this keeps `risk.py`'s contract unchanged.

### Tests needed
- **Freshness check** (new, required before this can be "live"): before serving a day, verify every required input (GFS 06 UTC run for day D, ERA5-Land antecedent series through day D−1, FIRMS detections through day D−1, static layers present) is actually available and inside its expected staleness tolerance — reusing the research repo's own availability check pattern (`results/gfs_run_availability.csv`'s completeness logic) rather than inventing a new one.
- **Failure/fallback behavior** (new, required): if any required input is missing or stale beyond tolerance, the day must render the existing "Not validated here"/empty state (already built, §5) rather than serving a partial-input score with the same visual weight as a validated one — never silently degrade or interpolate.
- **Parity/replication test** (reuse): before trusting any new day's `build_day()` output, replay a day already present in `bar3_deployable_2024_predictions.npz` through the new pipeline and require the scores match within float tolerance — this is literally `docs/05_prototype_gap_analysis.md`'s own Phase 1 item 5 ("run parity checks against stored validation predictions before any wall-to-wall forecast"), not a new idea.
- **Leakage/timestamp test** (reuse): adapt the repo's own D-1 truncation tests (`docs/SPEC.md` addenda 23a/23c — "required difference 0.0" when future-dated records are stripped) to the production path, so a production bug can never let same-day or future data leak into the forecast.
- **Determinism test** (new, needed because weights may not be persisted during a transition period): same day, same inputs, same seeds ⇒ same output, run twice.
- **Existing redesign test suite update, flagged not silently changed:** the current Playwright suite asserts no rendered text contains the word "live" (`docs/redesign/09_trust_rules.md`'s own rule, built into the test suite per `resq_redesign_v2_status` history). Going live on Today is the one case where that rule's wording itself needs the product owner's explicit review — this must not be flipped by an agent without that sign-off.

### Decisions that need the user before any building starts
1. Accept "retrain every time" vs. invest in persisting/versioning weights (§2, §4) — changes both cost and operational risk.
2. Who owns the daily feature-fetch infrastructure and its credentials/billing — today it is one researcher's personal GCP project and Google account (`space-debris-507012` / `vkireeti16@gmail.com`), not RESQ's own infrastructure (`~/wildfire-research/proposed/docs/STATUS.md`).
3. Whether to accept ERA5-Land's reanalysis latency as-is (meaning "today's" antecedent weather may not truly be available same-day) or substitute a faster, lower-validated proxy — a scientific tradeoff, not an engineering one, since it means scoring with inputs the model wasn't validated against.
4. Whether Bar v3's own documented ceiling — "short-term fire occurrence near active fire; no claim of independent-ignition forecasting" (`docs/SPEC.md`) — is acceptable as the live product's framing, worded into `09_trust_rules.md`-style copy, before any live date is shown.
5. Budget/ownership for recurring cloud costs of a daily fetch (GFS/ERA5/FIRMS), separate from the research programme's own small, capped, personally-billed budget.
6. Explicit sign-off to change the test suite's "no 'live' in rendered text" rule for Today specifically, since that rule exists by this product's own deliberate choice.

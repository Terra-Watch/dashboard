# Ranking audit — progress log

Branch: `resq10/ranking-audit`, created from `redesign-v2` (at commit `a2bebb8`). Audit only — no app code, no model code, nothing under `docs/sim_diagnosis/` touched. No push/merge.

## Scope
Answer: what does it actually take to make the Today screen's "tomorrow" forest-area ranking live instead of the current archived replay. Read-only research into `backend/app/barv3.py` + routers (this repo) and `~/wildfire-research` (read-only, not modified). Write only under `docs/ranking/`.

## Steps
- [x] Created branch `resq10/ranking-audit` from `redesign-v2`.
- [x] Traced `/api/risk/geojson` end to end: `TodayPage.tsx` → `backend/app/routers/risk.py` → `backend/app/barv3.py` (`daily_geojson`/`daily_risk`) → archived `.npz` replay bundle, with a Postgres `cell_scores`/`forecast_runs` fallback.
- [x] Verified on disk: no `backend/models/barv3/` bundle, no real `backend/.env`, `RESQ_MODEL_BUNDLE_DIR` unset, no `bar3_replay_*.npz`/`cell_centers.csv` findable anywhere searched on this machine — `/risk/geojson` has nothing to serve from the filesystem path today.
- [x] Identified the model: `sklearn.ensemble.HistGradientBoostingClassifier`, 5-member bagged ensemble, hyperparameters frozen in `~/wildfire-research/proposed/results/bar_v3_selection_2024.json`, inputs = 305 baseline columns + 80 GFS forecast columns (`~/wildfire-research/proposed/src/bar_v3.py`, `docs/SPEC.md`).
- [x] Confirmed via `~/wildfire-research/proposed/docs/FINAL_REPORT.md` and `docs/GATES.md`: bagged Bar v3 is the strongest model found in the whole research programme — the deep multimodal model and its distillation variant (A2s) do not beat it on both folds. Bar v3 is not a fallback/simplification; it is the best validated candidate.
- [x] Confirmed Bar v3's trained weights are **never serialized anywhere** — `bag()` fits the classifier in memory, scores the validation split, saves only the resulting probability array, and discards the fitted estimator. Grepped `~/wildfire-research/proposed/src` for `joblib.dump`/`pickle.dump`/`save_model`: no hits for Bar v3. Weights exist neither locally nor (as far as any doc records) in the cloud.
- [x] Catalogued daily-run inputs (weather forecast/antecedent, fire history, static layers) with source/fetch/latency/licence, cross-checking `docs/SPEC.md` addenda 23/23a/23b/23c and the website's own `docs/05_prototype_gap_analysis.md` / `docs/RESQ3_INPUTS.md`.
- [x] Compute: measured bagging time from `~/wildfire-research/proposed/logs/*.log` (~3.5–9 min per bagged member, 5 members, CPU only, no GPU, run on a Mac laptop). Confirmed `backend/requirements.txt` has no `scikit-learn` dependency today.
- [x] Coverage: verified against `docs/redesign/00_audit.md` and `09_trust_rules.md` on `redesign-v2` — only six fit states exist; the "two zero-shot states" framing does **not** apply to Bar v3 or this product (00_audit.md explicitly grepped for it and found nothing). Traced its likely origin to an unrelated model lineage in a sibling repo (`~/wildfire`, out of this audit's granted scope) via `~/wildfire-research/AUDIT.md`'s own cross-reference.
- [x] Verified `frontend/src/redesign/pages/TodayPage.tsx` already renders "Not validated here" / `SampleDataBadge` / a hardcoded demo date — current UI behavior matches the trust-rules doc.
- [x] Wrote `docs/ranking/00_audit.md` (options A/B/C, recommendation, build plan).
- [x] Committed.

## Could not verify (stated plainly in the audit, not guessed)
- Whether a live Postgres instance on this machine has ever been seeded with replay rows via `import_barv3_replay.py` (not inspected live; filesystem bundle is absent either way).
- Exact source/licence of the four human-layer static columns (`hb_log_pop`, `hb_ghm_aa`, `hb_ghm_bu`, `hb_nl_rank`, `hb_road_km`) — no README in the granted repo maps these column names to a named dataset.
- Any GCS bucket contents directly (`gs://kireeti-wildfire-507012`) — not browsed; relied on the repo's own documentation of what it uploads (code/packages/results, no Bar v3 model object documented as uploaded).
- Google Earth Engine's commercial-use terms as applied to a production daily fetch — not evaluated; flagged as an open question for option A/B.

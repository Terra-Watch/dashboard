"""Development-only diagnostics over existing RESQ6 saved grids and labels."""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
sys.path[:0] = [str(ROOT / x) for x in ("backend/inference", "scripts/resq5", "scripts/resq3", "scripts/resq6")]
import rescore_fair as scorer  # noqa: E402
import run_dev as runner  # noqa: E402

CASES = ("E2024-131853", "E2024-135332", "E2023-084925", "E2024-155286")
ARCHIVE_ROOT = ROOT / "results/resq6/dev_member_grids_horizon_aligned_20261015"
TEMPORAL = ROOT / "results/resq6/temporal_alignment_audit_20261015/official_score_reproduction.json"
INVENTORY = ROOT / "results/resq6/observational_validation_investigation_20261015/local_reference_inventory.json"
HORIZONS = (6, 12, 24, 48)


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def footprint_stats(mask: np.ndarray, ignition_rc: tuple[int, int], cell_m: float = 30.0) -> dict:
    """North-up square-grid geometry; Boolean True means simulated burned."""
    mask = np.asarray(mask, dtype=bool)
    if mask.ndim != 2 or not mask.size:
        raise ValueError("mask must be a non-empty 2-D grid")
    rr, cc = np.nonzero(mask)
    n = int(mask.shape[0])
    if mask.shape[1] != n:
        raise ValueError("only square grids are supported")
    if not len(rr):
        return {"burned_cells": 0, "area_m2": 0.0, "centroid_row": None,
                "centroid_col": None, "centroid_east_m": None, "centroid_north_m": None,
                "ignition_displacement_m": None, "touches_grid_edge": False,
                "edge_burned_cells": 0}
    ir, ic = ignition_rc
    cr, cc_mean = float(rr.mean()), float(cc.mean())
    edge = (rr == 0) | (rr == n-1) | (cc == 0) | (cc == n-1)
    dx = (cc_mean - ic) * cell_m
    dy = (ir - cr) * cell_m  # row increases south; north displacement is negative row delta
    return {"burned_cells": int(len(rr)), "area_m2": float(len(rr) * cell_m**2),
            "centroid_row": cr, "centroid_col": cc_mean,
            "centroid_east_m": dx, "centroid_north_m": dy,
            "ignition_displacement_m": float(np.hypot(dx, dy)),
            "touches_grid_edge": bool(edge.any()), "edge_burned_cells": int(edge.sum())}


def transition_stats(before: np.ndarray, after: np.ndarray) -> dict:
    before, after = np.asarray(before, bool), np.asarray(after, bool)
    if before.shape != after.shape:
        raise ValueError("frame shapes differ")
    both = int(np.count_nonzero(before & after))
    union = int(np.count_nonzero(before | after))
    return {"intersection_cells": both, "union_cells": union,
            "intersection_over_union": (both / union if union else 1.0),
            "new_cells": int(np.count_nonzero(after & ~before)),
            "cells_absent_from_later_frame": int(np.count_nonzero(before & ~after))}


def main() -> None:
    official = json.loads(TEMPORAL.read_text())
    inv = json.loads(INVENTORY.read_text())
    oldcells = {(x["incident_id"], x["horizon_h"]): x for x in official["cells"]
                if x.get("official_cell", {}).get("scorable")}
    inv_by_case = {x["incident_id"]: x for x in inv["incidents"]}
    per_case, footprint = [], []
    used_hashes: dict[str, str] = {}
    for iid in CASES:
        setup = runner.SETUP[iid]
        manifest_path = ARCHIVE_ROOT / "member_grids" / iid / "manifest.json"
        manifest = json.loads(manifest_path.read_text())
        if manifest["members_saved"] != 60 or len(manifest["members"]) != 60:
            raise ValueError(f"expected 60 saved members for {iid}")
        used_hashes[manifest_path.relative_to(ROOT).as_posix()] = digest(manifest_path)
        archives = []
        for entry in manifest["members"]:
            ap = manifest_path.parent / entry["file"]
            actual = digest(ap)
            if actual != entry["sha256"]:
                raise ValueError(f"archive hash mismatch: {ap}")
            used_hashes[ap.relative_to(ROOT).as_posix()] = actual
            z = np.load(ap, allow_pickle=False)
            if tuple(z[f"hour_{HORIZONS[0]:02d}"].shape) != tuple(manifest["grid_shape"]):
                raise ValueError(f"grid shape mismatch: {ap}")
            if any(str(h) not in entry["source_frame_hours"] for h in HORIZONS):
                raise ValueError(f"missing frame metadata: {ap}")
            if any(int(entry["source_frame_hours"][str(h)]) != h for h in HORIZONS):
                raise ValueError(f"non-exact frame in {ap}")
            archives.append((entry, z))

        domain = setup["domain"]
        n = int(domain["cells_per_side"])
        if tuple(manifest["grid_shape"]) != (n, n):
            raise ValueError(f"grid and configured domain disagree for {iid}")
        oa = scorer.resq5_analyze.observed_arrays(iid)
        case_scores = []
        for h in HORIZONS:
            maps = np.stack([np.asarray(z[f"hour_{h:02d}"], dtype=bool) for _, z in archives])
            prob = maps.mean(axis=0)
            area_stats = [footprint_stats(maps[j], tuple(map(int, archives[j][0]["ignition_row_col"])), runner.CELL)
                          for j in range(len(archives))]
            sizes = np.asarray([m["burned_cells"] for m in area_stats], dtype=float)
            unique_n = len({hashlib.sha256(np.packbits(x.ravel()).tobytes()).hexdigest() for x in maps})
            p_nonzero = int(np.count_nonzero(prob > 0))
            p_half = int(np.count_nonzero(prob >= .5))
            ambiguous = int(np.count_nonzero((prob > 0) & (prob < 1)))
            fp_h = {"incident_id": iid, "horizon_h": h, "frame_shape": [n, n], "cell_size_m": runner.CELL,
                "members": 60, "unique_member_masks": unique_n,
                "burned_cells_min_median_max": [int(np.min(sizes)), float(np.median(sizes)), int(np.max(sizes))],
                "burned_area_km2_min_median_max": [float(np.min(sizes)*runner.CELL**2/1e6), float(np.median(sizes)*runner.CELL**2/1e6), float(np.max(sizes)*runner.CELL**2/1e6)],
                "members_touching_domain_edge": sum(x["touches_grid_edge"] for x in area_stats),
                "member_centroid_east_m_min_median_max": [float(np.min([x["centroid_east_m"] for x in area_stats if x["centroid_east_m"] is not None])), float(np.median([x["centroid_east_m"] for x in area_stats if x["centroid_east_m"] is not None])), float(np.max([x["centroid_east_m"] for x in area_stats if x["centroid_east_m"] is not None]))] if any(x["centroid_east_m"] is not None for x in area_stats) else None,
                "member_centroid_north_m_min_median_max": [float(np.min([x["centroid_north_m"] for x in area_stats if x["centroid_north_m"] is not None])), float(np.median([x["centroid_north_m"] for x in area_stats if x["centroid_north_m"] is not None])), float(np.max([x["centroid_north_m"] for x in area_stats if x["centroid_north_m"] is not None]))] if any(x["centroid_north_m"] is not None for x in area_stats) else None,
                "probability_support_cells_p_gt_0": p_nonzero, "cells_probability_at_least_0_5": p_half,
                "cells_with_member_disagreement_0_lt_p_lt_1": ambiguous,
                "probability_weighted_area_km2": float(prob.sum()*runner.CELL**2/1e6),
                "descriptive_only_not_observed_burn_area": True}
            footprint.append(fp_h)
            obs = scorer.obs_at_horizon(setup["overpasses_used"], oa, h)
            prior = oldcells.get((iid, h))
            score_record = {"incident_id": iid, "horizon_h": h, "observation_available": obs is not None,
                            "engine_score_recomputed": None, "archived_official_cell": prior}
            if obs is not None:
                score_record["target_positive_cells"] = int(np.count_nonzero(obs))
                score_record["target_semantics"] = "cumulative VIIRS n/h active-fire detection mask; no coverage/unknown mask"
                score_record["engine_score_recomputed"] = scorer.score(prob, obs)
                baseprob = scorer.blurred_baseline(iid, h, runner.JITTER_RADIUS_M)
                score_record["baseline_scores_recomputed"] = {
                    "baseline_a_ap_brier": scorer.score(baseprob["a_blurred"], obs),
                    "baseline_b_ap_brier": scorer.score(baseprob["b_blurred"], obs),
                    "jitter_radius_m": runner.JITTER_RADIUS_M,
                    "jitter_members": scorer.N_JITTER,
                    "wind_source": "existing cached development ERA5-Land wind; scorer helper only; no network fallback",
                }
                best_ap = max(score_record["baseline_scores_recomputed"]["baseline_a_ap_brier"]["ap"],
                              score_record["baseline_scores_recomputed"]["baseline_b_ap_brier"]["ap"])
                delta = score_record["engine_score_recomputed"]["ap"] - best_ap
                score_record["recomputed_delta_vs_best_baseline"] = delta
                score_record["recomputed_call"] = ("WIN" if delta >= scorer.MARGIN else
                    ("LOSS" if delta <= -scorer.MARGIN else "TIE"))
                if prior is None:
                    raise ValueError(f"missing official score cell for scorable horizon {iid} h{h}")
                differences = {}
                for key, actual in (("ap_engine", score_record["engine_score_recomputed"]["ap"]),
                                    ("brier_engine", score_record["engine_score_recomputed"]["brier"]),
                                    ("ap_baseline_a_blurred", score_record["baseline_scores_recomputed"]["baseline_a_ap_brier"]["ap"]),
                                    ("brier_baseline_a_blurred", score_record["baseline_scores_recomputed"]["baseline_a_ap_brier"]["brier"]),
                                    ("ap_baseline_b_blurred", score_record["baseline_scores_recomputed"]["baseline_b_ap_brier"]["ap"]),
                                    ("brier_baseline_b_blurred", score_record["baseline_scores_recomputed"]["baseline_b_ap_brier"]["brier"])):
                    differences[key] = abs(actual - prior["official_cell"][key])
                score_record["engine_score_abs_difference_from_frozen_record"] = differences
                score_record["engine_score_matches_frozen_record_1e_12"] = max(differences.values()) <= 1e-12
                # Descriptive location/support checks only; non-detections are not treated as valid negatives.
                rr, cc = np.nonzero(obs)
                if len(rr):
                    obs_centroid = [float(cc.mean()), float(rr.mean())]
                    ptotal = float(prob.sum())
                    if ptotal > 0:
                        pr, pc = np.indices(prob.shape)
                        pred_centroid = [float((prob*pc).sum()/ptotal), float((prob*pr).sum()/ptotal)]
                        dx = (pred_centroid[0]-obs_centroid[0])*runner.CELL
                        north = (obs_centroid[1]-pred_centroid[1])*runner.CELL
                        score_record["descriptive_spatial"] = {
                            "obs_positive_centroid_row_col": [obs_centroid[1], obs_centroid[0]],
                            "probability_centroid_row_col": [pred_centroid[1], pred_centroid[0]],
                            "centroid_distance_m": float(np.hypot(dx,north)),
                            "probability_mass_inside_positive_cells_fraction": float(prob[obs].sum()/ptotal),
                            "positive_cells_with_any_simulated_member_burned": int(np.count_nonzero(obs & (prob>0))),
                            "positive_mask_cells": int(len(rr),),
                            "interpretation": "descriptive overlap only; target is active detections, not perimeter; outside-mask cells are not validated negatives"}
                case_scores.append(score_record)
            else:
                score_record["reason_unscored"] = "no qualifying VIIRS pass at or before nominal horizon; do not infer an accuracy score"
            # Per-member transition metrics are computed after all horizon frames are loaded below.
        transitions = []
        for h0, h1 in zip(HORIZONS, HORIZONS[1:]):
            vals = [transition_stats(np.asarray(z[f"hour_{h0:02d}"], bool), np.asarray(z[f"hour_{h1:02d}"], bool)) for _, z in archives]
            transitions.append({"from_horizon_h": h0, "to_horizon_h": h1,
                "members": len(vals), "median_frame_iou_min_max": [float(np.min([x["intersection_over_union"] for x in vals])), float(np.median([x["intersection_over_union"] for x in vals])), float(np.max([x["intersection_over_union"] for x in vals]))],
                "new_cells_min_median_max": [min(x["new_cells"] for x in vals), float(np.median([x["new_cells"] for x in vals])), max(x["new_cells"] for x in vals)],
                "members_with_burned_cells_lost": sum(x["cells_absent_from_later_frame"] > 0 for x in vals),
                "interpretation": "saved-frame descriptive transition; not an accuracy score"})
        per_case.append({"incident_id": iid, "domain": domain,
            "prescribed_setup_ignition_lat_lon": setup["ignition_lat_lon"],
            "prescribed_setup_ignition_utm_m": setup["ignition_utm_m"],
            "setup_ignition_row_col": setup.get("ignition_cell_rowcol"),
            "first_detection_utc": setup.get("first_detection_utc"), "t0_utc": setup["t0_utc"],
            "dmm_onset_prediction": {"status": "unavailable", "meaning": "no DMM prediction or DMM-to-Cell2Fire handoff is present in this simulation setup"},
            "scored_horizons": case_scores,
            "ensemble_transitions": transitions,
            "source_mask_path": f"results/resq5/{iid}/observed_footprints.npz",
            "source_mask_sha256": inv_by_case[iid]["observed_mask"]["sha256"]})

    score_cells = [s for c in per_case for s in c["scored_horizons"] if s["observation_available"]]
    calls = {"wins": "WIN", "ties": "TIE", "losses": "LOSS"}
    tally = {k: sum(s["recomputed_call"] == v for s in score_cells) for k, v in calls.items()}
    official_hash = digest(TEMPORAL)
    diagnostics = {"scope": "four development cases only; descriptive; no held-out inputs",
        "official_score_source": TEMPORAL.relative_to(ROOT).as_posix(), "official_score_source_sha256": official_hash,
        "scoring_reproduction": {"engine_and_baseline_ap_brier_recomputed_from_saved_grids_and_cached_weather": True,
            "all_six_metric_values_per_cell_matching_frozen_values_1e_12": sum(s["engine_score_matches_frozen_record_1e_12"] for s in score_cells),
            "scorable_cells_recomputed": len(score_cells), "official_call_tally_recomputed": tally,
            "full_cli_rescore_status": "BLOCKED: current rescore_fair.py requires ignition_jitter_radius_m in each member manifest; archived horizon-aligned manifests omit it. The CLI was invoked once and raised ValueError before writing output.",
            "direct_scoring_helpers": "rescore_fair.score and rescore_fair.blurred_baseline; the latter used already-cached ERA5-Land weather only; no network acquisition"},
        "per_incident": per_case}
    (OUT / "per_incident_diagnostics.json").write_text(json.dumps(diagnostics, indent=2, sort_keys=True)+"\n")
    (OUT / "footprint_descriptives.json").write_text(json.dumps({"grid_interpretation": "north-up EPSG:32644; 30m square cells; row increases south, column increases east; centroid coordinates relative to member ignition cell", "frames": footprint}, indent=2, sort_keys=True)+"\n")
    source_names = [
        "data/resq5/protocol_setup.json",
        "results/resq6/temporal_alignment_audit_20261015/temporal_audit_report.md",
        "results/resq6/temporal_alignment_audit_20261015/temporal_timing_table.json",
        "results/resq6/temporal_alignment_audit_20261015/official_score_reproduction.json",
        "results/resq6/target_feasibility_20261015/feasibility_report.md",
        "results/resq6/target_feasibility_20261015/target_feasibility.json",
        "results/resq6/target_feasibility_20261015/owner_decisions.md",
        "results/resq6/spread_evaluation_feasibility_20261015/spread_evaluation_feasibility.md",
        "results/resq6/spread_evaluation_feasibility_20261015/reference_data_inventory.json",
        "results/resq6/spread_evaluation_feasibility_20261015/evaluation_protocol_proposal.md",
        "results/resq6/spread_evaluation_feasibility_20261015/scenario_visualization_readiness.md",
        "results/resq6/spread_visualization_20261015/implementation_report.md",
        "results/resq6/wind_direction_cardinal_20261015_verified/manifest.json",
        "results/resq6/dev_member_grids_horizon_aligned_20261015/recovery_provenance.json",
        "results/resq6/observational_validation_investigation_20261015/local_reference_inventory.json",
        "results/resq6/failure_mode_investigation_20261015/analyze_failure_modes.py",
        "scripts/resq6/run_dev.py", "scripts/resq6/rescore_fair.py", "scripts/resq5/analyze.py",
        "backend/inference/engine/weather.py", "backend/inference/engine/baseline.py",
        "backend/inference/engine/fuel.py", "docs/simulation/PROTOCOL.md", "docs/simulation/DECISION_RULE.md",
        "backend/tests/test_failure_mode_diagnostics.py",
    ]
    for rel in source_names:
        p = ROOT / rel
        if p.is_file(): used_hashes[rel] = digest(p)
    generated_names = ["investigation_report.md", "hypothesis_evidence_matrix.json",
                       "per_incident_diagnostics.json", "footprint_descriptives.json", "next_experiment.md"]
    provenance = {
        "date": "2026-10-15",
        "scope": {"development_incidents_only": list(CASES), "heldout_accessed": False,
                  "downloads_or_external_apis": False, "Cell2Fire_runs": 0,
                  "tuning_or_benchmark_changes": False},
        "commands": [
            "backend/.venv/bin/python scripts/resq6/rescore_fair.py --member-grid-dir results/resq6/dev_member_grids_horizon_aligned_20261015 --output results/resq6/failure_mode_investigation_20261015/current_scoring_attempt.json (blocked before scoring by absent manifest ignition_jitter_radius_m)",
            "backend/.venv/bin/python results/resq6/failure_mode_investigation_20261015/analyze_failure_modes.py",
            "backend/.venv/bin/python -m unittest backend.tests.test_failure_mode_diagnostics -v",
            "backend/.venv/bin/python -m py_compile results/resq6/failure_mode_investigation_20261015/analyze_failure_modes.py backend/tests/test_failure_mode_diagnostics.py",
            "python3 -m json.tool on all generated JSON files",
            "git diff --check",
        ],
        "reproduction": {"all_60_member_npz_per_case_sha256_verified": True,
            "exact_frames_6_12_24_48_verified": True,
            "eight_scored_cells_all_six_ap_brier_values_match_recorded_official_reproduction_within_1e-12": True,
            "recomputed_tally": tally,
            "baseline_weather": "local cached data/resq2/<case>/weather_era5land_native_wind.csv only"},
        "source_sha256": dict(sorted(used_hashes.items())),
        "generated_outputs_sha256": {name: digest(OUT/name) for name in generated_names},
        "test_results": {"focused_unit_tests": "4 passed", "python_compilation": "passed",
                         "json_validation": "run after generation", "git_diff_check": "run after generation"},
        "known_reproducibility_limit": "The command-line scorer currently rejects saved manifests without ignition_jitter_radius_m. Direct established scoring helpers were used; no guard was bypassed and no application/scorer code was changed.",
    }
    (OUT / "provenance_manifest.json").write_text(json.dumps(provenance, indent=2, sort_keys=True)+"\n")
    print("six engine/baseline metric values per cell match", diagnostics["scoring_reproduction"]["all_six_metric_values_per_cell_matching_frozen_values_1e_12"], "/", len(score_cells))
    print("official calls", tally)
    for x in footprint:
        if x["horizon_h"] in (6,12,24,48):
            print(x["incident_id"],x["horizon_h"],"burn cells min/median/max",x["burned_cells_min_median_max"],"edge-touch members",x["members_touching_domain_edge"],"unique masks",x["unique_member_masks"])


if __name__ == "__main__":
    main()

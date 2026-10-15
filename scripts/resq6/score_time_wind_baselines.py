"""Score predeclared spatial baseline controls on RESQ6 development data only.

No Cell2Fire execution, labels-as-features, fitting, or held-out data access.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score, roc_auc_score

WEBSITE = Path(__file__).resolve().parents[2]
for item in ("backend/inference", "scripts/resq5", "scripts/resq3", "scripts/resq6"):
    sys.path.insert(0, str(WEBSITE / item))

from engine import baseline, weather  # noqa: E402
import analyze  # noqa: E402
import rescore_fair  # noqa: E402
import run_dev  # noqa: E402
import time_wind_variants as variants  # noqa: E402

SOURCE = WEBSITE / "results/resq6/dev_member_grids_horizon_aligned_20261015"
OFFICIAL = SOURCE / "fair_rescore.json"
MARGIN = 0.05
HORIZONS = (24, 48)
VARIANT_NAMES = ("baseline_a", "baseline_b", "cell2fire", "time_only", "time_wind_frozen_b", "wind_directional_asymmetric")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def score_map(probability: np.ndarray, observed: np.ndarray) -> dict:
    p = np.asarray(probability, dtype=float)
    y = np.asarray(observed, dtype=bool)
    if p.shape != y.shape or not np.isfinite(p).all() or (p < 0).any() or (p > 1).any():
        raise ValueError("prediction must be finite, in [0,1], and match observed-mask shape")
    positives = int(y.sum())
    negatives = int(y.size - positives)
    ap = float(average_precision_score(y.ravel(), p.ravel())) if positives and negatives else None
    auc = float(roc_auc_score(y.ravel(), p.ravel())) if positives and negatives else None
    total = float(p.sum())
    return {
        "ap": ap,
        "brier": float(np.mean((p - y.astype(float)) ** 2)),
        "roc_auc": auc,
        "observed_mask_probability_capture": float(p[y].sum() / total) if total else None,
        "support_cells_p_ge_0_05": int((p >= 0.05).sum()),
        "support_area_km2_p_ge_0_05": float((p >= 0.05).sum() * run_dev.CELL ** 2 / 1e6),
        "support_fraction_p_ge_0_05": float((p >= 0.05).mean()),
        "support_cells_p_ge_0_5": int((p >= 0.5).sum()),
        "observed_cells": positives,
        "mean_probability": float(p.mean()),
    }


def load_engine_maps(iid: str) -> tuple[list[dict], dict]:
    manifest_path = SOURCE / "member_grids" / iid / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    if manifest.get("members_saved") != 60 or len(manifest.get("members", [])) != 60:
        raise ValueError(f"expected 60 saved members for {iid}")
    maps: dict[int, list[np.ndarray]] = {hour: [] for hour in (6, 12, 24, 48)}
    for entry in manifest["members"]:
        if any(int(entry["source_frame_hours"][str(hour)]) != hour for hour in maps):
            raise ValueError(f"non-exact model horizon in {manifest_path}: member {entry['member']}")
        path = manifest_path.parent / entry["file"]
        if sha256(path) != entry["sha256"]:
            raise ValueError(f"member archive checksum mismatch: {path}")
        with np.load(path, allow_pickle=False) as archive:
            for hour in maps:
                maps[hour].append(archive[f"hour_{hour:02d}"].astype(float))
    return [{hour: np.mean(maps[hour], axis=0) for hour in maps}], manifest


def run(output: Path) -> dict:
    if output.exists():
        raise FileExistsError(f"refusing to overwrite existing output directory: {output}")
    output.mkdir(parents=True)
    official = json.loads(OFFICIAL.read_text())
    reference_provenance = json.loads((SOURCE / "recovery_provenance.json").read_text())
    reference_hash_status = {}
    for label, expected in reference_provenance.get("input_sha256", {}).items():
        source_path = Path(label)
        if not source_path.is_absolute():
            source_path = WEBSITE / source_path
        actual = sha256(source_path) if source_path.is_file() else None
        reference_hash_status[label] = {
            "expected_sha256": expected,
            "current_sha256": actual,
            "matches_current_file": actual == expected if actual is not None else None,
        }
    official_cells = {(c["incident_id"], c["horizon_h"]): c for c in official["cells"] if c.get("scorable")}
    records = []
    provenance_paths = {
        "protocol": WEBSITE / "docs/simulation/PROTOCOL.md",
        "decision_rule": WEBSITE / "docs/simulation/DECISION_RULE.md",
        "setup": WEBSITE / "data/resq5/protocol_setup.json",
        "baseline_code": WEBSITE / "backend/inference/engine/baseline.py",
        "weather_code": WEBSITE / "backend/inference/engine/weather.py",
        "rescore_code": WEBSITE / "scripts/resq6/rescore_fair.py",
        "runner_code": Path(__file__).resolve(),
        "variant_code": Path(__file__).with_name("time_wind_variants.py").resolve(),
        "official_fair_scores": OFFICIAL,
        "reference_run_provenance": SOURCE / "recovery_provenance.json",
        "candidate_table": WEBSITE / "results/resq2_incident_candidates.csv",
    }
    diagnostic_arrays = {}

    for iid, incident in run_dev.SETUP.items():
        scored_engine, member_manifest = load_engine_maps(iid)
        engine_maps = scored_engine[0]
        observed = analyze.observed_arrays(iid)
        setup = incident
        domain = setup["domain"]
        n = domain["cells_per_side"]
        cell_centres = (np.arange(n) + 0.5) * run_dev.CELL
        x = domain["west_m"] + cell_centres[None, :] + np.zeros((n, 1))
        y = domain["north_m"] - cell_centres[:, None] + np.zeros((1, n))
        ignition_x, ignition_y = setup["ignition_utm_m"]
        dx, dy = x - ignition_x, y - ignition_y
        jitter_x, jitter_y = run_dev.ignition_jitter(setup["jitter_seed"], 60, 500.0)
        t0 = pd.Timestamp(setup["t0_utc"])
        t0_utc = t0.to_pydatetime().replace(tzinfo=timezone.utc)
        series = weather.fetch_era5land_historical(
            lat=setup["ignition_lat_lon"][0], lon=setup["ignition_lat_lon"][1],
            start_utc=t0_utc, hours=setup["weather_rows_hours"], incident_id=iid,
        )
        arrays = {}
        incident_records = []
        for horizon in (6, 12, *HORIZONS):
            # Reuse exactly the fair-rescore helper for frozen A and B, not a reimplementation.
            fair_maps = rescore_fair.blurred_baseline(iid, horizon, 500.0)
            end = (t0 + pd.Timedelta(hours=horizon)).to_pydatetime().replace(tzinfo=timezone.utc)
            mean_speed = series.mean_speed(t0_utc, end)
            bearing_to = series.mean_vector_bearing(t0_utc, end)
            time_only = variants.time_only_map(dx, dy, horizon, jitter_x, jitter_y)
            parity_wind = variants.frozen_wind_map(dx, dy, horizon, jitter_x, jitter_y, mean_speed, bearing_to)
            bearing_fixed, bearing_mode = variants.time_wind_map(
                dx, dy, horizon, jitter_x, jitter_y, mean_speed, (bearing_to - 180.0) % 360.0,
            )
            if not np.allclose(parity_wind, fair_maps["b_blurred"], rtol=0, atol=5e-14):
                raise AssertionError(f"new parity arm diverges from frozen baseline B for {iid} h={horizon}")
            maps = {
                "baseline_a": fair_maps["a_blurred"],
                "baseline_b": fair_maps["b_blurred"],
                "time_only": time_only,
                "time_wind_frozen_b": parity_wind,
                "wind_directional_asymmetric": bearing_fixed,
            }
            if horizon in HORIZONS:
                engine = engine_maps[horizon]
                maps["cell2fire"] = engine
                mask_idx = [i for i, overpass in enumerate(setup["overpasses_used"]) if overpass["hours_since_t0"] <= horizon]
                if not mask_idx:
                    raise ValueError(f"expected scorable horizon {horizon} has no valid observed mask for {iid}")
                mask = observed["obs_nh"][max(mask_idx)]
                by_variant = {name: score_map(prob, mask) for name, prob in maps.items()}
                official_cell = official_cells[(iid, horizon)]
                # Protect exact official reference values and the frozen protocol score.
                for key, variant_key in (("ap_baseline_a_blurred", "baseline_a"), ("ap_baseline_b_blurred", "baseline_b"), ("ap_engine", "cell2fire")):
                    if not np.isclose(by_variant[variant_key]["ap"], official_cell[key], rtol=0, atol=2e-14):
                        raise AssertionError(f"official AP changed for {iid} h={horizon} {key}")
                for key, variant_key in (("brier_baseline_a_blurred", "baseline_a"), ("brier_baseline_b_blurred", "baseline_b"), ("brier_engine", "cell2fire")):
                    if not np.isclose(by_variant[variant_key]["brier"], official_cell[key], rtol=0, atol=2e-14):
                        raise AssertionError(f"official Brier changed for {iid} h={horizon} {key}")

                best_frozen_ap = max(by_variant["baseline_a"]["ap"], by_variant["baseline_b"]["ap"])
                comparisons = {}
                for name, metrics in by_variant.items():
                    delta = metrics["ap"] - best_frozen_ap
                    comparisons[name] = {
                        "delta_ap_vs_best_frozen_baseline": float(delta),
                        "decision_vs_frozen_baselines": "WIN" if delta >= MARGIN else ("LOSS" if delta <= -MARGIN else "TIE"),
                        "delta_ap_vs_cell2fire": float(metrics["ap"] - by_variant["cell2fire"]["ap"]),
                    }
                row = {
                    "incident_id": iid, "horizon_h": horizon,
                    "observation_hours_since_t0": max(setup["overpasses_used"][k]["hours_since_t0"] for k in mask_idx),
                    "wind_mean_speed_ms": float(mean_speed), "wind_mean_to_bearing_deg": float(bearing_to),
                    "wind_bearing_fixed_variant_mode": bearing_mode,
                    "variants": by_variant, "comparisons": comparisons,
                }
                records.append(row)
                incident_records.append(row)
            for name, probability in maps.items():
                if horizon in HORIZONS:
                    arrays[f"{name}_h{horizon}"] = np.asarray(probability, dtype=np.float32)
        np.savez_compressed(output / f"{iid}_prediction_maps.npz", **arrays)
        (output / f"{iid}.json").write_text(json.dumps(incident_records, indent=2) + "\n")
        provenance_paths[f"weather_{iid}"] = WEBSITE / "data/resq2" / iid / "weather_era5land_native_wind.csv"
        provenance_paths[f"observed_inputs_{iid}"] = WEBSITE / "data/resq2" / iid / "viirs_detections.csv"
        provenance_paths[f"member_grid_manifest_{iid}"] = SOURCE / "member_grids" / iid / "manifest.json"
        for entry in member_manifest["members"]:
            path = (SOURCE / "member_grids" / iid / entry["file"]).resolve()
            provenance_paths[f"{iid}_member_{entry['member']:03d}"] = path

    # The actual detection source may be named differently per incident; hash the complete
    # small cached data directories to capture exactly what observed_arrays can consult.
    for iid in run_dev.SETUP:
        for path in sorted((WEBSITE / "data/resq2" / iid).glob("*")):
            if path.is_file():
                provenance_paths[f"data_resq2_{iid}_{path.name}"] = path
    missing = [str(path) for path in provenance_paths.values() if not path.is_file()]
    if missing:
        raise FileNotFoundError("experiment provenance inputs missing: " + ", ".join(missing))

    config = {
        "purpose": "development-only spatial baseline diagnostics; not an official gate rerun",
        "forecast_features_only": ["ignition coordinates", "forecast horizon", "wind speed/direction through horizon"],
        "label_inputs_used_only_for_scoring": True,
        "jitter": {"members": 60, "radius_m": 500.0, "seed": "per incident frozen protocol jitter_seed"},
        "jitter_seed_by_incident": {iid: int(info["jitter_seed"]) for iid, info in run_dev.SETUP.items()},
        "variants": {
            "baseline_a": "frozen exp(-distance/1000m), fair-blurred using protocol jitter",
            "baseline_b": "frozen protocol time-and-wind ellipse; unmodified and fair-blurred",
            "cell2fire": "mean of saved exact-horizon Boolean member grids; no simulator rerun",
            "time_only": {"formula": "mean_j exp(-distance_j / L(h))", "L_h": "1000m * h/12h", "wind": "ignored"},
            "time_wind_frozen_b": "independent implementation parity check of unchanged frozen Baseline B; not a novel formula",
                "wind_directional_asymmetric": {"formula": "one-sided downwind decay; upwind/crosswind scale L", "L_h": "1000m * h/12h", "Ldown": "L * (1 + 1.0 per m/s * mean wind speed)", "justification": "uses Baseline B's frozen elongation coefficient but applies it only downwind; separates directionality from the frozen centered, 180-degree-symmetric ellipse"},
        },
        "support_threshold_probability": 0.05,
        "decision_margin_ap": MARGIN,
        "decision_reference": "better AP of frozen Baseline A/B only; experimental comparisons do not change official gate",
        "scorable_horizons_h": [24, 48],
        "incident_ids": list(run_dev.SETUP),
    }
    (output / "baseline_config.json").write_text(json.dumps(config, indent=2) + "\n")

    variants_for_aggregate = {}
    for name in VARIANT_NAMES:
        for metric in ("ap", "brier", "roc_auc", "observed_mask_probability_capture", "support_area_km2_p_ge_0_05"):
            values = [row["variants"][name][metric] for row in records if row["variants"][name][metric] is not None]
            variants_for_aggregate.setdefault(name, {})[metric] = float(np.mean(values)) if values else None
    aggregate = {
        "descriptive_unpooled_arithmetic_means_over_8_cells": variants_for_aggregate,
        "cell_count": len(records),
        "frozen_gate_status": "unchanged; official engine remains 0 wins, 1 tie, 7 losses",
        "experimental_variant_calls_against_best_frozen_baseline": {
            name: {call: sum(r["comparisons"][name]["decision_vs_frozen_baselines"] == call for r in records) for call in ("WIN", "TIE", "LOSS")}
            for name in ("time_only", "time_wind_frozen_b", "wind_directional_asymmetric", "cell2fire")
        },
    }
    (output / "scores.json").write_text(json.dumps({"cells": records, "aggregate": aggregate}, indent=2) + "\n")

    hashes = {label: {"path": str(path), "sha256": sha256(path)} for label, path in provenance_paths.items()}
    provenance = {
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "command": f"backend/.venv/bin/python scripts/resq6/score_time_wind_baselines.py --output-dir {output.relative_to(WEBSITE)}",
        "code_and_input_hashes": hashes,
        "source_member_grid_dir": str(SOURCE),
        "official_score_reference": str(OFFICIAL),
        "official_score_reproduction": "all scorable official AP/Brier values matched within absolute tolerance 2e-14",
        "reference_artifact_source_hash_status": reference_hash_status,
        "held_out_data_accessed": False,
        "cell2fire_rerun": False,
    }
    (output / "provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")

    lines = ["# RESQ6 development-only time/wind baseline comparison", "", "Eight scorable development cells; descriptive per-cell results only. No fitting or held-out evaluation.", "", "| Incident | h | Model | AP | Brier | ROC-AUC | Capture | p≥0.05 area km² | ΔAP vs best frozen | ΔAP vs Cell2Fire | Call |", "|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---|"]
    source_mismatches = [name for name, item in reference_hash_status.items() if item["matches_current_file"] is False]
    if source_mismatches:
        lines[2:2] = [
            "", "Provenance caveat: archived source hashes differ from the current working copies of "
            + ", ".join(f"`{name}`" for name in source_mismatches)
            + ". Cached input hashes, engine/baseline/weather source hashes, member archive checksums, and all official AP/Brier scores were validated/reproduced; the archived orchestration source bytes are not present here.", "",
        ]
    for row in records:
        for name in VARIANT_NAMES:
            m = row["variants"][name]
            c = row["comparisons"][name]
            lines.append(f"| {row['incident_id']} | {row['horizon_h']} | {name} | {m['ap']:.6f} | {m['brier']:.6f} | {m['roc_auc']:.6f} | {m['observed_mask_probability_capture']:.4f} | {m['support_area_km2_p_ge_0_05']:.3f} | {c['delta_ap_vs_best_frozen_baseline']:+.6f} | {c['delta_ap_vs_cell2fire']:+.6f} | {c['decision_vs_frozen_baselines']} |")
    lines.extend(["", "## Descriptive means", "", "| Model | AP | Brier | ROC-AUC | Capture | p≥0.05 km² |", "|---|---:|---:|---:|---:|---:|"])
    for name, metrics in variants_for_aggregate.items():
        lines.append(f"| {name} | {metrics['ap']:.6f} | {metrics['brier']:.6f} | {metrics['roc_auc']:.6f} | {metrics['observed_mask_probability_capture']:.4f} | {metrics['support_area_km2_p_ge_0_05']:.3f} |")
    (output / "report.md").write_text("\n".join(lines) + "\n")
    (output / "output_sha256.json").write_text(json.dumps({
        path.name: sha256(path) for path in sorted(output.iterdir()) if path.is_file()
    }, indent=2) + "\n")
    return aggregate


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    output = args.output_dir if args.output_dir.is_absolute() else WEBSITE / args.output_dir
    print(json.dumps(run(output.resolve()), indent=2))


if __name__ == "__main__":
    main()

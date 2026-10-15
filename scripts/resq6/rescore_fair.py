"""Fair-score RESQ-6 Step 2a, development set only.

Default mode retains the historical summary-file rescoring behavior. Supplying
``--member-grid-dir`` instead validates and scores the saved per-member grids,
allowing the exact-horizon development run to be fairly compared without
re-running Cell2Fire. Baselines receive the same seeded ignition-jitter blur
as the engine ensemble. No tuning or held-out data access occurs here.
"""
from __future__ import annotations

import json
import argparse
import hashlib
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score

WEBSITE = Path(__file__).resolve().parents[2]
for p in ("backend/inference", "scripts/resq5", "scripts/resq3", "scripts/resq6"):
    sys.path.insert(0, str(WEBSITE / p))

from engine import baseline as ebaseline  # noqa: E402
from engine import weather as eweather  # noqa: E402
import analyze as resq5_analyze  # noqa: E402
import run_dev as rd  # noqa: E402  (reuses ignition_jitter() and SETUP, no simulator calls)

MARGIN = 0.05  # DECISION_RULE.md, unchanged
HORIZONS_H = rd.HORIZONS_H
N_JITTER = 60  # matches the engine ensemble's own size exactly, for a like-for-like blur


def blurred_baseline(iid: str, horizon_h: int, jitter_radius_m: float = rd.JITTER_RADIUS_M) -> dict:
    s = rd.SETUP[iid]
    d = s["domain"]
    n = d["cells_per_side"]
    ci_ = (np.arange(n) + 0.5) * rd.CELL
    xc = d["west_m"] + ci_[None, :] + np.zeros((n, 1))
    yc = d["north_m"] - ci_[:, None] + np.zeros((1, n))

    dxj, dyj = rd.ignition_jitter(s["jitter_seed"], N_JITTER, jitter_radius_m)

    t0 = pd.Timestamp(s["t0_utc"])
    series = eweather.fetch_era5land_historical(
        lat=s["ignition_lat_lon"][0], lon=s["ignition_lat_lon"][1],
        start_utc=t0.to_pydatetime().replace(tzinfo=__import__("datetime").timezone.utc),
        hours=s["weather_rows_hours"], incident_id=iid,
    )
    t0_dt = t0.to_pydatetime().replace(tzinfo=__import__("datetime").timezone.utc)
    t_end = (t0 + pd.Timedelta(hours=horizon_h)).to_pydatetime().replace(tzinfo=__import__("datetime").timezone.utc)
    v_mean = series.mean_speed(t0_dt, t_end)
    bearing = series.mean_vector_bearing(t0_dt, t_end)

    ign = np.array(s["ignition_utm_m"])
    p_a_sum = np.zeros((n, n))
    p_b_sum = np.zeros((n, n))
    for j in range(N_JITTER):
        jx, jy = ign[0] + dxj[j], ign[1] + dyj[j]
        dx_cells, dy_cells = xc - jx, yc - jy
        dist = np.hypot(dx_cells, dy_cells)
        p_a_sum += ebaseline.proximity(dist)
        d_down, d_cross = ebaseline.downwind_crosswind_offsets(dx_cells, dy_cells, bearing)
        p_b_sum += ebaseline.wind_elongated_proximity(d_down, d_cross, horizon_h, v_mean)
    return {"a_blurred": p_a_sum / N_JITTER, "b_blurred": p_b_sum / N_JITTER}


def score(p: np.ndarray, obs: np.ndarray) -> dict:
    if obs.min() == obs.max():
        return {"ap": None, "brier": None}
    y = obs.ravel().astype(int)
    return {"ap": float(average_precision_score(y, p.ravel())), "brier": float(np.mean((p.ravel() - y) ** 2))}


def obs_at_horizon(used, oa, h):
    idx = [k for k, pp in enumerate(used) if pp["hours_since_t0"] <= h]
    return None if not idx else oa["obs_nh"][max(idx)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--member-grid-dir", type=Path,
        help="Score engine predictions from a saved member-grid run instead of frozen legacy summaries",
    )
    parser.add_argument("--output", type=Path, help="Write the report here (defaults to the selected run directory)")
    parser.add_argument(
        "--baseline-jitter-radius-m", type=float, default=rd.JITTER_RADIUS_M,
        help="Match baseline ignition blur to the scored engine arm (0 or 500 m for the controlled ablation)",
    )
    args = parser.parse_args()
    if not np.isfinite(args.baseline_jitter_radius_m) or not 0 <= args.baseline_jitter_radius_m <= rd.JITTER_RADIUS_M:
        parser.error(f"--baseline-jitter-radius-m must be between 0 and {rd.JITTER_RADIUS_M:g}")
    grid_root = args.member_grid_dir
    if grid_root is not None and not grid_root.is_absolute():
        grid_root = (WEBSITE / grid_root).resolve()
    output_path = args.output
    if output_path is None:
        output_path = (grid_root if grid_root is not None else WEBSITE / "results/resq6/dev") / "fair_rescore.json"
    elif not output_path.is_absolute():
        output_path = (WEBSITE / output_path).resolve()

    frozen = {}
    if grid_root is None:
        for iid in rd.SETUP:
            frozen[iid] = json.loads((WEBSITE / "results/resq6/dev" / f"{iid}.json").read_text())

    report = []
    wins = losses = ties = 0
    for iid in rd.SETUP:
        s = rd.SETUP[iid]
        used = s["overpasses_used"]
        oa = resq5_analyze.observed_arrays(iid)
        if grid_root is not None:
            manifest_path = grid_root / "member_grids" / iid / "manifest.json"
            manifest = json.loads(manifest_path.read_text())
            if float(manifest.get("ignition_jitter_radius_m", -1)) != args.baseline_jitter_radius_m:
                raise ValueError(
                    f"baseline jitter radius {args.baseline_jitter_radius_m} m does not match "
                    f"engine arm manifest for {iid}"
                )
            members = []
            for entry in manifest["members"]:
                archive = manifest_path.parent / entry["file"]
                digest = hashlib.sha256(archive.read_bytes()).hexdigest()
                if digest != entry["sha256"]:
                    raise ValueError(f"member archive checksum mismatch: {archive}")
                if any(int(entry["source_frame_hours"][str(h)]) != h for h in HORIZONS_H):
                    raise ValueError(f"non-exact source frame in {archive}")
                members.append(np.load(archive, allow_pickle=False))
            if len(members) != manifest["members_saved"] or not members:
                raise ValueError(f"incomplete member set for {iid}")
            horizons = [{"horizon_h": h, "scorable": obs_at_horizon(used, oa, h) is not None} for h in HORIZONS_H]
        else:
            frozen_result = frozen[iid]
            horizons = frozen_result["horizons"]
            members = None
        for h_entry in horizons:
            h = h_entry["horizon_h"]
            if not h_entry["scorable"]:
                report.append({"incident_id": iid, "horizon_h": h, "scorable": False})
                continue
            obs = obs_at_horizon(used, oa, h)
            blurred = blurred_baseline(iid, h, args.baseline_jitter_radius_m)
            score_a = score(blurred["a_blurred"], obs)
            score_b = score(blurred["b_blurred"], obs)
            if members is None:
                ap_engine = h_entry["engine"]["ap"]
                brier_engine = h_entry["engine"]["brier"]
            else:
                p_engine = np.mean([archive[f"hour_{h:02d}"] for archive in members], axis=0)
                engine_score = score(p_engine, obs)
                ap_engine = engine_score["ap"]
                brier_engine = engine_score["brier"]
            best_fair_baseline_ap = max(score_a["ap"], score_b["ap"])
            delta = ap_engine - best_fair_baseline_ap
            call = "WIN" if delta >= MARGIN else ("LOSS" if delta <= -MARGIN else "TIE")
            if call == "WIN":
                wins += 1
            elif call == "LOSS":
                losses += 1
            else:
                ties += 1
            report.append({
                "incident_id": iid, "horizon_h": h, "scorable": True,
                "ap_engine": ap_engine,
                "ap_baseline_a_blurred": score_a["ap"], "ap_baseline_b_blurred": score_b["ap"],
                "brier_engine": brier_engine,
                "brier_baseline_a_blurred": score_a["brier"], "brier_baseline_b_blurred": score_b["brier"],
                "delta_vs_best_fair_baseline": delta, "call": call,
            })
            print(f"{iid} h={h:>2}h  AP engine={ap_engine:.3f}  a_blurred={score_a['ap']:.3f}  b_blurred={score_b['ap']:.3f}  -> {call} (delta={delta:+.3f})", flush=True)

    out = {
        "margin": MARGIN,
        "baseline_jitter_radius_m": args.baseline_jitter_radius_m,
        "n_jitter_for_blur": N_JITTER,
        "wins": wins, "losses": losses, "ties": ties, "cells": report,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(out, indent=2, default=str))
    scorable = wins + losses + ties
    gate_pass = (wins + ties) >= 6 and scorable >= 1
    print(f"\nFair scoring: {wins} wins, {ties} ties, {losses} losses of {scorable} scorable cells.")
    print("GATE:", "PASS" if gate_pass else "FAIL", f"(need wins+ties >= 6 of 8; got {wins + ties})")


if __name__ == "__main__":
    main()

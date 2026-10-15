"""RESQ-6 Step 4: evaluate the actual wind-elongated ellipse endpoint formula
on the 4 development incidents, development set only.

The live endpoint (`backend/inference/engine/spread_ellipse.py`) computes:

    p = mean over N members of wind_elongated_proximity(member_ignition, member_wind)

where each member applies:
  - ignition-position jitter (±500 m uniform disk, same seed scheme as run_dev.py)
  - wind perturbation  (speed ×U(0.7,1.3), direction +N(0°,15°), same as run_dev.py)

This script evaluates that *same* formula on the established 388×388, 30 m,
EPSG:32644 development domain, using the same ground-truth VIIRS arrays and
the same AP + ±0.05-margin win/loss/tie rule from docs/simulation/DECISION_RULE.md.

Key differences from the Cell2Fire evaluation (results/resq6/dev/*.json):
  - No Cell2Fire, no simulator, no subprocess.
  - Wind perturbation IS applied here (both jitter + wind noise), because the
    live endpoint applies both.  rescore_fair.py applied only ignition jitter
    (no wind perturbation) to the baselines.
  - Grid is the established 388×388 development domain, not the auto-sized
    ellipse grid — required for a like-for-like AP comparison against the
    stored ground truth.

The proximity baseline (a) is re-scored here with the same ignition-jitter
only (no wind perturbation) for a direct comparison on the identical domain
and seed set.  This matches rescore_fair.py's blurred_baseline() exactly.

Seeds:
  - Ignition jitter: per-incident seed from protocol_setup.json["jitter_seed"]
    (same as run_dev.py and rescore_fair.py — no new seed chosen here).
  - Wind perturbation RNG: seeded from jitter_seed + horizon_h so that
    results are deterministic and reproducible but vary across cells.

N_MEMBERS = 60 (matches the frozen ensemble size from PROTOCOL.md Amendment 1
and spread_ellipse.py's own constant).

Output: results/resq6/dev/ellipse_eval.json
"""
from __future__ import annotations

import json
import sys
from datetime import timezone
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score

WEBSITE = Path(__file__).resolve().parents[2]
for p in ("backend/inference", "scripts/resq5", "scripts/resq3", "scripts/resq6"):
    sys.path.insert(0, str(WEBSITE / p))

from engine import baseline as ebaseline          # noqa: E402
from engine import weather as eweather            # noqa: E402
import analyze as resq5_analyze                   # noqa: E402
import run_dev as rd                              # noqa: E402  (ignition_jitter, perturb_wind, SETUP, CELL)

MARGIN      = 0.05          # DECISION_RULE.md — unchanged
HORIZONS_H  = rd.HORIZONS_H  # [6, 12, 24, 48]
N_MEMBERS   = 60            # PROTOCOL.md Amendment 1; matches spread_ellipse.py
RESULTS_DIR = WEBSITE / "results/resq6/dev"

# Wind perturbation parameters — MUST match spread_ellipse.py constants exactly.
WIND_SPEED_JITTER      = (0.7, 1.3)   # spread_ellipse.WIND_SPEED_JITTER
WIND_DIR_JITTER_SD_DEG = 15.0         # spread_ellipse.WIND_DIR_JITTER_SD_DEG


def _build_domain_grid(s: dict) -> tuple[np.ndarray, np.ndarray]:
    """Return (xc, yc) cell-centre arrays on the established 388×388 domain."""
    d   = s["domain"]
    n   = d["cells_per_side"]
    ci  = (np.arange(n) + 0.5) * rd.CELL
    xc  = d["west_m"]  + ci[None, :] + np.zeros((n, 1))
    yc  = d["north_m"] - ci[:, None] + np.zeros((1, n))
    return xc, yc


def _obs_at_horizon(used: list, oa: dict, h: int) -> np.ndarray | None:
    """Latest overpass at or before horizon h, same logic as run_dev.py."""
    idx = [k for k, p in enumerate(used) if p["hours_since_t0"] <= h]
    return None if not idx else oa["obs_nh"][max(idx)]


def score_arrays(p: np.ndarray, obs: np.ndarray) -> dict:
    if obs.min() == obs.max():
        return {"ap": None, "brier": None}
    y = obs.ravel().astype(int)
    return {
        "ap":    float(average_precision_score(y, p.ravel())),
        "brier": float(np.mean((p.ravel() - y) ** 2)),
    }


def evaluate_incident(iid: str) -> list[dict]:
    s    = rd.SETUP[iid]
    used = s["overpasses_used"]
    oa   = resq5_analyze.observed_arrays(iid)
    xc, yc = _build_domain_grid(s)
    ign  = np.array(s["ignition_utm_m"])

    # ignition jitter offsets — same seed and method as run_dev.py / rescore_fair.py
    dxj, dyj = rd.ignition_jitter(s["jitter_seed"], N_MEMBERS)

    # proximity (baseline-a) blurred with ignition jitter only (no wind perturbation)
    # exactly as rescore_fair.py's blurred_baseline() produces, so the comparison is identical.
    dist_sum_a = np.zeros_like(xc)
    for j in range(N_MEMBERS):
        jx, jy = ign[0] + dxj[j], ign[1] + dyj[j]
        dist = np.hypot(xc - jx, yc - jy)
        dist_sum_a += ebaseline.proximity(dist)
    p_a_blurred = dist_sum_a / N_MEMBERS

    rows = []
    for h in HORIZONS_H:
        obs = _obs_at_horizon(used, oa, h)
        if obs is None:
            rows.append({"horizon_h": h, "scorable": False})
            continue

        # ── fetch wind ──────────────────────────────────────────────────────
        t0  = pd.Timestamp(s["t0_utc"]).to_pydatetime().replace(tzinfo=timezone.utc)
        t_end = (pd.Timestamp(s["t0_utc"]) + pd.Timedelta(hours=h)).to_pydatetime().replace(tzinfo=timezone.utc)
        series = eweather.fetch_era5land_historical(
            lat=s["ignition_lat_lon"][0], lon=s["ignition_lat_lon"][1],
            start_utc=t0, hours=s["weather_rows_hours"], incident_id=iid,
        )
        v_mean  = series.mean_speed(t0, t_end)
        bearing = series.mean_vector_bearing(t0, t_end)

        # ── ellipse: jitter + wind perturbation ─────────────────────────────
        # Seed: jitter_seed XOR (horizon_h << 16) — deterministic, varies per cell,
        # never reuses the jitter-only RNG so the two are independent.
        wind_rng = np.random.default_rng(s["jitter_seed"] ^ (h << 16))
        p_ellipse_sum = np.zeros_like(xc)
        for j in range(N_MEMBERS):
            jx, jy = ign[0] + dxj[j], ign[1] + dyj[j]
            # perturb_wind applies one scalar speed factor and one direction offset
            # per member — identical to spread_ellipse._perturb_wind():
            speed_factor = wind_rng.uniform(*WIND_SPEED_JITTER)
            dir_offset   = wind_rng.normal(0.0, WIND_DIR_JITTER_SD_DEG)
            m_speed   = v_mean  * speed_factor
            m_bearing = (bearing + dir_offset) % 360.0
            d_down, d_cross = ebaseline.downwind_crosswind_offsets(
                xc - jx, yc - jy, m_bearing
            )
            p_ellipse_sum += ebaseline.wind_elongated_proximity(
                d_down, d_cross, h, m_speed
            )
        p_ellipse = p_ellipse_sum / N_MEMBERS

        # ── score both ──────────────────────────────────────────────────────
        sc_ellipse = score_arrays(p_ellipse, obs)
        sc_a       = score_arrays(p_a_blurred, obs)

        ap_ell = sc_ellipse["ap"]
        ap_a   = sc_a["ap"]
        delta  = ap_ell - ap_a
        call   = "WIN" if delta >= MARGIN else ("LOSS" if delta <= -MARGIN else "TIE")

        rows.append({
            "horizon_h":            h,
            "scorable":             True,
            "obs_cells":            int(obs.sum()),
            "ap_ellipse":           ap_ell,
            "ap_baseline_a_blurred": ap_a,
            "brier_ellipse":        sc_ellipse["brier"],
            "brier_baseline_a_blurred": sc_a["brier"],
            "wind_mean_speed_ms":   round(v_mean,  3),
            "wind_to_bearing_deg":  round(bearing, 1),
            "delta_ellipse_vs_a":   round(delta,   4),
            "call":                 call,
        })
        print(
            f"  {iid} h={h:>2}h  "
            f"AP ellipse={ap_ell:.4f}  AP a_blurred={ap_a:.4f}  "
            f"delta={delta:+.4f}  -> {call}",
            flush=True,
        )
    return rows


def main() -> None:
    wins = losses = ties = 0
    all_cells: list[dict] = []

    for iid in rd.SETUP:
        print(f"=== {iid} ===", flush=True)
        rows = evaluate_incident(iid)
        for r in rows:
            if r["scorable"]:
                if r["call"] == "WIN":
                    wins += 1
                elif r["call"] == "LOSS":
                    losses += 1
                else:
                    ties += 1
            all_cells.append({"incident_id": iid, **r})

    scorable = wins + losses + ties
    gate_pass = (wins + ties) >= 6 and scorable >= 1
    print(
        f"\nEllipse vs proximity (jitter-blurred): "
        f"{wins}W  {ties}T  {losses}L  of {scorable} scorable cells",
        flush=True,
    )
    print("GATE:", "PASS" if gate_pass else "FAIL",
          f"(need wins+ties >= 6 of 8; got {wins + ties})")

    out = {
        "description": (
            "Ellipse endpoint formula (wind_elongated_proximity + ignition jitter "
            "+ wind perturbation, 60 members) scored against jitter-blurred "
            "proximity baseline on the 388×388 development domain. "
            "Margin=0.05. Primary metric=AP. "
            "No Cell2Fire. No new incidents. No test-set data."
        ),
        "n_members":    N_MEMBERS,
        "margin":       MARGIN,
        "jitter_radius_m": 500.0,
        "wind_perturbation": {
            "speed_factor": "U(0.7, 1.3)",
            "dir_offset_sd_deg": WIND_DIR_JITTER_SD_DEG,
        },
        "wins":   wins,
        "losses": losses,
        "ties":   ties,
        "gate_pass": gate_pass,
        "cells":  all_cells,
    }
    out_path = RESULTS_DIR / "ellipse_eval.json"
    out_path.write_text(json.dumps(out, indent=2, default=str))
    print(f"\nResults written to {out_path}", flush=True)


if __name__ == "__main__":
    main()

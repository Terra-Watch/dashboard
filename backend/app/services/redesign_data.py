"""Read-only loaders for the redesign-v2 screens, sourced directly from repo data files.

Every number served here is read from `data/` or `results/` at request time (small
CSV/JSON files, cached in-process) rather than retyped into this file, so there is
no risk of a hand-transcribed number drifting from `docs/RESQ5_RESULTS.md`'s source
tables (see docs/redesign/06_simulation_ui.md's "no rounding beyond source" rule).
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parents[3]
RESQ5_PROTOCOL_STATES = {"OD", "CG", "TS", "MP", "MH", "JH"}

REPLAY_INCIDENTS: dict[str, dict] = {
    "E2023-084925": {"state": "OD", "label": "Similipal, Odisha — Mar 2023"},
    "E2024-131853": {"state": "TS", "label": "Telangana — Feb 2024"},
    "E2024-135332": {"state": "MH", "label": "Maharashtra — Mar 2024"},
    "E2024-155286": {"state": "CG", "label": "Chhattisgarh — 2024"},
}

BASELINE_LABELS = {
    "baseline_a_proximity": "Proximity (fire stays near the ignition point)",
    "baseline_b_circle_final_area": "Circle, final observed area (uses information only known after the fact)",
}
MODEL_LABELS = {
    "simulation:era5land_native": "Simulation (ERA5-Land, primary)",
    "simulation:era5_025": "Simulation (ERA5 0.25°, sensitivity)",
    "simulation:best_match": "Simulation (best_match, not a reanalysis, sensitivity)",
    "simulation:pooled": "Simulation (pooled 90 members, secondary)",
    **BASELINE_LABELS,
}


@lru_cache(maxsize=16)
def _metrics_csv(incident_id: str) -> pd.DataFrame:
    path = REPO_ROOT / "results" / "resq5" / incident_id / "metrics_by_overpass.csv"
    if not path.exists():
        raise FileNotFoundError(path)
    return pd.read_csv(path)


@lru_cache(maxsize=16)
def _viirs_csv(incident_id: str) -> pd.DataFrame:
    for data_root in ("data/resq2", "data/resq5"):
        path = REPO_ROOT / data_root / incident_id / "viirs_detections.csv"
        if path.exists():
            return pd.read_csv(path)
    raise FileNotFoundError(incident_id)


def list_detections() -> list[dict]:
    """The 4 replay incidents' earliest VIIRS detection, as sample-data triage items."""
    out = []
    for incident_id, meta in REPLAY_INCIDENTS.items():
        try:
            df = _viirs_csv(incident_id)
        except FileNotFoundError:
            continue
        row = df.iloc[0]
        out.append({
            "id": f"det-{incident_id}",
            "incident_id": incident_id,
            "source": "VIIRS",
            "state": meta["state"],
            "label": meta["label"],
            "detected_at": f"{row['acq_date']}T{str(int(row['acq_time'])).zfill(4)[:2]}:{str(int(row['acq_time'])).zfill(4)[2:]}:00Z",
            "confidence": {"l": "low", "n": "nominal", "h": "high"}.get(str(row.get("confidence", "n")).lower(), "nominal"),
            "lat": float(row["latitude"]),
            "lon": float(row["longitude"]),
            "frp": float(row.get("frp", 0.0)),
            "sample_data": True,
        })
    return out


def replay_for(incident_id: str) -> dict:
    if incident_id not in REPLAY_INCIDENTS:
        raise KeyError(incident_id)
    df = _metrics_csv(incident_id)
    obs_nh = df[df["reference"] == "obs_nh"].sort_values("overpass_k")

    def rows_for(model: str) -> list[dict]:
        sub = obs_nh[obs_nh["model"] == model]
        return [
            {
                "overpass_k": int(r.overpass_k),
                "time_utc": r.time_utc,
                "hours_since_t0": float(r.hours_since_t0),
                "auc": None if pd.isna(r.auc) else round(float(r.auc), 3),
                "ap": None if pd.isna(r.ap) else round(float(r.ap), 3),
                "iou": None if pd.isna(r.iou) else round(float(r.iou), 3),
                "precision": None if pd.isna(r.precision) else round(float(r.precision), 3),
                "recall": None if pd.isna(r.recall) else round(float(r.recall), 3),
                "area_ratio": None if pd.isna(r.area_ratio) else round(float(r.area_ratio), 3),
                "sim_cells": int(r.sim_cells),
                "obs_cells": int(r.obs_cells),
            }
            for r in sub.itertuples()
        ]

    models_present = sorted(obs_nh["model"].unique().tolist())
    last_k = int(obs_nh["overpass_k"].max())
    last = obs_nh[obs_nh["overpass_k"] == last_k]

    def last_value(model: str, field: str) -> float | None:
        matched = last[last["model"] == model]
        if matched.empty:
            return None
        value = matched.iloc[0][field]
        return None if pd.isna(value) else round(float(value), 3)

    headline = {
        "last_overpass_k": last_k,
        "auc": {model: last_value(model, "auc") for model in models_present},
        "ap": {model: last_value(model, "ap") for model in models_present},
        "iou": {model: last_value(model, "iou") for model in models_present},
    }

    return {
        "incident_id": incident_id,
        "state": REPLAY_INCIDENTS[incident_id]["state"],
        "label": REPLAY_INCIDENTS[incident_id]["label"],
        "sample_data": True,
        "development_incident": True,
        "model_labels": {m: MODEL_LABELS.get(m, m) for m in models_present},
        "series": {model: rows_for(model) for model in models_present},
        "headline_last_overpass": headline,
        "source": f"results/resq5/{incident_id}/metrics_by_overpass.csv (reference=obs_nh, nominal+high confidence, protocol primary per RESQ5_PROTOCOL.md §2)",
    }


def cross_incident_win_counts() -> dict:
    """Recomputed at request time from the per-incident CSVs — not hand-transcribed.

    Mirrors the method in docs/redesign/06_simulation_ui.md: at each incident's last
    overpass, does the primary simulation (era5land_native) beat each baseline on
    AUC/AP/IoU?
    """
    sim_model = "simulation:era5land_native"
    counts = {
        "auc_vs_proximity": 0, "ap_vs_proximity": 0, "ap_vs_circle": 0,
        "iou_vs_proximity": 0, "iou_vs_circle": 0,
    }
    per_incident = {}
    for incident_id in REPLAY_INCIDENTS:
        try:
            df = _metrics_csv(incident_id)
        except FileNotFoundError:
            continue
        obs_nh = df[df["reference"] == "obs_nh"]
        last_k = int(obs_nh["overpass_k"].max())
        last = obs_nh[obs_nh["overpass_k"] == last_k]

        def val(model: str, field: str) -> float | None:
            matched = last[last["model"] == model]
            if matched.empty or pd.isna(matched.iloc[0][field]):
                return None
            return float(matched.iloc[0][field])

        sim_auc, prox_auc = val(sim_model, "auc"), val("baseline_a_proximity", "auc")
        sim_ap, prox_ap, circ_ap = val(sim_model, "ap"), val("baseline_a_proximity", "ap"), val("baseline_b_circle_final_area", "ap")
        sim_iou, prox_iou, circ_iou = val(sim_model, "iou"), val("baseline_a_proximity", "iou"), val("baseline_b_circle_final_area", "iou")

        wins = {
            "auc_vs_proximity": sim_auc is not None and prox_auc is not None and sim_auc > prox_auc,
            "ap_vs_proximity": sim_ap is not None and prox_ap is not None and sim_ap > prox_ap,
            "ap_vs_circle": sim_ap is not None and circ_ap is not None and sim_ap > circ_ap,
            "iou_vs_proximity": sim_iou is not None and prox_iou is not None and sim_iou > prox_iou,
            "iou_vs_circle": sim_iou is not None and circ_iou is not None and sim_iou > circ_iou,
        }
        per_incident[incident_id] = wins
        for key, won in wins.items():
            counts[key] += int(won)
    return {"wins_out_of_4": counts, "per_incident": per_incident, "n_incidents": len(REPLAY_INCIDENTS)}

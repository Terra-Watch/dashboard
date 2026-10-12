"""Endpoints for the redesign-v2 screens (Watch, Incident scenario, Replay, Field).

Kept separate from `operations.py`/`risk.py` only by file, not by app — this is the
same FastAPI app (`main.py` includes this router alongside the existing ones), per
the Gate 1 decision to extend the existing backend rather than stand up a new
service. See docs/redesign/10_backend_contract.md.

Everything here is explicitly sample/demo data: the 4 RESQ-5 replay incidents.
Live FIRMS ingestion does not exist (docs/redesign/00_audit.md) so this is the
only data Watch/Incident/Replay/Field can show; every response says so.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..services import redesign_data, redesign_store

router = APIRouter(prefix="/api/redesign", tags=["redesign"])

REPO_ROOT = Path(__file__).resolve().parents[3]
WIND_SOURCES = {
    "era5land_native": "ERA5-Land (primary)",
    "era5_025": "ERA5 0.25° (sensitivity)",
    "best_match": "best_match (not a reanalysis, sensitivity)",
}


# ---------- Watch (detection triage) ----------

@router.get("/detections")
def list_detections() -> dict:
    detections = redesign_data.list_detections()
    status_by_id = redesign_store.latest_status_by_detection()
    for item in detections:
        status = status_by_id.get(item["id"])
        item["status"] = status["action"] if status else "new"
    return {"sample_data": True, "note": "The 4 replay incidents' VIIRS detections, not a live feed.", "items": detections}


class TriageActionRequest(BaseModel):
    action: str  # verify | dismiss | escalate
    role: str
    device_id: str


@router.post("/detections/{detection_id}/actions")
def act_on_detection(detection_id: str, body: TriageActionRequest) -> dict:
    if body.action not in ("verify", "dismiss", "escalate"):
        raise HTTPException(status_code=400, detail="action must be verify, dismiss or escalate")
    row = redesign_store.record_triage_action(detection_id, body.action, body.role, body.device_id)
    return {"ok": True, "action": row}


@router.get("/detections/{detection_id}/history")
def detection_history(detection_id: str) -> dict:
    return {"detection_id": detection_id, "history": redesign_store.list_triage_history(detection_id)}


# ---------- Incident scenario (precomputed replay ensembles, per wind source) ----------

def _downsampled_bands(incident_id: str, wind_source: str, overpass_k: int, stride: int = 4) -> list[list[int]]:
    """4-band probability classification (0..3), downsampled by `stride` for a compact payload."""
    path = REPO_ROOT / "results" / "resq5" / incident_id / f"burn_count_{wind_source}.npz"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"no precomputed ensemble for {wind_source}")
    data = np.load(path)
    key = f"k{overpass_k}"
    if key not in data.files:
        raise HTTPException(status_code=404, detail=f"no overpass {overpass_k} for {incident_id}")
    counts = data[key].astype(float)
    members = float(data["members"])
    p = counts / members if members else counts * 0
    bands = np.digitize(p, bins=[0.2, 0.5, 0.8]).astype(int)  # 0:<20% 1:20-50% 2:50-80% 3:80-100%
    small = bands[::stride, ::stride]
    return small.tolist()


@router.get("/incidents/{incident_id}/scenario")
def incident_scenario(incident_id: str, wind_source: str = "era5land_native", overpass_k: int = 0) -> dict:
    if incident_id not in redesign_data.REPLAY_INCIDENTS:
        raise HTTPException(status_code=404, detail="unknown incident")
    if wind_source not in WIND_SOURCES:
        raise HTTPException(status_code=400, detail=f"wind_source must be one of {list(WIND_SOURCES)}")
    bands = _downsampled_bands(incident_id, wind_source, overpass_k)
    replay = redesign_data.replay_for(incident_id)
    n_overpasses = len(replay["series"].get(f"simulation:{wind_source}", []))
    return {
        "incident_id": incident_id,
        "sample_data": True,
        "uncalibrated": True,
        "wind_source": wind_source,
        "wind_source_label": WIND_SOURCES[wind_source],
        "overpass_k": overpass_k,
        "overpass_count": n_overpasses,
        "probability_bands_grid": bands,
        "assumptions": {
            "fuel": "Fuel mapping INDIAN_RUNTIME is blocked; this run uses the RESQ-5 protocol's uncalibrated crosswalk (TL2 for tree cover, GR1 for grassland, all other classes non-burnable). See docs/RESQ5_PROTOCOL.md §4.",
            "weather": "Temperature fixed at 27°C and relative humidity at 40% by the simulator; wind is the only varying weather input.",
            "terrain": "Slope from Copernicus GLO-30 DEM; steepest-neighbour slope factor is capped, see per-incident summary.json.",
        },
        "baseline": {
            "proximity_label": redesign_data.BASELINE_LABELS["baseline_a_proximity"],
            "circle_label": redesign_data.BASELINE_LABELS["baseline_b_circle_final_area"],
            "visible_by_default": True,
        },
    }


# ---------- Replay / evidence ----------

@router.get("/replay/{incident_id}")
def replay(incident_id: str) -> dict:
    try:
        return redesign_data.replay_for(incident_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="unknown incident")


@router.get("/replay")
def replay_index() -> dict:
    counts = redesign_data.cross_incident_win_counts()
    return {
        "incidents": [
            {"incident_id": incident_id, **meta}
            for incident_id, meta in redesign_data.REPLAY_INCIDENTS.items()
        ],
        "development_incidents": True,
        "cross_incident_win_counts": counts,
        "source": "results/resq5/*/metrics_by_overpass.csv, recomputed at request time",
    }


# ---------- Field (offline queue, idempotency-keyed sync) ----------

class FieldReportRequest(BaseModel):
    idempotency_key: str
    task_id: str
    note: str = ""
    photo_name: str | None = None
    device_id: str
    captured_at: str


@router.post("/field/reports")
def submit_field_report(body: FieldReportRequest) -> dict:
    if not body.idempotency_key:
        raise HTTPException(status_code=400, detail="idempotency_key is required")
    row, created = redesign_store.upsert_field_report(
        body.idempotency_key, body.task_id, body.note, body.photo_name, body.device_id, body.captured_at
    )
    return {"created": created, "report": row}


@router.get("/field/reports")
def list_field_reports() -> dict:
    return {"items": redesign_store.list_field_reports()}


@router.get("/field/tasks")
def field_tasks() -> dict:
    """Verification tasks derived from today's triage queue: one per un-dismissed detection."""
    detections = redesign_data.list_detections()
    status_by_id = redesign_store.latest_status_by_detection()
    tasks = []
    for item in detections:
        status = status_by_id.get(item["id"])
        action = status["action"] if status else "new"
        if action == "dismiss":
            continue
        tasks.append({
            "task_id": item["id"],
            "incident_id": item["incident_id"],
            "label": item["label"],
            "lat": item["lat"],
            "lon": item["lon"],
            "status": action,
        })
    return {"sample_data": True, "items": tasks}

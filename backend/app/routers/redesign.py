"""Endpoints for the redesign-v2 screens (Watch, Incident scenario, Replay, Field).

Sample/demo data is explicitly labeled. Protected operations require authenticated redesign
tokens, role checks, and state/division geographic scope enforcement with fail-closed audit logging.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..core.config import INGEST_LIVE
from ..core.permissions import require_scope, user_scopes
from ..core.security import current_redesign_user, require_csrf, require_roles
from ..services import audit_log, redesign_data, redesign_store

router = APIRouter(prefix="/api/redesign", tags=["redesign"])

REPO_ROOT = Path(__file__).resolve().parents[3]
WIND_SOURCES = {
    "era5land_native": "ERA5-Land (primary)",
    "era5_025": "ERA5 0.25° (sensitivity)",
    "best_match": "best_match (not a reanalysis, sensitivity)",
}


# ---------- Watch (detection triage) ----------

@router.get("/detections")
def list_detections(
    user: dict = Depends(require_roles("range_officer", "control_room_operator", "incident_commander")),
) -> dict:
    detections = redesign_data.list_detections()
    status_by_id = redesign_store.latest_status_by_detection()
    for item in detections:
        status = status_by_id.get(item["id"])
        item["status"] = status["action"] if status else "new"
    if user["role"] != "admin":
        scopes = user_scopes(int(user["id"]))
        detections = [item for item in detections if item["state"] in scopes]
    return {
        "sample_data": True,
        "note": "The 4 replay incidents' VIIRS detections, a fixed sample set, not a real-time feed.",
        "items": detections,
    }


class TriageActionRequest(BaseModel):
    action: str  # verify | dismiss | escalate
    role: str
    device_id: str


def _live_authorization_not_ready() -> None:
    """Fail closed until the unresolved RESQ9 authorization decisions land.
    See docs/ingest/RESQ9_AUTH_DECISIONS_FOR_APPROVAL.md.
    """
    raise HTTPException(
        status_code=503,
        detail="Live triage authorization integration is not approved",
    )


def _detection_state(detection_id: str) -> str | None:
    for item in redesign_data.list_detections():
        if item["id"] == detection_id:
            return item["state"]
    return None


@router.post("/detections/{detection_id}/actions", dependencies=[Depends(require_csrf)])
def act_on_detection(
    detection_id: str,
    body: TriageActionRequest,
    user: dict = Depends(require_roles("control_room_operator")),
) -> dict:
    if INGEST_LIVE:
        _live_authorization_not_ready()
    if body.action not in ("verify", "dismiss", "escalate"):
        raise HTTPException(status_code=400, detail="action must be verify, dismiss or escalate")
    state = _detection_state(detection_id)
    require_scope(user, state, entity_type="detection", entity_id=detection_id)

    row = redesign_store.record_triage_action(detection_id, body.action, user["role"], body.device_id)

    audit_log.write_audit_log(
        action=body.action,
        entity_type="detection",
        entity_id=detection_id,
        user_id=int(user["id"]),
        device_id=body.device_id,
        metadata={"client_role": body.role, "verified_role": user["role"], "state": state},
    )
    return {"ok": True, "action": row}


@router.get("/detections/{detection_id}/history")
def detection_history(
    detection_id: str,
    user: dict = Depends(require_roles("range_officer", "control_room_operator", "incident_commander")),
) -> dict:
    if INGEST_LIVE:
        _live_authorization_not_ready()
    state = _detection_state(detection_id)
    require_scope(user, state, entity_type="detection", entity_id=detection_id)
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
def incident_scenario(
    incident_id: str,
    wind_source: str = "era5land_native",
    overpass_k: int = 0,
    user: dict = Depends(require_roles("control_room_operator", "incident_commander")),
) -> dict:
    if incident_id not in redesign_data.REPLAY_INCIDENTS:
        raise HTTPException(status_code=404, detail="unknown incident")
    require_scope(user, redesign_data.REPLAY_INCIDENTS[incident_id]["state"], entity_type="incident", entity_id=incident_id)
    if wind_source not in WIND_SOURCES:
        raise HTTPException(status_code=400, detail=f"wind_source must be one of {list(WIND_SOURCES)}")
    bands = _downsampled_bands(incident_id, wind_source, overpass_k)
    replay = redesign_data.replay_for(incident_id)
    n_overpasses = len(replay["series"].get(f"simulation:{wind_source}", []))
    time_utc = redesign_data.overpass_time_utc(incident_id, overpass_k)
    return {
        "incident_id": incident_id,
        "sample_data": True,
        "uncalibrated": True,
        "wind_source": wind_source,
        "wind_source_label": WIND_SOURCES[wind_source],
        "overpass_k": overpass_k,
        "overpass_count": n_overpasses,
        "overpass_time_utc": time_utc,
        "probability_bands_grid": bands,
        "bounds": redesign_data.domain_bounds_wgs84(incident_id),
        "ignition": redesign_data.nominal_ignition(incident_id),
        "probability_bands_geojson": redesign_data.probability_grid_geojson(incident_id, wind_source, overpass_k),
        "baselines_geojson": redesign_data.baseline_circles_geojson(incident_id),
        "wind_arrow": redesign_data.wind_arrow(incident_id, wind_source, time_utc),
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
def replay(
    incident_id: str,
    user: dict = Depends(require_roles("control_room_operator", "incident_commander")),
) -> dict:
    try:
        detail = redesign_data.replay_for(incident_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="unknown incident")
    require_scope(user, redesign_data.REPLAY_INCIDENTS[incident_id]["state"], entity_type="incident", entity_id=incident_id)
    last_k = detail["headline_last_overpass"]["last_overpass_k"]
    primary_model = "era5land_native"
    detail["bounds"] = redesign_data.domain_bounds_wgs84(incident_id)
    detail["ignition"] = redesign_data.nominal_ignition(incident_id)
    try:
        detail["probability_bands_geojson"] = redesign_data.probability_grid_geojson(incident_id, primary_model, last_k)
    except FileNotFoundError:
        detail["probability_bands_geojson"] = None
    detail["observed_footprint_geojson"] = redesign_data.observed_footprint_geojson(incident_id, last_k)
    detail["baselines_geojson"] = redesign_data.baseline_circles_geojson(incident_id)
    return detail


@router.get("/replay")
def replay_index(
    user: dict = Depends(require_roles("control_room_operator", "incident_commander")),
) -> dict:
    counts = redesign_data.cross_incident_win_counts()
    scopes = None if user["role"] == "admin" else user_scopes(int(user["id"]))
    return {
        "incidents": [
            {
                "incident_id": incident_id,
                **meta,
                "domain_bounds_wgs84": redesign_data.domain_bounds_wgs84(incident_id),
                "simulation_start_utc": redesign_data.simulation_start_utc(incident_id),
            }
            for incident_id, meta in redesign_data.REPLAY_INCIDENTS.items()
            if scopes is None or meta["state"] in scopes
        ],
        "development_incidents": True,
        "cross_incident_win_counts": counts,
        "source": "results/resq5/*/metrics_by_overpass.csv, recomputed at request time",
    }


# ---------- Field (offline queue, idempotency-keyed sync) ----------

class FieldReportRequest(BaseModel):
    idempotency_key: str
    task_id: str
    incident_id: str | int | None = None
    note: str = ""
    photo_name: str | None = None
    device_id: str
    captured_at: str


@router.post("/field/reports", dependencies=[Depends(require_csrf)])
def submit_field_report(
    body: FieldReportRequest,
    user: dict = Depends(require_roles("field_crew")),
) -> dict:
    if INGEST_LIVE:
        _live_authorization_not_ready()
    if not body.idempotency_key:
        raise HTTPException(status_code=400, detail="idempotency_key is required")

    task_map = {item["id"]: item for item in redesign_data.list_detections()}
    task = task_map.get(body.task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Field task not found")
    require_scope(user, task.get("state"), entity_type="detection", entity_id=body.task_id)
    if body.incident_id:
        if str(body.incident_id) != str(task["incident_id"]):
            raise HTTPException(status_code=422, detail="Field report task does not match the specified incident")

    row, created = redesign_store.upsert_field_report(
        body.idempotency_key, body.task_id, body.note, body.photo_name, body.device_id, body.captured_at
    )

    if created:
        audit_log.write_audit_log(
            action="field_report_submitted",
            entity_type="field_report",
            entity_id=body.idempotency_key,
            user_id=int(user["id"]),
            device_id=body.device_id,
            metadata={"task_id": body.task_id, "incident_id": body.incident_id, "note_length": len(body.note)},
        )
    return {"created": created, "report": row}


@router.get("/field/reports")
def list_field_reports(
    user: dict = Depends(require_roles("control_room_operator", "incident_commander")),
) -> dict:
    items = redesign_store.list_field_reports()
    if user["role"] != "admin":
        scopes = user_scopes(int(user["id"]))
        state_by_task_id = {item["id"]: item["state"] for item in redesign_data.list_detections()}
        items = [report for report in items if state_by_task_id.get(report["task_id"]) in scopes]
    return {"items": items}


@router.get("/field/tasks")
def field_tasks(user: dict = Depends(require_roles("field_crew"))) -> dict:
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
            "state": item.get("state"),
        })
    if user.get("role") != "admin":
        scopes = user_scopes(int(user["id"]))
        tasks = [task for task in tasks if task.get("state") in scopes]
    for task in tasks:
        task.pop("state", None)
    return {"sample_data": True, "items": tasks}


# ---------- Interactive Cell2Fire / Rothermel Simulation Runner ----------

class SimulationRunRequest(BaseModel):
    latitude: float
    longitude: float
    duration_hours: int = 12


@router.get("/simulation/domain")
def simulation_domain_endpoint(
    _: dict = Depends(require_roles("range_officer", "control_room_operator", "incident_commander")),
) -> dict:
    """Return verified domain boundary, grid specifications, and assumptions for scenario configuration."""
    from ..services.simulation_service import get_simulation_domain_info
    return get_simulation_domain_info()


@router.post("/simulation/run")
def simulation_run_endpoint(
    payload: SimulationRunRequest,
    user: dict = Depends(require_roles("range_officer", "control_room_operator", "incident_commander")),
    _: None = Depends(require_csrf),
) -> dict:
    """Keep interactive execution closed until the disabled spread-job policy is approved."""
    from inference.simulation_domain import RequestOutsideDomain
    from ..services.simulation_service import validate_spread_request
    try:
        validate_spread_request(payload.latitude, payload.longitude, payload.duration_hours)
    except RequestOutsideDomain as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    raise HTTPException(
        status_code=503,
        detail="Interactive simulation is unavailable until execution storage and access controls are approved. Use the saved example instead.",
    )

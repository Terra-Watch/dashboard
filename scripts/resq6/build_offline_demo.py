#!/usr/bin/env python3
"""Build a deterministic, static offline demo from existing RESQ-local artifacts.

This is a packaging/formatting step only: it never downloads data or runs Cell2Fire.
The output is written only to a new directory; an existing destination is refused.
"""
from __future__ import annotations

import hashlib
import json
import sys
import tempfile
from datetime import date
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from app import barv3  # noqa: E402
from app.services import redesign_data as rd  # noqa: E402

OUTPUT = ROOT / "frontend" / "public" / "demo" / "resq6-offline"
FORECAST_DATE = date(2024, 3, 10)
PRIMARY_WIND_SOURCE = "era5land_native"
ASSUMPTIONS = {
    "fuel": "Uncalibrated RESQ-5 fuel crosswalk; an India-specific runtime fuel model is not established.",
    "weather": "Historical weather replay; temperature and humidity are fixed in the simulator, while wind varies by saved source.",
    "terrain": "Slope derived from the local Copernicus GLO-30 domain input.",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def iso_utc(value: str) -> str:
    normalized = value.strip().replace(" ", "T", 1)
    return normalized if normalized.endswith("Z") else f"{normalized}Z"


def json_bytes(value: object) -> bytes:
    return (json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + "\n").encode("utf-8")


def build_payloads() -> tuple[dict, dict[str, dict], dict[str, object], dict[str, str]]:
    setup_path = ROOT / "data" / "resq5" / "protocol_setup.json"
    setup = json.loads(setup_path.read_text())
    forecast_archive, forecast_centers = barv3._paths(FORECAST_DATE.year) or (None, None)
    if forecast_archive is None or forecast_centers is None or not forecast_archive.is_file() or not forecast_centers.is_file():
        raise FileNotFoundError("Archived Bar v3 forecast bundle or cell centers are unavailable")
    forecast = barv3.daily_geojson(FORECAST_DATE)
    if not forecast.get("features"):
        raise ValueError(f"No archived Bar v3 features exist for {FORECAST_DATE}; refusing to fabricate a forecast")

    sources: dict[str, str] = {
        "forecast_archive": str(forecast_archive.relative_to(ROOT)),
        "forecast_cell_centers": str(forecast_centers.relative_to(ROOT)),
        "protocol_setup": str(setup_path.relative_to(ROOT)),
        "forecast_adapter": str((ROOT / "backend" / "app" / "barv3.py").relative_to(ROOT)),
        "scenario_adapter": str((ROOT / "backend" / "app" / "services" / "redesign_data.py").relative_to(ROOT)),
        "bundle_builder": str(Path(__file__).resolve().relative_to(ROOT)),
    }
    cases: dict[str, dict] = {}
    case_index = []

    for incident_id, metadata in rd.REPLAY_INCIDENTS.items():
        if incident_id not in setup:
            raise ValueError(f"No protocol setup exists for replay incident {incident_id}")
        protocol = setup[incident_id]
        lat, lon = protocol["ignition_lat_lon"]
        detail = rd.replay_for(incident_id)
        rows = detail["series"].get(f"simulation:{PRIMARY_WIND_SOURCE}", [])
        archive_path = ROOT / "results" / "resq5" / incident_id / f"burn_count_{PRIMARY_WIND_SOURCE}.npz"
        if not rows or not archive_path.is_file():
            raise FileNotFoundError(f"Missing primary precomputed ensemble for {incident_id}")

        with np.load(archive_path, allow_pickle=False) as archive:
            members = int(archive["members"])
            frame_keys = set(archive.files)
        frames = []
        for row in rows:
            k = int(row["overpass_k"])
            if f"k{k}" not in frame_keys:
                raise ValueError(f"Missing saved frame k{k} for {incident_id}; no interpolation is allowed")
            source_time = str(row["time_utc"])
            frames.append({
                "overpass_k": k,
                "time_utc": iso_utc(source_time),
                "hours_since_t0": float(row["hours_since_t0"]),
                "probability_bands_geojson": rd.probability_grid_geojson(incident_id, PRIMARY_WIND_SOURCE, k),
                "viirs_detection_mask_geojson": rd.observed_footprint_geojson(incident_id, k, reference="nh"),
                "wind_arrow": rd.wind_arrow(incident_id, PRIMARY_WIND_SOURCE, source_time),
            })

        scenario_sources = {
            "simulation_summary": f"results/resq5/{incident_id}/summary.json",
            "simulation_ensemble": f"results/resq5/{incident_id}/burn_count_{PRIMARY_WIND_SOURCE}.npz",
            "observation_metrics": f"results/resq5/{incident_id}/metrics_by_overpass.csv",
            "viirs_detections": f"data/resq2/{incident_id}/viirs_detections.csv",
            "weather_input": f"data/resq2/{incident_id}/weather_era5land_native_wind.csv",
            "protocol_setup": "data/resq5/protocol_setup.json",
        }
        for key, relative in scenario_sources.items():
            path = ROOT / relative
            if not path.is_file():
                raise FileNotFoundError(path)
            sources[f"{incident_id}:{key}"] = relative

        cases[incident_id] = {
            "incident_id": incident_id,
            "state": metadata["state"],
            "label": metadata["label"],
            "artifact_status": "precomputed",
            "simulation_start_utc": iso_utc(str(protocol["t0_utc"])),
            "ignition": {"lat": float(lat), "lon": float(lon)},
            "ignition_origin": "Exact prescribed initial coordinate in data/resq5/protocol_setup.json; not derived from the Bar v3 forecast.",
            "ensemble_members": members,
            "wind_source": PRIMARY_WIND_SOURCE,
            "source_artifacts": scenario_sources,
            "assumptions": ASSUMPTIONS,
            "frames_are_actual_saved_overpasses": True,
            "interpolated_frames": False,
            "frames": frames,
        }
        case_index.append({
            "incident_id": incident_id,
            "state": metadata["state"],
            "label": metadata["label"],
            "artifact_status": "precomputed",
            "simulation_start_utc": iso_utc(str(protocol["t0_utc"])),
            "ensemble_members": members,
            "scenario_path": f"cases/{incident_id}.json",
            "available_overpasses": len(frames),
        })

    index = {
        "schema_version": 1,
        "demo_kind": "offline_precomputed_forecast_and_conditional_spread",
        "forecast": {
            "model": "Bar v3",
            "date": FORECAST_DATE.isoformat(),
            "artifact_status": "archived_validation_replay",
            "coverage_complete": False,
            "geometry_path": "forecast.geojson",
            "artifact_identifier": sources["forecast_archive"],
            "probabilities_exposed": False,
            "warning": "Archived ranked-cell replay, not a live or complete-coverage forecast.",
        },
        "simulation_cases": case_index,
        "relationship": "Forecast and saved RESQ-5 simulations are separate artifacts. The forecast does not select ignition or drive Cell2Fire.",
        "observation_semantics": "VIIRS active-fire detection masks are supporting observations, not complete physical perimeters; absence is not confirmed unburned.",
        "validation_status": "Not operationally validated. The current development acceptance gate remains unmet; these displayed VIIRS-derived targets are not physical fire perimeters.",
        "provenance_path": "provenance.json",
    }
    return index, cases, forecast, sources


def write_bundle(output: Path = OUTPUT) -> list[Path]:
    if output.exists():
        raise FileExistsError(f"Refusing to overwrite existing offline demo directory: {output}")
    output.parent.mkdir(parents=True, exist_ok=True)
    index, cases, forecast, sources = build_payloads()
    with tempfile.TemporaryDirectory(prefix="resq6-offline-", dir=output.parent) as temporary:
        stage = Path(temporary) / output.name
        (stage / "cases").mkdir(parents=True)
        generated: dict[str, str] = {}

        def emit(relative: str, payload: object) -> None:
            destination = stage / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            data = json_bytes(payload)
            destination.write_bytes(data)
            generated[relative] = hashlib.sha256(data).hexdigest()

        emit("forecast.geojson", forecast)
        for incident_id, case in cases.items():
            emit(f"cases/{incident_id}.json", case)
        input_hashes = {key: sha256(ROOT / relative) for key, relative in sorted(sources.items())}
        provenance = {
            "generator": str(Path(__file__).resolve().relative_to(ROOT)),
            "generation_method": "Local deterministic serialization of existing Bar v3 and RESQ-5 artifacts; no acquisition, prediction, scoring, or Cell2Fire run.",
            "inputs": {key: {"path": sources[key], "sha256": input_hashes[key]} for key in sorted(sources)},
            "generated_data_files_sha256": generated,
        }
        emit("provenance.json", provenance)
        emit("index.json", index)
        stage.rename(output)
    return [output / "index.json", output / "forecast.geojson", output / "provenance.json", *sorted((output / "cases").glob("*.json"))]


if __name__ == "__main__":
    created = write_bundle()
    for path in created:
        print(path.relative_to(ROOT))

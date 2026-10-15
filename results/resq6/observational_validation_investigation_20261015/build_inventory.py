"""Read-only, development-only inventory of local RESQ6 reference candidates."""
from __future__ import annotations

import csv
import hashlib
import json
import re
from datetime import date
from pathlib import Path

import numpy as np
import rasterio
from pyhdf.SD import SD, SDC
from pyproj import Transformer

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent / "local_reference_inventory.json"
CASES = ("E2024-131853", "E2024-135332", "E2023-084925", "E2024-155286")
SETUP = json.loads((ROOT / "data/resq5/protocol_setup.json").read_text())
TO_SINU = Transformer.from_crs("EPSG:32644", "+proj=sinu +R=6371007.181 +units=m +no_defs", always_xy=True)
TO_UTM = Transformer.from_crs("+proj=sinu +R=6371007.181 +units=m +no_defs", "EPSG:32644", always_xy=True)


def sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def file_record(path: Path, kind: str) -> dict:
    return {"path": path.relative_to(ROOT).as_posix(), "bytes": path.stat().st_size,
            "sha256": sha(path), "kind": kind}


def hdf_record(path: Path, domain: dict) -> dict:
    h = SD(str(path), SDC.READ)
    burn = np.asarray(h.select("Burn Date").get())
    qa = np.asarray(h.select("QA").get(), dtype=np.uint8)
    unc = np.asarray(h.select("Burn Date Uncertainty").get())
    struct = h.attributes()["StructMetadata.0"]
    ul = re.search(r'UpperLeftPointMtrs=\(([-.\d]+),([-.\d]+)\)', struct)
    lr = re.search(r'LowerRightMtrs=\(([-.\d]+),([-.\d]+)\)', struct)
    if not ul or not lr:
        raise ValueError(f"Missing HDF-EOS grid bounds: {path}")
    left, top = map(float, ul.groups())
    right, bottom = map(float, lr.groups())
    dx, dy = (right-left)/burn.shape[1], (top-bottom)/burn.shape[0]
    n, west, north = domain["cells_per_side"], domain["west_m"], domain["north_m"]
    # Count RESQ 30 m cell centers represented by this sinusoidal HDF tile.
    rows, cols = np.indices((n, n))
    xs, ys = west + (cols + .5)*30, north - (rows + .5)*30
    sx, sy = TO_SINU.transform(xs, ys)
    inside = (sx >= left) & (sx < right) & (sy <= top) & (sy > bottom)
    tilecols = np.floor((sx-left)/dx).astype(int)
    tilerows = np.floor((top-sy)/dy).astype(int)
    valid_index = inside & (tilecols >= 0) & (tilecols < burn.shape[1]) & (tilerows >= 0) & (tilerows < burn.shape[0])
    ncovered = int(valid_index.sum())
    # Describe native MODIS pixels whose centers fall in the UTM square; no resampling.
    rr, cc = np.indices(burn.shape)
    px, py = left+(cc+.5)*dx, top-(rr+.5)*dy
    ux, uy = TO_UTM.transform(px, py)
    in_domain = ((ux >= west) & (ux < west+n*30) & (uy <= north) & (uy > north-n*30))
    q = qa[in_domain]
    b = burn[in_domain]
    u = unc[in_domain]
    qa_valid = (q & 2) != 0
    qa_land = (q & 1) != 0
    valid_land = qa_valid & qa_land
    burned = valid_land & (b > 0)
    burn_counts = {str(int(k)): int(v) for k, v in zip(*np.unique(b, return_counts=True))}
    input_core = h.attributes().get("CoreMetadata.0", "")
    ptr = input_core.find("INPUTPOINTER")
    inputs = re.findall(r'"([^"\n]+\.hdf)"', input_core[ptr:ptr+5000]) if ptr >= 0 else []
    attrs = h.select("Burn Date").attributes()
    result = file_record(path, "MCD64A1 HDF-EOS")
    result.update({"product": "MCD64A1.061", "native_shape": list(burn.shape),
        "native_pixel_size_m": [dx, dy], "native_crs": "MODIS sinusoidal sphere R=6371007.181 m",
        "burn_date_attributes": attrs, "qa_legend": h.select("QA").attributes().get("QA Legend"),
        "domain_native_pixel_centers": int(in_domain.sum()), "qa_valid_land_pixels": int(valid_land.sum()),
        "burned_pixels_among_valid_land": int(burned.sum()), "burn_date_value_counts_in_domain": burn_counts,
        "burn_date_uncertainty_days_for_burned_valid_land": sorted(int(x) for x in np.unique(u[burned])),
        "resq_30m_cell_centers_inside_hdf_tile": ncovered,
        "resq_30m_domain_cell_centers_total": n*n,
        "resq_30m_cell_center_tile_coverage_fraction": ncovered/(n*n),
        "input_hdf_references_from_local_core_metadata": inputs})
    h.end()
    return result


inventory = {
    "scope": {"development_incidents_only": list(CASES), "heldout_accessed": False,
              "network_or_downloads": False, "simulation_run": False,
              "spatial_domain_rule": "existing 30 m EPSG:32644 square from protocol_setup.json",
              "MCD_tile_coverage_rule": "fraction of 30 m cell centers falling inside local HDF-EOS sinusoidal tile bounds; descriptive extent diagnostic, not valid-observation coverage"},
    "environment": {"python": "backend/.venv/bin/python", "inspection_libraries": ["numpy", "rasterio", "pyproj", "pyhdf"]},
    "incidents": []
}
for case in CASES:
    domain = SETUP[case]["domain"]
    item = {"incident_id": case, "domain": domain, "local_files": [], "viirs": {}, "observed_mask": {},
            "mcd64a1": [], "rasters": [], "missing_local_candidates": []}
    base = ROOT / "data/resq2" / case
    viirs = base / "viirs_detections.csv"
    rows = list(csv.DictReader(viirs.open(newline="", encoding="utf-8-sig")))
    dates = sorted({r["acq_date"] for r in rows})
    item["viirs"] = {**file_record(viirs, "FIRMS/VIIRS active-fire detections"), "rows": len(rows),
        "date_range": [dates[0], dates[-1]] if dates else None,
        "confidence_counts": {k: sum(r["confidence"].lower() == k for r in rows) for k in sorted({r["confidence"].lower() for r in rows})},
        "satellites": sorted({r["satellite"] for r in rows}), "types": sorted({r["type"] for r in rows}),
        "columns": list(rows[0]) if rows else [], "valid_observation_or_clear_sky_fields": [c for c in (rows[0] if rows else {}) if any(s in c.lower() for s in ("cloud", "clear", "valid", "coverage"))],
        "semantic_limit": "detection points only; absence does not establish observed-unburned"}
    mask = ROOT / "results/resq5" / case / "observed_footprints.npz"
    with np.load(mask, allow_pickle=False) as z:
        item["observed_mask"] = {**file_record(mask, "VIIRS-derived model target masks"),
            "arrays": {k: {"shape": list(z[k].shape), "dtype": str(z[k].dtype), "true_cells": int(z[k].sum())}
                       for k in z.files if k.startswith(("nh_", "all_"))},
            "has_unknown_or_coverage_state": False, "independent_of_viirs_csv": False}
    for p in sorted((base / "mcd64a1").glob("*.hdf")) if (base / "mcd64a1").exists() else []:
        item["mcd64a1"].append(hdf_record(p, domain))
    fetch = base / "fetch_report.json"
    if fetch.exists():
        fd = json.loads(fetch.read_text())
        item["mcd64a1_fetch_report"] = file_record(fetch, "local acquisition provenance")
        item["mcd64a1_fetch_metadata"] = {k: fd.get(k) for k in ("incident_id", "mcd64a1", "mcd64a1_files", "product") if k in fd}
        # Preserve exact per-file published listing size status where represented in report.
        records = fd.get("mcd64a1_files", fd.get("mcd64a1", []))
        if isinstance(records, list):
            item["mcd64a1_listing_checks"] = [{k: x.get(k) for k in ("file", "actual_bytes", "laads_listing_bytes", "size_matches_laads", "month", "sha256")} for x in records]
    for name in ("worldcover_2021_domain_window.tif", "copernicus_dem_glo30_domain_window.tif"):
        p = ROOT / "data/resq5" / case / name
        if p.exists():
            with rasterio.open(p) as ds:
                rec = file_record(p, "simulation covariate, not observational reference")
                rec.update({"crs": str(ds.crs), "shape": [ds.height, ds.width], "bounds": list(ds.bounds),
                            "resolution": list(ds.res), "nodata": ds.nodata, "transform": list(ds.transform)[:6],
                            "dataset_tags": ds.tags()})
                item["rasters"].append(rec)
    sim = ROOT / "results/resq6/dev_member_grids_horizon_aligned_20261015" / case
    item["saved_simulation_artifacts"] = []
    for p in (sim / "manifest.json", sim / f"{case}.json"):
        if p.exists(): item["saved_simulation_artifacts"].append(file_record(p, "existing development simulation provenance/results; read only"))
    if not item["mcd64a1"]: item["missing_local_candidates"].append("No local MCD64A1 HDF for this development incident in data/resq2/<incident>/mcd64a1/")
    for candidate in ("Copernicus daily burned-area v3.1", "Sentinel-2 imagery or derived burn mask", "Landsat imagery or derived burn mask", "manual perimeter", "per-cell cloud/clear-sky/valid-observation coverage raster"):
        item["missing_local_candidates"].append(f"No candidate located in scoped local incident inputs/results: {candidate}")
    item["local_files"] = [item["viirs"], item["observed_mask"], *item["mcd64a1"], *item["rasters"], *item["saved_simulation_artifacts"]]
    if item.get("mcd64a1_fetch_report"):
        item["local_files"].append(item["mcd64a1_fetch_report"])
    inventory["incidents"].append(item)

OUT.write_text(json.dumps(inventory, indent=2, sort_keys=True) + "\n")
audit_paths = [
    "results/resq6/temporal_alignment_audit_20261015/temporal_audit_report.md",
    "results/resq6/target_feasibility_20261015/feasibility_report.md",
    "results/resq6/target_feasibility_20261015/target_feasibility.json",
    "results/resq6/spread_evaluation_feasibility_20261015/spread_evaluation_feasibility.md",
    "results/resq6/spread_evaluation_feasibility_20261015/reference_data_inventory.json",
    "results/resq6/spread_evaluation_feasibility_20261015/evaluation_protocol_proposal.md",
    "results/resq6/spread_evaluation_feasibility_20261015/scenario_visualization_readiness.md",
]
inputs = {x["path"]: x["sha256"] for case in inventory["incidents"] for group in
          (case["local_files"], case["mcd64a1"], case["rasters"], case["saved_simulation_artifacts"],
           [case["viirs"], case["observed_mask"], case.get("mcd64a1_fetch_report", {})])
          for x in group if x.get("path")}
inputs["data/resq5/protocol_setup.json"] = sha(ROOT / "data/resq5/protocol_setup.json")
for rel in audit_paths:
    p = ROOT / rel
    if p.exists(): inputs[rel] = sha(p)
generated = ["local_reference_inventory.json", "dataset_assessment.md", "validation_protocol.md",
             "exploratory_validation_report.md", "next_actions.md"]
provenance = {
    "created_utc_date": "2026-10-15",
    "scope": "four RESQ6 development incidents only; no held-out data, download, external API, Cell2Fire run, score, or tuning",
    "commands": [
        "backend/.venv/bin/python results/resq6/observational_validation_investigation_20261015/build_inventory.py",
        "python3 -m json.tool results/resq6/observational_validation_investigation_20261015/local_reference_inventory.json",
        "python3 -m py_compile results/resq6/observational_validation_investigation_20261015/build_inventory.py",
        "git diff --check",
    ],
    "inputs_sha256": dict(sorted(inputs.items())),
    "generated_outputs_sha256": {x: sha(OUT.parent / x) for x in generated},
    "inventory_builder_sha256": sha(Path(__file__).resolve()),
    "validation_evidence": {
        "inventory_json": "generated from local files by build_inventory.py; JSON parsing and recorded source hashes checked separately",
        "simulation_score": "not computed",
        "official_benchmark": "unchanged",
        "external_acquisition": "none",
    },
}
(OUT.parent / "provenance_manifest.json").write_text(json.dumps(provenance, indent=2, sort_keys=True) + "\n")
print(OUT.relative_to(ROOT))
print(f"incidents={len(inventory['incidents'])}; local_mcd_hdf={sum(len(x['mcd64a1']) for x in inventory['incidents'])}")

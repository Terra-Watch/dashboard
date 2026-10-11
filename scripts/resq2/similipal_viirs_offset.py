"""Why does VIIRS show no detection within 5.8 km of the Similipal MCD64A1 cluster?

Reads the staged MCD64A1 h26v06 2024-03 tile and the staged VIIRS 5-day files.
Writes results/resq2_similipal_offset.json. Local data only.
"""
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd
from pyhdf.SD import SD, SDC

WEBSITE = Path(__file__).resolve().parents[2]
FIRMS = Path("/Users/kireeti/wildfire-data/raw/_staging_firms")
HDF = WEBSITE / "backend/runtime_data/mcd64a1/2024-03/MCD64A1.A2024061.h26v06.061.2024134021235.hdf"
R = 6_371_007.181
T = 1_111_950.5196666666
X0, Y0 = -20_015_109.354, 10_007_554.677
REPO_POINT = (21.867894, 86.500688)       # coordinates used by the demo (computed with 500 m pixels)


def pixel_ll(row, col, size):
    x = X0 + 26 * T + (col + 0.5) * size
    y = Y0 - 6 * T - (row + 0.5) * size
    lat = math.degrees(y / R)
    return lat, math.degrees(x / (R * math.cos(math.radians(lat))))


def km(lat1, lon1, lat2, lon2):
    p = math.pi / 180
    a = math.sin((lat2 - lat1) * p / 2) ** 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2
    return 2 * 6371.0088 * math.asin(math.sqrt(a))


def main():
    sd = SD(str(HDF), SDC.READ)
    bd = np.asarray(sd.select("Burn Date").get())
    unc = np.asarray(sd.select("Burn Date Uncertainty").get())
    first = np.asarray(sd.select("First Day").get())
    last = np.asarray(sd.select("Last Day").get())
    qa = np.asarray(sd.select("QA").get())
    struct = sd.attributes()["StructMetadata.0"]
    ul = [float(v) for v in struct.split("UpperLeftPointMtrs=(")[1].split(")")[0].split(",")]
    lr = [float(v) for v in struct.split("LowerRightMtrs=(")[1].split(")")[0].split(",")]
    true_size = (lr[0] - ul[0]) / 2400
    rows, cols = np.where(bd == 91)
    sel = [(int(r), int(c)) for r, c in zip(rows, cols) if abs(pixel_ll(r, c, 500.0)[0] - REPO_POINT[0]) < 0.3 and abs(pixel_ll(r, c, 500.0)[1] - REPO_POINT[1]) < 0.3]
    out = {
        "tile_metadata": {"UpperLeftPointMtrs": ul, "LowerRightMtrs": lr, "xdim": 2400, "pixel_size_m_from_metadata": true_size, "pixel_size_assumed_by_repo_m": 500.0},
        "cluster_pixels_rowcol": sel,
        "cluster_pixel_attributes": [{"row": r, "col": c, "burn_date_doy": int(bd[r, c]), "uncertainty_days": int(unc[r, c]), "first_day": int(first[r, c]), "last_day": int(last[r, c]), "qa": int(qa[r, c])} for r, c in sel],
    }
    pos_repo = [pixel_ll(r, c, 500.0) for r, c in sel]
    pos_true = [pixel_ll(r, c, true_size) for r, c in sel]
    out["cluster_centroid_repo_500m"] = [float(np.mean([p[0] for p in pos_repo])), float(np.mean([p[1] for p in pos_repo]))]
    out["cluster_centroid_true_463m"] = [float(np.mean([p[0] for p in pos_true])), float(np.mean([p[1] for p in pos_true]))]
    out["shift_km"] = km(*out["cluster_centroid_repo_500m"], *out["cluster_centroid_true_463m"])
    out["area_km2_true"] = len(sel) * (true_size / 1000) ** 2
    out["area_km2_if_500m"] = len(sel) * 0.25

    parts = []
    for sat in ("NOAA20", "SNPP"):
        for day in ("2024-03-25", "2024-03-30", "2024-04-04"):
            parts.append(pd.read_csv(FIRMS / f"VIIRS_{sat}_SP_main_{day}.csv", dtype={"confidence": str}))
    v = pd.concat(parts).drop_duplicates(["latitude", "longitude", "acq_date", "acq_time", "satellite"])
    v = v[(v.acq_date >= "2024-03-27") & (v.acq_date <= "2024-04-04")]
    res = {}
    for name, pos in (("geometry_500m_as_in_repo", pos_repo), ("geometry_463m_from_hdf_metadata", pos_true)):
        dmin = []
        for la, lo in pos:
            dd = np.array([km(la, lo, a, b) for a, b in zip(v.latitude.values, v.longitude.values)])
            dmin.append(float(dd.min()))
        near = np.zeros(len(v), dtype=bool)
        for la, lo in pos:
            near |= np.array([km(la, lo, a, b) for a, b in zip(v.latitude.values, v.longitude.values)]) <= 2.0
        sub = v[near]
        res[name] = {
            "nearest_detection_km_per_pixel": [round(x, 2) for x in dmin],
            "median_nearest_km": round(float(np.median(dmin)), 2),
            "detections_within_2km_any_confidence": int(len(sub)),
            "by_confidence": {k: int(c) for k, c in sub.confidence.value_counts().items()},
            "by_type": {int(k): int(c) for k, c in sub.type.value_counts().items()},
            "kept_by_research_filter_n_h": int(sub.confidence.isin(["n", "h"]).sum()),
            "dropped_by_research_filter_low": int((sub.confidence == "l").sum()),
            "first_detection": None if sub.empty else f"{sub.sort_values(['acq_date', 'acq_time']).iloc[0].acq_date} {int(sub.sort_values(['acq_date', 'acq_time']).iloc[0].acq_time):04d} UTC",
            "per_overpass": {f"{k[0]} {k[1]} {int(k[2]):04d}UTC": int(c) for k, c in sub.groupby(["acq_date", "satellite", "acq_time"]).size().items()},
        }
    out["viirs_vs_pixels"] = res
    # the 5.8 km detection quoted in the diagnosis report
    q = v[(v.acq_date == "2024-04-01") & (v.acq_time == 727) & (v.satellite == "N20")]
    q = q.assign(d=[km(*REPO_POINT, a, b) for a, b in zip(q.latitude, q.longitude)]).sort_values("d").iloc[0]
    out["report_5_8km_detection"] = {"lat": float(q.latitude), "lon": float(q.longitude), "acq": f"{q.acq_date} {int(q.acq_time):04d} UTC", "confidence": q.confidence, "distance_to_repo_point_km": round(float(q.d), 2),
                                     "distance_to_true_cluster_centroid_km": round(km(q.latitude, q.longitude, *out["cluster_centroid_true_463m"]), 1)}
    # Similipal core (the demo's own coordinates): the research grid has no forest cell within 29 km,
    # so build_incident_candidates.py cannot see this fire; cluster it here without the cell filter.
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import connected_components
    from scipy.spatial import cKDTree
    core = v[(v.type == 0) & v.latitude.between(21.5, 22.2) & v.longitude.between(86.0, 86.7) & (v.acq_date >= "2024-03-29")].copy()
    t = (pd.to_datetime(core.acq_date) - pd.Timestamp("1970-01-01")).dt.days + (core.acq_time // 100 + (core.acq_time % 100) / 60) / 24
    xy = np.column_stack([core.longitude * 103.3, core.latitude * 111.2, t * (2.0 / 3.0)])
    pairs = cKDTree(xy).query_pairs(2.0, output_type="ndarray")
    _, lab = connected_components(coo_matrix((np.ones(len(pairs)), (pairs[:, 0], pairs[:, 1])), shape=(len(core), len(core))), directed=False)
    core["event"] = lab
    ev = []
    for k, g in core.groupby("event"):
        if len(g) < 5:
            continue
        ev.append({"n_det": int(len(g)), "n_nh": int(g.confidence.isin(["n", "h"]).sum()), "n_overpass": int(g.groupby(["acq_date", "satellite", "daynight"]).ngroups),
                   "first": f"{g.sort_values(['acq_date', 'acq_time']).iloc[0].acq_date} {int(g.sort_values(['acq_date', 'acq_time']).iloc[0].acq_time):04d} UTC",
                   "last_date": g.acq_date.max(), "centroid": [round(float(g.latitude.mean()), 4), round(float(g.longitude.mean()), 4)],
                   "ns_km": round(float((g.latitude.max() - g.latitude.min()) * 111.2 + 0.375), 1), "ew_km": round(float((g.longitude.max() - g.longitude.min()) * 103.3 + 0.375), 1)})
    out["similipal_core_events_no_cell_filter"] = ev
    out["time_convention"] = "acq_time is HHMM UTC; India daytime overpasses ~0700-0800 UTC (1230-1330 IST), night ~1930-2100 UTC"
    p = WEBSITE / "results/resq2_similipal_offset.json"
    p.write_text(json.dumps(out, indent=1) + "\n")
    print(json.dumps(out, indent=1)[:6000])


if __name__ == "__main__":
    main()

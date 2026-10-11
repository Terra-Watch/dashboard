"""RESQ-3 checks on the fetched inputs: forest check, burn scar vs VIIRS cluster, weather coverage.

Rule fixed in advance: an incident is rejected when the WorldCover 2021 class at the ignition pixel
(10 m, the pixel containing the CSV ignition coordinate) is not forest (class 10 tree cover, 95 mangroves).
Neighbourhood shares are reported for context and do not change the rule.
Scar location is "consistent" when the scar centroid is within 2 km of the VIIRS cluster centroid and at
least 70 % of the event's n/h detections lie within 1 km of a burned-pixel centre.
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import rasterio
from rasterio.transform import rowcol
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from scipy.spatial import cKDTree

WEBSITE = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(WEBSITE / "backend/inference"))
from mcd64a1_geo import grid_from_hdf  # noqa: E402

OUT = WEBSITE / "data/resq2"
INCIDENTS = ["E2023-078506", "E2024-133629", "E2024-131853", "E2024-135332"]
WC_NAMES = {10: "tree cover", 20: "shrubland", 30: "grassland", 40: "cropland", 50: "built-up", 60: "bare/sparse", 70: "snow/ice", 80: "water", 90: "herbaceous wetland", 95: "mangroves", 100: "moss/lichen"}
FOREST = {10, 95}
PIX_KM = 1111.9505196666666 / 2400


def km_xy(lat, lon, lat0, lon0):
    return (np.asarray(lon) - lon0) * 111.32 * math.cos(math.radians(lat0)), (np.asarray(lat) - lat0) * 111.2


def domain_mask_bounds(row):
    half = row.domain_side_km / 2
    dlat, dlon = half / 111.2, half / (111.32 * math.cos(math.radians(row.bbox_centre_lat)))
    return row.bbox_centre_lon - dlon, row.bbox_centre_lat - dlat, row.bbox_centre_lon + dlon, row.bbox_centre_lat + dlat


def forest_check(row, folder):
    out = {}
    with rasterio.open(folder / "worldcover_2021_window.tif") as r:
        a = r.read(1)
        r_i, c_i = rowcol(r.transform, row.ign_lon, row.ign_lat)
        inside = 0 <= r_i < a.shape[0] and 0 <= c_i < a.shape[1]
        out["ignition_pixel_class"] = int(a[r_i, c_i]) if inside else None
        out["ignition_pixel_class_name"] = WC_NAMES.get(out["ignition_pixel_class"], "unknown")
        w, s, e, n = domain_mask_bounds(row)
        rows, cols = np.indices(a.shape)
        xs, ys = rasterio.transform.xy(r.transform, rows.ravel(), cols.ravel())
        xs, ys = np.array(xs).reshape(a.shape), np.array(ys).reshape(a.shape)
        dom = (xs >= w) & (xs <= e) & (ys >= s) & (ys <= n)
        vals, counts = np.unique(a[dom], return_counts=True)
        out["domain_pixels"] = int(dom.sum())
        out["domain_class_share_pct"] = {f"{int(v)} {WC_NAMES.get(int(v), '?')}": round(100 * c / dom.sum(), 1) for v, c in zip(vals, counts)}
        out["domain_forest_share_pct"] = round(100 * float(np.isin(a[dom], list(FOREST)).sum()) / dom.sum(), 1)
        out["domain_tree_or_shrub_share_pct"] = round(100 * float(np.isin(a[dom], [10, 20, 95]).sum()) / dom.sum(), 1)
        kx, ky = km_xy(ys, xs, row.ign_lat, row.ign_lon)
        dist = np.hypot(kx, ky)
        ctx = {}
        for label, mask in (("within_190m", dist <= 0.19), ("within_1km", dist <= 1.0)):
            m = mask & dom
            ctx[label] = {"pixels": int(m.sum()), "forest_share_pct": round(100 * float(np.isin(a[m], list(FOREST)).sum()) / max(m.sum(), 1), 1),
                          "classes": {WC_NAMES.get(int(v), str(v)): round(100 * c / m.sum(), 1) for v, c in zip(*np.unique(a[m], return_counts=True))}}
        out["context"] = ctx
        tree = np.isin(a, list(FOREST)) & dom
        out["nearest_forest_pixel_km"] = round(float(dist[tree].min()), 3) if tree.any() else None
        out["forest_pass"] = out["ignition_pixel_class"] in FOREST
        out["pixel_size_m"] = [round(abs(r.transform.a) * 111320 * math.cos(math.radians(row.ign_lat)), 1), round(abs(r.transform.e) * 111200, 1)]
    with rasterio.open(folder / "copernicus_dem_glo30_window.tif") as r:
        z = r.read(1).astype(float)
        r_i, c_i = rowcol(r.transform, row.ign_lon, row.ign_lat)
        out["dem"] = {"shape": list(z.shape), "min_m": float(z.min()), "max_m": float(z.max()), "mean_m": round(float(z.mean()), 1), "at_ignition_m": float(z[r_i, c_i]), "pixel_size_m": [round(abs(r.transform.a) * 111320 * math.cos(math.radians(row.ign_lat)), 1), round(abs(r.transform.e) * 111200, 1)]}
    return out


def event_detections(row, folder):
    d = pd.read_csv(folder / "viirs_detections.csv", dtype={"confidence": str})
    d = d[d.type == 0].copy()
    d["t"] = (pd.to_datetime(d.acq_date) - pd.Timestamp("1970-01-01")).dt.days + (d.acq_time // 100 + (d.acq_time % 100) / 60) / 24
    x, y = km_xy(d.latitude.values, d.longitude.values, row.ign_lat, row.ign_lon)
    pts = np.column_stack([x, y, d.t.values * (2.0 / 3.0)])
    pairs = cKDTree(pts).query_pairs(2.0, output_type="ndarray")
    _, lab = connected_components(coo_matrix((np.ones(len(pairs)), (pairs[:, 0], pairs[:, 1])), shape=(len(d), len(d))), directed=False)
    d["comp"] = lab
    first = d[d.acq_date == row.first_date]
    # component of the first-overpass detection nearest the CSV ignition
    near = np.hypot(*km_xy(first.latitude.values, first.longitude.values, row.ign_lat, row.ign_lon))
    comp = int(first.comp.values[int(np.argmin(near))])
    ev = d[d.comp == comp].copy()
    ev["x_km"], ev["y_km"] = km_xy(ev.latitude.values, ev.longitude.values, row.ign_lat, row.ign_lon)
    return d, ev


def scar_check(row, folder, ev):
    files = sorted((folder / "mcd64a1").glob("MCD64A1.*.hdf"))
    first, last = pd.Timestamp(row.first_date), pd.Timestamp(row.last_date)
    from pyhdf.SD import SD, SDC
    w, s, e, n = domain_mask_bounds(row)
    margin = 3.0 / 111.2
    keep, other = [], 0
    meta = []
    for f in files:
        year = int(f.name.split(".A")[1][:4])
        sd = SD(str(f), SDC.READ)
        grid = grid_from_hdf(f, sd)
        bd = np.asarray(sd.select("Burn Date").get())
        unc = np.asarray(sd.select("Burn Date Uncertainty").get())
        r, c = np.where(bd > 0)
        lon, lat = grid.lonlat(r, c)
        meta.append({"file": f.name, "pixel_size_m": [round(grid.pixel_size_x, 3), round(grid.pixel_size_y, 3)], "burned_pixels_in_tile": int(len(r))})
        inbox = (lon >= w - margin * 1.1) & (lon <= e + margin * 1.1) & (lat >= s - margin) & (lat <= n + margin)
        for rr, cc, lo, la, doy, u in zip(r[inbox], c[inbox], lon[inbox], lat[inbox], bd[r, c][inbox], unc[r, c][inbox]):
            date = pd.Timestamp(year=year, month=1, day=1) + pd.Timedelta(days=int(doy) - 1)
            keep.append({"row": int(rr), "col": int(cc), "lon": float(lo), "lat": float(la), "burn_doy": int(doy), "burn_date": date.strftime("%Y-%m-%d"), "uncertainty_days": int(u), "file": f.name})
    scar = pd.DataFrame(keep)
    out = {"files": meta}
    if scar.empty:
        out.update({"pixels_event_window": 0, "verdict": "no burned pixels in the domain + 3 km in the fetched months"})
        return out, scar
    scar["in_event_window"] = (pd.to_datetime(scar.burn_date) >= first - pd.Timedelta(days=8)) & (pd.to_datetime(scar.burn_date) <= last + pd.Timedelta(days=8))
    scar.to_csv(folder / "mcd64a1_burned_pixels_domain_plus_3km.csv", index=False)
    sel = scar[scar.in_event_window]
    out["pixels_in_domain_plus_3km_any_date"] = int(len(scar))
    out["pixels_event_window"] = int(len(sel))
    out["pixels_outside_event_window"] = int(len(scar) - len(sel))
    if sel.empty:
        out["verdict"] = "no burned pixels in the event window"
        return out, scar
    sx, sy = km_xy(sel.lat.values, sel.lon.values, row.ign_lat, row.ign_lon)
    ex, ey = ev.x_km.values, ev.y_km.values
    d_ev_to_scar = np.min(np.hypot(ex[:, None] - sx[None, :], ey[:, None] - sy[None, :]), axis=1)
    d_scar_to_ev = np.min(np.hypot(sx[:, None] - ex[None, :], sy[:, None] - ey[None, :]), axis=1)
    nh = ev.confidence.isin(["n", "h"]).values
    centroid_off = float(math.hypot(sx.mean() - ex.mean(), sy.mean() - ey.mean()))
    out.update({
        "scar_area_km2": round(len(sel) * PIX_KM ** 2, 2),
        "scar_bbox_km": {"east_west": round(float(sx.max() - sx.min() + PIX_KM), 2), "north_south": round(float(sy.max() - sy.min() + PIX_KM), 2)},
        "viirs_bbox_km": {"east_west": round(float(ex.max() - ex.min() + 0.375), 2), "north_south": round(float(ey.max() - ey.min() + 0.375), 2)},
        "scar_centroid": [round(float(sel.lat.mean()), 4), round(float(sel.lon.mean()), 4)],
        "viirs_centroid": [round(float(ev.latitude.mean()), 4), round(float(ev.longitude.mean()), 4)],
        "centroid_offset_km": round(centroid_off, 2),
        "detections_within_1km_of_scar_pct_all": round(100 * float((d_ev_to_scar <= 1.0).mean()), 1),
        "detections_within_1km_of_scar_pct_nh": round(100 * float((d_ev_to_scar[nh] <= 1.0).mean()), 1) if nh.any() else None,
        "median_detection_to_scar_km": round(float(np.median(d_ev_to_scar)), 2),
        "median_scar_pixel_to_detection_km": round(float(np.median(d_scar_to_ev)), 2),
        "scar_pixels_within_1km_of_a_detection_pct": round(100 * float((d_scar_to_ev <= 1.0).mean()), 1),
        "burn_date_range": [sel.burn_date.min(), sel.burn_date.max()],
        "uncertainty_days_median": float(sel.uncertainty_days.median()),
        "burn_date_first_minus_first_detection_days": int((pd.Timestamp(sel.burn_date.min()) - pd.Timestamp(row.first_date)).days),
    })
    hull_area = float(row.hull_km2)
    out["scar_area_over_viirs_hull_area"] = round(out["scar_area_km2"] / hull_area, 2) if hull_area > 0 else None
    out["verdict"] = "consistent" if centroid_off <= 2.0 and (out["detections_within_1km_of_scar_pct_nh"] or 0) >= 70 else "not consistent (see numbers)"
    return out, scar


def weather_check(row, folder):
    out = {}
    for name in ("era5land_temperature_humidity", "era5_wind_and_surface", "best_match_sensitivity_not_reanalysis"):
        df = pd.read_csv(folder / f"weather_{name}.csv")
        meta = json.loads((folder / f"weather_{name}.json").read_text())
        t = pd.to_datetime(df.time)
        first_ts = pd.Timestamp(f"{row.first_date} {row.first_time_utc[:2]}:{row.first_time_utc[2:]}")
        horizon = first_ts + pd.Timedelta(hours=48)
        covered = bool((t.min() <= first_ts.floor('h')) and (t.max() >= horizon.floor('h')))
        d = {"grid_cell": [meta["latitude"], meta["longitude"]], "distance_ignition_to_cell_km": round(float(math.hypot(*km_xy(meta["latitude"], meta["longitude"], row.ign_lat, row.ign_lon))), 1),
             "hours": int(len(df)), "covers_first_detection_to_plus_48h": covered, "nulls": {c: int(df[c].isna().sum()) for c in df.columns if c != "time"}}
        for c in df.columns:
            if c == "time" or df[c].isna().all():
                continue
            d[c] = {"min": round(float(df[c].min()), 1), "mean": round(float(df[c].mean()), 1), "max": round(float(df[c].max()), 1)}
        win = df[(t >= first_ts.floor('h')) & (t <= horizon.floor('h'))]
        if "wind_speed_10m" in win and win.wind_speed_10m.notna().any():
            d["window_first_det_to_plus48h"] = {"hours": int(len(win)), "wind_ms_mean": round(float(win.wind_speed_10m.mean()), 2), "wind_ms_max": round(float(win.wind_speed_10m.max()), 2),
                                                "rh_min_pct": float(win.relative_humidity_2m.min()), "t_max_c": float(win.temperature_2m.max())}
        out[name] = d
    return out


def main():
    cand = pd.read_csv(WEBSITE / "results/resq2_incident_candidates.csv", dtype={"first_time_utc": str, "first_time_ist": str})
    for iid in INCIDENTS:
        row = next(cand[cand.event_id == iid].itertuples())
        folder = OUT / iid
        res = {"incident_id": iid, "forest": forest_check(row, folder)}
        allv, ev = event_detections(row, folder)
        res["viirs_cluster"] = {"detections_in_fetched_box_type0": int(len(allv)), "event_detections": int(len(ev)), "event_n_h": int(ev.confidence.isin(["n", "h"]).sum()),
                                "csv_n_det": int(row.n_det), "first": f"{ev.sort_values(['acq_date','acq_time']).iloc[0].acq_date} {int(ev.sort_values(['acq_date','acq_time']).iloc[0].acq_time):04d} UTC",
                                "last_date": ev.acq_date.max(), "overpasses": int(ev.groupby(['acq_date', 'satellite', 'daynight']).ngroups), "csv_extent_km": float(row.extent_km),
                                "centroid": [round(float(ev.latitude.mean()), 4), round(float(ev.longitude.mean()), 4)]}
        scar, _ = scar_check(row, folder, ev)
        res["scar"] = scar
        res["weather"] = weather_check(row, folder)
        (folder / "input_checks.json").write_text(json.dumps(res, indent=1))
        print(iid, "forest:", res["forest"]["ignition_pixel_class"], res["forest"]["forest_pass"], "| scar:", scar.get("verdict"), "| vi:", res["viirs_cluster"]["event_detections"], "/", row.n_det)


if __name__ == "__main__":
    main()

"""RESQ-3: fetch the inputs of the four demo incidents into data/resq2/<incident_id>/.

No credentials are used and none are read. Sources (all anonymous):
  * MCD64A1 granules (original HDF, same file name and size as the LAADS archive) from the
    Microsoft Planetary Computer blob copy, with the anonymous container SAS token of its public API.
  * ESA WorldCover 2021 v200 and Copernicus GLO-30 DEM: cloud-optimised GeoTIFFs on AWS, windowed range reads only.
  * VIIRS: copied/filtered from the staged local FIRMS files (no network).
  * Hourly weather: Open-Meteo archive API (ERA5 / ERA5-Land reanalysis), no key.
Nothing is interpolated; the raw API responses are stored next to the tables derived from them.
"""
import json
import math
import sys
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np
import pandas as pd
import rasterio
from rasterio.merge import merge

WEBSITE = Path(__file__).resolve().parents[2]
OUT = WEBSITE / "data/resq2"
FIRMS = Path("/Users/kireeti/wildfire-data/raw/_staging_firms")
INCIDENTS = ["E2023-078506", "E2024-133629", "E2024-131853", "E2024-135332"]
PAD_KM = 0.5
PC = "https://planetarycomputer.microsoft.com/api"
WC_URL = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{tile}_Map.tif"
DEM_URL = "https://copernicus-dem-30m.s3.eu-central-1.amazonaws.com/Copernicus_DSM_COG_10_{tile}_DEM/Copernicus_DSM_COG_10_{tile}_DEM.tif"
UA = {"User-Agent": "resq-research-fetch/0.1 (local investigation)"}


def get_json(url: str, data: dict | None = None):
    req = urllib.request.Request(url, headers={**UA, "Content-Type": "application/json"}, data=None if data is None else json.dumps(data).encode())
    return json.load(urllib.request.urlopen(req, timeout=90))


def window_bounds(row) -> tuple[float, float, float, float]:
    half_km = row.domain_side_km / 2 + PAD_KM
    dlat = half_km / 111.2
    dlon = half_km / (111.32 * math.cos(math.radians(row.bbox_centre_lat)))
    return (row.bbox_centre_lon - dlon, row.bbox_centre_lat - dlat, row.bbox_centre_lon + dlon, row.bbox_centre_lat + dlat)


def fetch_window(urls: list[str], bounds, out: Path, description: str) -> dict:
    if out.exists():
        with rasterio.open(out) as r:
            return {"file": out.name, "shape": [r.height, r.width], "res_deg": r.res, "cached": True}
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif", GDAL_HTTP_MAX_RETRY="3"):
        srcs = [rasterio.open("/vsicurl/" + u) for u in urls]
        try:
            data, transform = merge(srcs, bounds=bounds)
            profile = {"driver": "GTiff", "height": data.shape[1], "width": data.shape[2], "count": data.shape[0], "dtype": data.dtype, "crs": srcs[0].crs, "transform": transform, "compress": "deflate", "nodata": srcs[0].nodata}
            with rasterio.open(out, "w", **profile) as dst:
                dst.write(data)
                dst.update_tags(source="; ".join(urls), window_bounds=str(bounds), note=description)
            return {"file": out.name, "shape": [int(data.shape[1]), int(data.shape[2])], "res_deg": [float(abs(transform.a)), float(abs(transform.e))], "cached": False, "sources": urls}
        finally:
            for s in srcs:
                s.close()


def tiles(bounds, size, fmt_dem=False):
    w, s, e, n = bounds
    out = []
    for la in range(math.floor(s / size) * size, math.floor(n / size) * size + 1, size):
        for lo in range(math.floor(w / size) * size, math.floor(e / size) * size + 1, size):
            out.append((la, lo))
    return out


def fetch_mcd(row, folder: Path, listing: dict) -> list[dict]:
    first, last = pd.Timestamp(row.first_date), pd.Timestamp(row.last_date)
    months = pd.period_range(first - pd.Timedelta(days=8), last + pd.Timedelta(days=8), freq="M")
    h, v = int(row.mcd64a1_tile[1:3]), int(row.mcd64a1_tile[4:6])
    token = get_json(f"{PC}/sas/v1/token/modiseuwest/modis-061")["token"]          # anonymous container token, not logged
    results = []
    for m in months:
        start, end = m.start_time.strftime("%Y-%m-%dT00:00:00Z"), m.end_time.strftime("%Y-%m-%dT00:00:00Z")
        res = get_json(f"{PC}/stac/v1/search", {"collections": ["modis-64A1-061"], "datetime": f"{start}/{end}", "query": {"modis:horizontal-tile": {"eq": h}, "modis:vertical-tile": {"eq": v}}, "limit": 5})
        for feat in res["features"]:
            href = feat["assets"]["hdf"]["href"]
            name = href.rsplit("/", 1)[1]
            dest = folder / name
            if not dest.exists():
                dest.write_bytes(urllib.request.urlopen(urllib.request.Request(href + "?" + token, headers=UA), timeout=180).read())
            size = dest.stat().st_size
            results.append({"file": name, "bytes": size, "laads_listing_bytes": listing.get(name), "size_matches_laads": listing.get(name) == size, "month": str(m), "source": href})
    return results


def fetch_viirs(row, folder: Path, bounds) -> dict:
    w, s, e, n = bounds
    mlat, mlon = 3.0 / 111.2, 3.0 / (111.32 * math.cos(math.radians(row.bbox_centre_lat)))
    d0 = (pd.Timestamp(row.first_date) - pd.Timedelta(days=3)).strftime("%Y-%m-%d")
    d1 = (pd.Timestamp(row.last_date) + pd.Timedelta(days=3)).strftime("%Y-%m-%d")
    parts = []
    for path in sorted(FIRMS.glob("VIIRS_*_SP_*.csv")):
        stamp = path.stem[-10:]
        if stamp < (pd.Timestamp(d0) - pd.Timedelta(days=5)).strftime("%Y-%m-%d") or stamp > d1:
            continue
        d = pd.read_csv(path, dtype={"confidence": str})
        d = d[d.latitude.between(s - mlat, n + mlat) & d.longitude.between(w - mlon, e + mlon) & (d.acq_date >= d0) & (d.acq_date <= d1)]
        if len(d):
            parts.append(d.assign(source_file=path.name))
    df = pd.concat(parts).drop_duplicates(["latitude", "longitude", "acq_date", "acq_time", "satellite"]).sort_values(["acq_date", "acq_time"])
    df.to_csv(folder / "viirs_detections.csv", index=False)
    return {"file": "viirs_detections.csv", "rows": int(len(df)), "date_range": [d0, d1], "margin_km": 3.0, "types": {int(k): int(v) for k, v in df.type.value_counts().items()}, "confidence": df.confidence.value_counts().to_dict()}


def fetch_weather(row, folder: Path) -> dict:
    first, last = pd.Timestamp(row.first_date), pd.Timestamp(row.last_date)
    start = (first - pd.Timedelta(days=1)).strftime("%Y-%m-%d")
    end = (first + pd.Timedelta(days=3)).strftime("%Y-%m-%d")          # D-1 .. D+3 covers "event date + following 48 h" from any hour of D
    base = "https://archive-api.open-meteo.com/v1/archive"
    common = {"latitude": f"{row.ign_lat:.5f}", "longitude": f"{row.ign_lon:.5f}", "start_date": start, "end_date": end, "timezone": "GMT", "wind_speed_unit": "ms"}
    runs = {
        "era5land_temperature_humidity": {"models": "era5_land", "hourly": "temperature_2m,relative_humidity_2m,dew_point_2m"},
        "era5_wind_and_surface": {"models": "era5", "hourly": "wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m,relative_humidity_2m"},
        "best_match_sensitivity_not_reanalysis": {"models": "best_match", "hourly": "wind_speed_10m,wind_direction_10m,temperature_2m,relative_humidity_2m"},
    }
    meta = {}
    for name, extra in runs.items():
        url = base + "?" + urllib.parse.urlencode({**common, **extra})
        payload = get_json(url)
        (folder / f"weather_{name}.json").write_text(json.dumps(payload, indent=1))
        h = payload["hourly"]
        frame = pd.DataFrame(h)
        frame.to_csv(folder / f"weather_{name}.csv", index=False)
        nulls = {k: int(frame[k].isna().sum()) for k in frame.columns if k != "time"}
        times = pd.to_datetime(frame.time)
        meta[name] = {"model": extra["models"], "request_url": url, "grid_cell_lat": payload["latitude"], "grid_cell_lon": payload["longitude"], "elevation_m": payload.get("elevation"),
                      "units": payload["hourly_units"], "hours": int(len(frame)), "first": str(times.iloc[0]), "last": str(times.iloc[-1]), "hourly_step_ok": bool((times.diff().dropna() == pd.Timedelta(hours=1)).all()), "null_counts": nulls}
    return meta


def main(only=None):
    cand = pd.read_csv(WEBSITE / "results/resq2_incident_candidates.csv", dtype={"first_time_utc": str, "first_time_ist": str})
    listing = {}
    sizes = WEBSITE / "results/resq2_mcd64a1_download_sizes.json"
    if sizes.exists():
        listing = json.loads(sizes.read_text())["files_detail"]
    for iid in only or INCIDENTS:
        row = next(cand[cand.event_id == iid].itertuples())
        folder = OUT / iid
        (folder / "mcd64a1").mkdir(parents=True, exist_ok=True)
        bounds = window_bounds(row)
        report = {"incident_id": iid, "state": row.state, "ignition": [row.ign_lat, row.ign_lon], "domain_centre": [row.bbox_centre_lat, row.bbox_centre_lon],
                  "domain_side_km": row.domain_side_km, "window_pad_km": PAD_KM, "window_bounds_wsen": bounds, "first_detection_utc": f"{row.first_date} {row.first_time_utc[:2]}:{row.first_time_utc[2:]}", "last_detection_date": row.last_date}
        wc_urls = [WC_URL.format(tile=f"N{la:02d}E{lo:03d}") for la, lo in tiles(bounds, 3)]
        report["worldcover"] = fetch_window(wc_urls, bounds, folder / "worldcover_2021_window.tif", "ESA WorldCover 2021 v200, 10 m, window")
        dem_urls = [DEM_URL.format(tile=f"N{la:02d}_00_E{lo:03d}_00") for la, lo in tiles(bounds, 1)]
        report["copernicus_dem"] = fetch_window(dem_urls, bounds, folder / "copernicus_dem_glo30_window.tif", "Copernicus GLO-30 DSM, ~30 m, window")
        report["viirs"] = fetch_viirs(row, folder, bounds)
        report["weather"] = fetch_weather(row, folder)
        report["mcd64a1"] = fetch_mcd(row, folder / "mcd64a1", listing)
        (folder / "fetch_report.json").write_text(json.dumps(report, indent=1, default=str))
        print(iid, "ok", {k: report[k].get("file", None) if isinstance(report[k], dict) else len(report[k]) for k in ("worldcover", "copernicus_dem", "viirs", "mcd64a1")}, flush=True)


if __name__ == "__main__":
    main(sys.argv[1:] or None)

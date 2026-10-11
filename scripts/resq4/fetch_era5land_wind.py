"""RESQ-4 step 3: native ERA5-Land 10 m u/v wind (0.1 deg, hourly) at each accepted ignition point via CDS.

Uses the CDS client with the owner's ~/.cdsapirc; the key is never read or printed here.
D-1 00:00 .. D+3 23:00 UTC (D = first-detection date), nearest ERA5-Land grid point, nothing interpolated.
Usage: fetch_era5land_wind.py <incident_id> ...
"""
import json
import math
import sys
import traceback
from pathlib import Path

import numpy as np
import pandas as pd
import xarray as xr

WEBSITE = Path(__file__).resolve().parents[2]
OUT = WEBSITE / "data/resq2"


def retrieve(client, row, days, target: Path):
    parts = []
    for (year, month), group in pd.Series(days).groupby([days.year, days.month]):
        part = target.with_name(f"{target.stem}_{year}{month:02d}.nc")
        if not part.exists():
            client.retrieve("reanalysis-era5-land", {
                "variable": ["10m_u_component_of_wind", "10m_v_component_of_wind"],
                "year": [f"{year}"], "month": [f"{month:02d}"], "day": [f"{d.day:02d}" for d in group],
                "time": [f"{h:02d}:00" for h in range(24)],
                "area": [round(row.ign_lat + 0.1, 3), round(row.ign_lon - 0.1, 3), round(row.ign_lat - 0.1, 3), round(row.ign_lon + 0.1, 3)],
                "data_format": "netcdf", "download_format": "unarchived",
            }, str(part))
        parts.append(part)
    return parts


def main(ids):
    import cdsapi
    cand = pd.read_csv(WEBSITE / "results/resq2_incident_candidates.csv", dtype={"first_time_utc": str, "first_time_ist": str})
    client = cdsapi.Client(quiet=True, progress=False)
    status = {}
    for iid in ids:
        row = next(cand[cand.event_id == iid].itertuples())
        first = pd.Timestamp(row.first_date)
        days = pd.date_range(first - pd.Timedelta(days=1), first + pd.Timedelta(days=3), freq="D")
        folder = OUT / iid
        try:
            parts = retrieve(client, row, days, folder / "weather_era5land_native_u10_v10.nc")
            ds = xr.concat([xr.open_dataset(p) for p in parts], dim=[d for d in xr.open_dataset(parts[0]).dims if d in ("valid_time", "time")][0])
            tdim = "valid_time" if "valid_time" in ds.dims else "time"
            lat = ds["latitude"].values
            lon = ds["longitude"].values
            ii = int(np.argmin(np.abs(lat - row.ign_lat)))
            jj = int(np.argmin(np.abs(lon - row.ign_lon)))
            u = ds["u10"].isel(latitude=ii, longitude=jj).values.astype(float)
            v = ds["v10"].isel(latitude=ii, longitude=jj).values.astype(float)
            t = pd.to_datetime(ds[tdim].values)
            df = pd.DataFrame({"time": t, "u10_ms": u, "v10_ms": v})
            df["wind_speed_ms"] = np.hypot(u, v)
            df["wind_from_deg"] = (270.0 - np.degrees(np.arctan2(v, u))) % 360.0
            df = df.sort_values("time").drop_duplicates("time")
            df.to_csv(folder / "weather_era5land_native_wind.csv", index=False)
            status[iid] = {"ok": True, "grid_cell": [float(lat[ii]), float(lon[jj])], "hours": int(len(df)), "first": str(df.time.iloc[0]), "last": str(df.time.iloc[-1]),
                           "nulls": int(df[["u10_ms", "v10_ms"]].isna().sum().sum()), "step_ok": bool((df.time.diff().dropna() == pd.Timedelta(hours=1)).all()),
                           "distance_km": round(math.hypot((lat[ii] - row.ign_lat) * 111.2, (lon[jj] - row.ign_lon) * 111.32 * math.cos(math.radians(row.ign_lat))), 2),
                           "grid_points_in_request": [int(len(lat)), int(len(lon))]}
        except Exception as exc:                      # report the exact error, continue with the rest
            status[iid] = {"ok": False, "error_type": type(exc).__name__, "error": str(exc)[:1500]}
            traceback.print_exc(file=sys.stderr)
        print(iid, json.dumps(status[iid])[:400], flush=True)
    (OUT / "era5land_fetch_status.json").write_text(json.dumps(status, indent=1))


if __name__ == "__main__":
    main(sys.argv[1:])

"""Weather context: Open-Meteo current wind (no key) and an optional ERA5 history fetcher (cdsapi)."""
from __future__ import annotations

import math
import os
from datetime import datetime, timezone

import httpx
from sqlalchemy import text

from .. import feeds as _feeds
from . import FeedError

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
CELL_DEG = 0.25
CACHE_HOURS = 3


def cell(value: float) -> float:
    return round(round(float(value) / CELL_DEG) * CELL_DEG, 4)


def fetch_open_meteo(lat: float, lon: float, client: httpx.Client | None = None) -> dict:
    params = {"latitude": lat, "longitude": lon, "wind_speed_unit": "ms", "timezone": "GMT",
              "current": "wind_speed_10m,wind_direction_10m,temperature_2m,relative_humidity_2m"}
    owns = client is None
    client = client or _feeds.http_client()
    try:
        response = client.get(OPEN_METEO_URL, params=params)
        if response.status_code != 200:
            raise FeedError(f"Weather feed returned HTTP {response.status_code}")
        cur = response.json()["current"]
        valid = datetime.fromisoformat(cur["time"]).replace(tzinfo=timezone.utc)
        return {"valid_time": valid, "wind_speed_ms": float(cur["wind_speed_10m"]),
                "wind_dir_deg": float(cur["wind_direction_10m"]),
                "temperature_c": None if cur.get("temperature_2m") is None else float(cur["temperature_2m"]),
                "humidity_pct": None if cur.get("relative_humidity_2m") is None else float(cur["relative_humidity_2m"]),
                "source": "open-meteo"}
    except httpx.TimeoutException:
        raise FeedError("Weather feed timed out") from None
    except httpx.HTTPError as exc:
        raise FeedError(f"Weather feed request failed ({type(exc).__name__})") from None
    except (KeyError, TypeError, ValueError):
        raise FeedError("Weather feed returned an unexpected response") from None
    finally:
        if owns:
            client.close()


def uv_to_wind(u: float, v: float) -> tuple[float, float]:
    """Speed (m/s) and meteorological direction (degrees the wind blows FROM) from u/v components."""
    return math.hypot(u, v), (270.0 - math.degrees(math.atan2(v, u))) % 360.0


def _default_reader(path: str, lat: float, lon: float) -> dict:
    try:
        import xarray as xr  # type: ignore
    except ImportError:
        raise FeedError("netCDF reader (xarray) not installed") from None
    with xr.open_dataset(path) as ds:
        point = ds.sel(latitude=lat, longitude=lon, method="nearest").isel(valid_time=0) if "valid_time" in ds.dims \
            else ds.sel(latitude=lat, longitude=lon, method="nearest").isel(time=0)
        return {"u10": float(point["u10"]), "v10": float(point["v10"]), "t2m": float(point["t2m"])}


def fetch_era5(lat: float, lon: float, day: str, hour: int = 12, *, cds_client=None, reader=None) -> dict:
    """ERA5 single-levels reanalysis at one point/hour (UTC). `day` is YYYY-MM-DD.

    Needs the optional `cdsapi` package (and xarray for the default reader); credentials come from
    CDSAPI_URL / CDSAPI_KEY in the environment, which cdsapi reads itself.
    """
    if cds_client is None:
        try:
            import cdsapi  # type: ignore
        except ImportError:
            raise FeedError("cdsapi not installed") from None
        if not (os.environ.get("CDSAPI_URL") and os.environ.get("CDSAPI_KEY")):
            raise FeedError("Historic weather feed is not connected (CDSAPI_URL / CDSAPI_KEY not set)", not_configured=True)
        cds_client = cdsapi.Client(quiet=True, progress=False)
    try:
        when = datetime.strptime(day, "%Y-%m-%d")
    except ValueError:
        raise FeedError("day must be YYYY-MM-DD") from None
    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        target = os.path.join(tmp, "era5.nc")
        request = {"product_type": ["reanalysis"], "variable": ["10m_u_component_of_wind", "10m_v_component_of_wind", "2m_temperature"],
                   "year": [f"{when.year}"], "month": [f"{when.month:02d}"], "day": [f"{when.day:02d}"], "time": [f"{int(hour):02d}:00"],
                   "area": [lat + 0.125, lon - 0.125, lat - 0.125, lon + 0.125], "data_format": "netcdf", "download_format": "unarchived"}
        try:
            cds_client.retrieve("reanalysis-era5-single-levels", request, target)
        except Exception as exc:  # cdsapi raises assorted types; never forward their text (may echo URLs)
            raise FeedError(f"Historic weather request failed ({type(exc).__name__})") from None
        values = (reader or _default_reader)(target, lat, lon)
    speed, direction = uv_to_wind(values["u10"], values["v10"])
    return {"valid_time": when.replace(hour=int(hour), tzinfo=timezone.utc), "wind_speed_ms": speed, "wind_dir_deg": direction,
            "temperature_c": values["t2m"] - 273.15, "humidity_pct": None, "source": "era5"}


def store(lat: float, lon: float, value: dict, engine=None) -> None:
    if engine is None:
        from ...database.session import engine
    with engine.begin() as db:
        db.execute(text("""INSERT INTO resq_weather_context (lat_cell,lon_cell,valid_time,wind_speed_ms,wind_dir_deg,temperature_c,humidity_pct,source)
            VALUES (:la,:lo,:vt,:ws,:wd,:t,:h,:src)
            ON CONFLICT (lat_cell,lon_cell,valid_time,source) DO UPDATE SET wind_speed_ms=EXCLUDED.wind_speed_ms,
              wind_dir_deg=EXCLUDED.wind_dir_deg, temperature_c=EXCLUDED.temperature_c, humidity_pct=EXCLUDED.humidity_pct, fetched_at=now()"""),
                   {"la": cell(lat), "lo": cell(lon), "vt": value["valid_time"], "ws": value["wind_speed_ms"], "wd": value["wind_dir_deg"],
                    "t": value["temperature_c"], "h": value["humidity_pct"], "src": value["source"]})


def cached(lat: float, lon: float, engine=None) -> dict | None:
    """Nearest cached reading (within one cell) fetched in the last CACHE_HOURS hours."""
    if engine is None:
        from ...database.session import engine
    with engine.connect() as db:
        row = db.execute(text("""SELECT lat_cell,lon_cell,valid_time,wind_speed_ms,wind_dir_deg,temperature_c,humidity_pct,source,fetched_at
            FROM resq_weather_context
            WHERE fetched_at >= now() - make_interval(hours => :h) AND valid_time >= now() - make_interval(hours => :h)
              AND abs(lat_cell-:la) <= :c AND abs(lon_cell-:lo) <= :c
            ORDER BY (lat_cell-:la)*(lat_cell-:la)+(lon_cell-:lo)*(lon_cell-:lo), valid_time DESC LIMIT 1"""),
                         {"h": CACHE_HOURS, "la": lat, "lo": lon, "c": CELL_DEG}).mappings().first()
    return dict(row) if row else None


def context(lat: float, lon: float, client: httpx.Client | None = None, engine=None) -> tuple[dict, bool]:
    """(row, was_cached). Falls back to Open-Meteo and caches the result."""
    hit = cached(lat, lon, engine)
    if hit:
        return hit, True
    value = fetch_open_meteo(lat, lon, client)
    store(lat, lon, value, engine)
    hit = cached(lat, lon, engine)
    if hit is None:  # reading older than the cache window: still return what we fetched
        hit = {**value, "lat_cell": cell(lat), "lon_cell": cell(lon), "fetched_at": datetime.now(timezone.utc)}
    return hit, False

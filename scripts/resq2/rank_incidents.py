"""Rank RESQ-2 incident candidates and propose 10-15 (no simulation output is used).

Reads results/resq2_events_all.csv (build_incident_candidates.py) and writes
results/resq2_incident_candidates.csv with score, flags, proposed domain and needs.

Rules (fixed in advance):
  candidate  : >= 3 overpasses, >= 2 overpasses with >= 3 detections, footprint extent 1-20 km, >= 8 detections
  score      : 2.0*overpass_richness + 1.5*ignition_clarity + 1.5*extent_fit + 1.0*forest + 1.0*confidence + 0.5*weather_local
  proposal   : forest cell, >= 3 overpasses with >= 3 detections, extent 3-20 km, duration <= 10 d,
               both satellites, gfs00 month available, apparent growth <= 5 km/day from the ignition
               (added after the first pass showed saturated scores: it screens out multi-ignition complexes); greedy by score; <= 3 per state, <= 8 per year,
               >= 30 km apart; Similipal reference event kept separate.
"""
import math
from pathlib import Path

import numpy as np
import pandas as pd

WEBSITE = Path(__file__).resolve().parents[2]
SRC = WEBSITE / "results/resq2_events_all.csv"
OUT = WEBSITE / "results/resq2_incident_candidates.csv"
SIMILIPAL_EVENT = "E2024-146537"      # 2024-03-30 first detection, 10 MCD64A1 pixels, 2.15 km2 (see docs)


def km(a_lat, a_lon, b_lat, b_lon):
    p = math.pi / 180
    h = math.sin((b_lat - a_lat) * p / 2) ** 2 + math.cos(a_lat * p) * math.cos(b_lat * p) * math.sin((b_lon - a_lon) * p / 2) ** 2
    return 2 * 6371.0088 * math.asin(math.sqrt(h))


def tiles(row, side_km: float) -> tuple[str, str]:
    """Copernicus DEM (1 deg) and ESA WorldCover (3 deg) tiles that cover the square domain."""
    half_lat = side_km / 2 / 111.2
    half_lon = side_km / 2 / (111.32 * math.cos(math.radians(row.bbox_centre_lat)))
    lat0, lat1 = row.bbox_centre_lat - half_lat, row.bbox_centre_lat + half_lat
    lon0, lon1 = row.bbox_centre_lon - half_lon, row.bbox_centre_lon + half_lon
    dem = [f"N{la:02d}_00_E{lo:03d}_00" for la in range(math.floor(lat0), math.floor(lat1) + 1) for lo in range(math.floor(lon0), math.floor(lon1) + 1)]
    wc = [f"N{la:02d}E{lo:03d}" for la in range(math.floor(lat0 / 3) * 3, math.floor(lat1 / 3) * 3 + 1, 3) for lo in range(math.floor(lon0 / 3) * 3, math.floor(lon1 / 3) * 3 + 1, 3)]
    return ";".join(dem), ";".join(wc)


def domain(row) -> dict:
    """Square domain of 30 m cells containing the observed footprint plus a margin."""
    extent = max(row.bbox_ew_km, row.bbox_ns_km)
    margin = max(2.0, 0.5 * extent)
    side = max(6.0, math.ceil(extent + 2 * margin))
    tight = max(6.0, math.ceil(extent + 4.0))
    n = int(side * 1000 / 30)
    dem, wc = tiles(row, side)
    return {"domain_side_km": side, "domain_margin_km": round(margin, 1), "domain_tight_side_km": tight, "grid_cells_per_side": n, "grid_cells_total": n * n,
            "est_cell2fire_s_per_48h": round(0.1 * n * n / 1600 * 1.0, 1), "dem_tiles": dem, "worldcover_tiles": wc}


def main() -> None:
    d = pd.read_csv(SRC, dtype={"first_time_utc": str, "first_time_ist": str})
    c = d[(d.n_overpass >= 3) & (d.n_overpass_ge3 >= 2) & d.extent_km.between(1, 20) & (d.n_det >= 8)].copy()
    c["apparent_km_per_day"] = (c.max_dist_ign_km / np.maximum(c.duration_days, 1.0)).round(2)
    c["s_over"] = np.minimum(c.n_overpass_ge3, 8) / 8
    c["s_clear"] = 0.5 * (c.prior_det_5km_3d == 0) + 0.5 * (c.first_overpass_spread_km <= 1.0)
    c["s_ext"] = np.where(c.extent_km.between(3, 12), 1.0, np.where(c.extent_km.between(1, 20), 0.6, 0.0))
    c["s_forest"] = c.forest_cell_5km.astype(float)
    c["s_conf"] = c.n_det_nh / c.n_det
    c["s_weather"] = (c.gfs00_export_month_local & (c.gfs_pixel_dist_km <= 20)).astype(float)
    c["score"] = 2.0 * c.s_over + 1.5 * c.s_clear + 1.5 * c.s_ext + 1.0 * c.s_forest + 1.0 * c.s_conf + 0.5 * c.s_weather
    c["eligible_proposal"] = (c.forest_cell_5km & (c.n_overpass_ge3 >= 3) & c.extent_km.between(3, 20) & (c.duration_days <= 10) & (c.n_sat == 2) & (c.apparent_km_per_day <= 5.0) & c.gfs00_export_month_local & (c.s_weather > 0))
    c = c.sort_values(["score", "n_det"], ascending=False).reset_index(drop=True)
    c["rank_all"] = np.arange(1, len(c) + 1)

    chosen, by_state, by_year = [], {}, {}
    for i, r in c[c.eligible_proposal].iterrows():
        year = r.first_date[:4]
        if by_state.get(r.state, 0) >= 3 or by_year.get(year, 0) >= 8:
            continue
        if any(km(r.ign_lat, r.ign_lon, c.at[j, "ign_lat"], c.at[j, "ign_lon"]) < 30 for j in chosen):
            continue
        chosen.append(i)
        by_state[r.state] = by_state.get(r.state, 0) + 1
        by_year[year] = by_year.get(year, 0) + 1
        if len(chosen) == 15:
            break
    c["proposed"] = False
    c.loc[chosen, "proposed"] = True
    c["proposed_rank"] = np.nan
    c.loc[chosen, "proposed_rank"] = np.arange(1, len(chosen) + 1)
    dom = pd.DataFrame([domain(r) for r in c.itertuples()])
    c = pd.concat([c, dom], axis=1)
    c["similipal_reference"] = c.event_id == SIMILIPAL_EVENT
    # (a) demo replay: a proposed incident with a domain <= 12 km (fast runs, one screen);
    # (b) paper-2 validation set: every proposed incident, once the listed inputs are fetched.
    c["usable_demo_replay"] = c.proposed & (c.domain_side_km <= 12)
    c["usable_paper2_validation"] = c.proposed
    def needs(r):
        if not r.proposed:
            return ""
        first = pd.Timestamp(r.first_date)
        months = sorted({f"{t.year}-{t.month:02d}" for t in pd.period_range(first - pd.Timedelta(days=8), pd.Timestamp(r.last_date) + pd.Timedelta(days=8), freq="M")})
        gfs = sorted({f"gfs00_{t.year}_{t.month:02d}" for t in pd.period_range(first - pd.Timedelta(days=1), first + pd.Timedelta(days=3), freq="M")})
        mcd = "local" if r.mcd64a1_local else "download"
        return (f"MCD64A1 {r.mcd64a1_tile} {mcd} months {','.join(months)}; WorldCover window {r.worldcover_tiles}; CopDEM window {r.dem_tiles}; "
                f"weather local {','.join(gfs)} pixel {r.gfs_pixel} (+ hourly fill for 18-05 UTC); VIIRS local; fuel crosswalk unvalidated")
    c["needs"] = [needs(r) for r in c.itertuples()]
    c.to_csv(OUT, index=False)
    print(len(c), "candidates;", len(chosen), "proposed;", int(c.eligible_proposal.sum()), "eligible")
    cols = ["proposed_rank", "event_id", "state", "ign_lat", "ign_lon", "first_date", "first_time_utc", "n_det", "n_overpass", "n_overpass_ge3", "extent_km", "duration_days", "score", "domain_side_km", "mcd64a1_tile", "worldcover_tile", "worldcover_class_local"]
    print(c[c.proposed][cols].to_string(index=False))
    print(c[c.similipal_reference][["rank_all", "event_id", "score", "eligible_proposal"] + cols[3:]].to_string(index=False))


if __name__ == "__main__":
    main()

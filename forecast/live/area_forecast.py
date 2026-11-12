"""Turn one day's cell scores into the area forecast the ranger card and the control-room board show.

Input: the cell scores of the deployed model (mean of five XGBoost seeds, an uncalibrated score), the fitted calibration and areas (wildfire-ignition-forecasting/results/forecast_levels.json,
written by scripts/13_forecast_levels.py), optionally the named places table (results/named_places.parquet), yesterday's output (for the change) and the fires that were detected (replay and verification).
Output (dict, written as JSON): per area of 0.5 degree (about 55 km, about 10 cells): the chance that a fire is detected in the area tomorrow, the expected number of cells with a fire, the same for this week of the year in
2019 to 2023 ("usual"), a level, and the places to look at. The label is a fire detection inside forest on the next day, new or continuing; fires already burning come from the satellite detections, not from this forecast.
Scores are never exported, only chances and levels."""
import json
from datetime import datetime, timezone
import numpy as np, pandas as pd

LEVEL_ORDER = ["none", "moderate", "high", "extreme"]
TOP_CELLS = 5                      # places to look at per area
PLACE_REACH_KM = 15.0              # a named place counts for a cell when it lies within this distance (OpenStreetMap is thin in many forests)


def load_levels(path):
    return json.load(open(path))


def _interp(x, cal):
    return np.interp(np.asarray(x, float), cal["x"], cal["y"])


def block_of(lat, lon, deg=0.5):
    return (np.floor(np.asarray(lat) / deg).astype(int)) * 1000 + np.floor(np.asarray(lon) / deg).astype(int)


def level_of(chance, levels):
    out = "none"
    for lv in levels:
        if chance >= lv["min_chance"]: out = lv["id"]
    return out


def _places_index(places):
    if places is None or len(places) == 0: return None
    from scipy.spatial import cKDTree
    lat0 = float(places.lat.mean()); k = np.cos(np.radians(lat0))
    return {"tree": cKDTree(np.c_[places.lat.values * 111.0, places.lon.values * 111.0 * k]), "places": places.reset_index(drop=True), "k": k}


def _nearest_place(idx, lat, lon, reach=PLACE_REACH_KM):
    """Nearest named place within reach, with distance (km) and the compass direction from the place to the cell."""
    if idx is None: return None
    d, i = idx["tree"].query([lat * 111.0, lon * 111.0 * idx["k"]])
    if d > reach: return None
    p = idx["places"].iloc[int(i)]; dy, dx = (lat - p.lat) * 111.0, (lon - p.lon) * 111.0 * idx["k"]
    comp = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][int(((np.degrees(np.arctan2(dx, dy)) + 360 + 22.5) % 360) // 45)]
    return {"name": str(p["name"]), "kind": str(p["kind"]), "km": round(float(d), 1), "from_place": comp if d >= 0.5 else None}


def build(day, scores, levels, places=None, previous=None, detected=None, mode="live", model=None, issued_at=None):
    """day: the forecast date (a date or 'YYYY-MM-DD'). scores: DataFrame cell_id, state, lat, lon, score (only for cells that could be scored).
    previous: yesterday's output dict (for the change). detected: DataFrame cell_id of the cells where a fire was detected on `day` (verification; replay only)."""
    day = pd.Timestamp(day); week = int(min(day.isocalendar().week, 52)); lv = levels["levels"]
    s = scores[["cell_id", "state", "lat", "lon", "score"]].copy(); s["q"] = _interp(s.score, levels["cell_calibration"]); s["block"] = block_of(s.lat, s.lon, levels["block_deg"])
    pidx = _places_index(places); blocks = {b["id"]: b for b in levels["blocks"]}
    prev = {a["id"]: a for a in (previous or {}).get("areas", [])}
    areas = []
    for bid, g in s.groupby("block"):
        info = blocks.get(int(bid))
        if info is None: continue
        pany = 1.0 - float(np.prod(1.0 - g.q.values)); chance = float(_interp(pany, levels["area_calibration"])); expected = float(g.q.sum())
        u = levels["usual"].get(str(int(bid)), {}).get(str(week)); usual_fires, usual_any = (u[0], u[1]) if u else (None, None)
        level = level_of(chance, lv); a = {"id": int(bid), "state": info["state"], "lat": info["lat"], "lon": info["lon"], "bbox": [info["lon0"], info["lat0"], info["lon0"] + levels["block_deg"], info["lat0"] + levels["block_deg"]],
                                         "cells": int(len(g)), "chance": round(chance, 3), "expected_fires": round(expected, 2), "usual_fires": usual_fires, "usual_chance": usual_any, "level": level,
                                         "reliable": bool(levels["state_reliability"].get(info["state"], False))}
        if int(bid) in prev: a["change"] = round(chance - prev[int(bid)]["chance"], 3)
        if level != "none":
            top = g.sort_values("q", ascending=False).head(TOP_CELLS); a["look"] = [{"cell_id": int(r.cell_id), "lat": round(float(r.lat), 3), "lon": round(float(r.lon), 3), "chance": round(float(r.q), 3), "place": _nearest_place(pidx, r.lat, r.lon)} for r in top.itertuples()]
        areas.append(a)
    # names: the nearest named place to the centre of the area, else "<state> area"
    for a in areas:
        n = _nearest_place(pidx, a["lat"], a["lon"], reach=25.0) if pidx else None
        a["name"] = f"near {n['name']}" if n else f"{a['state']} area {a['id']}"
    areas.sort(key=lambda a: (-LEVEL_ORDER.index(a["level"]), -a["chance"]))
    out = {"date": str(day.date()), "mode": mode, "issued_at": issued_at or datetime.now(timezone.utc).isoformat(), "levels": lv, "actions": levels["actions"], "label": levels["label"], "calibration_version": levels["version"],
           "model": model or {}, "week_of_year": week, "areas": areas,
           "summary": {k: sum(1 for a in areas if a["level"] == k) for k in LEVEL_ORDER}, "areas_scored": len(areas),
           "note": "A chance that a fire is detected in the area tomorrow (new or continuing), from a model checked on 2024 and 2025. It does not say where inside the area, how big, or how long. Fires already burning come from satellite detections."}
    if detected is not None:
        hit = set(s.loc[s.cell_id.isin(set(detected.cell_id)), "block"].astype(int)); rated = {a["id"]: a for a in areas}; flagged = [a for a in areas if a["level"] in ("high", "extreme")]
        out["outcome"] = {"areas_with_fire": len(hit), "in_high_or_extreme": sum(1 for b in hit if b in rated and rated[b]["level"] in ("high", "extreme")), "areas_rated_high_or_extreme": len(flagged),
                          "of_those_with_fire": sum(1 for a in flagged if a["id"] in hit)}
        for a in areas: a["fire_detected"] = a["id"] in hit
        fc = s.loc[s.cell_id.isin(set(detected.cell_id)), ["lat", "lon"]]; out["fire_cells"] = [[round(float(r.lat), 2), round(float(r.lon), 2)] for r in fc.itertuples()]   # where the fires were, to a forest square (about 11 km)
    if previous and previous.get("outcome"): out["yesterday"] = {"date": previous["date"], **previous["outcome"]}
    return out


def outcome_of(forecast, cells, detected_cell_ids, block_deg=0.5):
    """How a past forecast did: `forecast` is its output dict, `cells` a DataFrame cell_id, lat, lon, `detected_cell_ids` the cells where a fire was detected on its date.
    Returns the same counts `build` writes as `outcome`, so a later run can show them as "yesterday"."""
    c = cells[cells.cell_id.isin(set(detected_cell_ids))]; hit = set(block_of(c.lat.values, c.lon.values, block_deg).tolist()) if len(c) else set()
    rated = {a["id"]: a for a in forecast["areas"]}; flagged = [a for a in forecast["areas"] if a["level"] in ("high", "extreme")]
    return {"areas_with_fire": len(hit), "in_high_or_extreme": sum(1 for b in hit if b in rated and rated[b]["level"] in ("high", "extreme")), "areas_rated_high_or_extreme": len(flagged),
            "of_those_with_fire": sum(1 for a in flagged if a["id"] in hit)}

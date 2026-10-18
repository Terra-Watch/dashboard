"""Phase 0 feasibility audit for docs/simulation-redesign.

Reads FIRMS VIIRS CSV files, clusters detections into fire events, splits each event into satellite passes,
and counts how many consecutive-pass "forecast cases" show growth. It builds no model and scores nothing.

Outputs (in --out-dir): events.csv, cases.csv, summary.json, report.md.

Limits the report repeats: detections are not burned area; there is no cloud or coverage mask in the input,
so "no new detections" cannot be told apart from "not observed"; a pass is inferred from acquisition times.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
import pandas as pd

EARTH_KM = 6371.0088
PIXEL_KM = 0.375
GAP_BINS_H = [0, 6, 12, 24, 48, np.inf]
GAP_LABELS = ["<=6h", "6-12h", "12-24h", "24-48h", ">48h"]
CONF_ORDER = {"l": 0, "n": 1, "h": 2}
REQUIRED = ("latitude", "longitude", "acq_date", "acq_time")


# --------------------------------------------------------------------------- loading
def load_detections(paths, min_confidence: str = "n", keep_types=(0,)) -> pd.DataFrame:
    frames = []
    for path in paths:
        frame = pd.read_csv(path, dtype={"acq_time": str, "confidence": str})
        missing = [c for c in REQUIRED if c not in frame.columns]
        if missing:
            raise ValueError(f"{path}: missing columns {missing}")
        if frame.empty:  # header-only files (no detections in that window) would make columns object-typed
            continue
        frame["source_file"] = Path(path).name
        frames.append(frame)
    if not frames:
        raise ValueError("no input files with detections")
    df = pd.concat(frames, ignore_index=True)
    for col in ("latitude", "longitude"):
        df[col] = pd.to_numeric(df[col], errors="raise")
    df["acq_time"] = df["acq_time"].astype(str).str.replace(r"\.0$", "", regex=True).str.zfill(4)
    df["time"] = pd.to_datetime(df["acq_date"].astype(str) + " " + df["acq_time"], format="%Y-%m-%d %H%M", utc=True)
    if "type" in df.columns and keep_types is not None:
        df = df[df["type"].isin(keep_types)]
    if "confidence" in df.columns:
        conf = df["confidence"].astype(str).str.lower().str[0].map(CONF_ORDER)
        df = df[conf.fillna(CONF_ORDER["n"]) >= CONF_ORDER[min_confidence]]
    sat_col = "satellite" if "satellite" in df.columns else None
    subset = ["latitude", "longitude", "time"] + ([sat_col] if sat_col else [])
    df = df.drop_duplicates(subset=subset).sort_values("time").reset_index(drop=True)
    df["t_h"] = (df["time"] - pd.Timestamp("2000-01-01", tz="UTC")).dt.total_seconds() / 3600.0
    df["x_km"], df["y_km"] = project_laea(df["latitude"].to_numpy(), df["longitude"].to_numpy())
    return df


def project_laea(lat_deg, lon_deg, lat0_deg: float = 22.0, lon0_deg: float = 80.0):
    """Lambert azimuthal equal-area projection centred on India, in km.

    Scale error is about 1.6% at 1,500 km from the centre, far below the 0.75 km growth tolerance. A plain
    lon*cos(lat) projection is not used: it shears by about 10% per 1 km of northing at 80E.
    """
    lat, lon = np.radians(lat_deg), np.radians(lon_deg)
    lat0, lon0 = math.radians(lat0_deg), math.radians(lon0_deg)
    dlon = lon - lon0
    cos_c = np.sin(lat0) * np.sin(lat) + np.cos(lat0) * np.cos(lat) * np.cos(dlon)
    k = np.sqrt(2.0 / (1.0 + cos_c))
    x = EARTH_KM * k * np.cos(lat) * np.sin(dlon)
    y = EARTH_KM * k * (np.cos(lat0) * np.sin(lat) - np.sin(lat0) * np.cos(lat) * np.cos(dlon))
    return x, y


# --------------------------------------------------------------------------- clustering
def _neighbour_offsets():
    offsets = [(0, 0, 0)]
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dt in (-1, 0, 1):
                if (dx, dy, dt) > (0, 0, 0):
                    offsets.append((dx, dy, dt))
    return offsets


def _propagate(labels, u, v):
    """Min-label propagation with pointer jumping over the edges (u, v); mutates labels in place."""
    while True:
        m = np.minimum(labels[u], labels[v])
        new = labels.copy()
        np.minimum.at(new, u, m)
        np.minimum.at(new, v, m)
        new = new[new]
        if np.array_equal(new, labels):
            return
        labels[:] = new


def cluster_events(x_km, y_km, t_h, eps_km: float, gap_h: float, max_pairs: int = 3_000_000) -> np.ndarray:
    """Connected components of detections closer than eps_km in space and gap_h in time. Returns event ids 0..E-1.

    Detections are hashed into (x, y, time) cells of size (eps, eps, gap); candidate pairs come from the cell and its 13
    forward neighbours, are filtered exactly, and linked with vectorised min-label propagation (no per-point Python loop).
    """
    n = len(x_km)
    if n == 0:
        return np.empty(0, dtype=np.int64)
    ix = np.floor(x_km / eps_km).astype(np.int64)
    iy = np.floor(y_km / eps_km).astype(np.int64)
    it = np.floor(t_h / gap_h).astype(np.int64)
    ix, iy, it = ix - ix.min() + 1, iy - iy.min() + 1, it - it.min() + 1
    ny, nt = int(iy.max()) + 2, int(it.max()) + 2
    key = (ix * ny + iy) * nt + it
    order = np.argsort(key, kind="stable")
    uniq, start = np.unique(key[order], return_index=True)
    counts = np.diff(np.append(start, n))
    labels = np.arange(n, dtype=np.int64)
    eps2 = eps_km * eps_km
    for _ in range(50):
        before = labels.copy()
        for ox, oy, ot in _neighbour_offsets():
            same = (ox, oy, ot) == (0, 0, 0)
            nkey = key + (ox * ny + oy) * nt + ot
            pos = np.searchsorted(uniq, nkey)
            pos[pos >= len(uniq)] = len(uniq) - 1
            pts = np.flatnonzero(uniq[pos] == nkey)
            if pts.size == 0:
                continue
            cnt, st = counts[pos[pts]], start[pos[pts]]
            csum = np.cumsum(cnt)
            lo = 0
            while lo < pts.size:
                base = csum[lo - 1] if lo else 0
                hi = int(np.searchsorted(csum, base + max_pairs, side="right"))
                hi = max(hi, lo + 1)
                c = cnt[lo:hi]
                total = int(c.sum())
                a = np.repeat(pts[lo:hi], c)
                within = np.arange(total) - np.repeat(np.cumsum(c) - c, c)
                b = order[np.repeat(st[lo:hi], c) + within]
                dx, dy = x_km[a] - x_km[b], y_km[a] - y_km[b]
                ok = (dx * dx + dy * dy <= eps2) & (np.abs(t_h[a] - t_h[b]) <= gap_h)
                if same:
                    ok &= a < b
                if ok.any():
                    _propagate(labels, a[ok], b[ok])
                lo = hi
        if np.array_equal(before, labels):
            break
    _, inverse = np.unique(labels, return_inverse=True)
    return inverse.astype(np.int64)


def split_passes(times_h: np.ndarray, pass_gap_min: float = 30.0) -> np.ndarray:
    """Pass index for time-sorted acquisition times (hours). A new pass starts after a gap longer than pass_gap_min."""
    if len(times_h) == 0:
        return np.empty(0, dtype=np.int64)
    breaks = np.diff(times_h) * 60.0 > pass_gap_min
    return np.concatenate([[0], np.cumsum(breaks)]).astype(np.int64)


# --------------------------------------------------------------------------- growth
def nearest_distance_km(points_xy: np.ndarray, ref_xy: np.ndarray, chunk=2000) -> np.ndarray:
    if len(ref_xy) == 0:
        return np.full(len(points_xy), np.inf)
    out = np.empty(len(points_xy))
    for start in range(0, len(points_xy), chunk):
        p = points_xy[start:start + chunk]
        d2 = ((p[:, None, :] - ref_xy[None, :, :]) ** 2).sum(axis=2)
        out[start:start + chunk] = np.sqrt(d2.min(axis=1))
    return out


def build_cases(df: pd.DataFrame, growth_tol_km: float, min_new: int, pass_gap_min: float):
    """Return (events DataFrame, cases DataFrame). df needs event_id, t_h, x_km, y_km and the usual FIRMS columns.

    Event rows are aggregated for every event with vectorised group operations; the per-event pass/growth loop runs only for
    events whose detections span more than one possible pass, since a single-pass event cannot form a forecast case.
    """
    work = df.assign(cx=np.floor(df["x_km"].to_numpy() / PIXEL_KM).astype(np.int64),
                     cy=np.floor(df["y_km"].to_numpy() / PIXEL_KM).astype(np.int64))
    grp = work.groupby("event_id", sort=True)
    agg = grp.agg(n_detections=("t_h", "size"), t_min=("t_h", "min"), t_max=("t_h", "max"), start=("time", "min"), end=("time", "max"),
                  lat=("latitude", "mean"), lon=("longitude", "mean"))
    agg["max_frp"] = grp["frp"].max() if "frp" in work.columns else np.nan
    cells = work[["event_id", "cx", "cy"]].drop_duplicates().groupby("event_id").size()
    events = agg.assign(area_proxy_km2=cells.reindex(agg.index).to_numpy() * PIXEL_KM ** 2,
                        duration_h=agg["t_max"] - agg["t_min"], n_passes=1).reset_index()
    candidates = events.loc[events["duration_h"] * 60.0 > pass_gap_min, "event_id"].to_numpy()
    case_rows = []
    passes_by_event = {}
    sub = work[work["event_id"].isin(candidates)]
    for event_id, g in sub.groupby("event_id", sort=True):
        g = g.sort_values("t_h")
        pass_idx = split_passes(g["t_h"].to_numpy(), pass_gap_min)
        g = g.assign(pass_idx=pass_idx)
        xy = g[["x_km", "y_km"]].to_numpy()
        n_passes = int(pass_idx.max()) + 1
        passes_by_event[int(event_id)] = n_passes
        lat_c, lon_c = float(g["latitude"].mean()), float(g["longitude"].mean())
        pass_times = g.groupby("pass_idx")["t_h"].median().to_numpy()
        for k in range(1, n_passes):
            prev_mask = pass_idx < k
            nxt_mask = pass_idx == k
            dist = nearest_distance_km(xy[nxt_mask], xy[prev_mask])
            new = dist > growth_tol_km
            n_new = int(new.sum())
            case_rows.append({
                "event_id": int(event_id), "k": k,
                "gap_h": float(pass_times[k] - pass_times[k - 1]),
                "n_prev_cumulative": int(prev_mask.sum()), "n_next": int(nxt_mask.sum()),
                "n_new": n_new, "growth": n_new >= min_new,
                "advance_p95_km": float(np.percentile(dist[new], 95)) if n_new else 0.0,
                "advance_max_km": float(dist[new].max()) if n_new else 0.0,
                "next_daynight": str(g.loc[nxt_mask, "daynight"].iloc[0]) if "daynight" in g.columns else "",
                "lat": lat_c, "lon": lon_c, "t_next": g.loc[nxt_mask, "time"].iloc[0],
            })
    if passes_by_event:
        events["n_passes"] = events["event_id"].map(passes_by_event).fillna(1).astype(int)
    events = events.drop(columns=["t_min", "t_max"])
    cases = pd.DataFrame(case_rows)
    if len(cases):
        cases["gap_bin"] = pd.cut(cases["gap_h"], GAP_BINS_H, labels=GAP_LABELS, right=True, include_lowest=True)
        # a case is usable for the own-advance baseline if the event had growth in the previous pair
        prev = cases.sort_values(["event_id", "k"]).groupby("event_id")["growth"].shift(1)
        cases["has_prior_growth"] = prev.fillna(False).astype(bool)
    return events, cases


# --------------------------------------------------------------------------- reporting
def region_label(lat: float, lon: float, deg: float = 2.0) -> str:
    return f"{math.floor(lat / deg) * deg:.0f}N_{math.floor(lon / deg) * deg:.0f}E"


def required_events(effect_size_d: float, z_alpha: float = 1.96, z_beta: float = 0.84) -> int:
    """Paired design: events needed for a two-sided test with 80% power at standardised effect d (illustrative)."""
    return math.ceil(((z_alpha + z_beta) / effect_size_d) ** 2)


def match_first_study(df: pd.DataFrame, first_study_dir: Path) -> dict:
    out = {}
    key = lambda f: set(zip(f["latitude"].round(4), f["longitude"].round(4), f["acq_date"].astype(str), f["acq_time"].astype(str).str.zfill(4)))
    ours = {k: i for i, k in enumerate(zip(df["latitude"].round(4), df["longitude"].round(4), df["acq_date"].astype(str), df["acq_time"]))}
    for csv in sorted(Path(first_study_dir).glob("*/viirs_detections.csv")):
        f = pd.read_csv(csv, dtype={"acq_time": str})
        hits = [ours[k] for k in key(f) if k in ours]
        out[csv.parent.name] = sorted({int(df["event_id"].iloc[i]) for i in hits})
    return out


def summarise(events: pd.DataFrame, cases: pd.DataFrame, n_detections: int, min_events: int | None) -> dict:
    s: dict = {"n_detections": int(n_detections), "n_events": int(len(events))}
    if len(events) == 0:
        return s
    s["events_with_2plus_passes"] = int((events["n_passes"] >= 2).sum())
    s["events_with_3plus_passes"] = int((events["n_passes"] >= 3).sum())
    s["event_size_km2_quantiles"] = {q: float(events["area_proxy_km2"].quantile(q)) for q in (0.1, 0.5, 0.9, 0.99)}
    s["n_cases"] = int(len(cases))
    if len(cases):
        grew = cases[cases["growth"]]
        s["n_cases_with_growth"] = int(len(grew))
        s["events_with_growth_case"] = int(grew["event_id"].nunique())
        s["events_with_growth_and_prior_growth"] = int(cases[cases["growth"] & cases["has_prior_growth"]]["event_id"].nunique())
        s["gap_hours_share"] = {lab: float((cases["gap_bin"] == lab).mean()) for lab in GAP_LABELS}
        s["growth_by_gap"] = {lab: int(((cases["gap_bin"] == lab) & cases["growth"]).sum()) for lab in GAP_LABELS}
        if len(grew):
            s["advance_p95_km_quantiles"] = {q: float(grew["advance_p95_km"].quantile(q)) for q in (0.1, 0.5, 0.9)}
            s["advance_p95_km_sd"] = float(grew["advance_p95_km"].std(ddof=1)) if len(grew) > 1 else None
        s["events_needed_by_effect_size"] = {str(d): required_events(d) for d in (0.5, 0.35, 0.25)}
        indep = s["events_with_growth_case"]
        if min_events is None:
            s["gate_g0"] = "NOT EVALUATED (no --min-events given; the threshold must be frozen first)"
        else:
            s["gate_g0"] = ("PASS" if indep >= min_events else "FAIL") + f" ({indep} independent growth events vs required {min_events})"
    return s


def write_report(out_dir: Path, summary: dict, events: pd.DataFrame, cases: pd.DataFrame, params: dict, first_study: dict | None):
    lines = ["# Phase 0 feasibility audit", "",
             "Descriptive counts only. No model, no scoring. Detections are not burned area; there is no cloud or coverage mask in the input.", "",
             "## Parameters (as run; freeze them in the protocol)", "", "```json", json.dumps(params, indent=2, default=str), "```", "",
             "## Counts", "", "| Item | Value |", "|---|---|"]
    for key in ("n_detections", "n_events", "events_with_2plus_passes", "events_with_3plus_passes", "n_cases",
                "n_cases_with_growth", "events_with_growth_case", "events_with_growth_and_prior_growth"):
        if key in summary:
            lines.append(f"| {key} | {summary[key]} |")
    if "gap_hours_share" in summary:
        lines += ["", "## Gap between consecutive passes", "", "| Gap | Share of cases | Cases with growth |", "|---|---:|---:|"]
        for lab in GAP_LABELS:
            lines.append(f"| {lab} | {summary['gap_hours_share'][lab]:.2f} | {summary['growth_by_gap'][lab]} |")
    if "event_size_km2_quantiles" in summary:
        lines += ["", "## Event size (area proxy, km2)", "", "| Quantile | km2 |", "|---|---:|"]
        for q, v in summary["event_size_km2_quantiles"].items():
            lines.append(f"| {q} | {v:.2f} |")
    if "advance_p95_km_quantiles" in summary:
        lines += ["", "## Advance distance in growth cases (km, 95th percentile of new detections)", "", "| Quantile | km |", "|---|---:|"]
        for q, v in summary["advance_p95_km_quantiles"].items():
            lines.append(f"| {q} | {v:.2f} |")
        lines.append(f"\nSD: {summary.get('advance_p95_km_sd')}")
    if "events_needed_by_effect_size" in summary:
        lines += ["", "## Events needed (illustrative; paired design, 80% power, two-sided 5%)", "",
                  "Depends only on the standardised effect size d (mean paired difference divided by its SD). The real SD arrives with baseline results.", "",
                  "| d | Events |", "|---|---:|"]
        for d, n in summary["events_needed_by_effect_size"].items():
            lines.append(f"| {d} | {n} |")
    if len(events):
        by_region = events.assign(region=[region_label(a, b) for a, b in zip(events["lat"], events["lon"])]).groupby("region").size().sort_values(ascending=False).head(15)
        lines += ["", "## Events by 2-degree region (top 15)", "", "| Region | Events |", "|---|---:|"]
        lines += [f"| {r} | {c} |" for r, c in by_region.items()]
    if first_study:
        lines += ["", "## Overlap with the first-study incidents", "", "| Incident | Event ids found |", "|---|---|"]
        lines += [f"| {k} | {v or 'none'} |" for k, v in first_study.items()]
    lines += ["", "## Gate G0", "", str(summary.get("gate_g0", "n/a")), "",
              "## Reading this honestly", "",
              "- A case with no growth may mean the fire stopped, or that it was not observed (cloud, swath edge). This input cannot tell them apart.",
              "- Pass boundaries are inferred from acquisition times, not from satellite overpass metadata.",
              "- Fires too small or short-lived for VIIRS are absent from the sample; the sample leans toward larger, longer fires.",
              "- Regions are 2-degree boxes, not administrative areas.", ""]
    (out_dir / "report.md").write_text("\n".join(lines))


def apply_mask(df: pd.DataFrame, geojson_path) -> pd.DataFrame:
    """Keep detections inside the (Multi)Polygon of a GeoJSON Feature/Geometry (lon/lat). Needs shapely >= 2."""
    import shapely
    from shapely.geometry import shape
    gj = json.loads(Path(geojson_path).read_text())
    geom = shape(gj["geometry"] if gj.get("type") == "Feature" else gj)
    inside = shapely.contains_xy(geom, df["longitude"].to_numpy(), df["latitude"].to_numpy())
    return df[inside].reset_index(drop=True)


def run(args) -> dict:
    paths = sorted(Path(args.input_dir).glob("*.csv"))
    df = load_detections(paths, min_confidence=args.min_confidence)
    if getattr(args, "mask_geojson", None):
        n_before = len(df)
        df = apply_mask(df, args.mask_geojson)
        print(f"mask {args.mask_geojson}: kept {len(df)} of {n_before} detections")
    df["event_id"] = cluster_events(df["x_km"].to_numpy(), df["y_km"].to_numpy(), df["t_h"].to_numpy(), args.eps_km, args.event_gap_h)
    events, cases = build_cases(df, args.growth_tol_km, args.min_new, args.pass_gap_min)
    summary = summarise(events, cases, len(df), args.min_events)
    out = Path(args.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    events.to_csv(out / "events.csv", index=False)
    cases.to_csv(out / "cases.csv", index=False)
    (out / "summary.json").write_text(json.dumps(summary, indent=2, default=str))
    first = match_first_study(df, Path(args.first_study_dir)) if args.first_study_dir else None
    params = {k: (str(v) if isinstance(v, Path) else v) for k, v in vars(args).items()}
    params["n_input_files"] = len(paths)
    write_report(out, summary, events, cases, params, first)
    return summary


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--input-dir", required=True, type=Path)
    p.add_argument("--out-dir", required=True, type=Path)
    p.add_argument("--eps-km", type=float, default=1.0, help="space link distance for event clustering")
    p.add_argument("--event-gap-h", type=float, default=36.0, help="time link gap for event clustering")
    p.add_argument("--pass-gap-min", type=float, default=30.0, help="gap that separates two passes")
    p.add_argument("--growth-tol-km", type=float, default=0.75, help="a detection farther than this from all earlier ones is new")
    p.add_argument("--min-new", type=int, default=2, help="new detections needed to call a case growth")
    p.add_argument("--min-confidence", choices=["l", "n", "h"], default="n")
    p.add_argument("--min-events", type=int, default=None, help="frozen G0 threshold of independent growth events")
    p.add_argument("--first-study-dir", type=Path, default=None)
    p.add_argument("--mask-geojson", type=Path, default=None, help="keep only detections inside this polygon (e.g. an India boundary)")
    args = p.parse_args(argv)
    summary = run(args)
    print(json.dumps({k: v for k, v in summary.items() if not isinstance(v, dict)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

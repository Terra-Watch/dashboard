"""RESQ-5 scoring of the stored replay members, exactly as docs/RESQ5_PROTOCOL.md section 8.

Reads scratch members.pkl written by replay.py; writes results/resq5/<id>/*.  Nothing is tuned or re-run.
"""
import importlib.util
import json
import math
import pickle
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from pyproj import Transformer
from sklearn.metrics import average_precision_score, roc_auc_score

WEBSITE = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(WEBSITE / "scripts/resq3"))
sys.path.insert(0, str(WEBSITE / "backend/inference"))
import check_inputs as ci  # noqa: E402
from mcd64a1_geo import grid_from_hdf  # noqa: E402

NEXTPASS = Path("/Users/kireeti/Desktop/Projects/NextPass/nextpass/scripts")
SCRATCH = Path("/private/tmp/claude-501/-Users-kireeti-Desktop-Projects-RESQ/4361418d-a675-4bff-bd57-0ed65ade5e8e/scratchpad/resq5")
RESULTS = WEBSITE / "results/resq5"
SETUP = json.loads((WEBSITE / "data/resq5/protocol_setup.json").read_text())
CELL = 30.0
OBS = 375.0
SOURCES = ["era5land_native", "era5_025", "best_match"]
R_MAX = 2855.9148          # `geo` fold of NextPass results/r_max_per_fold.csv
TL2_MIN_WIND = 0.145       # m/s: head ROS 0.1 m/min


def fp_metrics(mask, obs):
    tp = int((mask & obs).sum()); pred = int(mask.sum()); o = int(obs.sum())
    union = pred + o - tp
    return {"sim_cells": pred, "obs_cells": o, "iou": tp / union if union else 0.0, "precision": (tp / pred) if pred else None,
            "recall": tp / o if o else None, "area_ratio": pred / o if o else None}


def rank_metrics(score, obs):
    y = obs.ravel().astype(int); s = score.ravel().astype(float)
    if y.min() == y.max():
        return {"auc": None, "ap": None}
    return {"auc": float(roc_auc_score(y, s)), "ap": float(average_precision_score(y, s))}


def load_nextpass():
    sys.path.insert(0, str(NEXTPASS))
    spec = importlib.util.spec_from_file_location("score_footprint", NEXTPASS / "score_footprint.py")
    sf = importlib.util.module_from_spec(spec); spec.loader.exec_module(sf)
    import domain as dom  # NextPass scripts/domain.py (uses common.CELL = 375 m)
    return sf, dom


def observed_arrays(iid):
    s = SETUP[iid]; d = s["domain"]; n = d["cells_per_side"]
    cand = pd.read_csv(WEBSITE / "results/resq2_incident_candidates.csv", dtype={"first_time_utc": str, "first_time_ist": str})
    row = next(cand[cand.event_id == iid].itertuples())
    _, ev = ci.event_detections(row, WEBSITE / "data/resq2" / iid)
    ev = ev.copy()
    ev["time"] = pd.to_datetime(ev.acq_date) + pd.to_timedelta(ev.acq_time // 100, unit="h") + pd.to_timedelta(ev.acq_time % 100, unit="m")
    ev["pass"] = ev.satellite + "|" + ev.acq_date + "|" + ev.daynight
    to_utm = Transformer.from_crs(4326, d["crs"], always_xy=True)
    ev["x"], ev["y"] = to_utm.transform(ev.longitude.values, ev.latitude.values)
    ev["ix"] = np.floor(ev.x / OBS).astype(int); ev["iy"] = np.floor(ev.y / OBS).astype(int)
    ci_ = (np.arange(n) + 0.5) * CELL
    xc = d["west_m"] + ci_[None, :] + np.zeros((n, 1)); yc = d["north_m"] - ci_[:, None] + np.zeros((1, n))
    kx = np.floor(xc / OBS).astype(np.int64); ky = np.floor(yc / OBS).astype(np.int64)
    key = lambda a, b: (np.asarray(a, dtype=np.int64) + (1 << 30)) * (1 << 31) + (np.asarray(b, dtype=np.int64) + (1 << 30))  # noqa: E731
    cell_key = key(kx, ky)
    used = s["overpasses_used"]
    nh = ev[ev.confidence.isin(["n", "h"])]
    obs_nh, obs_all, eps = [], [], []
    pass_time = ev.groupby("pass").time.median().dt.floor("min")
    for k, p in enumerate(used):
        keys_nh = {pk["pass"] for pk in used[: k + 1]}
        g = nh[nh["pass"].isin(keys_nh)]
        obs_nh.append(np.isin(cell_key, key(g.ix.values, g.iy.values)))
        t_k = pd.Timestamp(p["time_utc"])
        ga = ev[ev["pass"].map(pass_time) <= t_k]
        obs_all.append(np.isin(cell_key, key(ga.ix.values, ga.iy.values)))
        gk = nh[nh["pass"] == p["pass"]]
        eps.append({"ix": gk.ix.values, "iy": gk.iy.values})
    return {"obs_nh": obs_nh, "obs_all": obs_all, "eps": eps, "kx": kx, "ky": ky, "xc": xc, "yc": yc, "row": row}


def old_check(iid, pred_masks, grid_hdf, scar_rc, domain):
    """Replicates validate_mcd64a1.py logic (clip rule) with the corrected 463.31 m georeferencing."""
    n = domain["cells_per_side"]
    inv = Transformer.from_crs(domain["crs"], 4326, always_xy=True)
    ci_ = (np.arange(n) + 0.5) * CELL
    xc = domain["west_m"] + ci_[None, :] + np.zeros((n, 1)); yc = domain["north_m"] - ci_[:, None] + np.zeros((1, n))
    lon, lat = inv.transform(xc.ravel(), yc.ravel())
    pr, pc = grid_hdf.rowcol(lon, lat)
    pr = pr.reshape(n, n); pc = pc.reshape(n, n)
    out = {}
    obs_idx = set(scar_rc)
    for name, mask in pred_masks.items():
        pred = set(zip(pr[mask].tolist(), pc[mask].tolist()))
        if not pred:
            out[name] = {"predicted_pixels": 0, "iou": 0.0}; continue
        rmin = min(r for r, _ in pred); cmin = min(c for _, c in pred)
        kept = {i for i in obs_idx if i in pred or (abs(i[0] - rmin) <= 2 and abs(i[1] - cmin) <= 2)}
        inter = len(pred & kept); uni = len(pred | kept)
        out[name] = {"predicted_pixels": len(pred), "observed_pixels_kept": len(kept), "iou": round(inter / uni, 4) if uni else 0.0}
    return out


def analyze(iid):
    s = SETUP[iid]; d = s["domain"]; n = d["cells_per_side"]; used = s["overpasses_used"]
    pk = pickle.load(open(SCRATCH / iid / "members.pkl", "rb"))
    res = pk["results"]; fuel = pk["fuel"]
    errors = [r for r in res if "error" in r]
    ok = [r for r in res if "error" not in r]
    oa = observed_arrays(iid)
    frames_h = [int(math.floor(p["hours_since_t0"])) for p in used]
    K = len(used)
    out_dir = RESULTS / iid
    out_dir.mkdir(parents=True, exist_ok=True)
    ign = np.array(s["ignition_utm_m"])
    dist = np.hypot(oa["xc"] - ign[0], oa["yc"] - ign[1])
    prox = np.exp(-dist / 1000.0)
    final_obs = oa["obs_nh"][-1]
    radius = math.sqrt(final_obs.sum() * CELL * CELL / math.pi)
    circle = dist <= radius
    rows, member_rows = [], []
    counts = {}
    by_source = {src: [r for r in ok if r["source"] == src] for src in SOURCES}
    by_source["pooled"] = ok
    # ---- ensembles
    for src, mem in by_source.items():
        if not mem:
            continue
        counts[src] = [np.sum([m["frames"][frames_h[k]] for m in mem], axis=0).astype(np.uint8) for k in range(K)]
        for k in range(K):
            p = counts[src][k] / len(mem)
            for ref_name in ("obs_nh", "obs_all"):
                obs = oa[ref_name][k]
                fp = fp_metrics(p >= 0.5, obs)
                rk = rank_metrics(p, obs)
                rows.append({"incident": iid, "model": f"simulation:{src}", "reference": ref_name, "overpass_k": k, "time_utc": used[k]["time_utc"], "hours_since_t0": used[k]["hours_since_t0"],
                             "members": len(mem), "max_p": round(float(p.max()), 3), **rk, **fp})
    # ---- baselines
    for k in range(K):
        for ref_name in ("obs_nh", "obs_all"):
            obs = oa[ref_name][k]
            rows.append({"incident": iid, "model": "baseline_a_proximity", "reference": ref_name, "overpass_k": k, "time_utc": used[k]["time_utc"], "hours_since_t0": used[k]["hours_since_t0"],
                         "members": None, "max_p": 1.0, **rank_metrics(prox, obs), **fp_metrics(prox >= 0.5, obs)})
            rows.append({"incident": iid, "model": "baseline_b_circle_final_area", "reference": ref_name, "overpass_k": k, "time_utc": used[k]["time_utc"], "hours_since_t0": used[k]["hours_since_t0"],
                         "members": None, "max_p": 1.0, **rank_metrics(circle.astype(float), obs), **fp_metrics(circle, obs)})
    metrics = pd.DataFrame(rows)
    metrics.to_csv(out_dir / "metrics_by_overpass.csv", index=False)
    # ---- member level
    for m in ok:
        for k in range(K):
            fp = fp_metrics(m["frames"][frames_h[k]], oa["obs_nh"][k])
            member_rows.append({"incident": iid, "source": m["source"], "member": m["member"], "overpass_k": k, "ign_row": m["ign_rc"][0], "ign_col": m["ign_rc"][1],
                                "ign_cell_fuel": int(fuel[m["ign_rc"][0], m["ign_rc"][1]]), "last_frame_written": m["last_frame"], "wall_s": m["wall_s"],
                                "burned_cells": fp["sim_cells"], "iou": fp["iou"], "precision": fp["precision"], "recall": fp["recall"], "area_ratio": fp["area_ratio"]})
    members = pd.DataFrame(member_rows)
    members.to_csv(out_dir / "members.csv", index=False)
    # ---- edge clipping at the last overpass
    def touches(a):
        return bool(a[0].any() or a[-1].any() or a[:, 0].any() or a[:, -1].any())
    edge = {src: {"members": len(mem), "touch_outer_ring_at_last_overpass": int(sum(touches(m["frames"][frames_h[-1]]) for m in mem))} for src, mem in by_source.items() if mem}
    # ---- NextPass-harness metric (next-overpass target)
    np_rows = []
    try:
        sf, dom = load_nextpass()
        key = lambda a, b: (np.asarray(a, dtype=np.int64) + (1 << 30)) * (1 << 31) + (np.asarray(b, dtype=np.int64) + (1 << 30))  # noqa: E731
        kx, ky = oa["kx"], oa["ky"]
        ckey = key(kx, ky).ravel()
        order = np.argsort(ckey); sk = ckey[order]
        uniq, start = np.unique(sk, return_index=True)
        def cell_scores(p):
            flat = p.ravel()[order]
            sums = np.add.reduceat(flat, start); cnt = np.diff(np.append(start, len(flat)))
            return dict(zip(uniq.tolist(), (sums / cnt).tolist()))
        D_parts, pred_parts = [], []
        for k in range(K - 1):
            g = dom.build_geometry(oa["eps"], k, R_MAX)
            lab, _ = dom.labels(oa["eps"], k, g["px"], g["py"])
            kk = key(g["px"], g["py"])
            models = {}
            for src in list(counts):
                models[f"simulation:{src}"] = cell_scores(counts[src][k + 1] / len(by_source[src]))
            models["baseline_a_proximity"] = cell_scores(prox)
            models["baseline_b_circle_final_area"] = cell_scores(circle.astype(float))
            for mname, sc in models.items():
                vals = np.array([sc.get(int(c), np.nan) for c in kk])
                have = ~np.isnan(vals)
                pid = f"{iid}|{mname}|{k}"
                D_parts.append(pd.DataFrame({"pair_id": pid, "ix": g["px"][have], "iy": g["py"][have], "y": lab[have], "dist_ck_m": g["dist_ck_m"][have]}))
                pred_parts.append(pd.DataFrame({"pair_id": pid, "ix": g["px"][have], "iy": g["py"][have], "score": vals[have]}))
        D_all = pd.concat(D_parts, ignore_index=True); P_all = pd.concat(pred_parts, ignore_index=True)
        sf.load_domain = lambda fold: (D_all, R_MAX)
        for pid in P_all.pair_id.unique():
            sub = P_all[P_all.pair_id == pid]
            _, mname, k = pid.split("|")
            try:
                r = sf.score(sub, "geo")
            except Exception as exc:                       # a pair with a single class has no AUC
                r = {"error": f"{type(exc).__name__}: {exc}"}
            np_rows.append({"incident": iid, "model": mname, "pair_k": int(k), **{a: r.get(a) for a in ("cells_in_D", "positives_in_D", "prevalence", "auc", "ap", "top10pct_capture", "recall_at_2n_budget", "error")}})
        pd.DataFrame(np_rows).to_csv(out_dir / "nextpass_style.csv", index=False)
    except Exception as exc:
        np_rows = [{"error": f"{type(exc).__name__}: {exc}"}]
    # ---- weather facts for the replay window (night hours where TL2 cannot spread)
    wx = {}
    for src in SOURCES:
        f = {"era5land_native": ("weather_era5land_native_wind.csv", "wind_speed_ms"), "era5_025": ("weather_era5_wind_and_surface.csv", "wind_speed_10m"), "best_match": ("weather_best_match_sensitivity_not_reanalysis.csv", "wind_speed_10m")}[src]
        df = pd.read_csv(WEBSITE / "data/resq2" / iid / f[0], parse_dates=["time"]).set_index("time")
        idx = pd.date_range(pd.Timestamp(s["t0_utc"]), periods=s["weather_rows_hours"], freq="h")
        v = df.loc[idx, f[1]].values
        low = idx[v < TL2_MIN_WIND]
        wx[src] = {"hours": int(len(v)), "mean_ms": round(float(v.mean()), 2), "max_ms": round(float(v.max()), 2), "min_ms": round(float(v.min()), 2),
                   "hours_below_0.145_ms": int(len(low)), "share_below_pct": round(100 * len(low) / len(v), 1),
                   "hours_below_by_ist_hour": {int(h): int(c) for h, c in pd.Series([(t + pd.Timedelta(hours=5.5)).hour for t in low]).value_counts().sort_index().items()} if len(low) else {}}
    # ---- old check demonstration (E2024-135332 only: the one incident with a partial scar)
    old = None
    if iid == "E2024-135332":
        sc = pd.read_csv(WEBSITE / "data/resq2" / iid / "mcd64a1_burned_pixels_domain_plus_3km.csv")
        sc = sc[sc.in_event_window]
        hdf = sorted((WEBSITE / "data/resq2" / iid / "mcd64a1").glob("*.hdf"))[-1]
        grid = grid_from_hdf(hdf)
        prim = by_source["era5land_native"]
        areas = [int(m["frames"][frames_h[-1]].sum()) for m in prim]
        med = prim[int(np.argsort(areas)[len(areas) // 2])]
        ign_rc = [int((d["north_m"] - ign[1]) // CELL), int((ign[0] - d["west_m"]) // CELL)]
        full = np.ones((n, n), bool)
        cross = np.zeros((n, n), bool); cross[ign_rc[0], :] = True; cross[:, ign_rc[1]] = True
        shapes = {"simulation_median_area_member": med["frames"][frames_h[-1]], "fully_burned_domain": full, "cross_through_ignition": cross}
        oc = old_check(iid, shapes, grid, list(zip(sc.row.tolist(), sc.col.tolist())), d)
        newm = {k: {**fp_metrics(v, oa["obs_nh"][-1]), **rank_metrics(v.astype(float), oa["obs_nh"][-1])} for k, v in shapes.items()}
        old = {"scar_pixels_event_window": int(len(sc)), "old_check": oc, "new_metrics_same_shapes_vs_cumulative_footprint": newm,
               "note": "old_check: set of MCD64A1 463.31 m pixels touched by the shape; observed scar pixels kept only if inside or within 2 rows/cols of the predicted min row/col"}
    # ---- save arrays and summary
    for src, arrs in counts.items():
        np.savez_compressed(out_dir / f"burn_count_{src}.npz", **{f"k{k}": a for k, a in enumerate(arrs)}, members=len(by_source[src]))
    np.savez_compressed(out_dir / "observed_footprints.npz", **{f"nh_k{k}": a for k, a in enumerate(oa["obs_nh"])}, **{f"all_k{k}": a for k, a in enumerate(oa["obs_all"])}, fuel=fuel)
    summary = {"incident": iid, "domain": d, "overpasses": used, "frames_used": frames_h, "fuel_summary": pk["fuel_summary"], "members_ok": len(ok), "members_failed": len(errors),
               "errors": [{k: v for k, v in e.items() if k != "frames"} for e in errors][:5], "edge_clipping": edge, "weather_window": wx,
               "baseline_circle_radius_m": round(radius, 1), "old_check_demonstration": old, "nextpass_style_rows": len(np_rows),
               "wall_s_per_member_median": float(np.median([m["wall_s"] for m in ok])) if ok else None,
               "non_burnable_ignition_members": int(sum(1 for m in ok if fuel[m["ign_rc"][0], m["ign_rc"][1]] not in (101, 182)) / max(1, len(set(m['source'] for m in ok))))}
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=1, default=str))
    return metrics, members, summary


if __name__ == "__main__":
    for iid in (sys.argv[1:] or list(SETUP)):
        m, mem, sm = analyze(iid)
        last = m[(m.overpass_k == m.overpass_k.max()) & (m.reference == "obs_nh")]
        print(iid, "members ok", sm["members_ok"], "failed", sm["members_failed"])
        print(last[["model", "auc", "ap", "iou", "precision", "recall", "area_ratio", "sim_cells", "obs_cells"]].round(3).to_string(index=False))

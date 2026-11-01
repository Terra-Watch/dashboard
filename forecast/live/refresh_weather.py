"""Keep the daily weather store current. Usage: python refresh_weather.py --day 2026-11-01 --cells BUNDLE/cells.parquet --store W.parquet [--sample N] [--live-source forecast]

Days up to day-SETTLE_DAYS come from the archive (final); newer days from the forecast API analysis hours and are re-fetched every run until they settle.
Resumable: rows already final in the store are skipped. Prints counts only.
shortcut: Open-Meteo's free tier is non-commercial and rate-limited (about 10,000 weighted calls a day); a first fill of ~7,100 cells needs several days or a paid key.
"""
import argparse, os, sys, time
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import weather as W  # noqa: E402


def refresh(cells, day, store_path, batch=25, live_source="forecast", pause=1.0):
    day = pd.Timestamp(day); first = day - pd.Timedelta(days=W.HISTORY_DAYS - 1); settled = day - pd.Timedelta(days=W.SETTLE_DAYS)
    store = pd.read_parquet(store_path) if os.path.exists(store_path) else pd.DataFrame(columns=["cell_id", "date", "t2m", "tmax", "td", "u", "v", "tp", "soil", "source"])
    final = set(map(tuple, store[store.source == "archive"][["cell_id", "date"]].itertuples(index=False, name=None)))
    new, added = [], 0

    def save():
        nonlocal store, new, added
        if not new: return
        add = pd.concat(new, ignore_index=True); added += len(add)
        store = pd.concat([store, add]).drop_duplicates(["cell_id", "date"], keep="last").sort_values(["cell_id", "date"]).reset_index(drop=True)
        store.to_parquet(store_path, index=False); new = []

    for n, b in enumerate(range(0, len(cells), batch)):
        part = cells.iloc[b:b + batch]
        for src, lo, hi in (("archive", first, min(settled, day)), (live_source, max(first, settled + pd.Timedelta(days=1)), day)):
            if lo > hi: continue
            need = [c for c in part.cell_id if any((c, d) not in final for d in pd.date_range(lo, hi))] if src == "archive" else list(part.cell_id)
            if not need: continue
            sub = part[part.cell_id.isin(need)]
            frames = W.fetch_batch(src, sub.lat.tolist(), sub.lon.tolist(), f"{lo:%Y-%m-%d}", f"{hi:%Y-%m-%d}")
            for c, df in zip(sub.cell_id, frames):
                d = W.daily(df); d = d[(d.index >= lo) & (d.index <= hi)].rename_axis("date").reset_index(); d["cell_id"] = c; d["source"] = "archive" if src == "archive" else "analysis"; new.append(d)
            time.sleep(pause)
        if n % 10 == 9:
            save(); print(f"progress {min(b + batch, len(cells))}/{len(cells)} cells, rows={len(store)}", flush=True)
    save()
    return len(store), added


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--day", required=True); ap.add_argument("--cells", required=True); ap.add_argument("--store", required=True)
    ap.add_argument("--sample", type=int); ap.add_argument("--live-source", default="forecast", choices=["forecast", "historical_forecast"]); a = ap.parse_args()
    c = pd.read_parquet(a.cells)[["cell_id", "lat", "lon", "state"]]
    if a.sample: c = c.groupby("state", group_keys=False).apply(lambda d: d.sample(min(len(d), max(1, a.sample // c.state.nunique())), random_state=0))
    total, added = refresh(c, a.day, a.store, live_source=a.live_source); print(f"weather store rows={total} fetched={added}")

"""File sizes (from the LAADS archive directory listing, no data downloaded) of the MCD64A1 tile-months needed."""
import csv, datetime as dt, io, json, urllib.request
from pathlib import Path
import pandas as pd

WEBSITE = Path(__file__).resolve().parents[2]
c = pd.read_csv(WEBSITE / "results/resq2_incident_candidates.csv", dtype={"first_time_utc": str})
prop = c[c.proposed]
listing = {}
def sizes(year, doy):
    key = (year, doy)
    if key not in listing:
        url = f"https://ladsweb.modaps.eosdis.nasa.gov/archive/allData/61/MCD64A1/{year}/{doy:03d}.csv"
        txt = urllib.request.urlopen(url, timeout=60).read().decode()
        listing[key] = {r["name"].split(".")[2]: (r["name"], int(r["size"])) for r in csv.DictReader(io.StringIO(txt))}
    return listing[key]
def month_starts(first, last):
    a = (pd.Timestamp(first) - pd.Timedelta(days=8)).replace(day=1)
    b = (pd.Timestamp(last) + pd.Timedelta(days=8)).replace(day=1)
    return list(pd.period_range(a, b, freq="M"))
need, rows = {}, []
for r in prop.itertuples():
    for p in month_starts(r.first_date, r.last_date):
        doy = dt.date(p.year, p.month, 1).timetuple().tm_yday
        name, size = sizes(p.year, doy)[r.mcd64a1_tile]
        need[name] = size
    rows.append(r.event_id)
out = {"proposed_events": len(rows), "files": len(need), "total_MB": round(sum(need.values()) / 1e6, 1), "files_detail": need}
# whole programme: every tile that holds a candidate x all 2023-2024 months
tiles = sorted(c.mcd64a1_tile.unique())
tot, nfiles = 0, 0
for y in (2023, 2024):
    for m in range(1, 13):
        doy = dt.date(y, m, 1).timetuple().tm_yday
        s = sizes(y, doy)
        for t in tiles:
            if t in s and t != "h26v06":
                tot += s[t][1]; nfiles += 1
out["all_candidate_tiles"] = tiles
out["all_tiles_24_months_excl_h26v06_MB"] = round(tot / 1e6, 1)
out["all_tiles_24_months_files"] = nfiles
(WEBSITE / "results/resq2_mcd64a1_download_sizes.json").write_text(json.dumps(out, indent=1) + "\n")
print({k: v for k, v in out.items() if k != "files_detail"})

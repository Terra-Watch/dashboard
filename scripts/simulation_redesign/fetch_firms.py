"""Download FIRMS VIIRS archive CSVs for a bounding box and date range (read-only on the network, writes CSV files).

Phase 0 of docs/simulation-redesign. The map key is read from the FIRMS_MAP_KEY environment variable and is
never printed or written. Files are named <source>_<start>_<days>.csv and existing files are skipped, so the
command can be re-run to resume.

Example:
    python fetch_firms.py --start 2024-01-01 --end 2024-05-31 --out-dir /path/to/raw
"""
from __future__ import annotations

import argparse
import datetime as dt
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv"
INDIA_BBOX = (68.0, 6.0, 98.0, 36.0)  # west, south, east, north
DEFAULT_SOURCES = ("VIIRS_SNPP_SP", "VIIRS_NOAA20_SP")
MAX_DAYS = 5  # the FIRMS area API accepts 1..5 days per request (10 returns HTTP 400)
EXPECTED_HEADER_PREFIX = "latitude,longitude"


class FetchError(RuntimeError):
    pass


def windows(start: dt.date, end: dt.date, days: int = MAX_DAYS):
    """Yield (window_start, n_days) covering start..end inclusive."""
    if end < start:
        raise ValueError("end is before start")
    cur = start
    while cur <= end:
        n = min(days, (end - cur).days + 1)
        yield cur, n
        cur += dt.timedelta(days=n)


def fetch_window(key: str, source: str, bbox, start: dt.date, n_days: int, timeout: float = 120.0) -> str:
    west, south, east, north = bbox
    url = f"{BASE}/{key}/{source}/{west},{south},{east},{north}/{n_days}/{start.isoformat()}"
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            body = response.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as exc:  # never include the URL: it contains the key
        raise FetchError(f"{source} {start} HTTP {exc.code}") from None
    except Exception as exc:  # noqa: BLE001
        raise FetchError(f"{source} {start} {type(exc).__name__}") from None
    if not body.startswith(EXPECTED_HEADER_PREFIX):
        # FIRMS returns plain-text errors (quota, bad key) with status 200.
        raise FetchError(f"{source} {start} unexpected response (not CSV)")
    return body


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--start", required=True, type=dt.date.fromisoformat)
    parser.add_argument("--end", required=True, type=dt.date.fromisoformat)
    parser.add_argument("--out-dir", required=True, type=Path)
    parser.add_argument("--sources", default=",".join(DEFAULT_SOURCES))
    parser.add_argument("--bbox", default=",".join(str(v) for v in INDIA_BBOX), help="west,south,east,north")
    parser.add_argument("--sleep", type=float, default=0.5, help="seconds between requests")
    parser.add_argument("--retries", type=int, default=3)
    args = parser.parse_args(argv)

    key = os.environ.get("FIRMS_MAP_KEY", "").strip()
    if not key:
        print("FIRMS_MAP_KEY is not set", file=sys.stderr)
        return 2
    bbox = tuple(float(v) for v in args.bbox.split(","))
    if len(bbox) != 4 or not (bbox[0] < bbox[2] and bbox[1] < bbox[3]):
        print("bbox must be west,south,east,north", file=sys.stderr)
        return 2
    args.out_dir.mkdir(parents=True, exist_ok=True)

    failures = 0
    for source in [s for s in args.sources.split(",") if s]:
        for start, n_days in windows(args.start, args.end):
            target = args.out_dir / f"{source}_{start.isoformat()}_{n_days}.csv"
            if target.exists() and target.stat().st_size > 0:
                continue
            for attempt in range(1, args.retries + 1):
                try:
                    body = fetch_window(key, source, bbox, start, n_days)
                    tmp = target.with_suffix(".part")
                    tmp.write_text(body)
                    tmp.replace(target)
                    print(f"ok  {target.name} rows={body.count(chr(10)) - 1}")
                    break
                except FetchError as exc:
                    if attempt == args.retries:
                        print(f"FAIL {exc}", file=sys.stderr)
                        failures += 1
                    else:
                        time.sleep(2 ** attempt)
            time.sleep(args.sleep)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())

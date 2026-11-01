"""Fetch the last two days of NASA FIRMS near-real-time detections for India and post them to the dashboard (every 3 hours from the workflow).
Env: FIRMS_MAP_KEY, RISK_INGEST_URL (…/api/risk/runs; the hotspot route is on the same host), RISK_INGEST_TOKEN. Retried again and again; nothing secret is printed."""
import os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from retry import retry  # noqa: E402

SOURCES = ("VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT"); BBOX = "68,6,98,36"; DAYS = 2


def main():
    import httpx
    key, token = os.environ["FIRMS_MAP_KEY"], os.environ["RISK_INGEST_TOKEN"]
    base = os.environ["RISK_INGEST_URL"].split("/api/")[0] + "/api/feeds/hotspots/csv"

    def transient(r):
        if r.status_code == 429 or r.status_code >= 500: raise httpx.TransportError(f"HTTP {r.status_code}")
        return r

    with httpx.Client(timeout=300) as c:
        for src in SOURCES:
            got = retry(lambda: transient(c.get(f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{key}/{src}/{BBOX}/{DAYS}")), retry_on=(httpx.TransportError,), log=lambda *a, **k: None)
            if got.status_code != 200: raise RuntimeError(f"FIRMS refused {src}: HTTP {got.status_code}")
            sent = retry(lambda: transient(c.post(base, params={"satellite": src}, content=got.content, headers={"X-Ingest-Token": token, "content-type": "text/csv"})), retry_on=(httpx.TransportError,), log=lambda *a, **k: None)
            if sent.status_code != 200: raise RuntimeError(f"the dashboard refused {src}: HTTP {sent.status_code} {sent.text[:150]}")
            print(src, sent.json())


if __name__ == "__main__": main()

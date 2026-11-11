"""Send one area forecast to the dashboard: python post_area_forecast.py RUN_DIR URL   (token in RISK_INGEST_TOKEN). Retried on connection errors and 5xx; a 4xx is not retried."""
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from retry import retry  # noqa: E402


def post(run_dir, url, token):
    import httpx
    body = json.load(open(f"{run_dir}/area_forecast.json"))

    def once():
        r = httpx.post(url, json=body, headers={"X-Ingest-Token": token}, timeout=300)
        if r.status_code >= 500: raise httpx.TransportError(f"HTTP {r.status_code}")
        if r.status_code != 200: raise RuntimeError(f"the dashboard refused the area forecast: HTTP {r.status_code} {r.text[:200]}")
        return r.json()["stored"]
    return retry(once, retry_on=(httpx.TransportError,))


if __name__ == "__main__":
    print("posted area forecast for", post(sys.argv[1], sys.argv[2], os.environ["RISK_INGEST_TOKEN"]))

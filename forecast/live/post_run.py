"""Send one finished run to the dashboard: python post_run.py RUN_DIR URL   (token in RISK_INGEST_TOKEN).
Retried again and again on connection errors and 5xx; a 4xx means the run itself was refused and is not retried."""
import json, os, sys
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from retry import retry  # noqa: E402


def post_run(run_dir, url, token):
    import httpx
    info = json.load(open(f"{run_dir}/run.json")); rows = pd.read_csv(f"{run_dir}/scores.csv").to_dict("records")

    def once():
        r = httpx.post(url, json={"run": info, "rows": rows}, headers={"X-Ingest-Token": token}, timeout=300)
        if r.status_code >= 500: raise httpx.TransportError(f"HTTP {r.status_code}")
        if r.status_code != 200: raise RuntimeError(f"the dashboard refused the run: HTTP {r.status_code} {r.text[:200]}")
        return r.json()["imported"]
    return retry(once, retry_on=(httpx.TransportError,))


if __name__ == "__main__":
    print(f"posted {post_run(sys.argv[1], sys.argv[2], os.environ['RISK_INGEST_TOKEN'])} ranked cells")

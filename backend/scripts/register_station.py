"""Register a lookout station through the API, as an administrator (the Admin page has no station form yet).
  python scripts/register_station.py --node 1 --name "Bench node 1" --lat 10.90 --lon 76.90 [--url https://terra-watch-server.vercel.app]
The email and password are read from PROD_ADMIN_EMAIL / PROD_ADMIN_PASSWORD, or asked for (the password is not echoed). Nothing is printed except the outcome."""
import argparse, getpass, http.cookiejar, json, os, sys, urllib.error, urllib.request


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default="https://terra-watch-server.vercel.app"); ap.add_argument("--node", type=int, required=True); ap.add_argument("--name", required=True)
    ap.add_argument("--lat", type=float, required=True); ap.add_argument("--lon", type=float, required=True); ap.add_argument("--interval", type=int, default=600); ap.add_argument("--notes", default="")
    a = ap.parse_args(); base = a.url.rstrip("/")
    email = os.environ.get("PROD_ADMIN_EMAIL") or input("Admin email: "); password = os.environ.get("PROD_ADMIN_PASSWORD") or getpass.getpass("Password: ")
    jar = http.cookiejar.CookieJar(); op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

    def call(path, body, headers=None):
        req = urllib.request.Request(base + path, data=json.dumps(body).encode(), headers={"content-type": "application/json", **(headers or {})})
        try:
            with op.open(req, timeout=30) as r: return r.status, json.loads(r.read() or b"{}")
        except urllib.error.HTTPError as e:
            try: detail = json.loads(e.read()).get("detail", "")
            except Exception: detail = ""
            return e.code, {"detail": detail}

    status, d = call("/api/auth/sign-in", {"email": email, "password": password})
    if status != 200: print(f"Sign-in failed ({status}): {d.get('detail')}", file=sys.stderr); return 1
    csrf = next((c.value for c in jar if c.name == "resq_csrf"), "")
    status, d = call("/api/stations", {"node_id": a.node, "name": a.name, "latitude": a.lat, "longitude": a.lon, "expected_interval_s": a.interval, "notes": a.notes},
                     {"authorization": "Bearer " + d["access_token"], "x-resq-csrf": csrf})
    if status == 201: print(f"Registered node {a.node} as '{a.name}' (state {d.get('state')})."); return 0
    print(f"Registration failed ({status}): {d.get('detail')}", file=sys.stderr); return 1


if __name__ == "__main__": sys.exit(main())

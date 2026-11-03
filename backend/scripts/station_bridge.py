"""Gateway-to-backend bridge: reads the gateway's serial log, turns each `[DATA RX]` line into a reading and sends batches to POST /api/stations/ingest with an HMAC signature.
Readings that cannot be sent (no internet, server down) are kept in a local queue file and retried, so nothing is lost while the link is down.

  python scripts/station_bridge.py --port /dev/cu.usbmodemXXXX --url https://HOST --gateway-id gw1        (secret in env STATION_GATEWAY_SECRET)
  python scripts/station_bridge.py --file gateway.log --url http://localhost:8000 --gateway-id gw1          (replay a saved log)
Needs pyserial only for --port."""
import argparse, hashlib, hmac, json, os, re, sys, time, urllib.request
from datetime import datetime, timezone
from pathlib import Path

LINE = re.compile(r"\[DATA RX\] source=0x(?P<node>[0-9A-Fa-f]{2}) sequence=(?P<seq>\d+) rssi=(?P<rssi>-?\d+) snr=(?P<snr>-?[\d.]+) payload=(?P<hex>[0-9A-Fa-f]+)")


def parse_line(line: str, now: datetime | None = None) -> dict | None:
    m = LINE.search(line)
    if not m: return None
    return {"node_id": int(m["node"], 16), "seq": int(m["seq"]) & 0xFFFF, "rssi": int(m["rssi"]), "snr": float(m["snr"]), "payload_hex": m["hex"],
            "received_at": (now or datetime.now(timezone.utc)).isoformat()}


def sign(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def send(url: str, gateway_id: str, secret: str, readings: list[dict]) -> bool:
    body = json.dumps({"readings": readings}).encode()
    req = urllib.request.Request(url.rstrip("/") + "/api/stations/ingest", data=body, headers={"content-type": "application/json", "x-gateway-id": gateway_id, "x-signature": sign(secret, body)})
    try:
        with urllib.request.urlopen(req, timeout=20) as r: print("sent", len(readings), r.read().decode()[:120], flush=True); return True
    except Exception as e:
        print("send failed:", repr(e)[:100], flush=True); return False


def main():
    ap = argparse.ArgumentParser(); src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--port"); src.add_argument("--file"); src.add_argument("--stdin", action="store_true")
    ap.add_argument("--url", required=True); ap.add_argument("--gateway-id", required=True); ap.add_argument("--baud", type=int, default=115200)
    ap.add_argument("--queue", default=str(Path.home() / ".station_bridge_queue.jsonl")); ap.add_argument("--flush-s", type=float, default=5.0)
    a = ap.parse_args(); secret = os.environ.get("STATION_GATEWAY_SECRET") or sys.exit("set STATION_GATEWAY_SECRET")
    q = Path(a.queue); pending = [json.loads(l) for l in q.read_text().splitlines() if l.strip()] if q.exists() else []
    if a.port:
        import serial
        ser = serial.Serial(); ser.port = a.port; ser.baudrate = a.baud; ser.timeout = 1; ser.dtr = False; ser.rts = False; ser.open()
        lines = (ser.readline().decode(errors="replace") for _ in iter(int, 1))
    elif a.file: lines = iter(Path(a.file).read_text().splitlines())
    else: lines = (l for l in sys.stdin)
    last = time.time()
    for line in lines:
        r = parse_line(line)
        if r: pending.append(r)
        if pending and (time.time() - last >= a.flush_s or len(pending) >= 50 or a.file):
            while pending:                                              # send in batches of 100; keep what failed
                batch = pending[:100]
                if not send(a.url, a.gateway_id, secret, batch): break
                pending = pending[100:]
            q.write_text("".join(json.dumps(p) + "\n" for p in pending)); last = time.time()
    if pending: q.write_text("".join(json.dumps(p) + "\n" for p in pending))


if __name__ == "__main__": main()

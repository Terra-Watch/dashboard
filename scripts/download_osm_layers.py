#!/usr/bin/env python3
"""Download the approved RESQ OSM demo layers from Overpass."""

from __future__ import annotations

import json
import argparse
import os
import random
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data" / "layers"
MANIFEST_PATH = DATA_DIR / "download_manifest.json"
ENDPOINT = os.environ.get("OVERPASS_ENDPOINT", "https://overpass-api.de/api/interpreter").rstrip("?")
HEADERS = {
    "User-Agent": "RESQ7-MapLayers/1.0 (OSM data preparation)",
    "Accept": "application/json",
    "Content-Type": "application/x-www-form-urlencoded",
}
MAX_ATTEMPTS = 3
RETRYABLE_HTTP_CODES = {429, 502, 503, 504}
BACKOFF_SECONDS = (3, 8, 20)
REQUEST_TIMEOUT_SECONDS = 90
MIN_REQUEST_INTERVAL_SECONDS = 5

BOXES = {
    "E2024-131853": (78.5318, 19.1352, 78.6745, 19.2700),
    "E2024-135332": (78.6410, 19.8842, 78.7843, 20.0190),
    "E2023-084925": (83.8657, 19.2591, 84.0086, 19.3939),
    "E2024-155286": (80.8286, 19.0550, 80.9712, 19.1898),
}

# Approved inventory: keep these six layers and tag scopes unchanged.
LAYER_QUERIES = {
    "forest": 'nwr["natural"="wood"]({bbox});nwr["landuse"="forest"]({bbox});',
    "protected": 'nwr["boundary"="protected_area"]({bbox});',
    "roads": 'way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"]({bbox});',
    "settlements": 'nwr["place"~"^(city|town|village)$"]({bbox});',
    "water": 'nwr["waterway"="river"]({bbox});nwr["natural"="water"]({bbox});',
    "admin": 'relation["boundary"="administrative"]["admin_level"~"^[2-8]$"]({bbox});',
}


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def query_for(layer: str, box: tuple[float, float, float, float]) -> str:
    west, south, east, north = box
    bbox = f"{south},{west},{north},{east}"
    return f"[out:json][timeout:60];({LAYER_QUERIES[layer].format(bbox=bbox)});out body geom;"


def new_manifest() -> dict:
    return {"generated_at": now(), "source": "OpenStreetMap via Overpass API", "licence": "ODbL 1.0 — © OpenStreetMap contributors", "endpoint": ENDPOINT, "entries": []}


def load_manifest() -> dict:
    if not MANIFEST_PATH.exists():
        return new_manifest()
    try:
        manifest = json.loads(MANIFEST_PATH.read_text())
        if not isinstance(manifest, dict) or not isinstance(manifest.get("entries"), list):
            raise ValueError("manifest is not an object with an entries list")
        return manifest
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"Manifest is unreadable; starting a new one: {exc}", file=sys.stderr)
        return new_manifest()


def write_manifest(manifest: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    temporary = MANIFEST_PATH.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    temporary.replace(MANIFEST_PATH)


def entry_for(manifest: dict, layer: str, incident_id: str) -> dict | None:
    return next((e for e in manifest["entries"] if e.get("layer") == layer and e.get("incident_id") == incident_id), None)


def valid_cache(path: Path) -> tuple[bool, int]:
    try:
        payload = json.loads(path.read_text())
        elements = payload.get("elements")
        return isinstance(elements, list), len(elements) if isinstance(elements, list) else 0
    except (OSError, json.JSONDecodeError, AttributeError):
        return False, 0


def fetch(query: str) -> tuple[dict, int]:
    # GET is intentional: the previous implementation's POST path produced 406.
    url = ENDPOINT + "?" + urllib.parse.urlencode({"data": query})
    request = urllib.request.Request(url, headers=HEADERS, method="GET")
    for attempt in range(1, MAX_ATTEMPTS + 1):
        started = time.monotonic()
        retryable = False
        try:
            with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
                payload = json.loads(response.read().decode("utf-8"))
                if not isinstance(payload, dict) or not isinstance(payload.get("elements"), list):
                    raise ValueError("response is not an Overpass JSON object")
                return payload, len(payload["elements"])
        except urllib.error.HTTPError as exc:
            body = exc.read(2000).decode("utf-8", errors="replace")
            error = f"HTTP {exc.code}: {exc.reason}; response_body={body!r}"
            retryable = exc.code in RETRYABLE_HTTP_CODES
        except (TimeoutError, urllib.error.URLError, OSError, json.JSONDecodeError, ValueError) as exc:
            error = f"{type(exc).__name__}: {exc}"
            retryable = isinstance(exc, (TimeoutError, urllib.error.URLError))
        elapsed = time.monotonic() - started
        if not retryable or attempt == MAX_ATTEMPTS:
            raise RuntimeError(f"{error}; elapsed_seconds={elapsed:.2f}")
        delay = BACKOFF_SECONDS[attempt - 1] + random.uniform(0, 1)
        print(f"  transient attempt {attempt} failed after {elapsed:.1f}s: {error}; retrying in {delay:.1f}s")
        time.sleep(delay)
    raise AssertionError("unreachable")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--layer", choices=tuple(LAYER_QUERIES), help="download only one approved layer")
    parser.add_argument("--incident", choices=tuple(BOXES), help="download only one approved incident box")
    args = parser.parse_args()
    if bool(args.layer) != bool(args.incident):
        parser.error("--layer and --incident must be supplied together")
    print(f"Endpoint: {ENDPOINT}")
    manifest = load_manifest()
    manifest["endpoint"] = ENDPOINT
    manifest["generated_at"] = now()
    write_manifest(manifest)
    counts = {"success": 0, "empty": 0, "cached": 0, "failed": 0}
    last_request_at = 0.0
    layers = [args.layer] if args.layer else list(LAYER_QUERIES)
    incidents = [args.incident] if args.incident else list(BOXES)
    for layer in layers:
        for incident_id in incidents:
            box = BOXES[incident_id]
            output_path = DATA_DIR / layer / f"{incident_id}.json"
            output_path.parent.mkdir(parents=True, exist_ok=True)
            cached, element_count = valid_cache(output_path)
            record = entry_for(manifest, layer, incident_id)
            if cached:
                counts["cached"] += 1
                if record is None:
                    record = {"layer": layer, "incident_id": incident_id}
                    manifest["entries"].append(record)
                record.update({"status": "cached", "element_count": element_count, "file_path": str(output_path.relative_to(ROOT)), "timestamp": now(), "error": None})
                write_manifest(manifest)
                print(f"{layer}/{incident_id}: cached ({element_count} elements)")
                continue
            wait = MIN_REQUEST_INTERVAL_SECONDS - (time.monotonic() - last_request_at)
            if wait > 0:
                time.sleep(wait)
            print(f"{layer}/{incident_id}: requesting")
            last_request_at = time.monotonic()
            if record is None:
                record = {"layer": layer, "incident_id": incident_id}
                manifest["entries"].append(record)
            try:
                payload, element_count = fetch(query_for(layer, box))
                output_path.write_text(json.dumps(payload, indent=2) + "\n")
                status = "empty" if element_count == 0 else "success"
                counts[status] += 1
                record.update({"status": status, "element_count": element_count, "file_path": str(output_path.relative_to(ROOT)), "timestamp": now(), "error": None})
                print(f"  {status.upper()} ({element_count} elements)")
            except Exception as exc:
                counts["failed"] += 1
                record.update({"status": "failed", "element_count": 0, "file_path": str(output_path.relative_to(ROOT)), "timestamp": now(), "error": str(exc)})
                print(f"  FAILED: {exc}", file=sys.stderr)
            write_manifest(manifest)
    print("Summary: " + ", ".join(f"{key}={value}" for key, value in counts.items()))
    return 1 if counts["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())

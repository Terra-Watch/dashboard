#!/usr/bin/env python3
"""Serve a dependency-free local viewer for archived RESQ6 Cell2Fire grids."""
from __future__ import annotations

import argparse
import ast
import hashlib
import json
import re
import struct
import threading
import webbrowser
import zipfile
import zlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse


ROOT = Path(__file__).resolve().parents[2]
ARCHIVE_ROOT = ROOT / "results/resq6/dev_member_grids_horizon_aligned_20261015"
SETUP_PATH = ROOT / "data/resq5/protocol_setup.json"
SUMMARY_DIR = ARCHIVE_ROOT
OUTPUT_DIR = ROOT / "results/resq6/spread_visualization_20261015"
INCIDENTS = ("E2024-131853", "E2024-135332", "E2023-084925", "E2024-155286")
HOURS = (6, 12, 24, 48)
CELL_M = 30.0
_INCIDENT_RE = re.compile(r"^E\d{4}-\d{6}$")


class ArtifactError(ValueError):
    """An archived artifact is missing, malformed, or inconsistent."""


def _safe_json(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ArtifactError(f"cannot read JSON metadata: {path.name}") from exc
    if not isinstance(value, dict):
        raise ArtifactError(f"expected JSON object in {path.name}")
    return value


def load_catalog() -> dict:
    """Build a fixed allowlisted catalog; never accepts paths from a request."""
    setup = _safe_json(SETUP_PATH)
    scenarios = {}
    for incident in INCIDENTS:
        if not _INCIDENT_RE.fullmatch(incident) or incident not in setup:
            raise ArtifactError(f"invalid or missing scenario: {incident}")
        manifest_path = ARCHIVE_ROOT / "member_grids" / incident / "manifest.json"
        manifest = _safe_json(manifest_path)
        case = setup[incident]
        domain = case.get("domain", {})
        shape = manifest.get("grid_shape")
        count = manifest.get("members_saved")
        members = manifest.get("members")
        if (not isinstance(shape, list) or len(shape) != 2 or
                not all(isinstance(v, int) and v > 0 for v in shape) or
                not isinstance(count, int) or count < 1 or
                not isinstance(members, list) or len(members) != count):
            raise ArtifactError(f"invalid member manifest for {incident}")
        if shape != [domain.get("cells_per_side"), domain.get("cells_per_side")]:
            raise ArtifactError(f"manifest/setup dimensions differ for {incident}")
        good_members = {}
        for item in members:
            idx = item.get("member")
            if not isinstance(idx, int) or idx in good_members:
                raise ArtifactError(f"invalid/duplicate member entry for {incident}")
            if item.get("frame_hours") != list(HOURS):
                raise ArtifactError(f"unexpected frame sequence for {incident} member {idx}")
            if item.get("source_frame_hours") != {str(h): h for h in HOURS}:
                raise ArtifactError(f"frames are not exact horizons for {incident} member {idx}")
            digest = item.get("sha256")
            filename = item.get("file")
            if (not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest)
                    or filename != f"member_{idx:03d}.npz"):
                raise ArtifactError(f"invalid artifact identity for {incident} member {idx}")
            good_members[idx] = {"sha256": digest, "file": filename,
                                 "ignition_row_col": item.get("ignition_row_col")}
        if sorted(good_members) != list(range(count)):
            raise ArtifactError(f"non-contiguous members for {incident}")
        summary = _safe_json(SUMMARY_DIR / f"{incident}.json")
        if summary.get("incident_id") != incident:
            raise ArtifactError(f"summary incident mismatch for {incident}")
        scenarios[incident] = {
            "incident_id": incident,
            "state": case.get("state"),
            "t0_utc": case.get("t0_utc"),
            "base_ignition_lat_lon": case.get("ignition_lat_lon"),
            "base_ignition_utm_m": case.get("ignition_utm_m"),
            "crs": domain.get("crs"),
            "west_m": domain.get("west_m"),
            "north_m": domain.get("north_m"),
            "cell_size_m": CELL_M,
            "grid_shape": shape,
            "side_km": domain.get("side_km"),
            "member_count": count,
            "frame_hours": list(HOURS),
            "ros_threshold_used": summary.get("ros_threshold_used"),
            "members": good_members,
            "weather_perturbation_note": (
                "Per-member weather perturbation values are not stored in these archives."
            ),
        }
    return {"archive_set": ARCHIVE_ROOT.relative_to(ROOT).as_posix(), "scenarios": scenarios}


def _read_npy_member(archive: zipfile.ZipFile, name: str, expected_shape: tuple[int, ...],
                     allowed_descr: set[str]) -> tuple[bytes, dict]:
    try:
        raw = archive.read(name)
    except (KeyError, zipfile.BadZipFile, RuntimeError, zlib.error, NotImplementedError) as exc:
        raise ArtifactError(f"missing or unreadable array {name}") from exc
    if len(raw) < 10 or raw[:6] != b"\x93NUMPY":
        raise ArtifactError(f"invalid NPY header for {name}")
    major, minor = raw[6], raw[7]
    if major == 1:
        header_len, offset = struct.unpack_from("<H", raw, 8)[0], 10
    elif major in (2, 3):
        if len(raw) < 12:
            raise ArtifactError(f"truncated NPY header for {name}")
        header_len, offset = struct.unpack_from("<I", raw, 8)[0], 12
    else:
        raise ArtifactError(f"unsupported NPY version {major}.{minor}")
    end = offset + header_len
    if end > len(raw):
        raise ArtifactError(f"truncated NPY header for {name}")
    try:
        header = ast.literal_eval(raw[offset:end].decode("latin1").strip())
    except (SyntaxError, ValueError, UnicodeDecodeError) as exc:
        raise ArtifactError(f"malformed NPY header for {name}") from exc
    if (not isinstance(header, dict) or header.get("descr") not in allowed_descr or
            header.get("shape") != expected_shape or
            not isinstance(header.get("fortran_order"), bool)):
        raise ArtifactError(f"unexpected dtype or shape for {name}")
    data = raw[end:]
    item_size = 1 if header["descr"] == "|b1" else 4
    expected_bytes = item_size
    for dimension in expected_shape:
        expected_bytes *= dimension
    if len(data) != expected_bytes:
        raise ArtifactError(f"unexpected data length for {name}")
    return data, header


def _row_major(data: bytes, rows: int, cols: int, fortran_order: bool) -> bytes:
    if not fortran_order:
        return data
    row_major = bytearray(rows * cols)
    for col_idx in range(cols):
        start = col_idx * rows
        for row_idx in range(rows):
            row_major[row_idx * cols + col_idx] = data[start + row_idx]
    return bytes(row_major)


def load_frame(incident: str, member: int, hour: int, catalog: dict | None = None) -> dict:
    catalog = catalog or load_catalog()
    if incident not in catalog["scenarios"]:
        raise ArtifactError("unknown scenario")
    scenario = catalog["scenarios"][incident]
    if isinstance(member, bool) or not isinstance(member, int) or member not in scenario["members"]:
        raise ArtifactError("unknown ensemble member")
    if isinstance(hour, bool) or not isinstance(hour, int) or hour not in HOURS:
        raise ArtifactError("unsupported elapsed hour")
    member_info = scenario["members"][member]
    path = ARCHIVE_ROOT / "member_grids" / incident / member_info["file"]
    try:
        blob = path.read_bytes()
    except OSError as exc:
        raise ArtifactError(f"cannot read saved member: {path.name}") from exc
    if hashlib.sha256(blob).hexdigest() != member_info["sha256"]:
        raise ArtifactError(f"SHA-256 mismatch for {path.name}")
    try:
        with zipfile.ZipFile(path) as archive:
            data, header = _read_npy_member(
                archive, f"hour_{hour:02d}.npy", tuple(scenario["grid_shape"]), {"|b1"}
            )
            ignition_raw, ignition_header = _read_npy_member(
                archive, "ignition_row_col.npy", (2,), {"<i4", "=i4", "|i4"}
            )
            row, col = struct.unpack("<ii" if ignition_header["descr"] == "<i4" else "=ii", ignition_raw)
    except (zipfile.BadZipFile, RuntimeError, OSError) as exc:
        raise ArtifactError(f"invalid NPZ archive: {path.name}") from exc
    rows, cols = scenario["grid_shape"]
    if not (0 <= row < rows and 0 <= col < cols):
        raise ArtifactError(f"ignition location outside grid in {path.name}")
    # NPY marks the archived Boolean matrix as Fortran-ordered. Convert once
    # to row-major bytes so the browser's north-up canvas has row 0 at top.
    data = _row_major(data, rows, cols, header["fortran_order"])
    if any(value not in (0, 1) for value in data):
        raise ArtifactError(f"non-Boolean cell value in {path.name}")
    return {"scenario": {k: v for k, v in scenario.items() if k != "members"},
            "member": member, "hour": hour, "ignition_row": row,
            "ignition_col": col, "grid_row_major": data}


class ViewerHandler(SimpleHTTPRequestHandler):
    server_version = "RESQ6SpreadViewer/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(OUTPUT_DIR), **kwargs)

    def _send_json(self, value: dict, status: int = 200) -> None:
        body = json.dumps(value).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/scenarios":
            try:
                self._send_json(load_catalog())
            except ArtifactError as exc:
                self._send_json({"error": str(exc)}, 500)
            return
        if parsed.path == "/api/frame":
            query = parse_qs(parsed.query)
            try:
                incident = query.get("scenario", [""])[0]
                member = int(query.get("member", [""])[0])
                hour = int(query.get("hour", [""])[0])
                frame = load_frame(incident, member, hour)
            except (ValueError, ArtifactError) as exc:
                self._send_json({"error": str(exc)}, 400)
                return
            body = frame["grid_row_major"]
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("X-Ignition-Row", str(frame["ignition_row"]))
            self.send_header("X-Ignition-Col", str(frame["ignition_col"]))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return
        if parsed.path == "/" or parsed.path == "/index.html":
            self.path = "/index.html"
        super().do_GET()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args(argv)
    if not OUTPUT_DIR.is_dir() or not (OUTPUT_DIR / "index.html").is_file():
        parser.error(f"viewer assets missing under {OUTPUT_DIR}")
    # Fail fast before opening a socket if the source catalog is inconsistent.
    load_catalog()
    server = ThreadingHTTPServer((args.host, args.port), ViewerHandler)
    url = f"http://{args.host}:{server.server_port}/"
    print(f"RESQ6 simulated-spread viewer: {url} (Ctrl-C to stop)", flush=True)
    if not args.no_browser:
        threading.Timer(0.5, webbrowser.open, args=(url,)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

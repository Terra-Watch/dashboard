"""Run and integrity-check Cell2Fire in an owned temporary workspace.

This verifies software execution and artifact structure only. It does not
establish forecast skill, calibration, or operational validity.
"""
from __future__ import annotations

import argparse
import binascii
import hashlib
import json
import os
import platform
import re
import struct
import subprocess
import sys
import tempfile
import time
import uuid
import zlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import run_demo_simulation as runner


class VerificationError(RuntimeError):
    pass


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _inside(root: Path, candidate: Path) -> Path:
    root = root.resolve()
    candidate = candidate.resolve()
    if candidate == root or root not in candidate.parents:
        raise VerificationError(f"Path escapes or aliases the owned workspace: {candidate}")
    return candidate


def preflight(*, data_dir: Path, binary: Path, lookup: Path) -> list[dict[str, Any]]:
    expected = [
        data_dir / "landcover/worldcover_similipal_demo.tif",
        data_dir / "terrain/elevation_similipal_demo.tif",
        data_dir / "weather/gfs00_2024_01.csv",
        lookup,
        binary,
    ]
    missing = [str(path) for path in expected if not path.is_file()]
    if missing:
        raise VerificationError("Missing required input(s): " + ", ".join(missing))
    if not os.access(binary, os.X_OK):
        raise VerificationError(f"Cell2Fire executable is not executable: {binary}")
    return [{"path": str(path.resolve()), "sha256": sha256_file(path)} for path in expected]


def _decode_capture(value: str | bytes | None) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return value


def _cell2fire_execution(stdout: str) -> dict[str, Any] | None:
    """Read the runner's structured record for the actual simulator process."""
    for line in stdout.splitlines():
        try:
            record = json.loads(line)
        except json.JSONDecodeError:
            continue
        execution = record.get("cell2fire_execution") if isinstance(record, dict) else None
        if isinstance(execution, dict):
            return execution
    return None


def _validate_csv_grid(path: Path) -> int:
    rows = path.read_text().splitlines()
    if len(rows) != runner.ROWS:
        raise VerificationError(f"Grid {path.name} has {len(rows)} rows; expected {runner.ROWS}")
    burned = 0
    for line_number, row in enumerate(rows, start=1):
        values = row.split(",")
        if len(values) != runner.COLS:
            raise VerificationError(f"Grid {path.name} row {line_number} has {len(values)} columns; expected {runner.COLS}")
        try:
            for value in values:
                cell = int(value)
                if cell not in (0, 1):
                    raise VerificationError(f"Grid {path.name} contains unsupported cell value {cell}")
                burned += cell == 1
        except VerificationError:
            raise
        except ValueError as exc:
            raise VerificationError(f"Grid {path.name} contains a non-integer cell") from exc
    return burned


def _validate_png(path: Path) -> None:
    content = path.read_bytes()
    if len(content) < 24 or content[:8] != b"\x89PNG\r\n\x1a\n":
        raise VerificationError(f"Frame {path.name} is empty or not a PNG")
    width, height = struct.unpack(">II", content[16:24])
    if (width, height) != (runner.COLS, runner.ROWS):
        raise VerificationError(f"Frame {path.name} dimensions are {width}x{height}, expected {runner.COLS}x{runner.ROWS}")
    offset = 8
    compressed = bytearray()
    seen_header = seen_end = False
    while offset < len(content):
        if offset + 12 > len(content):
            raise VerificationError(f"Frame {path.name} has a truncated PNG chunk")
        length = struct.unpack(">I", content[offset:offset + 4])[0]
        kind = content[offset + 4:offset + 8]
        end = offset + 12 + length
        if end > len(content):
            raise VerificationError(f"Frame {path.name} has a truncated PNG chunk")
        data = content[offset + 8:offset + 8 + length]
        checksum = struct.unpack(">I", content[offset + 8 + length:end])[0]
        if binascii.crc32(kind + data) & 0xFFFFFFFF != checksum:
            raise VerificationError(f"Frame {path.name} has a corrupt PNG chunk")
        if kind == b"IHDR":
            if seen_header or offset != 8 or len(data) != 13:
                raise VerificationError(f"Frame {path.name} has an invalid PNG header")
            frame_width, frame_height, depth, color, compression, filtering, interlace = struct.unpack(">IIBBBBB", data)
            if (frame_width, frame_height, depth, color, compression, filtering, interlace) != (runner.COLS, runner.ROWS, 8, 6, 0, 0, 0):
                raise VerificationError(f"Frame {path.name} uses unsupported or inconsistent PNG encoding")
            seen_header = True
        elif kind == b"IDAT":
            compressed.extend(data)
        elif kind == b"IEND":
            if length != 0 or end != len(content):
                raise VerificationError(f"Frame {path.name} has an invalid PNG end chunk")
            seen_end = True
            break
        offset = end
    if not seen_header or not seen_end or not compressed:
        raise VerificationError(f"Frame {path.name} is missing required PNG chunks")
    try:
        pixels = zlib.decompress(compressed)
    except zlib.error as exc:
        raise VerificationError(f"Frame {path.name} image payload is corrupt") from exc
    if len(pixels) != runner.ROWS * (1 + runner.COLS * 4):
        raise VerificationError(f"Frame {path.name} pixel payload size is inconsistent with its dimensions")


def validate_outputs(
    work_dir: Path,
    duration_hours: int,
    *,
    latitude: float = runner.ORIGIN_LATITUDE,
    longitude: float = runner.ORIGIN_LONGITUDE,
) -> list[dict[str, Any]]:
    scenario = _inside(work_dir, work_dir / "scenario")
    output = _inside(work_dir, work_dir / "run")
    public = _inside(work_dir, work_dir / "public")
    manifest_path = _inside(work_dir, public / "manifest.json")
    if not manifest_path.is_file() or manifest_path.stat().st_size == 0:
        raise VerificationError("Simulation manifest is missing or empty")
    try:
        manifest = json.loads(manifest_path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        raise VerificationError("Simulation manifest is not valid JSON") from exc

    pattern = re.compile(r"ForestGrid(\d+)\.csv\Z")
    grids: dict[int, Path] = {}
    for path in (output / "Grids/Grids1").glob("ForestGrid*.csv"):
        match = pattern.fullmatch(path.name)
        if not match:
            raise VerificationError(f"Unexpected grid filename: {path.name}")
        index = int(match.group(1))
        if index in grids:
            raise VerificationError(f"Duplicate grid frame index: {index}")
        grids[index] = _inside(work_dir, path)
    expected_indices = list(range(duration_hours + 1))
    if sorted(grids) != expected_indices:
        raise VerificationError(f"Grid frame sequence {sorted(grids)} does not match expected hourly sequence {expected_indices}")

    pngs = sorted(public.glob("frame-*.png"), key=lambda path: path.name)
    expected_png_names = [f"frame-{index:02d}.png" for index in expected_indices]
    if [path.name for path in pngs] != expected_png_names:
        raise VerificationError("PNG frame names/count do not match the configured duration")
    expected_public_names = set(expected_png_names) | {"manifest.json"}
    actual_public_names = {path.name for path in public.iterdir()}
    if actual_public_names != expected_public_names or any(not path.is_file() for path in public.iterdir()):
        raise VerificationError("Public output directory contains missing or unexpected artifacts")
    outputs_by_path: dict[str, dict[str, Any]] = {}
    burned_counts: list[int] = []
    for index in expected_indices:
        grid = grids[index]
        if not grid.is_file() or grid.stat().st_size == 0:
            raise VerificationError(f"Grid output is missing or empty: {grid.name}")
        burned_counts.append(_validate_csv_grid(grid))
        png = _inside(work_dir, public / f"frame-{index:02d}.png")
        if not png.is_file() or png.stat().st_size == 0:
            raise VerificationError(f"PNG output is missing or empty: {png.name}")
        _validate_png(png)
        for path in (grid, png):
            outputs_by_path[str(path)] = {"path": str(path), "workspace_relative_path": str(path.relative_to(work_dir.resolve())), "size_bytes": path.stat().st_size, "sha256": sha256_file(path)}

    rows = manifest.get("grid", {}).get("rows")
    columns = manifest.get("grid", {}).get("columns")
    if (rows, columns) != (runner.ROWS, runner.COLS):
        raise VerificationError("Manifest grid dimensions do not match the generated grid")
    if manifest.get("duration_hours") != duration_hours or manifest.get("frame_count") != len(expected_indices):
        raise VerificationError("Manifest duration/frame count does not match generated outputs")
    if len(manifest.get("burned_cells", [])) != len(expected_indices):
        raise VerificationError("Manifest burned-cell timeline length does not match generated frames")
    if manifest.get("burned_cells") != burned_counts:
        raise VerificationError("Manifest burned-cell counts do not match the generated grid CSVs")
    domain = manifest.get("domain", {})
    if domain.get("rows") != runner.ROWS or domain.get("columns") != runner.COLS or domain.get("cell_size_m") != runner.CELL_SIZE_M:
        raise VerificationError("Manifest domain geometry does not match the configured grid")
    if manifest.get("georeferenced") is not True:
        raise VerificationError("Manifest does not identify outputs as georeferenced")
    if manifest.get("grid", {}).get("row_order") != "north_to_south" or manifest.get("grid", {}).get("column_order") != "west_to_east":
        raise VerificationError("Manifest grid orientation is missing or inconsistent")
    expected_bounds = runner.domain_bounds()
    actual_bounds = manifest.get("domain", {}).get("bounds", {})
    if set(actual_bounds) != set(expected_bounds) or any(
        not isinstance(actual_bounds.get(key), (int, float))
        or abs(actual_bounds[key] - expected_bounds[key]) > 1e-9
        for key in expected_bounds
    ):
        raise VerificationError("Manifest geographic bounds do not match the configured grid")
    location = manifest.get("location", {})
    domain_center = manifest.get("domain", {}).get("center", {})
    ignition = manifest.get("ignition", {})
    expected_row, expected_col = runner.locate_ignition(latitude, longitude)
    if (location.get("latitude"), location.get("longitude")) != (runner.ORIGIN_LATITUDE, runner.ORIGIN_LONGITUDE):
        raise VerificationError("Manifest location does not match the configured demo origin")
    if (domain_center.get("latitude"), domain_center.get("longitude")) != (runner.ORIGIN_LATITUDE, runner.ORIGIN_LONGITUDE):
        raise VerificationError("Manifest domain center does not match the configured demo origin")
    if (ignition.get("latitude"), ignition.get("longitude"), ignition.get("row"), ignition.get("column"), ignition.get("ncell")) != (
        latitude, longitude, expected_row, expected_col, runner.ignition_ncell(expected_row, expected_col)
    ):
        raise VerificationError("Manifest ignition coordinate or cell does not match the requested ignition")
    outputs_by_path[str(manifest_path)] = {"path": str(manifest_path), "workspace_relative_path": str(manifest_path.relative_to(work_dir.resolve())), "size_bytes": manifest_path.stat().st_size, "sha256": sha256_file(manifest_path)}
    # Include simulator messages and the prepared scenario files in integrity records.
    for directory in (scenario, output):
        for path in sorted(directory.rglob("*")):
            if path.is_file():
                owned = _inside(work_dir, path)
                outputs_by_path[str(owned)] = {"path": str(owned), "workspace_relative_path": str(owned.relative_to(work_dir.resolve())), "size_bytes": owned.stat().st_size, "sha256": sha256_file(owned)}
    return list(outputs_by_path.values())


def _write_report(path: Path, report: dict[str, Any]) -> None:
    target = path.expanduser().resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        raise VerificationError(f"Refusing to overwrite an existing verification report: {target}")
    temp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=target.parent, prefix=f".{target.name}.", delete=False) as handle:
            temp_path = Path(handle.name)
            json.dump(report, handle, indent=2, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        # Hard-link publication fails rather than replacing a concurrently-created report.
        os.link(temp_path, target)
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)


def run_verification(
    *,
    latitude: float = runner.ORIGIN_LATITUDE,
    longitude: float = runner.ORIGIN_LONGITUDE,
    duration_hours: int = 6,
    timeout_seconds: float = 120.0,
    data_dir: Path = runner.DATA,
    binary: Path = runner.BINARY,
    lookup: Path = runner.LOOKUP,
    report_file: Path | None = None,
    runner_script: Path = Path(__file__).with_name("run_demo_simulation.py"),
) -> dict[str, Any]:
    runner.validate_duration(duration_hours)
    runner.locate_ignition(latitude, longitude)
    if timeout_seconds <= 0 or timeout_seconds > 600:
        raise VerificationError("timeout_seconds must be greater than 0 and at most 600")
    if not runner_script.is_file():
        raise VerificationError(f"Simulation runner script is missing: {runner_script}")
    inputs = preflight(data_dir=data_dir, binary=binary, lookup=lookup)
    run_id = uuid.uuid4().hex
    started = datetime.now(timezone.utc)
    start_clock = time.monotonic()
    report: dict[str, Any] = {
        "schema_version": 1,
        "run_id": run_id,
        "status": "failed",
        "started_at_utc": started.isoformat(),
        "finished_at_utc": None,
        "duration_seconds": None,
        "execution_kind": "actual_cell2fire_process_if_runner_reaches_binary",
        "input_provenance": inputs,
        "code_and_runtime_provenance": {
            "sha256": [
                {"path": str(path.resolve()), "sha256": sha256_file(path)}
                for path in (
                    runner_script,
                    Path(__file__),
                    Path(runner.__file__),
                    Path(runner.__file__).with_name("simulation_domain.py"),
                    Path(runner.__file__).with_name("proxy_mapping.py"),
                )
            ],
            "python_executable": sys.executable,
            "python_version": sys.version,
            "platform": {
                "system": platform.system(),
                "release": platform.release(),
                "machine": platform.machine(),
            },
        },
        "requested": {"latitude": latitude, "longitude": longitude, "duration_hours": duration_hours, "timeout_seconds": timeout_seconds},
        "command": None,
        "cell2fire_execution": None,
        "exit_code": None,
        "timed_out": False,
        "stdout": "",
        "stderr": "",
        "output_artifacts": [],
        "workspace_path": None,
        "workspace_cleaned": False,
        "error": None,
    }
    try:
        with tempfile.TemporaryDirectory(prefix="resq-cell2fire-verify-") as temp_root:
            work_dir = Path(temp_root) / "workspace"
            work_dir.mkdir()
            report["workspace_path"] = str(work_dir)
            command = [
                sys.executable, str(runner_script.resolve()),
                "--latitude", repr(float(latitude)), "--longitude", repr(float(longitude)),
                "--duration-hours", str(duration_hours), "--data-dir", str(data_dir.resolve()),
                "--work-dir", str(work_dir), "--binary", str(binary.resolve()),
                "--lookup", str(lookup.resolve()), "--timeout-seconds", str(timeout_seconds),
            ]
            report["command"] = command
            try:
                completed = subprocess.run(command, capture_output=True, text=True, timeout=timeout_seconds + 15)
                report["exit_code"] = completed.returncode
                report["stdout"] = completed.stdout
                report["stderr"] = completed.stderr
                report["cell2fire_execution"] = _cell2fire_execution(completed.stdout)
                if completed.returncode != 0:
                    report["error"] = f"Runner exited with status {completed.returncode}"
                else:
                    if report["cell2fire_execution"] is None:
                        report["error"] = "Runner did not report the Cell2Fire subprocess execution record"
                        raise VerificationError(report["error"])
                    execution = report["cell2fire_execution"]
                    if execution.get("timed_out") or execution.get("exit_code") != 0:
                        report["error"] = "Cell2Fire subprocess did not complete successfully"
                        raise VerificationError(report["error"])
                    try:
                        report["output_artifacts"] = validate_outputs(
                            work_dir, duration_hours, latitude=latitude, longitude=longitude
                        )
                        report["status"] = "execution_verified"
                    except VerificationError as exc:
                        report["error"] = str(exc)
            except subprocess.TimeoutExpired as exc:
                report["timed_out"] = True
                report["stdout"] = _decode_capture(exc.stdout)
                report["stderr"] = _decode_capture(exc.stderr)
                report["error"] = f"Verifier process exceeded {timeout_seconds + 15} seconds"
            finally:
                report["duration_seconds"] = round(time.monotonic() - start_clock, 3)
                report["finished_at_utc"] = datetime.now(timezone.utc).isoformat()
        report["workspace_cleaned"] = True
    except Exception as exc:
        report["duration_seconds"] = round(time.monotonic() - start_clock, 3)
        report["finished_at_utc"] = datetime.now(timezone.utc).isoformat()
        report["error"] = f"{type(exc).__name__}: {exc}"
    if report["workspace_path"] is not None:
        report["workspace_cleaned"] = not Path(report["workspace_path"]).exists()

    if report_file is not None:
        _write_report(report_file, report)
        report["report_file"] = str(report_file.expanduser().resolve())
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--latitude", type=float, default=runner.ORIGIN_LATITUDE)
    parser.add_argument("--longitude", type=float, default=runner.ORIGIN_LONGITUDE)
    parser.add_argument("--duration-hours", type=int, default=6)
    parser.add_argument("--timeout-seconds", type=float, default=120.0)
    parser.add_argument("--data-dir", type=Path, default=runner.DATA)
    parser.add_argument("--binary", type=Path, default=runner.BINARY)
    parser.add_argument("--lookup", type=Path, default=runner.LOOKUP)
    parser.add_argument("--report-file", type=Path, help="new, non-existing path for durable JSON verification record")
    args = parser.parse_args(argv)
    try:
        report = run_verification(
            latitude=args.latitude,
            longitude=args.longitude,
            duration_hours=args.duration_hours,
            timeout_seconds=args.timeout_seconds,
            data_dir=args.data_dir,
            binary=args.binary,
            lookup=args.lookup,
            report_file=args.report_file,
        )
    except (VerificationError, runner.RequestOutsideDomain, OSError) as exc:
        print(json.dumps({"status": "blocked", "error": str(exc)}, indent=2), file=sys.stderr)
        return 2
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["status"] == "execution_verified" else 1


if __name__ == "__main__":
    raise SystemExit(main())

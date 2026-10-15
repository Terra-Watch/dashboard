"""Mocked tests for the isolated Cell2Fire verification harness.

These tests validate harness safety and artifact checks; they do not execute
Cell2Fire or establish scientific validity.
"""
from __future__ import annotations

import json
import os
import struct
import sys
import tempfile
import unittest
import zlib
from pathlib import Path
from unittest import mock

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND / "inference"))

import run_demo_simulation as runner  # noqa: E402
import verify_demo_simulation as verify  # noqa: E402


def _png(path: Path) -> None:
    width, height = runner.COLS, runner.ROWS
    raw = b"".join(b"\x00" + bytes((0, 0, 0, 0)) * width for _ in range(height))

    def chunk(kind: bytes, data: bytes) -> bytes:
        import binascii
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", binascii.crc32(kind + data) & 0xFFFFFFFF)

    image = b"\x89PNG\r\n\x1a\n"
    image += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
    image += chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")
    path.write_bytes(image)


def _write_outputs(work: Path, duration: int, *, missing_last: bool = False, corrupt_png: bool = False) -> None:
    scenario = work / "scenario"
    grids_dir = work / "run/Grids/Grids1"
    public = work / "public"
    scenario.mkdir(parents=True, exist_ok=True)
    grids_dir.mkdir(parents=True, exist_ok=True)
    public.mkdir(parents=True, exist_ok=True)
    frame_count = duration if missing_last else duration + 1
    burned = []
    for index in range(frame_count):
        rows = [",".join("1" if row == 0 and col == 0 else "0" for col in range(runner.COLS)) for row in range(runner.ROWS)]
        (grids_dir / f"ForestGrid{index}.csv").write_text("\n".join(rows) + "\n")
        burned.append(1)
        frame_path = public / f"frame-{index:02d}.png"
        if corrupt_png:
            frame_path.write_bytes(b"not a png")
        else:
            _png(frame_path)
    manifest = {
        "location": {"latitude": runner.ORIGIN_LATITUDE, "longitude": runner.ORIGIN_LONGITUDE},
        "duration_hours": duration,
        "frame_count": duration + 1,
        "burned_cells": burned + ([1] if missing_last else []),
        "ignition": {
            "latitude": runner.ORIGIN_LATITUDE,
            "longitude": runner.ORIGIN_LONGITUDE,
            "row": runner.locate_ignition(runner.ORIGIN_LATITUDE, runner.ORIGIN_LONGITUDE)[0],
            "column": runner.locate_ignition(runner.ORIGIN_LATITUDE, runner.ORIGIN_LONGITUDE)[1],
            "ncell": runner.ignition_ncell(*runner.locate_ignition(runner.ORIGIN_LATITUDE, runner.ORIGIN_LONGITUDE)),
        },
        "grid": {"rows": runner.ROWS, "columns": runner.COLS, "cell_size_m": runner.CELL_SIZE_M, "row_order": "north_to_south", "column_order": "west_to_east"},
        "domain": {"rows": runner.ROWS, "columns": runner.COLS, "cell_size_m": runner.CELL_SIZE_M, "center": {"latitude": runner.ORIGIN_LATITUDE, "longitude": runner.ORIGIN_LONGITUDE}, "bounds": runner.domain_bounds()},
        "georeferenced": True,
    }
    (public / "manifest.json").write_text(json.dumps(manifest))


class HarnessTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="resq-verifier-test-")
        self.root = Path(self.temp.name)
        self.data = self.root / "inputs"
        for relative in (
            "landcover/worldcover_similipal_demo.tif",
            "terrain/elevation_similipal_demo.tif",
            "weather/gfs00_2024_01.csv",
        ):
            path = self.data / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b"fixture input")
        self.binary = self.root / "fake-cell2fire"
        self.binary.write_text("unit-test placeholder; never executed by mocked harness tests\n")
        self.binary.chmod(0o755)
        self.lookup = self.root / "lookup.csv"
        self.lookup.write_text("grid_value,label\n1,fixture\n")
        self.runner_script = self.root / "fake-runner.py"
        self.runner_script.write_text("# runner invocation is intercepted by unittest.mock\n")

    def tearDown(self):
        self.temp.cleanup()

    def mock_success(self, command, **kwargs):
        work = Path(command[command.index("--work-dir") + 1])
        duration = int(command[command.index("--duration-hours") + 1])
        _write_outputs(work, duration)
        execution = {
            "cell2fire_execution": {
                "command": [str(self.binary), "--seed", "42"],
                "exit_code": 0,
                "duration_seconds": 0.25,
                "timed_out": False,
                "stdout": "simulator output",
                "stderr": "",
            }
        }
        return __import__("subprocess").CompletedProcess(command, 0, json.dumps(execution), "")

    def run_mocked(self, **kwargs):
        return verify.run_verification(
            data_dir=self.data,
            binary=self.binary,
            lookup=self.lookup,
            runner_script=self.runner_script,
            duration_hours=2,
            **kwargs,
        )

    def test_success_records_hashes_and_cleans_only_owned_workspace(self):
        sentinel = self.root / "unrelated.txt"
        sentinel.write_text("preserve me")
        report_path = self.root / "reports/run.json"
        with mock.patch.object(verify.subprocess, "run", side_effect=self.mock_success) as invoke:
            report = self.run_mocked(report_file=report_path)

        invoke.assert_called_once()
        self.assertEqual(report["status"], "execution_verified")
        self.assertEqual(report["exit_code"], 0)
        self.assertEqual(report["cell2fire_execution"]["command"], [str(self.binary), "--seed", "42"])
        self.assertEqual(report["cell2fire_execution"]["exit_code"], 0)
        self.assertEqual(report["cell2fire_execution"]["stdout"], "simulator output")
        self.assertTrue(all(len(item["sha256"]) == 64 for item in report["code_and_runtime_provenance"]["sha256"]))
        self.assertTrue(report["workspace_cleaned"])
        self.assertGreaterEqual(len(report["input_provenance"]), 5)
        self.assertTrue(all(len(item["sha256"]) == 64 for item in report["output_artifacts"]))
        self.assertFalse(Path(report["workspace_path"]).exists())
        self.assertEqual(sentinel.read_text(), "preserve me")
        saved = json.loads(report_path.read_text())
        self.assertEqual(saved["run_id"], report["run_id"])
        self.assertNotIn("report_file", saved)

    def test_nonzero_exit_is_not_success(self):
        with mock.patch.object(verify.subprocess, "run", return_value=__import__("subprocess").CompletedProcess([], 9, "", "sim failed")):
            report = self.run_mocked()
        self.assertEqual(report["status"], "failed")
        self.assertEqual(report["exit_code"], 9)
        self.assertIn("status 9", report["error"])
        self.assertTrue(report["workspace_cleaned"])

    def test_nonzero_cell2fire_exit_is_not_success_even_if_runner_exits_zero(self):
        def runner_reports_failure(command, **kwargs):
            execution = {"cell2fire_execution": {
                "command": [str(self.binary)], "exit_code": 17,
                "duration_seconds": 0.1, "timed_out": False,
                "stdout": "", "stderr": "simulator failed",
            }}
            return __import__("subprocess").CompletedProcess(command, 0, json.dumps(execution), "")

        with mock.patch.object(verify.subprocess, "run", side_effect=runner_reports_failure):
            report = self.run_mocked()
        self.assertEqual(report["status"], "failed")
        self.assertEqual(report["cell2fire_execution"]["exit_code"], 17)
        self.assertIn("Cell2Fire subprocess", report["error"])
        self.assertTrue(report["workspace_cleaned"])

    def test_zero_exit_runner_without_cell2fire_record_is_not_execution_verified(self):
        def runner_without_record(command, **kwargs):
            work = Path(command[command.index("--work-dir") + 1])
            duration = int(command[command.index("--duration-hours") + 1])
            _write_outputs(work, duration)
            return __import__("subprocess").CompletedProcess(command, 0, "no structured record", "")

        with mock.patch.object(verify.subprocess, "run", side_effect=runner_without_record):
            report = self.run_mocked()
        self.assertEqual(report["status"], "failed")
        self.assertIsNone(report["cell2fire_execution"])
        self.assertIn("did not report", report["error"])
        self.assertTrue(report["workspace_cleaned"])

    def test_timeout_is_recorded_and_temp_workspace_is_cleaned(self):
        def timeout(command, **kwargs):
            raise __import__("subprocess").TimeoutExpired(command, kwargs["timeout"], output="partial out", stderr="partial err")

        with mock.patch.object(verify.subprocess, "run", side_effect=timeout):
            report = self.run_mocked(timeout_seconds=0.1)
        self.assertEqual(report["status"], "failed")
        self.assertTrue(report["timed_out"])
        self.assertIn("partial out", report["stdout"])
        self.assertIn("partial err", report["stderr"])
        self.assertTrue(report["workspace_cleaned"])

    def test_missing_input_and_non_executable_binary_fail_preflight(self):
        (self.data / "weather/gfs00_2024_01.csv").unlink()
        with self.assertRaises(verify.VerificationError):
            verify.preflight(data_dir=self.data, binary=self.binary, lookup=self.lookup)
        (self.data / "weather/gfs00_2024_01.csv").write_text("available")
        self.binary.chmod(0o644)
        with self.assertRaises(verify.VerificationError):
            verify.preflight(data_dir=self.data, binary=self.binary, lookup=self.lookup)

    def test_missing_frames_and_corrupt_frames_fail_validation(self):
        for corrupt in (False, True):
            work = self.root / ("corrupt" if corrupt else "missing")
            work.mkdir()
            _write_outputs(work, 2, missing_last=not corrupt, corrupt_png=corrupt)
            with self.assertRaises(verify.VerificationError):
                verify.validate_outputs(work, 2)

    def test_manifest_count_mismatch_and_path_traversal_are_rejected(self):
        work = self.root / "mismatch"
        work.mkdir()
        _write_outputs(work, 2)
        manifest = work / "public/manifest.json"
        content = json.loads(manifest.read_text())
        content["burned_cells"][0] += 1
        manifest.write_text(json.dumps(content))
        with self.assertRaises(verify.VerificationError):
            verify.validate_outputs(work, 2)
        outside = self.root / "outside.txt"
        outside.write_text("not owned")
        with self.assertRaises(verify.VerificationError):
            verify._inside(work, outside)
        self.assertEqual(outside.read_text(), "not owned")

    def test_unexpected_public_output_is_rejected(self):
        work = self.root / "extra-public"
        work.mkdir()
        _write_outputs(work, 2)
        (work / "public/untracked.bin").write_bytes(b"unexpected")
        with self.assertRaisesRegex(verify.VerificationError, "unexpected artifacts"):
            verify.validate_outputs(work, 2)

    def test_manifest_bounds_orientation_and_ignition_must_match_grid(self):
        for field, value in (
            ("bounds", {"west": 0, "south": 0, "east": 1, "north": 1}),
            ("row_order", "south_to_north"),
            ("ignition", {"latitude": 0, "longitude": 0, "row": 0, "column": 0, "ncell": 1}),
        ):
            work = self.root / ("bad-" + field)
            work.mkdir()
            _write_outputs(work, 2)
            manifest_path = work / "public/manifest.json"
            manifest = json.loads(manifest_path.read_text())
            if field == "bounds":
                manifest["domain"][field] = value
            elif field == "row_order":
                manifest["grid"][field] = value
            else:
                manifest[field] = value
            manifest_path.write_text(json.dumps(manifest))
            with self.subTest(field=field), self.assertRaises(verify.VerificationError):
                verify.validate_outputs(work, 2)

    def test_nonbinary_grid_cell_values_are_rejected(self):
        work = self.root / "nonbinary-grid"
        work.mkdir()
        _write_outputs(work, 2)
        grid = work / "run/Grids/Grids1/ForestGrid0.csv"
        rows = grid.read_text().splitlines()
        rows[0] = "2," + rows[0].split(",", 1)[1]
        grid.write_text("\n".join(rows) + "\n")
        with self.assertRaisesRegex(verify.VerificationError, "unsupported cell value"):
            verify.validate_outputs(work, 2)

    def test_report_refuses_to_overwrite_existing_file(self):
        path = self.root / "report.json"
        path.write_text("original")
        with self.assertRaises(verify.VerificationError):
            verify._write_report(path, {"status": "fake"})
        self.assertEqual(path.read_text(), "original")


class RunnerWorkspaceTests(unittest.TestCase):
    def test_isolated_work_dir_routes_outputs_and_preserves_default_files(self):
        with tempfile.TemporaryDirectory(prefix="resq-runner-isolation-") as temp:
            root = Path(temp)
            data = root / "inputs"
            for relative in (
                "landcover/worldcover_similipal_demo.tif",
                "terrain/elevation_similipal_demo.tif",
                "weather/gfs00_2024_01.csv",
            ):
                path = data / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b"fixture")
            binary = root / "binary"
            binary.write_text("placeholder")
            binary.chmod(0o755)
            lookup = root / "lookup.csv"
            lookup.write_text("grid_value,label\n1,fixture\n")
            work = root / "owned-workspace"
            default_scenario, default_output, default_public = root / "default-scenario", root / "default-run", root / "default-public"
            default_output.mkdir(); default_public.mkdir()
            (default_output / "keep.txt").write_text("old grid data")
            (default_public / "frame-00.png").write_bytes(b"historical frame")
            prior_globals = (runner.DATA, runner.SCENARIO, runner.OUTPUT, runner.PUBLIC, runner.BINARY, runner.LOOKUP)

            def fake_run(command, **kwargs):
                grids = runner.OUTPUT / "Grids/Grids1"
                grids.mkdir(parents=True)
                for index in range(2):
                    values = [",".join("0" for _ in range(runner.COLS)) for _ in range(runner.ROWS)]
                    (grids / f"ForestGrid{index}.csv").write_text("\n".join(values) + "\n")
                return __import__("subprocess").CompletedProcess(command, 0, "mock only", "")

            try:
                with (
                    mock.patch.object(runner, "SCENARIO", default_scenario),
                    mock.patch.object(runner, "OUTPUT", default_output),
                    mock.patch.object(runner, "PUBLIC", default_public),
                    mock.patch.object(runner, "_build_grid", return_value={"fuel_ids": [1], "worldcover_classes": [10]}),
                    mock.patch.object(runner, "_write_lookup"),
                    mock.patch.object(runner, "_weather_rows", side_effect=lambda *args: {"profile": "fixture"}),
                    mock.patch.object(runner.subprocess, "run", side_effect=fake_run),
                ):
                    runner.main(["--data-dir", str(data), "--work-dir", str(work), "--binary", str(binary), "--lookup", str(lookup), "--duration-hours", "1"])
                self.assertTrue((work / "public/manifest.json").is_file())
                self.assertEqual((default_output / "keep.txt").read_text(), "old grid data")
                self.assertEqual((default_public / "frame-00.png").read_bytes(), b"historical frame")
                with self.assertRaises(ValueError):
                    runner._configure_work_dir(work)
            finally:
                runner.DATA, runner.SCENARIO, runner.OUTPUT, runner.PUBLIC, runner.BINARY, runner.LOOKUP = prior_globals


if __name__ == "__main__":
    unittest.main()

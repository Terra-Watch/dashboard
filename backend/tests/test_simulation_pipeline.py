"""Coordinates, duration and domain validation for the development simulation.

Run with: python -m unittest discover -s backend/tests (from the website root,
using backend/.venv for the router test).
"""
import csv
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
sys.path.insert(0, str(BACKEND / "inference"))

import run_demo_simulation as runner  # noqa: E402
from simulation_domain import (  # noqa: E402
    CELL_SIZE_M, COLS, ORIGIN_LATITUDE, ORIGIN_LONGITUDE, ROWS, RequestOutsideDomain,
    domain_bounds, ignition_ncell, locate_ignition, metres_per_degree, validate_duration,
)


class DomainTests(unittest.TestCase):
    def test_default_origin_keeps_the_demo_ignition_cell(self):
        self.assertEqual(locate_ignition(ORIGIN_LATITUDE, ORIGIN_LONGITUDE), (20, 20))
        self.assertEqual(ignition_ncell(20, 20), 821)

    def test_bounds_are_the_true_1200_m_extent(self):
        b = domain_bounds()
        per_lat, per_lon = metres_per_degree(ORIGIN_LATITUDE)
        self.assertAlmostEqual((b["north"] - b["south"]) * per_lat, ROWS * CELL_SIZE_M, places=6)
        self.assertAlmostEqual((b["east"] - b["west"]) * per_lon, COLS * CELL_SIZE_M, places=6)

    def test_point_moves_the_ignition_cell(self):
        per_lat, per_lon = metres_per_degree(ORIGIN_LATITUDE)
        # 100 m east and 100 m north of the centre: 3.33 cells -> 3 cells.
        row, col = locate_ignition(ORIGIN_LATITUDE + 100 / per_lat, ORIGIN_LONGITUDE + 100 / per_lon)
        self.assertEqual((row, col), (20 - 4, 20 + 3))
        self.assertEqual(locate_ignition(*[domain_bounds()[k] for k in ("north", "west")]), (0, 0))
        self.assertEqual(locate_ignition(*[domain_bounds()[k] for k in ("south", "east")]), (ROWS - 1, COLS - 1))

    def test_outside_domain_is_rejected(self):
        per_lat, _ = metres_per_degree(ORIGIN_LATITUDE)
        with self.assertRaises(RequestOutsideDomain):
            locate_ignition(ORIGIN_LATITUDE + 700 / per_lat, ORIGIN_LONGITUDE)
        with self.assertRaises(RequestOutsideDomain):
            locate_ignition(21.0, 80.0)
        with self.assertRaises(RequestOutsideDomain):
            locate_ignition(float("nan"), ORIGIN_LONGITUDE)

    def test_duration_range(self):
        self.assertEqual(validate_duration(6), 6)
        for bad in (0, 49, -1, True):
            with self.assertRaises(RequestOutsideDomain):
                validate_duration(bad)


class RunnerTests(unittest.TestCase):
    def test_coordinates_and_duration_reach_cell2fire_inputs_and_manifest(self):
        per_lat, per_lon = metres_per_degree(ORIGIN_LATITUDE)
        latitude, longitude = ORIGIN_LATITUDE + 100 / per_lat, ORIGIN_LONGITUDE + 100 / per_lon
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            data, public = tmp / "data", tmp / "public"
            (data / "weather").mkdir(parents=True)
            columns = [f"{kind}10_h{hour:02d}" for hour in range(6, 18) for kind in ("u", "v")]
            with (data / "weather/gfs00_2024_01.csv").open("w", newline="") as handle:
                writer = csv.writer(handle); writer.writerow(columns); writer.writerow([100] * len(columns))
            binary = tmp / "Cell2Fire"; binary.write_text("")
            calls = []

            def fake_run(command, **kwargs):
                calls.append(command)
                grids = data / "run/Grids/Grids1"; grids.mkdir(parents=True, exist_ok=True)
                for hour in range(7):
                    (grids / f"ForestGrid{hour}.csv").write_text("\n".join(",".join("0" for _ in range(COLS)) for _ in range(ROWS)) + "\n")
                return subprocess.CompletedProcess(command, 0, "", "")

            patches = [mock.patch.object(runner, name, value) for name, value in {
                "DATA": data, "SCENARIO": data / "scenario", "OUTPUT": data / "run", "PUBLIC": public, "BINARY": binary,
                "_build_grid": lambda: {"fuel_ids": [], "worldcover_classes": []}, "_write_lookup": lambda: None,
            }.items()] + [mock.patch.object(runner.subprocess, "run", fake_run)]
            for patch in patches: patch.start()
            try:
                runner.main(["--latitude", repr(latitude), "--longitude", repr(longitude), "--duration-hours", "6"])
            finally:
                for patch in patches: patch.stop()
            ignitions = list(csv.reader((data / "scenario/Ignitions.csv").open()))
            self.assertEqual(ignitions[1], ["1", str(ignition_ncell(16, 23))])
            self.assertEqual(len(list(csv.reader((data / "scenario/Weather.csv").open()))) - 1, 6)
            manifest = json.loads((public / "manifest.json").read_text())
            self.assertEqual(manifest["duration_hours"], 6)
            self.assertEqual((manifest["ignition"]["row"], manifest["ignition"]["column"]), (16, 23))
            self.assertEqual(manifest["inputs"]["weather"]["profile"], "fixed")
            self.assertEqual(len(calls), 1)

    def test_runner_rejects_a_point_outside_the_domain_before_running(self):
        with mock.patch.object(runner.subprocess, "run") as run:
            with self.assertRaises(SystemExit):
                runner.main(["--latitude", "21.0", "--longitude", "80.0"])
            run.assert_not_called()


class ServiceAndRouterTests(unittest.TestCase):
    def test_service_passes_arguments_to_runner_process(self):
        from app.services import simulation_service as service
        completed = subprocess.CompletedProcess([], 0, "", "")
        with tempfile.TemporaryDirectory() as tmp:
            manifest = Path(tmp) / "manifest.json"; manifest.write_text("{}")
            with mock.patch.object(service, "MANIFEST", manifest), mock.patch.object(service.subprocess, "run", return_value=completed) as run:
                service.run_simulation(ORIGIN_LATITUDE + 0.001, ORIGIN_LONGITUDE - 0.001, 24)
        argv = run.call_args.args[0]
        self.assertEqual(argv[argv.index("--duration-hours") + 1], "24")
        self.assertAlmostEqual(float(argv[argv.index("--latitude") + 1]), ORIGIN_LATITUDE + 0.001)
        self.assertAlmostEqual(float(argv[argv.index("--longitude") + 1]), ORIGIN_LONGITUDE - 0.001)

    def test_router_forwards_request_and_rejects_outside_domain(self):
        from fastapi import HTTPException
        from app.contracts.schemas import SpreadRequest
        from app.routers import operations
        manifest = {"scenario_id": "x", "frame_count": 25, "grid": {"rows": 40, "columns": 40, "cell_size_m": 30}, "burned_cells": [1], "inputs": {"weather": {"profile": "fixed"}}, "georeferenced": True}
        with mock.patch.object(operations, "run_simulation", return_value=manifest) as run:
            result = operations.create_spread_job(SpreadRequest(latitude=ORIGIN_LATITUDE + 0.002, longitude=ORIGIN_LONGITUDE, duration_hours=24), {})
            run.assert_called_once_with(ORIGIN_LATITUDE + 0.002, ORIGIN_LONGITUDE, 24)
            self.assertEqual(result["status"], "development_demo")
            self.assertEqual(result["wind_profile"]["kind"], "fixed")
            with self.assertRaises(HTTPException) as caught:
                operations.create_spread_job(SpreadRequest(latitude=ORIGIN_LATITUDE + 0.05, longitude=ORIGIN_LONGITUDE, duration_hours=24), {})
            self.assertEqual(caught.exception.status_code, 422)
            self.assertEqual(run.call_count, 1)


if __name__ == "__main__":
    unittest.main()

"""Import one daily run written by the scoring job (run.json + scores.csv) into the database.

Usage: python -m inference.import_live_run RUN_DIR
The job normally posts the run to POST /api/risk/runs instead (no database password outside the host); this script is the direct route for local use.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd
from sqlalchemy import create_engine

from app.core.config import DATABASE_URL  # same variable names and URL normalising as the app (production uses DATABASE_URL_DATABASE_URL)
from app.services.risk_runs import import_run_data


def import_run(run_dir: Path, engine=None) -> int:
    info = json.loads((run_dir / "run.json").read_text())
    return import_run_data(info, pd.read_csv(run_dir / "scores.csv"), engine or create_engine(DATABASE_URL, pool_pre_ping=True))


if __name__ == "__main__":
    print(f"Imported {import_run(Path(sys.argv[1]))} ranked cells")

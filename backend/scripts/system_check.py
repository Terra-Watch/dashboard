"""Runs the system check from a terminal, with the settings of this machine's backend/.env (or the environment). Exit code 1 if anything fails.
usage: python scripts/system_check.py [--deep]
"""
import asyncio, os, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app.core.config  # noqa: E402,F401
from app.services import diagnostics  # noqa: E402


async def main() -> int:
    findings = diagnostics.config_findings(os.environ) + await diagnostics.live_findings(os.environ, deep="--deep" in sys.argv)
    for f in sorted(findings, key=lambda x: {"fail": 0, "warn": 1, "ok": 2}[x["level"]]):
        print(f"{f['level'].upper():5} {f['title']}: {f['detail']}")
    return 1 if any(f["level"] == "fail" for f in findings) else 0


sys.exit(asyncio.run(main()))

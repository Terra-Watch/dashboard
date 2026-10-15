#!/usr/bin/env python3
"""Safely publish independently validated Southern Zone metadata.

This utility deliberately does not open or hash a PBF.  The caller supplies an
evidence document produced after independent validation of the official file.
Only a validated partial -> validated transition for the approved Southern
entry is supported.
"""

from __future__ import annotations

import argparse
import copy
import json
import os
import re
import tempfile
from pathlib import Path
from typing import Any


TARGET_REGION = "Southern Zone"
SOURCE_URL = "https://download.geofabrik.de/asia/india/southern-zone-latest.osm.pbf"
PARTIAL_PATH = "data/osm/geofabrik/southern-zone-latest.osm.pbf.part"
FINAL_PATH = "data/osm/geofabrik/southern-zone-latest.osm.pbf"
EXPECTED_SIZE = 558_191_437
EXPECTED_MD5 = "cd4deedec8d7d607668849445d5fbbc5"
SHA256_PLACEHOLDER = "UNAVAILABLE_UNTIL_DOWNLOAD_COMPLETES"
HEX32 = re.compile(r"^[0-9a-fA-F]{32}$")
HEX64 = re.compile(r"^[0-9a-fA-F]{64}$")

REQUIRED_VALIDATION_FLAGS = (
    "size",
    "published_md5",
    "calculated_md5",
    "sha256",
    "pbf_readability",
)


class ManifestUpdateError(ValueError):
    """Raised when evidence or manifest state is unsafe to publish."""


def _read_json(path: Path, label: str) -> Any:
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        raise ManifestUpdateError(f"cannot read valid {label}: {path}: {exc}") from exc


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ManifestUpdateError(message)


def _validate_manifest_shape(manifest: Any) -> tuple[dict[str, Any], dict[str, Any]]:
    _require(isinstance(manifest, dict), "manifest must be a JSON object")
    _require(
        manifest.get("source") == "Official Geofabrik OpenStreetMap regional extracts",
        "manifest source is not the approved official Geofabrik source",
    )
    entries = manifest.get("entries")
    _require(isinstance(entries, list), "manifest entries must be a list")

    regions: set[str] = set()
    target: dict[str, Any] | None = None
    for entry in entries:
        _require(isinstance(entry, dict), "every manifest entry must be an object")
        region = entry.get("region")
        _require(isinstance(region, str) and region, "every manifest entry needs a region")
        _require(region not in regions, f"duplicate manifest region: {region}")
        regions.add(region)
        if region == TARGET_REGION:
            target = entry
    _require(target is not None, f"manifest has no unique {TARGET_REGION} entry")
    return manifest, target


def _validate_current_target(entry: dict[str, Any]) -> None:
    _require(entry.get("source_url") == SOURCE_URL, "Southern source URL is not the approved official URL")
    _require(entry.get("expected_size_bytes") == EXPECTED_SIZE, "Southern expected size is incorrect")
    _require(entry.get("published_md5") == EXPECTED_MD5, "Southern published MD5 is incorrect")

    status = entry.get("status")
    if status == "partial":
        _require(entry.get("file_path") == PARTIAL_PATH, "partial Southern entry has an unexpected file path")
        actual = entry.get("actual_size_bytes")
        _require(isinstance(actual, int) and 0 <= actual < EXPECTED_SIZE, "partial Southern size is invalid")
    elif status == "validated":
        _require(entry.get("file_path") == FINAL_PATH, "validated Southern entry has an unexpected file path")
        _require(entry.get("actual_size_bytes") == EXPECTED_SIZE, "validated Southern size is incorrect")
        _require(entry.get("calculated_md5") == EXPECTED_MD5, "validated Southern MD5 is incorrect")
        sha = entry.get("calculated_sha256")
        _require(isinstance(sha, str) and HEX64.fullmatch(sha) is not None, "validated Southern SHA-256 is invalid")
        _require(sha != SHA256_PLACEHOLDER, "validated Southern SHA-256 is still a placeholder")
        _require(entry.get("pbf_validation") == "passed", "validated Southern PBF state is not passed")
    else:
        raise ManifestUpdateError("Southern entry must be partial or already validated")


def _validate_evidence(evidence: Any) -> dict[str, Any]:
    _require(isinstance(evidence, dict), "validation evidence must be a JSON object")
    _require(evidence.get("region") == TARGET_REGION, "evidence region is not Southern Zone")
    _require(evidence.get("source_url") == SOURCE_URL, "evidence source URL is not the approved official URL")
    _require(evidence.get("status") == "validated", "evidence status must be validated")
    _require(evidence.get("file_path") == FINAL_PATH, "evidence must name the final Southern PBF path")
    _require(evidence.get("expected_size_bytes") == EXPECTED_SIZE, "evidence expected size is incorrect")
    _require(evidence.get("actual_size_bytes") == EXPECTED_SIZE, "evidence actual size is not complete")

    published_md5 = evidence.get("published_md5")
    calculated_md5 = evidence.get("calculated_md5")
    calculated_sha256 = evidence.get("calculated_sha256")
    _require(isinstance(published_md5, str) and HEX32.fullmatch(published_md5) is not None, "evidence published MD5 is malformed")
    _require(isinstance(calculated_md5, str) and HEX32.fullmatch(calculated_md5) is not None, "evidence calculated MD5 is malformed")
    _require(isinstance(calculated_sha256, str) and HEX64.fullmatch(calculated_sha256) is not None, "evidence SHA-256 is malformed")
    _require(calculated_sha256 != SHA256_PLACEHOLDER, "evidence SHA-256 is still a placeholder")
    _require(published_md5.lower() == EXPECTED_MD5, "evidence published MD5 does not match official metadata")
    _require(calculated_md5.lower() == published_md5.lower(), "calculated MD5 does not match published MD5")
    _require(evidence.get("pbf_validation") == "passed", "evidence PBF readability validation did not pass")

    flags = evidence.get("independent_validation")
    _require(isinstance(flags, dict), "independent_validation flags are required")
    for flag in REQUIRED_VALIDATION_FLAGS:
        _require(flags.get(flag) is True, f"independent validation flag is not true: {flag}")
    return evidence


def _updated_manifest(manifest: dict[str, Any], target: dict[str, Any], evidence: dict[str, Any]) -> dict[str, Any]:
    updated = copy.deepcopy(manifest)
    updated_target = next(entry for entry in updated["entries"] if entry["region"] == TARGET_REGION)
    updated_target.update(
        {
            "file_path": FINAL_PATH,
            "actual_size_bytes": EXPECTED_SIZE,
            "calculated_md5": evidence["calculated_md5"].lower(),
            "calculated_sha256": evidence["calculated_sha256"].lower(),
            "status": "validated",
            "pbf_validation": "passed",
            "warnings": [],
        }
    )
    if "retrieval_timestamp" in evidence:
        _require(isinstance(evidence["retrieval_timestamp"], str) and evidence["retrieval_timestamp"], "evidence retrieval timestamp is invalid")
        updated_target["retrieval_timestamp"] = evidence["retrieval_timestamp"]
    return updated


def _atomic_write_json(path: Path, value: dict[str, Any]) -> None:
    path = path.resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path: Path | None = None
    try:
        serialized = json.dumps(value, indent=2, ensure_ascii=False) + "\n"
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=path.parent, prefix=f".{path.name}.", suffix=".tmp", delete=False
        ) as handle:
            temp_path = Path(handle.name)
            handle.write(serialized)
            handle.flush()
            os.fsync(handle.fileno())
        with temp_path.open("r", encoding="utf-8") as handle:
            round_tripped = json.load(handle)
        _require(isinstance(round_tripped, dict), "serialized manifest is not a JSON object")
        os.replace(temp_path, path)
        temp_path = None
        try:
            directory_fd = os.open(path.parent, os.O_RDONLY)
        except OSError:
            directory_fd = None
        if directory_fd is not None:
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
    finally:
        if temp_path is not None:
            try:
                temp_path.unlink()
            except FileNotFoundError:
                pass


def update_manifest(manifest_path: Path, evidence_path: Path) -> dict[str, Any]:
    manifest, target = _validate_manifest_shape(_read_json(manifest_path, "manifest"))
    evidence = _validate_evidence(_read_json(evidence_path, "validation evidence"))
    _validate_current_target(target)
    updated = _updated_manifest(manifest, target, evidence)

    # Idempotent reruns are allowed only when the existing validated values agree.
    if target.get("status") == "validated":
        for key in ("file_path", "actual_size_bytes", "calculated_md5", "calculated_sha256", "pbf_validation"):
            _require(target.get(key) == updated["entries"][manifest["entries"].index(target)].get(key), f"existing validated field conflicts: {key}")

    _atomic_write_json(manifest_path, updated)
    return updated


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        update_manifest(args.manifest, args.evidence)
    except ManifestUpdateError as exc:
        parser.error(str(exc))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

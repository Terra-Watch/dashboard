"""Read-only verifier for Fire Evidence Assessor research inputs.

This checks provenance and schemas before any feature extraction. It never
downloads data, writes artifacts, or changes cloud state.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sys
import zipfile
from collections import defaultdict
from pathlib import Path


REQUIRED_MANIFEST_COLUMNS = {
    "path", "flames", "smoke", "partition", "partition_xsrc", "cluster", "source",
}
REQUIRED_CONFIG = {
    "backbone": "ViT-B-16-quickgelu",
    "lora_rank": 8,
}


def assessor_manifest_hash(rows: list[dict[str, str]], partition_column: str = "partition") -> str:
    """Match fire_assessor.splits.manifest_hash without importing its package."""
    normalized = [{**row, "partition": row.get(partition_column, "")} for row in rows]
    ordered = sorted(normalized, key=lambda row: json.dumps(row, sort_keys=True))
    blob = json.dumps(ordered, sort_keys=True).encode()
    return hashlib.sha256(blob).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def source_hash(path: Path) -> str:
    digest = hashlib.sha256()
    for file_path in sorted(path.glob("*.py")):
        digest.update(file_path.read_bytes())
    return "srchash:" + digest.hexdigest()[:16]


def verify_checkpoint(path: Path) -> list[str]:
    errors: list[str] = []
    if not path.is_file():
        return [f"checkpoint missing: {path}"]
    try:
        with zipfile.ZipFile(path) as archive:
            names = archive.namelist()
            if not any(name.endswith("data.pkl") for name in names):
                errors.append("checkpoint ZIP has no data.pkl")
    except zipfile.BadZipFile:
        errors.append("checkpoint is not a valid PyTorch ZIP archive")
    return errors


def verify_manifest(path: Path, expected_hash: str | None) -> tuple[list[dict[str, str]], list[str], str | None]:
    errors: list[str] = []
    with path.open(newline="") as handle:
        rows = list(csv.DictReader(handle))
    if not rows:
        return rows, ["manifest is empty"], None
    missing = REQUIRED_MANIFEST_COLUMNS - set(rows[0])
    if missing:
        errors.append(f"manifest missing columns: {sorted(missing)}")
    paths = [row.get("path", "") for row in rows]
    if len(paths) != len(set(paths)):
        errors.append("manifest contains duplicate sample paths")
    for partition_column in ("partition", "partition_xsrc"):
        seen: dict[str, set[str]] = defaultdict(set)
        for row in rows:
            seen[row.get("cluster", "")].add(row.get(partition_column, ""))
        leaking = [cluster for cluster, parts in seen.items() if len(parts - {""}) > 1]
        if leaking:
            errors.append(f"{partition_column} has cluster leakage: {len(leaking)} clusters")
    candidates = {column: assessor_manifest_hash(rows, column) for column in ("partition", "partition_xsrc")}
    matched_column = next((column for column, digest in candidates.items() if digest == expected_hash), None)
    if expected_hash and matched_column is None:
        errors.append(f"manifest hash mismatch: config={expected_hash} candidates={candidates}")
    return rows, errors, matched_column


def verify_npz(path: Path) -> list[str]:
    errors: list[str] = []
    try:
        import numpy as np
    except ImportError:
        return ["NumPy unavailable; NPZ validation was not run"]
    try:
        with np.load(path, allow_pickle=False) as data:
            required = {"logits", "emb", "block", "y", "groups", "source"}
            missing = required - set(data.files)
            if missing:
                errors.append(f"NPZ missing arrays: {sorted(missing)}")
            if not missing:
                n = data["logits"].shape[0]
                expected = {
                    "logits": (n, 2), "emb": (n, 512), "block": (n, 768),
                    "y": (n, 2), "groups": (n,), "source": (n,),
                }
                for name, shape in expected.items():
                    if tuple(data[name].shape) != shape:
                        errors.append(f"{name} shape {data[name].shape} != {shape}")
                for name in ("logits", "emb", "block", "y"):
                    if not np.isfinite(data[name]).all():
                        errors.append(f"{name} contains non-finite values")
                if "paths" in data.files:
                    paths = data["paths"]
                    if tuple(paths.shape) != (n,):
                        errors.append(f"paths shape {paths.shape} != {(n,)}")
                    elif len(set(str(value) for value in paths)) != n:
                        errors.append("paths contains duplicate sample paths")
                if "partition" in data.files and data["partition"].ndim != 0:
                    errors.append("partition provenance must be a scalar")
                for name in ("manifest_hash", "source_revision"):
                    if name in data.files and data[name].ndim != 0:
                        errors.append(f"{name} provenance must be a scalar")
    except Exception as exc:
        errors.append(f"NPZ could not be read: {type(exc).__name__}: {exc}")
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--calibration", type=Path)
    parser.add_argument("--source-dir", type=Path)
    parser.add_argument("--expected-checkpoint-sha256")
    args = parser.parse_args(argv)

    errors: list[str] = []
    config = json.loads(args.config.read_text())
    for key, expected in REQUIRED_CONFIG.items():
        if config.get(key) != expected:
            errors.append(f"config {key}={config.get(key)!r} != {expected!r}")
    if not config.get("manifest_hash"):
        errors.append("config has no manifest_hash")
    current_source_hash = None
    if args.source_dir:
        current_source_hash = source_hash(args.source_dir)
        if config.get("git_commit", "").startswith("srchash:") and config["git_commit"] != current_source_hash:
            errors.append(f"source hash mismatch: config={config['git_commit']} current={current_source_hash}")
    errors.extend(verify_checkpoint(args.checkpoint))
    if args.expected_checkpoint_sha256:
        actual_sha = sha256_file(args.checkpoint)
        if actual_sha != args.expected_checkpoint_sha256:
            errors.append(f"checkpoint SHA-256 mismatch: expected={args.expected_checkpoint_sha256} actual={actual_sha}")
    rows, manifest_errors, matched_partition_column = verify_manifest(args.manifest, config.get("manifest_hash"))
    errors.extend(manifest_errors)
    if args.calibration:
        errors.extend(verify_npz(args.calibration))

    print(json.dumps({
        "checkpoint": str(args.checkpoint),
        "checkpoint_sha256": sha256_file(args.checkpoint) if args.checkpoint.is_file() else None,
        "config_source_hash": config.get("git_commit"),
        "current_source_hash": current_source_hash,
        "config_manifest_hash": config.get("manifest_hash"),
        "manifest_rows": len(rows),
        "manifest_hash_match": matched_partition_column,
        "manifest_hash_candidates": {
            column: assessor_manifest_hash(rows, column)
            for column in ("partition", "partition_xsrc")
        } if rows else {},
        "errors": errors,
        "status": "BLOCKED" if errors else "STRUCTURALLY_VALIDATED",
    }, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())

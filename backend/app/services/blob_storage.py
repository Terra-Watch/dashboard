"""Private Vercel Blob storage with an explicit local-development fallback.

Production sets BLOB_STORAGE_ENABLED=true. Local development can leave it false and
continue using the existing filesystem helpers. Blob credentials are resolved by the
Vercel SDK from BLOB_STORE_ID/VERCEL_OIDC_TOKEN or BLOB_READ_WRITE_TOKEN.
"""
from __future__ import annotations

import hashlib
import hmac
import os
from pathlib import Path


def enabled() -> bool:
    return os.getenv('BLOB_STORAGE_ENABLED', '').strip().lower() in {'1', 'true', 'yes', 'on'}


def configured() -> bool:
    return bool(os.getenv('BLOB_READ_WRITE_TOKEN') or (os.getenv('BLOB_STORE_ID') and os.getenv('VERCEL_OIDC_TOKEN')))


def _blob_module():
    if not configured():
        raise RuntimeError('Vercel Blob credentials are not configured')
    from vercel import blob
    return blob


async def put(pathname: str, data: bytes, content_type: str) -> bool:
    """Store bytes privately. Return whether this request created the object."""
    blob = _blob_module()
    try:
        await blob.head_blob(pathname)
        return False
    except blob.BlobNotFoundError:
        await blob.put_blob(pathname, data, access='private', content_type=content_type, allow_overwrite=False)
        return True


async def get(pathname: str, expected_sha256: str) -> bytes | None:
    """Read and hash-check a private object."""
    blob = _blob_module()
    try:
        result = await blob.get_blob(pathname, access='private')
    except blob.BlobNotFoundError:
        return None
    data = result.body
    return data if hmac.compare_digest(hashlib.sha256(data).hexdigest(), expected_sha256) else None


async def delete(pathname: str) -> None:
    if not configured():
        return
    blob = _blob_module()
    await blob.delete_blob(pathname)


async def write_or_local(pathname: str, local_path: Path, data: bytes, content_type: str) -> bool:
    if enabled():
        return await put(pathname, data, content_type)
    if local_path.is_file():
        return False
    local_path.parent.mkdir(parents=True, exist_ok=True)
    local_path.write_bytes(data)
    return True


async def read_or_local(pathname: str, local_path: Path, expected_sha256: str) -> bytes | None:
    if enabled():
        return await get(pathname, expected_sha256)
    return local_read(local_path, expected_sha256)


async def delete_or_local(pathname: str, local_path: Path) -> None:
    if enabled():
        await delete(pathname)
        return
    try:
        if local_path.is_file():
            local_path.unlink()
    except OSError:
        pass


def local_read(path: Path, expected_sha256: str) -> bytes | None:
    if not path.is_file():
        return None
    data = path.read_bytes()
    return data if hmac.compare_digest(hashlib.sha256(data).hexdigest(), expected_sha256) else None

"""Load, score with and verify a risk-model bundle (plan section 3). The same code runs in the daily job and in the golden test.

Bundle folder: manifest.json, models/seed_<k>.json (XGBoost), scaler.npz (mean, sd, names), cells.parquet,
parity_cases.npz (raw 41-channel inputs and expected scores), SHA256SUMS.
"""
import hashlib, json, os
import numpy as np


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""): h.update(block)
    return h.hexdigest()


def verify_files(root):
    """Every file listed in SHA256SUMS must exist and match. Raises on the first problem."""
    for line in open(f"{root}/SHA256SUMS").read().splitlines():
        digest, name = line.split("  ", 1)
        if sha256(f"{root}/{name}") != digest: raise ValueError(f"checksum mismatch: {name}")


def verify_signature(root, trusted_public_key=None):
    """SIGNATURE.json holds an Ed25519 signature over SHA256SUMS. With `trusted_public_key` (base64) the signature must come from that key;
    without it the embedded key only proves the files were not changed after signing (integrity, not approval)."""
    import base64
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
    sig = json.load(open(f"{root}/SIGNATURE.json"))
    if sig["algorithm"] != "Ed25519": raise ValueError("unsupported signature algorithm")
    if trusted_public_key and sig["public_key"] != trusted_public_key: raise ValueError("bundle is signed by a key that is not the trusted one")
    Ed25519PublicKey.from_public_bytes(base64.b64decode(sig["public_key"])).verify(base64.b64decode(sig["signature"]), open(f"{root}/SHA256SUMS", "rb").read())
    return sig["key_id"]


class Bundle:
    def __init__(self, root, trusted_public_key=None):
        import xgboost as xgb
        verify_files(root)
        if trusted_public_key or os.path.exists(f"{root}/SIGNATURE.json"): self.signed_by = verify_signature(root, trusted_public_key)
        else: self.signed_by = None
        self.root, self.manifest = root, json.load(open(f"{root}/manifest.json"))
        sc = np.load(f"{root}/scaler.npz", allow_pickle=False)
        self.mean, self.sd, self.names = sc["mean"].astype(np.float64), sc["sd"].astype(np.float64), [str(n) for n in sc["names"]]
        if self.names != self.manifest["channel_names"]: raise ValueError("scaler channel order differs from the manifest")
        self.boosters = []
        for m in self.manifest["models"]:
            b = xgb.Booster(); b.load_model(f"{root}/{m['file']}"); self.boosters.append((b, int(m["trees"])))

    def score(self, raw):
        """raw: (N, 41) unscaled channels in manifest order -> (N,) mean score over the seeds. NaN/inf become 0 after scaling, as in training."""
        import xgboost as xgb
        x = (np.asarray(raw, dtype=np.float64) - self.mean) / self.sd
        x[~np.isfinite(x)] = 0
        d = xgb.DMatrix(x.astype(np.float32))
        return np.mean([b.predict(d, iteration_range=(0, n)) for b, n in self.boosters], axis=0)

    def golden(self, tol=1e-6):
        """Reproduce the stored expected scores of the parity cases; returns the largest absolute difference."""
        z = np.load(f"{self.root}/parity_cases.npz", allow_pickle=False)
        diff = float(np.abs(self.score(z["raw"]) - z["expected"]).max())
        if diff > tol: raise ValueError(f"golden test failed: max difference {diff:.2e} > {tol}")
        return diff

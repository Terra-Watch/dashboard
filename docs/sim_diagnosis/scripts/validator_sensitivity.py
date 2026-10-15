"""How sensitive is backend/inference/validate_mcd64a1.py to the simulated footprint?
Re-uses its own functions (imported, not modified) and repeats the lines 103-111 of validate() with injected predicted grids. Read-only.
Run with backend/.venv/bin/python -B (pyhdf is needed)."""
import json, sys, glob
from pathlib import Path
import numpy as np
W = Path("/Users/kireeti/Desktop/Projects/RESQ/website")
sys.path.insert(0, str(W / "backend/inference"))
import validate_mcd64a1 as V
f = Path(sorted(glob.glob(str(W / "backend/runtime_data/mcd64a1/2024-03/MCD64A1.*.hdf")))[0])
origin = (21.867894, 86.500688)
obs_all = V._mcd_indices(f)
def score(pred):
    pidx = V._predicted_mcd_indices(f, pred, origin, 30.0)
    obs = set(obs_all)
    mr = min((i[0] for i in pidx), default=0); mc = min((i[1] for i in pidx), default=0)
    obs = obs & {i for i in obs if i in pidx or abs(i[0] - mr) <= 2 and abs(i[1] - mc) <= 2}      # validate_mcd64a1.py:105
    inter = len(pidx & obs); union = len(pidx | obs)
    return dict(sim_cells=int(pred.sum()), mcd_pixels_flagged=len(pidx), observed_after_filter=len(obs), intersection=inter, iou=round(inter / union, 4) if union else 0.0)
real = np.array([[int(v) for v in l.split(",")] for l in (W / "backend/runtime_data/simulation_demo/run/Grids/Grids1/ForestGrid48.csv").read_text().splitlines() if l]) == 1
one = np.zeros((40, 40), bool); one[20, 20] = True
allc = np.ones((40, 40), bool)
corner = np.zeros((40, 40), bool); corner[:8, :8] = True
cross = np.zeros((40, 40), bool); cross[20, :] = True; cross[:, 20] = True
res = {"real_final_frame_h48": score(real), "ignition_cell_only": score(one), "whole_domain_burned": score(allc), "8x8_block_in_NW_corner": score(corner), "cross_shape": score(cross)}
res["observed_pixels_total_in_file_tile"] = len(obs_all)
(Path(__file__).resolve().parents[1] / "validator_sensitivity.json").write_text(json.dumps(res, indent=1))
print(json.dumps(res, indent=1))

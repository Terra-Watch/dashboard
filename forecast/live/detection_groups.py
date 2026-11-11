"""Sort live satellite detections into groups an operator can act on, without hiding any of them.

Groups (each detection gets exactly one, and the reasons that put it there):
  known_source   an industrial, mining or power feature within 1 km, or a pixel that keeps firing outside the fire season (3 or more such days in the past year)
  outside_forest the detection is not inside the forest cells the forecast covers, or its footprint is under half forest (farm and stubble burning, mostly)
  unconfirmed    inside forest, not a known source, and the classifier gives it p_scar under UNCONFIRMED_BELOW: isolated or weak. It is shown, outlined, and checked again on the next pass
  likely         inside forest, not a known source, p_scar at or above UNCONFIRMED_BELOW; or an unconfirmed detection that was seen again within 1.5 km on a later pass (reason seen_again)
p_scar is the classifier's chance that a burn scar follows within 1 km in the next days (terrawatch-datasets/scripts/14_train_detection_classifier.py). On the 2019 to 2025 detections with MODIS coverage (2.0 million):
known_source holds 3.6 % of detections and 0.2 % of the scar-confirmed ones; unconfirmed holds about 55 % of the rest with a scar rate of about 5 %; likely holds about 42 % with a scar rate of about 40 %.
A scar is what a satellite later sees, not a person checking: small ground fires can leave none. So nothing is dropped; the group sets the colour, the order and the alerts."""
import numpy as np, pandas as pd

UNCONFIRMED_BELOW = 0.15
PERSISTENT_DAYS = 3
SEEN_AGAIN_KM = 1.5
SEEN_AGAIN_HOURS = 72
GROUPS = ("likely", "unconfirmed", "known_source", "outside_forest")


def classify(d):
    """d: DataFrame with in_forest (bool), bnd333, p_scar, ind_1km (bool), px_prior_offseason_days_365. Returns (group Series, reasons list of lists), in the order of d."""
    n = len(d); inf = d.in_forest.fillna(False).astype(bool).values
    ind = d.get("ind_1km", pd.Series(False, index=d.index)).fillna(False).astype(bool).values
    per = (d.get("px_prior_offseason_days_365", pd.Series(0, index=d.index)).fillna(0).values >= PERSISTENT_DAYS)
    bnd = d.get("bnd333", pd.Series(1.0, index=d.index)).fillna(0).values; p = d.get("p_scar", pd.Series(np.nan, index=d.index)).values
    group, reasons = [], []
    for i in range(n):
        r = []
        if ind[i]: r.append("industrial_near")
        if per[i]: r.append("persistent_source")
        if r: group.append("known_source")
        elif not inf[i] or bnd[i] < 0.5:
            group.append("outside_forest"); r.append("outside_forest")
        elif np.isnan(p[i]): group.append("unconfirmed"); r.append("not_scored")                  # no score (classifier or history missing): shown as unconfirmed, never hidden
        elif p[i] < UNCONFIRMED_BELOW: group.append("unconfirmed"); r.append("isolated_weak")
        else: group.append("likely")
        reasons.append(r)
    return pd.Series(group, index=d.index), reasons


def promote_seen_again(d, group, reasons):
    """An unconfirmed detection with a later detection within SEEN_AGAIN_KM and SEEN_AGAIN_HOURS (any group but outside_forest) becomes likely: a fire that is seen again on the next pass is not a glitch."""
    from scipy.spatial import cKDTree
    t = (pd.to_datetime(d.acq_datetime, utc=True) - pd.Timestamp("2019-01-01", tz="UTC")).dt.total_seconds().values / 3600.0
    x = d.longitude.values * 111.32 * np.cos(np.radians(d.latitude.values)); y = d.latitude.values * 110.57
    tree = cKDTree(np.column_stack([x, y])); group = group.copy(); g = group.values.copy()
    for i, nb in enumerate(tree.query_ball_point(np.column_stack([x, y]), r=SEEN_AGAIN_KM)):
        if g[i] != "unconfirmed": continue
        later = [j for j in nb if j != i and 0 < t[j] - t[i] <= SEEN_AGAIN_HOURS and g[j] in ("likely", "unconfirmed")]
        if later: group.iloc[i] = "likely"; reasons[i] = [r for r in reasons[i] if r != "isolated_weak"] + ["seen_again"]
    return group, reasons

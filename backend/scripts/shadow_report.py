"""Compare Fire Evidence Assessor SHADOW-mode assessments with what people already decided. Read-only.

Usage (from backend/):
    python -m scripts.shadow_report --json-out shadow.json --md-out shadow.md [--since 2026-11-01] [--until 2026-11-15] \
        [--min-shadow-images N] [--min-human-labelled N] [--max-missed-fire-count N] [--max-false-alarm-rate R] \
        [--max-uncertain-share R] [--max-high-priority-share R] [--max-unavailable-rate R] [--max-daily-review-volume N]

What it reads (SELECT only; the connection is put into READ ONLY mode and nothing is ever written or approved):
  * resq_incident_images rows persisted in shadow mode (assessment_status = 'SHADOW'): the stored model assessment (derived_label, review_priority,
    error_code) that no user ever saw;
  * the human decisions already stored beside them: resq_incident_images.human_review_status, the incident's close_reason, and the ranger
    field-verification outcomes of the incident's assignments.
It invents no labels. A person's decision is used only as stored, through the explicit mapping printed in the report:
  human POSITIVE ("fire / credible"): human_review_status in --human-positive-reviews (default VERIFIED_AUTHENTIC), OR a field verification
                                      'confirmed', OR incident close_reason 'resolved'
  human NEGATIVE ("no fire"):         close_reason 'false_alarm', OR a field verification 'not_confirmed' with no 'confirmed'
  anything else (not reviewed, POTENTIALLY_SYNTHETIC, REVIEWED, unable_to_verify, duplicate, other, conflicting evidence) is NOT a label and is
  counted as "no usable human label".

The go/no-go checklist has NO built-in thresholds: every threshold is a command-line argument. A check whose threshold was not given is
reported NOT_EVALUATED and the overall result is INCOMPLETE. Even GO is only a summary for the named human owner; it approves nothing.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from typing import Any, Iterable, Optional

LABELS = ("ACTIVE_FIRE", "SMOKE_ONLY", "NO_VISIBLE_FIRE", "UNCERTAIN", "UNAVAILABLE")
FIRE_LABELS = ("ACTIVE_FIRE", "SMOKE_ONLY")
HUMAN_REVIEWS = ("NOT_REVIEWED", "REVIEWED", "VERIFIED_AUTHENTIC", "POTENTIALLY_SYNTHETIC")
POSITIVE_CLOSE, NEGATIVE_CLOSE = ("resolved",), ("false_alarm",)

QUERY = """
SELECT img.id, img.incident_id, img.assessment, img.assessment_error, img.human_review_status, COALESCE(img.assessed_at, img.created_at) AS at,
       inc.status AS incident_status, inc.close_reason,
       EXISTS (SELECT 1 FROM resq_field_verifications v JOIN resq_incident_assignments a ON a.id = v.assignment_id
               WHERE a.incident_id = img.incident_id AND v.outcome = 'confirmed') AS verification_confirmed,
       EXISTS (SELECT 1 FROM resq_field_verifications v JOIN resq_incident_assignments a ON a.id = v.assignment_id
               WHERE a.incident_id = img.incident_id AND v.outcome = 'not_confirmed') AS verification_not_confirmed
FROM resq_incident_images img JOIN resq_incidents inc ON inc.id = img.incident_id
WHERE img.assessment_status = 'SHADOW' AND COALESCE(img.assessed_at, img.created_at) >= :since AND COALESCE(img.assessed_at, img.created_at) < :until
ORDER BY img.id
"""


def fetch_rows(conn, since: datetime, until: datetime) -> list[dict[str, Any]]:
    """Read-only. `conn` is a SQLAlchemy connection; the transaction is switched to READ ONLY before anything runs."""
    from sqlalchemy import text
    conn.execute(text("SET TRANSACTION READ ONLY"))
    return [dict(r) for r in conn.execute(text(QUERY), {"since": since, "until": until}).mappings().all()]


def _assessment(row: dict[str, Any]) -> dict[str, Any]:
    a = row.get("assessment")
    if isinstance(a, str):
        try:
            a = json.loads(a)
        except ValueError:
            a = None
    return a if isinstance(a, dict) else {}


def model_label(row: dict[str, Any]) -> str:
    a = _assessment(row)
    if a.get("assessment_status") == "COMPLETED" and a.get("derived_label") in LABELS:
        return a["derived_label"]
    return "UNAVAILABLE"


def error_code(row: dict[str, Any]) -> Optional[str]:
    a = _assessment(row)
    code = a.get("error_code") or row.get("assessment_error")
    return code if isinstance(code, str) and code else None


def human_label(row: dict[str, Any], positive_reviews: Iterable[str]) -> tuple[Optional[str], list[str]]:
    """('POSITIVE'|'NEGATIVE'|'CONFLICT'|None, reasons) from decisions that are already stored. None means no usable label."""
    pos, neg = [], []
    if row.get("human_review_status") in set(positive_reviews):
        pos.append(f"image_review:{row['human_review_status']}")
    if row.get("verification_confirmed"):
        pos.append("field_verification:confirmed")
    if row.get("close_reason") in POSITIVE_CLOSE:
        pos.append(f"close_reason:{row['close_reason']}")
    if row.get("close_reason") in NEGATIVE_CLOSE:
        neg.append(f"close_reason:{row['close_reason']}")
    if row.get("verification_not_confirmed") and not row.get("verification_confirmed"):
        neg.append("field_verification:not_confirmed")
    if pos and neg:
        return "CONFLICT", pos + neg
    if pos:
        return "POSITIVE", pos
    if neg:
        return "NEGATIVE", neg
    return None, []


def _ratio(n: int, d: int) -> Optional[float]:
    return round(n / d, 4) if d else None


def _day(value: Any) -> Optional[date]:
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).date() if value.tzinfo else value.date()
    return value if isinstance(value, date) else None


def build_report(rows: list[dict[str, Any]], *, positive_reviews: Iterable[str] = ("VERIFIED_AUTHENTIC",), thresholds: Optional[dict[str, Any]] = None,
                 window: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    """Pure function over already-fetched rows. `thresholds` keys: min_shadow_images, min_human_labelled, max_missed_fire_count, max_false_alarm_rate,
    max_uncertain_share, max_high_priority_share, max_unavailable_rate, max_daily_review_volume (None / missing = not given)."""
    positive_reviews = tuple(positive_reviews)
    thresholds = {k: v for k, v in (thresholds or {}).items() if v is not None}
    total = len(rows)
    labels = [model_label(r) for r in rows]
    completed = [i for i, l in enumerate(labels) if l != "UNAVAILABLE"]
    unavailable = total - len(completed)
    by_code = Counter((error_code(rows[i]) or "UNKNOWN") for i, l in enumerate(labels) if l == "UNAVAILABLE")
    high = sum(1 for i in completed if _assessment(rows[i]).get("review_priority") == "HIGH")
    uncertain = sum(1 for l in labels if l == "UNCERTAIN")
    matrix = {l: {h: 0 for h in HUMAN_REVIEWS} for l in LABELS}
    for r, l in zip(rows, labels):
        h = r.get("human_review_status")
        matrix[l][h if h in HUMAN_REVIEWS else "NOT_REVIEWED"] += 1

    humans = [human_label(r, positive_reviews) for r in rows]
    n_pos = sum(1 for h, _ in humans if h == "POSITIVE")
    n_neg = sum(1 for h, _ in humans if h == "NEGATIVE")
    n_conflict = sum(1 for h, _ in humans if h == "CONFLICT")
    missed = [r["id"] for r, l, (h, _) in zip(rows, labels, humans) if h == "POSITIVE" and l == "NO_VISIBLE_FIRE"]
    false_alarms = [r["id"] for r, l, (h, _) in zip(rows, labels, humans) if h == "NEGATIVE" and l in FIRE_LABELS]
    pos_completed = sum(1 for l, (h, _) in zip(labels, humans) if h == "POSITIVE" and l != "UNAVAILABLE")
    neg_completed = sum(1 for l, (h, _) in zip(labels, humans) if h == "NEGATIVE" and l != "UNAVAILABLE")
    reasons = Counter(x for _, rs in humans for x in rs)

    days = sorted({d for d in (_day(r.get("at")) for r in rows) if d})
    span = ((days[-1] - days[0]) // timedelta(days=1) + 1) if days else 0
    flagged = sum(1 for l in labels if l in FIRE_LABELS)
    per_day = lambda n: round(n / span, 2) if span else None  # noqa: E731
    volume = {"calendar_days_spanned": span, "days_with_images": len(days), "images_per_day": per_day(total),
              "model_flagged_fire_or_smoke_per_day": per_day(flagged), "high_priority_per_day": per_day(high), "uncertain_per_day": per_day(uncertain),
              "note": "Mean over the calendar days from the first to the last shadow image; an estimate, not a forecast."}

    metrics = {
        "shadow_images": total, "completed": len(completed), "unavailable": unavailable,
        "human_labelled": n_pos + n_neg, "human_positive": n_pos, "human_negative": n_neg, "human_conflicting": n_conflict,
        "missed_fire_count": len(missed), "missed_fire_rate_of_positive": _ratio(len(missed), pos_completed),
        "false_alarm_count": len(false_alarms), "false_alarm_rate_of_negative": _ratio(len(false_alarms), neg_completed),
        "uncertain_share": _ratio(uncertain, len(completed)), "high_priority_share": _ratio(high, len(completed)),
        "unavailable_rate": _ratio(unavailable, total), "daily_review_volume": volume["images_per_day"],
    }
    checks = [
        _check("min_shadow_images", "shadow images recorded >=", metrics["shadow_images"], thresholds.get("min_shadow_images"), lambda v, t: v >= t),
        _check("min_human_labelled", "images with a usable human label >=", metrics["human_labelled"], thresholds.get("min_human_labelled"), lambda v, t: v >= t),
        _check("max_missed_fire_count", "missed fires (human positive, model NO_VISIBLE_FIRE) <=", metrics["missed_fire_count"], thresholds.get("max_missed_fire_count"), lambda v, t: v <= t),
        _check("max_false_alarm_rate", "false-alarm rate among human negatives <=", metrics["false_alarm_rate_of_negative"], thresholds.get("max_false_alarm_rate"), lambda v, t: v <= t),
        _check("max_uncertain_share", "UNCERTAIN share of completed <=", metrics["uncertain_share"], thresholds.get("max_uncertain_share"), lambda v, t: v <= t),
        _check("max_high_priority_share", "HIGH-priority share of completed <=", metrics["high_priority_share"], thresholds.get("max_high_priority_share"), lambda v, t: v <= t),
        _check("max_unavailable_rate", "UNAVAILABLE rate <=", metrics["unavailable_rate"], thresholds.get("max_unavailable_rate"), lambda v, t: v <= t),
        _check("max_daily_review_volume", "images per day to review <=", metrics["daily_review_volume"], thresholds.get("max_daily_review_volume"), lambda v, t: v <= t),
    ]
    if any(c["result"] == "FAIL" for c in checks):
        verdict = "NO_GO"
    elif any(c["result"] in ("NOT_EVALUATED", "NO_DATA") for c in checks):
        verdict = "INCOMPLETE"
    else:
        verdict = "GO"
    return {
        "window": window or {}, "unit": "one row per stored incident image recorded in shadow mode",
        "human_label_mapping": {"positive_image_reviews": list(positive_reviews), "positive_close_reasons": list(POSITIVE_CLOSE),
                                "positive_field_verification": "confirmed", "negative_close_reasons": list(NEGATIVE_CLOSE),
                                "negative_field_verification": "not_confirmed (with no confirmed)"},
        "human_label_sources": dict(sorted(reasons.items())),
        "metrics": metrics, "model_labels": {l: labels.count(l) for l in LABELS},
        "unavailable_by_error_code": {c: {"count": n, "rate": _ratio(n, total)} for c, n in sorted(by_code.items())},
        "agreement_matrix": {"rows": "model derived_label (UNAVAILABLE = no label)", "columns": "stored human_review_status", "cells": matrix},
        "missed_fire_image_ids": missed[:200], "false_alarm_image_ids": false_alarms[:200], "daily_review_volume": volume,
        "go_no_go": {"checks": checks, "thresholds_given": thresholds, "verdict": verdict,
                     "note": "Thresholds are supplied by the person running this report. The verdict is a summary for the named owner and approves nothing."},
    }


def _check(name: str, label: str, value: Any, threshold: Any, ok) -> dict[str, Any]:
    if threshold is None:
        return {"check": name, "description": label, "value": value, "threshold": None, "result": "NOT_EVALUATED"}
    if value is None:
        return {"check": name, "description": label, "value": None, "threshold": threshold, "result": "NO_DATA"}
    return {"check": name, "description": label, "value": value, "threshold": threshold, "result": "PASS" if ok(value, threshold) else "FAIL"}


def to_markdown(rep: dict[str, Any]) -> str:
    m, out = rep["metrics"], []
    out += ["# Fire Evidence Assessor: shadow-mode report", "",
            f"Window: {rep['window'].get('since') or 'start'} to {rep['window'].get('until') or 'now'}. Unit: {rep['unit']}.", "",
            "Nothing in this report approves the model. Inference decisions stay with the named owner.", "", "## Counts", "",
            "| Measure | Value |", "|---|---|"]
    for k in ("shadow_images", "completed", "unavailable", "human_labelled", "human_positive", "human_negative", "human_conflicting", "missed_fire_count",
              "missed_fire_rate_of_positive", "false_alarm_count", "false_alarm_rate_of_negative", "uncertain_share", "high_priority_share", "unavailable_rate"):
        out.append(f"| {k} | {'n/a' if m[k] is None else m[k]} |")
    out += ["", "## Agreement matrix (model label vs stored human image review)", "", "| Model \\ Human | " + " | ".join(HUMAN_REVIEWS) + " |", "|---|" + "---|" * len(HUMAN_REVIEWS)]
    for l in LABELS:
        out.append(f"| {l} | " + " | ".join(str(rep["agreement_matrix"]["cells"][l][h]) for h in HUMAN_REVIEWS) + " |")
    mp = rep["human_label_mapping"]
    out += ["", "## How human labels were derived (only stored decisions; nothing invented)", "",
            f"- Positive: image review in {mp['positive_image_reviews']}, field verification `confirmed`, or close reason in {mp['positive_close_reasons']}.",
            f"- Negative: close reason in {mp['negative_close_reasons']}, or field verification `not_confirmed` with no `confirmed`.",
            "- Everything else is not a label. Sources seen: " + (", ".join(f"{k}={v}" for k, v in rep["human_label_sources"].items()) or "none"), "",
            "## Unavailable rate by error code", ""]
    out += [f"- {c}: {v['count']} ({v['rate']})" for c, v in rep["unavailable_by_error_code"].items()] or ["- none"]
    v = rep["daily_review_volume"]
    out += ["", "## Daily review volume (estimate)", "", f"- Calendar days spanned: {v['calendar_days_spanned']} (days with images: {v['days_with_images']})",
            f"- Images per day: {v['images_per_day']}; model-flagged fire/smoke per day: {v['model_flagged_fire_or_smoke_per_day']}; "
            f"HIGH priority per day: {v['high_priority_per_day']}; UNCERTAIN per day: {v['uncertain_per_day']}", "",
            "## Go / no-go checklist (thresholds were supplied on the command line)", "", "| Check | Value | Threshold | Result |", "|---|---|---|---|"]
    for c in rep["go_no_go"]["checks"]:
        out.append(f"| {c['description']} | {'n/a' if c['value'] is None else c['value']} | {'not given' if c['threshold'] is None else c['threshold']} | {c['result']} |")
    out += ["", f"Overall: **{rep['go_no_go']['verdict']}**. {rep['go_no_go']['note']}", ""]
    return "\n".join(out)


def _rate(s: str) -> float:
    v = float(s)
    if not 0.0 <= v <= 1.0:
        raise argparse.ArgumentTypeError("must be between 0 and 1")
    return v


def parse_args(argv: Optional[list[str]] = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Compare shadow-mode assessments with stored human decisions (read-only).")
    p.add_argument("--since", help="ISO date/time, inclusive (UTC); default: from the beginning")
    p.add_argument("--until", help="ISO date/time, exclusive (UTC); default: now")
    p.add_argument("--human-positive-reviews", nargs="+", default=["VERIFIED_AUTHENTIC"], choices=HUMAN_REVIEWS,
                   help="stored human_review_status values to treat as 'fire / credible' (a mapping, not a threshold)")
    p.add_argument("--json-out"), p.add_argument("--md-out")
    p.add_argument("--min-shadow-images", type=int), p.add_argument("--min-human-labelled", type=int)
    p.add_argument("--max-missed-fire-count", type=int), p.add_argument("--max-false-alarm-rate", type=_rate)
    p.add_argument("--max-uncertain-share", type=_rate), p.add_argument("--max-high-priority-share", type=_rate)
    p.add_argument("--max-unavailable-rate", type=_rate), p.add_argument("--max-daily-review-volume", type=float)
    return p.parse_args(argv)


def _when(value: Optional[str], default: datetime) -> datetime:
    if not value:
        return default
    d = datetime.fromisoformat(value)
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def main(argv: Optional[list[str]] = None) -> int:
    a = parse_args(argv)
    since, until = _when(a.since, datetime(1970, 1, 1, tzinfo=timezone.utc)), _when(a.until, datetime.now(timezone.utc))
    from app.database.session import engine
    with engine.connect() as conn:
        rows = fetch_rows(conn, since, until)
        conn.rollback()
    thresholds = {k: getattr(a, k) for k in ("min_shadow_images", "min_human_labelled", "max_missed_fire_count", "max_false_alarm_rate", "max_uncertain_share",
                                             "max_high_priority_share", "max_unavailable_rate", "max_daily_review_volume")}
    rep = build_report(rows, positive_reviews=a.human_positive_reviews, thresholds=thresholds,
                       window={"since": a.since, "until": a.until})
    md = to_markdown(rep)
    if a.json_out:
        with open(a.json_out, "w", encoding="utf-8") as f:
            json.dump(rep, f, indent=2, sort_keys=True, default=str)
    if a.md_out:
        with open(a.md_out, "w", encoding="utf-8") as f:
            f.write(md)
    if not a.md_out:
        print(md)
    return 0


if __name__ == "__main__":
    sys.exit(main())

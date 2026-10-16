/**
 * Validation: compare a predicted polygon with an observed final extent.
 * Outer rings only; areas in km^2 (local planar projection).
 */
import { type GeoPolygon, intersectionAreaKm2, polygonAreaKm2 } from './units.ts';

/** Overlap statistics for one predicted/observed pair. */
export interface ValidationResult {
  /** Intersection over union, 0..1. */
  iou: number;
  predictedAreaKm2: number;
  observedAreaKm2: number;
  /** Observed area not covered by the prediction. */
  underPredictedKm2: number;
  /** Predicted area not in the observed extent. */
  overPredictedKm2: number;
}

/** Aggregate over many runs. */
export interface ValidationSummary {
  n: number;
  /** Null when n = 0. */
  medianIou: number | null;
  /** Share of runs with iou >= 0.5; null when n = 0. */
  shareIouAtLeastHalf: number | null;
}

/** Compare one predicted polygon with the observed final extent. */
export function comparePolygons(predicted: GeoPolygon, observed: GeoPolygon): ValidationResult {
  const p = polygonAreaKm2(predicted);
  const o = polygonAreaKm2(observed);
  const i = Math.min(intersectionAreaKm2(predicted, observed), p, o);
  const union = p + o - i;
  return {
    iou: union > 0 ? i / union : 0,
    predictedAreaKm2: p,
    observedAreaKm2: o,
    underPredictedKm2: o - i,
    overPredictedKm2: p - i,
  };
}

/** Aggregate IoU over many comparisons: count, median, share with IoU >= 0.5. */
export function summariseValidation(results: readonly ValidationResult[]): ValidationSummary {
  const n = results.length;
  if (n === 0) return { n: 0, medianIou: null, shareIouAtLeastHalf: null };
  const s = results.map((r) => r.iou).sort((a, b) => a - b);
  const medianIou = n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
  return { n, medianIou, shareIouAtLeastHalf: s.filter((v) => v >= 0.5).length / n };
}

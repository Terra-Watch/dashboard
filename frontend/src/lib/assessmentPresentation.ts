// How an automated image assessment may be shown to staff. Pure functions (no React) so the rules are unit-tested.
//
// Rules:
//  * UNAVAILABLE, pending, unknown, or a COMPLETED result that does not come from an APPROVED artifact is never shown as a finding.
//    An unavailable assessment is "not assessed", never "no fire".
//  * A model label (e.g. ACTIVE FIRE) is shown only for a COMPLETED result from an APPROVED artifact, and always as advisory.
//  * Scores are never rendered here; human review is a separate field and stays authoritative.

export type AssessmentLike = {
  assessment_status?: string | null;
  authenticity_status?: string | null;
  assessment?: {
    assessment_status?: string | null;
    derived_label?: string | null;
    ood_flag?: boolean;
    error_code?: string | null;
    artifact_status?: string | null;
  } | null;
};

export type AssessmentTone = 'unavailable' | 'pending' | 'advisory';

export type AssessmentPresentation = {
  tone: AssessmentTone;
  headline: string;
  detail: string | null;
  reason: string | null;
  showLabel: boolean;
  authenticityText: string | null;
  advisoryNote: string;
};

export const ADVISORY_NOTE = 'Automated assessment is advisory. A person decides.';

const REASONS: Record<string, string> = {
  MODEL_ARTIFACT_NOT_CONFIGURED: 'The assessment model is not configured.',
  MODEL_INFERENCE_DISABLED: 'Automated assessment is switched off.',
  MODEL_ARTIFACT_NOT_FOUND: 'The assessment model files were not found.',
  MODEL_ARTIFACT_MALFORMED: 'The assessment model package is malformed.',
  MODEL_ARTIFACT_UNSUPPORTED_VERSION: 'The assessment model package format is not supported.',
  MODEL_ARTIFACT_VERSION_MISMATCH: 'The assessment model version is not the expected one.',
  MODEL_ARTIFACT_INTEGRITY_FAILED: 'The assessment model failed an integrity check.',
  MODEL_ARTIFACT_INVALID_OUTPUT_MAPPING: 'The assessment model output mapping is invalid.',
  MODEL_ARTIFACT_INCOMPLETE: 'The assessment model package is incomplete.',
  MODEL_ARTIFACT_NOT_APPROVED: 'The assessment model has not been approved for use.',
  MODEL_ARTIFACT_INCOMPATIBLE: 'The assessment model does not match its declared architecture.',
  MODEL_RUNTIME_UNAVAILABLE: 'The assessment runtime is not available.',
  MODEL_LOAD_FAILED: 'The assessment model could not be loaded.',
  MODEL_TIMEOUT: 'The assessment took too long and was skipped.',
  MODEL_BUSY: 'The assessment service was busy and the check was skipped.',
  MODEL_INFERENCE_FAILED: 'The assessment failed.',
  MODEL_RESULT_INVALID: 'The assessment result was rejected as invalid.',
};

export function describeReason(code?: string | null): string | null {
  if (!code) return null;
  return REASONS[code] ?? `Reason code: ${code}`;
}

const unavailable = (reasonCode: string | null | undefined): AssessmentPresentation => ({
  tone: 'unavailable',
  headline: 'Assessment unavailable',
  detail: 'No automated fire or smoke assessment was produced. This is not a negative result; review the evidence directly.',
  reason: describeReason(reasonCode),
  showLabel: false,
  authenticityText: null,
  advisoryNote: ADVISORY_NOTE,
});

export function presentAssessment(image: AssessmentLike): AssessmentPresentation {
  const status = image.assessment_status ?? null;
  if (status === 'UNAVAILABLE') return unavailable(image.assessment?.error_code);
  if (status === 'PENDING' || status === 'RUNNING' || status === null) {
    return { tone: 'pending', headline: 'Assessment pending', detail: null, reason: null, showLabel: false, authenticityText: null, advisoryNote: ADVISORY_NOTE };
  }
  if (status !== 'COMPLETED') return unavailable(image.assessment?.error_code);
  // COMPLETED is trusted only when the stored result says it came from an approved artifact.
  if (image.assessment?.artifact_status !== 'APPROVED') return unavailable('MODEL_ARTIFACT_NOT_APPROVED');
  const label = image.assessment?.derived_label ?? null;
  let headline = 'Automated assessment complete';
  if (image.assessment?.ood_flag) headline = 'Uncertain · out of distribution';
  else if (label === 'UNCERTAIN') headline = 'Uncertain';
  else if (label) headline = `Automated assessment: ${label.replace(/_/g, ' ').toLowerCase()}`;
  return {
    tone: 'advisory', headline, detail: null, reason: null, showLabel: label !== null,
    authenticityText: image.authenticity_status ? image.authenticity_status.replace(/_/g, ' ').toLowerCase() : null,
    advisoryNote: ADVISORY_NOTE,
  };
}

/** One-line status for lists. Never reassuring for anything that is not an approved, completed assessment. */
export function listStatusText(status?: string | null): string {
  if (!status) return 'None reported';
  if (status === 'COMPLETED') return 'Automated assessment complete (advisory)';
  if (status === 'PENDING' || status === 'RUNNING') return 'Assessment pending';
  return 'Assessment unavailable';
}

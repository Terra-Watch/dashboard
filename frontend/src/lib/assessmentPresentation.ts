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
    raw_logits?: { flames_visible?: number | null; smoke_visible?: number | null } | null;
  } | null;
};

export type AssessmentTone = 'unavailable' | 'pending' | 'advisory' | 'experimental';

export type AssessmentPresentation = {
  tone: AssessmentTone;
  headline: string;
  detail: string | null;
  reason: string | null;
  showLabel: boolean;
  authenticityText: string | null;
  advisoryNote: string;
  /** Raw, uncalibrated development output; present only for tone 'experimental'. Never a finding. */
  experimentalOutput: string | null;
};

export const EXPERIMENTAL_NOTICE = 'EXPERIMENTAL / NOT FOR OPERATIONAL USE';
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
  MODEL_EXPERIMENTAL_NOT_PERMITTED: 'The experimental development path is not permitted in this environment.',
  MODEL_EXPERIMENTAL_CONFLICT: 'The experimental path and production inference were both enabled; neither ran.',
  MODEL_EXPERIMENTAL_NOT_CONFIGURED: 'The experimental development path is not configured.',
  MODEL_EXPERIMENTAL_NOT_FOUND: 'The experimental checkpoint was not found.',
  MODEL_EXPERIMENTAL_PROVENANCE_INVALID: 'The experimental checkpoint has no valid provenance record.',
  MODEL_EXPERIMENTAL_INTEGRITY_FAILED: 'The experimental checkpoint failed its integrity check.',
  MODEL_EXPERIMENTAL_INCOMPATIBLE: 'The experimental checkpoint does not match the model architecture.',
  MODEL_EXPERIMENTAL_LOAD_FAILED: 'The experimental model could not be loaded.',
  MODEL_EXPERIMENTAL_INFERENCE_FAILED: 'The experimental assessment failed.',
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
  experimentalOutput: null,
});

export function presentAssessment(image: AssessmentLike): AssessmentPresentation {
  const status = image.assessment_status ?? null;
  // Decided on the row's own status only: an experimental row is never promoted by an artifact_status or label inside its JSON.
  if (status === 'EXPERIMENTAL') {
    const l = image.assessment?.raw_logits;
    const fmt = (v?: number | null) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : 'n/a');
    return {
      tone: 'experimental', headline: EXPERIMENTAL_NOTICE,
      detail: 'Development-only output from an unapproved research checkpoint. It is not a fire or no-fire finding, is not calibrated, and does not change the incident. A person decides.',
      reason: null, showLabel: false, authenticityText: null, advisoryNote: ADVISORY_NOTE,
      experimentalOutput: l ? `Raw logits (uncalibrated, not probabilities): flames ${fmt(l.flames_visible)}, smoke ${fmt(l.smoke_visible)}` : null,
    };
  }
  if (status === 'UNAVAILABLE') return unavailable(image.assessment?.error_code);
  if (status === 'PENDING' || status === 'RUNNING' || status === null) {
    return { tone: 'pending', headline: 'Assessment pending', detail: null, reason: null, showLabel: false, authenticityText: null, advisoryNote: ADVISORY_NOTE, experimentalOutput: null };
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
    advisoryNote: ADVISORY_NOTE, experimentalOutput: null,
  };
}

/** One-line status for lists. Never reassuring for anything that is not an approved, completed assessment. */
export function listStatusText(status?: string | null): string {
  if (!status) return 'None reported';
  if (status === 'COMPLETED') return 'Automated assessment complete (advisory)';
  if (status === 'EXPERIMENTAL') return 'Experimental output, not for operational use';
  if (status === 'PENDING' || status === 'RUNNING') return 'Assessment pending';
  return 'Assessment unavailable';
}

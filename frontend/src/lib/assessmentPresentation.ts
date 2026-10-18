// How an automated image assessment may be shown to staff. Pure functions (no React) so the rules are unit-tested.
//
// Rules:
//  * Every COMPLETED or EXPERIMENTAL result carries an unmistakable "Human review required" statement. No state reads as
//    verified, confirmed or ready for dispatch.
//  * UNAVAILABLE, pending, unknown, or a COMPLETED result that does not come from an APPROVED artifact is never shown as a finding.
//    An unavailable assessment is "not assessed", never "no fire". Scores and labels are ignored unless artifact_status is APPROVED.
//  * Scores, the derived label and quality/OOD warnings are shown only for COMPLETED + APPROVED, as advisory model estimates.
//  * Media integrity (authenticity-style) wording for incident photos comes only from presentMediaIntegrity: a separate, advisory
//    section that never feeds the tone, headline or colours of the fire/smoke assessment, queue order or any control.
//  * SHADOW rows are recorded for evaluation only: nothing is shown and there is nothing to review.
//  * Decisions are taken from the row's own assessment_status, never from nested JSON alone.
//  * Community (moderation) image assessments are a separate function with no fire or smoke wording at all.
//
// Text goes through an optional translator `t(key, default, vars)` so screens can localise it; the default returns English.

export type Indication = 'NOT_ASSESSED' | 'NONE_FOUND' | 'POSSIBLE';
export type Indications = { synthetic?: string | null; edited?: string | null; reused?: string | null };

export type AssessmentLike = {
  assessment_status?: string | null;
  assessment?: {
    assessment_status?: string | null;
    derived_label?: string | null;
    ood_flag?: boolean | null;
    error_code?: string | null;
    artifact_status?: string | null;
    model_version?: string | null;
    decision?: string | null;
    review_required?: boolean | null;
    review_priority?: string | null;
    scores?: { flames_visible?: number | null; smoke_visible?: number | null } | null;
    quality_flags?: string[] | null;
    media_integrity?: { status?: string | null; note?: string | null; advisory?: boolean | null; affects_incident?: boolean | null } | null;
    limitations?: string[] | null;
    raw_logits?: { flames_visible?: number | null; smoke_visible?: number | null } | null;
  } | null;
};

export type Translate = (key: string, defaultValue: string, vars?: Record<string, string | number>) => string;
const plainT: Translate = (_key, defaultValue, vars) => vars ? defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, name: string) => String(vars[name] ?? '')) : defaultValue;

export type AssessmentTone = 'unavailable' | 'pending' | 'advisory' | 'experimental' | 'review_required' | 'shadow';

export type AuthenticityLine = { key: 'synthetic' | 'edited' | 'reused'; label: string; value: string; state: Indication };

export type AssessmentPresentation = {
  tone: AssessmentTone;
  headline: string;
  detail: string | null;
  reason: string | null;
  showLabel: boolean;
  /** Plain wording for the derived label; null unless COMPLETED + APPROVED. */
  labelText: string | null;
  /** True for every COMPLETED and EXPERIMENTAL result. */
  reviewRequired: boolean;
  reviewRequiredText: string | null;
  /** Percent strings, only for COMPLETED + APPROVED with valid probabilities. */
  scores: { flames: string; smoke: string } | null;
  scoresNote: string | null;
  qualityWarnings: string[];
  oodWarning: string | null;
  limitations: string[];
  advisoryNote: string;
  /** Raw, uncalibrated development output; present only for tone 'experimental'. Never a finding. */
  experimentalOutput: string | null;
};

export const EXPERIMENTAL_NOTICE = 'EXPERIMENTAL / NOT FOR OPERATIONAL USE';
export const ADVISORY_NOTE = 'Automated assessment is advisory. A person decides.';
export const REVIEW_REQUIRED_TEXT = 'Human review required. A person must look at this photo before anyone acts on it. This result decides nothing.';

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

export function describeReason(code?: string | null, t: Translate = plainT): string | null {
  if (!code) return null;
  return REASONS[code] ? t(`assess.reason.${code}`, REASONS[code]) : t('assess.reason.unknown', 'Reason code: {{code}}', { code });
}

const LABEL_TEXT: Record<string, [string, string]> = {
  ACTIVE_FIRE: ['assess.label.ACTIVE_FIRE', 'Possible active fire'],
  SMOKE_ONLY: ['assess.label.SMOKE_ONLY', 'Possible smoke only'],
  NO_VISIBLE_FIRE: ['assess.label.NO_VISIBLE_FIRE', 'No visible fire detected — not proof of absence'],
  UNCERTAIN: ['assess.label.UNCERTAIN', 'Uncertain'],
};
const QUALITY_TEXT: Record<string, string> = {
  LOW_RESOLUTION: 'The photo is small or low resolution.',
  BLURRY: 'The photo is blurry.',
  DARK: 'The photo is very dark.',
  OVEREXPOSED: 'The photo is overexposed.',
  LOW_CONTRAST: 'The photo has low contrast.',
  SMALL_IMAGE: 'The photo is small or low resolution.',
};
const INDICATION_TEXT: Record<Indication, [string, string]> = {
  NOT_ASSESSED: ['assess.ind.NOT_ASSESSED', 'Not assessed'],
  NONE_FOUND: ['assess.ind.NONE_FOUND', 'None found (not proof the photo is genuine)'],
  POSSIBLE: ['assess.ind.POSSIBLE', 'Possible — a person should check'],
};

const indication = (value: string | null | undefined): Indication => (value === 'NONE_FOUND' || value === 'POSSIBLE' ? value : 'NOT_ASSESSED');
const isProbability = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const pct = (v: number) => `${Math.round(v * 100)}%`;
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : []);

function indicationLines(ind: Indications | null | undefined, t: Translate): AuthenticityLine[] {
  const rows: Array<[AuthenticityLine['key'], string, string]> = [
    ['synthetic', 'assess.ind.synthetic', 'AI-generated or synthetic'],
    ['edited', 'assess.ind.edited', 'Edited or manipulated'],
    ['reused', 'assess.ind.reused', 'Reused from elsewhere'],
  ];
  return rows.map(([key, labelKey, labelText]) => {
    const state = indication(ind?.[key]);
    return { key, label: t(labelKey, labelText), value: t(...INDICATION_TEXT[state]), state };
  });
}

function qualityText(flag: string, t: Translate): string {
  const known = QUALITY_TEXT[flag];
  return known ? t(`assess.quality.${flag}`, known) : t('assess.quality.other', 'Photo quality note: {{flag}}', { flag: flag.replace(/_/g, ' ').toLowerCase() });
}

const base = (t: Translate): Omit<AssessmentPresentation, 'tone' | 'headline'> => ({
  detail: null, reason: null, showLabel: false, labelText: null, reviewRequired: false, reviewRequiredText: null, scores: null, scoresNote: null,
  qualityWarnings: [], oodWarning: null, limitations: [],
  advisoryNote: t('assess.advisory', ADVISORY_NOTE), experimentalOutput: null,
});

const unavailable = (reasonCode: string | null | undefined, t: Translate): AssessmentPresentation => ({
  ...base(t), tone: 'unavailable',
  headline: t('assess.unavailable', 'Assessment unavailable'),
  detail: t('assess.unavailable_detail', 'No automated fire or smoke assessment was produced. This is not a negative result; review the evidence directly.'),
  reason: describeReason(reasonCode, t),
});

export function presentAssessment(image: AssessmentLike, t: Translate = plainT): AssessmentPresentation {
  const status = image.assessment_status ?? null;
  const reviewRequiredText = t('assess.review_required', REVIEW_REQUIRED_TEXT);
  // Decided on the row's own status only: an experimental row is never promoted by an artifact_status or label inside its JSON.
  if (status === 'EXPERIMENTAL') {
    const l = image.assessment?.raw_logits;
    const fmt = (v?: number | null) => (typeof v === 'number' && Number.isFinite(v) ? v.toFixed(2) : 'n/a');
    return {
      ...base(t), tone: 'experimental', headline: t('assess.experimental', EXPERIMENTAL_NOTICE),
      detail: t('assess.experimental_detail', 'Development-only output from an unapproved research checkpoint. It is not a fire or no-fire finding, is not calibrated, and does not change the incident. A person decides.'),
      reviewRequired: true, reviewRequiredText,
      experimentalOutput: l ? t('assess.experimental_logits', 'Raw logits (uncalibrated, not probabilities): flames {{flames}}, smoke {{smoke}}', { flames: fmt(l.flames_visible), smoke: fmt(l.smoke_visible) }) : null,
    };
  }
  if (status === 'SHADOW') {
    return {
      ...base(t), tone: 'shadow', headline: t('assess.shadow', 'Shadow mode'),
      detail: t('assess.shadow_detail', 'An automated assessment is being recorded for evaluation only. It is not shown here and is not used for any decision.'),
    };
  }
  if (status === 'UNAVAILABLE') return unavailable(image.assessment?.error_code, t);
  if (status === 'PENDING' || status === 'RUNNING' || status === null) {
    return { ...base(t), tone: 'pending', headline: t('assess.pending', 'Assessment pending') };
  }
  if (status !== 'COMPLETED') return unavailable(image.assessment?.error_code, t);
  // COMPLETED is trusted only when the stored result says it came from an approved artifact; otherwise scores and labels are ignored.
  if (image.assessment?.artifact_status !== 'APPROVED') {
    return { ...unavailable('MODEL_ARTIFACT_NOT_APPROVED', t), reviewRequired: true, reviewRequiredText };
  }
  const a = image.assessment;
  const ood = a.ood_flag === true;
  const label = a.derived_label && LABEL_TEXT[a.derived_label] ? a.derived_label : null;
  const labelText = ood ? t(...LABEL_TEXT.UNCERTAIN) : label ? t(...LABEL_TEXT[label]) : null;
  const flames = a.scores?.flames_visible; const smoke = a.scores?.smoke_visible;
  const scores = isProbability(flames) && isProbability(smoke) ? { flames: pct(flames), smoke: pct(smoke) } : null;
  return {
    ...base(t),
    tone: a.decision === 'REQUIRES_REVIEW' || a.review_required === true ? 'review_required' : 'advisory',
    headline: labelText ? t('assess.headline', 'Automated assessment: {{label}}', { label: labelText }) : t('assess.complete', 'Automated assessment complete (advisory)'),
    showLabel: labelText !== null, labelText,
    reviewRequired: true, reviewRequiredText,
    scores,
    scoresNote: scores ? t('assess.scores_note', 'Model estimate, advisory. Not a certainty and not a measurement.') : null,
    qualityWarnings: list(a.quality_flags).map(flag => qualityText(flag, t)),
    oodWarning: ood ? t('assess.ood', 'This photo is outside what the model was tested on, so treat the result with extra caution.') : null,
    limitations: list(a.limitations),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Media integrity for incident photos (staff only). Advisory, separate from the fire/smoke assessment, never affects anything.

export type MediaIntegrityPresentation = {
  state: 'NO_CONCERN_DETECTED' | 'POSSIBLE_SYNTHETIC' | 'POSSIBLE_EDITED' | 'POSSIBLE_REUSED' | 'INCONCLUSIVE' | 'NOT_ASSESSED' | 'UNAVAILABLE';
  title: string;
  label: string;
  caveat: string | null;
  advisoryLine: string;
};
export const MEDIA_INTEGRITY_ADVISORY = 'Advisory only. This does not verify or reject the report and does not change its priority, status or visibility. A person decides.';
const MEDIA_INTEGRITY: Record<string, string> = {
  NO_CONCERN_DETECTED: 'No concern detected',
  POSSIBLE_SYNTHETIC: 'Possible AI-generated or synthetic image',
  POSSIBLE_EDITED: 'Possible edited image',
  POSSIBLE_REUSED: 'Possible reused image',
  INCONCLUSIVE: 'Inconclusive',
  NOT_ASSESSED: 'Not assessed',
  UNAVAILABLE: 'Assessment unavailable (not a clean result)',
};

export function presentMediaIntegrity(image: AssessmentLike, t: Translate = plainT): MediaIntegrityPresentation {
  const rowStatus = image.assessment_status ?? null;
  const stored = image.assessment?.media_integrity?.status ?? null;
  // The row's own status decides: UNAVAILABLE rows are unavailable; only COMPLETED rows may carry a stored result; all else is Not assessed.
  const state: MediaIntegrityPresentation['state'] = rowStatus === 'UNAVAILABLE' ? 'UNAVAILABLE'
    : rowStatus === 'COMPLETED' && stored && Object.prototype.hasOwnProperty.call(MEDIA_INTEGRITY, stored) ? (stored as MediaIntegrityPresentation['state'])
    : 'NOT_ASSESSED';
  return {
    state,
    title: t('assess.mi.title', 'Media integrity (advisory)'),
    label: t(`assess.mi.${state}`, MEDIA_INTEGRITY[state]),
    caveat: state === 'NO_CONCERN_DETECTED' ? t('assess.mi.caveat', 'Not proof the photo is genuine.') : null,
    advisoryLine: t('assess.mi.advisory', MEDIA_INTEGRITY_ADVISORY),
  };
}

/** Plain-text list suffix, only for the three POSSIBLE_* states. No emphasis, no ordering effect. */
export function mediaCheckSuffix(status?: string | null, t: Translate = plainT): string | null {
  return status === 'POSSIBLE_SYNTHETIC' || status === 'POSSIBLE_EDITED' || status === 'POSSIBLE_REUSED'
    ? `${t('assess.mi.list', 'Media check')}: ${t(`assess.mi.${status}`, MEDIA_INTEGRITY[status])}` : null;
}

/** One-line status for lists. Never reassuring for anything that is not an approved, completed assessment. */
export function listStatusText(status?: string | null): string {
  if (!status) return 'None reported';
  if (status === 'COMPLETED') return 'Automated assessment complete (advisory) · human review required';
  if (status === 'EXPERIMENTAL') return 'Experimental output, not for operational use';
  if (status === 'SHADOW') return 'Shadow mode: not shown';
  if (status === 'PENDING' || status === 'RUNNING') return 'Assessment pending';
  return 'Assessment unavailable';
}

// ---------------------------------------------------------------------------------------------------------------------
// Community images (moderators only). Never any fire, smoke or flame wording; always advisory.

export type CommunityImageAssessment = {
  status?: string | null;
  indications?: Indications | null;
  quality_flags?: string[] | null;
  moderator_review_recommended?: boolean | null;
  advisory?: boolean | null;
  model_version?: string | null;
  error_code?: string | null;
  limitations?: string[] | null;
};
export type CommunityTone = 'no_concern' | 'concern' | 'inconclusive' | 'unavailable';
export type CommunityPresentation = {
  tone: CommunityTone;
  headline: string;
  detail: string | null;
  reason: string | null;
  indications: AuthenticityLine[];
  qualityWarnings: string[];
  limitations: string[];
  recommendation: string | null;
  advisoryLine: string;
};
export const COMMUNITY_ADVISORY = 'Advisory only. A moderator decides.';
const COMMUNITY: Record<string, [CommunityTone, string, string]> = {
  AUTHENTIC_NO_CONCERN: ['no_concern', 'assess.community.AUTHENTIC_NO_CONCERN', 'No concern found (advisory)'],
  POSSIBLE_SYNTHETIC: ['concern', 'assess.community.POSSIBLE_SYNTHETIC', 'Possible AI-generated or synthetic'],
  POSSIBLE_EDITED: ['concern', 'assess.community.POSSIBLE_EDITED', 'Possible edited or manipulated'],
  REUSED: ['concern', 'assess.community.REUSED', 'Possible reused image'],
  INCONCLUSIVE: ['inconclusive', 'assess.community.INCONCLUSIVE', 'Inconclusive'],
};

export function presentCommunityAssessment(a: CommunityImageAssessment | null | undefined, t: Translate = plainT): CommunityPresentation {
  const advisoryLine = t('assess.community.advisory', COMMUNITY_ADVISORY);
  const known = a?.status ? COMMUNITY[a.status] : undefined;
  if (!a || !known) {
    return {
      tone: 'unavailable', headline: t('assess.community.UNAVAILABLE', 'Assessment unavailable — not a negative result'),
      detail: null, reason: describeReason(a?.error_code, t), indications: [], qualityWarnings: [], limitations: [], recommendation: null, advisoryLine,
    };
  }
  return {
    tone: known[0], headline: t(known[1], known[2]), detail: null, reason: null,
    indications: indicationLines(a.indications, t),
    qualityWarnings: list(a.quality_flags).map(flag => qualityText(flag, t)),
    limitations: list(a.limitations),
    recommendation: a.moderator_review_recommended ? t('assess.community.recommended', 'The check suggests a moderator should look at this image.') : null,
    advisoryLine,
  };
}

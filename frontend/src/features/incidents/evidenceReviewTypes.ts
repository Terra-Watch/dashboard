// Human review of evidence photos. Pure logic (no React) so the rules are unit-tested.
// A review records a person's judgement of the PHOTO only. It never changes the incident's status.
import type { AssessmentLike } from '../../lib/assessmentPresentation';

export type ReviewStatus = 'NOT_REVIEWED' | 'REVIEWED' | 'VERIFIED_AUTHENTIC' | 'POTENTIALLY_SYNTHETIC';

export type EvidenceImage = AssessmentLike & {
  id: number;
  original_filename: string;
  human_review_status: string;
  human_review_note?: string | null;
  human_reviewed_by?: number | null;
  human_reviewed_at?: string | null;
};

export const REVIEW_OPTIONS: ReadonlyArray<{ value: ReviewStatus; label: string; hint: string }> = [
  { value: 'VERIFIED_AUTHENTIC', label: 'Genuine photo', hint: 'Looks like a real photo of the reported place.' },
  { value: 'POTENTIALLY_SYNTHETIC', label: 'May be fake or edited', hint: 'A short reason is required.' },
  { value: 'REVIEWED', label: 'Seen, no conclusion', hint: 'You looked at it but cannot judge.' },
  { value: 'NOT_REVIEWED', label: 'Clear my review', hint: 'Return the photo to not reviewed.' },
];

const LABELS: Record<string, string> = {
  NOT_REVIEWED: 'Not yet reviewed',
  REVIEWED: 'Seen, no conclusion',
  VERIFIED_AUTHENTIC: 'Genuine photo',
  POTENTIALLY_SYNTHETIC: 'May be fake or edited',
};

export const MIN_REASON_LENGTH = 5;
export const MAX_NOTE_LENGTH = 2000; // matches the API limit

export function reviewStatusLabel(status: string | null | undefined): string {
  return (status && LABELS[status]) || 'Not yet reviewed';
}

/** Returns a message explaining what is missing, or null when the review may be saved. */
export function validateReview(status: ReviewStatus | '', note: string): string | null {
  if (!status) return 'Choose how you judge this photo.';
  const text = note.trim();
  if (text.length > MAX_NOTE_LENGTH) return `Keep the note under ${MAX_NOTE_LENGTH} characters.`;
  if (status === 'POTENTIALLY_SYNTHETIC' && text.length < MIN_REASON_LENGTH) return 'Say briefly why this photo may be fake or edited.';
  return null;
}

export function reviewPayload(status: ReviewStatus, note: string): { status: ReviewStatus; note: string | null } {
  const text = note.trim();
  return { status, note: status === 'NOT_REVIEWED' || !text ? null : text };
}

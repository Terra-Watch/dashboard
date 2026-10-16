export type CloseReason = 'resolved' | 'false_alarm' | 'duplicate' | 'unable_to_verify' | 'other';

export const CLOSE_REASONS: Array<{ value: CloseReason; label: string; hint: string }> = [
  { value: 'resolved', label: 'Resolved', hint: 'The fire is out or the situation was handled.' },
  { value: 'false_alarm', label: 'False alarm', hint: 'No fire: smoke from a permitted burn, dust, fog or similar.' },
  { value: 'duplicate', label: 'Duplicate report', hint: 'The same event is already tracked in another incident.' },
  { value: 'unable_to_verify', label: 'Could not be verified', hint: 'Staff could not confirm it and have nothing more to try.' },
  { value: 'other', label: 'Other (explain)', hint: 'Use only if none of the above fit; a note is required.' },
];

export const MIN_CLOSE_NOTE = 5;

export function closeReasonLabel(value: string | null | undefined): string {
  return CLOSE_REASONS.find(item => item.value === value)?.label ?? '';
}

/** Returns a plain-language problem, or '' when the closure can be submitted. */
export function validateClosure(reason: CloseReason | '', note: string): string {
  if (!reason) return 'Choose why this incident is being closed.';
  if (reason === 'other' && note.trim().length < MIN_CLOSE_NOTE) return `Add a short note (at least ${MIN_CLOSE_NOTE} characters) explaining the closure.`;
  return '';
}

export function closurePayload(reason: CloseReason, note: string) {
  const trimmed = note.trim();
  return { status: 'closed', close_reason: reason, ...(trimmed ? { notes: trimmed } : {}) };
}

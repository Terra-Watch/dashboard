import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_NOTE_LENGTH, MIN_REASON_LENGTH, REVIEW_OPTIONS, reviewPayload, reviewStatusLabel, validateReview } from '../src/features/incidents/evidenceReview.ts';

test('every review option maps to a status the API accepts, with a plain label', () => {
  const accepted = new Set(['NOT_REVIEWED', 'REVIEWED', 'VERIFIED_AUTHENTIC', 'POTENTIALLY_SYNTHETIC']);
  assert.equal(REVIEW_OPTIONS.length, 4);
  for (const option of REVIEW_OPTIONS) {
    assert.ok(accepted.has(option.value), option.value);
    assert.equal(reviewStatusLabel(option.value), option.label === 'Clear my review' ? 'Not yet reviewed' : option.label);
    assert.ok(!/[A-Z_]{6,}/.test(option.label), 'labels are words, not status codes');
  }
});

test('unknown or missing statuses read as not yet reviewed, never as a verdict', () => {
  for (const s of [null, undefined, '', 'APPROVED', 'AUTO_DISPATCH']) assert.equal(reviewStatusLabel(s as string), 'Not yet reviewed');
});

test('a choice is required before saving', () => {
  assert.match(validateReview('', '') ?? '', /Choose/);
});

test('marking a photo as possibly fake requires a real reason, other choices do not', () => {
  assert.match(validateReview('POTENTIALLY_SYNTHETIC', '') ?? '', /why/);
  assert.match(validateReview('POTENTIALLY_SYNTHETIC', '   ab  ') ?? '', /why/);
  assert.equal(validateReview('POTENTIALLY_SYNTHETIC', 'x'.repeat(MIN_REASON_LENGTH)), null);
  for (const s of ['VERIFIED_AUTHENTIC', 'REVIEWED', 'NOT_REVIEWED'] as const) assert.equal(validateReview(s, ''), null);
});

test('over-long notes are refused before they reach the API', () => {
  assert.match(validateReview('REVIEWED', 'x'.repeat(MAX_NOTE_LENGTH + 1)) ?? '', /under/);
  assert.equal(validateReview('REVIEWED', 'x'.repeat(MAX_NOTE_LENGTH)), null);
});

test('the payload carries only status and a trimmed note, and clearing a review drops the note', () => {
  assert.deepEqual(reviewPayload('VERIFIED_AUTHENTIC', '  looks right  '), { status: 'VERIFIED_AUTHENTIC', note: 'looks right' });
  assert.deepEqual(reviewPayload('REVIEWED', '   '), { status: 'REVIEWED', note: null });
  assert.deepEqual(reviewPayload('NOT_REVIEWED', 'ignored'), { status: 'NOT_REVIEWED', note: null });
  assert.deepEqual(Object.keys(reviewPayload('REVIEWED', 'x')).sort(), ['note', 'status']);
});

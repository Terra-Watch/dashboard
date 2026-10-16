import assert from 'node:assert/strict';
import test from 'node:test';
import { listStatusText, presentAssessment } from '../src/lib/assessmentPresentation.ts';

const completed = (over: object = {}) => ({
  assessment_status: 'COMPLETED', authenticity_status: 'INCONCLUSIVE',
  assessment: { assessment_status: 'COMPLETED', derived_label: 'ACTIVE_FIRE', ood_flag: false, error_code: null, artifact_status: 'APPROVED', ...over },
});

test('an unavailable assessment is shown as unavailable with its reason, never as a finding', () => {
  const p = presentAssessment({ assessment_status: 'UNAVAILABLE', assessment: { error_code: 'MODEL_ARTIFACT_NOT_APPROVED', derived_label: null } });
  assert.equal(p.tone, 'unavailable');
  assert.equal(p.headline, 'Assessment unavailable');
  assert.equal(p.showLabel, false);
  assert.match(p.detail ?? '', /not a negative result/);
  assert.match(p.reason ?? '', /not been approved/);
  assert.equal(p.authenticityText, null);
});

test('a label smuggled onto an UNAVAILABLE row is still not shown', () => {
  const p = presentAssessment({ assessment_status: 'UNAVAILABLE', authenticity_status: 'NO_CONCERNS_FOUND', assessment: { derived_label: 'NO_VISIBLE_FIRE', error_code: 'MODEL_TIMEOUT' } });
  assert.equal(p.showLabel, false);
  assert.equal(p.authenticityText, null);
  assert.ok(!/no visible fire/i.test(p.headline + (p.detail ?? '')));
});

test('unknown error codes are surfaced verbatim, and unknown statuses are treated as unavailable', () => {
  assert.match(presentAssessment({ assessment_status: 'UNAVAILABLE', assessment: { error_code: 'WEIRD_CODE' } }).reason ?? '', /WEIRD_CODE/);
  assert.equal(presentAssessment({ assessment_status: 'SOMETHING_ELSE' }).tone, 'unavailable');
});

test('pending and missing statuses are pending, not findings', () => {
  for (const s of ['PENDING', 'RUNNING', null, undefined]) {
    const p = presentAssessment({ assessment_status: s });
    assert.equal(p.tone, 'pending');
    assert.equal(p.showLabel, false);
  }
});

test('a completed result from an approved artifact is advisory and shows the label', () => {
  const p = presentAssessment(completed());
  assert.equal(p.tone, 'advisory');
  assert.equal(p.showLabel, true);
  assert.match(p.headline, /active fire/);
  assert.match(p.advisoryNote, /advisory/);
  assert.equal(p.authenticityText, 'inconclusive');
});

test('COMPLETED without an approved artifact is not trusted (research or tampered rows)', () => {
  for (const art of [null, undefined, 'NOT_APPROVED', 'INCOMPLETE']) {
    const p = presentAssessment(completed({ artifact_status: art }));
    assert.equal(p.tone, 'unavailable', String(art));
    assert.equal(p.showLabel, false);
    assert.match(p.reason ?? '', /not been approved/);
  }
  assert.equal(presentAssessment({ assessment_status: 'COMPLETED', assessment: null }).tone, 'unavailable');
});

test('uncertain and out-of-distribution results are labelled uncertain', () => {
  assert.equal(presentAssessment(completed({ derived_label: 'UNCERTAIN' })).headline, 'Uncertain');
  assert.match(presentAssessment(completed({ ood_flag: true })).headline, /out of distribution/);
});

test('list status text is never reassuring for anything but a completed assessment', () => {
  assert.equal(listStatusText('UNAVAILABLE'), 'Assessment unavailable');
  assert.equal(listStatusText('FAILED'), 'Assessment unavailable');
  assert.equal(listStatusText('PENDING'), 'Assessment pending');
  assert.equal(listStatusText(null), 'None reported');
  assert.match(listStatusText('COMPLETED'), /advisory/);
});

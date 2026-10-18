import assert from 'node:assert/strict';
import test from 'node:test';
import { listStatusText, mediaCheckSuffix, presentAssessment, presentMediaIntegrity, presentCommunityAssessment } from '../src/lib/assessmentPresentation.ts';

const completed = (over: object = {}) => ({
  assessment_status: 'COMPLETED',
  assessment: { assessment_status: 'COMPLETED', derived_label: 'ACTIVE_FIRE', ood_flag: false, error_code: null, artifact_status: 'APPROVED', ...over },
});

test('an unavailable assessment is shown as unavailable with its reason, never as a finding', () => {
  const p = presentAssessment({ assessment_status: 'UNAVAILABLE', assessment: { error_code: 'MODEL_ARTIFACT_NOT_APPROVED', derived_label: null } });
  assert.equal(p.tone, 'unavailable');
  assert.equal(p.headline, 'Assessment unavailable');
  assert.equal(p.showLabel, false);
  assert.match(p.detail ?? '', /not a negative result/);
  assert.match(p.reason ?? '', /not been approved/);
});

test('a label smuggled onto an UNAVAILABLE row is still not shown', () => {
  const p = presentAssessment({ assessment_status: 'UNAVAILABLE', assessment: { derived_label: 'NO_VISIBLE_FIRE', error_code: 'MODEL_TIMEOUT' } });
  assert.equal(p.showLabel, false);
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
  assert.equal(p.reviewRequired, true);
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
  assert.equal(presentAssessment(completed({ derived_label: 'UNCERTAIN' })).labelText, 'Uncertain');
  assert.match(presentAssessment(completed({ ood_flag: true })).headline, /Uncertain/);
  assert.match(presentAssessment(completed({ ood_flag: true })).oodWarning ?? '', /outside what the model was tested on/);
});

test('list status text is never reassuring for anything but a completed assessment', () => {
  assert.equal(listStatusText('UNAVAILABLE'), 'Assessment unavailable');
  assert.equal(listStatusText('FAILED'), 'Assessment unavailable');
  assert.equal(listStatusText('PENDING'), 'Assessment pending');
  assert.equal(listStatusText(null), 'None reported');
  assert.match(listStatusText('COMPLETED'), /advisory/);
});

const experimental = (assessment: object = {}) => ({
  assessment_status: 'EXPERIMENTAL',
  assessment: { raw_logits: { flames_visible: 1.8647, smoke_visible: -2.1549 }, artifact_status: 'EXPERIMENTAL_UNAPPROVED', ...assessment },
});

test('an experimental result is labelled NOT FOR OPERATIONAL USE, shows raw logits, and is never a finding', () => {
  const p = presentAssessment(experimental());
  assert.equal(p.tone, 'experimental');
  assert.equal(p.headline, 'EXPERIMENTAL / NOT FOR OPERATIONAL USE');
  assert.equal(p.showLabel, false);
  assert.match(p.experimentalOutput ?? '', /uncalibrated, not probabilities/);
  assert.match(p.experimentalOutput ?? '', /flames 1\.86, smoke -2\.15/);
  assert.match(p.detail ?? '', /not a fire or no-fire finding/);
  assert.match(p.advisoryNote, /advisory/);
});

test('an experimental row is never promoted to approved by its own JSON (forged artifact_status or label)', () => {
  const p = presentAssessment(experimental({ artifact_status: 'APPROVED', derived_label: 'ACTIVE_FIRE', ood_flag: false }));
  assert.equal(p.tone, 'experimental');
  assert.equal(p.showLabel, false);
  assert.ok(!/active fire/i.test(p.headline + (p.detail ?? '') + (p.experimentalOutput ?? '')));
});

test('non-finite or missing experimental logits render n/a, never NaN or a number invented by the UI', () => {
  assert.match(presentAssessment(experimental({ raw_logits: { flames_visible: Number.NaN, smoke_visible: null } })).experimentalOutput ?? '', /flames n\/a, smoke n\/a/);
  assert.equal(presentAssessment(experimental({ raw_logits: null })).experimentalOutput, null);
});

test('only an experimental row ever carries experimental output; list text names it explicitly', () => {
  for (const img of [completed(), { assessment_status: 'UNAVAILABLE', assessment: { raw_logits: { flames_visible: 9, smoke_visible: 9 } } }, { assessment_status: 'PENDING' }]) {
    assert.equal(presentAssessment(img).experimentalOutput, null);
  }
  assert.match(listStatusText('EXPERIMENTAL'), /not for operational use/);
  assert.ok(!/complete/i.test(listStatusText('EXPERIMENTAL')));
});

test('experimental error codes have plain-language reasons', () => {
  const r = presentAssessment({ assessment_status: 'UNAVAILABLE', assessment: { error_code: 'MODEL_EXPERIMENTAL_INTEGRITY_FAILED' } }).reason ?? '';
  assert.match(r, /integrity/);
});

// ---- productionised assessment: review-required state, scores, authenticity, community ----

const full = (over: object = {}, row: object = {}) => ({
  assessment_status: 'COMPLETED',
  assessment: {
    assessment_status: 'COMPLETED', artifact_status: 'APPROVED', model_version: 'v1', error_code: null,
    scores: { flames_visible: 0.874, smoke_visible: 0.31 }, derived_label: 'ACTIVE_FIRE', decision: 'REQUIRES_REVIEW', review_required: true,
    review_priority: 'HIGH', quality_flags: ['BLURRY'], ood_flag: false,
    authenticity: { status: 'POSSIBLE_SYNTHETIC', signals: [] }, media_integrity: { status: 'POSSIBLE_EDITED', note: 'x', advisory: true, affects_incident: false },
    indications: { synthetic: 'POSSIBLE', edited: 'POSSIBLE', reused: 'POSSIBLE' }, limitations: ['Only the visible frame was checked.'],
    ...over,
  },
  ...row,
});
const FORBIDDEN = /verified|confirmed|dispatch|authentic\b|genuine/i;
const allText = (p: ReturnType<typeof presentAssessment>) => JSON.stringify(p);

test('an approved completed result is review-required, with percentages, wording and quality', () => {
  const p = presentAssessment(full());
  assert.equal(p.tone, 'review_required');
  assert.equal(p.reviewRequired, true);
  assert.match(p.reviewRequiredText ?? '', /^Human review required/);
  assert.deepEqual(p.scores, { flames: '87%', smoke: '31%' });
  assert.match(p.scoresNote ?? '', /Model estimate, advisory/);
  assert.equal(p.labelText, 'Possible active fire');
  assert.deepEqual(p.qualityWarnings, ['The photo is blurry.']);
  assert.equal(p.oodWarning, null);
  assert.deepEqual(p.limitations, ['Only the visible frame was checked.']);
  assert.ok(!FORBIDDEN.test(allText(p).replace(/not proof the photo is genuine|not proof the photo is genuine\)/g, '')), allText(p));
});

test('derived label wording', () => {
  const text = (label: string) => presentAssessment(full({ derived_label: label })).labelText;
  assert.equal(text('ACTIVE_FIRE'), 'Possible active fire');
  assert.equal(text('SMOKE_ONLY'), 'Possible smoke only');
  assert.equal(text('NO_VISIBLE_FIRE'), 'No visible fire detected — not proof of absence');
  assert.equal(text('UNCERTAIN'), 'Uncertain');
  assert.equal(presentAssessment(full({ derived_label: 'NONSENSE' })).labelText, null);
});

test('an out-of-distribution result is uncertain and warns, even with a fire label', () => {
  const p = presentAssessment(full({ ood_flag: true }));
  assert.equal(p.labelText, 'Uncertain');
  assert.match(p.oodWarning ?? '', /outside what the model was tested on/);
});

test('scores and labels are ignored unless the row is COMPLETED and the artifact is APPROVED', () => {
  for (const art of [null, undefined, 'NOT_APPROVED', 'EXPERIMENTAL_UNAPPROVED']) {
    const p = presentAssessment(full({ artifact_status: art }));
    assert.equal(p.tone, 'unavailable');
    assert.equal(p.scores, null);
    assert.equal(p.labelText, null);
    assert.equal(p.showLabel, false);
      assert.equal(p.reviewRequired, true);
    assert.match(p.reviewRequiredText ?? '', /Human review required/);
  }
  for (const status of ['UNAVAILABLE', 'PENDING', 'EXPERIMENTAL']) {
    const p = presentAssessment(full({}, { assessment_status: status }));
    assert.equal(p.scores, null, status);
    assert.equal(p.labelText, null, status);
  }
});

test('invalid probabilities are not rendered', () => {
  for (const scores of [{ flames_visible: 1.4, smoke_visible: 0.2 }, { flames_visible: Number.NaN, smoke_visible: 0.2 }, { flames_visible: 0.2 }, null]) {
    assert.equal(presentAssessment(full({ scores })).scores, null);
  }
});

test('unavailable says why and that it is not a negative result; pending and unavailable carry no review claim of a finding', () => {
  const p = presentAssessment({ assessment_status: 'UNAVAILABLE', assessment: { error_code: 'MODEL_TIMEOUT' } });
  assert.match(p.detail ?? '', /not a negative result/);
  assert.match(p.reason ?? '', /took too long/);
  assert.equal(presentAssessment({ assessment_status: 'PENDING' }).reviewRequiredText, null);
});

test('experimental carries the review-required statement and never shows scores or labels', () => {
  const p = presentAssessment({ assessment_status: 'EXPERIMENTAL', assessment: { ...full().assessment, raw_logits: { flames_visible: 1, smoke_visible: 2 } } });
  assert.equal(p.tone, 'experimental');
  assert.equal(p.headline, 'EXPERIMENTAL / NOT FOR OPERATIONAL USE');
  assert.match(p.reviewRequiredText ?? '', /Human review required/);
  assert.equal(p.scores, null);
  assert.equal(p.labelText, null);
});

const FORBIDDEN_AUTH = /authentic|genuine|synthetic|ai-generated|edited|manipulated|reused|tamper/i;
const visibleText = (p: ReturnType<typeof presentAssessment>) => [p.headline, p.detail, p.reason, p.reviewRequiredText, p.scoresNote, p.advisoryNote, p.labelText, p.oodWarning, ...p.qualityWarnings, ...p.limitations].filter(Boolean).join(' ');

const mi = (status: string | undefined, row: object = {}) => ({ assessment_status: 'COMPLETED', assessment: { artifact_status: 'APPROVED', media_integrity: status === undefined ? undefined : { status, note: 'n', advisory: true, affects_incident: false } }, ...row });
const MI_FORBIDDEN = /\b(fake|forged|authentic\w*|genuine|verified|confirmed|dispatch)\b/i;

test('media integrity: all seven display states use the exact cautious labels', () => {
  const expected: Record<string, string> = {
    NO_CONCERN_DETECTED: 'No concern detected', POSSIBLE_SYNTHETIC: 'Possible AI-generated or synthetic image', POSSIBLE_EDITED: 'Possible edited image',
    POSSIBLE_REUSED: 'Possible reused image', INCONCLUSIVE: 'Inconclusive', NOT_ASSESSED: 'Not assessed', UNAVAILABLE: 'Assessment unavailable (not a clean result)',
  };
  for (const [status, label] of Object.entries(expected)) {
    const row = status === 'UNAVAILABLE' ? mi(status, { assessment_status: 'UNAVAILABLE' }) : mi(status);
    const p = presentMediaIntegrity(row);
    assert.equal(p.state, status); assert.equal(p.label, label); assert.equal(p.title, 'Media integrity (advisory)');
    assert.equal(p.advisoryLine, 'Advisory only. This does not verify or reject the report and does not change its priority, status or visibility. A person decides.');
    assert.equal(p.caveat, status === 'NO_CONCERN_DETECTED' ? 'Not proof the photo is genuine.' : null);
    assert.ok(!MI_FORBIDDEN.test([p.label, p.title, p.advisoryLine.replace('does not verify or reject', '')].join(' ')), status);
  }
});

test('media integrity: absent, unknown or non-completed rows read as Not assessed, never clean; unavailable rows are not clean', () => {
  for (const row of [mi(undefined), mi('WHATEVER'), mi('NO_CONCERN_DETECTED', { assessment_status: 'PENDING' }), mi('NO_CONCERN_DETECTED', { assessment_status: 'EXPERIMENTAL' }), mi('NO_CONCERN_DETECTED', { assessment_status: 'SHADOW' }), { assessment_status: 'COMPLETED', assessment: null }, {}]) {
    const p = presentMediaIntegrity(row);
    assert.equal(p.label, 'Not assessed'); assert.equal(p.caveat, null);
  }
  const u = presentMediaIntegrity(mi('NO_CONCERN_DETECTED', { assessment_status: 'UNAVAILABLE' }));
  assert.match(u.label, /Assessment unavailable/); assert.match(u.label, /not a clean result/);
});

test('media integrity never changes the fire/smoke presentation', () => {
  const strip = (p: ReturnType<typeof presentAssessment>) => JSON.stringify(p);
  const base = strip(presentAssessment(full({ media_integrity: undefined })));
  for (const status of ['NO_CONCERN_DETECTED', 'POSSIBLE_SYNTHETIC', 'POSSIBLE_EDITED', 'POSSIBLE_REUSED', 'INCONCLUSIVE', 'NOT_ASSESSED', 'UNAVAILABLE']) {
    assert.equal(strip(presentAssessment(full({ media_integrity: { status } }))), base, status);
  }
  const p = presentAssessment(full());
  assert.ok(!MI_FORBIDDEN.test(visibleText(p)) && !FORBIDDEN_AUTH.test(visibleText(p)), visibleText(p));
  assert.equal(p.tone, 'review_required');
  assert.equal(p.labelText, 'Possible active fire');
});

test('media check list suffix exists only for the three POSSIBLE states and the queue order text is unchanged', () => {
  assert.equal(mediaCheckSuffix('POSSIBLE_EDITED'), 'Media check: Possible edited image');
  assert.equal(mediaCheckSuffix('POSSIBLE_SYNTHETIC'), 'Media check: Possible AI-generated or synthetic image');
  assert.equal(mediaCheckSuffix('POSSIBLE_REUSED'), 'Media check: Possible reused image');
  for (const s of ['NO_CONCERN_DETECTED', 'INCONCLUSIVE', 'NOT_ASSESSED', 'UNAVAILABLE', null, undefined, 'X']) assert.equal(mediaCheckSuffix(s), null);
  assert.equal(listStatusText('COMPLETED'), 'Automated assessment complete (advisory) · human review required');
});

test('SHADOW media integrity is Not assessed', () => {
  assert.equal(presentMediaIntegrity(mi('POSSIBLE_SYNTHETIC', { assessment_status: 'SHADOW' })).label, 'Not assessed');
});

test('SHADOW shows only the shadow notice: no scores, label, quality, OOD or review-required statement', () => {
  const p = presentAssessment({ assessment_status: 'SHADOW', assessment: { assessment_status: 'SHADOW', model_version: 'v2', review_required: false, scores: null, derived_label: null, limitations: ['Shadow only.'] } });
  assert.equal(p.tone, 'shadow');
  assert.equal(p.headline, 'Shadow mode');
  assert.equal(p.detail, 'An automated assessment is being recorded for evaluation only. It is not shown here and is not used for any decision.');
  assert.equal(p.scores, null); assert.equal(p.labelText, null); assert.equal(p.showLabel, false);
  assert.deepEqual(p.qualityWarnings, []); assert.equal(p.oodWarning, null);
  assert.equal(p.reviewRequired, false); assert.equal(p.reviewRequiredText, null);
  // forged contents on a SHADOW row are ignored
  const q = presentAssessment(full({}, { assessment_status: 'SHADOW' }));
  assert.equal(q.tone, 'shadow'); assert.equal(q.scores, null); assert.equal(q.labelText, null); assert.deepEqual(q.qualityWarnings, []); assert.equal(q.reviewRequiredText, null);
  assert.equal(listStatusText('SHADOW'), 'Shadow mode: not shown');
});

test('no state reads as verified, confirmed or dispatch-ready', () => {
  const rows = [full(), { assessment_status: 'SHADOW' }, full({ derived_label: 'NO_VISIBLE_FIRE' }), full({ ood_flag: true }), full({ artifact_status: null }), { assessment_status: 'EXPERIMENTAL', assessment: { raw_logits: { flames_visible: 3, smoke_visible: 3 } } }, { assessment_status: 'UNAVAILABLE', assessment: null }, { assessment_status: 'PENDING' }];
  for (const row of rows) {
    const p = presentAssessment(row);
    const text = [p.headline, p.detail, p.reason, p.reviewRequiredText, p.scoresNote, p.advisoryNote, p.labelText, p.oodWarning].filter(Boolean).join(' ');
    assert.ok(!/verified|confirmed|dispatch/i.test(text), text);
  }
});

test('the translator is used for every string and interpolates', () => {
  const seen: string[] = [];
  const p = presentAssessment(full(), (key, def, vars) => { seen.push(key); return `[${key}]${vars ? JSON.stringify(vars) : ''}${def ? '' : ''}`; });
  assert.ok(seen.includes('assess.review_required'));
  assert.match(p.headline, /^\[assess\.headline\]/);
});

const community = (status: string, over: object = {}) => ({ status, indications: { synthetic: 'NOT_ASSESSED', edited: 'NOT_ASSESSED', reused: 'NOT_ASSESSED' }, quality_flags: [], moderator_review_recommended: false, advisory: true, error_code: null, limitations: [], ...over });

test('community statuses have the agreed wording and always the advisory line', () => {
  const expected: Record<string, string> = {
    AUTHENTIC_NO_CONCERN: 'No concern found (advisory)', POSSIBLE_SYNTHETIC: 'Possible AI-generated or synthetic', POSSIBLE_EDITED: 'Possible edited or manipulated',
    REUSED: 'Possible reused image', INCONCLUSIVE: 'Inconclusive',
  };
  for (const [status, text] of Object.entries(expected)) {
    const p = presentCommunityAssessment(community(status));
    assert.equal(p.headline, text);
    assert.equal(p.advisoryLine, 'Advisory only. A moderator decides.');
  }
  const u = presentCommunityAssessment(community('UNAVAILABLE', { error_code: 'MODEL_TIMEOUT' }));
  assert.equal(u.headline, 'Assessment unavailable — not a negative result');
  assert.equal(u.tone, 'unavailable');
  assert.match(u.reason ?? '', /took too long/);
  assert.equal(u.advisoryLine, 'Advisory only. A moderator decides.');
});

test('a missing or unknown community assessment is unavailable, never reassuring', () => {
  for (const a of [null, undefined, community('SOMETHING_NEW')]) {
    const p = presentCommunityAssessment(a);
    assert.equal(p.tone, 'unavailable');
    assert.match(p.headline, /not a negative result/);
  }
});

test('community presentation never uses fire, smoke or flame wording, even if fire fields are smuggled in', () => {
  const smuggled = { ...community('POSSIBLE_EDITED', { quality_flags: ['BLURRY'], moderator_review_recommended: true }), derived_label: 'ACTIVE_FIRE', scores: { flames_visible: 0.9, smoke_visible: 0.9 } };
  for (const a of [smuggled, community('AUTHENTIC_NO_CONCERN'), community('UNAVAILABLE'), community('INCONCLUSIVE'), null]) {
    const text = JSON.stringify(presentCommunityAssessment(a as never));
    assert.ok(!/fire|smoke|flame/i.test(text), text);
  }
  const p = presentCommunityAssessment(smuggled as never);
  assert.match(p.recommendation ?? '', /moderator should look/);
  assert.equal(p.tone, 'concern');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { RUNGS, ageText, rungOfStatus } from '../src/ui/ladder.ts';
import { resources } from '../src/ui/i18n/locales.ts';

test('stored statuses map to rungs; unknown never becomes verified', () => {
  assert.equal(rungOfStatus('reported'), 'report');
  assert.equal(rungOfStatus('verified'), 'verified');
  assert.equal(rungOfStatus('responding'), 'responding');
  assert.equal(rungOfStatus('mystery'), 'report');
  assert.equal(rungOfStatus(null), 'report');
});

test('the unconfirmed rungs are the only ones that use the unconfirmed tone, and every rung has its own icon', () => {
  assert.deepEqual(Object.entries(RUNGS).filter(([, v]) => v.tone === 'unconfirmed').map(([k]) => k).sort(), ['report', 'signal']);
  assert.equal(new Set(Object.values(RUNGS).map(rung => rung.icon)).size, Object.keys(RUNGS).length);   // colour is never the only carrier
});

test('every rung is labelled in every language', () => {
  for (const [code, bundle] of Object.entries(resources)) for (const rung of Object.keys(RUNGS)) assert.ok((bundle.translation.rung as Record<string, string>)[rung], `${code} rung.${rung}`);
});

test('age text', () => {
  const now = Date.parse('2026-10-16T12:00:00Z');
  assert.equal(ageText('2026-10-16T11:59:40Z', now), 'just now');
  assert.equal(ageText('2026-10-16T11:22:00Z', now), '38 min ago');
  assert.equal(ageText('2026-10-16T09:00:00Z', now), '3 h ago');
  assert.equal(ageText('2026-10-10T12:00:00Z', now), '6 days ago');
  assert.equal(ageText('nonsense', now), '');
  assert.equal(ageText(undefined, now), '');
});

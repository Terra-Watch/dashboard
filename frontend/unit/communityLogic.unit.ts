import assert from 'node:assert/strict';
import test from 'node:test';
import { canEdit, nextPollDelay, removalText, validatePost } from '../src/features/community/communityLogic.ts';

const now = Date.parse('2026-10-16T10:00:00Z');
test('post validation', () => { assert.ok(validatePost('   ')); assert.ok(validatePost('x'.repeat(2001))); assert.equal(validatePost('Is the smoke safe?'), ''); });
test('edit window: author only, inside 15 minutes, not removed', () => {
  const post = { author: { id: 4 }, created_at: '2026-10-16T09:50:00Z' };
  assert.equal(canEdit(post, 4, now), true);
  assert.equal(canEdit(post, 5, now), false);
  assert.equal(canEdit({ ...post, created_at: '2026-10-16T09:44:00Z' }, 4, now), false);
  assert.equal(canEdit({ ...post, removed: { by: 'author' } }, 4, now), false);
  assert.equal(canEdit(post, undefined, now), false);
  assert.equal(canEdit({ ...post, created_at: 'nonsense' }, 4, now), false);
});
test('polling is calm: 15 s, backs off, pauses when hidden', () => {
  assert.equal(nextPollDelay(0, false), 15_000);
  assert.equal(nextPollDelay(2, false), 60_000);
  assert.equal(nextPollDelay(9, false), 120_000);
  assert.equal(nextPollDelay(0, true), null);
});
test('removal text never leaks an author-removal reason', () => {
  assert.equal(removalText({ by: 'author', reason: 'private' }), 'Removed by its author.');
  assert.equal(removalText({ by: 'moderator', reason: 'Advertising' }), 'Removed by a moderator: Advertising');
  assert.equal(removalText(undefined), '');
});

import { looksLikeEmergency } from '../src/features/community/communityLogic.ts';
test('emergency wording is noticed in three languages and ordinary talk is not', () => {
  assert.equal(looksLikeEmergency('There is a fire at the ridge, please help'), true);
  assert.equal(looksLikeEmergency('जंगल में आग लगी है'), true);
  assert.equal(looksLikeEmergency('ଜଙ୍ଗଲରେ ନିଆଁ'), true);
  assert.equal(looksLikeEmergency('Where is the nearest water point?'), false);
});

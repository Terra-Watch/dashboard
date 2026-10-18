import assert from 'node:assert/strict';
import test from 'node:test';
import { closurePayload, closeReasonLabel, validateClosure } from '../src/features/incidents/closure.ts';

test('a reason is required', () => assert.match(validateClosure('', ''), /Choose why/));
test('standard reasons need no note', () => assert.equal(validateClosure('resolved', ''), ''));
test('"other" needs a real note', () => { assert.match(validateClosure('other', '  ok '), /at least/); assert.equal(validateClosure('other', 'Burn permit 44'), ''); });
test('payload trims the note and omits it when empty', () => {
  assert.deepEqual(closurePayload('duplicate', '  of #12 '), { status: 'closed', close_reason: 'duplicate', notes: 'of #12' });
  assert.deepEqual(closurePayload('resolved', '   '), { status: 'closed', close_reason: 'resolved' });
});
test('labels', () => { assert.equal(closeReasonLabel('false_alarm'), 'False alarm'); assert.equal(closeReasonLabel(null), ''); });

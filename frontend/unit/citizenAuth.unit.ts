import assert from 'node:assert/strict';
import test from 'node:test';
import { safeCitizenReturnTo } from '../src/redesign/lib/citizenAuth.ts';

test('Citizen return targets are internal and exclude authentication loops', () => {
  assert.equal(safeCitizenReturnTo('/citizen/map'), '/citizen/map');
  assert.equal(safeCitizenReturnTo('%2Fcitizen%2Freports'), '/citizen/reports');
  assert.equal(safeCitizenReturnTo('https://example.com/steal'), '/citizen');
  assert.equal(safeCitizenReturnTo('/staff/login'), '/citizen');
  assert.equal(safeCitizenReturnTo('/citizen/login'), '/citizen');
  assert.equal(safeCitizenReturnTo('/citizen/register'), '/citizen');
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const load = (name: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../src/ui/i18n/${name}.json`, import.meta.url), 'utf8'));
const hi = load('hi'), or = load('or');
const placeholders = (text: string) => (text.match(/\{\{\w+\}\}/g) ?? []).sort().join(',');

test('Hindi and Odia cover the same keys', () => {
  assert.deepEqual(Object.keys(hi).sort(), Object.keys(or).sort());
});

test('no translation is empty and none contains a stray script', () => {
  for (const [name, table] of [['hi', hi], ['or', or]] as const) for (const [key, text] of Object.entries(table)) {
    assert.ok(text.trim().length > 0, `${name} ${key} is empty`);
    assert.doesNotMatch(text, /[ঀ-৿਀-૿]/, `${name} ${key} has a Bengali or Gurmukhi/Gujarati character`);   // an Odia or Devanagari line must not carry letters from a neighbouring script
  }
});

test('Hindi text is Devanagari and Odia text is Odia, apart from numbers, units and names', () => {
  for (const [key, text] of Object.entries(hi)) if (/[A-Za-z]{4,}/.test(text.replace(/\{\{\w+\}\}/g, '').replace(/NASA FIRMS|Copernicus ERA5|OpenStreetMap|Protomaps|Wi-Fi|MB|ERA5|Enter/g, ''))) assert.fail(`hi ${key} still has English words: ${text}`);
  for (const [key, text] of Object.entries(or)) if (/[A-Za-z]{4,}/.test(text.replace(/\{\{\w+\}\}/g, '').replace(/NASA FIRMS|Copernicus ERA5|OpenStreetMap|Protomaps|Wi-Fi|MB|ERA5|Enter/g, ''))) assert.fail(`or ${key} still has English words: ${text}`);
});

test('placeholders are the same in both languages', () => {
  for (const key of Object.keys(hi)) assert.equal(placeholders(hi[key]), placeholders(or[key]), key);
});

// Lists the text keys used in the screens and which languages still lack them. Exit code 1 with --strict when any are missing.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = new URL('../src/', import.meta.url).pathname;
const files = [];
(function walk(dir) { for (const name of readdirSync(dir)) { const p = join(dir, name); statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(name) && files.push(p); } })(root);

const used = new Map();
const call = /\bt\(\s*(['"`])([A-Za-z0-9_.]+)\1\s*(?:,\s*(['"`])([^'"`]*)\3)?/g;
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(call)) if (!used.has(m[2]) || m[4]) used.set(m[2], m[4] ?? used.get(m[2]) ?? '');
}

const mod = await import(pathToFileURL(join(root, 'ui/i18n/locales.ts')).href);
const flat = (obj, prefix = '') => Object.entries(obj).flatMap(([k, v]) => typeof v === 'object' && v ? flat(v, `${prefix}${k}.`) : [[`${prefix}${k}`, v]]);
const extra = lng => { try { return JSON.parse(readFileSync(join(root, `ui/i18n/${lng}.json`), 'utf8')); } catch { return {}; } };
const langs = Object.fromEntries(Object.entries(mod.resources ?? mod.default ?? {}).map(([lng, v]) => [lng, new Set([...flat(v.translation ?? v).map(([k]) => k), ...Object.keys(extra(lng))])]));

let missing = 0;
for (const [lng, keys] of Object.entries(langs)) {
  const lacking = [...used.keys()].filter(k => !keys.has(k) && !keys.has(k + '_one') && !k.includes('${'));
  console.log(`${lng}: ${lacking.length} of ${used.size} used keys missing`);
  missing += lng === 'en' ? 0 : lacking.length;
  if (process.argv.includes('--list') && lng === process.argv[process.argv.indexOf('--list') + 1]) for (const k of lacking) console.log(`  ${k} | ${used.get(k)}`);
}
if (process.argv.includes('--strict') && missing) process.exit(1);

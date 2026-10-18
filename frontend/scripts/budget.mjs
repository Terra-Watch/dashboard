// Size budgets for the built app (gzip). They are guards against regressions, set just above what the build measured when they were written.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const dist = new URL('../dist/', import.meta.url).pathname;
const KB = 1024;
const BUDGETS = [
  { name: 'app core (entry script)', match: /^index-.*\.js$/, max: 175 * KB, pick: 'largest' },
  { name: 'stylesheet', match: /\.css$/, max: 22 * KB, pick: 'largest' },
  { name: 'landing page', match: /^LandingPage-.*\.js$/, max: 55 * KB, pick: 'largest' },
  { name: 'map code', match: /^MapView-.*\.js$/, max: 330 * KB, pick: 'largest' },
  { name: 'any other screen', match: /^(?!index-|MapView-|h3-js|LandingPage-).*\.js$/, max: 40 * KB, pick: 'largest' },
];
const gz = name => gzipSync(readFileSync(join(dist, 'assets', name))).length;
const names = readdirSync(join(dist, 'assets'));
let failed = 0;
for (const budget of BUDGETS) {
  const sizes = names.filter(n => budget.match.test(n)).map(n => [n, gz(n)]).sort((a, b) => b[1] - a[1]);
  if (!sizes.length) { console.log(`?  ${budget.name}: nothing matched`); failed += 1; continue; }
  const [name, size] = sizes[0];
  const ok = size <= budget.max;
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok' : 'OVER'}  ${budget.name}: ${(size / KB).toFixed(1)} KB of ${(budget.max / KB).toFixed(0)} KB (${name})`);
}
process.exit(failed ? 1 : 0);

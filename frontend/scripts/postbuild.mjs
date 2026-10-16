// Runs after `vite build`: stamps the service worker with this build's id and the files to keep ready offline.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const assets = readdirSync(join(dist, 'assets')).filter(name => /\.(js|css|mjs)$/.test(name)).sort();
// The map code is large; it is fetched when a map is first opened, or when an officer saves the map for offline use.
const LATER = /^(MapView|h3-js|maplibre-gl-worker)/;
const precache = assets.filter(name => !LATER.test(name)).map(name => `/assets/${name}`);
const build = createHash('sha256').update(assets.join('|')).digest('hex').slice(0, 10);

const file = join(dist, 'sw.js');
let text = readFileSync(file, 'utf8');
text = text.replace(/\/\*BUILD\*\/.*?\/\*END\*\//, `/*BUILD*/'${build}'/*END*/`).replace(/\/\*PRECACHE\*\/.*?\/\*END\*\//s, `/*PRECACHE*/${JSON.stringify(precache)}/*END*/`);
writeFileSync(file, text);
console.log(`service worker stamped: build ${build}, ${precache.length} files kept ready, ${assets.length - precache.length} loaded on demand`);

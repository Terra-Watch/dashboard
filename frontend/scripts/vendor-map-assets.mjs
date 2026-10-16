// Downloads the map fonts (glyph ranges) and icon sprites once and stores them under public/map, so the map never asks a third party for them.
// Source: github.com/protomaps/basemaps-assets (fonts derived from Noto Sans, SIL OFL 1.1; sprites BSD-3). Run: node scripts/vendor-map-assets.mjs
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'https://protomaps.github.io/basemaps-assets';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'map');
const FONTS = ['Noto Sans Regular', 'Noto Sans Medium', 'Noto Sans Italic'];
// Latin, Latin extended, combining marks, general punctuation, Devanagari (Hindi), Odia
const RANGES = ['0-255', '256-511', '768-1023', '8192-8447', '2304-2559', '2816-3071'];
const SPRITES = ['light', 'dark'];

async function get(url, file) {
  if (existsSync(file)) return;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(await response.arrayBuffer()));
}

for (const font of FONTS) for (const range of RANGES) await get(`${BASE}/fonts/${encodeURIComponent(font)}/${range}.pbf`, join(root, 'glyphs', font, `${range}.pbf`));
for (const name of SPRITES) for (const suffix of ['.json', '.png', '@2x.json', '@2x.png']) await get(`${BASE}/sprites/v4/${name}${suffix}`, join(root, 'sprites', `${name}${suffix}`));
console.log('map assets ready in public/map');

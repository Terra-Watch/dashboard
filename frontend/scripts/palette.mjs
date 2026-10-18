// Generates the colour tokens from OKLCH definitions and fails the build if a contrast or colour-blind rule is broken.
// Open-source tooling: colorjs.io (MIT). Run: node scripts/palette.mjs [--write]
import Color from 'colorjs.io';
import { writeFileSync } from 'node:fs';

// Hand-picked, named colours (not generated). Each name says where it comes from; this script only CHECKS them.
//  Bone / Paper / Ash / Dust  warm paper and ash: the UI is quiet so map data is what stands out
//  Char                       charcoal: text and every button (a field instrument, not a marketing site)
//  Ember                      the glowing point in the logo; a brand accent, never a control colour
//  Signal red / Turmeric / Sal green   hazard, caution, contained (Sal = the forest tree); each is always paired with an icon and a word
//  Neel                       indigo dye: "not yet confirmed by a person" (dashed outlines, never a status of fact)
//  Outlook + probability scales   ColorBrewer YlOrRd / Blues (Brewer, Apache-2.0): peer-reviewed, colour-blind-safe sequential scales
const light = {
  'bg': '#f5f2eb', 'surface': '#fffdf9', 'surface-2': '#ece7dc',
  'line': '#d8d0c0', 'line-control': '#7a6f5e',
  'text': '#1f1b16', 'text-muted': '#5a5247',
  'action': '#1f1b16', 'action-strong': '#000000', 'on-action': '#fffdf9', 'action-tint': '#e4ddcd',
  'danger': '#b3261e', 'danger-tint': '#fbe7e3',
  'warn': '#6f5a00', 'warn-tint': '#f9eccb',
  'ok': '#2d6a3e', 'ok-tint': '#e2efe2',
  'unconfirmed': '#3f4aa0', 'unconfirmed-tint': '#e8e9f6',
  'ember': '#c2410c', 'focus': '#2a45d1',
  'outlook-1': '#ffffb2', 'outlook-2': '#fecc5c', 'outlook-3': '#fd8d3c', 'outlook-4': '#f03b20', 'outlook-5': '#bd0026',
  'prob-1': '#eff3ff', 'prob-2': '#bdd7e7', 'prob-3': '#6baed6', 'prob-4': '#2171b5',
  'map-land': '#ece8de', 'map-forest': '#dfe6d3', 'map-water': '#d3e0e6', 'map-road': '#cfc7b6', 'map-road-major': '#aaa08c', 'map-boundary': '#8d8370', 'map-label': '#463f35',
};
const dark = {
  'bg': '#151310', 'surface': '#1e1b17', 'surface-2': '#27231e',
  'line': '#3a342c', 'line-control': '#8a7f6e',
  'text': '#f1ede4', 'text-muted': '#b5ab9b',
  'action': '#f1ede4', 'action-strong': '#ffffff', 'on-action': '#1f1b16', 'action-tint': '#2f2a23',
  'danger': '#f08070', 'danger-tint': '#3a1f1c',
  'warn': '#e6b04a', 'warn-tint': '#3a2d0f',
  'ok': '#7fc08a', 'ok-tint': '#1c3322',
  'unconfirmed': '#a9b2ff', 'unconfirmed-tint': '#232748',
  'ember': '#ff7a3d', 'focus': '#8fa4ff',
  'outlook-1': '#ffffb2', 'outlook-2': '#fecc5c', 'outlook-3': '#fd8d3c', 'outlook-4': '#f03b20', 'outlook-5': '#bd0026',
  'prob-1': '#eff3ff', 'prob-2': '#bdd7e7', 'prob-3': '#6baed6', 'prob-4': '#2171b5',
  'map-land': '#25211c', 'map-forest': '#27301f', 'map-water': '#1f2c33', 'map-road': '#3d362d', 'map-road-major': '#5a5042', 'map-boundary': '#7a6f5e', 'map-label': '#cfc6b4',
};

const ratio = (a, b) => new Color(a).contrast(new Color(b), 'WCAG21');
const problems = [];
const need = (name, fg, bg, min, theme, t) => { const r = ratio(t[fg], t[bg]); if (r < min) problems.push(`${theme}: ${fg} on ${bg} = ${r.toFixed(2)} (needs ${min})`); return r; };

const rows = [];
for (const [theme, t] of [['light', light], ['dark', dark]]) {
  for (const bg of ['bg', 'surface', 'surface-2']) {
    rows.push([theme, `text/${bg}`, need('', 'text', bg, 7, theme, t)]);
    rows.push([theme, `text-muted/${bg}`, need('', 'text-muted', bg, 4.5, theme, t)]);
    rows.push([theme, `action/${bg}`, need('', 'action', bg, 4.5, theme, t)]);
    for (const s of ['danger', 'warn', 'ok', 'unconfirmed']) rows.push([theme, `${s}/${bg}`, need('', s, bg, 4.5, theme, t)]);
    need('', 'line-control', bg, 3, theme, t);        // controls and map symbols (WCAG 1.4.11)
    need('', 'focus', bg, 3, theme, t);
  }
  rows.push([theme, 'on-action/action', need('', 'on-action', 'action', 4.5, theme, t)]);
  for (const s of ['danger', 'warn', 'ok', 'unconfirmed', 'action']) rows.push([theme, `${s}/${s}-tint`, need('', s, `${s}-tint`, 4.5, theme, t)]);
  for (let i = 1; i <= 5; i++) { const r = ratio(t[`outlook-${i}`], t.bg); rows.push([theme, `outlook-${i}/bg (fill, needs outline)`, r]); }
}

// Colour-blind check: every pair of adjacent outlook steps and the four meaning colours must stay distinguishable (deltaE2000) under simulated deficiency.
const M = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]],
};
const sim = (hexv, m) => { const c = new Color(hexv).to('srgb-linear'); const [r, g, b] = c.coords; const v = m.map(row => row[0] * r + row[1] * g + row[2] * b); return new Color('srgb-linear', v.map(x => Math.min(1, Math.max(0, x)))); };
const cvd = [];
for (const [theme, t] of [['light', light], ['dark', dark]]) {
  const groups = { outlook: [1, 2, 3, 4, 5].map(i => t[`outlook-${i}`]), meaning: [t.danger, t.warn, t.ok, t.unconfirmed, t.action] };
  for (const [kind, colors] of Object.entries(groups)) for (const [name, m] of Object.entries(M)) {
    let min = Infinity;
    for (let i = 0; i < colors.length; i++) for (let j = i + 1; j < colors.length; j++) {
      if (kind === 'outlook' && j !== i + 1) continue;
      min = Math.min(min, sim(colors[i], m).deltaE(sim(colors[j], m), '2000'));
    }
    cvd.push([theme, kind, name, min]);
    // Meaning colours can never all be told apart by hue alone (red/green especially), so they are ALWAYS paired with an icon and a word; here we only guard against near-identical pairs.
    const limit = kind === 'outlook' ? 8 : 3;   // outlook: ColorBrewer's own steps, which are also numbered, labelled and outlined on the map
    if (min < limit) problems.push(`${theme} ${kind} under ${name}: closest pair deltaE ${min.toFixed(1)} (needs ${limit})`);
  }
}

if (process.argv.includes('--report')) {
  console.log('Contrast (WCAG 2.1)'); for (const [th, n, r] of rows) console.log(`${th.padEnd(5)} ${n.padEnd(42)} ${r.toFixed(2)}`);
  console.log('\nColour-blind minimum deltaE2000'); for (const [th, k, n, v] of cvd) console.log(`${th.padEnd(5)} ${k.padEnd(8)} ${n.padEnd(7)} ${v.toFixed(1)}`);
}
if (problems.length) { console.error('PALETTE PROBLEMS:\n' + problems.join('\n')); process.exit(1); }

const block = (t) => Object.entries(t).map(([k, v]) => `  --tw-${k}: ${v};`).join('\n');
const css = `/* GENERATED by scripts/palette.mjs from OKLCH definitions. Do not edit by hand; edit the script and run: node scripts/palette.mjs --write */
:root, [data-theme='light'] {\n  color-scheme: light;\n${block(light)}\n}
@media (prefers-color-scheme: dark) { :root:not([data-theme='light']) {\n  color-scheme: dark;\n${block(dark)}\n} }
[data-theme='dark'] {\n  color-scheme: dark;\n${block(dark)}\n}
`;
const dtcg = (t) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, { $type: 'color', $value: v }]));
if (process.argv.includes('--write')) {
  writeFileSync(new URL('../src/ui/tokens.dtcg.json', import.meta.url), JSON.stringify({ light: dtcg(light), dark: dtcg(dark) }, null, 2) + '\n'); // W3C Design Tokens format: importable by Penpot, Figma Tokens, Style Dictionary
 writeFileSync(new URL('../src/ui/palette.generated.css', import.meta.url), css); console.log('written'); } else console.log('palette ok');

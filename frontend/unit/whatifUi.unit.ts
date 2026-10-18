import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { AREAS } from '../src/features/scenarios/whatif/areas.ts';
import { assetArrivalHours, assetRows, formatHours, reachKm, reachPhrase, reachText } from '../src/features/scenarios/whatif/assets.ts';
import { pushPoint, rasterFireLines, rasterLine } from '../src/features/scenarios/whatif/fireline.ts';
import { MAX_IGNITIONS, canBurn, checkIgnition, nudge, snapIgnition, usableIgnitions } from '../src/features/scenarios/whatif/ignition.ts';
import { cellCentre, cellToLonLat, imageQuad, lonLatToCell, lonLatToXY, packBounds, type Layout } from '../src/features/scenarios/whatif/layout.ts';
import { simulate } from '../src/features/scenarios/whatif/mtt.ts';
import { DISCLAIMER, FORBIDDEN_WORDS, buildNote } from '../src/features/scenarios/whatif/note.ts';
import { OVERLAY_SCALE, createOverlay, onPattern, paintRun } from '../src/features/scenarios/whatif/overlay.ts';
import { PackError, buildGrid, decodeElevation, parseAssets, parseManifest, sha256Hex } from '../src/features/scenarios/whatif/pack.ts';
import { FALLBACK_STOPS, arrivalColor, legendTicks, luminance, mix, parseColor, rampColor } from '../src/features/scenarios/whatif/ramp.ts';
import { runJob } from '../src/features/scenarios/whatif/simJob.ts';
import { wrapWords } from '../src/features/scenarios/whatif/exportImage.ts';
import { FUEL_GRASS, FUEL_WATER } from '../src/features/scenarios/whatif/fuels.ts';
import { CASE_IDS, clampSpeed, compassName, describeWind, headBearing, neighboursFor, normaliseDeg, windInputFor, type WindCase } from '../src/features/scenarios/whatif/wind.ts';
import { SUN_ALTITUDE_DEG, hillshade, terrainPixels, tintGroup } from '../src/features/scenarios/whatif/hillshade.ts';
import { DEFAULT_VIEW, SATELLITE_MAX_ZOOM, VIEW_KEY, readView, satelliteConfig, writeView } from '../src/features/scenarios/whatif/mapView.ts';
import { ageFraction } from '../src/features/scenarios/whatif/ramp.ts';
import type { Grid } from '../src/features/scenarios/whatif/types.ts';

const here = (p: string) => new URL(p, import.meta.url);
const similipalRaw = JSON.parse(readFileSync(here('../public/whatif/similipal/manifest.json'), 'utf8'));

function grid(w: number, h: number, fuel = FUEL_GRASS): Grid {
  const n = w * h;
  return { width: w, height: h, cellSizeM: 30, elevationM: new Float32Array(n), fuel: new Uint8Array(n).fill(fuel), blocked: new Uint8Array(n) };
}
/** A square north-up layout around (0, 0) where one cell is exactly 0.001 degrees. */
const L: Layout = { width: 100, height: 100, cellSizeM: 30, nw: [10, 20.1], ne: [10.1, 20.1], se: [10.1, 20], sw: [10, 20] };

test('areas: similipal is listed, almora and ramnagar by id and name', () => {
  assert.deepEqual(AREAS.map(a => a.id), ['similipal', 'almora', 'ramnagar']);
  assert.ok(AREAS.every(a => a.name.length > 3));
});

test('manifest: the Similipal pack parses; broken manifests are refused with a plain message', () => {
  const m = parseManifest(similipalRaw);
  assert.equal(m.layout.width, 334);
  assert.equal(m.layout.height, 334);
  assert.equal(m.layout.cellSizeM, 30);
  assert.ok(m.sources.map(s => s.attribution).join(' ').includes('OpenStreetMap'));
  assert.ok(m.sources.map(s => s.attribution).join(' ').includes('WorldCover'));
  assert.ok(m.sources.map(s => s.attribution).join(' ').includes('Copernicus'));
  assert.throws(() => parseManifest(null), PackError);
  assert.throws(() => parseManifest({ ...similipalRaw, schema: 'other' }), /not an area pack/);
  assert.throws(() => parseManifest({ ...similipalRaw, grid: { ...similipalRaw.grid, width: 10 } }), /does not match the grid/);
  assert.throws(() => parseManifest({ ...similipalRaw, files: similipalRaw.files.slice(0, 2) }), /lacks/);
  assert.throws(() => parseManifest({ ...similipalRaw, cornersLonLat: { nw: { lon: 1, lat: 99 } } }), PackError);
});

test('all three packs in public/whatif parse and their files have the sizes the manifest states', () => {
  for (const a of AREAS) {
    const dir = `../public/whatif/${a.id}/`;
    let raw: unknown;
    try { raw = JSON.parse(readFileSync(here(`${dir}manifest.json`), 'utf8')); } catch { continue; }   // a pack still being added elsewhere is skipped, the page shows its own message
    const m = parseManifest(raw);
    for (const f of m.files) assert.equal(readFileSync(here(dir + f.name)).length, f.bytes, `${a.id}/${f.name}`);
  }
});

test('pack decoding: elevation is Int16 little-endian from the north row; no-data cells take the mean; sizes are checked', () => {
  const buf = new ArrayBuffer(8);
  const v = new DataView(buf);
  [100, -32768, 300, 200].forEach((x, i) => v.setInt16(i * 2, x, true));
  const e = decodeElevation(buf, 4);
  assert.deepEqual([...e], [100, 200, 300, 200]);
  assert.throws(() => decodeElevation(buf, 5), PackError);
  const real = readFileSync(here('../public/whatif/similipal/elevation.i16'));
  const ab = real.buffer.slice(real.byteOffset, real.byteOffset + real.byteLength);
  const el = decodeElevation(ab as ArrayBuffer, 334 * 334);
  assert.ok(el[0] >= 192 && el[0] <= 968);
  assert.ok(el[167 * 334 + 167] >= 517 && el[167 * 334 + 167] <= 625, 'centre cell is about 590 m');
});

test('pack grid: Similipal fuel ids are engine ids, tree cover dominates; sha256 of the real files matches the manifest', async () => {
  const m = parseManifest(similipalRaw);
  const load = (n: string) => { const b = readFileSync(here(`../public/whatif/similipal/${n}`)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
  const g = buildGrid(m.layout, load('elevation.i16'), load('landcover.u8'));
  assert.equal(g.fuel.length, 334 * 334);
  assert.ok([...g.fuel].filter(f => f === 1).length > 110000);
  for (const f of m.files) assert.equal(await sha256Hex(load(f.name)), f.sha256, f.name);
});

test('layout: corners map to the pack edges; lon/lat and cell round-trip; outside is null', () => {
  assert.deepEqual(cellToLonLat(L, 0, 0), L.nw);
  assert.deepEqual(cellToLonLat(L, 100, 100), L.se);
  assert.deepEqual(lonLatToCell(L, 10.0005, 20.0995), { col: 0, row: 0 });
  assert.deepEqual(lonLatToCell(L, 10.0995, 20.0005), { col: 99, row: 99 });
  assert.equal(lonLatToCell(L, 9.99, 20.05), null);
  assert.equal(lonLatToCell(L, 10.05, 20.2), null);
  assert.equal(lonLatToCell(L, NaN, 20), null);
  const [lon, lat] = cellCentre(L, 40, 70);
  assert.deepEqual(lonLatToCell(L, lon, lat), { col: 40, row: 70 });
  assert.deepEqual(imageQuad(L), [L.nw, L.ne, L.se, L.sw]);
  assert.deepEqual(packBounds(L), [[10, 20], [10.1, 20.1]]);
});

test('layout: the real Similipal corners (slightly rotated UTM square) round-trip every cell centre we try', () => {
  const l = parseManifest(similipalRaw).layout;
  for (const [c, r] of [[0, 0], [333, 0], [0, 333], [333, 333], [167, 167], [10, 200], [321, 5]]) {
    const [lon, lat] = cellCentre(l, c, r);
    assert.deepEqual(lonLatToCell(l, lon, lat), { col: c, row: r });
    const xy = lonLatToXY(l, lon, lat);
    assert.ok(Math.abs(xy.x - (c + 0.5)) < 1e-6 && Math.abs(xy.y - (r + 0.5)) < 1e-6);
  }
});

test('ignition: clicks snap to the cell; unburnable, fire-line, duplicate, outside and too many are refused with a reason', () => {
  const g = grid(100, 100);
  g.fuel[50 * 100 + 50] = FUEL_WATER;
  const fl = new Uint8Array(100 * 100);
  fl[10 * 100 + 10] = 1;
  const [lon, lat] = cellCentre(L, 20, 30);
  const ok = snapIgnition(g, L, lon + 0.0002, lat - 0.0002, [], fl);
  assert.deepEqual(ok, { ok: true, cell: { col: 20, row: 30 } });
  const water = cellCentre(L, 50, 50);
  assert.deepEqual(snapIgnition(g, L, water[0], water[1], []), { ok: false, reason: 'not_burnable' });
  const line = cellCentre(L, 10, 10);
  assert.deepEqual(snapIgnition(g, L, line[0], line[1], [], fl), { ok: false, reason: 'fire_line' });
  assert.deepEqual(snapIgnition(g, L, lon, lat, [{ col: 20, row: 30 }]), { ok: false, reason: 'duplicate' });
  assert.deepEqual(snapIgnition(g, L, 0, 0, []), { ok: false, reason: 'outside' });
  const many = Array.from({ length: MAX_IGNITIONS }, (_, i) => ({ col: i, row: 0 }));
  assert.equal(checkIgnition(g, { col: 5, row: 5 }, many), 'too_many');
  assert.equal(canBurn(g, { col: 50, row: 50 }), false);
  assert.equal(canBurn(g, { col: -1, row: 0 }), false);
});

test('ignition: nudging moves by whole cells and stays inside the grid; unusable ignitions are dropped before a run', () => {
  assert.deepEqual(nudge({ col: 5, row: 5 }, 1, -1, 10, 10), { col: 6, row: 4 });
  assert.deepEqual(nudge({ col: 0, row: 0 }, -5, -5, 10, 10), { col: 0, row: 0 });
  assert.deepEqual(nudge({ col: 9, row: 9 }, 5, 5, 10, 10), { col: 9, row: 9 });
  const g = grid(10, 10);
  const fl = new Uint8Array(100);
  fl[3 * 10 + 3] = 1;
  assert.deepEqual(usableIgnitions(g, [{ col: 3, row: 3 }, { col: 4, row: 4 }], fl), [{ col: 4, row: 4 }]);
});

test('wind helpers: clamps, normalises, names, neighbour rule 32 above 10 km/h else 16, schedules only when the shift is inside the run', () => {
  assert.equal(clampSpeed(-3), 0);
  assert.equal(clampSpeed(99), 60);
  assert.equal(clampSpeed(NaN), 0);
  assert.equal(normaliseDeg(-90), 270);
  assert.equal(normaliseDeg(360), 0);
  assert.equal(normaliseDeg(725), 5);
  assert.equal(compassName(0), 'N');
  assert.equal(compassName(270), 'W');
  assert.equal(compassName(350), 'N');
  assert.equal(compassName(202.5), 'SSW');
  assert.equal(headBearing(270), 90);
  assert.equal(headBearing(10), 190);
  const calm: WindCase = { speedKmh: 10, fromDeg: 270, shift: null };
  assert.equal(neighboursFor(calm), 16);
  assert.equal(neighboursFor({ ...calm, speedKmh: 10.1 }), 32);
  assert.equal(neighboursFor({ ...calm, shift: { afterH: 3, speedKmh: 25, fromDeg: 0 } }, 24), 32);
  assert.equal(neighboursFor({ ...calm, shift: { afterH: 30, speedKmh: 25, fromDeg: 0 } }, 24), 16, 'a shift after the run ends does not count');
  assert.deepEqual(windInputFor(calm, 24), { speedKmh: 10, fromDeg: 270 });
  const sched = windInputFor({ ...calm, shift: { afterH: 3, speedKmh: 20, fromDeg: 90 } }, 24) as { steps: Array<{ atHour: number; wind: { speedKmh: number; fromDeg: number } }> };
  assert.deepEqual(sched.steps.map(s => [s.atHour, s.wind.speedKmh, s.wind.fromDeg]), [[0, 10, 270], [3, 20, 90]]);
  assert.deepEqual(windInputFor({ ...calm, shift: { afterH: 0, speedKmh: 20, fromDeg: 90 } }, 24), { speedKmh: 10, fromDeg: 270 });
  assert.deepEqual(CASE_IDS, ['A', 'B', 'C']);
  assert.equal(describeWind({ speedKmh: 15, fromDeg: 300, shift: null }), '15 km/h from 300 degrees (WNW)');
  assert.match(describeWind({ speedKmh: 15, fromDeg: 300, shift: { afterH: 2.5, speedKmh: 5, fromDeg: 90 } }), /then 5 km\/h from 90 degrees \(E\) after 2.5 h/);
});

test('fire lines: Bresenham lines are 8-connected and include both ends; masks ignore cells outside the grid', () => {
  for (const [a, b] of [[{ col: 0, row: 0 }, { col: 9, row: 3 }], [{ col: 9, row: 9 }, { col: 0, row: 2 }], [{ col: 4, row: 4 }, { col: 4, row: 9 }], [{ col: 2, row: 7 }, { col: 2, row: 7 }]]) {
    const cells = rasterLine(a, b);
    assert.deepEqual(cells[0], a);
    assert.deepEqual(cells[cells.length - 1], b);
    for (let i = 1; i < cells.length; i++) assert.ok(Math.max(Math.abs(cells[i].col - cells[i - 1].col), Math.abs(cells[i].row - cells[i - 1].row)) === 1);
  }
  const mask = rasterFireLines([[{ col: 1, row: 1 }, { col: 4, row: 1 }], [{ col: -3, row: 2 }, { col: 2, row: 2 }]], 6, 6);
  assert.deepEqual([...mask].reduce((n, v) => n + v, 0), 4 + 3, 'cells at columns -3 to -1 are dropped');
  assert.equal(mask[1 * 6 + 4], 1);
  assert.deepEqual(pushPoint([{ col: 1, row: 1 }], { col: 1, row: 1 }), [{ col: 1, row: 1 }]);
  assert.equal(pushPoint([{ col: 1, row: 1 }], { col: 2, row: 1 }).length, 2);
});

test('fire lines: a diagonal 8-connected line from edge to edge is a closed barrier for the engine, and a one-cell gap is not', () => {
  const g = grid(41, 41);
  const run = (mask: Uint8Array) => simulate({ grid: g, ignitions: [{ col: 10, row: 20 }], wind: { speedKmh: 20, fromDeg: 270 }, maxHours: 4, fireLines: mask });
  const open = run(new Uint8Array(41 * 41));
  const lineOnly = rasterFireLines([[{ col: 20, row: 0 }, { col: 28, row: 40 }]], 41, 41);
  const closed = run(lineOnly);
  assert.ok(closed.reachedCells < open.reachedCells);
  const east = (r: ReturnType<typeof run>) => { let n = 0; for (let row = 0; row < 41; row++) for (let col = 30; col < 41; col++) if (Number.isFinite(r.arrivalH[row * 41 + col])) n++; return n; };
  assert.ok(east(open) > 0);
  assert.equal(east(closed), 0, 'nothing is reached east of the line');
  const gap = lineOnly.slice();
  const lineCells = rasterLine({ col: 20, row: 0 }, { col: 28, row: 40 });
  const mid = lineCells[20];
  gap[mid.row * 41 + mid.col] = 0;
  assert.ok(east(run(gap)) > 0, 'a one-cell gap lets fire through');
});

test('runJob: drops ignitions on a fire line, and says so when none is left', () => {
  const g = grid(30, 30);
  const mask = new Uint8Array(900);
  mask[15 * 30 + 15] = 1;
  const wind: WindCase = { speedKmh: 5, fromDeg: 270, shift: null };
  const ok = runJob(g, { ignitions: [{ col: 15, row: 15 }, { col: 5, row: 5 }], wind, maxHours: 2, fireLines: mask });
  assert.ok(ok.ok && ok.skippedIgnitions === 1 && ok.reachedCells > 1);
  const none = runJob(g, { ignitions: [{ col: 15, row: 15 }], wind, maxHours: 2, fireLines: mask });
  assert.ok(!none.ok && none.code === 'no_ignition');
  const same = runJob(g, { ignitions: [{ col: 5, row: 5 }], wind, maxHours: 2, fireLines: new Uint8Array(900) });
  const again = runJob(g, { ignitions: [{ col: 5, row: 5 }], wind, maxHours: 2, fireLines: new Uint8Array(900) });
  assert.ok(same.ok && again.ok && same.arrivalH.every((v, i) => v === again.arrivalH[i]), 'deterministic');
});

test('assets: GeoJSON points and lines land on grid cells; features outside or of another kind are dropped; roads are filled between vertices', () => {
  const [vx, vy] = cellCentre(L, 20, 30);
  const [rx1, ry1] = cellCentre(L, 40, 40);
  const [rx2, ry2] = cellCentre(L, 60, 40);
  const fc = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', id: 'node/1', properties: { kind: 'village', name: 'Dani', place: 'hamlet' }, geometry: { type: 'Point', coordinates: [vx, vy] } },
      { type: 'Feature', id: 'way/2', properties: { kind: 'road', highway: 'track', name: '' }, geometry: { type: 'LineString', coordinates: [[rx1, ry1], [rx2, ry2]] } },
      { type: 'Feature', id: 'way/3', properties: { kind: 'water', waterway: 'stream' }, geometry: { type: 'LineString', coordinates: [[50, 50], [51, 51]] } },
      { type: 'Feature', id: 'x', properties: { kind: 'shop' }, geometry: { type: 'Point', coordinates: [vx, vy] } },
    ],
  };
  const a = parseAssets(fc, L);
  assert.deepEqual(a.map(x => [x.id, x.kind, x.name, x.detail]), [['node/1', 'village', 'Dani', 'hamlet'], ['way/2', 'road', '', 'track']]);
  assert.deepEqual(a[0].cells, [30 * 100 + 20]);
  assert.equal(a[1].cells.length, 21, 'every cell along the straight road, not just its two vertices');
  assert.deepEqual(parseAssets(null, L), []);
  assert.deepEqual(parseAssets({ features: 3 }, L), []);
});

test('assets: arrival is the earliest within two cells; unreached is null; rows sort by time then name; village at the burned edge counts', () => {
  const w = 20, h = 20;
  const arr = new Float32Array(w * h).fill(Infinity);
  arr[10 * w + 10] = 2.2;
  arr[10 * w + 11] = 3;
  const at = (c: number, r: number) => r * w + c;
  assert.equal(assetArrivalHours(arr, w, h, [at(12, 10)]), Math.fround(2.2), 'two cells away still counts');
  assert.equal(assetArrivalHours(arr, w, h, [at(13, 10)]), 3);
  assert.equal(assetArrivalHours(arr, w, h, [at(16, 10)]), null);
  assert.equal(assetArrivalHours(arr, w, h, [at(12, 10)], 2, 2), null, 'later than the run length counts as not reached');
  assert.equal(assetArrivalHours(arr, w, h, [at(0, 0)], 2), null);
  const mk = (id: string, name: string, cells: number[]) => ({ id, kind: 'village' as const, name, detail: '', cells, lonlat: [0, 0] as [number, number], coords: [] });
  const rows = assetRows([mk('c', 'Zeta', [at(16, 10)]), mk('b', 'Beta', [at(12, 10)]), mk('a', 'Alpha', [at(13, 10)]), mk('d', 'Delta', [at(17, 17)])], arr, w, h, 24);
  assert.deepEqual(rows.map(r => [r.asset.name, r.hours]), [['Beta', Math.fround(2.2)], ['Alpha', 3], ['Delta', null], ['Zeta', null]]);
  assert.deepEqual(assetRows([], arr, w, h, 24), []);
});

test('assets: reach extent along the wind axis from the nearest ignition (head downwind, back upwind)', () => {
  const g = grid(81, 81);
  const r = simulate({ grid: g, ignitions: [{ col: 40, row: 40 }], wind: { speedKmh: 12, fromDeg: 270 }, maxHours: 2 });
  const { headKm, backKm } = reachKm(r.arrivalH, 81, 81, 30, [{ col: 40, row: 40 }], 1, headBearing(270));
  assert.ok(headKm > backKm * 2, `head ${headKm} back ${backKm}`);
  assert.ok(headKm > 0.3);
  assert.deepEqual(reachKm(r.arrivalH, 81, 81, 30, [], 1, 90), { headKm: 0, backKm: 0 });
  const north = reachKm(r.arrivalH, 81, 81, 30, [{ col: 40, row: 40 }], 1, 0);
  assert.ok(north.headKm < headKm, 'across the wind is shorter than along it');
});

test('wording: "could reach in about X h" and "not reached in N h", rounded to half hours; no promises', () => {
  assert.equal(reachText(3.4, 24), 'could reach in about 3.5 h');
  assert.equal(reachText(3.2, 24), 'could reach in about 3 h');
  assert.equal(reachText(12.4, 24), 'could reach in about 12 h');
  assert.equal(reachText(null, 24), 'not reached in 24 h');
  assert.deepEqual(reachPhrase(null, 6), { reached: false, hoursText: '6' });
  assert.deepEqual(reachPhrase(0.7, 6), { reached: true, hoursText: '0.5' });
  assert.equal(formatHours(9.76), '10');
  for (const s of [reachText(1, 6), reachText(null, 6)]) assert.doesNotMatch(s, FORBIDDEN_WORDS);
  assert.doesNotMatch(reachText(5, 6), /\bwill\b/i);
});

test('colour ramp: parses token colours, interpolates dark to light, stays monotone in luminance', () => {
  assert.deepEqual(parseColor('rgb(10, 20, 30)'), [10, 20, 30]);
  assert.deepEqual(parseColor(' #fff '), [255, 255, 255]);
  assert.deepEqual(parseColor('#bd0026'), [189, 0, 38]);
  assert.equal(parseColor('currentColor'), null);
  assert.deepEqual(mix([0, 0, 0], [100, 200, 50], 0.5), [50, 100, 25]);
  const stops: Array<[number, number, number]> = [[189, 0, 38], [240, 59, 32], [253, 141, 60], [254, 204, 92], [255, 255, 178]];
  assert.deepEqual(rampColor(stops, 0), stops[0]);
  assert.deepEqual(rampColor(stops, 1), stops[4]);
  assert.deepEqual(rampColor(stops, 0.25), stops[1]);
  assert.deepEqual(rampColor(stops, -4), stops[0]);
  assert.deepEqual(rampColor(stops, NaN), stops[0]);
  let prev = -1;
  for (let i = 0; i <= 20; i++) { const l = luminance(rampColor(stops, i / 20)); assert.ok(l >= prev - 1e-9, 'lighter as time goes on'); prev = l; }
  let fb = -1;
  for (let i = 0; i <= 4; i++) { const l = luminance(FALLBACK_STOPS[i]); assert.ok(l > fb); fb = l; }
  assert.deepEqual(arrivalColor(stops, 12, 24), stops[2]);
  assert.deepEqual(arrivalColor(stops, 5, 0), stops[0]);
  assert.deepEqual(legendTicks(24), [0, 6, 12, 18, 24]);
  assert.deepEqual(legendTicks(6), [0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(legendTicks(48), [0, 12, 24, 36, 48]);
  assert.deepEqual(legendTicks(12), [0, 3, 6, 9, 12]);
});

test('overlay: fills burned cells with the arrival colour, leaves the rest clear, draws outlines on the unburned side and hour lines between hours', () => {
  const w = 6, h = 3, S = OVERLAY_SCALE;
  const arr = new Float32Array(w * h).fill(Infinity);
  arr[1 * w + 1] = 0.5; arr[1 * w + 2] = 1.5; arr[1 * w + 3] = 2.5;
  const buf = createOverlay(w, h);
  assert.equal(buf.length, w * S * h * S * 4);
  paintRun(buf, arr, w, h, 2, 24, { fill: { stops: [[255, 0, 0], [0, 0, 255]], alpha: 0.5 }, hourLines: { rgb: [1, 2, 3], alpha: 1 }, outline: { rgb: [9, 9, 9], style: 'solid', thickness: 1 } });
  const px = (x: number, y: number) => [...buf.slice((y * w * S + x) * 4, (y * w * S + x) * 4 + 4)];
  assert.equal(px(1 * S + 1, 1 * S + 1)[3], 128, 'burned cell is filled at alpha 0.5');
  assert.equal(px(0, 0)[3], 0, 'far cell is clear');
  assert.equal(px(3 * S + 1, 1 * S + 1)[3], 0, 'cell reached at 2.5 h is clear at 2 h');
  assert.deepEqual(px(1 * S + 1, 1 * S + 2).slice(0, 3), arrivalColor([[255, 0, 0], [0, 0, 255]], 0.5, 24), 'the interior of a cell has no line');
  assert.deepEqual(px(1 * S, 1 * S + 1).slice(0, 3), [9, 9, 9], 'outline on the west edge of a burned cell with an unburned neighbour');
  assert.deepEqual(px(1 * S + S - 1, 1 * S + 1).slice(0, 3), [1, 2, 3], 'hour line on the east edge where the next cell burned in a later hour');
  const empty = createOverlay(w, h);
  paintRun(empty, arr, w, h, 0.1, 24, { fill: { stops: [[1, 1, 1], [2, 2, 2]], alpha: 1 } });
  assert.ok(empty.every(v => v === 0), 'nothing burned yet at 0.1 h');
  assert.equal(onPattern('solid', 5), true);
  assert.deepEqual([0, 8, 16, 24].map(a => onPattern('dashed', a)), [true, false, true, false]);
  assert.deepEqual([0, 1, 2, 3, 4].map(a => onPattern('dotted', a)), [true, false, false, false, true]);
});

test('note: carries the notice, wind per case and "could reach" wording only', () => {
  const note = buildNote({
    areaName: 'Almora', ignitions: [{ col: 1, row: 2, lon: 79.66, lat: 29.6 }],
    cases: [{ id: 'A', wind: { speedKmh: 12, fromDeg: 200, shift: null }, burnedKm2: 1.234, headKm: 2.1, backKm: 0.4 }, { id: 'B', wind: { speedKmh: 0, fromDeg: 0, shift: null }, burnedKm2: null, headKm: null, backKm: null }],
    hour: 6, maxHours: 24, fireLineCount: 2,
    assets: [{ caseId: 'A', name: 'Dani', hours: 3.4 }, { caseId: 'A', name: 'Lodhiya', hours: null }],
  });
  assert.ok(note.includes(DISCLAIMER));
  assert.match(note, /Case A: wind 12 km\/h from 200 degrees \(SSW\)/);
  assert.match(note, /Burned area at 6 h: 1.23 km2; head reach 2.1 km; back reach 0.4 km/);
  assert.match(note, /Dani: could reach in about 3.5 h/);
  assert.match(note, /Lodhiya: not reached in 24 h/);
  assert.doesNotMatch(note.replace(DISCLAIMER, ''), FORBIDDEN_WORDS);
});

test('disclaimer: the fixed sentence the brief requires', () => {
  assert.equal(DISCLAIMER, 'What-if scenario for planning and training. Not a forecast. Spread rates are not calibrated for Indian fuels. Spotting, crown fire, fuel-moisture change and suppression are not modelled.');
});

test('export: words wrap to the width', () => {
  const m = (s: string) => s.length * 10;
  assert.deepEqual(wrapWords('aaa bbb ccc ddd', 75, m), ['aaa bbb', 'ccc ddd']);
  assert.deepEqual(wrapWords('', 75, m), []);
  assert.deepEqual(wrapWords('averyveryverylongword x', 20, m), ['averyveryverylongword', 'x']);
});

test('no page text outside the notice uses forecast, prediction or probability wording, and none promises "will"', () => {
  const dir = here('../src/features/scenarios/');
  const files = [...readdirSync(dir).filter(f => /^(WhatIfPage|WindControl)\.tsx$/.test(f)).map(f => new URL(f, dir))];
  assert.equal(files.length, 2);
  const call = /\bt\(\s*'([A-Za-z0-9_.]+)'\s*,\s*('(?:[^'\\]|\\.)*'|`[^`]*`)/g;
  let seen = 0;
  for (const f of files) {
    for (const m of readFileSync(f, 'utf8').matchAll(call)) {
      seen++;
      if (m[1] === 'whatif.disclaimer') continue;
      assert.doesNotMatch(m[2], FORBIDDEN_WORDS, `${m[1]}: ${m[2]}`);
      assert.doesNotMatch(m[2], /\bwill\b/i, `${m[1]}: ${m[2]}`);
    }
  }
  assert.ok(seen > 80, `scanned ${seen} strings`);
});

test('every text key in the what-if page has a Hindi and an Odia entry', () => {
  const dir = here('../src/features/scenarios/');
  const keys = new Set<string>();
  for (const f of ['WhatIfPage.tsx', 'WindControl.tsx']) for (const m of readFileSync(new URL(f, dir), 'utf8').matchAll(/\bt\(\s*'(whatif\.[A-Za-z0-9_.]+|nav\.whatif)'/g)) keys.add(m[1]);
  const load = (n: string): Record<string, string> => JSON.parse(readFileSync(here(`../src/ui/i18n/${n}.json`), 'utf8'));
  const hi = load('hi'), or = load('or');
  for (const k of keys) { assert.ok(hi[k], `hi lacks ${k}`); assert.ok(or[k], `or lacks ${k}`); }
  assert.ok(hi['nav.whatif'] && or['nav.whatif']);
  assert.ok(keys.size > 80);
});

const FLAT = Math.sin((SUN_ALTITUDE_DEG * Math.PI) / 180);

test('hillshade: flat ground is uniform at sin(altitude); a tilted plane is brighter facing the north-west sun and darker facing away', () => {
  const w = 9, h = 9;
  const flat = hillshade(new Float32Array(w * h).fill(500), w, h, 30);
  assert.ok(flat.every(v => Math.abs(v - FLAT) < 1e-6));
  // Height rises toward the EAST: the surface faces WEST (toward the sun at 315 degrees): brighter than flat.
  const up = new Float32Array(w * h).map((_, i) => (i % w) * 30 * 0.5);
  const east = hillshade(up, w, h, 30);
  // Height rises toward the WEST: the surface faces EAST, away from the sun: darker than flat.
  const down = new Float32Array(w * h).map((_, i) => (w - 1 - (i % w)) * 30 * 0.5);
  const west = hillshade(down, w, h, 30);
  const mid = 4 * w + 4;
  assert.ok(east[mid] > FLAT + 0.05, `sun-facing ${east[mid]}`);
  assert.ok(west[mid] < FLAT - 0.05, `away ${west[mid]}`);
  // A plane is uniform everywhere, edges included.
  assert.ok(east.every(v => Math.abs(v - east[mid]) < 1e-5));
  // North-facing slope (height rises toward the south, row index grows) faces north: sun is north-west, so it is lit more than a south-facing one.
  const rises = new Float32Array(w * h).map((_, i) => Math.floor(i / w) * 15);
  const falls = new Float32Array(w * h).map((_, i) => (h - 1 - Math.floor(i / w)) * 15);
  assert.ok(hillshade(rises, w, h, 30)[mid] > hillshade(falls, w, h, 30)[mid]);
});

test('hillshade: output has the grid shape, stays within 0 and 1, and is finite even with missing heights', () => {
  const w = 6, h = 4;
  const z = new Float32Array(w * h).map((_, i) => (i * 37) % 200);
  z[5] = NaN; z[w * h - 1] = Infinity;
  const out = hillshade(z, w, h, 30);
  assert.equal(out.length, w * h);
  assert.ok([...out].every(v => Number.isFinite(v) && v >= 0 && v <= 1));
  assert.ok(Math.abs(out[5] - FLAT) < 1e-6, 'a missing centre height is shaded as flat');
  assert.equal(hillshade(new Float32Array(1), 1, 1, 30).length, 1);
  assert.ok(hillshade(new Float32Array(0), 0, 0, 30).length === 0);
});

test('terrain picture: tint for each class, light on sunny faces and dark on shaded ones, transparent where nothing applies', () => {
  const tints = { tree: [0, 100, 0], grass: [200, 200, 0], crop: [200, 150, 0], built: [150, 150, 150], water: [0, 0, 200], bare: [150, 120, 90] } as never;
  const opts = { tints, light: [255, 255, 255], dark: [0, 0, 0], tintAlpha: 0.3, strength: 1 } as never;
  assert.equal(tintGroup(1), 'tree'); assert.equal(tintGroup(8), 'water'); assert.equal(tintGroup(0), null);
  const flatPix = terrainPixels([1, 0], new Float32Array([FLAT, FLAT]), opts);
  assert.deepEqual([...flatPix.slice(0, 4)], [0, 100, 0, Math.round(0.3 * 255) - 0]); // tint only
  assert.equal(flatPix[7], 0, 'unmapped flat cell is transparent');
  const sunny = terrainPixels([1], new Float32Array([FLAT + 0.2]), opts);
  const shady = terrainPixels([1], new Float32Array([FLAT - 0.4]), opts);
  assert.ok(sunny[0] > 100 && sunny[3] > 0.3 * 255);
  assert.ok(shady[0] < 5 && shady[3] > sunny[3]);
});

test('view switch: dark terrain is the default whatever is stored badly; choices are remembered; blocked storage never throws', () => {
  const mem = new Map<string, string>();
  const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); } };
  assert.equal(DEFAULT_VIEW, 'dark');
  assert.equal(readView(store, false), 'dark');
  writeView(store, 'light');
  assert.equal(mem.get(VIEW_KEY), 'light');
  assert.equal(readView(store, false), 'light');
  writeView(store, 'satellite');
  assert.equal(readView(store, true), 'satellite');
  assert.equal(readView(store, false), 'dark', 'a saved satellite choice is ignored when satellite is not set up');
  mem.set(VIEW_KEY, 'neon');
  assert.equal(readView(store, true), 'dark');
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  assert.equal(readView(broken, true), 'dark');
  assert.doesNotThrow(() => writeView(broken, 'dark'));
  assert.equal(readView(null, true), 'dark');
  assert.doesNotThrow(() => writeView(undefined, 'dark'));
});

test('satellite is available only when opted in with both a tile URL and an attribution', () => {
  const url = 'https://tiles.example.test/{z}/{y}/{x}.jpg';
  assert.equal(satelliteConfig({}), null);
  assert.equal(satelliteConfig({ VITE_SATELLITE_BASEMAP: 'true' }), null);
  assert.equal(satelliteConfig({ VITE_SATELLITE_BASEMAP: 'true', VITE_SATELLITE_TILE_URL: url }), null);
  assert.equal(satelliteConfig({ VITE_SATELLITE_BASEMAP: 'false', VITE_SATELLITE_TILE_URL: url, VITE_SATELLITE_ATTRIBUTION: 'x' }), null);
  assert.deepEqual(satelliteConfig({ VITE_SATELLITE_BASEMAP: 'true', VITE_SATELLITE_TILE_URL: ` ${url} `, VITE_SATELLITE_ATTRIBUTION: 'Credit' }), { url, attribution: 'Credit', note: "Check the imagery provider's terms before public use.", maxZoom: 13 });
  assert.equal(satelliteConfig({ VITE_SATELLITE_BASEMAP: 'true', VITE_SATELLITE_TILE_URL: url, VITE_SATELLITE_ATTRIBUTION: 'C', VITE_SATELLITE_NOTE: 'Imagery: X', VITE_SATELLITE_MAX_ZOOM: '17' })?.maxZoom, 17);
  assert.equal(satelliteConfig({ VITE_SATELLITE_BASEMAP: 'true', VITE_SATELLITE_TILE_URL: url, VITE_SATELLITE_ATTRIBUTION: 'C', VITE_SATELLITE_NOTE: 'Imagery: X' })?.note, 'Imagery: X');
  assert.equal(SATELLITE_MAX_ZOOM, 13);
});

test('fire ramp: the front is the first colour and the oldest burn the last; overlay by age; glow sits just outside the front', () => {
  assert.equal(ageFraction(6, 6), 0);
  assert.equal(ageFraction(0, 6), 1);
  assert.equal(ageFraction(3, 6), 0.5);
  assert.equal(ageFraction(9, 6), 0);
  assert.equal(ageFraction(0, 0), 0);
  const w = 5, h = 1, S = OVERLAY_SCALE;
  const arr = new Float32Array([0, 2, 4, Infinity, Infinity]);
  const buf = createOverlay(w, h);
  const yellow: [number, number, number] = [255, 255, 0], red: [number, number, number] = [150, 0, 0];
  paintRun(buf, arr, w, h, 4, 24, { fill: { stops: [yellow, red], alpha: 1, age: true }, glow: { rgb: [1, 2, 3], alpha: 0.5 } });
  const px = (x: number) => [...buf.slice((w * S + x) * 4, (w * S + x) * 4 + 4)];
  assert.deepEqual(px(0 * S + 1).slice(0, 3), red, 'oldest');
  assert.deepEqual(px(2 * S + 1).slice(0, 3), yellow, 'just burning at the front');
  assert.deepEqual(px(3 * S + 1), [1, 2, 3, 128], 'glow in the first unburned cell');
  assert.equal(px(4 * S + 1)[3], 0, 'nothing further out');
});

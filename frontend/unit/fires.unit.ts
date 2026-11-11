import assert from 'node:assert/strict';
import test from 'node:test';
import { fireName, firePolygons, happenedWords, nearestWords, statusLine, warnText, type Fire } from '../src/features/fires/model.ts';
import { compareWords, overallWords } from '../src/features/firespread/model.ts';
import { km } from '../src/features/fires/geo.ts';

const t = (_k: string, d: string, o?: Record<string, unknown>) => d.replace(/\{\{(\w+)\}\}/g, (_m, k) => String(o?.[k] ?? ''));
const fire = (o: Partial<Fire> = {}): Fire => ({ id: 'a', lat: 22.5, lon: 80.1, bbox: [80, 22, 80.2, 22.6], first_seen: '2025-04-10T08:00:00Z', last_seen: '2025-04-12T08:00:00Z', age_h: 3, n_det: 9, n_passes: 4, area_km2: 3.1, frp_sum: 40,
  status: 'growing', kind: 'likely', grew_toward: 'SE', grew_deg: 135, passes: [], places: [{ name: 'Pathara', kind: 'village', lat: 22.4, lon: 80.1, km: 1.3, bearing: 'S', on_side: true }], nearest: { name: 'Pathara', kind: 'village', lat: 22.4, lon: 80.1, km: 1.3, bearing: 'S', on_side: true }, multi: true, tasked: false, attention: 50, ...o });

test('a fire is named by its nearest place, else by position', () => { assert.equal(fireName(fire(), t), 'near Pathara'); assert.equal(fireName(fire({ nearest: null }), t), '22.50°N 80.10°E'); });
test('observed facts only: passes, span, area and the side it grew toward, no times to arrival', () => {
  const w = happenedWords(fire(), t); assert.match(w, /4 times over 2 days, about 3.1 km²/); assert.match(w, /south-east/); assert.doesNotMatch(w, /hours? (to|until)|reach/i);
  assert.match(happenedWords(fire({ status: 'steady' }), t), /not grown/); assert.match(happenedWords(fire({ status: 'out' }), t), /probably out/);
});
test('the nearest place carries its distance from the edge and whether it is on the side it grew toward', () => { assert.match(nearestWords(fire(), t)!, /1.3 km from the fire edge, on the side it grew toward/); assert.equal(nearestWords(fire({ nearest: null }), t), null); });
test('status line and warning text', () => {
  assert.equal(statusLine({ active: 9, growing: 3, near_village: 2, no_task: 5, single: 40 }, t), 'Active now 9 · growing 3 · within 2 km of a village 2 · no check yet 5');
  const w = warnText(fire(), t); assert.match(w, /near Pathara: growing/); assert.match(w, /Places near it: Pathara/); assert.match(w, /south-east/);
});
test('map pieces: the newest look is drawn amber, earlier ones red, and replaying stops at the chosen look', () => {
  const fp = [{ t: 'a', rings: [[[0, 0], [1, 0], [1, 1], [0, 0]]] }, { t: 'b', rings: [[[2, 2], [3, 2], [3, 3], [2, 2]]] }, { t: 'c', rings: [[[4, 4], [5, 4], [5, 5], [4, 4]]] }] as never;
  assert.deepEqual(firePolygons(fp, 2).map(p => p.tone), ['fire', 'fire', 'grew']); assert.deepEqual(firePolygons(fp, 1).map(p => p.tone), ['fire', 'grew']); assert.deepEqual(firePolygons(fp, 0).map(p => p.tone), ['fire']);
});
test('distance', () => { assert.ok(Math.abs(km(20, 80, 20.1, 80) - 11.13) < 0.05); });

test('the comparison says how much burned was covered, against nearest-first, and says plainly when a fire is bigger than the band', () => {
  const good = compareWords({ burned_km2: 4.1, top_band_km2: 6.8, top_band_capture: 0.95, top_band_precision: 0.57, nearest_capture: 0.34, three_bands_km2: 20.5, three_bands_capture: 1 }, t);
  assert.match(good[0], /Of the 4.1 km² that burned, the top band \(6.8 km²\) covers 95%/); assert.match(good[0], /nearest the fire first.*34%/); assert.match(good[1], /57% of the top band burned/);
  const big = compareWords({ burned_km2: 37.5, top_band_km2: 7.8, top_band_capture: 0.16, top_band_precision: 0.79, nearest_capture: 0.08, three_bands_km2: 23.5, three_bands_capture: 0.41 }, t);
  assert.match(big[0], /A large fire: 37.5 km² burned/); assert.match(big[0], /covers 16%.*41%/);
});
test('the overall note includes how often it fell short', () => {
  const w = overallWords({ fires: 244, burned_km2_median: 1.9, top_band_km2_median: 6.8, top_band_capture_median: 0.75, nearest_capture_median: 0.5, share_capture_80: 0.45, share_capture_under_30: 0.2, share_better_than_nearest: 0.7, three_bands_km2_median: 20.4, three_bands_capture_median: 1 }, t);
  assert.match(w[0], /all 244 test fires/); assert.match(w[0], /covered 75%.*50%/); assert.match(w[1], /80% or more of what burned in 45%.*under 30% in 20%.*better than nearest-first in 70%/); assert.match(w[2], /ranking and not a forecast/);
});

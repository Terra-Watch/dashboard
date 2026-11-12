import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { json, signedInAs } from './helpers';

const now = Date.now();
const incident = (over: object = {}) => ({ id: 21, source: 'citizen', size: 'unknown', notes: 'Smoke over the ridge', status: 'verified', close_reason: null, state: 'OD', latitude: 20.3, longitude: 85.8, observed_at: new Date(now - 3_600_000).toISOString(), created_at: new Date(now - 3_600_000).toISOString(), updated_at: new Date(now).toISOString(), ...over });
const freshness = { source: 'nasa-firms', fetched_at: new Date(now).toISOString(), age_seconds: 600, stale: null };

test.describe('Control Room map', () => {
  test.beforeEach(async ({ page }) => {
    await signedInAs(page, 'incident_commander', 'Lead Rao');
    await page.route('**/api/ops/settings', route => route.fulfill(json({ corroboration: null, exposure_radii_km: null, scenario_enabled: false })));
    await page.route('**/api/incidents', route => route.fulfill(json([incident(), incident({ id: 22, status: 'reported', latitude: 20.5, longitude: 85.9 }), incident({ id: 23, status: 'closed' }), incident({ id: 24, created_at: new Date(now - 30 * 3_600_000).toISOString(), latitude: 20.1, longitude: 85.5 })])));
    await page.route('**/api/hotspots**', route => route.fulfill(json({ items: [{ id: 1, satellite: 'VIIRS_SNPP_NRT', acq_datetime: new Date(now - 600_000).toISOString(), latitude: 20.31, longitude: 85.81, frp: 4, age_minutes: 10 }], freshness, label: 'x' })));
    await page.route('**/api/weather/context**', route => route.fulfill(json({ wind_speed_ms: 4.5, wind_dir_deg: 225, valid_time: new Date(now).toISOString(), freshness: { source: 'open-meteo', fetched_at: new Date(now).toISOString(), age_seconds: 120, stale: null } })));
    await page.route('**/api/notices**', route => route.fulfill(json({ items: [] })));
  });

  test('demo mode shows an archived day with the fires actually detected, and hides the live items', async ({ page }) => {
    const area = (id: number, level: string, fire: boolean) => ({ id, name: `near A${id}`, state: 'OD', lat: 20.25, lon: 85.75 + (id - 40171) * 0.5, bbox: [85.5 + (id - 40171) * 0.5, 20, 86 + (id - 40171) * 0.5, 20.5], cells: 10, chance: 0.5, expected_fires: 1, usual_fires: 1, usual_chance: 0.3, level, reliable: true, fire_detected: fire });
    const day = { date: '2025-03-18', mode: 'replay', issued_at: '2025-03-17T05:00:00+00:00', levels: [], actions: [], label: '', model: {}, week_of_year: 12, areas: [area(40171, 'extreme', true), area(40172, 'none', true)]   /* ids are 0.5-degree blocks: floor(lat/0.5)*1000 + floor(lon/0.5) */, summary: { none: 1, moderate: 0, high: 0, extreme: 1 }, areas_scored: 2, scope: 'all', note: '',
      outcome: { areas_with_fire: 2, in_high_or_extreme: 1, areas_rated_high_or_extreme: 1, of_those_with_fire: 1 }, fire_cells: [[20.25, 85.75, 1.0], [20.35, 85.75, 0.55], [20.25, 86.25, 0.3]] };
    await page.route('**/api/area-forecast/archive/dates', route => route.fulfill(json({ dates: ['2025-03-18'], latest: '2025-03-18', mode: 'replay' })));
    await page.route('**/api/area-forecast/archive/2025-03-18', route => route.fulfill(json(day)));
    await page.route('**/api/ops/settings', route => route.fulfill(json({ corroboration: null, exposure_radii_km: null, scenario_enabled: false, risk_forecast_enabled: true })));
    const cell = (id: number, band: string, forest: number) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [85.75, 20.25 + id * 0.1] }, properties: { cell_id: id, state: 'OD', rank_percentile: 90, band, forest_frac: forest } });
    await page.route('**/api/risk/geojson**', route => route.fulfill(json({ type: 'FeatureCollection', features: [cell(1, 'High', 1.0), cell(2, 'Low', 0.6), cell(3, 'Low', 0.25)] })));
    await page.goto('/ops/map');
    await page.getByRole('button', { name: 'Demo (archive)' }).click();
    await expect(page.getByText(/Demo: a past day of 2025/)).toBeVisible();
    await expect(page.getByText(/What was detected on 2025-03-18: a fire was seen by satellite in 2 areas/)).toBeVisible();
    const map = page.getByTestId('map');
    await expect(map).toHaveAttribute('data-ready', 'true', { timeout: 20000 });
    const key = page.getByTestId('legend');
    await expect(key.getByText('Fire detected')).toBeVisible(); await expect(key.getByText('Extreme (60% or more)')).toBeVisible(); await expect(key.getByText('Satellite signal')).toHaveCount(0);   // the live symbols are not in the demo key
    await expect(page.getByText('Forecast for tomorrow')).toHaveCount(0);   // the live risk controls are hidden in the demo
    // the forecast is drawn on the forest cells, shaded by their area's level: the two cells inside the Extreme area, none for the unrated area or for the cell outside any area
    await expect(map).toHaveAttribute('data-polygons', '2');         // the two forest cells shaded by the Extreme area; the plain forest cells are off by default
    await page.getByLabel('Forest cells', { exact: true }).check();
    await expect(map).toHaveAttribute('data-polygons', '5');         // plus the three forest cells with nothing on them
    await page.getByLabel('Forecast (model output)').uncheck(); await page.getByLabel('Fires detected').uncheck();
    await expect(map).toHaveAttribute('data-polygons', '3');         // the forest cells stand on their own: no model output, no fire
    await expect(key.getByText('Forest cell', { exact: true })).toBeVisible();
    await page.getByLabel('Forecast (model output)').check(); await page.getByLabel('Fires detected').check();
    await expect(map).toHaveAttribute('data-risk-cells', '0');       // the rank circles are off until asked for
    await page.getByLabel('Outline the 55 km areas').check();
    await expect(map).toHaveAttribute('data-polygons', '6');         // plus the outline of the Extreme area
    await page.getByLabel('Outline the 55 km areas').uncheck();
    await page.getByLabel('Rank circles (model rank)').check();
    await expect(map).toHaveAttribute('data-risk-cells', '3');       // every forest cell of the day, shaded by the model's rank
    await expect(key.getByText('Rank circles (model rank)')).toBeVisible();
    await page.getByRole('combobox', { name: /Forest cells/ }).selectOption('0.5');   // forest land 50% or more drops the 0.25 cell as well as the 0.3 fire square
    await expect(map).toHaveAttribute('data-risk-cells', '2');
    await expect(map).toHaveAttribute('data-polygons', '4');         // two forest cells and the two shaded cells
    await page.getByRole('combobox', { name: /Forest cells/ }).selectOption('0');
    await expect(map).toHaveAttribute('data-points', '3');          // the three fire squares; no incident, station or live signal
    await page.getByRole('combobox', { name: /Forest cells/ }).selectOption('0.5');        // forest land 50% or more: the 0.3 square drops out
    await expect(map).toHaveAttribute('data-points', '2');
    await page.getByRole('combobox', { name: /Forest cells/ }).selectOption('0.8');
    await expect(map).toHaveAttribute('data-points', '1');
    await page.getByRole('combobox', { name: /Forest cells/ }).selectOption('0');
    await page.getByLabel('Compare').selectOption('hit');            // rated High or Extreme and a fire: only the first area's square
    await expect(map).toHaveAttribute('data-points', '2');
    await page.getByLabel('Compare').selectOption('missed');         // a fire in an area rated lower: the other square
    await expect(map).toHaveAttribute('data-points', '1');
    await page.getByLabel('Compare').selectOption('all');
    await page.getByLabel('Fires detected').uncheck();
    await expect(map).toHaveAttribute('data-points', '0');           // the forecast boxes alone; the model output can be read without the fires on top
    await page.getByLabel('Fires detected').check();
    await page.getByLabel('Forecast (model output)').uncheck();
    await expect(map).toHaveAttribute('data-polygons', '3');         // the forest cells remain
    await page.getByLabel('Forest cells', { exact: true }).uncheck();
    await expect(map).toHaveAttribute('data-polygons', '0');         // each layer switches off on its own
    await page.getByRole('button', { name: 'Live', exact: true }).click();
    await expect(map).not.toHaveAttribute('data-points', '3');
    await expect(page.getByTestId('legend').getByText('Satellite signal')).toBeVisible();
  });

  test('demo scenes: one state on one day, with what the forecast got right and wrong there', async ({ page }) => {
    const area = (id: number, level: string, fire: boolean) => ({ id, name: `near A${id}`, state: 'OD', lat: 20.25, lon: 85.75 + (id - 40171) * 0.5, bbox: [85.5 + (id - 40171) * 0.5, 20, 86 + (id - 40171) * 0.5, 20.5], cells: 10, chance: 0.5, expected_fires: 1, usual_fires: 1, usual_chance: 0.3, level, reliable: true, fire_detected: fire });
    const day = { date: '2025-03-18', mode: 'replay', issued_at: '2025-03-17T05:00:00+00:00', levels: [], actions: [], label: '', model: {}, week_of_year: 12, areas: [area(40171, 'extreme', true), area(40172, 'none', true)]   /* ids are 0.5-degree blocks: floor(lat/0.5)*1000 + floor(lon/0.5) */, summary: { none: 1, moderate: 0, high: 0, extreme: 1 }, areas_scored: 2, scope: 'all', note: '',
      outcome: { areas_with_fire: 2, in_high_or_extreme: 1, areas_rated_high_or_extreme: 1, of_those_with_fire: 1 }, fire_cells: [[20.25, 85.75, 1.0], [20.35, 85.75, 0.55], [20.25, 86.25, 0.3]] };
    await page.route('**/api/area-forecast/archive/dates', route => route.fulfill(json({ dates: ['2025-03-18'], latest: '2025-03-18', mode: 'replay', scenes: [{ id: 's1', date: '2025-03-18', state: 'OD', label: 'Odisha · 18 Mar 2025', rated: 1, fire: 2, hit: 1, missed: 1, false_alarms: 0 }, { id: 's2', date: '2025-03-18', state: 'AS', label: 'Assam · 18 Mar 2025', rated: 0, fire: 0, hit: 0, missed: 0, false_alarms: 0 }] })));
    await page.route('**/api/area-forecast/archive/2025-03-18', route => route.fulfill(json(day)));
    await page.route('**/api/ops/settings', route => route.fulfill(json({ corroboration: null, exposure_radii_km: null, scenario_enabled: false, risk_forecast_enabled: true })));
    const cell = (id: number, band: string, forest: number) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [85.75, 20.25 + id * 0.1] }, properties: { cell_id: id, state: 'OD', rank_percentile: 90, band, forest_frac: forest } });
    await page.route('**/api/risk/geojson**', route => route.fulfill(json({ type: 'FeatureCollection', features: [cell(1, 'High', 1.0), cell(2, 'Low', 0.6), cell(3, 'Low', 0.25)] })));
    await page.goto('/ops/map');
    await page.getByRole('button', { name: 'Demo (archive)' }).click();
    await expect(page.getByText(/Odisha · 18 Mar 2025: 1 areas were rated High or Extreme and 1 of them had a fire; 1 of the 2 areas with a fire were rated lower \(missed\), and 0 rated High or Extreme had no fire/)).toBeVisible();   // opens on the first scene
    const map = page.getByTestId('map');
    await expect(map).toHaveAttribute('data-ready', 'true', { timeout: 20000 });
    await expect(map).toHaveAttribute('data-points', '3');
    await page.getByLabel('State').selectOption('');                           // the state filter on its own: all states of the day
    await expect(page.getByLabel('Scene')).toHaveValue('');
    await page.getByLabel('State').selectOption('OD');                         // back to a state that is a scene: the scene is selected again
    await expect(page.getByLabel('Scene')).toHaveValue('s1');
    await page.getByLabel('Scene').selectOption('s2');                         // Assam: no area of the fixture is in it, so nothing is drawn
    await expect(map).toHaveAttribute('data-points', '0');
    await page.getByLabel('Scene').selectOption('');                           // the whole country again
    await expect(map).toHaveAttribute('data-points', '3');
  });

  test('the satellite chip says what is true: layer off in the Field view, not "not connected"', async ({ page }) => {
    await page.goto('/ops/map');
    await expect(page.getByText(/Satellite · 10 min/)).toBeVisible();
    await page.getByRole('button', { name: 'Field', exact: true }).click();
    await expect(page.getByText('Satellite · layer off')).toBeVisible();
    await expect(page.getByText(/not connected/)).toHaveCount(0);
  });

  test('shows only what belongs: closed incidents and old ones stay off, the window widens on request', async ({ page }) => {
    await page.goto('/ops/map');
    await page.getByRole('button', { name: '24 h' }).click();                 // the default window is Today (since midnight); these fixtures are dated by hours ago
    const map = page.getByTestId('map');
    await expect(map).toHaveAttribute('data-ready', 'true', { timeout: 20000 });
    await expect(map).toHaveAttribute('data-points', '3');            // verified #21, report #22, one satellite signal; not closed #23, not the 30-hour-old #24
    await page.getByRole('button', { name: '72 h' }).click();
    await expect(map).toHaveAttribute('data-points', '4');
    await page.getByRole('button', { name: '6 h' }).click();
    await expect(map).toHaveAttribute('data-points', '3');
  });

  test('the legend explains every symbol in words and shapes; wind and source freshness are stated', async ({ page }) => {
    await page.goto('/ops/map');
    const legend = page.getByTestId('legend');
    for (const word of ['Satellite signal', 'Report, not checked', 'Verified', 'Responding', 'Contained']) await expect(legend.getByText(word, { exact: true })).toBeVisible();
    await expect(legend.getByText('Heat seen from space. No person has checked it.')).toBeVisible();
    await expect(page.getByText('Wind 4.5 m/s from 225°')).toBeVisible();
    await expect(page.getByText(/Satellite · 10 min/)).toBeVisible();
    await expect(page.getByText(/Weather · 2 min/)).toBeVisible();
  });

  test('the same items are listed for people who cannot use a map; choosing one opens its panel and link', async ({ page }) => {
    await page.goto('/ops/map');
    await page.getByRole('button', { name: '24 h' }).click();                 // the default window is Today (since midnight); these fixtures are dated by hours ago
    await page.getByRole('button', { name: 'List', exact: true }).click();
    const list = page.getByTestId('map-list');
    await expect(list.getByRole('button')).toHaveCount(3);
    await list.getByRole('button', { name: /#21/ }).click();
    const panel = page.getByTestId('selected');
    await expect(panel.getByText('Smoke over the ridge')).toBeVisible();
    await expect(panel.getByRole('link', { name: 'Open incident' })).toHaveAttribute('href', '/ops/incidents/21');
  });

  test('a satellite signal is described as unconfirmed', async ({ page }) => {
    await page.goto('/ops/map');
    await page.getByRole('button', { name: 'List', exact: true }).click();
    await page.getByTestId('map-list').getByRole('button', { name: /Satellite signal/ }).click();
    await expect(page.getByTestId('selected').getByText('It is not a confirmed fire until staff check it.')).toBeVisible();
  });

  test('when satellite data is unavailable the page says so and still shows incidents', async ({ page }) => {
    await page.route('**/api/hotspots**', route => route.fulfill(json({ detail: 'off' }, 503)));
    await page.goto('/ops/map');
    await page.getByRole('button', { name: '24 h' }).click();                 // the default window is Today (since midnight); these fixtures are dated by hours ago
    await expect(page.getByText('Satellite signals are not available right now.')).toBeVisible();
    await expect(page.getByTestId('map')).toHaveAttribute('data-points', '2', { timeout: 20000 });
  });

  test('no third-party map requests are made (fonts, icons and tiles are served from this site)', async ({ page }) => {
    const foreign: string[] = [];
    page.on('request', request => { const url = new URL(request.url()); if (!['127.0.0.1', 'localhost'].includes(url.hostname) && url.protocol.startsWith('http')) foreign.push(url.hostname); });
    await page.goto('/ops/map');
    await expect(page.getByTestId('map')).toHaveAttribute('data-ready', 'true', { timeout: 20000 });
    await page.waitForTimeout(1500);
    expect(foreign).toEqual([]);
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`no serious accessibility violations (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/ops/map'); await expect(page.getByTestId('map')).toHaveAttribute('data-ready', 'true', { timeout: 20000 });
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).exclude('.maplibregl-canvas-container').analyze();
      expect(result.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => `${v.id}: ${v.nodes[0]?.html.slice(0, 100)}`)).toEqual([]);
    });
  }
});

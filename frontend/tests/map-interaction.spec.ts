import { expect, test } from '@playwright/test';

// Keep page.route fixtures in control of API traffic instead of the app's offline SW cache.
test.use({ serviceWorkers: 'block' });

const features = [
  { type: 'Feature', geometry: { type: 'Point', coordinates: [81.5, 20.3] }, properties: { cell_id: 11, state: 'OD', rank_percentile: 98, band: 'Very high' } },
  { type: 'Feature', geometry: { type: 'Point', coordinates: [81.6, 20.3] }, properties: { cell_id: 12, state: 'CG', rank_percentile: 84, band: 'High' } },
  { type: 'Feature', geometry: { type: 'Point', coordinates: [81.7, 20.3] }, properties: { cell_id: 13, state: 'TS', rank_percentile: 52, band: 'Moderate' } },
];

test('historical HIGH filter, count, list, map selection, and clear stay synchronized', async ({ page }) => {
  await page.addInitScript((riskFeatures) => {
    const originalFetch = window.fetch.bind(window);
    const requestedBands: string[] = [];
    (window as unknown as { __requestedRiskBands: string[] }).__requestedRiskBands = requestedBands;
    window.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.href);
      if (url.pathname.endsWith('/api/risk/geojson')) {
        const band = url.searchParams.get('risk_band') ?? '';
        requestedBands.push(band);
        const selected = band === 'high' ? riskFeatures.filter((feature) => ['High', 'Very high'].includes(feature.properties.band)) : riskFeatures;
        return new Response(JSON.stringify({ type: 'FeatureCollection', features: selected }), { status: 200, headers: { 'Content-Type': 'application/geo+json' } });
      }
      if (url.pathname.endsWith('/api/redesign/detections')) {
        return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return originalFetch(input, init);
    };
  }, features);

  await page.goto('/redesign/today');
  await expect(page.getByTestId('risk-count')).toHaveText('3 ranked areas');
  await expect(page.getByRole('button', { name: /Cell 13 · TS/ })).toBeVisible();

  // The map is centered on the first point, so clicking the canvas center selects that
  // actual rendered risk feature through MapLibre's interactive layer hit-testing.
  await expect(page.locator('[data-testid="map-shell"]')).toHaveAttribute('data-map-idle', 'true', { timeout: 15_000 });
  const mapCanvas = page.locator('[data-testid="map-shell"] canvas.maplibregl-canvas');
  await expect(mapCanvas).toBeVisible();
  const size = await mapCanvas.boundingBox();
  if (!size) throw new Error('Map canvas has no layout box');
  await mapCanvas.click({ position: { x: size.width / 2, y: size.height / 2 } });
  await expect(page.getByTestId('selected-risk-detail')).toContainText('Cell 11');
  await expect(page.getByTestId('selected-risk-detail')).toContainText('98.0%');
  await page.getByRole('button', { name: 'Clear selected area' }).click();
  await expect(page.getByTestId('selected-risk-detail')).toHaveCount(0);

  await page.getByRole('checkbox', { name: 'Show only HIGH fire-risk areas' }).check();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __requestedRiskBands: string[] }).__requestedRiskBands)).toContain('high');
  await expect(page.getByTestId('risk-count')).toHaveText('2 HIGH-risk areas');
  await expect(page.getByRole('button', { name: /Cell 11 · OD/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Cell 12 · CG/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Cell 13 · TS/ })).toHaveCount(0);
});

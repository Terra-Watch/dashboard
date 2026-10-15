import { useEffect, useMemo, useState } from 'react';
import { EmptyState, SampleDataBadge, StepIndicator, TrustBadge } from '../components/primitives';
import {
  IgnitionMarker,
  MapShell,
  ObservedFootprintLayer,
  ProbabilityBandsLayer,
  RiskCellsLayer,
  WindArrowsLayer,
  type MapBounds,
} from '../components/map';

const DATA_ROOT = `${import.meta.env.BASE_URL ?? '/'}demo/resq6-offline-terrawatch-20261015/`.replace(/\/+/g, '/');

interface DemoCaseSummary {
  incident_id: string;
  state: string;
  label: string;
  artifact_status: string;
  simulation_start_utc: string;
  ensemble_members: number;
  scenario_path: string;
  available_overpasses: number;
}

interface DemoIndex {
  schema_version: number;
  forecast: {
    model: string;
    date: string;
    artifact_status: string;
    coverage_complete: boolean;
    geometry_path: string;
    warning: string;
  };
  simulation_cases: DemoCaseSummary[];
  relationship: string;
  observation_semantics: string;
  validation_status: string;
  provenance_path: string;
}

interface DemoFrame {
  overpass_k: number;
  time_utc: string;
  hours_since_t0: number;
  probability_bands_geojson: GeoJSON.FeatureCollection;
  viirs_detection_mask_geojson: GeoJSON.FeatureCollection;
  wind_arrow: { lat: number; lon: number; direction_deg: number; speed_ms: number };
}

interface DemoScenario {
  incident_id: string;
  label: string;
  state: string;
  artifact_status: string;
  simulation_start_utc: string;
  ignition: { lat: number; lon: number };
  ignition_origin: string;
  ensemble_members: number;
  wind_source: string;
  assumptions: { fuel: string; weather: string; terrain: string };
  frames_are_actual_saved_overpasses: boolean;
  interpolated_frames: boolean;
  frames: DemoFrame[];
}

async function readJson<T>(relativePath: string): Promise<T> {
  const response = await fetch(`${DATA_ROOT}${relativePath}`);
  if (!response.ok) throw new Error('Some saved example information is unavailable. Please try again later.');
  return response.json() as Promise<T>;
}

import { computeFeatureCollectionBounds } from '../lib/geospatial';

function readableTime(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : `${parsed.toISOString().replace('T', ' ').slice(0, 16)} UTC`;
}

function readableWindSource(value: string): string {
  if (value === 'era5land_native') return 'ERA5-Land historical weather record';
  if (value === 'era5_025') return 'ERA5 historical weather record at 0.25° resolution';
  if (value === 'best_match') return 'Best-match historical weather record (comparison only)';
  return 'Historical weather record';
}

export function OfflineDemoPage() {
  const [index, setIndex] = useState<DemoIndex | null>(null);
  const [forecast, setForecast] = useState<GeoJSON.FeatureCollection | null>(null);
  const [scenario, setScenario] = useState<DemoScenario | null>(null);
  const [caseId, setCaseId] = useState('E2024-135332');
  const [frameIndex, setFrameIndex] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      readJson<DemoIndex>('index.json'),
      readJson<GeoJSON.FeatureCollection>('forecast.geojson'),
    ]).then(([nextIndex, nextForecast]) => {
      if (!active) return;
      if (nextIndex.schema_version !== 1 || !Array.isArray(nextIndex.simulation_cases) || !nextIndex.simulation_cases.length) {
        throw new Error('The saved example list is unavailable. Please try again later.');
      }
      setIndex(nextIndex);
      setForecast(nextForecast);
      if (!nextForecast.features?.length) throw new Error('No historical areas are available for this example.');
      setLoadError(null);
    }).catch((error: unknown) => {
      if (active) setLoadError('Saved example information could not be loaded. Please try again later.');
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!index) return;
    const selected = index.simulation_cases.find((item) => item.incident_id === caseId);
    if (!selected) {
      setScenario(null);
      setLoadError('That historical event is not available in this example.');
      return;
    }
    let active = true;
    setLoadError(null);
    setScenario(null);
    void readJson<DemoScenario>(selected.scenario_path).then((nextScenario) => {
      if (!active) return;
      if (nextScenario.incident_id !== selected.incident_id || !nextScenario.frames_are_actual_saved_overpasses || nextScenario.interpolated_frames) {
        throw new Error('The saved example could not be checked. Please choose another event.');
      }
      if (!nextScenario.frames.length) throw new Error('No saved observation times are available for this event.');
      setScenario(nextScenario);
      setFrameIndex(0);
    }).catch((error: unknown) => {
      if (active) setLoadError('The saved example could not be loaded. Please try another event.');
    });
    return () => { active = false; };
  }, [index, caseId]);

  const selectedCase = index?.simulation_cases.find((item) => item.incident_id === caseId);
  const frame = scenario?.frames[frameIndex];
  const forecastBounds = useMemo(() => computeFeatureCollectionBounds(forecast), [forecast]);
  const scenarioBounds = useMemo(() => {
    if (!scenario) return undefined;
    const ignitionPoint: [number, number] | undefined =
      scenario.ignition && Number.isFinite(scenario.ignition.lat) && Number.isFinite(scenario.ignition.lon)
        ? [scenario.ignition.lon, scenario.ignition.lat]
        : undefined;
    const allFeatures = scenario.frames.flatMap((f) => f.probability_bands_geojson?.features ?? []);
    return computeFeatureCollectionBounds(
      { type: 'FeatureCollection', features: allFeatures },
      ignitionPoint ? [ignitionPoint] : undefined
    );
  }, [scenario]);

  return (
    <div data-rq-app>
      <StepIndicator current="Possible spread" />
      <main className="mx-auto max-w-6xl px-5 py-6">
        <nav aria-label="Public example navigation" className="mb-5 flex flex-wrap gap-4 text-sm">
          <a className="underline" href="/">TerraWatch home</a>
          <a className="underline" href="/login">Staff sign in</a>
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Historical example</p>
            <h1 className="mt-1 font-serif text-3xl">Explore historical fire information</h1>
          </div>
          <SampleDataBadge note="Saved historical information. Nothing on this page is live." />
        </div>
        <p className="mt-3 max-w-4xl text-sm text-ink-muted">
          This example uses saved historical information. The area ranking and possible-spread example are separate: the ranking did not select the example’s starting point or produce its spread.
        </p>

        {loadError && <div role="alert" className="mt-5"><EmptyState title="Example information unavailable" body={loadError} /></div>}
        {!index && !loadError && <p role="status" className="mt-5 text-sm text-ink-muted">Loading saved historical information…</p>}

        {index && forecast && (
          <div className="mt-6 grid gap-8">
            <section aria-labelledby="forecast-heading" className="rounded-rq border border-contour bg-sheet p-4 md:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 id="forecast-heading" className="font-serif text-xl">Historical fire-risk ranking</h2>
                  <p className="mt-1 text-sm text-ink-muted">Saved date {index.forecast.date} · incomplete area coverage</p>
                </div>
                <TrustBadge level="forecast">Historical example · incomplete coverage</TrustBadge>
              </div>
              <p className="mt-3 text-sm">This shows how included forest areas ranked against one another on that date. It is not a calibrated chance of fire or a forecast of how a fire will spread.</p>
              <div className="mt-4 grid gap-4 lg:grid-cols-[2fr,1fr]">
                <MapShell label={`Historical fire-risk areas, ${index.forecast.date}`} center={[81.5, 20.3]} zoom={4.7} bounds={forecastBounds} offline aspect="wide">
                  <RiskCellsLayer data={forecast} visible />
                </MapShell>
                <div className="space-y-3">
                  <p className="text-sm font-semibold">How areas ranked</p>
                  <ul className="space-y-2 text-sm">
                    <li><span className="mr-2 inline-block h-3 w-3 rounded-sm bg-risk-veryhigh" />Highest-ranked — top 1%</li>
                    <li><span className="mr-2 inline-block h-3 w-3 rounded-sm bg-risk-high" />High-ranked — top 5%</li>
                    <li><span className="mr-2 inline-block h-3 w-3 rounded-sm bg-risk-moderate" />Mid-ranked — top 15%</li>
                    <li><span className="mr-2 inline-block h-3 w-3 rounded-sm bg-risk-low" />Lower-ranked</li>
                  </ul>
                  <p className="text-xs text-ink-muted">{forecast.features.length.toLocaleString()} mapped areas. This saved example does not cover the full region.</p>
                </div>
              </div>
            </section>

            <section aria-labelledby="spread-heading" className="rounded-rq border border-contour bg-sheet p-4 md:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 id="spread-heading" className="font-serif text-xl">Possible fire spread in a saved example</h2>
                  <p className="mt-1 text-sm text-ink-muted">Choose a historical event. The views use recorded satellite-observation times; they do not fill in unobserved hours.</p>
                </div>
                <TrustBadge level="scenario">Precomputed · not a forecast</TrustBadge>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-semibold" htmlFor="demo-case">Wildfire case
                  <select id="demo-case" className="mt-1 block w-full rounded-rq border border-contour bg-sheet px-3 py-2 font-normal" value={caseId} onChange={(event) => { setCaseId(event.target.value); setFrameIndex(0); }}>
                    {index.simulation_cases.map((item) => <option key={item.incident_id} value={item.incident_id}>{item.label}</option>)}
                  </select>
                </label>
                {scenario && (
                  <label className="text-sm font-semibold" htmlFor="demo-frame">Saved snapshot
                    <select id="demo-frame" className="mt-1 block w-full rounded-rq border border-contour bg-sheet px-3 py-2 font-normal" value={frameIndex} onChange={(event) => setFrameIndex(Number(event.target.value))}>
                      {scenario.frames.map((item, idx) => <option key={`${item.overpass_k}:${item.time_utc}`} value={idx}>Observation {idx + 1} · {readableTime(item.time_utc)} · {item.hours_since_t0.toFixed(1)} h after the example start</option>)}
                    </select>
                  </label>
                )}
              </div>

              {selectedCase && <p className="mt-3 text-sm"><strong>{selectedCase.label}</strong> · {selectedCase.ensemble_members} saved spread examples · starting time {readableTime(selectedCase.simulation_start_utc)}</p>}
              {scenario && frame && (
                <>
                  <div className="mt-4 grid gap-4 lg:grid-cols-[2fr,1fr]">
                    <MapShell label={`${scenario.label}, possible fire spread at saved observation ${frame.overpass_k + 1}`} bounds={scenarioBounds} center={[scenario.ignition.lon, scenario.ignition.lat]} zoom={11} offline aspect="wide">
                      <ProbabilityBandsLayer data={frame.probability_bands_geojson} visible />
                      <ObservedFootprintLayer data={frame.viirs_detection_mask_geojson} visible />
                      <WindArrowsLayer arrows={[frame.wind_arrow]} visible />
                      <IgnitionMarker lat={scenario.ignition.lat} lon={scenario.ignition.lon} />
                    </MapShell>
                    <div className="space-y-3 text-sm">
                      <p><strong>Snapshot:</strong> {readableTime(frame.time_utc)}</p>
                      <p><strong>Time:</strong> {frame.hours_since_t0.toFixed(2)} hours after the example start. This is not a fixed forecast horizon.</p>
                      <p><strong>Example starting point:</strong> {scenario.ignition.lat.toFixed(5)}, {scenario.ignition.lon.toFixed(5)}.</p>
                      <p><strong>Wind:</strong> Arrow shows the saved wind direction and speed at this observation time.</p>
                      <p><strong>Map key:</strong> Shading shows the share of saved spread examples in which fire reached an area. The outline marks places where satellites detected fire activity; it is not a complete fire perimeter. Unmarked areas are unknown, not confirmed unburned.</p>
                    </div>
                  </div>
                  <p className="mt-3 rounded-rq border border-dashed border-ink bg-paper p-3 text-sm">This is a saved, conditional example using a fixed starting point and historical inputs. It is separate from the area ranking above and is not an operational forecast.</p>
                  <details className="mt-3 rounded-rq border border-contour p-3">
                    <summary className="cursor-pointer text-sm font-semibold">Sources, methods, and limitations</summary>
                    <dl className="mt-2 space-y-2 text-sm text-ink-muted">
                      <div><dt className="font-semibold text-ink">Weather and wind</dt><dd>Historical weather conditions; temperature and humidity were held fixed in the saved spread examples. Wind source: {readableWindSource(scenario.wind_source)}.</dd></div>
                      <div><dt className="font-semibold text-ink">Vegetation and terrain</dt><dd>Simplified vegetation assumptions that have not been calibrated for operational use. Terrain source: Copernicus GLO-30.</dd></div>
                      <div><dt className="font-semibold text-ink">Satellite observations</dt><dd>VIIRS active-fire detections are supporting observations, not complete fire perimeters. Missing detections do not confirm that an area was unburned.</dd></div>
                      <div><dt className="font-semibold text-ink">Saved times</dt><dd>Each displayed time is an actual recorded observation; no intermediate times were created. Source records and integrity checks are retained with the research materials.</dd></div>
                    </dl>
                  </details>
                </>
              )}
              {index && !scenario && !loadError && <p role="status" className="mt-4 text-sm text-ink-muted">Loading the selected historical event…</p>}
            </section>
          </div>
        )}

        {index && <p className="mt-6 border-t border-contour pt-4 text-xs text-ink-muted">This example has not passed the required accuracy checks for operational use. Satellite detections are incomplete observations, not fire perimeters; an area without a detection is not confirmed unburned. Detailed source records and integrity checks are preserved with the research materials.</p>}
        <p className="mt-5 text-xs text-ink-muted">This example is saved with the app and can be explored without an internet connection. It does not show current fire activity or forecasts.</p>
      </main>
    </div>
  );
}

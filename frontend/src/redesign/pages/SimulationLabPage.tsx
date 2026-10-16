import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { SampleDataBadge, StepIndicator, TrustBadge } from '../components/primitives';
import { IgnitionMarker, LayerPanel, MapShell, type LayerDef } from '../components/map';
import { Layer, Source } from 'react-map-gl/maplibre';

interface SavedSimulationManifest {
  scenario_id: string;
  location: { latitude: number; longitude: number };
  domain: {
    bounds: { west: number; south: number; east: number; north: number };
    rows: number;
    columns: number;
    cell_size_m: number;
  };
  ignition: { latitude: number; longitude: number; row: number; column: number; ncell: number };
  duration_hours: number;
  frame_count: number;
  burned_cells: number[];
  inputs: {
    weather: { source_date: string; profile: string; extension: string };
    fuel_mapping: string;
  };
  georeferenced: boolean;
  production_eligible: boolean;
  disclaimer: string;
}

const OUTPUT_BASE = '/simulation/similipal-demo';

async function loadSavedManifest(): Promise<SavedSimulationManifest> {
  const response = await fetch(`${OUTPUT_BASE}/manifest.json`);
  if (!response.ok) throw new Error(`Saved simulation manifest returned HTTP ${response.status}.`);
  const manifest = await response.json() as SavedSimulationManifest;
  if (
    !manifest.georeferenced ||
    !Number.isInteger(manifest.frame_count) ||
    manifest.frame_count < 1 ||
    !Array.isArray(manifest.burned_cells) ||
    manifest.burned_cells.length !== manifest.frame_count
  ) {
    throw new Error('Saved simulation manifest is incomplete or has an unsupported format.');
  }
  return manifest;
}

export function SimulationLabPage(_props: { go?: (path: string) => void }) {
  const [activeHour, setActiveHour] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [spreadVisible, setSpreadVisible] = useState(true);
  const [ignitionVisible, setIgnitionVisible] = useState(true);
  const savedQuery = useQuery({ queryKey: ['saved-simulation-manifest'], queryFn: loadSavedManifest });
  const saved = savedQuery.data;
  const lastHour = saved ? saved.frame_count - 1 : 0;
  const bounds = saved?.domain.bounds;
  const frameUrl = saved ? `${OUTPUT_BASE}/frame-${String(activeHour).padStart(2, '0')}.png` : null;
  const imageCoordinates: [number, number][] | undefined = bounds
    ? [
        [bounds.west, bounds.north],
        [bounds.east, bounds.north],
        [bounds.east, bounds.south],
        [bounds.west, bounds.south],
      ]
    : undefined;

  useEffect(() => {
    if (!isPlaying || !saved) return;
    if (activeHour >= lastHour) {
      setIsPlaying(false);
      return;
    }
    const timer = window.setInterval(() => {
      setActiveHour((hour) => {
        if (hour >= lastHour) {
          setIsPlaying(false);
          return hour;
        }
        return hour + 1;
      });
    }, 700);
    return () => window.clearInterval(timer);
  }, [isPlaying, activeHour, lastHour, saved]);

  const layers: LayerDef[] = [
    { id: 'spread', label: 'Saved synthetic spread frame', available: Boolean(saved) },
    { id: 'ignition', label: 'Saved ignition point', available: Boolean(saved) },
  ];

  return (
    <div data-rq-app className="min-h-screen bg-paper text-ink pb-12">
      <StepIndicator current="Possible spread" />
      <div className="mx-auto max-w-6xl px-5 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-contour pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-serif text-2xl font-bold">Saved spread scenario</h1>
              <SampleDataBadge note="Static development artifact · read only" />
            </div>
            <p className="mt-1 text-sm text-ink-muted">
              Review the archived Similipal scenario frame by frame. This page does not start or request a simulation.
            </p>
          </div>
          <TrustBadge level="scenario">Synthetic · Not an operational forecast</TrustBadge>
        </div>

        <div className="mt-5 rounded-rq border border-danger/40 bg-sheet p-4 text-sm" role="note">
          <strong className="text-danger">Generated scenario, not observed fire data.</strong>{' '}
          The saved artifact is explicitly marked not production-eligible. It is a fixed-input development example and must not be interpreted as a live forecast, incident record, or validated prediction.
          {saved?.disclaimer && <p className="mt-1 text-ink-muted">{saved.disclaimer}</p>}
        </div>

        {savedQuery.isLoading && <p role="status" className="mt-5 rounded-rq border border-contour bg-sheet p-4 text-sm text-ink-muted">Loading saved scenario metadata…</p>}
        {savedQuery.isError && (
          <div role="alert" className="mt-5 rounded-rq border border-danger/40 bg-sheet p-4 text-sm">
            <p className="font-semibold text-danger">Saved output is unavailable.</p>
            <p className="mt-1 text-ink-muted">{savedQuery.error instanceof Error ? savedQuery.error.message : 'The local scenario metadata could not be loaded.'} No simulation was started.</p>
            <button type="button" onClick={() => void savedQuery.refetch()} disabled={savedQuery.isFetching} className="mt-3 rounded border border-contour px-3 py-1.5 font-semibold disabled:opacity-50">
              {savedQuery.isFetching ? 'Retrying…' : 'Retry loading saved output'}
            </button>
          </div>
        )}

        {saved && bounds && imageCoordinates && frameUrl && (
          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-12">
            <section className="space-y-4 lg:col-span-4" aria-label="Saved scenario provenance">
              <div className="rounded-rq border border-contour bg-sheet p-4 text-sm">
                <h2 className="font-serif font-bold">Artifact provenance</h2>
                <dl className="mt-3 space-y-2 text-xs">
                  <div><dt className="font-semibold">Scenario ID</dt><dd className="break-all font-mono text-ink-muted">{saved.scenario_id}</dd></div>
                  <div><dt className="font-semibold">Saved duration</dt><dd className="text-ink-muted">{saved.duration_hours} hours · {saved.frame_count} frames</dd></div>
                  <div><dt className="font-semibold">Grid</dt><dd className="text-ink-muted">{saved.domain.rows} × {saved.domain.columns} cells · {saved.domain.cell_size_m} m cells</dd></div>
                  <div><dt className="font-semibold">Fuel mapping</dt><dd className="text-ink-muted">{saved.inputs.fuel_mapping}</dd></div>
                  <div><dt className="font-semibold">Weather profile</dt><dd className="text-ink-muted">{saved.inputs.weather.profile} · source date {saved.inputs.weather.source_date}</dd></div>
                  <div><dt className="font-semibold">Weather limitation</dt><dd className="text-ink-muted">{saved.inputs.weather.extension}</dd></div>
                  <div><dt className="font-semibold">Release status</dt><dd className="font-semibold text-danger">{saved.production_eligible ? 'Eligibility declared by artifact' : 'Not production eligible'}</dd></div>
                </dl>
              </div>

              <div className="rounded-rq border border-contour bg-sheet p-4">
                <h2 className="font-serif font-bold">Saved frame values</h2>
                <p className="mt-2 text-xs text-ink-muted">Counts below are read from the saved manifest; they are not observed burned-area measurements.</p>
                <p className="mt-3 text-sm">Hour <strong className="font-mono">+{activeHour}</strong></p>
                <p className="mt-1 text-sm">Cells in saved frame <strong className="font-mono">{saved.burned_cells[activeHour] ?? 'Unavailable'}</strong></p>
                <p className="mt-1 text-xs text-ink-muted">Ignition grid cell {saved.ignition.ncell} (row {saved.ignition.row}, column {saved.ignition.column}).</p>
              </div>
            </section>

            <section className="space-y-4 lg:col-span-8" aria-label="Saved simulation playback">
              <div className="overflow-hidden rounded-rq border border-contour bg-paper">
                <MapShell label="Georeferenced saved synthetic spread frame" bounds={[bounds.west, bounds.south, bounds.east, bounds.north]} aspect="wide">
                  {spreadVisible && (
                    <Source id="saved-scenario-frame" type="image" url={frameUrl} coordinates={imageCoordinates}>
                      <Layer id="saved-scenario-raster" type="raster" paint={{ 'raster-opacity': 0.82 }} />
                    </Source>
                  )}
                  {ignitionVisible && <IgnitionMarker lat={saved.ignition.latitude} lon={saved.ignition.longitude} />}
                </MapShell>
              </div>

              <div className="rounded-rq border border-contour bg-sheet p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setIsPlaying((playing) => !playing)} disabled={lastHour === 0 || (activeHour >= lastHour && !isPlaying)} className="rounded-rq border border-contour bg-paper px-3 py-1.5 text-xs font-semibold disabled:opacity-40">
                      {isPlaying ? 'Pause' : 'Play saved frames'}
                    </button>
                    <button type="button" onClick={() => { setIsPlaying(false); setActiveHour((hour) => Math.max(0, hour - 1)); }} disabled={activeHour === 0} className="rounded-rq border border-contour px-2 py-1.5 text-xs disabled:opacity-40">−1 h</button>
                    <button type="button" onClick={() => { setIsPlaying(false); setActiveHour((hour) => Math.min(lastHour, hour + 1)); }} disabled={activeHour >= lastHour} className="rounded-rq border border-contour px-2 py-1.5 text-xs disabled:opacity-40">+1 h</button>
                  </div>
                  <p className="text-sm">Saved frame <strong className="font-mono">T+{activeHour}h / T+{lastHour}h</strong></p>
                </div>
                <label htmlFor="saved-frame-hour" className="sr-only">Select saved scenario hour</label>
                <input id="saved-frame-hour" aria-label="Select saved scenario hour" type="range" min={0} max={lastHour} value={activeHour} onChange={(event) => { setIsPlaying(false); setActiveHour(Number(event.target.value)); }} className="w-full accent-canopy" />
                <div className="flex justify-between text-[11px] text-ink-muted"><span>T+0 h · saved frame</span><span>T+{lastHour} h · last saved frame</span></div>
              </div>

              <LayerPanel
                active={new Set([...(spreadVisible ? ['spread'] : []), ...(ignitionVisible ? ['ignition'] : [])])}
                onToggle={(id) => {
                  if (id === 'spread') setSpreadVisible((visible) => !visible);
                  if (id === 'ignition') setIgnitionVisible((visible) => !visible);
                }}
                layers={layers}
              />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

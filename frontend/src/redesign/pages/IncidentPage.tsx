import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { rqFetch } from '../lib/api';
import { SampleDataBadge, StepIndicator, TrustBadge } from '../components/primitives';
import { WindSourceSwitch, AssumptionsPanel, ScenarioTimeline, ProbabilityBandLegend, BriefingExport } from '../components/scenario';
import {
  MapShell, LayerPanel, WindArrowsControl, ProbabilityBandsLayer, BaselineLayer, WindArrowsLayer, IgnitionMarker,
  OperationalMapLegend,
  type LayerDef, type MapBounds,
} from '../components/map';

interface ScenarioResponse {
  incident_id: string;
  sample_data: boolean;
  uncalibrated: boolean;
  wind_source: string;
  overpass_k: number;
  overpass_count: number;
  overpass_time_utc: string;
  hours_since_t0: number | null;
  probability_bands_grid: number[][];
  bounds: MapBounds;
  ignition: { lat: number; lon: number };
  probability_bands_geojson: GeoJSON.FeatureCollection;
  baselines_geojson?: { proximity: GeoJSON.FeatureCollection; circle_final_area?: GeoJSON.FeatureCollection };
  wind_arrow: { lat: number; lon: number; direction_deg: number; speed_ms: number; source_time_utc: string };
  assumptions: { fuel: string; weather: string; terrain: string };
}

// Give each archive request and map update time to settle before advancing again.
const FRAME_PLAYBACK_INTERVAL_MS = 3000;

const SAVED_INCIDENTS = [
  { id: 'E2023-084925', label: 'Odisha — Mar 2023' },
  { id: 'E2024-131853', label: 'Telangana — Feb 2024' },
  { id: 'E2024-135332', label: 'Maharashtra — Mar 2024' },
  { id: 'E2024-155286', label: 'Chhattisgarh — 2024' },
] as const;

export function IncidentPage({ incidentId }: { incidentId: string }) {
  const [currentIncidentId, setCurrentIncidentId] = useState(incidentId);
  const [windSource, setWindSource] = useState('era5land_native');
  const [overpassK, setOverpassK] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [windArrowsVisible, setWindArrowsVisible] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [activeLayers, setActiveLayers] = useState(new Set(['probability', 'baseline']));
  const toggleLayer = (id: string) => setActiveLayers((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  useEffect(() => {
    setCurrentIncidentId(incidentId);
  }, [incidentId]);

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    update();
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const pauseWhenHidden = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', pauseWhenHidden);
    return () => document.removeEventListener('visibilitychange', pauseWhenHidden);
  }, []);

  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: ['scenario', currentIncidentId, windSource, overpassK],
    queryFn: () => rqFetch<ScenarioResponse>(`/api/redesign/incidents/${currentIncidentId}/scenario?wind_source=${windSource}&overpass_k=${overpassK}`),
  });

  const frameMatchesSelection = data?.incident_id === currentIncidentId
    && data.wind_source === windSource
    && data.overpass_k === overpassK;
  const changeFrame = (nextK: number) => {
    setPlaying(false);
    setOverpassK(nextK);
  };

  useEffect(() => {
    if (reducedMotion || document.hidden) {
      setPlaying(false);
      return;
    }
    if (!playing || !data || !frameMatchesSelection || isFetching) {
      return;
    }
    if (overpassK >= data.overpass_count - 1) {
      setPlaying(false);
      return;
    }
    const timer = window.setInterval(() => {
      setOverpassK((current) => {
        return Math.min(current + 1, data.overpass_count - 1);
      });
    }, FRAME_PLAYBACK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [playing, reducedMotion, data, frameMatchesSelection, isFetching, overpassK]);

  useEffect(() => {
    setPlaying(false);
    setOverpassK(0);
  }, [currentIncidentId]);

  return (
    <div data-rq-app>
      <StepIndicator current="Possible spread" />
      <div className="mx-auto max-w-5xl px-5 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-serif text-2xl">Possible fire spread in a saved example</h1>
          <SampleDataBadge />
        </div>
        <div className="mt-2">
          <TrustBadge level="scenario">Saved example — not an operational forecast.</TrustBadge>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-rq border border-contour bg-sheet p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            Saved incident case
            <select
              aria-label="Saved incident case"
              value={currentIncidentId}
              onChange={(event) => {
                const nextId = event.target.value;
                setCurrentIncidentId(nextId);
                history.pushState({}, '', `/redesign/incident/${nextId}`);
              }}
              className="rounded-rq border border-contour bg-paper px-2.5 py-1 text-sm font-normal"
            >
              {SAVED_INCIDENTS.map((inc) => (
                <option key={inc.id} value={inc.id}>
                  {inc.label} ({inc.id})
                </option>
              ))}
            </select>
          </label>
          <span className="text-xs text-ink-muted">Case ID: <span className="font-semibold text-ink">{currentIncidentId}</span></span>
        </div>

        {(isLoading || (isFetching && data && !frameMatchesSelection)) && <p role="status" className="mt-6 text-sm text-ink-muted">Loading the selected saved observation…</p>}
        {isError && !frameMatchesSelection && <p role="alert" className="mt-6 text-sm text-danger">This saved example could not be loaded. Please try again later.</p>}
        {data && !frameMatchesSelection && !isFetching && !isError && <p role="alert" className="mt-6 text-sm text-danger">The saved response did not match the selected observation. No map was shown.</p>}

        {data && frameMatchesSelection && data.overpass_count === 0 && (
          <p role="status" className="mt-6 text-sm text-ink-muted">No saved observations are available for this incident scenario.</p>
        )}

        {data && frameMatchesSelection && data.overpass_count > 0 && (
          <div className="mt-6 grid gap-6 md:grid-cols-[2fr,1fr]">
            <div>
              <div
                data-testid="probability-grid"
                data-overpass-k={data.overpass_k}
                data-frame-time={data.overpass_time_utc}
                data-wind-time={data.wind_arrow.source_time_utc}
              >
                <MapShell label={`Possible fire spread at saved observation ${data.overpass_k + 1}`} bounds={data.bounds}>
                  <ProbabilityBandsLayer data={data.probability_bands_geojson} visible={activeLayers.has('probability')} />
                  {data.baselines_geojson?.proximity && (
                    <BaselineLayer
                      id="proximity"
                      data={data.baselines_geojson.proximity}
                      visible={activeLayers.has('baseline')}
                      dash={[4, 2]}
                    />
                  )}
                  <WindArrowsLayer arrows={[data.wind_arrow]} visible={windArrowsVisible} />
                  <IgnitionMarker lat={data.ignition.lat} lon={data.ignition.lon} />
                </MapShell>
              </div>
              {data.probability_bands_geojson?.features?.length === 0 && (
                <p role="status" className="mt-2 text-xs text-ink-muted">No simulated spread features exist for this observation frame.</p>
              )}
              <p data-testid="scenario-caveat" className="mt-2 rounded-rq border border-dashed border-ink bg-paper p-2 text-xs">
                This saved example starts from a fixed point and uses past weather. It is separate from the historical area ranking and is not an operational forecast.
              </p>
              <div className="mt-3">
                <ProbabilityBandLegend />
              </div>
              <div className="mt-3">
                <LayerPanel
                  active={activeLayers}
                  onToggle={toggleLayer}
                  layers={[
                    { id: 'probability', label: 'Saved spread examples', available: true },
                    { id: 'baseline', label: 'Proximity baseline (693m radius)', available: Boolean(data.baselines_geojson?.proximity) },
                    { id: 'boundaries', label: 'Boundaries', available: false },
                    { id: 'roads', label: 'Roads', available: false },
                    { id: 'villages', label: 'Settlements', available: false },
                  ]}
                />
              </div>
              <div className="mt-4">
                <ScenarioTimeline
                  k={data.overpass_k}
                  count={data.overpass_count}
                  timeUtc={data.overpass_time_utc}
                  hoursSinceT0={data.hours_since_t0}
                  onChange={changeFrame}
                  playing={playing}
                  onTogglePlay={() => setPlaying((value) => !value)}
                  reducedMotion={reducedMotion}
                  disabled={isLoading || isError}
                />
              </div>
            </div>
            <div className="space-y-4">
              <OperationalMapLegend />
              <details className="rounded-rq border border-contour bg-sheet p-3">
                <summary className="cursor-pointer text-sm font-semibold">Research weather-source comparison</summary>
                <p className="mt-2 text-xs text-ink-muted">This changes which saved research example is shown; these sources have not been approved for operational forecasts.</p>
                <div className="mt-2"><WindSourceSwitch value={windSource} onChange={(value) => { setPlaying(false); setOverpassK(0); setWindSource(value); }} /></div>
              </details>
              <WindArrowsControl visible={windArrowsVisible} onChange={setWindArrowsVisible} />
              <AssumptionsPanel {...data.assumptions} />
              <BriefingExport onExport={() => window.print()} />
            </div>
          </div>
        )}
        <footer className="mt-8 text-xs text-ink-muted">Saved example only; it is not an operational forecast.</footer>
      </div>
    </div>
  );
}

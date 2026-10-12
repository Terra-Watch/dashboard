import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { rqFetch } from '../lib/api';
import { SampleDataBadge, StepIndicator, TrustBadge } from '../components/primitives';
import { WindSourceSwitch, AssumptionsPanel, TimelineSlider, ProbabilityBandLegend, BriefingExport } from '../components/scenario';
import {
  MapShell, LayerPanel, WindArrowsControl, ProbabilityBandsLayer, WindArrowsLayer, IgnitionMarker,
  type LayerDef, type MapBounds,
} from '../components/map';

interface ScenarioResponse {
  incident_id: string;
  sample_data: boolean;
  uncalibrated: boolean;
  wind_source: string;
  overpass_k: number;
  overpass_count: number;
  probability_bands_grid: number[][];
  bounds: MapBounds;
  ignition: { lat: number; lon: number };
  probability_bands_geojson: GeoJSON.FeatureCollection;
  wind_arrow: { lat: number; lon: number; direction_deg: number; speed_ms: number; source_time_utc: string };
  assumptions: { fuel: string; weather: string; terrain: string };
}

const INCIDENT_LAYERS: LayerDef[] = [
  { id: 'probability', label: 'Burn probability bands', available: true },
  { id: 'boundaries', label: 'Boundaries', available: false },
  { id: 'roads', label: 'Roads', available: false },
  { id: 'villages', label: 'Settlements', available: false },
];

export function IncidentPage({ incidentId }: { incidentId: string }) {
  const [windSource, setWindSource] = useState('era5land_native');
  const [overpassK, setOverpassK] = useState(0);
  const [windArrowsVisible, setWindArrowsVisible] = useState(true);
  const [activeLayers, setActiveLayers] = useState(new Set(['probability']));
  const toggleLayer = (id: string) => setActiveLayers((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['scenario', incidentId, windSource, overpassK],
    queryFn: () => rqFetch<ScenarioResponse>(`/api/redesign/incidents/${incidentId}/scenario?wind_source=${windSource}&overpass_k=${overpassK}`),
  });

  return (
    <div data-rq-app>
      <StepIndicator current="Scenario" />
      <div className="mx-auto max-w-5xl px-5 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-serif text-2xl">Spread scenario — {incidentId}</h1>
          <SampleDataBadge />
        </div>
        <div className="mt-2">
          <TrustBadge level="scenario">Uncalibrated scenario — one simulation run, not a forecast.</TrustBadge>
        </div>

        {isLoading && <p className="mt-6 text-sm text-ink-muted">Running the scenario view…</p>}
        {isError && <p className="mt-6 text-sm text-danger">This scenario could not load.</p>}

        {data && (
          <div className="mt-6 grid gap-6 md:grid-cols-[2fr,1fr]">
            <div>
              <div data-testid="probability-grid">
                <MapShell label={`Burn probability bands, overpass ${overpassK}`} bounds={data.bounds}>
                  <ProbabilityBandsLayer data={data.probability_bands_geojson} visible={activeLayers.has('probability')} />
                  <WindArrowsLayer arrows={[data.wind_arrow]} visible={windArrowsVisible} />
                  <IgnitionMarker lat={data.ignition.lat} lon={data.ignition.lon} />
                </MapShell>
              </div>
              <p data-testid="scenario-caveat" className="mt-2 rounded-rq border border-dashed border-ink bg-paper p-2 text-xs">
                Estimate from forecast wind and fuel. Real fires can differ.
              </p>
              <div className="mt-3">
                <ProbabilityBandLegend />
              </div>
              <div className="mt-3">
                <LayerPanel active={activeLayers} onToggle={toggleLayer} layers={INCIDENT_LAYERS} />
              </div>
              <div className="mt-4">
                <TimelineSlider k={overpassK} maxK={Math.max(data.overpass_count - 1, 0)} onChange={setOverpassK} />
              </div>
            </div>
            <div className="space-y-4">
              <WindSourceSwitch value={windSource} onChange={setWindSource} />
              <WindArrowsControl visible={windArrowsVisible} onChange={setWindArrowsVisible} />
              <AssumptionsPanel {...data.assumptions} />
              <BriefingExport onExport={() => window.print()} />
            </div>
          </div>
        )}
        <footer className="mt-8 text-xs text-ink-muted">Advisory forecast. Confirm with field observations.</footer>
      </div>
    </div>
  );
}

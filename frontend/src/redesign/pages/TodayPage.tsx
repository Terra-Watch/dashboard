import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { API } from '../../app/config';
import { rqFetch } from '../lib/api';
import { SampleDataBadge, StepIndicator, EmptyState } from '../components/primitives';
import { RiskLegend } from '../components/scenario';
import { MapShell, LayerPanel, RiskCellsLayer, DetectionsLayer, type LayerDef } from '../components/map';
import type { Detection } from '../lib/types';

const SIX_STATES = ['OD', 'CG', 'TS', 'MP', 'MH', 'JH'];
const DEMO_DATE = '2024-03-10';

interface RiskFeature {
  type: 'Feature';
  geometry: { type: string; coordinates: number[] };
  properties: { cell_id: number; state: string; rank_percentile: number; band: string };
}

async function fetchRisk(target: string) {
  const response = await fetch(`${API}/api/risk/geojson?target=${target}`);
  if (!response.ok) throw new Error('Risk data could not load.');
  return response.json() as Promise<{ type: string; features: RiskFeature[] }>;
}

const TODAY_LAYERS: LayerDef[] = [
  { id: 'risk', label: 'Risk cells', available: true },
  { id: 'detections', label: 'Detections', available: true },
  { id: 'incidents', label: 'Incidents', available: false },
  { id: 'boundaries', label: 'Boundaries', available: false },
  { id: 'roads', label: 'Roads', available: false },
  { id: 'villages', label: 'Settlements', available: false },
];

export function TodayPage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ['today', DEMO_DATE], queryFn: () => fetchRisk(DEMO_DATE), staleTime: 24 * 60 * 60 * 1000 });
  const { data: detections } = useQuery({
    queryKey: ['today-detections'],
    queryFn: () => rqFetch<{ items: Detection[] }>('/api/redesign/detections'),
    staleTime: 60_000,
  });
  const [activeLayers, setActiveLayers] = useState(new Set(['risk']));
  const toggleLayer = (id: string) => setActiveLayers((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });

  return (
    <div data-rq-app>
      <StepIndicator current="Forecast" />
      <div className="mx-auto max-w-5xl px-5 py-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl">Tomorrow's patrol priority</h1>
            <p className="mt-1 text-sm text-ink-muted">
              Model: <strong>Bar v3</strong> · Date: {DEMO_DATE} (archived replay of a past date) · Coverage: Odisha, Chhattisgarh, Telangana, Madhya Pradesh, Maharashtra, Jharkhand only
            </p>
          </div>
          <SampleDataBadge note="Archived Bar v3 replay for a 2023–2024 demo date, not a real-time model run." />
        </div>

        <p className="mt-4 max-w-2xl text-sm text-ink-muted">
          This ranks forest cells for tomorrow only — it is not a prediction and never shows a 24/48h horizon. Outside the six
          states Bar v3 is scoped to ({SIX_STATES.join(', ')}), this screen shows "Not validated here" rather than a risk
          value, because the model has not been checked for other states' seasons, sensors or vegetation.
        </p>

        <div className="mt-5">
          <RiskLegend />
        </div>

        <div className="mt-5">
          {isLoading && <p className="text-sm text-ink-muted">Loading today's ranking…</p>}
          {isError && <EmptyState title="Risk data could not load" body="The archived replay for this date is unavailable. Try a 2023–2024 demo date." />}
          {data && !data.features.length && (
            <EmptyState title="Not validated here" body="No archived ranking exists for this date/region. Outside the six scoped states, RESQ does not show a risk value." />
          )}
          {data && data.features.length > 0 && (
            <div className="grid gap-4 md:grid-cols-[2fr,1fr]">
              <MapShell label="Tomorrow's patrol priority — ranked forest cells" center={[81.5, 20.3]} zoom={5.4} aspect="wide">
                <RiskCellsLayer data={data as unknown as GeoJSON.FeatureCollection} visible={activeLayers.has('risk')} />
                <DetectionsLayer
                  detections={(detections?.items ?? []).map((d) => ({ id: d.id, lat: d.lat, lon: d.lon, label: d.label, status: d.status }))}
                  visible={activeLayers.has('detections')}
                />
              </MapShell>
              <LayerPanel active={activeLayers} onToggle={toggleLayer} layers={TODAY_LAYERS} />
            </div>
          )}
          {data && data.features.length > 0 && (
            <ul
              tabIndex={0}
              aria-label="Ranked forest cells"
              className="hairline-list mt-4 max-h-80 divide-y divide-contour overflow-y-auto rounded-rq border border-contour bg-sheet focus-visible:outline focus-visible:outline-2 focus-visible:outline-canopy"
            >
              {data.features.slice(0, 25).map((feature) => (
                <li key={feature.properties.cell_id} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm">
                    Cell {feature.properties.cell_id} · {feature.properties.state}
                  </span>
                  <span className="text-sm font-semibold">{feature.properties.band}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <footer className="mt-8 text-xs text-ink-muted">Advisory forecast. Confirm with field observations.</footer>
      </div>
    </div>
  );
}

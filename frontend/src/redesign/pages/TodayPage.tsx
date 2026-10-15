import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { API } from '../../app/config';
import { SampleDataBadge, StepIndicator, EmptyState } from '../components/primitives';
import { RiskLegend } from '../components/scenario';
import { MapShell, LayerPanel, RiskCellsLayer, type LayerDef } from '../components/map';

const SIX_STATES = ['Odisha', 'Chhattisgarh', 'Telangana', 'Madhya Pradesh', 'Maharashtra', 'Jharkhand'];
const DEMO_DATE = '2024-03-10';

interface RiskFeature {
  type: 'Feature';
  geometry: { type: string; coordinates: number[] };
  properties: { cell_id: number; state: string; rank_percentile: number; band: string };
}

async function fetchRisk(target: string, highOnly: boolean) {
  const params = new URLSearchParams({ target });
  if (highOnly) params.set('risk_band', 'high');
  const response = await fetch(`${API}/api/risk/geojson?${params.toString()}`);
  if (!response.ok) throw new Error('Risk data could not load.');
  return response.json() as Promise<{ type: string; features: RiskFeature[] }>;
}

const TODAY_LAYERS: LayerDef[] = [
  { id: 'risk', label: 'Fire-risk areas', available: true },
  { id: 'incidents', label: 'Incidents', available: false },
  { id: 'boundaries', label: 'State boundaries', available: false },
  { id: 'roads', label: 'Roads', available: false },
  { id: 'villages', label: 'Settlements', available: false },
];

export function TodayPage() {
  const [highOnly, setHighOnly] = useState(false);
  const [selectedCellId, setSelectedCellId] = useState<number | null>(null);
  const allRisk = useQuery({ queryKey: ['today', DEMO_DATE], queryFn: () => fetchRisk(DEMO_DATE, false), staleTime: 24 * 60 * 60 * 1000 });
  const [highRiskData, setHighRiskData] = useState<{ type: string; features: RiskFeature[] }>();
  const [highRiskStatus, setHighRiskStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const highRiskRequest = useRef(0);
  const data = highOnly ? highRiskData : allRisk.data;
  const isLoading = highOnly ? highRiskStatus === 'loading' : allRisk.isLoading;
  const isError = highOnly ? highRiskStatus === 'error' : allRisk.isError;
  const [activeLayers, setActiveLayers] = useState(new Set(['risk']));
  const toggleLayer = (id: string) => setActiveLayers((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const selectedFeature = useMemo(() => data?.features.find((feature) => feature.properties.cell_id === selectedCellId) ?? null, [data, selectedCellId]);

  useEffect(() => {
    if (selectedCellId == null) return;
    const el = document.getElementById(`risk-cell-btn-${selectedCellId}`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedCellId]);
  const changeHighOnly = (checked: boolean) => {
    setHighOnly(checked);
    setSelectedCellId(null);
    const requestId = ++highRiskRequest.current;
    if (!checked) {
      setHighRiskStatus('idle');
      return;
    }
    setHighRiskData(undefined);
    setHighRiskStatus('loading');
    void fetchRisk(DEMO_DATE, true).then((result) => {
      if (requestId === highRiskRequest.current) {
        setHighRiskData(result);
        setHighRiskStatus('idle');
      }
    }).catch(() => {
      if (requestId === highRiskRequest.current) setHighRiskStatus('error');
    });
  };

  return (
    <div data-rq-app>
      <StepIndicator current="Historical ranking" />
      <div className="mx-auto max-w-5xl px-5 py-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl">Historical fire-risk ranking</h1>
            <p className="mt-1 text-sm text-ink-muted">
              Saved date: {DEMO_DATE} · Incomplete coverage: {SIX_STATES.join(', ')}
            </p>
          </div>
          <SampleDataBadge note="Saved historical information, not a current forecast." />
        </div>

        <p className="mt-4 max-w-2xl text-sm text-ink-muted">
          This example ranks the included forest areas against one another for a past date. It is not a current forecast or a calibrated chance of fire. It has not been checked for other regions, seasons, or vegetation types.
        </p>

        <div className="mt-5">
          <RiskLegend />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-rq border border-contour bg-sheet px-3 py-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              aria-label="Show only HIGH fire-risk areas"
              checked={highOnly}
              onChange={(event) => changeHighOnly(event.target.checked)}
              className="h-4 w-4"
            />
            HIGH only <span className="font-normal text-ink-muted">(High + Very high)</span>
          </label>
          {data && <span aria-live="polite" data-testid="risk-count" className="text-sm text-ink-muted">{data.features.length} {highOnly ? 'HIGH-risk' : 'ranked'} areas</span>}
        </div>

        <div className="mt-5">
          {isLoading && <p className="text-sm text-ink-muted">Loading archived ranking…</p>}
          {isError && <EmptyState title="Historical information could not load" body="This saved example is unavailable. Please try again later." />}
          {data && !data.features.length && (
            <EmptyState title={highOnly ? 'No HIGH-risk areas in this saved ranking' : 'No information for this area'} body={highOnly ? 'No areas in the existing High or Very high bands were returned for this date.' : 'This saved example does not cover the selected area. No fire-risk value is shown.'} />
          )}
          {data && data.features.length > 0 && (
            <div className="grid gap-4 md:grid-cols-[2fr,1fr]">
              <MapShell label={`Archived ranked forest cells — ${DEMO_DATE}`} center={[81.5, 20.3]} zoom={5.4} aspect="wide" onRiskCellSelect={setSelectedCellId}>
                <RiskCellsLayer data={data as unknown as GeoJSON.FeatureCollection} visible={activeLayers.has('risk')} selectedCellId={selectedCellId} />
              </MapShell>
              <div className="space-y-3">
                <LayerPanel active={activeLayers} onToggle={toggleLayer} layers={TODAY_LAYERS} />
                <p className="text-xs text-ink-muted">Select a ranked area on the map or in the list to inspect its saved details.</p>
                {selectedFeature && (
                  <section aria-label="Selected fire-risk area" className="rounded-rq border border-contour bg-sheet p-3" data-testid="selected-risk-detail">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="text-sm font-semibold">Cell {selectedFeature.properties.cell_id}</h2>
                      <button type="button" onClick={() => setSelectedCellId(null)} aria-label="Clear selected area" className="text-xs text-ink-muted underline">Clear</button>
                    </div>
                    <dl className="mt-2 space-y-1 text-sm">
                      <div className="flex justify-between gap-2"><dt className="text-ink-muted">State</dt><dd>{selectedFeature.properties.state}</dd></div>
                      <div className="flex justify-between gap-2"><dt className="text-ink-muted">Saved band</dt><dd>{selectedFeature.properties.band}</dd></div>
                      <div className="flex justify-between gap-2"><dt className="text-ink-muted">Relative rank</dt><dd>{selectedFeature.properties.rank_percentile.toFixed(1)}%</dd></div>
                      {selectedFeature.geometry && selectedFeature.geometry.type === 'Point' && Array.isArray(selectedFeature.geometry.coordinates) && Number.isFinite(selectedFeature.geometry.coordinates[0]) && Number.isFinite(selectedFeature.geometry.coordinates[1]) && (
                        <div className="flex justify-between gap-2"><dt className="text-ink-muted">Coordinates</dt><dd className="font-mono text-xs">{selectedFeature.geometry.coordinates[1].toFixed(4)}°N, {selectedFeature.geometry.coordinates[0].toFixed(4)}°E</dd></div>
                      )}
                    </dl>
                  </section>
                )}
              </div>
            </div>
          )}
          {data && data.features.length > 0 && (
            <ul
              tabIndex={0}
              aria-label="Historical fire-risk areas"
              className="hairline-list mt-4 max-h-80 divide-y divide-contour overflow-y-auto rounded-rq border border-contour bg-sheet focus-visible:outline focus-visible:outline-2 focus-visible:outline-canopy"
            >
              {data.features.map((feature) => (
                <li key={feature.properties.cell_id}>
                  <button
                    id={`risk-cell-btn-${feature.properties.cell_id}`}
                    type="button"
                    aria-pressed={selectedCellId === feature.properties.cell_id}
                    onClick={() => setSelectedCellId(selectedCellId === feature.properties.cell_id ? null : feature.properties.cell_id)}
                    className={`flex w-full items-center justify-between px-4 py-3 text-left hover:bg-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-canopy ${selectedCellId === feature.properties.cell_id ? 'bg-paper' : ''}`}
                  >
                    <span className="text-sm">Cell {feature.properties.cell_id} · {feature.properties.state}</span>
                    <span className="text-sm font-semibold">{feature.properties.band}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <footer className="mt-8 text-xs text-ink-muted">Archived relative ranking only; it is not a current forecast or confirmed fire report.</footer>
      </div>
    </div>
  );
}

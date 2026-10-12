import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { rqFetch } from '../lib/api';
import { SampleDataBadge, StepIndicator, TrustBadge } from '../components/primitives';
import { WindSourceSwitch, BaselineToggle, AssumptionsPanel, TimelineSlider, ProbabilityBandLegend, BriefingExport } from '../components/scenario';

interface ScenarioResponse {
  incident_id: string;
  sample_data: boolean;
  uncalibrated: boolean;
  wind_source: string;
  overpass_k: number;
  overpass_count: number;
  probability_bands_grid: number[][];
  assumptions: { fuel: string; weather: string; terrain: string };
  baseline: { proximity_label: string; circle_label: string; visible_by_default: boolean };
}

const BAND_COLOR = ['bg-prob-1', 'bg-prob-2', 'bg-prob-3', 'bg-prob-4'];

/** Simplified grid renderer standing in for a georeferenced MapShell (MapLibre + PMTiles).
 *  Full basemap/coordinate integration is deferred — see docs/redesign/PROGRESS.md. */
function ProbabilityGrid({ grid }: { grid: number[][] }) {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  return (
    <div
      data-testid="probability-grid"
      role="img"
      aria-label={`Burn probability bands, ${rows} by ${cols} cells`}
      className="grid aspect-square w-full overflow-hidden rounded-rq border border-contour"
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
    >
      {grid.flatMap((row, y) => row.map((band, x) => <div key={`${y}-${x}`} className={BAND_COLOR[band] ?? 'bg-paper'} />))}
    </div>
  );
}

export function IncidentPage({ incidentId }: { incidentId: string }) {
  const [windSource, setWindSource] = useState('era5land_native');
  const [overpassK, setOverpassK] = useState(0);
  const [baselineVisible, setBaselineVisible] = useState(true);

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
              <ProbabilityGrid grid={data.probability_bands_grid} />
              {baselineVisible && (
                <p data-testid="baseline-overlay" className="mt-2 rounded-rq border border-dashed border-ink bg-paper p-2 text-xs">
                  Baseline shown: {data.baseline.proximity_label}.
                </p>
              )}
              <div className="mt-3">
                <ProbabilityBandLegend />
              </div>
              <div className="mt-4">
                <TimelineSlider k={overpassK} maxK={Math.max(data.overpass_count - 1, 0)} onChange={setOverpassK} />
              </div>
            </div>
            <div className="space-y-4">
              <WindSourceSwitch value={windSource} onChange={setWindSource} />
              <BaselineToggle visible={baselineVisible} onChange={setBaselineVisible} />
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

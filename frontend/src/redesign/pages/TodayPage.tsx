import { useQuery } from '@tanstack/react-query';
import { API } from '../../app/config';
import { SampleDataBadge, StepIndicator, EmptyState } from '../components/primitives';
import { RiskLegend } from '../components/scenario';

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

export function TodayPage() {
  const { data, isLoading, isError } = useQuery({ queryKey: ['today', DEMO_DATE], queryFn: () => fetchRisk(DEMO_DATE), staleTime: 24 * 60 * 60 * 1000 });

  return (
    <div data-rq-app>
      <StepIndicator current="Forecast" />
      <div className="mx-auto max-w-5xl px-5 py-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl">Tomorrow's patrol priority</h1>
            <p className="mt-1 text-sm text-ink-muted">
              Model: <strong>Bar v3</strong> · Date: {DEMO_DATE} (archived replay, not live) · Coverage: Odisha, Chhattisgarh, Telangana, Madhya Pradesh, Maharashtra, Jharkhand only
            </p>
          </div>
          <SampleDataBadge note="Archived Bar v3 replay for a 2023–2024 demo date, not a live model run." />
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
            <ul className="hairline-list divide-y divide-contour rounded-rq border border-contour bg-sheet">
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

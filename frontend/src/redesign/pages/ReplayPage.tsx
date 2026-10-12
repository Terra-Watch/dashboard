import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { rqFetch } from '../lib/api';
import { SampleDataBadge, StepIndicator, TrustBadge } from '../components/primitives';

interface ReplayIndex {
  incidents: { incident_id: string; state: string; label: string }[];
  development_incidents: boolean;
  cross_incident_win_counts: {
    wins_out_of_4: Record<string, number>;
    per_incident: Record<string, Record<string, boolean>>;
  };
}

interface OverpassRow {
  overpass_k: number;
  time_utc: string;
  hours_since_t0: number;
  auc: number | null;
  ap: number | null;
  iou: number | null;
  precision: number | null;
  recall: number | null;
  area_ratio: number | null;
  sim_cells: number;
  obs_cells: number;
}

interface ReplayDetail {
  incident_id: string;
  label: string;
  development_incident: boolean;
  model_labels: Record<string, string>;
  series: Record<string, OverpassRow[]>;
  headline_last_overpass: { last_overpass_k: number; auc: Record<string, number>; ap: Record<string, number>; iou: Record<string, number> };
  source: string;
}

const METRIC_LABELS: Record<string, string> = {
  auc_vs_proximity: 'AUC vs proximity baseline',
  ap_vs_proximity: 'AP vs proximity baseline',
  ap_vs_circle: 'AP vs circle (final-area) baseline',
  iou_vs_proximity: 'IoU@0.5 vs proximity baseline',
  iou_vs_circle: 'IoU@0.5 vs circle (final-area) baseline',
};

export function ReplayPage() {
  const { data: index } = useQuery({ queryKey: ['replay-index'], queryFn: () => rqFetch<ReplayIndex>('/api/redesign/replay') });
  const [incidentId, setIncidentId] = useState<string | null>(null);
  const activeId = incidentId ?? index?.incidents[0]?.incident_id ?? null;
  const { data: detail, isLoading } = useQuery({
    queryKey: ['replay', activeId],
    queryFn: () => rqFetch<ReplayDetail>(`/api/redesign/replay/${activeId}`),
    enabled: !!activeId,
  });

  return (
    <div data-rq-app>
      <StepIndicator current="Replay" />
      <div className="mx-auto max-w-5xl px-5 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-serif text-2xl">Replay / evidence</h1>
          <SampleDataBadge />
        </div>
        <div className="mt-2">
          <TrustBadge level="scenario">Tested against 4 real fires used to build this tool (not held out, not independent)</TrustBadge>
        </div>

        {index && (
          <section className="mt-6 rounded-rq border border-contour bg-sheet p-4">
            <h2 className="font-serif text-lg">Across all 4 incidents, how often did the simulation beat each baseline?</h2>
            <p className="text-xs text-ink-muted">Computed from results/resq5/*/metrics_by_overpass.csv (reference=obs_nh, the protocol's primary reference) at the last overpass of each incident.</p>
            <table className="metrics mt-3 w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-ink-muted">
                  <th className="border-b border-contour py-1.5 pr-3">Metric</th>
                  <th className="border-b border-contour py-1.5">Simulation wins</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(index.cross_incident_win_counts.wins_out_of_4).map(([key, wins]) => (
                  <tr key={key}>
                    <td className="border-b border-contour py-1.5 pr-3">{METRIC_LABELS[key] ?? key}</td>
                    <td className={`border-b border-contour py-1.5 font-semibold ${wins > 0 ? 'text-canopy' : 'text-ink'}`}>{wins} of 4</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {index && (
          <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="Replay incident selector">
            {index.incidents.map((incident) => (
              <button
                key={incident.incident_id}
                role="tab"
                aria-selected={incident.incident_id === activeId}
                onClick={() => setIncidentId(incident.incident_id)}
                className={`rounded-full border px-3 py-1.5 text-sm ${incident.incident_id === activeId ? 'border-canopy bg-canopy text-white' : 'border-contour text-ink-muted'}`}
              >
                {incident.incident_id} · {incident.state}
              </button>
            ))}
          </div>
        )}

        {isLoading && <p className="mt-6 text-sm text-ink-muted">Loading replay evidence…</p>}

        {detail && (
          <section className="mt-6">
            <h2 className="font-serif text-lg">{detail.label}</h2>
            <p className="text-xs text-ink-muted">Development incident used to build the tool, not held out, not independent. Source: {detail.source}.</p>

            <div className="mt-4 overflow-x-auto">
              <table className="metrics w-full border-collapse text-sm">
                <thead>
                  <tr className="text-left text-ink-muted">
                    <th className="border-b border-contour py-1.5 pr-3">Model</th>
                    <th className="border-b border-contour py-1.5 pr-3">AUC (last overpass)</th>
                    <th className="border-b border-contour py-1.5 pr-3">AP (last overpass)</th>
                    <th className="border-b border-contour py-1.5">IoU@0.5 (last overpass)</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(detail.model_labels).map(([model, label]) => (
                    <tr key={model}>
                      <td className="border-b border-contour py-1.5 pr-3">{label}</td>
                      <td className="border-b border-contour py-1.5 pr-3">{detail.headline_last_overpass.auc[model] ?? '—'}</td>
                      <td className="border-b border-contour py-1.5 pr-3">{detail.headline_last_overpass.ap[model] ?? '—'}</td>
                      <td className="border-b border-contour py-1.5">{detail.headline_last_overpass.iou[model] ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div data-testid="baseline-overlay" className="mt-4 rounded-rq border border-dashed border-ink bg-paper p-3 text-sm">
              Baseline outline shown by default: proximity (fire stays near the ignition point) and circle-of-final-area
              (uses information only known after the fact) are both plotted against the observed VIIRS footprint.
            </div>
          </section>
        )}

        <footer className="mt-8 text-xs text-ink-muted">Advisory forecast. Confirm with field observations.</footer>
      </div>
    </div>
  );
}

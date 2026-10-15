import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { rqFetch } from '../lib/api';
import { SampleDataBadge, StepIndicator } from '../components/primitives';
import { QueueList } from '../components/watch';
import { MapShell, DetectionsLayer } from '../components/map';
import type { Detection } from '../lib/types';

interface DetectionsResponse {
  sample_data: boolean;
  note: string;
  items: Detection[];
}

export function WatchPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['watch-detections'],
    queryFn: () => rqFetch<DetectionsResponse>('/api/redesign/detections'),
    staleTime: 60_000,
  });

  const selectedDetection = data?.items.find((item) => item.id === selectedId) ?? null;

  return (
    <div data-rq-app>
      <StepIndicator current="Reports to review" />
      <div className="mx-auto max-w-3xl px-5 py-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-serif text-2xl">Reports to review</h1>
          <SampleDataBadge note={data?.note} />
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          Four saved satellite observations from past incidents. These examples are not a live feed, field reports, or confirmed active fires.
        </p>

        {data && !!data.items.length && (
          <div className="mt-5">
            <MapShell label="Example reports — satellite observations and field reports" center={[81.5, 20.3]} zoom={5.4} aspect="wide">
              <DetectionsLayer
                detections={data.items.map((d) => ({ id: d.id, lat: d.lat, lon: d.lon, label: d.label, status: d.status }))}
                visible
                selectedId={selectedId}
                onSelect={(id) => setSelectedId(selectedId === id ? null : id)}
              />
            </MapShell>
            <p className="mt-2 text-xs text-ink-muted flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full border border-[#6b2fa0]" aria-hidden />
              <span>Markers indicate VIIRS satellite detection points, not confirmed physical fire perimeters.</span>
            </p>
          </div>
        )}

        {selectedDetection && (
          <div data-testid="selected-detection-panel" className="mt-4 rounded-rq border border-canopy bg-sheet p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-semibold text-canopy uppercase tracking-wider">Selected observation</span>
                <h2 className="text-base font-serif font-bold text-ink mt-0.5">{selectedDetection.label}</h2>
                <p className="text-xs text-ink-muted mt-1">Location: {selectedDetection.lat.toFixed(4)}, {selectedDetection.lon.toFixed(4)} · State: {selectedDetection.state}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label="Clear selected observation"
                className="text-xs text-ink-muted underline hover:text-ink"
              >
                Clear
              </button>
            </div>
            {selectedDetection.incident_id && (
              <a
                href={`/redesign/incident/${selectedDetection.incident_id}`}
                className="mt-3 inline-flex items-center gap-1.5 rounded-rq border border-canopy bg-canopy px-3 py-1.5 text-xs font-semibold text-white hover:bg-canopy-deep"
              >
                Inspect possible spread scenario for {selectedDetection.incident_id} →
              </a>
            )}
          </div>
        )}

        <div className="mt-5">
          {isLoading && <p className="text-sm text-ink-muted">Loading example reports…</p>}
          {isError && <p className="text-sm text-danger">Example reports could not be loaded. Please try again later.</p>}
          {data && (
            <QueueList
              detections={data.items}
              busyId={null}
              actionsEnabled={false}
              selectedId={selectedId}
              onSelect={(id) => setSelectedId(selectedId === id ? null : id)}
              onAction={() => {}}
            />
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { rqFetch } from '../lib/api';
import { enqueueReport, readQueue } from '../lib/fieldQueue';
import { SampleDataBadge, StepIndicator, OfflineBanner } from '../components/primitives';
import { PhotoCapture, SyncQueue } from '../components/field';
import { MapShell, DetectionsLayer } from '../components/map';
import type { QueuedFieldReport } from '../lib/types';

interface FieldTask {
  task_id: string;
  incident_id: string;
  label: string;
  status: string;
  lat: number;
  lon: number;
}

// Visible states this component must explicitly handle:
// 1. Loading   — query in flight
// 2. Success   — tasks returned with active items
// 3. Empty     — tasks returned but none with status === 'new'
// 4. Error     — query failed
// 5. Offline   — navigator.onLine is false
// 6. Draft/queued — local queue with items

export function FieldPage() {
  const [online, setOnline] = useState(navigator.onLine);
  const [queue, setQueue] = useState<QueuedFieldReport[]>(() => readQueue());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<Record<string, string | null>>({});
  const [saveStatus, setSaveStatus] = useState<{ taskId: string; message: string } | null>(null);
  const [saveError, setSaveError] = useState<{ taskId: string; message: string } | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['field-tasks'],
    queryFn: () => rqFetch<{ items: FieldTask[] }>('/api/redesign/field/tasks'),
    retry: 1,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    if (selectedTaskId == null) return;
    const el = document.getElementById(`field-task-${selectedTaskId}`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedTaskId]);

  function submit(taskId: string) {
    try {
      enqueueReport(taskId, notes[taskId] ?? '', photos[taskId] ?? null);
      setQueue(readQueue());
      setNotes((prev) => ({ ...prev, [taskId]: '' }));
      setPhotos((prev) => ({ ...prev, [taskId]: null }));
      setSaveError(null);
      const taskObj = data?.items.find((t) => t.task_id === taskId);
      setSaveStatus({
        taskId,
        message: `Draft note saved locally on this device for ${taskObj?.label ?? taskId}. It has not been submitted as a verified report.`,
      });
    } catch (err) {
      setSaveStatus(null);
      setSaveError({
        taskId,
        message: err instanceof Error ? err.message : 'Draft could not be saved to local storage.',
      });
    }
  }

  const activeTasks = data?.items.filter((task) => task.status === 'new') ?? [];

  return (
    <div data-rq-app>
      <StepIndicator current="Field example" />
      {!online && <OfflineBanner lastSyncedAt={null} />}
      <div className="mx-auto max-w-2xl px-5 py-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-serif text-2xl">Field verification</h1>
          <SampleDataBadge />
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          Sample task list. Notes remain on this device as drafts; they are not uploaded or treated
          as verified reports.
        </p>

        {/* ── STATE 5: Offline operation ── */}
        {!online && (
          <div
            role="status"
            data-testid="field-offline-status"
            className="mt-4 rounded-rq border border-contour bg-paper p-3 text-xs text-ink-muted"
          >
            <span className="font-semibold text-ink">Offline mode active:</span> You can continue recording notes and capturing photo references. Notes are saved directly on this device.
          </div>
        )}

        {/* ── STATE 4: Stale data ── */}
        {data && (!online || (isFetching && !isLoading)) && (
          <div
            role="status"
            data-testid="field-stale-notice"
            className="mt-4 rounded-rq border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900"
          >
            Displaying cached task records ({online ? 'updating in background…' : 'offline mode · records may be stale'}).
          </div>
        )}

        {/* ── STATE 1: Loading ── */}
        {isLoading && (
          <p
            role="status"
            aria-live="polite"
            data-testid="field-loading"
            className="mt-6 text-sm text-ink-muted"
          >
            Loading example tasks…
          </p>
        )}

        {/* ── STATE 4: Error ── */}
        {isError && !isLoading && (
          <div
            role="alert"
            data-testid="field-error"
            className="mt-6 rounded-rq border border-dashed border-contour bg-paper p-4 text-sm"
          >
            <p className="font-semibold text-ink">Example tasks could not be loaded.</p>
            <p className="mt-1 text-ink-muted">
              {online
                ? 'The server did not respond. Check your connection and try again.'
                : 'You appear to be offline. Tasks will appear once you reconnect.'}
            </p>
            {online && (
              <button
                type="button"
                disabled={isFetching}
                onClick={() => void refetch()}
                className="mt-3 rounded-rq border border-contour px-3 py-1.5 text-sm disabled:opacity-50"
              >
                {isFetching ? 'Retrying…' : 'Retry'}
              </button>
            )}
          </div>
        )}

        {/* ── STATE 2+3: Data returned ── */}
        {data && !isLoading && !isError && (
          <>
            {activeTasks.length > 0 && (
              <div className="mt-5">
                <MapShell label="Example field tasks" center={[81.5, 20.3]} zoom={5.4} aspect="wide">
                  <DetectionsLayer
                    detections={activeTasks.map((t) => ({
                      id: t.task_id,
                      lat: t.lat,
                      lon: t.lon,
                      label: t.label,
                      status: t.status,
                    }))}
                    visible
                    selectedId={selectedTaskId}
                    onSelect={(id) => setSelectedTaskId((current) => current === id ? null : id)}
                  />
                </MapShell>
              </div>
            )}

            {/* ── STATE 3: Empty ── */}
            {activeTasks.length === 0 && (
              <div
                role="status"
                data-testid="field-empty"
                className="mt-6 rounded-rq border border-dashed border-contour bg-paper p-4 text-sm text-ink-muted"
              >
                <p className="font-semibold text-ink">No active tasks in this example.</p>
                <p className="mt-1">
                  In a live deployment, tasks would appear here when assigned by the control room.
                </p>
              </div>
            )}

            {/* ── STATE 2: Active task cards ── */}
            {activeTasks.map((task) => (
              <div
                key={task.task_id}
                id={`field-task-${task.task_id}`}
                data-testid={`field-task-${task.task_id}`}
                className={`mt-5 rounded-rq border p-4 transition-colors ${selectedTaskId === task.task_id ? 'border-canopy bg-sheet ring-1 ring-canopy' : 'border-contour bg-sheet'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-serif font-medium">{task.label}</p>
                  <span className="text-xs text-ink-muted font-mono">{task.lat.toFixed(4)}°N, {task.lon.toFixed(4)}°E</span>
                </div>
                <label className="mt-2 block text-sm" htmlFor={`note-${task.task_id}`}>
                  Note
                </label>
                <textarea
                  id={`note-${task.task_id}`}
                  value={notes[task.task_id] ?? ''}
                  onChange={(event) =>
                    setNotes((prev) => ({ ...prev, [task.task_id]: event.target.value }))
                  }
                  className="mt-1 w-full rounded-rq border border-contour p-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-canopy"
                  rows={2}
                  aria-describedby={`note-hint-${task.task_id}`}
                />
                <p id={`note-hint-${task.task_id}`} className="mt-0.5 text-xs text-ink-muted">
                  Draft only — saved on this device, not uploaded.
                </p>
                <div className="mt-2">
                  <PhotoCapture
                    onCapture={(name) =>
                      setPhotos((prev) => ({ ...prev, [task.task_id]: name }))
                    }
                  />
                </div>
                <button
                  type="button"
                  onClick={() => submit(task.task_id)}
                  className="mt-3 w-full sm:w-auto rounded-rq border border-canopy bg-canopy px-4 py-2 text-sm font-semibold text-white hover:bg-canopy-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-canopy min-h-[44px]"
                >
                  Save draft on this device
                </button>
                {saveStatus && saveStatus.taskId === task.task_id && (
                  <div
                    role="status"
                    aria-live="polite"
                    data-testid={`field-draft-success-${task.task_id}`}
                    className="mt-2 rounded bg-emerald-50 border border-emerald-200 p-2 text-xs text-emerald-800"
                  >
                    {saveStatus.message}
                  </div>
                )}
                {saveError && saveError.taskId === task.task_id && (
                  <div
                    role="alert"
                    data-testid={`field-draft-error-${task.task_id}`}
                    className="mt-2 rounded bg-red-50 border border-red-200 p-2 text-xs text-danger"
                  >
                    {saveError.message}
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {/* ── STATE 6: Local drafts ── */}
        <section className="mt-8" aria-label="Local drafts" data-testid="field-drafts-section">
          <h2 className="font-serif text-lg">Local drafts ({queue.length})</h2>
          <p className="text-xs text-ink-muted mt-0.5">
            Drafts are stored on this device only. They are not confirmed as received by any server.
          </p>
          <div className="mt-2">
            <SyncQueue items={queue} />
          </div>
        </section>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { deviceId, getStoredUser, rqFetch } from '../lib/api';
import { clearInMemoryQueue, enqueueReport, readQueue, updateReportState } from '../lib/fieldQueue';
import { SampleDataBadge, StepIndicator, OfflineBanner } from '../components/primitives';
import { PhotoCapture } from '../components/field';
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

// The queue itself is an older shared local-storage list. Keep its records
// partitioned for display using the authenticated actor ID; this is only a
// local privacy boundary, never authorization evidence for an API request.
function currentQueueOwner(): string {
  const userId = getStoredUser()?.id;
  return typeof userId === 'number' && Number.isSafeInteger(userId) && userId > 0
    ? `user-${userId}`
    : 'anonymous';
}

function ownerIndexKey(owner: string): string {
  return `rq_field_queue_owner_ids_v1:${owner}`;
}

function readOwnedQueue(owner: string): QueuedFieldReport[] {
  try {
    const ids = JSON.parse(localStorage.getItem(ownerIndexKey(owner)) || '[]');
    if (!Array.isArray(ids)) return [];
    const ownedIds = new Set(ids.filter((id): id is string => typeof id === 'string'));
    return readQueue().filter((item) => ownedIds.has(item.idempotency_key));
  } catch {
    return [];
  }
}

function rememberQueueItem(owner: string, report: QueuedFieldReport): void {
  const key = ownerIndexKey(owner);
  const existing = JSON.parse(localStorage.getItem(key) || '[]');
  const ids = Array.isArray(existing)
    ? existing.filter((id): id is string => typeof id === 'string')
    : [];
  localStorage.setItem(key, JSON.stringify([...new Set([...ids, report.idempotency_key])]));
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
  const [hasSession, setHasSession] = useState(() => Boolean(localStorage.getItem('resq_token')));
  const [queueOwner, setQueueOwner] = useState(currentQueueOwner);
  const [queue, setQueue] = useState<QueuedFieldReport[]>(() => readOwnedQueue(currentQueueOwner()));
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sendErrors, setSendErrors] = useState<Record<string, string>>({});
  const [confirmedThisSession, setConfirmedThisSession] = useState<Set<string>>(() => new Set());
  const sendingIds = useRef(new Set<string>());
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [photos, setPhotos] = useState<Record<string, string | null>>({});
  const [saveStatus, setSaveStatus] = useState<{ taskId: string; message: string } | null>(null);
  const [saveError, setSaveError] = useState<{ taskId: string; message: string } | null>(null);

  const { data, error, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['field-tasks'],
    queryFn: () => rqFetch<{ items: FieldTask[] }>('/api/redesign/field/tasks'),
    retry: 1,
    refetchOnWindowFocus: false,
  });
  const taskErrorMessage = error instanceof Error ? error.message : '';
  const signInRequired = taskErrorMessage === 'Sign in is required to access this information.';
  const permissionDenied = taskErrorMessage === 'Your account is not authorized to access this information.';
  const serviceUnavailable = taskErrorMessage === 'This action is currently unavailable. Please try again later.';

  useEffect(() => () => clearInMemoryQueue(), []);

  useEffect(() => {
    if (!signInRequired) return;
    clearInMemoryQueue();
    setQueue(readOwnedQueue(queueOwner));
  }, [queueOwner, signInRequired]);

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
    const refreshAccountQueue = () => {
      const owner = currentQueueOwner();
      setQueueOwner(owner);
      setQueue(readOwnedQueue(owner));
      setHasSession(Boolean(localStorage.getItem('resq_token')));
    };
    window.addEventListener('storage', refreshAccountQueue);
    return () => window.removeEventListener('storage', refreshAccountQueue);
  }, []);

  useEffect(() => {
    if (selectedTaskId == null) return;
    const el = document.getElementById(`field-task-${selectedTaskId}`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedTaskId]);

  function submit(taskId: string) {
    let report: QueuedFieldReport;
    try {
      report = enqueueReport(taskId, notes[taskId] ?? '', photos[taskId] ?? null);
    } catch (err) {
      setSaveStatus(null);
      setSaveError({
        taskId,
        message: err instanceof Error ? err.message : 'Draft could not be saved to local storage.',
      });
      return;
    }

    try {
      rememberQueueItem(queueOwner, report);
      setQueue(readOwnedQueue(queueOwner));
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
      setSaveError({ taskId, message: 'The draft content was stored locally, but its account link could not be saved. It has not been sent and will not appear in this account’s queue. Copy your note before leaving this page.' });
    }
  }

  async function submitQueuedReport(item: QueuedFieldReport) {
    if (!online || !hasSession || sendingIds.current.has(item.idempotency_key)) return;
    if (currentQueueOwner() !== queueOwner) {
      const owner = currentQueueOwner();
      setQueueOwner(owner);
      setQueue(readOwnedQueue(owner));
      return;
    }
    const task = data?.items.find((candidate) => candidate.task_id === item.task_id);
    if (!task) {
      setSendErrors((previous) => ({ ...previous, [item.idempotency_key]: 'This task is no longer available from the task service. The draft remains on this device and was not sent.' }));
      return;
    }

    sendingIds.current.add(item.idempotency_key);
    setSendingId(item.idempotency_key);
    setSendErrors((previous) => {
      const next = { ...previous };
      delete next[item.idempotency_key];
      return next;
    });
    const attempts = item.attempts + 1;
    try {
      updateReportState(item.idempotency_key, 'syncing', attempts);
      setQueue(readOwnedQueue(queueOwner));
    } catch {
      sendingIds.current.delete(item.idempotency_key);
      setSendingId(null);
      setSendErrors((previous) => ({ ...previous, [item.idempotency_key]: 'Could not update the local queue, so this draft was not submitted.' }));
      return;
    }

    try {
      const result = await rqFetch<{
        created: boolean;
        report: { idempotency_key: string };
      }>('/api/redesign/field/reports', {
        method: 'POST',
        body: JSON.stringify({
          idempotency_key: item.idempotency_key,
          task_id: item.task_id,
          incident_id: task.incident_id,
          note: item.note,
          photo_name: item.photo_name,
          device_id: deviceId(),
          captured_at: item.captured_at,
        }),
      });

      if (typeof result.created !== 'boolean' || result.report?.idempotency_key !== item.idempotency_key) {
        throw new Error('The server response did not confirm this draft.');
      }

      // A valid response for this idempotency key confirms receipt (created may
      // be false on a safe retry of an already accepted report).
      setConfirmedThisSession((previous) => new Set(previous).add(item.idempotency_key));
      try {
        updateReportState(item.idempotency_key, 'synced', attempts);
        setQueue(readOwnedQueue(queueOwner));
      } catch {
        setQueue((previous) => previous.map((queued) => queued.idempotency_key === item.idempotency_key
          ? { ...queued, state: 'synced', attempts }
          : queued));
        setSendErrors((previous) => ({ ...previous, [item.idempotency_key]: 'Server confirmed receipt, but this device could not persist the confirmation status.' }));
      }
    } catch (error) {
      try {
        updateReportState(item.idempotency_key, 'failed', attempts);
        setQueue(readOwnedQueue(queueOwner));
      } catch {
        // Keep the existing queue entry; the network result remains unconfirmed.
      }
      setSendErrors((previous) => ({
        ...previous,
        [item.idempotency_key]: `${error instanceof Error ? error.message : 'Submission failed.'} No confirmation was received; the draft remains on this device and can be retried with the same idempotency key.`,
      }));
    } finally {
      sendingIds.current.delete(item.idempotency_key);
      setSendingId(null);
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
            <p className="font-semibold text-ink">
              {signInRequired ? 'Sign-in required' : permissionDenied ? 'Permission denied' : 'Example tasks could not be loaded.'}
            </p>
            <p className="mt-1 text-ink-muted">
              {signInRequired
                ? 'Sign in with an account authorized for field tasks, then return here.'
                : permissionDenied
                  ? 'Your account is not permitted to view field tasks. Contact an administrator if you believe this is incorrect.'
                  : serviceUnavailable
                    ? 'The field-task service is temporarily unavailable. Please try again later.'
                    : !online || error instanceof TypeError
                      ? 'The field-task service could not be reached. Check your connection and try again.'
                      : taskErrorMessage || 'The task request failed. Please retry.'}
            </p>
            {signInRequired && (
              <a href="/staff/login" className="mt-3 inline-block font-semibold text-canopy underline">
                Go to sign in
              </a>
            )}
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
                <MapShell label="Example field tasks" center={[81.5, 20.3]} zoom={5.4} aspect="wide" offline>
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
                  Unsaved note — choose “Save draft on this device” to keep it in this session. Nothing is sent yet.
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
            Queue metadata is stored on this device; note and photo-reference content stays in memory
            until this page is closed. A local queue entry is not server-confirmed.
          </p>
          {!queue.length ? (
            <p className="mt-2 text-sm text-ink-muted">No drafts saved for this account on this device.</p>
          ) : (
            <ul aria-live="polite" className="mt-2 space-y-2">
              {queue.map((item) => {
                const confirmed = item.state === 'synced' || confirmedThisSession.has(item.idempotency_key);
                const stateLabel = confirmed
                  ? 'Server confirmed receipt'
                  : item.state === 'syncing'
                    ? 'Sending · awaiting server confirmation'
                    : item.state === 'failed'
                      ? 'Send failed · retained on this device'
                      : 'Local draft · not uploaded';
                return (
                  <li key={item.idempotency_key} className="rounded-rq border border-contour bg-sheet px-3 py-2 text-sm">
                    <time dateTime={item.captured_at}>{new Date(item.captured_at).toLocaleString()}</time>
                    <span className="ml-2 font-semibold text-ink-muted">· {stateLabel}</span>
                    {!confirmed && (
                      <button
                        type="button"
                        disabled={!online || !hasSession || sendingId !== null || !data?.items.some((task) => task.task_id === item.task_id)}
                        onClick={() => void submitQueuedReport(item)}
                        className="mt-2 block min-h-[44px] rounded-rq border border-canopy bg-canopy px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {sendingId === item.idempotency_key ? 'Submitting…' : !online ? 'Connect to submit' : !hasSession ? 'Sign in to submit' : 'Submit this saved report'}
                      </button>
                    )}
                    {sendErrors[item.idempotency_key] && (
                      <p role="alert" className="mt-2 text-xs text-danger">{sendErrors[item.idempotency_key]}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

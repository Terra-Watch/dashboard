import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { rqFetch, deviceId } from '../lib/api';
import { enqueueReport, readQueue, updateReportState } from '../lib/fieldQueue';
import { SampleDataBadge, StepIndicator, OfflineBanner } from '../components/primitives';
import { PhotoCapture, SyncQueue } from '../components/field';
import type { QueuedFieldReport } from '../lib/types';

interface FieldTask {
  task_id: string;
  incident_id: string;
  label: string;
  status: string;
}

async function syncOne(report: QueuedFieldReport) {
  updateReportState(report.idempotency_key, 'syncing', report.attempts);
  try {
    await rqFetch('/api/redesign/field/reports', {
      method: 'POST',
      body: JSON.stringify({
        idempotency_key: report.idempotency_key,
        task_id: report.task_id,
        note: report.note,
        photo_name: report.photo_name,
        device_id: deviceId(),
        captured_at: report.captured_at,
      }),
    });
    updateReportState(report.idempotency_key, 'synced', report.attempts + 1);
  } catch {
    updateReportState(report.idempotency_key, 'failed', report.attempts + 1);
  }
}

export function FieldPage() {
  const [online, setOnline] = useState(navigator.onLine);
  const [queue, setQueue] = useState<QueuedFieldReport[]>(() => readQueue());
  const [note, setNote] = useState('');
  const [photoName, setPhotoName] = useState<string | null>(null);

  const { data } = useQuery({ queryKey: ['field-tasks'], queryFn: () => rqFetch<{ items: FieldTask[] }>('/api/redesign/field/tasks') });

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, []);

  useEffect(() => {
    if (!online) return;
    const pending = readQueue().filter((item) => item.state === 'pending' || item.state === 'failed');
    void Promise.all(pending.map(syncOne)).then(() => setQueue(readQueue()));
  }, [online]);

  function submit(taskId: string) {
    enqueueReport(taskId, note, photoName);
    setQueue(readQueue());
    setNote('');
    setPhotoName(null);
    if (online) {
      const [latest] = readQueue().slice(-1);
      if (latest) void syncOne(latest).then(() => setQueue(readQueue()));
    }
  }

  function retry(idempotencyKey: string) {
    const target = readQueue().find((item) => item.idempotency_key === idempotencyKey);
    if (target) void syncOne(target).then(() => setQueue(readQueue()));
  }

  const activeTasks = data?.items.filter((task) => task.status === 'new') ?? [];

  return (
    <div data-rq-app>
      <StepIndicator current="Verified incident" />
      {!online && <OfflineBanner lastSyncedAt={null} />}
      <div className="mx-auto max-w-2xl px-5 py-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-serif text-2xl">Field verification</h1>
          <SampleDataBadge />
        </div>
        <p className="mt-1 text-sm text-ink-muted">Verify assigned detections from the ground. Reports queue and sync automatically when you have signal.</p>

        {activeTasks.map((task) => (
          <div key={task.task_id} className="mt-5 rounded-rq border border-contour bg-sheet p-4">
            <p className="font-serif">{task.label}</p>
            <label className="mt-2 block text-sm" htmlFor={`note-${task.task_id}`}>Note</label>
            <textarea
              id={`note-${task.task_id}`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="mt-1 w-full rounded-rq border border-contour p-2 text-sm"
              rows={2}
            />
            <div className="mt-2">
              <PhotoCapture onCapture={setPhotoName} />
            </div>
            <button
              onClick={() => submit(task.task_id)}
              className="mt-3 rounded-rq border border-canopy bg-canopy px-4 py-2 text-sm font-semibold text-white hover:bg-canopy-deep"
            >
              Submit verification
            </button>
          </div>
        ))}

        <section className="mt-8">
          <h2 className="font-serif text-lg">Sync queue</h2>
          <div className="mt-2">
            <SyncQueue items={queue} onRetry={retry} />
          </div>
        </section>
      </div>
    </div>
  );
}

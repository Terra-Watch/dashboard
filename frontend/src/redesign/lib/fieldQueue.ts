import type { QueuedFieldReport, SyncState } from './types';

const KEY = 'rq_field_queue';

export function readQueue(): QueuedFieldReport[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]') as QueuedFieldReport[];
  } catch {
    return [];
  }
}

function writeQueue(items: QueuedFieldReport[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
}

export function enqueueReport(taskId: string, note: string, photoName: string | null): QueuedFieldReport {
  const report: QueuedFieldReport = {
    idempotency_key: crypto.randomUUID(),
    task_id: taskId,
    note,
    photo_name: photoName,
    captured_at: new Date().toISOString(),
    state: 'pending',
    attempts: 0,
  };
  writeQueue([...readQueue(), report]);
  return report;
}

export function updateReportState(idempotencyKey: string, state: SyncState, attempts?: number) {
  writeQueue(
    readQueue().map((item) =>
      item.idempotency_key === idempotencyKey ? { ...item, state, attempts: attempts ?? item.attempts } : item
    )
  );
}

export function removeSynced() {
  writeQueue(readQueue().filter((item) => item.state !== 'synced'));
}

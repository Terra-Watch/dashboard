import type { QueuedFieldReport, SyncState } from './types';

const KEY = 'rq_field_queue';

let memoryQueue: QueuedFieldReport[] | null = null;

export function clearInMemoryQueue(): void {
  memoryQueue = null;
}

function metadataOnly(items: QueuedFieldReport[]): QueuedFieldReport[] {
  return items.map((item) => ({ ...item, note: '', photo_name: null }));
}

export function readQueue(): QueuedFieldReport[] {
  if (memoryQueue) return memoryQueue;
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || '[]') as QueuedFieldReport[];
    memoryQueue = metadataOnly(Array.isArray(stored) ? stored : []);
    // Migrate older queue entries that may have persisted note/photo content.
    localStorage.setItem(KEY, JSON.stringify(memoryQueue));
    return memoryQueue;
  } catch {
    memoryQueue = [];
    return memoryQueue;
  }
}

function writeQueue(items: QueuedFieldReport[]) {
  memoryQueue = items;
  localStorage.setItem(KEY, JSON.stringify(metadataOnly(items)));
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
  // Keep report content in memory for this session only. localStorage receives
  // queue metadata, never notes or photo references.
  memoryQueue = [...readQueue(), report];
  writeQueue(memoryQueue);
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

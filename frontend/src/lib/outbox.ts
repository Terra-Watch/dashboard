import { ApiError, OfflineError, api } from '../app/http';
import { authenticatedActorId } from './offlineQueue';
import { shrinkPhoto } from './photo';

/** A report and its photos, kept on the phone until both have reached the server. The same client key makes every retry safe: the server returns the original report. */
type Kind = 'citizen' | 'ranger';
type Item = { key: string; owner: string | null; kind: Kind; report: Record<string, unknown>; photos: Blob[]; reportId?: number; created: number };
export type Outcome = { id: number; photosTotal: number; photosLeft: number; photosRejected: number };
export type Progress = { step: 'saved' | 'sending' | 'photo'; photo?: number; of?: number };

const KINDS: Record<Kind, { reportPath: string; evidencePath: (id: number) => string; idOf: (response: never) => number }> = {
  citizen: { reportPath: '/api/citizen/reports', evidencePath: id => `/api/citizen/reports/${id}/evidence`, idOf: (r: { report: { id: number } }) => r.report.id },
  ranger: { reportPath: '/api/ranger/reports', evidencePath: id => `/api/ranger/reports/${id}/evidence`, idOf: (r: { id: number }) => r.id },
};
const DB = 'tw_outbox';
const STORE = 'items';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const request = work(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => { resolve(request.result); db.close(); };
    request.onerror = () => { reject(request.error); db.close(); };
  });
}
const put = (item: Item) => run('readwrite', s => s.put(item));
const remove = (key: string) => run('readwrite', s => s.delete(key));
const all = () => run<Item[]>('readonly', s => s.getAll());
export const outboxCount = async (): Promise<number> => (await all().catch(() => [])).length;

/** Worth another try later: no signal, a busy server, or rate limiting. Anything else (a refusal) will never succeed. */
export const retryable = (reason: unknown): boolean =>
  reason instanceof OfflineError || (reason instanceof ApiError && (reason.status >= 500 || reason.status === 429));

async function uploadWithRetry(path: string, photo: Blob): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try { const form = new FormData(); form.append('image', photo, 'photo.jpg'); await api(path, { method: 'POST', form }); return; }
    catch (reason) { if (attempt >= 2 || !retryable(reason)) throw reason; await new Promise(r => setTimeout(r, 800 * (attempt + 1))); }
  }
}

/** Send what is left of one item. Throws only if the report itself could not be created. */
async function send(item: Item, onProgress?: (p: Progress) => void): Promise<Outcome> {
  const kind = KINDS[item.kind];
  onProgress?.({ step: 'sending' });
  try {
    if (item.reportId === undefined) { item.reportId = kind.idOf(await api(kind.reportPath, { method: 'POST', json: item.report }) as never); await put(item); }
  } catch (reason) { if (!retryable(reason)) await remove(item.key); throw reason; }
  const left: Blob[] = []; let rejected = 0;
  for (const [index, photo] of item.photos.entries()) {
    onProgress?.({ step: 'photo', photo: index + 1, of: item.photos.length });
    try { await uploadWithRetry(kind.evidencePath(item.reportId), photo); }
    catch (reason) { if (retryable(reason)) left.push(photo); else rejected += 1; }
  }
  if (left.length) await put({ ...item, photos: left }); else await remove(item.key);
  return { id: item.reportId, photosTotal: item.photos.length, photosLeft: left.length, photosRejected: rejected };
}

/** Save the report and its (shrunk) photos on the phone first, then try to send. If there is no signal it stays saved and goes later; the caller sees the OfflineError. */
export async function submitReport(kind: Kind, report: Record<string, unknown> & { client_key: string }, files: File[], onProgress?: (p: Progress) => void): Promise<Outcome> {
  const photos = await Promise.all(files.map(shrinkPhoto));
  const item: Item = { key: report.client_key, owner: authenticatedActorId(), kind, report, photos, created: Date.now() };
  try { await put(item); } catch { /* storage refused (private window): send straight away without a saved copy */ }
  onProgress?.({ step: 'saved' });
  return send(item, onProgress);
}

/** Retry everything saved by the signed-in account. Called when the app opens and when the connection returns. */
export async function flushOutbox(): Promise<void> {
  const actor = authenticatedActorId();
  if (!actor) return;
  for (const item of await all().catch(() => [] as Item[])) {
    if (item.owner !== actor) continue;
    try { await send(item); } catch { /* stays saved */ }
  }
}

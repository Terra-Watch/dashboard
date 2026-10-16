import { Download, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/Button';
import { Notice } from '../../ui/Notice';

const MAP_CACHE = 'tw-map-v1';
const ARCHIVE = '/tiles/resq-basemap.pmtiles';
const STAMP_KEY = 'tw.map.saved';
type Saved = { at: string; bytes: number } | null;

const readStamp = (): Saved => { try { const raw = localStorage.getItem(STAMP_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; } };
const writeStamp = (value: Saved) => { try { if (value) localStorage.setItem(STAMP_KEY, JSON.stringify(value)); else localStorage.removeItem(STAMP_KEY); } catch { /* storage may be blocked */ } };
const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(bytes > 99_000_000 ? 0 : 1)} MB`;

/** Keeps the whole regional basemap on the phone so the map works with no network. The service worker answers map requests from this copy. */
export function OfflineMapControl() {
  const { t } = useTranslation();
  const [saved, setSaved] = useState<Saved>(readStamp);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [problem, setProblem] = useState('');
  const supported = typeof caches !== 'undefined' && 'serviceWorker' in navigator;

  useEffect(() => {
    if (!supported || !saved) return;
    void caches.open(MAP_CACHE).then(cache => cache.match(ARCHIVE)).then(hit => { if (!hit) { writeStamp(null); setSaved(null); } }).catch(() => undefined);
  }, [supported, saved]);

  const save = useCallback(async () => {
    setProblem(''); setProgress({ done: 0, total: 0 });
    try {
      // Bypass the worker's saved copy so the download is always fresh.
      const response = await fetch(ARCHIVE, { cache: 'no-store', headers: { 'X-Tw-Refresh': '1' } });
      if (!response.ok || !response.body) throw new Error(String(response.status));
      const total = Number(response.headers.get('content-length')) || 0;
      const reader = response.body.getReader();
      const parts: BlobPart[] = [];
      let done = 0;
      for (;;) {
        const { value, done: finished } = await reader.read();
        if (finished) break;
        parts.push(value as BlobPart); done += value.byteLength; setProgress({ done, total });
      }
      const blob = new Blob(parts, { type: 'application/octet-stream' });
      const cache = await caches.open(MAP_CACHE);
      await cache.put(ARCHIVE, new Response(blob, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(blob.size) } }));
      // Keep the map code itself ready too, or the saved map could not be drawn the next time the phone is offline.
      try { await import('../map/MapView'); const worker = (await import('maplibre-gl/dist/maplibre-gl-worker.mjs?url')).default; await fetch(worker); } catch { /* the map still works online */ }
      const stamp = { at: new Date().toISOString(), bytes: blob.size };
      writeStamp(stamp); setSaved(stamp);
    } catch {
      setProblem(t('field.offline.failed', 'The map could not be saved. Check the connection and storage space, then try again.'));
    } finally { setProgress(null); }
  }, [t]);

  const remove = useCallback(async () => {
    try { await caches.delete(MAP_CACHE); } catch { /* ignore */ }
    writeStamp(null); setSaved(null);
  }, []);

  if (!supported) return <Notice kind="warning">{t('field.offline.unsupported', 'This browser cannot keep a map for offline use.')}</Notice>;
  const percent = progress && progress.total ? Math.round((progress.done / progress.total) * 100) : null;
  return (
    <section aria-labelledby="offline-map" className="space-y-2 rounded-rq border border-line bg-surface p-3">
      <h2 id="offline-map" className="font-bold">{t('field.offline.title', 'Map on this phone')}</h2>
      <p className="text-sm text-ink-muted">
        {saved
          ? t('field.offline.saved', 'Saved {{when}} · {{size}}. The map works without a network.', { when: new Date(saved.at).toLocaleString(), size: megabytes(saved.bytes) })
          : t('field.offline.not_saved', 'Not saved. Save it on Wi-Fi before going out of coverage; the file is about 37 MB.')}
      </p>
      {progress && (
        <div>
          <progress className="w-full" max={progress.total || undefined} value={progress.total ? progress.done : undefined} aria-label={t('field.offline.progress', 'Saving the map')} />
          <p className="text-sm" role="status">{percent !== null ? `${percent}%` : megabytes(progress.done)}</p>
        </div>
      )}
      {problem && <Notice kind="danger">{problem}</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={save} loading={!!progress} icon={<Download aria-hidden="true" size={18} />}>{saved ? t('field.offline.update', 'Update saved map') : t('field.offline.save', 'Save map for offline')}</Button>
        {saved && <Button variant="ghost" onClick={remove} icon={<Trash2 aria-hidden="true" size={18} />}>{t('field.offline.remove', 'Remove saved map')}</Button>}
      </div>
    </section>
  );
}

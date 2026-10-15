import { useRef, useState } from 'react';
import type { QueuedFieldReport } from '../lib/types';
import { Button } from './primitives';

export function EvidenceAssessmentStatus({ fileName }: { fileName: string }) {
  return (
    <div
      role="region"
      aria-label="Fire evidence assessment status"
      data-testid="evidence-assessment-status"
      className="mt-2 rounded border border-contour bg-paper p-3 text-xs"
    >
      <div className="flex items-center justify-between gap-2 border-b border-contour pb-1.5 mb-2">
        <span className="font-semibold text-ink">Fire Evidence Assessor</span>
        <span className="rounded bg-sheet border border-contour px-1.5 py-0.5 text-[11px] text-ink-muted">
          Service unavailable (not connected)
        </span>
      </div>
      <p className="text-ink-muted mb-2">
        Evidence file: <span className="font-mono text-ink">{fileName}</span>
      </p>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-ink-muted">
        <div>
          <dt className="inline font-medium text-ink">Fire / smoke assessment: </dt>
          <dd className="inline italic">Unavailable</dd>
        </div>
        <div>
          <dt className="inline font-medium text-ink">AI generation check: </dt>
          <dd className="inline italic">Unavailable</dd>
        </div>
        <div>
          <dt className="inline font-medium text-ink">Image manipulation check: </dt>
          <dd className="inline italic">Unavailable</dd>
        </div>
        <div>
          <dt className="inline font-medium text-ink">Duplicate detection: </dt>
          <dd className="inline italic">Unavailable</dd>
        </div>
      </dl>
      <div className="mt-2 pt-1.5 border-t border-contour text-ink-muted">
        <p><strong>Human review:</strong> Field photos require inspection and manual confirmation by range officer or control room supervisor upon report transmission.</p>
      </div>
    </div>
  );
}

export function PhotoCapture({ onCapture }: { onCapture: (fileName: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [captured, setCaptured] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        aria-label="Capture a photo of the fire"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) { setError('No photo was captured. Check camera access and try again.'); return; }
          setError(null);
          setCaptured(file.name);
          onCapture(file.name);
        }}
      />
      <Button variant="secondary" onClick={() => inputRef.current?.click()}>
        {captured ? 'Retake photo' : 'Capture photo'}
      </Button>
      {captured && (
        <>
          <p className="mt-1 text-sm text-ink-muted" role="status">Photo selected: {captured}. Only its filename is saved; the image is not uploaded or retained.</p>
          <EvidenceAssessmentStatus fileName={captured} />
        </>
      )}
      {error && <p className="mt-1 text-sm text-danger" role="alert">{error}</p>}
    </div>
  );
}

export function SyncQueue({ items }: { items: QueuedFieldReport[] }) {
  if (!items.length) return <p className="text-sm text-ink-muted">No local drafts saved.</p>;
  return (
    <ul aria-live="polite" className="space-y-2">
      {items.map((item) => (
        <li key={item.idempotency_key} className="flex items-center justify-between rounded-rq border border-contour bg-sheet px-3 py-2 text-sm">
          <span>
            {new Date(item.captured_at).toLocaleTimeString()} ·{' '}
              <span className="font-semibold text-ink-muted">
              Local draft · not uploaded
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

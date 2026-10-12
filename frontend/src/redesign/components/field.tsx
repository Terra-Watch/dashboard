import { useRef, useState } from 'react';
import type { QueuedFieldReport } from '../lib/types';
import { Button } from './primitives';

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
      {captured && <p className="mt-1 text-sm text-ink-muted" role="status">Photo captured: {captured}. Will upload when syncing.</p>}
      {error && <p className="mt-1 text-sm text-danger" role="alert">{error}</p>}
    </div>
  );
}

const STATE_LABEL: Record<string, string> = { pending: 'Pending', syncing: 'Syncing…', synced: 'Synced', failed: 'Failed' };

export function SyncQueue({ items, onRetry }: { items: QueuedFieldReport[]; onRetry: (idempotencyKey: string) => void }) {
  if (!items.length) return <p className="text-sm text-ink-muted">Nothing queued.</p>;
  return (
    <ul aria-live="polite" className="space-y-2">
      {items.map((item) => (
        <li key={item.idempotency_key} className="flex items-center justify-between rounded-rq border border-contour bg-sheet px-3 py-2 text-sm">
          <span>
            {new Date(item.captured_at).toLocaleTimeString()} ·{' '}
            <span className={item.state === 'failed' ? 'font-semibold text-danger' : item.state === 'synced' ? 'font-semibold text-canopy' : 'text-ink-muted'}>
              {STATE_LABEL[item.state]}
            </span>
            {item.attempts > 0 && <span className="text-ink-muted"> (attempt {item.attempts})</span>}
          </span>
          {item.state === 'failed' && (
            <Button variant="secondary" onClick={() => onRetry(item.idempotency_key)} aria-label={`Retry report captured at ${new Date(item.captured_at).toLocaleTimeString()}`}>
              Retry
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

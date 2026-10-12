import type { Detection } from '../lib/types';
import { Button } from './primitives';

export function DetectionCard({ detection, onAction, busy }: { detection: Detection; onAction: (action: 'verify' | 'dismiss' | 'escalate') => void; busy: boolean }) {
  const verified = detection.status === 'verify';
  return (
    <article className="rounded-rq border border-contour bg-sheet p-4" aria-label={`Detection ${detection.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-serif text-base">{detection.label}</p>
          <p className="text-sm text-ink-muted">{detection.source} · {detection.state} · detected {new Date(detection.detected_at).toLocaleString()}</p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${
            verified ? 'border-canopy-deep bg-canopy-deep text-white' : 'border-ink-muted text-ink-muted'
          }`}
        >
          {verified ? 'Verified' : detection.status === 'dismiss' ? 'Dismissed' : detection.status === 'escalate' ? 'Escalated' : 'Not yet verified'}
        </span>
      </div>
      <VerifyActions onAction={onAction} disabled={busy || detection.status !== 'new'} />
    </article>
  );
}

export function VerifyActions({ onAction, disabled }: { onAction: (action: 'verify' | 'dismiss' | 'escalate') => void; disabled: boolean }) {
  return (
    <div className="mt-3 flex gap-2" role="group" aria-label="Triage actions">
      <Button variant="primary" disabled={disabled} onClick={() => onAction('verify')}>Verify</Button>
      <Button variant="secondary" disabled={disabled} onClick={() => onAction('dismiss')}>Dismiss</Button>
      <Button variant="danger" disabled={disabled} onClick={() => onAction('escalate')}>Escalate</Button>
    </div>
  );
}

export function QueueList({ detections, onAction, busyId }: { detections: Detection[]; onAction: (id: string, action: 'verify' | 'dismiss' | 'escalate') => void; busyId: string | null }) {
  if (!detections.length) return <p className="text-sm text-ink-muted">No detections in the sample queue.</p>;
  return (
    <div className="space-y-3">
      {detections.map((detection) => (
        <DetectionCard key={detection.id} detection={detection} busy={busyId === detection.id} onAction={(action) => onAction(detection.id, action)} />
      ))}
    </div>
  );
}

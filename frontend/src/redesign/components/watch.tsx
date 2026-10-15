import type { Detection } from '../lib/types';
import { Button } from './primitives';

export function DetectionCard({
  detection,
  onAction,
  busy,
  actionsEnabled = true,
  selected = false,
  onSelectCard,
}: {
  detection: Detection;
  onAction: (action: 'verify' | 'dismiss' | 'escalate') => void;
  busy: boolean;
  actionsEnabled?: boolean;
  selected?: boolean;
  onSelectCard?: () => void;
}) {
  const verified = detection.status === 'verify';
  const source = detection.source === 'VIIRS' ? 'Satellite observation' : 'Field report';
  return (
    <article
      onClick={onSelectCard}
      className={`rounded-rq border p-4 transition-colors cursor-pointer ${
        selected ? 'border-canopy bg-paper ring-1 ring-canopy' : 'border-contour bg-sheet hover:bg-paper'
      }`}
      aria-label={`Detection ${detection.id}`}
      data-selected={selected || undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-serif text-base font-medium">{detection.label}</p>
          <p className="text-sm text-ink-muted">{source} · {detection.state} · received {new Date(detection.detected_at).toLocaleString()}</p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${
            verified ? 'border-canopy-deep bg-canopy-deep text-white' : 'border-ink-muted text-ink-muted'
          }`}
        >
          {verified ? 'Verified' : detection.status === 'dismiss' ? 'Dismissed' : detection.status === 'escalate' ? 'Escalated' : 'Not yet verified'}
        </span>
      </div>
      {actionsEnabled
        ? <VerifyActions onAction={onAction} disabled={busy || detection.status !== 'new'} />
        : <p className="mt-3 text-sm text-ink-muted">This is an example list. Reviewing or changing these reports is not available.</p>}
    </article>
  );
}

export function VerifyActions({ onAction, disabled }: { onAction: (action: 'verify' | 'dismiss' | 'escalate') => void; disabled: boolean }) {
  return (
    <div className="mt-3 flex gap-2" role="group" aria-label="Report review actions">
      <Button variant="primary" disabled={disabled} onClick={() => onAction('verify')}>Verify</Button>
      <Button variant="secondary" disabled={disabled} onClick={() => onAction('dismiss')}>Dismiss</Button>
      <Button variant="danger" disabled={disabled} onClick={() => onAction('escalate')}>Escalate</Button>
    </div>
  );
}

export function QueueList({
  detections,
  onAction,
  busyId,
  actionsEnabled = true,
  selectedId,
  onSelect,
}: {
  detections: Detection[];
  onAction: (id: string, action: 'verify' | 'dismiss' | 'escalate') => void;
  busyId: string | null;
  actionsEnabled?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  if (!detections.length) return <p className="text-sm text-ink-muted">There are no example reports to review.</p>;
  return (
    <div className="space-y-3">
      {detections.map((detection) => (
        <DetectionCard
          key={detection.id}
          detection={detection}
          busy={busyId === detection.id}
          actionsEnabled={actionsEnabled}
          selected={selectedId === detection.id}
          onSelectCard={() => onSelect?.(detection.id)}
          onAction={(action) => onAction(detection.id, action)}
        />
      ))}
    </div>
  );
}

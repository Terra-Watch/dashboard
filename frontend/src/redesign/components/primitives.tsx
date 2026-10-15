import type { ReactNode } from 'react';
import type { TrustLevel } from '../lib/types';

/** TrustBadge — docs/redesign/08_design_system.md. Non-dismissible on scenario/replay screens (09_trust_rules.md). */
export function TrustBadge({ level, children }: { level: TrustLevel; children: ReactNode }) {
  const color: Record<TrustLevel, string> = {
    forecast: 'border-canopy text-canopy',
    detection: 'border-info text-info',
    verified: 'border-canopy-deep text-canopy-deep',
    scenario: 'border-warn text-warn',
  };
  return (
    <span
      role="note"
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${color[level]}`}
    >
      {children}
    </span>
  );
}

/** Identifies example information without exposing acquisition or implementation details. */
export function SampleDataBadge({ note }: { note?: string }) {
  return (
    <span
      data-testid="sample-data-badge"
      role="note"
      className="inline-flex items-center gap-1.5 rounded-full border border-ink-muted px-2.5 py-1 text-xs font-semibold text-ink-muted"
      title={note ?? 'Example information from past events, not a live feed.'}
    >
      Demo data
    </span>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return <span className="inline-block rounded-full border border-contour bg-paper px-2.5 py-1 text-xs text-ink-muted">{children}</span>;
}

/** StepIndicator — which of the three steps a screen belongs to. */
const STEPS = ['Historical ranking', 'Reports to review', 'Possible spread', 'Field example'] as const;
export function StepIndicator({ current }: { current: typeof STEPS[number] }) {
  return (
    <ol aria-label="Workflow steps" className="flex gap-2 border-b border-contour bg-sheet px-5 py-2.5 text-[13px] text-ink-muted">
      {STEPS.map((step) => (
        <li key={step} aria-current={step === current ? 'step' : undefined} className={step === current ? 'font-bold text-ink' : ''}>
          {step}
        </li>
      ))}
    </ol>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-rq border border-dashed border-contour bg-sheet p-8 text-center text-ink-muted">
      <p className="font-serif text-base text-ink">{title}</p>
      <p className="mt-1 text-sm">{body}</p>
    </div>
  );
}

export function OfflineBanner({ lastSyncedAt }: { lastSyncedAt: string | null }) {
  return (
    <div role="status" className="bg-warn/10 border-b border-warn px-5 py-2 text-sm text-warn">
      You are offline. {lastSyncedAt ? `Showing information saved at ${lastSyncedAt}.` : 'No saved information is available on this device.'} Changes will be sent when you reconnect.
    </div>
  );
}

export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div role="status" className="fixed bottom-4 right-4 z-50 rounded-rq bg-ink px-4 py-2.5 text-sm text-sheet shadow-lg">
      {message}
      <button onClick={onClose} aria-label="Dismiss" className="ml-3 underline">Dismiss</button>
    </div>
  );
}

export function Dialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="max-w-md rounded-rq bg-sheet p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-lg">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-ink-muted">×</button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

export function Button({ variant = 'primary', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  const styles = {
    primary: 'bg-canopy text-white border-canopy hover:bg-canopy-deep',
    secondary: 'bg-transparent text-canopy border-canopy hover:bg-canopy/10',
    danger: 'bg-transparent text-danger border-danger hover:bg-danger/10',
  }[variant];
  return (
    <button
      {...props}
      className={`rounded-rq border px-4 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-canopy disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${props.className ?? ''}`}
    />
  );
}

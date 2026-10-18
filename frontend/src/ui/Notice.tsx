import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';

type Kind = 'info' | 'success' | 'warning' | 'danger';
const KINDS: Record<Kind, { box: string; Icon: typeof Info; role: 'status' | 'alert' }> = {
  info: { box: 'border-focus/30 bg-surface-2 text-ink', Icon: Info, role: 'status' },
  success: { box: 'border-ok/30 bg-ok-tint text-ink', Icon: CheckCircle2, role: 'status' },
  warning: { box: 'border-warn/35 bg-warn-tint text-ink', Icon: AlertTriangle, role: 'alert' },
  danger: { box: 'border-danger/35 bg-danger-tint text-ink', Icon: XCircle, role: 'alert' },
};

/** A message with an icon and words, so its meaning never depends on colour. */
export function Notice({ kind = 'info', title, children, className = '' }: { kind?: Kind; title?: string; children?: ReactNode; className?: string }) {
  const { box, Icon, role } = KINDS[kind];
  return (
    <div role={role} className={`flex gap-3 rounded-lg border p-3 ${box} ${className}`}>
      <Icon aria-hidden="true" size={20} strokeWidth={1.75} className="mt-0.5 shrink-0" />
      <div className="min-w-0 text-sm">{title && <p className="font-semibold">{title}</p>}{children}</div>
    </div>
  );
}

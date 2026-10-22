import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';

type Kind = 'info' | 'success' | 'warning' | 'danger';
const KINDS: Record<Kind, { box: string; disc: string; Icon: typeof Info; role: 'status' | 'alert' }> = {
  info: { box: 'bg-surface-2', disc: 'bg-action text-on-action', Icon: Info, role: 'status' },
  success: { box: 'bg-ok-tint', disc: 'bg-ok text-on-action', Icon: CheckCircle2, role: 'status' },
  warning: { box: 'bg-warn-tint', disc: 'bg-warn text-on-action', Icon: AlertTriangle, role: 'alert' },
  danger: { box: 'bg-danger-tint', disc: 'bg-danger text-on-action', Icon: XCircle, role: 'alert' },
};

/** A message with an icon and words, so its meaning never depends on colour: a flat tinted block with a filled icon disc and no outline. */
export function Notice({ kind = 'info', title, children, className = '' }: { kind?: Kind; title?: string; children?: ReactNode; className?: string }) {
  const { box, disc, Icon, role } = KINDS[kind];
  return (
    <div role={role} className={`flex items-start gap-3 rounded-2xl px-4 py-3.5 text-ink ${box} ${className}`}>
      <span className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ${disc}`}><Icon aria-hidden="true" size={16} strokeWidth={2.25} /></span>
      <div className="min-w-0 text-base leading-snug">{title && <p className="font-bold">{title}</p>}{children}</div>
    </div>
  );
}

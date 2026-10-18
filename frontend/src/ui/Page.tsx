import type { ReactNode } from 'react';

export function PageTitle({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0"><h1 className="text-[clamp(1.75rem,3vw,2.25rem)] leading-tight tracking-tight">{title}</h1>{subtitle && <p className="mt-1 max-w-2xl text-ink-muted">{subtitle}</p>}</div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, children, className = '', headingLevel = 2 }: { title?: string; children: ReactNode; className?: string; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section className={`rounded-xl border border-line/80 bg-surface p-4 shadow-[0_1px_2px_rgb(15_23_42/0.04)] sm:p-5 ${className}`}>
      {title && <Heading className="mb-3 text-xl">{title}</Heading>}
      {children}
    </section>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-control bg-surface p-6 text-center shadow-[0_1px_2px_rgb(15_23_42/0.03)]">
      <p className="text-lg font-bold">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-ink-muted">{children}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function LoadError({ message, onRetry, retryLabel = 'Try again' }: { message: string; onRetry?: () => void; retryLabel?: string }) {
  return <div role="alert" className="rounded-lg border border-danger/40 bg-danger-tint p-4 text-ink"><p className="font-medium">{message}</p>{onRetry && <button type="button" onClick={onRetry} className="mt-2 min-h-11 font-semibold text-danger underline underline-offset-4">{retryLabel}</button>}</div>;
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return <div role="status" aria-busy="true" aria-label="Loading" className="space-y-2">{Array.from({ length: lines }, (_, index) => <div key={index} className="h-5 animate-pulse rounded bg-surface-2" style={{ width: `${90 - index * 12}%` }} />)}</div>;
}

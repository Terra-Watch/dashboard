import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

type Common = { label: string; hint?: ReactNode; error?: string | null; action?: ReactNode };
const CONTROL = 'mt-1 block w-full min-h-12 rounded-rq border bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-2';

function Wrapper({ id, label, hint, error, action, children }: Common & { id: string; children: ReactNode }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-semibold text-ink">{label}</label>
        {action}
      </div>
      {children}
      {hint && <p id={`${id}-hint`} className="mt-1 text-sm text-ink-muted">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="mt-1 text-sm font-semibold text-danger">{error}</p>}
    </div>
  );
}
const describedBy = (id: string, hint: unknown, error: unknown) => [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;

export function TextField({ label, hint, error, action, className = '', ...rest }: Common & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <Wrapper id={id} label={label} hint={hint} error={error} action={action}>
      <input id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} className={`${CONTROL} ${error ? 'border-danger' : 'border-control'} ${className}`} {...rest} />
    </Wrapper>
  );
}

export function TextArea({ label, hint, error, action, className = '', ...rest }: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <Wrapper id={id} label={label} hint={hint} error={error} action={action}>
      <textarea id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} className={`${CONTROL} ${error ? 'border-danger' : 'border-control'} ${className}`} {...rest} />
    </Wrapper>
  );
}

export function SelectField({ label, hint, error, action, className = '', children, ...rest }: Common & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <Wrapper id={id} label={label} hint={hint} error={error} action={action}>
      <select id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, hint, error)} className={`${CONTROL} ${error ? 'border-danger' : 'border-control'} ${className}`} {...rest}>{children}</select>
    </Wrapper>
  );
}

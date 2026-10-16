import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
const STYLE: Record<Variant, string> = {
  primary: 'bg-action text-on-action border-action hover:bg-action-strong',
  secondary: 'bg-surface text-ink border-control hover:bg-surface-2',
  danger: 'bg-danger text-surface border-danger hover:opacity-90',
  ghost: 'bg-transparent text-action border-transparent hover:bg-action-tint',
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; icon?: ReactNode; block?: boolean };

export function Button({ variant = 'primary', loading = false, icon, block = false, className = '', children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} disabled={disabled || loading} aria-busy={loading || undefined}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-rq border px-4 py-2 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${block ? 'w-full' : ''} ${STYLE[variant]} ${className}`} {...rest}>
      {loading ? <Loader2 aria-hidden="true" className="animate-spin" size={18} /> : icon}
      {children}
    </button>
  );
}

'use client';

import { cn } from '@/lib/utils';
import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size    = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const base =
  'inline-flex items-center justify-center gap-2 font-medium tracking-wide transition-all duration-300 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-cyan)] disabled:pointer-events-none disabled:opacity-40';

const variants: Record<Variant, string> = {
  primary:
    'bg-[var(--c-cyan)] text-[var(--c-navy)] hover:bg-white hover:shadow-[0_0_20px_rgba(0,200,220,0.4)] active:scale-[0.98] rounded-full font-semibold px-6 py-2.5',
  secondary:
    'glass border border-[rgba(255,255,255,0.15)] text-[var(--c-white)] hover:border-[var(--c-cyan)] hover:text-[var(--c-cyan)] hover:bg-[rgba(0,200,220,0.1)] rounded-full px-6 py-2.5',
  ghost:
    'text-[var(--c-dim)] hover:text-[var(--c-white)] underline-offset-4 hover:underline',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-5 text-sm',
  md: 'h-11 px-7 text-sm',
  lg: 'h-13 px-9 text-base',
};

export function Button({
  variant = 'primary',
  size = 'md',
  type = 'button',
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {children}
    </button>
  );
}

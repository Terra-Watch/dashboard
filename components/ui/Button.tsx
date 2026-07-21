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
  'inline-flex items-center justify-center gap-2 font-medium tracking-wide transition-all duration-300 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-cyan)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--c-navy)] disabled:pointer-events-none disabled:opacity-40';

const variants: Record<Variant, string> = {
  primary:
    'bg-[var(--c-cyan)] text-[var(--c-navy)] hover:bg-white hover:scale-[1.03] active:scale-[0.98] rounded-full font-semibold shadow-[0_0_24px_rgba(0,200,220,0.25)]',
  secondary:
    'border border-[var(--c-cyan-border)] text-[var(--c-white)] hover:border-[var(--c-cyan)] hover:text-[var(--c-cyan)] hover:bg-[var(--c-cyan-glow)] rounded-full',
  ghost:
    'text-[var(--c-dim)] hover:text-[var(--c-white)] underline-offset-4 hover:underline',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-5 text-sm',
  md: 'h-11 px-7 text-sm',
  lg: 'h-14 px-10 text-base',
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

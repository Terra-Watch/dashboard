'use client';

/**
 * components/ui/Button.tsx
 *
 * Premium Pill Button Component.
 * Fixes tight text-to-box collision by enforcing generous horizontal (px-6 to px-10)
 * and vertical (py-2 to py-3.5) breathing room across all sizes.
 */

import { cn } from '@/lib/utils';
import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size    = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const base =
  'inline-flex items-center justify-center gap-2.5 font-medium tracking-wide transition-all duration-300 select-none whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--c-cyan)] disabled:pointer-events-none disabled:opacity-40';

const variants: Record<Variant, string> = {
  primary:
    'bg-[var(--c-cyan)] text-[var(--c-navy)] hover:bg-white hover:shadow-[0_0_24px_rgba(0,200,220,0.35)] active:scale-[0.98] rounded-full font-semibold border border-transparent',
  secondary:
    'glass border border-[rgba(255,255,255,0.22)] text-[var(--c-white)] hover:border-[var(--c-cyan)] hover:text-[var(--c-cyan)] hover:bg-[rgba(0,200,220,0.12)] rounded-full',
  ghost:
    'text-[var(--c-dim)] hover:text-[var(--c-white)] underline-offset-4 hover:underline border border-transparent',
};

const sizes: Record<Size, string> = {
  sm: 'h-10 px-6 py-2 text-sm',
  md: 'h-12 px-8 py-2.5 text-sm',
  lg: 'h-14 px-10 py-3.5 text-base',
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

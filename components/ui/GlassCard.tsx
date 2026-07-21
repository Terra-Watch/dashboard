'use client';

import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article';
}

export function GlassCard({ children, className, as: Tag = 'div' }: GlassCardProps) {
  return (
    <Tag
      className={cn(
        'glass rounded-xl overflow-hidden',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

interface SectionLabelProps {
  children: ReactNode;
  className?: string;
  color?: 'default' | 'cyan' | 'amber' | 'orange' | 'green';
}

const colorMap: Record<NonNullable<SectionLabelProps['color']>, string> = {
  default: 'text-[var(--c-dim)]',
  cyan:    'text-[var(--c-cyan)]',
  amber:   'text-[var(--c-amber)]',
  orange:  'text-[var(--c-orange)]',
  green:   'text-[var(--c-green)]',
};

export function SectionLabel({ children, className, color = 'default' }: SectionLabelProps) {
  return (
    <span
      className={cn(
        'font-mono text-[0.6875rem] tracking-[0.15em] uppercase',
        colorMap[color],
        className,
      )}
    >
      {children}
    </span>
  );
}

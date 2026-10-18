import { useTranslation } from 'react-i18next';
import { Brand } from '../components/Brand';

type Props = { label?: string; compact?: boolean };

/** Branded loading state for route and data waits. Content skeletons remain useful inside pages. */
export function LogoLoader({ label, compact = false }: Props) {
  const { t } = useTranslation();
  return (
    <div role="status" aria-live="polite" aria-label={label ?? t('common.loading', 'Loading…')} className={`flex items-center justify-center gap-3 text-ink-muted ${compact ? 'py-6' : 'min-h-[12rem] flex-col py-12'}`}>
      <span className={`relative inline-flex items-center justify-center ${compact ? 'size-10' : 'size-16'}`}>
        <span className="absolute inset-0 rounded-full border-2 border-action/20 border-t-action motion-safe:animate-[spin_2.4s_linear_infinite] motion-reduce:animate-none" aria-hidden="true" />
        <span className="motion-safe:animate-[pulse_2.8s_ease-in-out_infinite] motion-reduce:animate-none" aria-hidden="true"><Brand markOnly className={compact ? 'scale-75' : 'scale-125'} /></span>
      </span>
      <span className={compact ? 'text-sm' : 'text-base font-semibold'}>{label ?? t('common.loading', 'Loading…')}</span>
    </div>
  );
}

import { useTranslation } from 'react-i18next';

export type Status = 'soon';
const STYLE: Record<Status, string> = { soon: 'border border-line bg-surface-2 text-ink-muted' };
const LABEL: Record<Status, string> = { soon: 'Coming soon' };

/** Says where a feature stands in words, so the meaning never depends on colour. */
export function StatusChip({ status }: { status: Status }) {
  const { t } = useTranslation();
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${STYLE[status]}`}>{t(`landing.v3.status.${status}`, LABEL[status])}</span>;
}

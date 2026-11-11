import { useTranslation } from 'react-i18next';
import { statusName, type Fire, type Status } from './model';

export type Tt = (key: string, fallback: string, opts?: Record<string, unknown>) => string;
export function useTt(): Tt {
  const { t } = useTranslation();
  return (k, d, o) => t(k, { defaultValue: d, ...o }) as string;
}

const MARK: Record<Status, string> = { growing: '▲', steady: '●', new: '◆', out: '○' };
const CLS: Record<Status, string> = { growing: 'border-danger bg-danger-tint', steady: 'border-warn bg-warn-tint', new: 'border-line', out: 'border-line text-ink-muted' };

/** Status shown by a mark and a word, never by colour alone. */
export function StatusChip({ f }: { f: Pick<Fire, 'status' | 'kind'> }) {
  const tt = useTt();
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm font-semibold ${CLS[f.status]}`}><span aria-hidden="true">{MARK[f.status]}</span>{statusName(f.status, tt)}{f.kind === 'unconfirmed' ? <span className="font-normal"> · {tt('fires.unconfirmed', 'not confirmed')}</span> : null}</span>;
}

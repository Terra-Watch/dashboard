import { useTranslation } from 'react-i18next';
import { RungIcon } from './Icon';
import { RUNGS, type Rung, type Tone } from './ladder';

const TONE: Record<Tone, string> = {
  unconfirmed: 'border-unconfirmed bg-unconfirmed-tint text-unconfirmed border-dashed',
  danger: 'border-danger bg-danger-tint text-danger',
  warn: 'border-warn bg-warn-tint text-warn',
  ok: 'border-ok bg-ok-tint text-ok',
  neutral: 'border-control bg-surface-2 text-ink-muted',
};

/** Where a claim sits on the confidence ladder: icon, words and outline style, never colour alone. */
export function RungBadge({ rung, age }: { rung: Rung; age?: string }) {
  const { t } = useTranslation();
  const { tone, icon, labelKey } = RUNGS[rung];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-semibold ${TONE[tone]}`} data-rung={rung}>
      <RungIcon id={icon} />
      {t(labelKey)}
      {age && <span className="font-normal text-ink-muted">· {age}</span>}
    </span>
  );
}

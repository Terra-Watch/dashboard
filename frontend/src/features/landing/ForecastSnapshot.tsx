import { motion, useReducedMotion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { SNAPSHOT } from './snapshotData';

// Drawn from the faintest layer to the strongest, so the highest-ranked cells sit on top.
const LAYERS = [
  { band: 4, fill: 'var(--tw-line)', opacity: 0.35 },
  { band: 3, fill: 'var(--tw-map-forest)', opacity: 0.75 },
  { band: 2, fill: 'var(--tw-warn)', opacity: 1 },
  { band: 1, fill: 'var(--tw-ember)', opacity: 1 },
  { band: 0, fill: 'var(--tw-danger)', opacity: 1 },
] as const;
const LEGEND = [[0, 'Highest 1%'], [1, 'Next 4%'], [2, 'Next 10%'], [3, 'Lower']] as const;

/** The archived forecast for one real day over the forest cells of every state in the bundle. Ranks only, never a raw score. */
export function ForecastSnapshot({ legend = true }: { legend?: boolean }) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const day = new Date(`${SNAPSHOT.date}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const alt = t('landing.v4.snapshot.alt', 'Map of forest cells in {{count}} Indian states, shaded by next-day fire rank', { count: SNAPSHOT.states.length });
  return (
    <figure className="min-w-0 rounded-2xl border border-line bg-surface p-4">
      <svg viewBox={`-1 -1 ${SNAPSHOT.width + 2} ${SNAPSHOT.height + 2}`} role="img" aria-label={alt} shapeRendering="crispEdges" className="w-full">
        {LAYERS.map(({ band, fill, opacity }, index) => (
          <motion.path key={band} d={SNAPSHOT.paths[band]} fill={fill} stroke={band < 2 ? fill : 'none'} strokeWidth={band < 2 ? 0.5 : 0}
            initial={reduce ? false : { opacity: 0 }} animate={{ opacity }} transition={{ duration: 0.6, delay: index * 0.25, ease: 'easeOut' }} />
        ))}
      </svg>
      {legend && (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {LEGEND.map(([band, label]) => <li key={band} className="flex items-center gap-2"><span aria-hidden="true" className="size-3.5 rounded-sm" style={{ background: LAYERS[4 - band].fill, opacity: LAYERS[4 - band].opacity }} />{t(`landing.v3.snapshot.l${band}`, label)}</li>)}
        </ul>
      )}
      <figcaption className="mt-2 text-sm text-ink-muted">{t('landing.v4.snapshot.caption', 'Forecast for {{day}}: all {{cells}} forest cells in {{states}} states ranked for the next day.', { day, cells: SNAPSHOT.cells.toLocaleString(), states: SNAPSHOT.states.length })}</figcaption>
    </figure>
  );
}

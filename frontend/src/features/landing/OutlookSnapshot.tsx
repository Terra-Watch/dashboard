import { motion, useReducedMotion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { OUTLOOK } from './outlookData';

const LAYERS = [
  { band: 1, fill: 'var(--tw-warn)', opacity: 0.5 },
  { band: 2, fill: 'var(--tw-ember)', opacity: 0.65 },
  { band: 3, fill: 'var(--tw-danger)', opacity: 0.85 },
] as const;
const SCALE_KM = 2;

function Terrain() {
  return (
    <>
      <rect width="100" height="100" fill="var(--tw-map-land)" />
      <path d={OUTLOOK.roads} fill="none" stroke="var(--tw-text-muted)" strokeWidth="0.35" opacity="0.55" strokeLinecap="round" />
    </>
  );
}

function Places() {
  return <>{OUTLOOK.places.map(p => <g key={p.name}><rect x={p.xy[0] - 1.2} y={p.xy[1] - 1.2} width="2.4" height="2.4" fill="var(--tw-text, #111)" stroke="var(--tw-surface, #fff)" strokeWidth="0.4" /><text x={p.xy[0] + 2.4} y={p.xy[1] + 1.2} fontSize="3.8" fill="var(--tw-text, #111)" stroke="var(--tw-surface, #fff)" strokeWidth="0.9" paintOrder="stroke">{p.name}</text></g>)}</>;
}

function Scale() {
  const w = (SCALE_KM / (2 * OUTLOOK.halfKm)) * 100;
  return <g transform="translate(6 94)" stroke="var(--tw-text, #111)" fill="var(--tw-text, #111)"><line x1="0" x2={w} y1="0" y2="0" strokeWidth="0.8" /><text x="0" y="-1.6" fontSize="3.6" stroke="none">{SCALE_KM} km</text></g>;
}

/** One archived fire from the spread outlook, drawn twice: what the outlook ranked, and what then burned. No controls; the top band's share of the burned area is the headline. */
export function OutlookSnapshot() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  return (
    <figure className="min-w-0 rounded-2xl border border-line bg-surface p-4">
      <p className="text-lg font-semibold leading-snug">{t('landing.v5.outlook.headline', 'The top band held {{pct}}% of the {{km2}} km² that burned.', { pct: OUTLOOK.topCovers, km2: OUTLOOK.burnedKm2 })}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {(['ranked', 'burned'] as const).map(side => (
          <div key={side} className="min-w-0">
            <p className="mb-1 text-sm font-bold uppercase tracking-wide text-ink-muted">{side === 'ranked' ? t('landing.v5.outlook.ranked', 'What the outlook ranked') : t('landing.v5.outlook.burned', 'What burned')}</p>
            <svg viewBox="0 0 100 100" role="img" aria-label={side === 'ranked'
              ? t('landing.v5.outlook.alt_ranked', 'Map of one archived forest fire in {{state}} with three bands of cells ranked most likely to burn next', { state: OUTLOOK.state })
              : t('landing.v5.outlook.alt_burned', 'The same map with the area that burned in the following two days')} className="w-full rounded-2xl border border-line">
              <Terrain />
              {side === 'ranked' && LAYERS.map(({ band, fill, opacity }, i) => (
                <motion.path key={band} d={(OUTLOOK.bands as Record<number, string>)[band]} fill={fill} initial={reduce ? false : { opacity: 0 }} animate={{ opacity }} transition={{ duration: 0.45, delay: i * 0.12, ease: 'easeOut' }} />
              ))}
              {side === 'burned' && <>
                <path d={(OUTLOOK.bands as Record<number, string>)[3]} fill="none" stroke="var(--tw-danger)" strokeWidth="0.7" strokeDasharray="2 1.2" />
                <path d={OUTLOOK.burned} fill="var(--tw-text, #111)" opacity="0.8" />
              </>}
              <path d={OUTLOOK.footprint} fill="none" stroke={side === 'ranked' ? 'var(--tw-text, #111)' : 'var(--tw-surface, #fff)'} strokeWidth="0.7" />
              <Places />
              <Scale />
            </svg>
          </div>
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {[[3, 'Most likely'], [2, 'Likely'], [1, 'Possible']].map(([b, label]) => <li key={b} className="flex items-center gap-2"><span aria-hidden="true" className="size-3.5 rounded-sm" style={{ background: LAYERS[(b as number) - 1].fill, opacity: LAYERS[(b as number) - 1].opacity }} />{t(`outlook.band${b}`, label as string)}</li>)}
        <li className="flex items-center gap-2"><span aria-hidden="true" className="size-3.5 rounded-sm bg-ink opacity-80" />{t('landing.v5.outlook.legend_burned', 'Burned')}</li>
      </ul>
      <figcaption className="mt-2 text-sm text-ink-muted">{t('landing.v5.outlook.caption2', 'An archived fire in {{state}}, scored as it would have been then, for the next one to two days. The dashed line on the right is the top band. Across 244 test fires of 2025 the top band held a median 75% of what burned; this fire is close to that. Burned area from the MODIS product; roads and villages from OpenStreetMap.', { state: OUTLOOK.state })}</figcaption>
    </figure>
  );
}

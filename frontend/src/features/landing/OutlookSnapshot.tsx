import { motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { OUTLOOK } from './outlookData';

const LAYERS = [
  { band: 1, fill: 'var(--tw-warn)', opacity: 0.5 },
  { band: 2, fill: 'var(--tw-ember)', opacity: 0.65 },
  { band: 3, fill: 'var(--tw-danger)', opacity: 0.8 },
] as const;
const POINT: Record<string, string> = { N: 'north', NE: 'north-east', E: 'east', SE: 'south-east', S: 'south', SW: 'south-west', W: 'west', NW: 'north-west' };
const GROUND: Record<string, string> = { tree: 'forest', shrub: 'scrub', grass: 'grassland', crop: 'farmland' };
const SCALE_KM = 2;

/** One archived fire from the spread outlook, as the Control Room sees it: the answer in a sentence, the three bands, the roads and places around, and the people in each band. Real model output; 24 or 48 hours; what actually burned on request. */
export function OutlookSnapshot() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const [h, setH] = useState<'24' | '48'>('24');
  const [showBurned, setShowBurned] = useState(false);
  const d = OUTLOOK.horizons[h]; const [cx, cy] = OUTLOOK.centre;
  const rad = (d.bearingDeg * Math.PI) / 180; const len = 24; const ax = cx + Math.sin(rad) * len, ay = cy - Math.cos(rad) * len;
  const scale = (SCALE_KM / (2 * OUTLOOK.halfKm)) * 100;
  const where = t(`outlook.dir.${d.bearing}`, POINT[d.bearing]); const ground = t(`outlook.ground.${d.cover}`, GROUND[d.cover]);
  const slope = d.slope < 5 ? t('outlook.gentle', 'on gentle ground') : d.uphill != null && d.uphill >= 0.6 ? t('outlook.uphill', 'mostly uphill') : d.uphill != null && d.uphill <= 0.4 ? t('outlook.downhill', 'mostly downhill') : t('outlook.mixed', 'across the slope');
  const sentence = t('outlook.answer', 'Most likely to spread toward the {{where}}, through {{ground}}, {{slope}}.', { where, ground, slope });
  return (
    <figure className="min-w-0 rounded-2xl border border-line bg-surface p-4">
      <p className="text-lg font-semibold leading-snug" aria-live="polite">{sentence}</p>
      <div role="group" aria-label={t('outlook.horizon', 'Look ahead')} className="mt-3 inline-flex rounded-rq border border-control p-1">
        {(['24', '48'] as const).map(x => <button key={x} type="button" aria-pressed={h === x} onClick={() => setH(x)} className={`min-h-11 rounded-rq px-4 font-semibold ${h === x ? 'bg-ink text-surface' : ''}`}>{x} h</button>)}
      </div>
      <svg viewBox="0 0 100 100" role="img" aria-label={t('landing.v4.outlook.alt', 'Map of one archived forest fire in {{state}} with three bands of cells most likely to burn next, roads and a nearby village', { state: OUTLOOK.state })} className="mt-3 w-full rounded-xl bg-[var(--tw-map-land)]">
        <path d={OUTLOOK.roads} fill="none" stroke="var(--tw-text-muted)" strokeWidth="0.35" opacity="0.55" strokeLinecap="round" />
        {LAYERS.map(({ band, fill, opacity }, i) => (
          <motion.path key={`${h}-${band}`} d={(d.bands as Record<number, string>)[band]} fill={fill} initial={reduce ? false : { opacity: 0 }} animate={{ opacity }} transition={{ duration: 0.45, delay: i * 0.12, ease: 'easeOut' }} />
        ))}
        {showBurned && <path d={d.burned} fill="none" stroke="var(--tw-unconfirmed, #555)" strokeWidth="0.6" strokeDasharray="1.6 1" />}
        <path d={OUTLOOK.footprint} fill="none" stroke="var(--tw-text, #111)" strokeWidth="0.9" />
        <g stroke="var(--tw-text, #111)" fill="var(--tw-text, #111)"><line x1={cx} y1={cy} x2={ax} y2={ay} strokeWidth="1.1" strokeLinecap="round" /><circle cx={ax} cy={ay} r="1.6" /></g>
        {OUTLOOK.places.map(p => <g key={p.name}><rect x={p.xy[0] - 1} y={p.xy[1] - 1} width="2" height="2" fill="var(--tw-text, #111)" stroke="#fff" strokeWidth="0.3" /><text x={p.xy[0] + 2} y={p.xy[1] + 1} fontSize="3.4" fill="var(--tw-text, #111)" stroke="#fff" strokeWidth="0.7" paintOrder="stroke">{p.name}</text></g>)}
        <g transform="translate(93 10)" fill="var(--tw-text, #111)"><path d="M0 -5 L2.2 1 L0 0 L-2.2 1Z" /><text y="6.5" fontSize="3.6" textAnchor="middle">N</text></g>
        <g transform="translate(6 94)" stroke="var(--tw-text, #111)" fill="var(--tw-text, #111)"><line x1="0" x2={scale} y1="0" y2="0" strokeWidth="0.8" /><text x="0" y="-1.6" fontSize="3.4" stroke="none">{SCALE_KM} km</text></g>
      </svg>
      <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {[[3, 'Most likely'], [2, 'Likely'], [1, 'Possible']].map(([b, label]) => <li key={b} className="flex items-center gap-2"><span aria-hidden="true" className="size-3.5 rounded-sm" style={{ background: LAYERS[(b as number) - 1].fill, opacity: LAYERS[(b as number) - 1].opacity }} />{t(`outlook.band${b}`, label as string)}</li>)}
        <li className="ml-auto"><label className="inline-flex min-h-11 items-center gap-2"><input type="checkbox" checked={showBurned} onChange={e => setShowBurned(e.target.checked)} className="h-4 w-4" />{t('landing.v4.outlook.burned', 'Show what actually burned')}</label></li>
      </ul>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-center text-sm">
        {(['3', '2', '1'] as const).map(b => <div key={b} className="rounded-rq bg-surface-2 px-2 py-2"><dt className="text-ink-muted">{t(`outlook.band${b}`, ['', 'Possible', 'Likely', 'Most likely'][Number(b)])}</dt><dd className="font-bold">{d.people[b].toLocaleString()} <span className="font-normal text-ink-muted">{t('landing.v4.outlook.people', 'people')}</span></dd></div>)}
      </dl>
      <figcaption className="mt-2 text-sm text-ink-muted">{t('landing.v4.outlook.caption2', 'An archived fire in {{state}}, scored as it would have been then. The arrow points toward the most likely band; the dark outline is the fire at the start. Roads and village from OpenStreetMap, people from a 1 km population grid.', { state: OUTLOOK.state })}</figcaption>
    </figure>
  );
}

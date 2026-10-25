import { motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ALMORA } from './whatifData';

const HOURS = [1, 3, 6] as const;
const LAYERS = [
  { key: 'h6', upTo: 6, fill: 'var(--tw-warn)', opacity: 0.7 },
  { key: 'h3', upTo: 3, fill: 'var(--tw-ember)', opacity: 0.8 },
  { key: 'h1', upTo: 1, fill: 'var(--tw-danger)', opacity: 0.9 },
] as const;
const SCALE_KM = 2;
const cap = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);

/** A run of the app's own what-if engine on real terrain near Almora, Uttarakhand: how far one fire could spread in 1, 3 and 6 hours. */
export function WhatIfSnapshot() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const [hour, setHour] = useState<(typeof HOURS)[number]>(6);
  const size = ALMORA.size;
  const scale = (SCALE_KM * 1000) / ALMORA.cellM;
  const [ix, iy] = ALMORA.ignition;
  const head = (ALMORA.wind.fromDeg + 180) * (Math.PI / 180); // the fire head moves toward the opposite of where the wind comes from
  const arrow = { dx: Math.sin(head), dy: -Math.cos(head) };
  const reached = ALMORA.reachedVillages.filter(v => v.h !== null && v.h <= hour);
  const hoursLabel = t('landing.v3.whatif.hours', 'h');
  return (
    <figure className="min-w-0 rounded-2xl border border-line bg-surface p-4">
      <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={t('landing.v3.whatif.alt', 'Terrain map near Almora, Uttarakhand, showing how far one fire could spread in 1, 3 and 6 hours with the wind')} className="w-full rounded-xl">
        <image href="/landing/almora-terrain.jpg" width={size} height={size} />
        <path d={ALMORA.paths.roads} fill="var(--tw-surface)" opacity="0.85" />
        {LAYERS.map(({ key, upTo, fill, opacity }) => (
          <motion.path key={key} d={ALMORA.paths[key]} fill={fill} initial={false} animate={{ opacity: upTo <= hour ? opacity : 0 }} transition={{ duration: reduce ? 0 : 0.45 }} />
        ))}
        {ALMORA.villages.map(v => <circle key={`${v.name}-${v.x}`} cx={v.x} cy={v.y} r="2.2" fill="var(--tw-text)" stroke="var(--tw-surface)" strokeWidth="1" />)}
        <circle cx={ix} cy={iy} r="5" fill="var(--tw-surface)" stroke="var(--tw-danger)" strokeWidth="2.5" />
        <g stroke="var(--tw-surface)" strokeWidth="5" strokeLinecap="round" opacity="0.9"><path d={`M${ix + arrow.dx * 12} ${iy + arrow.dy * 12}l${arrow.dx * 26} ${arrow.dy * 26}`} /></g>
        <g stroke="var(--tw-text)" strokeWidth="2.4" strokeLinecap="round" fill="none"><path d={`M${ix + arrow.dx * 12} ${iy + arrow.dy * 12}l${arrow.dx * 26} ${arrow.dy * 26}`} /></g>
        <g><rect x="10" y={size - 28} width={scale + 20} height="20" rx="6" fill="var(--tw-surface)" opacity="0.9" /><path d={`M20 ${size - 14}h${scale}`} stroke="var(--tw-text)" strokeWidth="3" strokeLinecap="round" /><text x="20" y={size - 18} fontSize="8" fontWeight="700" fill="var(--tw-text)">{SCALE_KM} km</text></g>
      </svg>
      <div role="group" aria-label={t('landing.v3.whatif.passes', 'Hours after ignition')} className="mt-3 flex flex-wrap gap-2">
        {HOURS.map(h => (
          <button key={h} type="button" aria-pressed={h === hour} onClick={() => setHour(h)}
            className={`min-h-11 rounded-rq border px-4 text-sm font-semibold transition duration-200 active:scale-95 ${h === hour ? 'border-ink bg-ink text-canvas' : 'border-control bg-surface text-ink hover:bg-surface-2'}`}>{t('landing.v3.whatif.after', 'After')} {h} {hoursLabel}</button>
        ))}
      </div>
      <p className="mt-3 min-h-6 text-sm" aria-live="polite">
        {reached.length ? <><strong>{t('landing.v3.whatif.reached', 'Villages the fire could reach:')}</strong> {reached.slice(0, 4).map(v => `${cap(v.name)} (${v.h} ${hoursLabel})`).join(', ')}{reached.length > 4 ? '…' : ''}</> : t('landing.v3.whatif.none', 'No village is reached in this time.')}
      </p>
      <figcaption className="mt-2 text-sm text-ink-muted">{t('landing.v3.whatif.caption', 'The what-if tool run on real terrain, land cover and villages near Almora, Uttarakhand: one ignition (ringed), wind at {{kmh}} km/h from the south-west (arrow shows where the fire head moves). A range under stated inputs, not a forecast of what will burn.', { kmh: ALMORA.wind.speedKmh })}</figcaption>
    </figure>
  );
}

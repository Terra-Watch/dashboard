import { cellToBoundary, cellToLatLng, latLngToCell } from 'h3-js';
import { motion, useReducedMotion } from 'motion/react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

// A made-up area (not a real place) used only to illustrate the privacy rule.
const CENTER: [number, number] = [20.0, 85.0];
const SPAN = 0.5;
const W = 520, H = 340;
const project = ([lat, lng]: [number, number]) => [((lng - (CENTER[1] - SPAN)) / (2 * SPAN)) * W, H - ((lat - (CENTER[0] - SPAN * 0.65)) / (2 * SPAN * 0.65)) * H] as const;

const VERIFIED: Array<[number, number]> = [[20.12, 85.1], [19.9, 84.82]];
const REPORTS: Array<[number, number]> = [[20.2, 84.85], [19.8, 85.2], [20.05, 84.7]];
const SIGNALS: Array<[number, number]> = [[20.22, 85.25]];
const OFFICER: [number, number] = [20.1, 85.06];
const RESOLUTION = 6;

/** Toggle between what the public sees and what staff see on a made-up map. Public view hides unchecked items and snaps verified ones to coarse H3 cells. */
export function PrivacyMap() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const [view, setView] = useState<'public' | 'staff'>('public');
  const cells = useMemo(() => VERIFIED.map(point => {
    const id = latLngToCell(point[0], point[1], RESOLUTION);
    return { id, points: cellToBoundary(id).map(([lat, lng]) => project([lat, lng]).join(',')).join(' '), center: project(cellToLatLng(id) as [number, number]) };
  }), []);
  const spring = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 140, damping: 20 };
  const staff = view === 'staff';

  return (
    <section aria-labelledby="privacy-title" className="rounded-panel border border-line bg-surface p-5 md:p-8" data-testid="privacy-map">
      <h2 id="privacy-title" className="text-2xl md:text-3xl">{t('landing.privacy.title')}</h2>
      <div role="group" aria-label={t('landing.privacy.title')} className="mt-5 inline-flex rounded-rq border border-control p-1">
        {(['public', 'staff'] as const).map(item => (
          <button key={item} type="button" aria-pressed={view === item} onClick={() => setView(item)} className={`min-h-11 rounded-rq px-4 font-semibold ${view === item ? 'bg-action text-on-action' : 'hover:bg-surface-2'}`}>{t(`landing.privacy.${item}`)}</button>
        ))}
      </div>
      <p className="mt-3 max-w-2xl text-ink-muted" aria-live="polite">{staff ? t('landing.privacy.p_staff') : t('landing.privacy.p_pub')}</p>
      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_14rem]">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('landing.privacy.illustration')} className="w-full rounded-panel border border-line bg-map-land" style={{ background: 'var(--tw-map-land)' }}>
          <rect x="0" y="0" width={W} height={H} fill="var(--tw-map-forest)" opacity="0.5" />
          <path d="M0 250 C120 210 200 280 320 240 S470 200 520 230 L520 340 L0 340Z" fill="var(--tw-map-water)" opacity="0.55" />
          {!staff && cells.map(cell => <motion.polygon key={cell.id} points={cell.points} fill="var(--tw-danger-tint)" stroke="var(--tw-danger)" strokeWidth="2" initial={false} animate={{ opacity: 1 }} transition={spring} />)}
          {staff && VERIFIED.map((point, i) => { const [x, y] = project(point); return <motion.circle key={i} cx={x} cy={y} r="9" fill="var(--tw-danger)" stroke="var(--tw-surface)" strokeWidth="2" initial={reduce ? false : { scale: 0 }} animate={{ scale: 1 }} transition={spring} />; })}
          {staff && REPORTS.map((point, i) => { const [x, y] = project(point); return <motion.circle key={i} cx={x} cy={y} r="8" fill="none" stroke="var(--tw-unconfirmed)" strokeWidth="3" strokeDasharray="3 2" initial={reduce ? false : { scale: 0 }} animate={{ scale: 1 }} transition={spring} />; })}
          {staff && SIGNALS.map((point, i) => { const [x, y] = project(point); return <motion.rect key={i} x={x - 7} y={y - 7} width="14" height="14" transform={`rotate(45 ${x} ${y})`} fill="var(--tw-unconfirmed-tint)" stroke="var(--tw-unconfirmed)" strokeWidth="2" initial={reduce ? false : { scale: 0 }} animate={{ scale: 1 }} transition={spring} />; })}
          {staff && (() => { const [x, y] = project(OFFICER); return <motion.rect x={x - 7} y={y - 7} width="14" height="14" fill="var(--tw-text)" initial={reduce ? false : { scale: 0 }} animate={{ scale: 1 }} transition={spring} />; })()}
        </svg>
        <ul className="space-y-2 text-sm">
          {!staff && <li className="flex items-center gap-2"><span aria-hidden="true" className="size-4 shrink-0 border-2 border-danger bg-danger-tint" />{t('landing.privacy.legend_cell')}</li>}
          {staff && <>
            <li className="flex items-center gap-2"><span aria-hidden="true" className="size-4 shrink-0 rounded-full bg-danger" />{t('landing.privacy.legend_verified')}</li>
            <li className="flex items-center gap-2"><span aria-hidden="true" className="size-4 shrink-0 rounded-full border-2 border-dashed border-unconfirmed" />{t('landing.privacy.legend_report')}</li>
            <li className="flex items-center gap-2"><span aria-hidden="true" className="size-3 shrink-0 rotate-45 border-2 border-unconfirmed bg-unconfirmed-tint" />{t('landing.privacy.legend_signal')}</li>
            <li className="flex items-center gap-2"><span aria-hidden="true" className="size-3.5 shrink-0 bg-ink" />{t('landing.privacy.legend_officer')}</li>
          </>}
          <li className="pt-2 text-ink-muted">{t('landing.privacy.illustration')}</li>
        </ul>
      </div>
    </section>
  );
}

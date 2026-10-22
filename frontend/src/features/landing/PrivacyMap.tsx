import { cellToBoundary, cellToLatLng, latLngToCell } from 'h3-js';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

// A made-up area (not a real place) used only to illustrate the privacy rule.
const CENTER: [number, number] = [20.0, 85.0];
const SPAN = 0.5;
const W = 640, H = 400;
const project = ([lat, lng]: [number, number]) => [((lng - (CENTER[1] - SPAN)) / (2 * SPAN)) * W, H - ((lat - (CENTER[0] - SPAN * 0.625)) / (2 * SPAN * 0.625)) * H] as const;

const VERIFIED: Array<[number, number]> = [[20.12, 85.1], [19.9, 84.82]];
const REPORTS: Array<[number, number]> = [[20.2, 84.85], [19.8, 85.2], [20.05, 84.7]];
const SIGNALS: Array<[number, number]> = [[20.22, 85.25], [19.78, 84.62]];
const OFFICER: [number, number] = [20.1, 85.06];
const RESOLUTION = 6;

// Terrain drawn by hand so the picture reads as a map: forest blocks, a river, a road, contours and a few settlements.
const FOREST = ['M40 60 C90 30 170 40 210 90 S230 170 160 190 S30 150 40 60Z', 'M330 40 C410 20 500 50 530 110 S500 190 420 180 S300 120 330 40Z', 'M90 250 C150 220 250 240 270 300 S220 380 140 370 S50 310 90 250Z', 'M400 250 C470 230 570 260 590 320 S540 385 460 375 S370 310 400 250Z'];
const SETTLEMENTS: Array<[number, number]> = [[300, 210], [312, 218], [296, 224], [120, 215], [545, 222], [552, 230]];
const MARK_FILL = 'var(--tw-surface)';

function Tag({ x, y, text, anchor = 'start' }: { x: number; y: number; text: string; anchor?: 'start' | 'end' }) {
  const width = text.length * 6.1 + 12;
  const left = anchor === 'start' ? x : x - width;
  return (
    <g pointerEvents="none">
      <rect x={left} y={y - 11} width={width} height="18" rx="9" fill={MARK_FILL} stroke="var(--tw-line)" />
      <text x={left + 6} y={y + 2} fontSize="10.5" fontWeight="600" fill="var(--tw-text)">{text}</text>
    </g>
  );
}

/** Toggle between what the public sees and what staff see on a made-up map. Public view hides unchecked items and snaps verified ones to coarse H3 cells. */
export function PrivacyMap() {
  const { t } = useTranslation();
  const [view, setView] = useState<'public' | 'staff'>('public');
  const cells = useMemo(() => VERIFIED.map(point => {
    const id = latLngToCell(point[0], point[1], RESOLUTION);
    return { id, points: cellToBoundary(id).map(([lat, lng]) => project([lat, lng]).join(',')).join(' '), center: project(cellToLatLng(id) as [number, number]) };
  }), []);
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
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('landing.privacy.illustration')} className="w-full rounded-panel border border-line" style={{ background: 'var(--tw-map-land)' }}>
          {/* contours */}
          <g fill="none" stroke="var(--tw-line)" strokeWidth="1" opacity="0.7">
            <path d="M0 120 C120 90 200 150 320 120 S520 80 640 130" /><path d="M0 170 C120 140 200 200 320 170 S520 130 640 180" /><path d="M0 330 C140 300 240 360 360 330 S560 290 640 340" />
          </g>
          {FOREST.map((d, i) => <path key={i} d={d} fill="var(--tw-map-forest)" opacity="0.55" />)}
          {/* river and road */}
          <path d="M-10 300 C100 260 180 330 300 290 S470 240 650 285" fill="none" stroke="var(--tw-map-water)" strokeWidth="14" strokeLinecap="round" opacity="0.7" />
          <path d="M0 215 C160 205 260 235 330 215 S520 190 640 210" fill="none" stroke="var(--tw-text-muted)" strokeWidth="2" strokeDasharray="7 5" opacity="0.7" />
          {SETTLEMENTS.map(([x, y], i) => <rect key={i} x={x} y={y} width="7" height="7" fill="var(--tw-text-muted)" opacity="0.7" />)}

          {!staff && cells.map((cell, i) => (
            <g key={cell.id}>
              <polygon points={cell.points} fill="var(--tw-danger-tint)" stroke="var(--tw-danger)" strokeWidth="2.5" />
              {i === 0 && <Tag x={cell.center[0] - 26} y={cell.center[1] + 4} anchor="end" text={t('landing.v2.map.public_cell', 'Verified fire: coarse area, shown later')} />}
            </g>
          ))}
          {staff && VERIFIED.map((point, i) => { const [x, y] = project(point); return (
            <g key={i}><circle cx={x} cy={y} r="10" fill="var(--tw-danger)" stroke={MARK_FILL} strokeWidth="2.5" />{i === 1 && <Tag x={x + 16} y={y + 4} text={t('landing.v2.map.verified', 'Verified fire, exact place')} />}</g>); })}
          {staff && REPORTS.map((point, i) => { const [x, y] = project(point); return (
            <g key={i}><circle cx={x} cy={y} r="9" fill={MARK_FILL} stroke="var(--tw-unconfirmed)" strokeWidth="3" strokeDasharray="3 2" />{i === 1 && <Tag x={x + 15} y={y + 4} text={t('landing.v2.map.report', 'Citizen report, not checked')} />}</g>); })}
          {staff && SIGNALS.map((point, i) => { const [x, y] = project(point); return (
            <g key={i}><rect x={x - 8} y={y - 8} width="16" height="16" transform={`rotate(45 ${x} ${y})`} fill="var(--tw-unconfirmed-tint)" stroke="var(--tw-unconfirmed)" strokeWidth="2.5" />{i === 0 && <Tag x={x - 16} y={y + 4} text={t('landing.v2.map.signal', 'Satellite heat, not checked')} anchor="end" />}</g>); })}
          {staff && (() => { const [x, y] = project(OFFICER); return <g><rect x={x - 8} y={y - 8} width="16" height="16" fill="var(--tw-text)" stroke={MARK_FILL} strokeWidth="2" /><Tag x={x - 16} y={y + 4} anchor="end" text={t('landing.v2.map.officer', 'Range Officer on site')} /></g>; })()}
          {/* scale and north, so it reads as a map */}
          <g fill="var(--tw-text)" fontSize="10" fontWeight="600"><path d="M20 372 H80" stroke="var(--tw-text)" strokeWidth="2" /><text x="20" y="364">5 km</text><text x="602" y="30">N</text><path d="M608 36 V56 M603 44 L608 36 L613 44" stroke="var(--tw-text)" strokeWidth="2" fill="none" /></g>
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

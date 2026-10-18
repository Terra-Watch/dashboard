import { useId, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { WIND_MAX_KMH, clampSpeed, compassName, headBearing, normaliseDeg } from './whatif/wind.ts';

const INPUT = 'mt-1 block w-full min-h-11 rounded-rq border border-control bg-surface px-3 py-2 text-base text-ink';
const SIZE = 120;

/** Wind speed and direction: a compass dial (pointer) plus number fields and sliders, all keyboard operable. The wind direction is where the wind blows FROM. */
export function WindControl({ legend, speedKmh, fromDeg, onChange }: { legend: string; speedKmh: number; fromDeg: number; onChange: (next: { speedKmh: number; fromDeg: number }) => void }) {
  const { t } = useTranslation();
  const id = useId();
  const to = headBearing(fromDeg);
  const rad = (to * Math.PI) / 180;
  const c = SIZE / 2;
  const tip = { x: c + Math.sin(rad) * 40, y: c - Math.cos(rad) * 40 };
  const tail = { x: c - Math.sin(rad) * 40, y: c + Math.cos(rad) * 40 };
  const arrowHead = (() => {
    const back = (a: number) => ({ x: tip.x - Math.sin(rad + a) * 12, y: tip.y + Math.cos(rad + a) * 12 });
    const l = back(0.45); const r = back(-0.45);
    return `${tip.x},${tip.y} ${l.x},${l.y} ${r.x},${r.y}`;
  })();
  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - (box.left + box.width / 2);
    const dy = e.clientY - (box.top + box.height / 2);
    if (Math.abs(dx) + Math.abs(dy) < 4) return;
    onChange({ speedKmh, fromDeg: Math.round(normaliseDeg((Math.atan2(dx, -dy) * 180) / Math.PI)) });
  };
  return (
    <fieldset className="rounded-rq border border-line p-3">
      <legend className="px-1 text-sm font-semibold">{legend}</legend>
      <div className="flex flex-wrap items-start gap-4">
        <div className="shrink-0">
          <div aria-hidden="true" className="touch-none cursor-crosshair select-none" style={{ width: SIZE, height: SIZE }} onPointerDown={e => { e.currentTarget.setPointerCapture?.(e.pointerId); fromPointer(e); }} onPointerMove={e => { if (e.buttons === 1) fromPointer(e); }}>
            <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
              <circle cx={c} cy={c} r={52} fill="var(--tw-surface)" stroke="var(--tw-line-control)" strokeWidth="2" />
              {[0, 90, 180, 270].map(a => <line key={a} x1={c + Math.sin((a * Math.PI) / 180) * 46} y1={c - Math.cos((a * Math.PI) / 180) * 46} x2={c + Math.sin((a * Math.PI) / 180) * 52} y2={c - Math.cos((a * Math.PI) / 180) * 52} stroke="var(--tw-text)" strokeWidth="2" />)}
              <text x={c} y={14} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--tw-text)">N</text>
              <text x={SIZE - 8} y={c + 4} textAnchor="middle" fontSize="11" fill="var(--tw-text)">E</text>
              <text x={c} y={SIZE - 5} textAnchor="middle" fontSize="11" fill="var(--tw-text)">S</text>
              <text x={8} y={c + 4} textAnchor="middle" fontSize="11" fill="var(--tw-text)">W</text>
              <line x1={tail.x} y1={tail.y} x2={tip.x} y2={tip.y} stroke="var(--tw-danger)" strokeWidth="4" strokeLinecap="round" />
              <polygon points={arrowHead} fill="var(--tw-danger)" />
              <circle cx={tail.x} cy={tail.y} r={5} fill="var(--tw-surface)" stroke="var(--tw-danger)" strokeWidth="2.5" />
            </svg>
          </div>
          <p className="mt-1 max-w-[7.5rem] text-xs text-ink-muted">{t('whatif.dial_help', 'Click the dial where the wind comes from.')}</p>
        </div>
        <div className="min-w-40 flex-1 space-y-3">
          <p className="text-sm" aria-live="polite">{t('whatif.wind_summary', 'From {{dir}} ({{deg}} degrees). The fire head moves toward {{to}}.', { dir: compassName(fromDeg), deg: Math.round(normaliseDeg(fromDeg)), to: compassName(to) })}</p>
          <div>
            <label htmlFor={`${id}-speed`} className="text-sm font-semibold">{t('whatif.wind_speed', 'Wind speed (km/h)')}</label>
            <input id={`${id}-speed`} type="number" inputMode="decimal" min={0} max={WIND_MAX_KMH} step={1} value={speedKmh} onChange={e => onChange({ speedKmh: clampSpeed(Number(e.target.value)), fromDeg })} className={INPUT} />
            <input type="range" aria-label={t('whatif.wind_speed_slider', 'Wind speed slider')} min={0} max={WIND_MAX_KMH} step={1} value={speedKmh} onChange={e => onChange({ speedKmh: Number(e.target.value), fromDeg })} className="mt-1 h-11 w-full" />
          </div>
          <div>
            <label htmlFor={`${id}-dir`} className="text-sm font-semibold">{t('whatif.wind_dir', 'Wind from (degrees)')}</label>
            <input id={`${id}-dir`} type="number" inputMode="decimal" min={0} max={359} step={1} value={fromDeg} onChange={e => onChange({ speedKmh, fromDeg: Math.round(normaliseDeg(Number(e.target.value))) })} className={INPUT} />
            <input type="range" aria-label={t('whatif.wind_dir_slider', 'Wind direction slider')} min={0} max={359} step={1} value={Math.round(normaliseDeg(fromDeg))} onChange={e => onChange({ speedKmh, fromDeg: Number(e.target.value) })} className="mt-1 h-11 w-full" />
          </div>
        </div>
      </div>
    </fieldset>
  );
}

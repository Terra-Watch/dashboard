import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SymbolKind } from './geojson';

const ITEMS: Array<{ kind: SymbolKind; label: string; hint: string }> = [
  { kind: 'signal', label: 'Satellite signal', hint: 'Heat seen from space. No person has checked it.' },
  { kind: 'report', label: 'Report, not checked', hint: 'A person says so. Staff have not decided yet.' },
  { kind: 'verified', label: 'Verified', hint: 'Staff checked and agree it is real.' },
  { kind: 'responding', label: 'Responding', hint: 'An officer is on the way or on site.' },
  { kind: 'contained', label: 'Contained', hint: 'Under control.' },
  { kind: 'closed', label: 'Closed', hint: 'Finished, kept for the record.' },
  { kind: 'officer', label: 'Officer', hint: 'A Range Officer who chose to share their position.' },
  { kind: 'task', label: 'Task place', hint: 'The place you are going to.' },
  { kind: 'me', label: 'You', hint: 'Your position when you tapped locate.' },
];

const RISK_BANDS: Array<{ band: string; label: string; color: string }> = [
  { band: 'Very high', label: 'Very high (top 1%)', color: 'outlook-5' },
  { band: 'High', label: 'High (top 5%)', color: 'outlook-4' },
  { band: 'Moderate', label: 'Moderate (top 15%)', color: 'outlook-3' },
  { band: 'Low', label: 'Low (remaining)', color: 'outlook-2' },
];

export function SymbolSwatch({ kind }: { kind: SymbolKind }) {
  const stroke = (name: string) => `var(--tw-${name})`;
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 28 28" className="shrink-0">
      {kind === 'signal' && <path d="M14 4 24 14 14 24 4 14Z" fill={stroke('surface')} stroke={stroke('unconfirmed')} strokeWidth="2.5" strokeDasharray="3 2" />}
      {kind === 'report' && <circle cx="14" cy="14" r="8" fill={stroke('surface')} stroke={stroke('unconfirmed')} strokeWidth="3" />}
      {kind === 'verified' && <circle cx="14" cy="14" r="9" fill={stroke('danger')} />}
      {kind === 'responding' && <><circle cx="14" cy="14" r="12" fill="none" stroke={stroke('warn')} strokeWidth="2" /><circle cx="14" cy="14" r="7" fill={stroke('warn')} /></>}
      {kind === 'contained' && <circle cx="14" cy="14" r="8" fill={stroke('surface')} stroke={stroke('ok')} strokeWidth="4" />}
      {kind === 'closed' && <circle cx="14" cy="14" r="4" fill={stroke('text-muted')} />}
      {kind === 'officer' && <rect x="7" y="7" width="14" height="14" fill={stroke('text')} />}
      {kind === 'task' && <><rect x="5" y="5" width="18" height="18" fill={stroke('text')} /><circle cx="14" cy="14" r="4" fill={stroke('ember')} /></>}
      {kind === 'me' && <><circle cx="14" cy="14" r="11" fill={stroke('surface')} /><circle cx="14" cy="14" r="7" fill={stroke('action')} /></>}
    </svg>
  );
}

/** Always available, never colour-only: each symbol has its own shape and a plain-words meaning. */
export function Legend({ kinds, showRisk = false }: { kinds: SymbolKind[]; showRisk?: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  return (
    <section aria-labelledby="legend-title" className="rounded-rq border border-line bg-surface p-3 text-sm" data-testid="legend">
      <button type="button" className="flex min-h-11 w-full items-center justify-between font-bold" aria-expanded={open} onClick={() => setOpen(value => !value)} id="legend-title">{t('map.legend', 'Legend')}<span aria-hidden="true">{open ? '−' : '+'}</span></button>
      {open && <ul className="mt-1 space-y-2">{ITEMS.filter(item => kinds.includes(item.kind)).map(item => <li key={item.kind} className="flex items-start gap-2"><SymbolSwatch kind={item.kind} /><span><span className="font-semibold">{t(`map.sym.${item.kind}`, item.label)}</span><span className="block text-ink-muted">{t(`map.sym.${item.kind}_hint`, item.hint)}</span></span></li>)}
        <li className="flex items-start gap-2"><svg aria-hidden="true" width="22" height="22" viewBox="0 0 22 22" className="shrink-0"><path d="M3 3H19V19H3Z" fill="var(--tw-warn)" fillOpacity=".16" stroke="var(--tw-warn)" strokeWidth="2" strokeDasharray="2 2" /></svg><span><span className="font-semibold">{t('map.notice_area', 'Notice area')}</span><span className="block text-ink-muted">{t('map.notice_area_hint', 'Where an official notice applies.')}</span></span></li>
        {showRisk && (
          <li className="flex flex-col gap-1 border-t border-line pt-2">
            <span className="font-semibold">{t('map.risk_outlook', 'Ignition-risk ranking')}</span>
            <span className="block text-ink-muted text-xs">{t('map.risk_outlook_hint', 'Model output, not observed fire. Relative likelihood based on archived validation data.')}</span>
            <ul className="mt-1 space-y-1">
              {RISK_BANDS.map(item => (
                <li key={item.band} className="flex items-center gap-2">
                  <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" className="shrink-0">
                    <circle cx="8" cy="8" r="7" fill="var(--tw-text)" opacity="0.85" />
                    <circle cx="8" cy="8" r="6" fill={`var(--tw-${item.color})`} opacity="0.7" stroke="var(--tw-surface)" strokeWidth="2" />
                  </svg>
                  <span className="text-xs">{t(`map.risk_band.${item.band.toLowerCase().replace(' ', '_')}`, item.label)}</span>
                </li>
              ))}
            </ul>
          </li>
        )}
      </ul>}
    </section>
  );
}

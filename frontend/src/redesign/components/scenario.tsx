import { useId } from 'react';

const RISK_BANDS = [
  { label: 'Very high (top 1%)', color: 'bg-risk-veryhigh', pattern: '▓' },
  { label: 'High (top 5%)', color: 'bg-risk-high', pattern: '▒' },
  { label: 'Moderate (top 15%)', color: 'bg-risk-moderate', pattern: '░' },
  { label: 'Low', color: 'bg-risk-low', pattern: '·' },
];

export function RiskLegend() {
  return (
    <ul aria-label="Risk band legend" className="flex flex-wrap gap-3 text-xs text-ink-muted">
      {RISK_BANDS.map((band) => (
        <li key={band.label} className="flex items-center gap-1.5">
          <span aria-hidden className={`inline-block h-3.5 w-3.5 rounded-sm ${band.color}`} />
          <span>{band.pattern} {band.label}</span>
        </li>
      ))}
    </ul>
  );
}

const PROB_BANDS = [
  { label: '0–20%', color: 'bg-prob-1', pattern: '·' },
  { label: '20–50%', color: 'bg-prob-2', pattern: '░' },
  { label: '50–80%', color: 'bg-prob-3', pattern: '▒' },
  { label: '80–100%', color: 'bg-prob-4', pattern: '▓' },
];

export function ProbabilityBandLegend() {
  return (
    <ul aria-label="Burn probability band legend" className="flex flex-wrap gap-3 text-xs text-ink-muted">
      {PROB_BANDS.map((band) => (
        <li key={band.label} className="flex items-center gap-1.5">
          <span aria-hidden className={`inline-block h-3.5 w-3.5 rounded-sm ${band.color}`} />
          <span>{band.pattern} {band.label} of ensemble members burning</span>
        </li>
      ))}
    </ul>
  );
}

const WIND_SOURCES: { value: string; label: string }[] = [
  { value: 'era5land_native', label: 'ERA5-Land (primary)' },
  { value: 'era5_025', label: 'ERA5 0.25° (sensitivity)' },
  { value: 'best_match', label: 'best_match (not a reanalysis, sensitivity)' },
];

export function WindSourceSwitch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-ink-muted">Wind source</label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 rounded-rq border border-contour bg-sheet px-2 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-canopy"
      >
        {WIND_SOURCES.map((source) => (
          <option key={source.value} value={source.value}>{source.label}</option>
        ))}
      </select>
      <p className="mt-1 max-w-xs text-xs text-ink-muted">Wind source changes this result more than anything else tested. Compare it yourself.</p>
    </div>
  );
}

export function BaselineToggle({ visible, onChange }: { visible: boolean; onChange: (visible: boolean) => void }) {
  return (
    <div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={visible} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4" />
        Show proximity baseline outline
      </label>
      {!visible && <p className="mt-1 text-xs font-semibold text-warn">Baseline hidden — this scenario is shown without the comparison it did not beat.</p>}
    </div>
  );
}

export function AssumptionsPanel({ fuel, weather, terrain }: { fuel: string; weather: string; terrain: string }) {
  return (
    <details className="rounded-rq border border-contour bg-sheet p-3">
      <summary className="cursor-pointer text-sm font-semibold">Assumptions in this run</summary>
      <dl className="mt-2 space-y-2 text-sm text-ink-muted">
        <div><dt className="font-semibold text-ink">Fuel</dt><dd>{fuel}</dd></div>
        <div><dt className="font-semibold text-ink">Weather</dt><dd>{weather}</dd></div>
        <div><dt className="font-semibold text-ink">Terrain</dt><dd>{terrain}</dd></div>
      </dl>
    </details>
  );
}

export function TimelineSlider({ k, maxK, onChange }: { k: number; maxK: number; onChange: (k: number) => void }) {
  return (
    <div>
      <label htmlFor="timeline" className="block text-xs font-semibold text-ink-muted">Overpass (k = time since the first detection, not a fixed hour)</label>
      <input
        id="timeline"
        type="range"
        min={0}
        max={maxK}
        value={k}
        step={1}
        aria-valuetext={`Overpass ${k} of ${maxK}`}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1 w-full accent-canopy"
      />
      <p className="mt-1 text-xs text-ink-muted">Overpass {k} of {maxK}</p>
    </div>
  );
}

export function BriefingExport({ onExport }: { onExport: () => void }) {
  return (
    <button
      onClick={onExport}
      className="rounded-rq border border-canopy bg-canopy px-4 py-2 text-sm font-semibold text-white hover:bg-canopy-deep"
    >
      Export briefing (includes Uncalibrated-scenario label)
    </button>
  );
}

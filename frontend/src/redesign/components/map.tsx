import type { ReactNode } from 'react';

/** MapShell — the shared map chrome (basemap, overlays, controls). Today this wraps a plain
 *  bordered frame holding whatever child layer is passed in (e.g. IncidentPage's probability
 *  grid); it is not yet a georeferenced MapLibre + PMTiles map. See docs/redesign/PROGRESS.md. */
export function MapShell({ children, label }: { children?: ReactNode; label: string }) {
  return (
    <div role="img" aria-label={label} className="relative aspect-square w-full overflow-hidden rounded-rq border border-contour bg-paper">
      {children ?? <div className="flex h-full items-center justify-center text-sm text-ink-muted">{label}</div>}
    </div>
  );
}

const DEFAULT_LAYERS = [
  { id: 'risk', label: 'Risk cells', available: true },
  { id: 'detections', label: 'Detections', available: true },
  { id: 'incidents', label: 'Incidents', available: true },
  { id: 'boundaries', label: 'Boundaries', available: false },
  { id: 'roads', label: 'Roads', available: false },
  { id: 'villages', label: 'Settlements', available: false },
];

export function LayerPanel({ active, onToggle }: { active: Set<string>; onToggle: (id: string) => void }) {
  return (
    <fieldset className="rounded-rq border border-contour bg-sheet p-3">
      <legend className="px-1 text-xs font-semibold text-ink-muted">Layers</legend>
      <ul className="space-y-1.5">
        {DEFAULT_LAYERS.map((layer) => (
          <li key={layer.id} className="flex items-center justify-between gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                disabled={!layer.available}
                checked={active.has(layer.id)}
                onChange={() => onToggle(layer.id)}
                className="h-4 w-4"
              />
              {layer.label}
            </label>
            {!layer.available && <span className="text-xs text-ink-muted">Unavailable</span>}
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

/** WindArrowsControl — toggles hourly wind-direction arrows on the active scenario map. */
export function WindArrowsControl({ visible, onChange }: { visible: boolean; onChange: (visible: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={visible} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4" />
      <span aria-hidden>↗</span> Show hourly wind arrows
    </label>
  );
}

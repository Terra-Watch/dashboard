/** Static index of the area packs under /whatif/<id>/ (see docs/simulation-whatif/DATA.md). A pack that is listed but fails to load is reported by the page, not hidden. */
export interface AreaEntry {
  id: string;
  name: string;
}

export const AREAS: readonly AreaEntry[] = [
  { id: 'similipal', name: 'Similipal National Park, Odisha' },
  { id: 'almora', name: 'Almora, Uttarakhand' },
  { id: 'ramnagar', name: 'Ramnagar (Corbett), Uttarakhand' },
];

export const DEFAULT_AREA = 'similipal';

export const areaUrl = (id: string, file: string): string => `/whatif/${encodeURIComponent(id)}/${file}`;

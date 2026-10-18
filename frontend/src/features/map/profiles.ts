/** Which layers each role may see on the map, and which are on by default (docs/design/D4, sections 1-3 and 5). The server refuses the data too; this keeps the screen honest. */
export type MapRole = 'citizen' | 'field' | 'control_room';
export type LayerId = 'public_areas' | 'advisories' | 'own_reports' | 'incidents' | 'reports' | 'signals' | 'officers' | 'terrain' | 'wind' | 'scenario' | 'task' | 'risk_forecast';

type Profile = { allowed: readonly LayerId[]; defaults: readonly LayerId[] };

export const PROFILES: Record<MapRole, Profile> = {
  citizen: { allowed: ['public_areas', 'advisories', 'own_reports'], defaults: ['public_areas', 'advisories', 'own_reports'] },
  field: { allowed: ['task', 'signals', 'wind', 'terrain', 'officers'], defaults: ['task', 'wind', 'terrain'] },
  control_room: { allowed: ['incidents', 'reports', 'signals', 'officers', 'advisories', 'terrain', 'wind', 'scenario', 'risk_forecast'], defaults: ['incidents', 'reports', 'signals', 'advisories'] },
};

export const canShow = (role: MapRole, layer: LayerId): boolean => PROFILES[role].allowed.includes(layer);

/** Turn a requested set of layers into the set this role may actually show. */
export function visibleLayers(role: MapRole, requested: Iterable<LayerId>): Set<LayerId> {
  return new Set([...requested].filter(layer => canShow(role, layer)));
}

export const TIME_WINDOWS = [6, 24, 72] as const;
export type TimeWindow = (typeof TIME_WINDOWS)[number];

export const withinHours = (iso: string, hours: number, now: number = Date.now()): boolean => {
  const at = Date.parse(iso);
  return Number.isFinite(at) && now - at <= hours * 3_600_000 && at <= now + 60_000;
};

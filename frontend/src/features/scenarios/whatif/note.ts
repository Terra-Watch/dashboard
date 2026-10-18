import { reachText } from './assets.ts';
import { describeWind, round1, type WindCase } from './wind.ts';

/** Shown on the page at all times and inside every exported image. */
export const DISCLAIMER = 'What-if scenario for planning and training. Not a forecast. Spread rates are not calibrated for Indian fuels. Spotting, crown fire, fuel-moisture change and suppression are not modelled.';

/** Words that must not appear in the page text outside the disclaimer. */
export const FORBIDDEN_WORDS = /forecast|predict|probab|will burn|will reach|will spread|will be reached/i;

export interface NoteInput {
  areaName: string;
  ignitions: Array<{ col: number; row: number; lon: number; lat: number }>;
  cases: Array<{ id: string; wind: WindCase; burnedKm2: number | null; headKm: number | null; backKm: number | null }>;
  hour: number;
  maxHours: number;
  fireLineCount: number;
  /** Up to a few assets per case, already sorted by time. */
  assets: Array<{ caseId: string; name: string; hours: number | null }>;
}

/** Plain-text note to paste into a briefing or the incident timeline by hand. Nothing is sent anywhere. */
export function buildNote(n: NoteInput): string {
  const lines: string[] = [];
  lines.push(`What-if fire spread scenario, ${n.areaName}`);
  lines.push(`Ignitions (${n.ignitions.length}): ${n.ignitions.map(g => `${g.lat.toFixed(4)}, ${g.lon.toFixed(4)}`).join('; ') || 'none'}`);
  lines.push(`Fire lines drawn: ${n.fireLineCount}`);
  lines.push(`Time shown: ${round1(n.hour)} h of ${n.maxHours} h`);
  for (const c of n.cases) {
    lines.push(`Case ${c.id}: wind ${describeWind(c.wind)}`);
    if (c.burnedKm2 !== null) lines.push(`  Burned area at ${round1(n.hour)} h: ${c.burnedKm2.toFixed(2)} km2; head reach ${(c.headKm ?? 0).toFixed(1)} km; back reach ${(c.backKm ?? 0).toFixed(1)} km`);
    for (const a of n.assets.filter(x => x.caseId === c.id)) lines.push(`  ${a.name}: ${reachText(a.hours, n.maxHours)}`);
  }
  lines.push('');
  lines.push(DISCLAIMER);
  return lines.join('\n');
}

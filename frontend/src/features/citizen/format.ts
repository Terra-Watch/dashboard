import i18n from '../../ui/i18n';

export const STATES: Array<{ code: string; name: string }> = [
  { code: 'OD', name: 'Odisha' }, { code: 'CG', name: 'Chhattisgarh' }, { code: 'JH', name: 'Jharkhand' },
  { code: 'MP', name: 'Madhya Pradesh' }, { code: 'MH', name: 'Maharashtra' }, { code: 'TS', name: 'Telangana' },
];

export function stateName(code: string | null | undefined): string { return STATES.find(item => item.code === code)?.name ?? (code ?? ''); }

export function formatWhen(iso: string | null | undefined): string {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(i18n.language || 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export { parseCoordinates } from './coordinates';

/** Rough bounding boxes [west, south, east, north] of the six supported states, used only for the first view and for fetching satellite signals. */
export const STATE_BOUNDS: Record<string, [number, number, number, number]> = {
  OD: [81.3, 17.8, 87.5, 22.6], CG: [80.2, 17.8, 84.4, 24.1], JH: [83.3, 21.9, 87.9, 25.4],
  MP: [74.0, 21.0, 82.8, 26.9], MH: [72.6, 15.6, 80.9, 22.1], TS: [77.2, 15.8, 81.8, 19.9],
};

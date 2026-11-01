import i18n from '../../ui/i18n';

/** Every Indian state and union territory (generated from backend/app/data/india_states.json by scripts/build_india_states.py). */
export const STATES: Array<{ code: string; name: string }> = [
  { code: 'AN', name: 'Andaman and Nicobar Islands' },
  { code: 'AP', name: 'Andhra Pradesh' },
  { code: 'AR', name: 'Arunachal Pradesh' },
  { code: 'AS', name: 'Assam' },
  { code: 'BR', name: 'Bihar' },
  { code: 'CH', name: 'Chandigarh' },
  { code: 'CG', name: 'Chhattisgarh' },
  { code: 'DH', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: 'DL', name: 'Delhi' },
  { code: 'GA', name: 'Goa' },
  { code: 'GJ', name: 'Gujarat' },
  { code: 'HR', name: 'Haryana' },
  { code: 'HP', name: 'Himachal Pradesh' },
  { code: 'JK', name: 'Jammu and Kashmir' },
  { code: 'JH', name: 'Jharkhand' },
  { code: 'KA', name: 'Karnataka' },
  { code: 'KL', name: 'Kerala' },
  { code: 'LA', name: 'Ladakh' },
  { code: 'LD', name: 'Lakshadweep' },
  { code: 'MP', name: 'Madhya Pradesh' },
  { code: 'MH', name: 'Maharashtra' },
  { code: 'MN', name: 'Manipur' },
  { code: 'ML', name: 'Meghalaya' },
  { code: 'MZ', name: 'Mizoram' },
  { code: 'NL', name: 'Nagaland' },
  { code: 'OD', name: 'Odisha' },
  { code: 'PY', name: 'Puducherry' },
  { code: 'PB', name: 'Punjab' },
  { code: 'RJ', name: 'Rajasthan' },
  { code: 'SK', name: 'Sikkim' },
  { code: 'TN', name: 'Tamil Nadu' },
  { code: 'TS', name: 'Telangana' },
  { code: 'TR', name: 'Tripura' },
  { code: 'UP', name: 'Uttar Pradesh' },
  { code: 'UK', name: 'Uttarakhand' },
  { code: 'WB', name: 'West Bengal' },
];

export function stateName(code: string | null | undefined): string { return STATES.find(item => item.code === code)?.name ?? (code ?? ''); }

export function formatWhen(iso: string | null | undefined): string {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(i18n.language || 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export { parseCoordinates } from './coordinates';

/** Rough bounding boxes [west, south, east, north] of every state, used only for the first map view and for fetching satellite signals. The server decides which state a report is in. */
export const STATE_BOUNDS: Record<string, [number, number, number, number]> = {
  AN: [92.2, 6.8, 93.9, 13.7],
  AP: [76.8, 12.6, 84.8, 19.2],
  AR: [91.5, 26.7, 97.4, 29.5],
  AS: [89.7, 24.1, 96.0, 28.0],
  BR: [83.3, 24.3, 88.3, 27.5],
  CH: [76.7, 30.7, 76.8, 30.8],
  CG: [80.2, 17.8, 84.4, 24.1],
  DH: [70.9, 20.0, 73.2, 20.7],
  DL: [76.8, 28.4, 77.3, 28.9],
  GA: [73.7, 14.9, 74.3, 15.8],
  GJ: [68.1, 20.1, 74.5, 24.7],
  HR: [74.5, 27.7, 77.6, 30.9],
  HP: [75.6, 30.4, 79.0, 33.3],
  JK: [73.4, 32.3, 76.8, 35.1],
  JH: [83.3, 22.0, 88.0, 25.3],
  KA: [74.1, 11.6, 78.6, 18.5],
  KL: [74.9, 8.3, 77.4, 12.8],
  LA: [72.5, 32.3, 80.3, 37.1],
  LD: [72.2, 8.3, 73.7, 11.7],
  MP: [74.0, 21.1, 82.8, 26.9],
  MH: [72.7, 15.6, 80.9, 22.0],
  MN: [93.0, 23.8, 94.7, 25.7],
  ML: [89.8, 25.0, 92.8, 26.1],
  MZ: [92.3, 21.9, 93.4, 24.5],
  NL: [93.3, 25.2, 95.2, 27.0],
  OD: [81.4, 17.8, 87.5, 22.6],
  PY: [75.5, 10.8, 82.3, 16.8],
  PB: [73.9, 29.5, 76.9, 32.5],
  RJ: [69.5, 23.1, 78.3, 30.2],
  SK: [88.0, 27.1, 88.9, 28.1],
  TN: [76.2, 8.1, 80.3, 13.6],
  TS: [77.2, 15.8, 81.3, 19.9],
  TR: [91.2, 22.9, 92.3, 24.5],
  UP: [77.1, 23.9, 84.6, 30.4],
  UK: [77.6, 28.7, 81.0, 31.5],
  WB: [85.8, 21.5, 89.9, 27.2],
};

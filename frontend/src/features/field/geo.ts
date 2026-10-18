const R = 6371.0088;
const rad = (degrees: number) => (degrees * Math.PI) / 180;

/** Straight-line distance in km between two points (not travel time). */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial compass bearing in degrees (0 = north, clockwise) from a to b. */
export function bearingDeg(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

const POINTS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export function compassPoint(degrees: number): string { return POINTS[Math.round((((degrees % 360) + 360) % 360) / 22.5) % 16]; }

export function distanceText(km: number): string { return km < 1 ? `${Math.round(km * 1000 / 50) * 50} m` : km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`; }

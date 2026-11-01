/** Wind on a coarse lat/lon grid, as the server sends it (u east and v north in m/s, indexed [lat][lon], lats south to north, lons west to east). */
export type WindGrid = {
  lats: number[]; lons: number[]; u: number[][]; v: number[][]; valid_time: string;
};

/** Bilinear wind at a point. Outside the grid there is no wind (null), or with `extend` the wind of the nearest edge, so the flow has no hard border. */
export function sampleWind(g: WindGrid, lat: number, lon: number, extend = false): { u: number; v: number } | null {
  const { lats, lons } = g;
  if (extend) { lat = Math.min(Math.max(lat, lats[0]), lats[lats.length - 1]); lon = Math.min(Math.max(lon, lons[0]), lons[lons.length - 1]); }
  else if (lat < lats[0] || lat > lats[lats.length - 1] || lon < lons[0] || lon > lons[lons.length - 1]) return null;
  const find = (axis: number[], x: number) => { let i = 0; while (i < axis.length - 2 && x > axis[i + 1]) i++; return i; };
  const i = find(lats, lat), j = find(lons, lon);
  const ty = (lat - lats[i]) / (lats[i + 1] - lats[i]), tx = (lon - lons[j]) / (lons[j + 1] - lons[j]);
  const mix = (f: number[][]) => (f[i][j] * (1 - tx) + f[i][j + 1] * tx) * (1 - ty) + (f[i + 1][j] * (1 - tx) + f[i + 1][j + 1] * tx) * ty;
  return { u: mix(g.u), v: mix(g.v) };
}

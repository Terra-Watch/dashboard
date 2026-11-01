export type Detection = { id: number; latitude: number; longitude: number; acq_datetime: string; forest_state?: string | null };
export type Cluster = { key: string; lat: number; lon: number; count: number; latest: string; state: string | null };

/** Detections grouped by 0.1 degree cell (about 11 km), the same cell the server uses to announce clusters. Only groups of `min` or more are returned, biggest first. */
export function clusterDetections(items: Detection[], min = 5): Cluster[] {
  const cells = new Map<string, Detection[]>();
  for (const d of items) {
    const key = `${Math.round(d.latitude * 10)}:${Math.round(d.longitude * 10)}`;
    (cells.get(key) ?? cells.set(key, []).get(key)!).push(d);
  }
  return [...cells.entries()].filter(([, v]) => v.length >= min).map(([key, v]) => ({
    key, lat: v.reduce((a, d) => a + d.latitude, 0) / v.length, lon: v.reduce((a, d) => a + d.longitude, 0) / v.length, count: v.length,
    latest: v.map(d => d.acq_datetime).sort().slice(-1)[0], state: v.find(d => d.forest_state)?.forest_state ?? null,
  })).sort((a, b) => b.count - a.count || (a.latest < b.latest ? 1 : -1));
}

// Placement of the simulation raster on the map. Pure functions, no imports,
// so they can be unit-tested with `npm run test:unit`.
// The conversion matches backend/inference/simulation_domain.py.

export type LngLat = [number, number];
export type Corners = [LngLat, LngLat, LngLat, LngLat];
export type GridSpec = { rows: number; columns: number; cellSizeM: number };
export type Center = { latitude: number; longitude: number };

export const DEFAULT_CENTER: Center = { latitude: 21.867894, longitude: 86.500688 };
export const DEFAULT_GRID: GridSpec = { rows: 40, columns: 40, cellSizeM: 30 };

export function metresPerDegree(latitude: number): { lat: number; lon: number } {
  const phi = (latitude * Math.PI) / 180;
  return {
    lat: 111132.92 - 559.82 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi),
    lon: 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi),
  };
}

/** Half-extent of the raster in degrees: (latitude, longitude). */
export function halfExtentDegrees(center: Center, grid: GridSpec): { lat: number; lon: number } {
  const per = metresPerDegree(center.latitude);
  return { lat: (grid.rows * grid.cellSizeM) / 2 / per.lat, lon: (grid.columns * grid.cellSizeM) / 2 / per.lon };
}

/** MapLibre canvas/image corners: top-left, top-right, bottom-right, bottom-left (row 0 is north). */
export function gridCorners(center: Center, grid: GridSpec = DEFAULT_GRID): Corners {
  const half = halfExtentDegrees(center, grid);
  const west = center.longitude - half.lon, east = center.longitude + half.lon;
  const north = center.latitude + half.lat, south = center.latitude - half.lat;
  return [[west, north], [east, north], [east, south], [west, south]];
}

/** [[west, south], [east, north]] for fitBounds / initialViewState.bounds. */
export function gridBounds(center: Center, grid: GridSpec = DEFAULT_GRID): [LngLat, LngLat] {
  const [topLeft, , bottomRight] = gridCorners(center, grid);
  return [[topLeft[0], bottomRight[1]], [bottomRight[0], topLeft[1]]];
}

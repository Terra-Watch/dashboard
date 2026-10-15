export type MapBounds = [west: number, south: number, east: number, north: number];
export type LngLat = [lon: number, lat: number];

export const EMPTY_GEOJSON: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/** Validate an individual coordinate pair as a finite [longitude, latitude] in WGS84 bounds. */
export function isValidCoordinate(coord: unknown): coord is [number, number] {
  return (
    Array.isArray(coord) &&
    coord.length >= 2 &&
    typeof coord[0] === 'number' &&
    typeof coord[1] === 'number' &&
    Number.isFinite(coord[0]) &&
    Number.isFinite(coord[1]) &&
    coord[0] >= -180 &&
    coord[0] <= 180 &&
    coord[1] >= -90 &&
    coord[1] <= 90
  );
}

/** Validate MapBounds as a strict, non-inverted, finite [west, south, east, north] in WGS84. */
export function isValidBounds(b?: unknown): b is MapBounds {
  return (
    Array.isArray(b) &&
    b.length === 4 &&
    b.every((n) => typeof n === 'number' && Number.isFinite(n)) &&
    b[0] >= -180 &&
    b[2] <= 180 &&
    b[1] >= -90 &&
    b[3] <= 90 &&
    b[0] < b[2] &&
    b[1] < b[3]
  );
}

/** Validate center coordinate as a finite [longitude, latitude] in WGS84. */
export function isValidCenter(c?: unknown): c is [number, number] {
  return (
    Array.isArray(c) &&
    c.length === 2 &&
    typeof c[0] === 'number' &&
    typeof c[1] === 'number' &&
    Number.isFinite(c[0]) &&
    Number.isFinite(c[1]) &&
    c[0] >= -180 &&
    c[0] <= 180 &&
    c[1] >= -90 &&
    c[1] <= 90
  );
}

/** Check if coordinates for a given GeoJSON geometry type conform to standards. */
export function validateGeometryCoords(type: string, coords: unknown): boolean {
  if (!Array.isArray(coords)) return false;
  switch (type) {
    case 'Point':
      return isValidCoordinate(coords);
    case 'MultiPoint':
    case 'LineString':
      return coords.length > 0 && coords.every(isValidCoordinate);
    case 'MultiLineString':
    case 'Polygon':
      return (
        coords.length > 0 &&
        coords.every((ring) => Array.isArray(ring) && ring.length >= (type === 'Polygon' ? 4 : 1) && ring.every(isValidCoordinate))
      );
    case 'MultiPolygon':
      return (
        coords.length > 0 &&
        coords.every(
          (poly) => Array.isArray(poly) && poly.length > 0 && poly.every((ring) => Array.isArray(ring) && ring.length >= 4 && ring.every(isValidCoordinate))
        )
      );
    default:
      return false;
  }
}

/** Recursively validate GeoJSON geometry structure and coordinates. */
export function isValidGeometry(geom: unknown): boolean {
  if (!geom || typeof geom !== 'object') return false;
  const g = geom as { type?: unknown; coordinates?: unknown; geometries?: unknown };
  if (typeof g.type !== 'string') return false;
  if (g.type === 'GeometryCollection') {
    return Array.isArray(g.geometries) && g.geometries.length > 0 && g.geometries.every(isValidGeometry);
  }
  return validateGeometryCoords(g.type, g.coordinates);
}

/** Validate a GeoJSON Feature object. */
export function isValidFeature(feat: unknown): feat is GeoJSON.Feature {
  if (!feat || typeof feat !== 'object') return false;
  const f = feat as { type?: unknown; geometry?: unknown };
  if (f.type !== 'Feature') return false;
  if (!f.geometry || !isValidGeometry(f.geometry)) return false;
  return true;
}

/** Sanitize an incoming GeoJSON FeatureCollection, stripping malformed features and NaN coordinates. */
export function toSafeGeoJson(data?: GeoJSON.FeatureCollection | null): GeoJSON.FeatureCollection {
  if (data && data.type === 'FeatureCollection' && Array.isArray(data.features)) {
    const validFeatures = data.features.filter(isValidFeature);
    if (validFeatures.length === data.features.length) {
      return data;
    }
    return {
      type: 'FeatureCollection',
      features: validFeatures,
    };
  }
  return EMPTY_GEOJSON;
}

/** Extract all coordinate tuples from any GeoJSON geometry object. */
export function extractCoordinates(geometry: GeoJSON.Geometry): number[][] {
  const points: number[][] = [];
  const visit = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
      if (Number.isFinite(value[0]) && Number.isFinite(value[1])) {
        points.push([value[0], value[1]]);
      }
      return;
    }
    value.forEach(visit);
  };
  if (geometry.type === 'GeometryCollection') {
    geometry.geometries.forEach((item) => points.push(...extractCoordinates(item)));
  } else {
    visit(geometry.coordinates);
  }
  return points;
}

/** Safely compute bounding box for a FeatureCollection and optional extra coordinates. */
export function computeFeatureCollectionBounds(
  data?: GeoJSON.FeatureCollection | null,
  extraPoints?: Array<[number, number]>
): MapBounds | undefined {
  const points: number[][] = [];
  if (data && Array.isArray(data.features)) {
    for (const feat of data.features) {
      if (feat && feat.geometry) {
        points.push(...extractCoordinates(feat.geometry));
      }
    }
  }
  if (extraPoints?.length) {
    for (const pt of extraPoints) {
      if (isValidCoordinate(pt)) points.push(pt);
    }
  }
  if (!points.length) return undefined;
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const minX = Math.max(-180, Math.min(...xs));
  const maxX = Math.min(180, Math.max(...xs));
  const minY = Math.max(-90, Math.min(...ys));
  const maxY = Math.min(90, Math.max(...ys));
  const padX = Math.max((maxX - minX) * 0.12, 0.015);
  const padY = Math.max((maxY - minY) * 0.12, 0.015);
  return [
    Math.max(-180, minX - padX),
    Math.max(-90, minY - padY),
    Math.min(180, maxX + padX),
    Math.min(90, maxY + padY),
  ];
}

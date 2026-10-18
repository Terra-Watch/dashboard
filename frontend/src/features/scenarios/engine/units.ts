/**
 * Units, errors and small planar/spherical geometry helpers shared by the
 * scenario engines. Pure, deterministic, no DOM, no React.
 *
 * Conventions: distances in km, angles in degrees, GeoJSON order [lon, lat].
 * Bearings are compass degrees clockwise from north.
 */

/** Mean Earth radius in km (IUGG). */
export const EARTH_RADIUS_KM = 6371.0088;

/** A WGS84 position in degrees. */
export interface LatLon {
  lat: number;
  lon: number;
}

/** GeoJSON Polygon (outer ring first; only the outer ring is used by this module). */
export interface GeoPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

/** Machine-readable reasons an input was refused. */
export type ScenarioErrorCode =
  | 'invalid_ros'
  | 'invalid_wind_speed'
  | 'invalid_wind_direction'
  | 'invalid_hours'
  | 'invalid_position'
  | 'invalid_schedule'
  | 'invalid_uncertainty'
  | 'invalid_polygon'
  | 'invalid_vertices'
  | 'invalid_observation'
  | 'missing_threshold'
  | 'invalid_claim';

/** Typed error thrown for every refused input. UI maps `code` to words. */
export class ScenarioInputError extends Error {
  readonly code: ScenarioErrorCode;
  readonly field: string;
  constructor(code: ScenarioErrorCode, field: string, detail?: string) {
    super(`${code}: ${field}${detail ? ` (${detail})` : ''}`);
    this.name = 'ScenarioInputError';
    this.code = code;
    this.field = field;
  }
}

const KMH_PER_MPH = 1.609344;

/** Convert km/h to miles per hour (exact factor 1.609344 km per mile). */
export function kmhToMph(kmh: number): number {
  return kmh / KMH_PER_MPH;
}

/** Convert km/h to metres per second. */
export function kmhToMs(kmh: number): number {
  return kmh / 3.6;
}

/** Convert miles per hour to km/h. */
export function mphToKmh(mph: number): number {
  return mph * KMH_PER_MPH;
}

/** Degrees to radians. */
export function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Radians to degrees. */
export function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Normalise any finite angle to [0, 360). */
export function normalizeDeg(deg: number): number {
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

/** True when the value is a finite number. */
export function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Throws `invalid_position` unless lat is in [-90, 90] and lon in [-180, 180]. */
export function assertLatLon(p: LatLon, field: string): void {
  if (
    !p ||
    !isFiniteNumber(p.lat) ||
    !isFiniteNumber(p.lon) ||
    p.lat < -90 ||
    p.lat > 90 ||
    p.lon < -180 ||
    p.lon > 180
  ) {
    throw new ScenarioInputError('invalid_position', field);
  }
}

/** Great-circle (haversine) distance in km between two positions. */
export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial great-circle bearing from a to b, degrees in [0, 360). */
export function bearingDeg(a: LatLon, b: LatLon): number {
  const p1 = toRad(a.lat);
  const p2 = toRad(b.lat);
  const dl = toRad(b.lon - a.lon);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return normalizeDeg(toDeg(Math.atan2(y, x)));
}

/** Great-circle destination from `start` travelling `distanceKm` on `bearing` degrees. */
export function destinationPoint(start: LatLon, bearing: number, distanceKm: number): LatLon {
  const d = distanceKm / EARTH_RADIUS_KM;
  const brg = toRad(bearing);
  const p1 = toRad(start.lat);
  const l1 = toRad(start.lon);
  const sinP2 = Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(brg);
  const p2 = Math.asin(Math.max(-1, Math.min(1, sinP2)));
  const l2 =
    l1 +
    Math.atan2(
      Math.sin(brg) * Math.sin(d) * Math.cos(p1),
      Math.cos(d) - Math.sin(p1) * sinP2,
    );
  return { lat: toDeg(p2), lon: ((toDeg(l2) + 540) % 360) - 180 };
}

/** Validate a GeoJSON polygon and return its outer ring (closed, >= 4 positions). */
export function outerRing(poly: GeoPolygon, field = 'polygon'): number[][] {
  const ring = poly?.coordinates?.[0];
  if (
    poly?.type !== 'Polygon' ||
    !Array.isArray(ring) ||
    ring.length < 4 ||
    ring.some((c) => !Array.isArray(c) || !isFiniteNumber(c[0]) || !isFiniteNumber(c[1]))
  ) {
    throw new ScenarioInputError('invalid_polygon', field);
  }
  return ring;
}

type XY = [number, number];

/** Project a lon/lat ring to local planar km around its first-vertex latitude/longitude. */
function projectRing(ring: number[][], origin: LatLon): XY[] {
  const kx = EARTH_RADIUS_KM * Math.cos(toRad(origin.lat)) * (Math.PI / 180);
  const ky = EARTH_RADIUS_KM * (Math.PI / 180);
  const pts: XY[] = ring.map((c) => [(c[0] - origin.lon) * kx, (c[1] - origin.lat) * ky]);
  // drop closing duplicate
  const f = pts[0];
  const l = pts[pts.length - 1];
  if (pts.length > 1 && f[0] === l[0] && f[1] === l[1]) pts.pop();
  return pts;
}

function signedArea(pts: XY[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

/**
 * Area of a polygon outer ring in km^2, using a local equirectangular
 * projection about the ring's mean vertex (error well under 0.5% for rings
 * up to ~200 km across at these latitudes).
 */
export function polygonAreaKm2(poly: GeoPolygon): number {
  const ring = outerRing(poly);
  const origin = ringOrigin(ring);
  return Math.abs(signedArea(projectRing(ring, origin)));
}

function ringOrigin(ring: number[][]): LatLon {
  let lat = 0;
  let lon = 0;
  for (const c of ring) {
    lon += c[0];
    lat += c[1];
  }
  return { lat: lat / ring.length, lon: lon / ring.length };
}

/** Ray-casting point-in-polygon on the outer ring (lon/lat as planar; boundary is treated as not guaranteed). */
export function pointInPolygon(point: LatLon, poly: GeoPolygon): boolean {
  const ring = outerRing(poly);
  const x = point.lon;
  const y = point.lat;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function cross(o: XY, a: XY, b: XY): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function pointInTri(p: XY, a: XY, b: XY, c: XY): boolean {
  return cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
}

/** Ear-clipping triangulation of a simple CCW polygon. */
function triangulate(pts: XY[]): [XY, XY, XY][] {
  const idx = pts.map((_, i) => i);
  const tris: [XY, XY, XY][] = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let clipped = false;
    for (let k = 0; k < idx.length; k++) {
      const a = pts[idx[(k + idx.length - 1) % idx.length]];
      const b = pts[idx[k]];
      const c = pts[idx[(k + 1) % idx.length]];
      if (cross(a, b, c) <= 1e-12) continue; // reflex or degenerate
      let ear = true;
      for (const j of idx) {
        const p = pts[j];
        if (p === a || p === b || p === c) continue;
        if (pointInTri(p, a, b, c)) {
          ear = false;
          break;
        }
      }
      if (ear) {
        tris.push([a, b, c]);
        idx.splice(k, 1);
        clipped = true;
        break;
      }
    }
    if (!clipped) idx.splice(0, 1); // degenerate input: drop a vertex and continue
  }
  if (idx.length === 3) tris.push([pts[idx[0]], pts[idx[1]], pts[idx[2]]]);
  return tris;
}

/** Sutherland-Hodgman clip of `subject` against a convex CCW triangle. */
function clipByTriangle(subject: XY[], tri: [XY, XY, XY]): XY[] {
  let out = subject;
  for (let e = 0; e < 3; e++) {
    const a = tri[e];
    const b = tri[(e + 1) % 3];
    const input = out;
    out = [];
    if (input.length === 0) break;
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      const curIn = cross(a, b, cur) >= 0;
      const prevIn = cross(a, b, prev) >= 0;
      if (curIn !== prevIn) {
        const d1 = cross(a, b, prev);
        const d2 = cross(a, b, cur);
        const t = d1 / (d1 - d2);
        out.push([prev[0] + t * (cur[0] - prev[0]), prev[1] + t * (cur[1] - prev[1])]);
      }
      if (curIn) out.push(cur);
    }
  }
  return out;
}

/**
 * Area (km^2) of the intersection of two polygons' outer rings. Both may be
 * concave but must be simple (non self-intersecting). Method: triangulate one
 * polygon (ear clipping), clip the other against each triangle
 * (Sutherland-Hodgman) and sum shoelace areas; triangles are disjoint so the
 * sum is exact for the planar projection.
 */
export function intersectionAreaKm2(a: GeoPolygon, b: GeoPolygon): number {
  const ra = outerRing(a, 'a');
  const rb = outerRing(b, 'b');
  const origin = ringOrigin([...ra, ...rb]);
  let pa = projectRing(ra, origin);
  let pb = projectRing(rb, origin);
  if (signedArea(pa) < 0) pa = pa.slice().reverse();
  if (signedArea(pb) < 0) pb = pb.slice().reverse();
  let total = 0;
  for (const tri of triangulate(pb)) {
    total += Math.abs(signedArea(clipByTriangle(pa, tri)));
  }
  return total;
}

/** Build a closed GeoJSON polygon from lat/lon vertices (ring closed automatically). */
export function polygonFromLatLons(points: LatLon[]): GeoPolygon {
  const ring = points.map((p) => [p.lon, p.lat]);
  ring.push([points[0].lon, points[0].lat]);
  return { type: 'Polygon', coordinates: [ring] };
}

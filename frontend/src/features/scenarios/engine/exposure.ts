/**
 * Asset exposure: for each asset, the earliest requested hour at which it lies
 * inside the outer band and inside the inner band. This is a planning
 * arrival-time RANGE under stated inputs, never a statement that an asset
 * will burn or is safe. Hours are the envelope hours supplied (resolution is
 * those hours, e.g. 1, 3, 6, 12, 24).
 */
import { type GeoPolygon, ScenarioInputError, assertLatLon, pointInPolygon } from './units.ts';

/** A place that may be exposed. */
export interface Asset {
  id: string;
  name: string;
  kind: string;
  lat: number;
  lon: number;
}

/** Inner/outer band at one hour (a subset of BandSet). */
export interface HourBands {
  hour: number;
  inner: GeoPolygon;
  outer: GeoPolygon;
}

/** Exposure of one asset. Null means not reached within the supplied hours. */
export interface AssetExposure {
  asset: Asset;
  /** First hour the asset is inside the outer band (earliest possible arrival). */
  earliestInOuterHour: number | null;
  /** First hour the asset is inside the inner band (arrival under all-minus inputs). */
  earliestInInnerHour: number | null;
}

/**
 * Compute exposure for all assets. Result is sorted by earliestInOuterHour
 * ascending (unreached last), then by earliestInInnerHour (null last), then
 * name, then id, so ordering is deterministic. Bands must be in increasing hour order.
 */
export function assessExposure(bands: readonly HourBands[], assets: readonly Asset[]): AssetExposure[] {
  bands.forEach((b, i) => {
    if (i > 0 && b.hour <= bands[i - 1].hour) throw new ScenarioInputError('invalid_hours', `bands[${i}].hour`);
  });
  const rows = assets.map((asset): AssetExposure => {
    assertLatLon(asset, `asset ${asset.id}`);
    let outerHour: number | null = null;
    let innerHour: number | null = null;
    for (const b of bands) {
      if (outerHour === null && pointInPolygon(asset, b.outer)) outerHour = b.hour;
      if (innerHour === null && pointInPolygon(asset, b.inner)) innerHour = b.hour;
    }
    return { asset, earliestInOuterHour: outerHour, earliestInInnerHour: innerHour };
  });
  const key = (v: number | null) => (v === null ? Infinity : v);
  return rows.sort(
    (x, y) =>
      key(x.earliestInOuterHour) - key(y.earliestInOuterHour) ||
      key(x.earliestInInnerHour) - key(y.earliestInInnerHour) ||
      x.asset.name.localeCompare(y.asset.name) ||
      x.asset.id.localeCompare(y.asset.id),
  );
}

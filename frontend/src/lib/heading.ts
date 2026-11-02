/** Which way the phone's back camera points, from the phone's orientation sensors. Degrees clockwise from north (magnetic; India's declination is small next to a phone compass's error). */

export const ROSE = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export type RosePoint = (typeof ROSE)[number];

const rad = (d: number) => (d * Math.PI) / 180;
const norm = (d: number) => ((d % 360) + 360) % 360;

/** The direction the camera looks along, from the W3C alpha/beta/gamma angles measured against the Earth (alpha 0 = north). Null when the camera points almost straight up or down:
 * there is no horizontal direction to report. Holding the phone upright and facing north gives 0; turning left by 90 degrees (alpha 90) gives 270. */
export function cameraHeading(alpha: number, beta: number, gamma: number): number | null {
  const [ca, sa, cb, sb, cg, sg] = [Math.cos(rad(alpha)), Math.sin(rad(alpha)), Math.cos(rad(beta)), Math.sin(rad(beta)), Math.cos(rad(gamma)), Math.sin(rad(gamma))];
  const east = -ca * sg - sa * sb * cg;
  const north = -sa * sg + ca * sb * cg;
  if (Math.hypot(east, north) < 0.3) return null;           // within about 17 degrees of straight up or down
  return norm((Math.atan2(east, north) * 180) / Math.PI);
}

/** The average of several headings (they wrap at 360, so a plain average of 359 and 1 would be wrong). Null for an empty list. */
export function meanHeading(values: number[]): number | null {
  if (!values.length) return null;
  const x = values.reduce((s, v) => s + Math.cos(rad(v)), 0), y = values.reduce((s, v) => s + Math.sin(rad(v)), 0);
  return norm((Math.atan2(y, x) * 180) / Math.PI);
}

export const rosePoint = (deg: number): RosePoint => ROSE[Math.round(norm(deg) / 45) % 8];
export const roseDegrees = (point: RosePoint): number => ROSE.indexOf(point) * 45;

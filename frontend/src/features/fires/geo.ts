/** Distance in km between two points (flat-earth, fine under a few hundred km). */
export function km(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const x = (bLon - aLon) * 111.32 * Math.cos(((aLat + bLat) / 2) * Math.PI / 180), y = (bLat - aLat) * 111.32;
  return Math.hypot(x, y);
}

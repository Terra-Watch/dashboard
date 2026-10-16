/** Parse "20.3, 85.8" or "20.3 85.8" into valid coordinates, or null. */
export function parseCoordinates(text: string): { lat: number; lon: number } | null {
  const match = text.trim().match(/^(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]), lon = Number(match[2]);
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 ? { lat, lon } : null;
}

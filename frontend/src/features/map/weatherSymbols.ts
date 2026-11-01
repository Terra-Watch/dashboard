/** What the sky is doing, from the WMO weather code the forecast service sends: an icon and plain words (the words are what a screen reader hears). */
export function describeWeather(code: number | null | undefined, isDay: number | null | undefined = 1): { icon: string; label: string } | null {
  if (code == null) return null;
  const day = isDay !== 0;
  if (code === 0) return day ? { icon: '☀️', label: 'Clear' } : { icon: '🌙', label: 'Clear night' };
  if (code === 1) return day ? { icon: '🌤️', label: 'Mostly clear' } : { icon: '🌙', label: 'Mostly clear night' };
  if (code === 2) return { icon: '⛅', label: 'Partly cloudy' };
  if (code === 3) return { icon: '☁️', label: 'Cloudy' };
  if (code === 45 || code === 48) return { icon: '🌫️', label: 'Fog' };
  if (code >= 51 && code <= 57) return { icon: '🌦️', label: 'Drizzle' };
  if ((code >= 61 && code <= 65) || code === 66 || code === 67) return { icon: '🌧️', label: 'Rain' };
  if (code >= 71 && code <= 77) return { icon: '🌨️', label: 'Snow' };
  if (code >= 80 && code <= 82) return { icon: '🌦️', label: 'Showers' };
  if (code === 85 || code === 86) return { icon: '🌨️', label: 'Snow showers' };
  if (code >= 95) return { icon: '⛈️', label: 'Thunderstorm' };
  return { icon: '🌡️', label: 'Weather' };
}

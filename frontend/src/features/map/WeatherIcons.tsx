import { useEffect } from 'react';
import * as maplibregl from 'maplibre-gl';
import { describeWeather } from './weatherSymbols';
import type { MapInstance } from './WindLayer';
import type { WindGrid } from './windField';

/** Weather icons on the map: one per forecast grid point (icon and temperature), like a weather app. Markers carry words for screen readers and do not take clicks. */
export function WeatherIcons({ map, grid }: { map: MapInstance | null; grid?: WindGrid }) {
  useEffect(() => {
    if (!map || !grid?.code) return;
    const markers: Array<InstanceType<typeof maplibregl.Marker>> = [];
    grid.lats.forEach((lat, i) => grid.lons.forEach((lon, j) => {
      const w = describeWeather(grid.code![i]?.[j], grid.is_day?.[i]?.[j]);
      if (!w) return;
      const temp = grid.temp?.[i]?.[j], rain = grid.precip?.[i]?.[j];
      const el = document.createElement('div');
      el.style.cssText = 'pointer-events:none;display:flex;flex-direction:column;align-items:center;line-height:1;text-shadow:0 0 3px #fff,0 0 3px #fff;font-weight:700;';
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', `${w.label}${temp != null ? `, ${Math.round(temp)} degrees` : ''}${rain ? `, ${rain} millimetres of rain` : ''}`);
      el.innerHTML = `<span style="font-size:24px" aria-hidden="true">${w.icon}</span>${temp != null ? `<span style="font-size:11px;color:#111827" aria-hidden="true">${Math.round(temp)}°</span>` : ''}`;
      markers.push(new maplibregl.Marker({ element: el }).setLngLat([lon, lat]).addTo(map));
    }));
    return () => markers.forEach(m => m.remove());
  }, [map, grid]);
  return null;
}

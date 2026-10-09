import { useEffect } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import { API } from '../app/config';

type RiskLayerProps = { mapRef: React.RefObject<MapRef | null>; ready: boolean; targetDate: string; visible: boolean };

export function RiskLayer({ mapRef, ready, targetDate, visible }: RiskLayerProps) {
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !ready) return;
    let cancelled = false;
    fetch(`${API}/api/risk/geojson?target=${targetDate}`)
      .then(response => response.ok ? response.json() : Promise.reject(new Error('Risk geometry unavailable.')))
      .then(data => {
        if (cancelled) return;
        const source = map.getSource('risk-cells') as { setData(data: unknown): void } | undefined;
        if (source) { source.setData(data); return; }
        map.addSource('risk-cells', { type: 'geojson', data });
        map.addLayer({ id: 'risk-cells-fill', type: 'fill', source: 'risk-cells', filter: ['==', ['geometry-type'], 'Polygon'], layout: { visibility: visible ? 'visible' : 'none' }, paint: {
          'fill-color': ['match', ['get', 'band'], 'Very high', '#b0183a', 'High', '#e5701f', 'Moderate', '#e9b824', '#bfd8cf'],
          'fill-opacity': 0.58, 'fill-outline-color': '#ffffff',
        } });
        map.addLayer({ id: 'risk-cells-points', type: 'circle', source: 'risk-cells', filter: ['==', ['geometry-type'], 'Point'], layout: { visibility: visible ? 'visible' : 'none' }, paint: {
          'circle-color': ['match', ['get', 'band'], 'Very high', '#b0183a', 'High', '#e5701f', 'Moderate', '#e9b824', '#bfd8cf'],
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 2.5, 8, 6], 'circle-opacity': 0.72, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 0.5,
        } });
      })
      .catch(() => { /* Empty geometry is a valid unavailable state. */ });
    if (map.getLayer('risk-cells-fill')) map.setLayoutProperty('risk-cells-fill', 'visibility', visible ? 'visible' : 'none');
    if (map.getLayer('risk-cells-points')) map.setLayoutProperty('risk-cells-points', 'visibility', visible ? 'visible' : 'none');
    return () => { cancelled = true; };
  }, [mapRef, ready, targetDate, visible]);
  return null;
}

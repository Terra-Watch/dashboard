import { useEffect, useRef } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import { API } from '../app/config';

type RiskLayerProps = {
  mapRef: React.RefObject<MapRef | null>;
  ready: boolean;
  targetDate: string;
  visible: boolean;
  onGeometryLoaded?: () => void;
  /** cell_id of the currently selected record — drives the selection highlight layer. */
  selectedCellId?: number | null;
};

export function RiskLayer({ mapRef, ready, targetDate, visible, selectedCellId, onGeometryLoaded }: RiskLayerProps) {
  const selectedIdRef = useRef<number | null>(selectedCellId ?? null);
  selectedIdRef.current = selectedCellId ?? null;

  // Load or update the source + base layers whenever the date or visibility changes.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !ready) return;
    let cancelled = false;
    fetch(`${API}/api/risk/geojson?target=${targetDate}`)
      .then(response => response.ok ? response.json() : Promise.reject(new Error('Risk geometry unavailable.')))
      .then(data => {
        if (cancelled) return;
        const source = map.getSource('risk-cells') as { setData(data: unknown): void } | undefined;
        if (source) {
          source.setData(data);
          onGeometryLoaded?.();
          return;
        }
        map.addSource('risk-cells', { type: 'geojson', data });
        map.addLayer({
          id: 'risk-cells-fill',
          type: 'fill',
          source: 'risk-cells',
          filter: ['==', ['geometry-type'], 'Polygon'],
          layout: { visibility: visible ? 'visible' : 'none' },
          paint: {
            'fill-color': ['match', ['get', 'band'], 'Very high', '#b0183a', 'High', '#e5701f', 'Moderate', '#e9b824', '#bfd8cf'],
            'fill-opacity': ['case', ['==', ['get', 'cell_id'], selectedIdRef.current ?? -1], 0.9, 0.58],
            'fill-outline-color': '#ffffff',
          },
        });
        onGeometryLoaded?.();
        map.addLayer({
          id: 'risk-cells-points',
          type: 'circle',
          source: 'risk-cells',
          filter: ['==', ['geometry-type'], 'Point'],
          layout: { visibility: visible ? 'visible' : 'none' },
          paint: {
            'circle-color': ['match', ['get', 'band'], 'Very high', '#b0183a', 'High', '#e5701f', 'Moderate', '#e9b824', '#bfd8cf'],
            'circle-radius': [
              'interpolate', ['linear'], ['zoom'],
              4, ['case', ['==', ['get', 'cell_id'], selectedIdRef.current ?? -1], 6, 3],
              8, ['case', ['==', ['get', 'cell_id'], selectedIdRef.current ?? -1], 10, 6],
            ],
            'circle-opacity': ['case', ['==', ['get', 'cell_id'], selectedIdRef.current ?? -1], 1.0, 0.72],
            'circle-stroke-color': ['case', ['==', ['get', 'cell_id'], selectedIdRef.current ?? -1], '#ffff00', '#ffffff'],
            'circle-stroke-width': ['case', ['==', ['get', 'cell_id'], selectedIdRef.current ?? -1], 2.5, 0.5],
          },
        });
      })
      .catch(() => { /* Empty geometry is a valid unavailable state. */ });
    if (map.getLayer('risk-cells-fill')) map.setLayoutProperty('risk-cells-fill', 'visibility', visible ? 'visible' : 'none');
    if (map.getLayer('risk-cells-points')) map.setLayoutProperty('risk-cells-points', 'visibility', visible ? 'visible' : 'none');
    return () => { cancelled = true; };
  }, [mapRef, ready, targetDate, visible, onGeometryLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update the selection highlight paint expressions whenever selectedCellId changes
  // (without re-fetching data).
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !ready) return;
    const id = selectedCellId ?? -1;

    if (map.getLayer('risk-cells-fill')) {
      map.setPaintProperty('risk-cells-fill', 'fill-opacity', [
        'case', ['==', ['get', 'cell_id'], id], 0.9, 0.58,
      ]);
    }
    if (map.getLayer('risk-cells-points')) {
      map.setPaintProperty('risk-cells-points', 'circle-radius', [
        'interpolate', ['linear'], ['zoom'],
        4, ['case', ['==', ['get', 'cell_id'], id], 6, 3],
        8, ['case', ['==', ['get', 'cell_id'], id], 10, 6],
      ]);
      map.setPaintProperty('risk-cells-points', 'circle-opacity', [
        'case', ['==', ['get', 'cell_id'], id], 1.0, 0.72,
      ]);
      map.setPaintProperty('risk-cells-points', 'circle-stroke-color', [
        'case', ['==', ['get', 'cell_id'], id], '#ffff00', '#ffffff',
      ]);
      map.setPaintProperty('risk-cells-points', 'circle-stroke-width', [
        'case', ['==', ['get', 'cell_id'], id], 2.5, 0.5,
      ]);
    }
  }, [mapRef, ready, selectedCellId]);

  return null;
}

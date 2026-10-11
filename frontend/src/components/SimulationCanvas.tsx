import { useEffect } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';
import { DEFAULT_CENTER, DEFAULT_GRID, gridCorners, type Center, type GridSpec } from '../lib/simulationGeometry';

const DEFAULT_FRAME_COUNT = 49;

export function SimulationCanvas({ mapRef, ready, frame, playing = true, loop = false, origin = DEFAULT_CENTER, grid = DEFAULT_GRID, frameCount = DEFAULT_FRAME_COUNT, onStep, onComplete }: { mapRef: React.RefObject<MapRef | null>; ready: boolean; frame: number; playing?: boolean; loop?: boolean; origin?: Center; grid?: GridSpec; frameCount?: number; onStep?: (hour: number) => void; onComplete?: () => void }) {
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !ready) return;
    // Corners come from the raster's true ground extent (rows/columns x cell size), not a fixed degree box.
    const extent = gridCorners(origin, grid);
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = Math.round(512 * grid.rows / grid.columns);
    const context = canvas.getContext('2d'); if (!context) return;
    context.imageSmoothingEnabled = false;
    if (!map.getSource('simulation')) map.addSource('simulation', { type: 'canvas', canvas, animate: true, coordinates: extent } as any);
    if (!map.getLayer('simulation-raster')) map.addLayer({ id: 'simulation-raster', type: 'raster', source: 'simulation', paint: { 'raster-opacity': 0.78 } } as any);
    let timer: number | undefined; let current = frame;
    const draw = (index: number) => { const image = new Image(); image.onload = () => { context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height); (map.getSource('simulation') as any)?.play?.(); map.triggerRepaint(); }; image.src = `/simulation/similipal-demo/frame-${String(index % frameCount).padStart(2, '0')}.png`; };
    draw(current); onStep?.(current);
    if (playing) timer = window.setInterval(() => { const next = current + 1; if (next >= frameCount && !loop) { if (timer) window.clearInterval(timer); current = frameCount - 1; draw(current); onStep?.(current); onComplete?.(); return; } current = loop ? next % frameCount : next; draw(current); onStep?.(current); }, 1000);
    return () => { if (timer) window.clearInterval(timer); if (map.getLayer('simulation-raster')) map.removeLayer('simulation-raster'); if (map.getSource('simulation')) map.removeSource('simulation'); };
  }, [mapRef, ready, frame, playing, loop, origin.latitude, origin.longitude, grid.rows, grid.columns, grid.cellSizeM, frameCount, onStep, onComplete]);
  return null;
}

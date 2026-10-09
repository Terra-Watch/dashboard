import { useEffect } from 'react';
import type { MapRef } from 'react-map-gl/maplibre';

const FRAME_COUNT = 49;

export function SimulationCanvas({ mapRef, ready, frame, playing = true, loop = false, origin = { latitude: 21.867894, longitude: 86.500688 }, onStep, onComplete }: { mapRef: React.RefObject<MapRef | null>; ready: boolean; frame: number; playing?: boolean; loop?: boolean; origin?: { latitude: number; longitude: number }; onStep?: (hour: number) => void; onComplete?: () => void }) {
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !ready) return;
    const half = 0.007;
    const extent: [[number, number], [number, number], [number, number], [number, number]] = [[origin.longitude - half, origin.latitude + half], [origin.longitude + half, origin.latitude + half], [origin.longitude + half, origin.latitude - half], [origin.longitude - half, origin.latitude - half]];
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
    const context = canvas.getContext('2d'); if (!context) return;
    if (!map.getSource('simulation')) map.addSource('simulation', { type: 'canvas', canvas, animate: true, coordinates: extent } as any);
    if (!map.getLayer('simulation-raster')) map.addLayer({ id: 'simulation-raster', type: 'raster', source: 'simulation', paint: { 'raster-opacity': 0.78 } } as any);
    let timer: number | undefined; let current = frame;
    const draw = (index: number) => { const image = new Image(); image.onload = () => { context.clearRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height); (map.getSource('simulation') as any)?.play?.(); map.triggerRepaint(); }; image.src = `/simulation/similipal-demo/frame-${String(index % FRAME_COUNT).padStart(2, '0')}.png`; };
    draw(current); onStep?.(current);
    if (playing) timer = window.setInterval(() => { const next = current + 1; if (next >= FRAME_COUNT && !loop) { if (timer) window.clearInterval(timer); current = FRAME_COUNT - 1; draw(current); onStep?.(current); onComplete?.(); return; } current = loop ? next % FRAME_COUNT : next; draw(current); onStep?.(current); }, 1000);
    return () => { if (timer) window.clearInterval(timer); if (map.getLayer('simulation-raster')) map.removeLayer('simulation-raster'); if (map.getSource('simulation')) map.removeSource('simulation'); };
  }, [mapRef, ready, frame, playing, loop, origin.latitude, origin.longitude, onStep, onComplete]);
  return null;
}

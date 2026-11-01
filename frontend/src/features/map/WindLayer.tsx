import { useEffect } from 'react';
import type * as maplibregl from 'maplibre-gl';
import { sampleWind, type WindGrid } from './windField';

const SPEED_PX = 0.45;   // pixels per frame for 1 m/s
const LIFE = 90;         // frames a particle lives

/** Animated wind: particles drift across the map along the wind and leave fading trails. Draws on a canvas laid over the map; leaves nothing behind when removed.
 *  Not drawn for people who ask for reduced motion. */
export type MapInstance = InstanceType<typeof maplibregl.Map>;

export function WindLayer({ map, grid, onSatellite = false }: { map: MapInstance | null; grid?: WindGrid; onSatellite?: boolean }) {
  useEffect(() => {
    if (!map || !grid || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const host = map.getContainer();   // the sized, positioned map element (the inner canvas container has no height of its own)
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    host.insertBefore(canvas, host.querySelector('.maplibregl-control-container'));   // under the zoom buttons and attribution
    const ctx = canvas.getContext('2d');
    if (!ctx) { canvas.remove(); return; }
    let w = 0, h = 0, frame = 0, parts: Array<{ x: number; y: number; age: number }> = [];
    const spawn = (p: { x: number; y: number; age: number }) => { p.x = Math.random() * w; p.y = Math.random() * h; p.age = Math.floor(Math.random() * LIFE); };
    const resize = () => {
      w = canvas.width = Math.max(1, host.clientWidth); h = canvas.height = Math.max(1, host.clientHeight);
      parts = Array.from({ length: Math.min(2500, Math.round((w * h) / 900)) }, () => { const p = { x: 0, y: 0, age: 0 }; spawn(p); return p; });
    };
    const clear = () => ctx.clearRect(0, 0, w, h);
    resize();
    const tick = () => {
      ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = 'rgba(0,0,0,0.07)'; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over'; ctx.lineWidth = 1.6;
      for (const p of parts) {
        const ll = map.unproject([p.x, p.y]); const wind = sampleWind(grid, ll.lat, ll.lng);
        if (!wind || ++p.age > LIFE) { spawn(p); p.age = 0; continue; }
        const speed = Math.hypot(wind.u, wind.v), nx = p.x + wind.u * SPEED_PX, ny = p.y - wind.v * SPEED_PX;   // screen y grows downward
        const a = Math.min(0.95, 0.4 + speed / 10);   // dark blue on the light map, white on satellite imagery, so the flow reads on both
        ctx.strokeStyle = onSatellite ? `rgba(255,255,255,${a})` : `rgba(23,37,120,${a})`;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(nx, ny); ctx.stroke();
        p.x = nx; p.y = ny;
      }
      frame = requestAnimationFrame(tick);
    };
    map.on('move', clear); map.on('resize', resize);
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); map.off('move', clear); map.off('resize', resize); canvas.remove(); };
  }, [map, grid, onSatellite]);
  return null;
}

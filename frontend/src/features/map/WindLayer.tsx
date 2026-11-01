import { useEffect } from 'react';
import type * as maplibregl from 'maplibre-gl';
import { sampleWind, type WindGrid } from './windField';

const SPEED_PX = 0.45;   // pixels per frame for 1 m/s
const LIFE = 90;         // frames a particle lives

/** Animated wind: particles drift across the map along the wind and leave fading trails. Draws on a canvas laid over the map; leaves nothing behind when removed.
 *  Not drawn for people who ask for reduced motion. */
export type MapInstance = InstanceType<typeof maplibregl.Map>;

export function WindLayer({ map, grid }: { map: MapInstance | null; grid?: WindGrid }) {
  useEffect(() => {
    if (!map || !grid || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const host = map.getCanvasContainer();
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    host.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) { canvas.remove(); return; }
    let w = 0, h = 0, frame = 0, parts: Array<{ x: number; y: number; age: number }> = [];
    const spawn = (p: { x: number; y: number; age: number }) => { p.x = Math.random() * w; p.y = Math.random() * h; p.age = Math.floor(Math.random() * LIFE); };
    const resize = () => {
      const r = host.getBoundingClientRect(); w = canvas.width = Math.max(1, Math.floor(r.width)); h = canvas.height = Math.max(1, Math.floor(r.height));
      parts = Array.from({ length: Math.min(2500, Math.round((w * h) / 900)) }, () => { const p = { x: 0, y: 0, age: 0 }; spawn(p); return p; });
    };
    const clear = () => ctx.clearRect(0, 0, w, h);
    resize();
    const tick = () => {
      ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = 'rgba(0,0,0,0.07)'; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over'; ctx.lineWidth = 1.3;
      for (const p of parts) {
        const ll = map.unproject([p.x, p.y]); const wind = sampleWind(grid, ll.lat, ll.lng);
        if (!wind || ++p.age > LIFE) { spawn(p); p.age = 0; continue; }
        const speed = Math.hypot(wind.u, wind.v), nx = p.x + wind.u * SPEED_PX, ny = p.y - wind.v * SPEED_PX;   // screen y grows downward
        ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.9, 0.25 + speed / 12)})`; ctx.shadowColor = 'rgba(15,23,42,0.55)'; ctx.shadowBlur = 2;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(nx, ny); ctx.stroke();
        p.x = nx; p.y = ny;
      }
      frame = requestAnimationFrame(tick);
    };
    map.on('move', clear); map.on('resize', resize);
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); map.off('move', clear); map.off('resize', resize); canvas.remove(); };
  }, [map, grid]);
  return null;
}

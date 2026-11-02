import { useCallback, useEffect, useRef, useState } from 'react';
import { cameraHeading, meanHeading } from './heading';

export type CompassState = 'idle' | 'on' | 'denied' | 'unsupported';
type Sample = { t: number; deg: number };
const WINDOW_MS = 1000;
type IosEvent = DeviceOrientationEvent & { webkitCompassHeading?: number };
type IosPermission = { requestPermission?: () => Promise<'granted' | 'denied'> };

/** The direction the phone's back camera points. Call `start()` from a tap (iPhone asks for permission only then). `heading()` is the average of the last second, so a shaky hand
 * does not move it; null when there is no reading. Android gives the Earth-referenced angles; iPhone gives its own tilt-corrected compass heading (not yet checked on a real iPhone). */
export function useCompass() {
  const [state, setState] = useState<CompassState>('idle');
  const [live, setLive] = useState<number | null>(null);
  const samples = useRef<Sample[]>([]);
  const stop = useRef<(() => void) | null>(null);

  const onEvent = useCallback((event: Event) => {
    const e = event as IosEvent;
    const deg = typeof e.webkitCompassHeading === 'number' ? e.webkitCompassHeading : e.absolute === false || e.alpha == null || e.beta == null || e.gamma == null ? null : cameraHeading(e.alpha, e.beta, e.gamma);
    if (deg == null || Number.isNaN(deg)) return;
    const now = performance.now();
    samples.current = [...samples.current.filter(s => now - s.t < WINDOW_MS), { t: now, deg }];
    setLive(meanHeading(samples.current.map(s => s.deg)));
  }, []);

  const start = useCallback(async () => {
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) { setState('unsupported'); return; }
    const ios = (window.DeviceOrientationEvent as unknown as IosPermission).requestPermission;
    if (ios) {
      try { if (await ios.call(window.DeviceOrientationEvent) !== 'granted') { setState('denied'); return; } } catch { setState('denied'); return; }
    }
    const name = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
    window.addEventListener(name, onEvent as EventListener);
    stop.current?.(); stop.current = () => window.removeEventListener(name, onEvent as EventListener);
    setState('on');
  }, [onEvent]);

  useEffect(() => () => stop.current?.(), []);
  return { state, live, start, heading: () => { const now = performance.now(); return meanHeading(samples.current.filter(s => now - s.t < WINDOW_MS).map(s => s.deg)); } };
}

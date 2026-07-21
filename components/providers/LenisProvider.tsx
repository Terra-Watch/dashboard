'use client';

import { useEffect, type ReactNode } from 'react';
import Lenis from 'lenis';

/**
 * Lenis smooth scroll provider.
 *
 * Initializes Lenis once and drives it via requestAnimationFrame.
 * The native window.scrollY is updated by Lenis on each frame, so
 * our scroll listener in useMissionProgress works without modification.
 *
 * PURPOSE: Makes scrolling feel cinematic — a critical part of the
 * "expensive" feel required by the product experience brief.
 */
export function LenisProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.6,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      touchMultiplier: 2,
      infinite: false,
    });

    // Store globally so other components can access if needed
    (window as unknown as Record<string, unknown>).__lenis = lenis;

    let rafId: number;
    function raf(time: number) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}

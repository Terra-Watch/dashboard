'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MISSION_CONFIG } from '@/lib/mission-config';
import { missionProgressStore } from '@/lib/mission-progress';
import { clamp } from '@/lib/utils';

/**
 * Reads scroll position → normalizes to 0–1 progress → updates:
 *   1. missionProgressStore.value  (for Three.js, no re-render)
 *   2. React state               (for UI components, via RAF throttle)
 *
 * The scroll space is created by a tall div with height = MISSION_SCROLL_PX.
 * Progress = scrollY / (totalHeight - viewportHeight).
 */
export function useMissionProgress(): number {
  const [progress, setProgress] = useState(0);
  const rafPending = useRef(false);

  const handleScroll = useCallback(() => {
    const scrollY = window.scrollY;
    const totalScrollable =
      document.documentElement.scrollHeight - window.innerHeight;
    if (totalScrollable <= 0) return;

    const p = clamp(scrollY / totalScrollable, 0, 1);

    // Always update the mutable singleton immediately — Three.js reads this
    missionProgressStore.value = p;

    // Throttle React state updates to one per animation frame
    if (!rafPending.current) {
      rafPending.current = true;
      requestAnimationFrame(() => {
        setProgress(missionProgressStore.value);
        rafPending.current = false;
      });
    }
  }, []);

  useEffect(() => {
    // Initial calculation
    handleScroll();

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [handleScroll]);

  return progress;
}

/**
 * Returns the scroll offset (in px) for a given normalized progress value.
 * Useful for calculating where to scroll to programmatically.
 */
export function progressToScrollY(progress: number): number {
  return progress * MISSION_CONFIG.SCROLL_PX;
}

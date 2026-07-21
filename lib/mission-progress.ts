/**
 * Mission Progress Singleton Store
 *
 * A module-level mutable object that Three.js components read from inside
 * useFrame() — avoiding React re-renders for the 3D scene entirely.
 *
 * React UI components use MissionContext (which has React state) instead.
 *
 * PURPOSE: Decouple the React update cycle from the Three.js animation loop
 * for consistent 60fps rendering regardless of React reconciliation timing.
 */
export const missionProgressStore = {
  /** Normalized scroll progress: 0.0 (top) → 1.0 (bottom) */
  value: 0,
};

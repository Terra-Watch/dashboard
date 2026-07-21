'use client';

/**
 * components/three/AtmosphereSystem.tsx
 *
 * Controls the lighting and environmental mood of the 3D oceanic world.
 * Critical Visual Fix: Removed `background` prop from `<Environment>` so Drei IBL does NOT set a tan/brown HDRI texture as scene background. Scene background is now owned dynamically by deep sea color (#030D1B / fog color).
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';
import { missionProgressStore } from '@/lib/mission-progress';
import { interpolateKeyframes, lerp } from '@/lib/utils';

type LightFrame = [number, number, number, number]; // [progress, r, g, b]

// ── Ambient light ─────────────────────────────────────────────────────────────
const AMBIENT_COLOR: LightFrame[] = [
  [0.00, 0.03, 0.07, 0.12],  // Pre-dawn: deep oceanic navy
  [0.10, 0.04, 0.08, 0.14],  // Harbor departure
  [0.22, 0.06, 0.11, 0.18],  // Open ocean
  [0.35, 0.08, 0.14, 0.22],  // Fishing zone
  [0.52, 0.07, 0.12, 0.20],  // LoRa active
  [0.60, 0.03, 0.05, 0.09],  // Storm approaching
  [0.70, 0.02, 0.03, 0.05],  // Emergency: dark sea
  [0.78, 0.03, 0.05, 0.08],  // Response phase
  [0.85, 0.05, 0.09, 0.14],  // Rescue
  [0.92, 0.07, 0.12, 0.18],  // Return: golden hour
  [1.00, 0.08, 0.13, 0.20],  // Safe harbour
];

const AMBIENT_INTENSITY: [number, number][] = [
  [0.00, 0.45], [0.10, 0.52], [0.22, 0.60],
  [0.35, 0.70], [0.52, 0.65], [0.60, 0.30],
  [0.70, 0.15], [0.85, 0.42], [0.92, 0.68],
  [1.00, 0.75],
];

// ── Directional (sun) light ───────────────────────────────────────────────────
const SUN_COLOR: LightFrame[] = [
  [0.00, 0.85, 0.65, 0.40],  // Morning golden light
  [0.10, 0.88, 0.72, 0.48],  // Morning gold
  [0.22, 0.92, 0.88, 0.78],  // Open ocean daylight
  [0.35, 0.90, 0.86, 0.75],  // Afternoon
  [0.52, 0.88, 0.82, 0.70],  // Late afternoon
  [0.60, 0.45, 0.48, 0.55],  // Storm grey
  [0.70, 0.20, 0.22, 0.28],  // Emergency dark
  [0.78, 0.35, 0.40, 0.48],  // Response
  [0.85, 0.55, 0.62, 0.68],  // Clearing
  [0.92, 0.90, 0.72, 0.48],  // Sunset gold return
  [1.00, 0.92, 0.78, 0.55],  // Dawn arrival
];

const SUN_INTENSITY: [number, number][] = [
  [0.00, 1.2], [0.10, 1.4], [0.22, 2.0],
  [0.35, 2.2], [0.52, 2.0], [0.60, 0.8],
  [0.70, 0.4], [0.85, 1.0], [0.92, 1.8],
  [1.00, 2.0],
];

type Vec3Frame = [number, number, number, number];
const SUN_POSITION: Vec3Frame[] = [
  [0.00,  6,  5, 12],
  [0.10,  7,  7, 11],
  [0.22,  6, 12,  7],
  [0.35,  4, 18,  2],
  [0.52,  4, 16,  5],
  [0.60,  3, 11, 10],
  [0.70,  2.5, 9, 11],
  [0.85,  5, 10,  9],
  [0.92,  8,  6, 11],
  [1.00,  7,  5.5, 12],
];

// ── Fog (Deep Sea Haze) ───────────────────────────────────────────────────────
const FOG_COLOR: LightFrame[] = [
  [0.00, 0.012, 0.040, 0.080],  // Deep Navy (#030D1B)
  [0.10, 0.015, 0.045, 0.090],
  [0.22, 0.018, 0.052, 0.105],  // Open ocean horizon
  [0.35, 0.022, 0.060, 0.115],  // Fishing zone
  [0.52, 0.018, 0.052, 0.105],
  [0.60, 0.010, 0.022, 0.050],  // Storm blue-grey
  [0.70, 0.003, 0.006, 0.018],  // Emergency dark
  [0.78, 0.006, 0.016, 0.040],
  [0.85, 0.012, 0.032, 0.075],
  [0.92, 0.018, 0.050, 0.100],  // Return horizon
  [1.00, 0.020, 0.055, 0.110],  // Dawn harbor
];

const FOG_DENSITY: [number, number][] = [
  [0.00, 0.012], [0.22, 0.007], [0.35, 0.008],
  [0.52, 0.009], [0.60, 0.038], [0.70, 0.058],
  [0.78, 0.032], [0.85, 0.018], [0.92, 0.010],
  [1.00, 0.009],
];

function sampleColor(frames: LightFrame[], p: number): THREE.Color {
  const r = interpolateKeyframes(frames.map(([pp, r]) => [pp, r]), p);
  const g = interpolateKeyframes(frames.map(([pp, , g]) => [pp, g]), p);
  const b = interpolateKeyframes(frames.map(([pp, , , b]) => [pp, b]), p);
  return new THREE.Color(r, g, b);
}

function sampleVec3(frames: Vec3Frame[], p: number): THREE.Vector3 {
  const x = interpolateKeyframes(frames.map(([pp, x]) => [pp, x]), p);
  const y = interpolateKeyframes(frames.map(([pp, , y]) => [pp, y]), p);
  const z = interpolateKeyframes(frames.map(([pp, , , z]) => [pp, z]), p);
  return new THREE.Vector3(x, y, z);
}

export function AtmosphereSystem() {
  const ambientRef     = useRef<THREE.AmbientLight>(null);
  const sunRef         = useRef<THREE.DirectionalLight>(null);
  const fillRef        = useRef<THREE.HemisphereLight>(null);

  useFrame(({ scene }) => {
    const p = missionProgressStore.value;
    const fogCol = sampleColor(FOG_COLOR, p);

    // Explicitly set scene background to fog color (deep oceanic navy) — eliminating brown HDRI sky
    scene.background = fogCol;

    // ── Ambient ────────────────────────────────────────────────────
    if (ambientRef.current) {
      ambientRef.current.color.lerp(sampleColor(AMBIENT_COLOR, p), 0.020);
      ambientRef.current.intensity = lerp(
        ambientRef.current.intensity,
        interpolateKeyframes(AMBIENT_INTENSITY, p),
        0.020,
      );
    }

    // ── Directional sun ────────────────────────────────────────────
    if (sunRef.current) {
      sunRef.current.color.lerp(sampleColor(SUN_COLOR, p), 0.020);
      sunRef.current.intensity = lerp(
        sunRef.current.intensity,
        interpolateKeyframes(SUN_INTENSITY, p),
        0.020,
      );
      const targetPos = sampleVec3(SUN_POSITION, p);
      sunRef.current.position.lerp(targetPos, 0.016);
    }

    // ── Exponential fog ────────────────────────────────────────────
    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.copy(fogCol);
      scene.fog.density = lerp(
        scene.fog.density,
        interpolateKeyframes(FOG_DENSITY, p),
        0.020,
      );
    }
  });

  return (
    <>
      {/* NO `background` prop — provides ambient image-based lighting ONLY */}
      <Environment
        preset="night"
      />

      <ambientLight
        ref={ambientRef}
        color="#081424"
        intensity={0.45}
      />

      <directionalLight
        ref={sunRef}
        color="#D9A266"
        intensity={1.2}
        position={[6, 5, 12]}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={0.5}
        shadow-camera-far={80}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
        shadow-bias={-0.0001}
      />

      <hemisphereLight
        ref={fillRef}
        args={['#0B223D', '#020914', 0.40]}
      />

      <fogExp2 attach="fog" args={['#030D1B', 0.012]} />
    </>
  );
}

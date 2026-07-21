'use client';

/**
 * components/three/WeatherParticles.tsx
 *
 * Weather Particle System (Storm Rain & Oceanic Spray).
 * Milestone 4 — Atmosphere & Weather.
 *
 * Responsibilities:
 *   - Instanced 600-particle precipitation system
 *   - Phase-reactive storm intensity curve (fades in at 0.58, peaks during emergency 0.70, clears by 0.88)
 *   - Wind shear & diagonal fall velocity matching storm severity
 *   - Dynamic particle recycling anchored around active camera/vessel spatial bounds
 *   - Color temperature transition matching ocean fog & storm atmosphere
 */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { missionProgressStore } from '@/lib/mission-progress';
import { interpolateKeyframes } from '@/lib/utils';

const PARTICLE_COUNT = 600;

// Storm intensity keyframes (0.0 clear -> 1.0 severe storm -> 0.0 clearing)
const STORM_INTENSITY_KEYFRAMES: [number, number][] = [
  [0.00, 0.0],
  [0.55, 0.0],
  [0.60, 0.45], // Storm gathering
  [0.70, 1.00], // Heavy storm / SOS
  [0.78, 0.70], // Responding fleet in storm
  [0.85, 0.20], // Clearing
  [0.92, 0.00], // Golden return
];

export function WeatherParticles() {
  const pointsRef = useRef<THREE.Points>(null);

  // Initialize particle positions, velocities, and initial random offsets
  const { positions, velocities, lateralDrift } = useMemo(() => {
    const pos = new Float32Array(PARTICLE_COUNT * 3);
    const vel = new Float32Array(PARTICLE_COUNT);
    const drift = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      pos[i * 3 + 0] = (Math.random() - 0.5) * 40; // X
      pos[i * 3 + 1] = Math.random() * 20 - 2;     // Y
      pos[i * 3 + 2] = (Math.random() - 0.5) * 40; // Z

      vel[i] = 0.12 + Math.random() * 0.18;        // Fall speed variation
      drift[i] = (Math.random() - 0.5) * 0.02;     // Lateral turbulence
    }
    return { positions: pos, velocities: vel, lateralDrift: drift };
  }, []);

  useFrame((_, delta) => {
    if (!pointsRef.current) return;

    const p = missionProgressStore.value;
    const geom = pointsRef.current.geometry;
    const posAttr = geom.attributes.position;
    const pos = posAttr.array as Float32Array;

    const stormIntensity = interpolateKeyframes(STORM_INTENSITY_KEYFRAMES, p);
    const mat = pointsRef.current.material as THREE.PointsMaterial;

    // Fades in during storm phases, completely invisible during calm harbour/dawn
    mat.opacity = stormIntensity * 0.65;
    mat.size = 0.035 + stormIntensity * 0.035;

    // Color lerp matching ocean atmosphere
    const colR = 0.55 - stormIntensity * 0.15;
    const colG = 0.75 - stormIntensity * 0.20;
    const colB = 0.90 - stormIntensity * 0.25;
    mat.color.setRGB(colR, colG, colB);

    if (stormIntensity > 0.005) {
      const fallSpeedFactor = (12 + stormIntensity * 24) * delta;
      const windShearX = (0.04 + stormIntensity * 0.12) * fallSpeedFactor;
      const windShearZ = (0.02 + stormIntensity * 0.06) * fallSpeedFactor;

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        // Vertical downfall
        pos[i * 3 + 1] -= velocities[i] * fallSpeedFactor;

        // Diagonal wind shear & lateral turbulence
        pos[i * 3 + 0] += windShearX + lateralDrift[i];
        pos[i * 3 + 2] += windShearZ;

        // Recycle particles when falling below ocean plane (Y < -2)
        if (pos[i * 3 + 1] < -2.5) {
          pos[i * 3 + 1] = 18.0;
          pos[i * 3 + 0] = (Math.random() - 0.5) * 40;
          pos[i * 3 + 2] = (Math.random() - 0.5) * 40;
        }
      }
      posAttr.needsUpdate = true;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#77AACC"
        size={0.04}
        transparent
        opacity={0}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

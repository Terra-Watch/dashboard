'use client';

/**
 * components/three/OceanMesh.tsx
 *
 * The ocean surface. The protagonist of the entire experience.
 * Critical Pass — Deep sea gunmetal & oceanic morning blue tuning (eliminates lavender hues).
 */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { missionProgressStore } from '@/lib/mission-progress';
import { interpolateKeyframes, lerp } from '@/lib/utils';
import { MISSION_CONFIG } from '@/lib/mission-config';
import { OCEAN_VERTEX, OCEAN_FRAGMENT } from '@/shaders/ocean';

type RGBFrame = [number, [number, number, number]];

// Deep Sea Color Keyframes (RGB linear 0-1) — strictly oceanic navy & gunmetal
const DEEP_COLORS: RGBFrame[] = [
  [0.00, [0.003, 0.018, 0.045]], // Pre-dawn: deep sea gunmetal navy
  [0.10, [0.005, 0.024, 0.055]], // Harbor departure
  [0.22, [0.008, 0.035, 0.075]], // Open ocean
  [0.35, [0.010, 0.042, 0.088]], // Fishing zone
  [0.45, [0.008, 0.032, 0.070]], // Signal lost
  [0.52, [0.010, 0.038, 0.080]], // LoRa active
  [0.60, [0.005, 0.015, 0.040]], // Storm builds — cold dark ocean
  [0.70, [0.002, 0.006, 0.020]], // Emergency — near black
  [0.78, [0.004, 0.012, 0.035]], // Response
  [0.85, [0.008, 0.025, 0.060]], // Rescue
  [0.92, [0.010, 0.035, 0.078]], // Return
  [1.00, [0.012, 0.042, 0.090]], // Safe harbor
];

const SURFACE_COLORS: RGBFrame[] = [
  [0.00, [0.014, 0.058, 0.135]], // Pre-dawn: oceanic sea blue
  [0.10, [0.018, 0.070, 0.155]], // Harbor
  [0.22, [0.024, 0.090, 0.190]], // Open ocean — rich blue
  [0.35, [0.028, 0.105, 0.210]], // Fishing zone
  [0.52, [0.022, 0.085, 0.180]], // LoRa active
  [0.60, [0.012, 0.045, 0.105]], // Storm — cold blue-grey
  [0.70, [0.006, 0.020, 0.055]], // Emergency
  [0.78, [0.012, 0.045, 0.105]], // Response
  [0.92, [0.024, 0.088, 0.185]], // Return
  [1.00, [0.030, 0.110, 0.220]], // Safe harbor — morning gold blue
];

type Vec3Frame = [number, number, number, number];

const SUN_DIRECTION: Vec3Frame[] = [
  [0.00,  0.45, 0.35, 0.82],
  [0.10,  0.48, 0.48, 0.74],
  [0.22,  0.40, 0.78, 0.48],
  [0.35,  0.30, 0.95, 0.10],
  [0.52,  0.28, 0.90, 0.34],
  [0.60,  0.22, 0.70, 0.68],
  [0.70,  0.18, 0.60, 0.78],
  [0.85,  0.35, 0.65, 0.67],
  [0.92,  0.55, 0.42, 0.72],
  [1.00,  0.50, 0.38, 0.78],
];

const SUN_COLORS: RGBFrame[] = [
  [0.00, [0.85, 0.65, 0.40]],  // Morning gold
  [0.10, [0.88, 0.72, 0.48]],
  [0.22, [0.92, 0.88, 0.78]],
  [0.35, [0.90, 0.86, 0.75]],
  [0.60, [0.45, 0.48, 0.55]],
  [0.70, [0.20, 0.22, 0.28]],
  [0.85, [0.55, 0.62, 0.68]],
  [0.92, [0.90, 0.72, 0.48]],
  [1.00, [0.92, 0.78, 0.55]],
];

function lerpRGB(
  keyframes: RGBFrame[],
  p: number,
  channel: 0 | 1 | 2,
): number {
  return interpolateKeyframes(
    keyframes.map(([prog, rgb]) => [prog, rgb[channel]]),
    p,
  );
}

function sampleRGB(keyframes: RGBFrame[], p: number): THREE.Color {
  return new THREE.Color(
    lerpRGB(keyframes, p, 0),
    lerpRGB(keyframes, p, 1),
    lerpRGB(keyframes, p, 2),
  );
}

function sampleVec3(keyframes: Vec3Frame[], p: number): THREE.Vector3 {
  const x = interpolateKeyframes(keyframes.map(([pr, x]) => [pr, x]), p);
  const y = interpolateKeyframes(keyframes.map(([pr, , y]) => [pr, y]), p);
  const z = interpolateKeyframes(keyframes.map(([pr, , , z]) => [pr, z]), p);
  return new THREE.Vector3(x, y, z).normalize();
}

const FOAM_KEYFRAMES: [number, number][] = [
  [0.00, 0.04], [0.22, 0.06], [0.35, 0.07],
  [0.55, 0.10], [0.60, 0.22], [0.70, 0.35],
  [0.78, 0.28], [0.85, 0.15], [0.92, 0.08],
  [1.00, 0.05],
];

const FREQ_KEYFRAMES: [number, number][] = [
  [0.00, 0.32], [0.35, 0.35], [0.52, 0.38],
  [0.60, 0.52], [0.70, 0.60], [0.78, 0.50],
  [0.85, 0.40], [1.00, 0.34],
];

export function OceanMesh() {
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader:   OCEAN_VERTEX,
      fragmentShader: OCEAN_FRAGMENT,
      uniforms: {
        uTime:         { value: 0 },
        uAmplitude:    { value: 0.18 },
        uFrequency:    { value: 0.32 },
        uDeepColor:    { value: new THREE.Color(0.003, 0.018, 0.045) },
        uSurfaceColor: { value: new THREE.Color(0.014, 0.058, 0.135) },
        uFoamColor:    { value: new THREE.Color(0.78, 0.90, 0.96) },
        uSunColor:     { value: new THREE.Color(0.85, 0.65, 0.40) },
        uSunDirection: { value: new THREE.Vector3(0.45, 0.35, 0.82) },
        uFoamStrength: { value: 0.04 },
      },
      side: THREE.FrontSide,
    });
  }, []);

  useFrame(({ clock }) => {
    const p = missionProgressStore.value;
    const t = clock.getElapsedTime();

    material.uniforms.uTime.value = t;

    const targetAmp = interpolateKeyframes(MISSION_CONFIG.TELEMETRY.waveHeight, p);
    material.uniforms.uAmplitude.value = lerp(
      material.uniforms.uAmplitude.value,
      targetAmp,
      0.014,
    );

    const targetFreq = interpolateKeyframes(FREQ_KEYFRAMES, p);
    material.uniforms.uFrequency.value = lerp(
      material.uniforms.uFrequency.value,
      targetFreq,
      0.012,
    );

    material.uniforms.uDeepColor.value.lerp(
      sampleRGB(DEEP_COLORS, p),
      0.022,
    );

    material.uniforms.uSurfaceColor.value.lerp(
      sampleRGB(SURFACE_COLORS, p),
      0.022,
    );

    const targetFoam = interpolateKeyframes(FOAM_KEYFRAMES, p);
    material.uniforms.uFoamStrength.value = lerp(
      material.uniforms.uFoamStrength.value,
      targetFoam,
      0.018,
    );

    const targetDir = sampleVec3(SUN_DIRECTION, p);
    (material.uniforms.uSunDirection.value as THREE.Vector3).lerp(targetDir, 0.016);
    (material.uniforms.uSunDirection.value as THREE.Vector3).normalize();

    material.uniforms.uSunColor.value.lerp(
      sampleRGB(SUN_COLORS, p),
      0.020,
    );
  });

  return (
    <mesh
      material={material}
      rotation={[0, 0, 0]}
      receiveShadow
    >
      <planeGeometry args={[200, 200, 256, 256]} />
    </mesh>
  );
}

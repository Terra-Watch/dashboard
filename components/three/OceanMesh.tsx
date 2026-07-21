'use client';

/**
 * components/three/OceanMesh.tsx
 *
 * The ocean surface. The protagonist of the entire experience.
 *
 * What changed from MVP (Milestone 1 upgrade):
 *   ✦ Imports production GLSL from shaders/ocean.ts (not inline strings)
 *   ✦ Vertex shader now computes analytical surface normals — every pixel
 *     receives correct lighting based on its actual wave geometry
 *   ✦ Fragment shader has Fresnel, Blinn-Phong, micro-ripple, and SSS
 *   ✦ New uniforms: uSunColor, uSunDirection (fed from phase keyframes)
 *   ✦ uShallowColor renamed to uSurfaceColor (matches shader semantics)
 *   ✦ Geometry upgraded: 200×200 world units, 256×256 segments
 *     (was 60×60 / 192×192 — now fills the camera frustum correctly)
 *
 * What did NOT change:
 *   ✦ Phase-reactive amplitude, frequency, foam, deep/surface color
 *   ✦ missionProgressStore singleton read pattern (no React re-renders)
 *   ✦ lerp-based smooth transitions between phase states
 *
 * Performance note:
 *   256×256 plane = 131,072 triangles. This is within the desktop budget
 *   defined in the engineering blueprint. On mobile, a resize observer
 *   (future milestone) will swap to a 128×128 geometry.
 */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { missionProgressStore } from '@/lib/mission-progress';
import { interpolateKeyframes, lerp } from '@/lib/utils';
import { MISSION_CONFIG } from '@/lib/mission-config';
import { OCEAN_VERTEX, OCEAN_FRAGMENT } from '@/shaders/ocean';

// ─── Color keyframes ──────────────────────────────────────────────────────────
//
// These drive uDeepColor and uSurfaceColor uniforms.
// Colors are in linear (0–1) space, not sRGB hex.
//
// Design intent:
//   Deep color  → the colour the eye perceives looking straight down into depth
//   Surface color → the lit, scattered colour near wave peaks and crests
//
// The fragment shader mixes these based on vElevation, giving the impression
// that you can see slightly deeper in calm water than in choppy/dark water.

type RGBFrame = [number, [number, number, number]]; // [progress, [r, g, b]]

const DEEP_COLORS: RGBFrame[] = [
  [0.00, [0.005, 0.025, 0.065]], // Pre-dawn: almost black navy
  [0.10, [0.008, 0.032, 0.080]], // Harbor departure
  [0.22, [0.010, 0.042, 0.095]], // Open ocean, brightening
  [0.35, [0.012, 0.048, 0.105]], // Fishing zone, midday
  [0.45, [0.010, 0.038, 0.090]], // Signal lost — slight tension
  [0.52, [0.012, 0.045, 0.100]], // LoRa active — stable
  [0.60, [0.008, 0.018, 0.055]], // Storm builds — darker
  [0.70, [0.003, 0.008, 0.030]], // Emergency — near black
  [0.78, [0.006, 0.015, 0.045]], // Response — lifting slightly
  [0.85, [0.010, 0.030, 0.075]], // Rescue confirmed
  [0.92, [0.012, 0.042, 0.095]], // Return — clearing
  [1.00, [0.018, 0.055, 0.115]], // Safe harbor — dawn light
];

const SURFACE_COLORS: RGBFrame[] = [
  [0.00, [0.018, 0.075, 0.175]], // Pre-dawn: dark blue-grey
  [0.10, [0.022, 0.090, 0.200]], // Harbor
  [0.22, [0.028, 0.110, 0.240]], // Open ocean — rich blue
  [0.35, [0.030, 0.120, 0.260]], // Fishing zone — clearest water
  [0.52, [0.025, 0.100, 0.220]], // LoRa active
  [0.60, [0.015, 0.055, 0.130]], // Storm — cold grey-blue
  [0.70, [0.008, 0.025, 0.070]], // Emergency — nearly black
  [0.78, [0.015, 0.055, 0.130]], // Response
  [0.92, [0.028, 0.105, 0.230]], // Return
  [1.00, [0.035, 0.130, 0.270]], // Safe harbor — warm dawn blue
];

// ─── Sun direction keyframes ──────────────────────────────────────────────────
//
// Each entry: [progress, x, y, z] — normalised sun direction (toward sun).
// These match the directional light position in AtmosphereSystem so the
// specular highlight appears to come from the same source as the scene light.
//
// Low Y = low sun (dawn/dusk). High Y = overhead (noon).

type Vec3Frame = [number, number, number, number]; // [progress, x, y, z]

const SUN_DIRECTION: Vec3Frame[] = [
  [0.00,  0.45, 0.35, 0.82],  // Pre-dawn: sun just below horizon
  [0.10,  0.48, 0.48, 0.74],  // Harbor departure: first light
  [0.22,  0.40, 0.78, 0.48],  // Open ocean: morning sun rising
  [0.35,  0.30, 0.95, 0.10],  // Fishing zone: near-overhead noon
  [0.52,  0.28, 0.90, 0.34],  // LoRa active: early afternoon
  [0.60,  0.22, 0.70, 0.68],  // Storm: sun direction but diffuse
  [0.70,  0.18, 0.60, 0.78],  // Emergency: overcast direction
  [0.85,  0.35, 0.65, 0.67],  // Rescue: light beginning to return
  [0.92,  0.55, 0.42, 0.72],  // Return: low afternoon/setting sun
  [1.00,  0.50, 0.38, 0.78],  // Harbor arrival: warm low sun
];

// Sun colour keyframes — must match AtmosphereSystem.SUN_COLOR
const SUN_COLORS: RGBFrame[] = [
  [0.00, [0.80, 0.60, 0.40]],  // Warm orange sunrise
  [0.10, [0.85, 0.70, 0.50]],  // Morning gold
  [0.22, [0.92, 0.88, 0.80]],  // Noon blue-white
  [0.35, [0.90, 0.85, 0.75]],  // Afternoon
  [0.60, [0.50, 0.50, 0.60]],  // Storm grey
  [0.70, [0.25, 0.25, 0.32]],  // Emergency dark
  [0.85, [0.60, 0.65, 0.72]],  // Clearing
  [0.92, [0.90, 0.75, 0.55]],  // Sunset gold
  [1.00, [0.95, 0.82, 0.62]],  // Dawn warm
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// Foam strength per phase — keyed more granularly than the MVP
const FOAM_KEYFRAMES: [number, number][] = [
  [0.00, 0.04], [0.22, 0.06], [0.35, 0.07],
  [0.55, 0.10], [0.60, 0.22], [0.70, 0.35],
  [0.78, 0.28], [0.85, 0.15], [0.92, 0.08],
  [1.00, 0.05],
];

// Frequency per phase — higher chop during storm
const FREQ_KEYFRAMES: [number, number][] = [
  [0.00, 0.32], [0.35, 0.35], [0.52, 0.38],
  [0.60, 0.52], [0.70, 0.60], [0.78, 0.50],
  [0.85, 0.40], [1.00, 0.34],
];

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * The ocean surface.
 *
 * PURPOSE: Visualises the sea state the fisherman operates in at every
 * moment of the mission. Calm harbour → open swells → violent storm →
 * golden return. Every visual change directly reflects what the crew
 * experiences. The ocean is never decoration.
 */
export function OceanMesh() {
  // Re-use the same ShaderMaterial across frames — never recreate it
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader:   OCEAN_VERTEX,
      fragmentShader: OCEAN_FRAGMENT,
      uniforms: {
        // Animated
        uTime:         { value: 0 },
        uAmplitude:    { value: 0.18 },
        uFrequency:    { value: 0.32 },
        // Colors
        uDeepColor:    { value: new THREE.Color(0.005, 0.025, 0.065) },
        uSurfaceColor: { value: new THREE.Color(0.018, 0.075, 0.175) },
        uFoamColor:    { value: new THREE.Color(0.78, 0.90, 0.96) },
        uSunColor:     { value: new THREE.Color(0.80, 0.60, 0.40) },
        // Lighting
        uSunDirection: { value: new THREE.Vector3(0.45, 0.35, 0.82) },
        // Control
        uFoamStrength: { value: 0.04 },
      },
      side: THREE.FrontSide,  // Only render top face (performance)
    });
  }, []);

  useFrame(({ clock }) => {
    const p = missionProgressStore.value;
    const t = clock.getElapsedTime();

    // ── Time ───────────────────────────────────────────────────────
    material.uniforms.uTime.value = t;

    // ── Wave amplitude (from waveHeight telemetry keyframes) ───────
    const targetAmp = interpolateKeyframes(MISSION_CONFIG.TELEMETRY.waveHeight, p);
    material.uniforms.uAmplitude.value = lerp(
      material.uniforms.uAmplitude.value,
      targetAmp,
      0.014,
    );

    // ── Wave frequency (higher during storm) ───────────────────────
    const targetFreq = interpolateKeyframes(FREQ_KEYFRAMES, p);
    material.uniforms.uFrequency.value = lerp(
      material.uniforms.uFrequency.value,
      targetFreq,
      0.012,
    );

    // ── Deep colour ────────────────────────────────────────────────
    material.uniforms.uDeepColor.value.lerp(
      sampleRGB(DEEP_COLORS, p),
      0.022,
    );

    // ── Surface colour ─────────────────────────────────────────────
    material.uniforms.uSurfaceColor.value.lerp(
      sampleRGB(SURFACE_COLORS, p),
      0.022,
    );

    // ── Foam strength ──────────────────────────────────────────────
    const targetFoam = interpolateKeyframes(FOAM_KEYFRAMES, p);
    material.uniforms.uFoamStrength.value = lerp(
      material.uniforms.uFoamStrength.value,
      targetFoam,
      0.018,
    );

    // ── Sun direction ──────────────────────────────────────────────
    // Lerp each component separately to avoid normalisation issues during
    // the frame-by-frame interpolation.
    const targetDir = sampleVec3(SUN_DIRECTION, p);
    (material.uniforms.uSunDirection.value as THREE.Vector3).lerp(targetDir, 0.016);
    (material.uniforms.uSunDirection.value as THREE.Vector3).normalize();

    // ── Sun colour ─────────────────────────────────────────────────
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
      {/*
        200×200 world units at 256×256 segments.
        - 200 units fills the full camera frustum at our standard zoom levels
          (was 60 units — too small, horizon was visible at shallow angles)
        - 256 segments: 131,072 triangles.  Within desktop performance budget.
        - On mobile (Milestone 11), swap to 128×128 via a devicePixelRatio check.
      */}
      <planeGeometry args={[200, 200, 256, 256]} />
    </mesh>
  );
}

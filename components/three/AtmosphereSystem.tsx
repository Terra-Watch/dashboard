'use client';

/**
 * components/three/AtmosphereSystem.tsx
 *
 * Controls the entire lighting and environmental mood of the 3D world.
 *
 * What changed from MVP (Milestone 1 upgrade):
 *
 *   1. Drei <Environment> added — provides HDRI image-based lighting (IBL).
 *      The 'dawn' preset is loaded from the Drei CDN (Poly Haven). This
 *      replaces the flat-color scene background with a proper sky texture
 *      and gives all future PBR materials (boat GLB, Milestone 2) correct
 *      environment reflections.
 *
 *      Why HDRI matters:
 *        A flat colored background renders 0 photons into scene materials.
 *        An HDR environment map provides high-dynamic-range radiance data
 *        that physically-based materials use for ambient reflections — even
 *        at angles not covered by any explicit light source.
 *
 *   2. Directional light position is now keyed to match uSunDirection in
 *      OceanMesh. The shadow-casting sun and the specular highlight on the
 *      water now come from the same logical direction.
 *
 *   3. scene.background is NO LONGER manually set to a Color. The Environment
 *      component owns the background (blurred HDRI sky). The fog system still
 *      correctly affects all MESHES in the scene — it just does not affect
 *      the HDRI backdrop itself, which is physically correct (the horizon
 *      sky is always bright; only nearby geometry is fogged).
 *
 * What did NOT change:
 *   ✦ Phase-reactive ambient light, directional light, hemisphere fill
 *   ✦ Exponential fog — color and density keyed to mission phase
 *   ✦ missionProgressStore singleton read pattern
 *   ✦ lerp-based smooth transitions
 *
 * Milestone 4 will add HDRI cross-fading (dawn → open-ocean → storm → golden
 * return). For Milestone 1, the 'dawn' preset establishes the harbor aesthetic
 * that should be the baseline visual quality.
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Environment } from '@react-three/drei';
import * as THREE from 'three';
import { missionProgressStore } from '@/lib/mission-progress';
import { interpolateKeyframes, lerp } from '@/lib/utils';

// ─── Lighting Keyframes ───────────────────────────────────────────────────────
//
// These values are matched to the design intent described in the engineering
// blueprint: dawn (warm, orange), open ocean (neutral, bright), storm (flat,
// grey), emergency (near-black), golden return (warm, amber).
//
// All colour components are in linear light space (not sRGB / gamma-corrected).
// Three.js applies gamma correction in the renderer.

type LightFrame = [number, number, number, number]; // [progress, r, g, b]

// ── Ambient light ─────────────────────────────────────────────────────────────
// The ambient light fills all shadow faces. It should be a desaturated,
// low-intensity version of the sky colour at each phase.
const AMBIENT_COLOR: LightFrame[] = [
  [0.00, 0.06, 0.08, 0.14],  // Pre-dawn: cool blue-black
  [0.10, 0.07, 0.10, 0.16],  // Harbor departure: warming
  [0.22, 0.10, 0.13, 0.20],  // Open ocean: mid-morning
  [0.35, 0.12, 0.16, 0.22],  // Fishing zone: bright daylight
  [0.52, 0.11, 0.14, 0.20],  // LoRa active
  [0.60, 0.05, 0.07, 0.12],  // Storm approaching: dimming
  [0.70, 0.03, 0.04, 0.07],  // Emergency: near-black
  [0.78, 0.04, 0.06, 0.10],  // Response phase
  [0.85, 0.07, 0.09, 0.14],  // Rescue: lifting
  [0.92, 0.11, 0.14, 0.18],  // Return: golden hour
  [1.00, 0.14, 0.16, 0.20],  // Safe harbour: warm dawn
];

const AMBIENT_INTENSITY: [number, number][] = [
  [0.00, 0.40], [0.10, 0.50], [0.22, 0.60],
  [0.35, 0.70], [0.52, 0.65], [0.60, 0.30],
  [0.70, 0.15], [0.85, 0.42], [0.92, 0.68],
  [1.00, 0.75],
];

// ── Directional (sun) light ───────────────────────────────────────────────────
// Sun colour shifts from warm orange at dawn through white at noon and back
// to warm gold at the return. During storm and emergency it goes cold grey.
const SUN_COLOR: LightFrame[] = [
  [0.00, 0.80, 0.60, 0.40],  // Sunrise orange
  [0.10, 0.85, 0.70, 0.50],  // Morning gold
  [0.22, 0.92, 0.88, 0.80],  // Noon blue-white
  [0.35, 0.90, 0.85, 0.75],  // Afternoon
  [0.52, 0.88, 0.82, 0.70],  // Late afternoon
  [0.60, 0.50, 0.50, 0.60],  // Storm grey
  [0.70, 0.25, 0.25, 0.32],  // Emergency dark
  [0.78, 0.40, 0.42, 0.50],  // Response
  [0.85, 0.60, 0.65, 0.70],  // Clearing
  [0.92, 0.90, 0.75, 0.55],  // Sunset gold return
  [1.00, 0.95, 0.82, 0.62],  // Dawn arrival: warm
];

const SUN_INTENSITY: [number, number][] = [
  [0.00, 1.0], [0.10, 1.3], [0.22, 2.0],
  [0.35, 2.2], [0.52, 2.0], [0.60, 0.8],
  [0.70, 0.4], [0.85, 1.0], [0.92, 1.8],
  [1.00, 2.0],
];

// Sun position (world space) — drives shadow direction AND matches OceanMesh
// uSunDirection keyframes for consistent specular highlight direction.
type Vec3Frame = [number, number, number, number]; // [progress, x, y, z]
const SUN_POSITION: Vec3Frame[] = [
  [0.00,  6,  5, 12],  // Pre-dawn: low, wide angle
  [0.10,  7,  7, 11],  // Harbor: dawn light
  [0.22,  6, 12,  7],  // Open ocean: morning sun rising
  [0.35,  4, 18,  2],  // Fishing zone: near-overhead noon
  [0.52,  4, 16,  5],  // LoRa active: early afternoon
  [0.60,  3, 11, 10],  // Storm: overcast direction
  [0.70,  2.5, 9, 11], // Emergency: dim, low angle
  [0.85,  5, 10,  9],  // Rescue: returning light
  [0.92,  8,  6, 11],  // Return: low afternoon sun
  [1.00,  7,  5.5, 12],// Harbor arrival
];

// ── Fog ───────────────────────────────────────────────────────────────────────
// Fog is the primary tool for making the storm feel oppressive. Dense fog
// at phase 0.70 cuts visibility dramatically, making the ocean feel infinite
// and threatening. The harbour phases use minimal fog for clarity.
const FOG_COLOR: LightFrame[] = [
  [0.00, 0.012, 0.040, 0.090],  // Pre-dawn navy
  [0.10, 0.014, 0.048, 0.100],
  [0.22, 0.018, 0.058, 0.120],  // Open ocean: brighter horizon
  [0.35, 0.020, 0.065, 0.130],  // Fishing zone
  [0.52, 0.018, 0.058, 0.118],
  [0.60, 0.010, 0.028, 0.065],  // Storm: cold grey-blue
  [0.70, 0.004, 0.010, 0.030],  // Emergency: near-black
  [0.78, 0.008, 0.022, 0.055],
  [0.85, 0.012, 0.038, 0.085],
  [0.92, 0.018, 0.058, 0.120],  // Return: clear horizon
  [1.00, 0.022, 0.068, 0.140],  // Dawn harbour
];

const FOG_DENSITY: [number, number][] = [
  [0.00, 0.014], [0.22, 0.008], [0.35, 0.009],
  [0.52, 0.010], [0.60, 0.038], [0.70, 0.058],
  [0.78, 0.032], [0.85, 0.018], [0.92, 0.011],
  [1.00, 0.010],
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * AtmosphereSystem
 *
 * PURPOSE: The atmosphere is the emotional canvas. It tells the visitor
 * whether they are safe or in danger before they read a single word.
 * Dawn: hope. Storm: dread. Golden return: relief.
 */
export function AtmosphereSystem() {
  const ambientRef     = useRef<THREE.AmbientLight>(null);
  const sunRef         = useRef<THREE.DirectionalLight>(null);
  const fillRef        = useRef<THREE.HemisphereLight>(null);

  useFrame(({ scene }) => {
    const p = missionProgressStore.value;

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
      // Move the physical shadow-casting light to match sun direction
      const targetPos = sampleVec3(SUN_POSITION, p);
      sunRef.current.position.lerp(targetPos, 0.016);
    }

    // ── Exponential fog ────────────────────────────────────────────
    // Fog affects mesh rendering but NOT the HDRI background — this
    // produces correct atmospheric perspective: distant geometry fades
    // into the haze while the sky itself remains clear.
    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.lerp(sampleColor(FOG_COLOR, p), 0.020);
      scene.fog.density = lerp(
        scene.fog.density,
        interpolateKeyframes(FOG_DENSITY, p),
        0.020,
      );
    }

    // NOTE: scene.background is now owned by <Environment> below.
    // Do NOT set it here — it would overwrite the HDRI texture.
  });

  return (
    <>
      {/*
        HDRI Environment — Milestone 1: Dawn Harbor preset.
        ─────────────────────────────────────────────────────────────
        • background={true}  → renders as the visible sky behind all meshes.
        • blur={0.7}          → blurs the HDRI so individual features aren't
                                visible; it reads as an atmospheric sky, not
                                a photo of a real place.
        • The same texture provides image-based lighting (IBL) to all
          MeshStandardMaterial instances in the scene — critical for the
          boat GLB in Milestone 2.
        • "dawn" preset loads from Drei's CDN (Poly Haven, CC0).
          In production deployment (Milestone 11), this should be replaced
          with a locally-hosted file in /public/hdr/ to eliminate the CDN
          dependency and ensure loading in offline conditions.
        ─────────────────────────────────────────────────────────────
        Milestone 4 will add phase-reactive HDRI switching:
          dawn → open-ocean → storm-overcast → golden-return
        For now, "dawn" is the correct choice for Milestone 1 (harbor scene).
      */}
      <Environment
        preset="dawn"
        background
        blur={0.7}
      />

      {/* Ambient — fills shadow faces, gives overall scene brightness */}
      <ambientLight
        ref={ambientRef}
        color="#0E1420"
        intensity={0.40}
      />

      {/*
        Directional sun — shadow-casting primary light.
        Shadow map resolution 2048 gives clean-edged boat shadows on
        the ocean surface. camera bounds set to cover the visible ocean.
        Position is lerped in useFrame to match SUN_POSITION keyframes.
      */}
      <directionalLight
        ref={sunRef}
        color="#CC9A66"
        intensity={1.0}
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

      {/*
        Hemisphere fill — sky/ground colour gradient.
        Sky colour (#1a3a5c) matches the HDR sky hue.
        Ground colour (#020a12) is dark navy to simulate ground occlusion.
        This light is STATIC — it provides the baseline illumination from
        above and below without dynamic per-frame cost.
      */}
      <hemisphereLight
        ref={fillRef}
        args={['#1a3a5c', '#020a12', 0.35]}
      />

      {/*
        Fog initialization.
        Must be the first render of fogExp2 — useFrame lerps it afterwards.
        The initial colour and density match the pre-dawn harbour phase (p=0).
      */}
      <fogExp2 attach="fog" args={['#030D1B', 0.014]} />
    </>
  );
}

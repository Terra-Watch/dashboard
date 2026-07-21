'use client';

/**
 * components/three/BoatMesh.tsx
 *
 * Vessel Mesh & Navigation Dynamics.
 * Critical Pass — Hero starting position set to [-5.8, 0, 1.0] for clear water separation.
 */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { missionProgressStore } from '@/lib/mission-progress';
import { interpolateKeyframes, lerp } from '@/lib/utils';
import { MISSION_CONFIG } from '@/lib/mission-config';

// ─── Voyage Path ──────────────────────────────────────────────────────────────
// Catmull-Rom spline control points representing the 12-stage fishing voyage.

const VOYAGE_WAYPOINTS = [
  new THREE.Vector3(-5.8, 0,  1.0),  // 0.00 Harbor water — floating cleanly in front of dock
  new THREE.Vector3(-4.5, 0,  0.2),  // 0.10 Leaving harbor mouth
  new THREE.Vector3(-2.5, 0, -0.5),  // 0.18 Clearing breakwater
  new THREE.Vector3(-0.2, 0, -2.0),  // 0.28 Open ocean, heading out
  new THREE.Vector3( 1.5, 0, -4.0),  // 0.40 Open ocean swell
  new THREE.Vector3( 2.5, 0, -6.0),  // 0.52 Fishing zone
  new THREE.Vector3( 2.0, 0, -7.0),  // 0.60 Storm — drifting slightly
  new THREE.Vector3( 1.0, 0, -7.0),  // 0.70 Emergency — stationary distress
  new THREE.Vector3(-0.5, 0, -5.5),  // 0.78 Rescue — stabilizing
  new THREE.Vector3(-2.8, 0, -3.0),  // 0.85 Return journey
  new THREE.Vector3(-4.8, 0, -0.5),  // 0.92 Harbor approach
  new THREE.Vector3(-5.8, 0,  0.8),  // 1.00 Harbor arrival
];

// Speed multiplier keyframes — boat slows in heavy seas and stops during emergency
const SPEED_SCALE: [number, number][] = [
  [0.00, 0.0], [0.08, 0.6], [0.10, 1.0], [0.35, 1.0],
  [0.45, 0.7], [0.52, 0.9], [0.60, 0.5], [0.70, 0.1],
  [0.78, 0.4], [0.85, 0.9], [0.92, 0.9], [0.98, 0.5], [1.00, 0.0],
];

// Analytical wave elevation formula matching vertex shader (for exact surface snapping)
function getWaveSurfaceElevation(x: number, z: number, time: number, amplitude: number, frequency: number): number {
  const A = amplitude;
  const F = frequency;
  const wave1 = Math.sin(x * F * 0.8 + time * 0.6) * Math.cos(z * F * 0.6 + time * 0.45) * A * 1.00;
  const wave2 = Math.sin(x * F * 0.5 + z * F * 1.2 + time * 0.75 + 1.571) * A * 0.52;
  const wave3 = Math.sin(x * F * 2.1 + z * F * 1.5 + time * 1.10 + 3.142) * A * 0.32;
  return wave1 + wave2 + wave3;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function BoatMesh() {
  const groupRef = useRef<THREE.Group>(null);
  const radarRef = useRef<THREE.Mesh>(null);
  const signalLightRef = useRef<THREE.PointLight>(null);
  const signalMeshRef = useRef<THREE.Mesh>(null);

  const bobPhaseRef = useRef(0);
  const currentRotation = useRef(new THREE.Euler());

  // Build Catmull-Rom curve from waypoints
  const curve = useMemo(
    () => new THREE.CatmullRomCurve3(VOYAGE_WAYPOINTS, false, 'catmullrom', 0.5),
    [],
  );

  useFrame(({ clock }, delta) => {
    if (!groupRef.current) return;

    const p = missionProgressStore.value;
    const t = clock.getElapsedTime();

    // ── 1. Position along Catmull-Rom Spline ──────────────────────────────────
    const clampedP = Math.max(0.0001, Math.min(p, 0.9999));
    const targetPoint = curve.getPoint(clampedP);
    
    // Smooth position lerp
    groupRef.current.position.x = lerp(groupRef.current.position.x, targetPoint.x, 0.04);
    groupRef.current.position.z = lerp(groupRef.current.position.z, targetPoint.z, 0.04);

    // ── 2. Heading Derivation & Smooth Rotation ──────────────────────────────
    const lookAheadPoint = curve.getPoint(Math.min(clampedP + 0.005, 0.9999));
    const tangent = lookAheadPoint.clone().sub(targetPoint);
    
    if (tangent.lengthSq() > 0.00001) {
      const targetHeading = Math.atan2(tangent.x, tangent.z);
      let headingDiff = targetHeading - currentRotation.current.y;
      headingDiff = Math.atan2(Math.sin(headingDiff), Math.cos(headingDiff)); // Wrap around -PI to PI
      currentRotation.current.y += headingDiff * 0.035;
    }

    // ── 3. Wave Surface Snapping & Multi-axis Hydrodynamic Bobbing ──────────
    const waveAmp = interpolateKeyframes(MISSION_CONFIG.TELEMETRY.waveHeight, p);
    const speedMult = interpolateKeyframes(SPEED_SCALE, p);

    // Surface elevation at current vessel coordinates
    const surfaceY = getWaveSurfaceElevation(
      groupRef.current.position.x,
      groupRef.current.position.z,
      t,
      waveAmp,
      0.35
    );

    bobPhaseRef.current += delta * (0.85 + waveAmp * 0.75 + speedMult * 0.4);
    const bobFactor = waveAmp * 0.18;

    // Heave (vertical bobbing)
    const heave = Math.sin(bobPhaseRef.current) * bobFactor;
    groupRef.current.position.y = surfaceY * 0.65 + heave;

    // Pitch (nose up/down) & Roll (side to side)
    const pitchTarget = Math.sin(bobPhaseRef.current * 0.9 + 0.4) * bobFactor * 0.45;
    const rollTarget = Math.sin(bobPhaseRef.current * 1.25 + 1.1) * bobFactor * 0.55;

    currentRotation.current.x = lerp(currentRotation.current.x, pitchTarget, 0.05);
    currentRotation.current.z = lerp(currentRotation.current.z, rollTarget, 0.05);

    groupRef.current.rotation.set(
      currentRotation.current.x,
      currentRotation.current.y,
      currentRotation.current.z,
      'YXZ'
    );

    // ── 4. Radar Dome Rotation ─────────────────────────────────────────────
    if (radarRef.current) {
      radarRef.current.rotation.y += delta * 2.5;
    }

    // ── 5. Signal Light & LoRa Emergency Beacon ────────────────────────────
    if (signalLightRef.current && signalMeshRef.current) {
      const isEmergency = p >= 0.70 && p < 0.85;
      const isLoraActive = p >= 0.52;

      const mat = signalMeshRef.current.material as THREE.MeshStandardMaterial;

      if (isEmergency) {
        // Rapid flashing SOS strobe (Orange/Red)
        const strobe = Math.sin(t * 12) > 0 ? 1 : 0;
        const col = strobe ? '#FF4400' : '#220500';
        signalLightRef.current.color.set(col);
        signalLightRef.current.intensity = strobe * 2.8;
        mat.color.set(col);
        mat.emissive.set(col);
        mat.emissiveIntensity = strobe * 3.0;
      } else if (isLoraActive) {
        // Soft pulsing Cyan LoRa Mesh active beacon
        const pulse = 0.75 + Math.sin(t * 2.5) * 0.25;
        signalLightRef.current.color.set('#00C8DC');
        signalLightRef.current.intensity = pulse * 1.5;
        mat.color.set('#00C8DC');
        mat.emissive.set('#00C8DC');
        mat.emissiveIntensity = pulse * 2.2;
      } else {
        // Dim standby light in harbour/open ocean
        signalLightRef.current.color.set('#005566');
        signalLightRef.current.intensity = 0.35;
        mat.color.set('#005566');
        mat.emissive.set('#003344');
        mat.emissiveIntensity = 0.5;
      }
    }
  });

  return (
    <group ref={groupRef} scale={[0.55, 0.55, 0.55]}>
      {/* ── Main Hull (Deep Navy Steel) ─────────────────────────── */}
      <mesh castShadow receiveShadow position={[0, 0, 0]}>
        <boxGeometry args={[4.2, 0.75, 1.5]} />
        <meshStandardMaterial color="#16253B" metalness={0.4} roughness={0.55} />
      </mesh>

      {/* Hull Keel / Underbody ────────────────────────────────────── */}
      <mesh position={[0, -0.38, 0]}>
        <boxGeometry args={[3.9, 0.14, 1.1]} />
        <meshStandardMaterial color="#0F1826" metalness={0.5} roughness={0.65} />
      </mesh>

      {/* Tapered Bow Wedge ────────────────────────────────────────── */}
      <mesh position={[2.0, 0.08, 0]} rotation={[0, 0, 0.12]}>
        <boxGeometry args={[0.9, 0.65, 1.35]} />
        <meshStandardMaterial color="#16253B" metalness={0.4} roughness={0.55} />
      </mesh>

      {/* ── Deck (Non-skid Dark Wood/Composite) ───────────────────── */}
      <mesh castShadow receiveShadow position={[0, 0.38, 0]}>
        <boxGeometry args={[4.0, 0.10, 1.35]} />
        <meshStandardMaterial color="#111D2D" metalness={0.25} roughness={0.75} />
      </mesh>

      {/* Deck Guard Railings ──────────────────────────────────────── */}
      <mesh position={[0, 0.60, 0.65]}>
        <boxGeometry args={[3.8, 0.04, 0.03]} />
        <meshStandardMaterial color="#334455" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.60, -0.65]}>
        <boxGeometry args={[3.8, 0.04, 0.03]} />
        <meshStandardMaterial color="#334455" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* ── Wheelhouse / Cabin ────────────────────────────────────── */}
      <mesh castShadow receiveShadow position={[-0.5, 0.90, 0]}>
        <boxGeometry args={[1.6, 0.95, 1.05]} />
        <meshStandardMaterial color="#0C1A2B" metalness={0.3} roughness={0.6} />
      </mesh>

      {/* Cabin Roof Overhang ──────────────────────────────────────── */}
      <mesh position={[-0.5, 1.40, 0]}>
        <boxGeometry args={[1.7, 0.08, 1.15]} />
        <meshStandardMaterial color="#08121F" metalness={0.4} roughness={0.5} />
      </mesh>

      {/* Cabin Windows (Illuminated Tinted Glass) ────────────────── */}
      <mesh position={[-0.5, 0.92, 0.54]}>
        <boxGeometry args={[1.1, 0.35, 0.02]} />
        <meshStandardMaterial color="#00C8DC" emissive="#008899" emissiveIntensity={0.6} roughness={0.2} />
      </mesh>
      <mesh position={[-0.5, 0.92, -0.54]}>
        <boxGeometry args={[1.1, 0.35, 0.02]} />
        <meshStandardMaterial color="#00C8DC" emissive="#008899" emissiveIntensity={0.6} roughness={0.2} />
      </mesh>
      <mesh position={[0.31, 0.92, 0]}>
        <boxGeometry args={[0.02, 0.35, 0.85]} />
        <meshStandardMaterial color="#00C8DC" emissive="#008899" emissiveIntensity={0.7} roughness={0.2} />
      </mesh>

      {/* ── Life Ring Accents ─────────────────────────────────────── */}
      <mesh position={[-0.5, 0.90, 0.58]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.12, 0.04, 8, 16]} />
        <meshStandardMaterial color="#FF5500" emissive="#CC3300" emissiveIntensity={0.4} />
      </mesh>
      <mesh position={[-0.5, 0.90, -0.58]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.12, 0.04, 8, 16]} />
        <meshStandardMaterial color="#FF5500" emissive="#CC3300" emissiveIntensity={0.4} />
      </mesh>

      {/* ── Main Mast Assembly ────────────────────────────────────── */}
      <mesh castShadow position={[0.6, 2.05, 0]}>
        <cylinderGeometry args={[0.04, 0.055, 2.9, 10]} />
        <meshStandardMaterial color="#223344" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Mast Boom Crossbar ──────────────────────────────────────── */}
      <mesh position={[0.6, 2.45, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.025, 0.025, 1.4, 8]} />
        <meshStandardMaterial color="#223344" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Radar Scanner Base & Rotating Dome ──────────────────────── */}
      <mesh position={[0.6, 2.65, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.08, 12]} />
        <meshStandardMaterial color="#111" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh ref={radarRef} position={[0.6, 2.72, 0]}>
        <boxGeometry args={[0.35, 0.06, 0.08]} />
        <meshStandardMaterial color="#EEEEEE" metalness={0.3} roughness={0.3} />
      </mesh>

      {/* Whisker Antenna ──────────────────────────────────────────── */}
      <mesh position={[0.6, 3.60, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.7, 6]} />
        <meshStandardMaterial color="#334455" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* ── Signal / LoRa / Emergency Beacon Light ────────────────── */}
      <mesh ref={signalMeshRef} position={[0.6, 3.30, 0]}>
        <sphereGeometry args={[0.14, 16, 16]} />
        <meshStandardMaterial
          color="#005566"
          emissive="#003344"
          emissiveIntensity={0.5}
          roughness={0.1}
        />
      </mesh>
      <pointLight
        ref={signalLightRef}
        position={[0.6, 3.30, 0]}
        color="#005566"
        intensity={0.35}
        distance={12}
        decay={2}
      />

      {/* ── Maritime Navigation Lights ────────────────────────────── */}
      {/* Port Light (Red - Left) */}
      <mesh position={[1.7, 0.52, -0.65]}>
        <sphereGeometry args={[0.065, 12, 12]} />
        <meshStandardMaterial color="#FF2200" emissive="#FF1100" emissiveIntensity={2.0} />
      </mesh>
      {/* Starboard Light (Green - Right) */}
      <mesh position={[1.7, 0.52, 0.65]}>
        <sphereGeometry args={[0.065, 12, 12]} />
        <meshStandardMaterial color="#00FF44" emissive="#00CC33" emissiveIntensity={2.0} />
      </mesh>
    </group>
  );
}

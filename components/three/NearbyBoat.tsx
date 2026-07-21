'use client';

/**
 * components/three/NearbyBoat.tsx
 *
 * Responding Rescue Vessel.
 * Milestone 9 — Nearby Rescue Vessels Integration.
 *
 * Responsibilities:
 *   - Secondary fishing vessel responding to LoRa Mesh SOS broadcast
 *   - Appears at phase 0.75, accelerates along approach trajectory toward distressed boat position
 *   - Flashing amber/orange emergency responder lights
 *   - Phase-gated visibility: visible only during response & rescue phase (0.75-0.92)
 *   - Wave surface snapping and hydro-dynamic bobbing
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { missionProgressStore } from '@/lib/mission-progress';
import { interpolateKeyframes, lerp, smoothstep } from '@/lib/utils';
import { MISSION_CONFIG } from '@/lib/mission-config';

// Start position (far offshore right) and final rescue position (alongside hero boat)
const START_POS = new THREE.Vector3(12.0, 0, -12.0);
const RESCUE_POS = new THREE.Vector3(3.2, 0, -6.2);

function getWaveSurfaceElevation(x: number, z: number, time: number, amplitude: number): number {
  const A = amplitude;
  const F = 0.35;
  const wave1 = Math.sin(x * F * 0.8 + time * 0.6) * Math.cos(z * F * 0.6 + time * 0.45) * A * 1.00;
  const wave2 = Math.sin(x * F * 0.5 + z * F * 1.2 + time * 0.75 + 1.571) * A * 0.52;
  return wave1 + wave2;
}

export function NearbyBoat() {
  const groupRef = useRef<THREE.Group>(null);
  const beaconLightRef = useRef<THREE.PointLight>(null);
  const beaconMeshRef = useRef<THREE.Mesh>(null);
  const bobPhaseRef = useRef(0);

  useFrame(({ clock }, delta) => {
    if (!groupRef.current) return;

    const p = missionProgressStore.value;
    const t = clock.getElapsedTime();

    // Visible only during response and rescue phases (0.75-0.92)
    const isResponding = p >= 0.75 && p <= 0.92;
    const opacity = isResponding
      ? Math.min(
          smoothstep(0.75, 0.78, p),
          1.0 - smoothstep(0.88, 0.92, p)
        )
      : 0;

    if (opacity <= 0.001) {
      groupRef.current.visible = false;
      return;
    }
    groupRef.current.visible = true;

    // Approach progress 0 -> 1 between p = 0.75 and 0.85
    const approachFactor = smoothstep(0.75, 0.85, p);
    
    // Interpolate world position
    const currentX = lerp(START_POS.x, RESCUE_POS.x, approachFactor);
    const currentZ = lerp(START_POS.z, RESCUE_POS.z, approachFactor);

    groupRef.current.position.x = currentX;
    groupRef.current.position.z = currentZ;

    // Heading angle facing toward distressed boat
    const headingAngle = Math.atan2(
      RESCUE_POS.x - START_POS.x,
      RESCUE_POS.z - START_POS.z
    );
    groupRef.current.rotation.y = headingAngle;

    // Surface wave elevation and heave/roll bobbing
    const waveAmp = interpolateKeyframes(MISSION_CONFIG.TELEMETRY.waveHeight, p);
    const surfaceY = getWaveSurfaceElevation(currentX, currentZ, t, waveAmp);
    
    bobPhaseRef.current += delta * (0.9 + waveAmp * 0.6);
    const heave = Math.sin(bobPhaseRef.current) * waveAmp * 0.16;
    const roll  = Math.sin(bobPhaseRef.current * 1.3 + 0.8) * waveAmp * 0.45;

    groupRef.current.position.y = surfaceY * 0.65 + heave;
    groupRef.current.rotation.z = roll;

    // Traverse children to update material opacity
    groupRef.current.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mat = child.material as THREE.MeshStandardMaterial;
        mat.transparent = true;
        mat.opacity = opacity;
      }
    });

    // Flashing emergency responder light (Orange/Yellow strobe)
    if (beaconLightRef.current && beaconMeshRef.current) {
      const flash = Math.sin(t * 10) > 0 ? 1 : 0;
      beaconLightRef.current.intensity = flash * opacity * 2.5;
      
      const mat = beaconMeshRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = flash * opacity * 3.0;
    }
  });

  return (
    <group ref={groupRef} scale={[0.50, 0.50, 0.50]}>
      {/* ── Main Hull (Steel Blue/White Responder Color) ─────────── */}
      <mesh castShadow position={[0, 0, 0]}>
        <boxGeometry args={[4.0, 0.72, 1.4]} />
        <meshStandardMaterial color="#224466" metalness={0.4} roughness={0.5} />
      </mesh>

      {/* Hull Keel ───────────────────────────────────────────────── */}
      <mesh position={[0, -0.36, 0]}>
        <boxGeometry args={[3.6, 0.12, 1.0]} />
        <meshStandardMaterial color="#112233" metalness={0.5} roughness={0.6} />
      </mesh>

      {/* Deck ───────────────────────────────────────────────────── */}
      <mesh position={[0, 0.37, 0]}>
        <boxGeometry args={[3.8, 0.10, 1.25]} />
        <meshStandardMaterial color="#1A334C" metalness={0.3} roughness={0.7} />
      </mesh>

      {/* ── Cabin ───────────────────────────────────────────────── */}
      <mesh position={[-0.4, 0.88, 0]}>
        <boxGeometry args={[1.5, 0.90, 1.0]} />
        <meshStandardMaterial color="#142B44" metalness={0.3} roughness={0.5} />
      </mesh>

      {/* Cabin Windows (Warm Yellow Interior) ───────────────────── */}
      <mesh position={[-0.4, 0.90, 0.51]}>
        <boxGeometry args={[1.0, 0.32, 0.02]} />
        <meshStandardMaterial color="#FFBB44" emissive="#FF8800" emissiveIntensity={0.8} />
      </mesh>
      <mesh position={[-0.4, 0.90, -0.51]}>
        <boxGeometry args={[1.0, 0.32, 0.02]} />
        <meshStandardMaterial color="#FFBB44" emissive="#FF8800" emissiveIntensity={0.8} />
      </mesh>

      {/* ── Mast & Responder Strobe ──────────────────────────────── */}
      <mesh position={[0.5, 2.0, 0]}>
        <cylinderGeometry args={[0.04, 0.05, 2.7, 8]} />
        <meshStandardMaterial color="#335577" metalness={0.7} roughness={0.3} />
      </mesh>

      {/* Emergency Strobe Light Lens ────────────────────────────── */}
      <mesh ref={beaconMeshRef} position={[0.5, 3.3, 0]}>
        <sphereGeometry args={[0.14, 12, 12]} />
        <meshStandardMaterial
          color="#FF7700"
          emissive="#FF4400"
          emissiveIntensity={2.0}
        />
      </mesh>
      <pointLight
        ref={beaconLightRef}
        position={[0.5, 3.3, 0]}
        color="#FF7700"
        intensity={2.5}
        distance={15}
        decay={2}
      />

      {/* Navigation Lights ──────────────────────────────────────── */}
      <mesh position={[1.5, 0.5, -0.6]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color="#FF2200" emissive="#FF1100" emissiveIntensity={2.0} />
      </mesh>
      <mesh position={[1.5, 0.5, 0.6]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color="#00FF44" emissive="#00CC33" emissiveIntensity={2.0} />
      </mesh>
    </group>
  );
}

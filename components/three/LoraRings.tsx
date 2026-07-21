'use client';

/**
 * components/three/LoraRings.tsx
 *
 * LoRa Mesh Radio Wave Visualization.
 * Milestone 5 — LoRa Mesh Visualization.
 *
 * Responsibilities:
 *   - Expanding concentric signal mesh rings originating dynamically from vessel coordinates
 *   - Mode 1: Cyan (`#00C8DC` / `#00FFFF`) pulsing radio mesh heartbeat during active mesh mode (0.52–0.70)
 *   - Mode 2: Emergency Orange/Red (`#FF5A1F` / `#FF2200`) distress shockwave rings during SOS mode (0.70–0.85)
 *   - Height displacement matching surface swell to prevent z-fighting with ocean geometry
 *   - Smooth opacity falloff as rings expand out toward the offshore horizon
 */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { missionProgressStore } from '@/lib/mission-progress';
import { interpolateKeyframes, smoothstep } from '@/lib/utils';

const RING_COUNT = 5;
const NORMAL_DURATION = 3.2; // Seconds per ring in normal mode
const SOS_DURATION = 1.8;    // Seconds per ring during emergency SOS

const VOYAGE_WAYPOINTS = [
  new THREE.Vector3(-7.5, 0,  1.5),
  new THREE.Vector3(-5.5, 0,  0.5),
  new THREE.Vector3(-3.0, 0, -0.5),
  new THREE.Vector3(-0.5, 0, -2.0),
  new THREE.Vector3( 1.5, 0, -4.0),
  new THREE.Vector3( 2.5, 0, -6.0),
  new THREE.Vector3( 2.0, 0, -7.0),
  new THREE.Vector3( 1.0, 0, -7.0),
  new THREE.Vector3(-0.5, 0, -5.5),
  new THREE.Vector3(-3.0, 0, -3.0),
  new THREE.Vector3(-6.0, 0, -0.5),
  new THREE.Vector3(-7.5, 0,  1.0),
];

export function LoraRings() {
  const groupRef = useRef<THREE.Group>(null);
  const ringsRef = useRef<THREE.Mesh[]>([]);
  const timeRef = useRef(0);

  // Curve matching BoatMesh voyage trajectory
  const curve = useMemo(
    () => new THREE.CatmullRomCurve3(VOYAGE_WAYPOINTS, false, 'catmullrom', 0.5),
    [],
  );

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    const p = missionProgressStore.value;
    const clampedP = Math.max(0.0001, Math.min(p, 0.9999));

    // Dynamic position tracking to match vessel location
    const boatPos = curve.getPoint(clampedP);
    groupRef.current.position.set(boatPos.x, boatPos.y + 0.35, boatPos.z);

    // Visibility gating: Active Mesh (0.52-0.70) & Emergency SOS (0.70-0.85)
    const isLoraActive = p >= 0.51 && p < 0.70;
    const isEmergency  = p >= 0.70 && p < 0.85;
    const isVisible    = isLoraActive || isEmergency;

    // Master opacity calculation
    const masterOpacity = isVisible
      ? Math.min(
          smoothstep(0.51, 0.54, p),
          1.0 - smoothstep(0.82, 0.85, p)
        )
      : 0;

    if (masterOpacity <= 0.001) {
      groupRef.current.visible = false;
      return;
    }
    groupRef.current.visible = true;

    // Duration and expansion rate adjust based on mode
    const duration = isEmergency ? SOS_DURATION : NORMAL_DURATION;
    timeRef.current += delta;

    // Color theme configuration
    const targetColor = isEmergency ? '#FF5A1F' : '#00C8DC';
    const targetEmissive = isEmergency ? '#FF2200' : '#00AAAA';

    ringsRef.current.forEach((ring, i) => {
      if (!ring) return;

      const offset = (i / RING_COUNT) * duration;
      const localTime = ((timeRef.current + offset) % duration) / duration;

      // Expansion scale: 0.6 -> 5.5
      const scale = 0.6 + localTime * 4.9;
      ring.scale.set(scale, scale, 1);

      // Opacity fades out smoothly as ring expands to periphery
      const ringAlpha = (1.0 - Math.pow(localTime, 1.5)) * masterOpacity * (isEmergency ? 0.85 : 0.65);
      const mat = ring.material as THREE.MeshStandardMaterial;

      mat.opacity = ringAlpha;
      mat.color.set(targetColor);
      mat.emissive.set(targetEmissive);
      mat.emissiveIntensity = isEmergency ? 2.5 : 1.2;
    });
  });

  return (
    <group ref={groupRef}>
      {Array.from({ length: RING_COUNT }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            if (el) ringsRef.current[i] = el;
          }}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0, 0]}
        >
          <ringGeometry args={[0.85, 1.0, 64]} />
          <meshStandardMaterial
            color="#00C8DC"
            emissive="#00AAAA"
            emissiveIntensity={1.2}
            transparent
            opacity={0}
            side={THREE.DoubleSide}
            depthWrite={false}
            roughness={0.1}
          />
        </mesh>
      ))}
    </group>
  );
}

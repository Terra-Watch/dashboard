'use client';

/**
 * components/three/HarborMesh.tsx
 *
 * Harbor Structure & Breakwater Beacon.
 * Critical Pass — Shifted to [-11.5, 0, 2.5] for clean hero separation (Dock -> Water -> Boat).
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { missionProgressStore } from '@/lib/mission-progress';
import { smoothstep } from '@/lib/utils';

export function HarborMesh() {
  const groupRef = useRef<THREE.Group>(null);
  const beaconLightRef = useRef<THREE.PointLight>(null);
  const beaconMeshRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;

    const p = missionProgressStore.value;
    const t = clock.getElapsedTime();

    // Visible during harbor departure (0.00-0.16) and harbor return (0.88-1.00)
    const isDeparture = p <= 0.16;
    const isReturn    = p >= 0.88;
    const isVisible   = isDeparture || isReturn;

    // Calculate smooth opacity factor
    const departureOpacity = 1.0 - smoothstep(0.10, 0.16, p);
    const returnOpacity    = smoothstep(0.88, 0.94, p);
    const opacity          = isDeparture ? departureOpacity : (isReturn ? returnOpacity : 0);

    if (opacity <= 0.001) {
      groupRef.current.visible = false;
      return;
    }
    groupRef.current.visible = true;

    // Traverse children to update material opacity
    groupRef.current.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material) {
        const mat = child.material as THREE.MeshStandardMaterial;
        mat.transparent = true;
        mat.opacity = opacity;
      }
    });

    // Harbor beacon pulsing light (warm amber dawn light)
    if (beaconLightRef.current && beaconMeshRef.current) {
      const pulse = 0.8 + Math.sin(t * 3.0) * 0.2;
      beaconLightRef.current.intensity = pulse * opacity * 2.2;
      
      const mat = beaconMeshRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = pulse * opacity * 2.5;
    }
  });

  return (
    // Shifted dock far left to [-11.5, 0, 2.5] so dock, water, and vessel are physically distinct
    <group ref={groupRef} position={[-11.5, 0, 2.5]} rotation={[0, 0.25, 0]}>
      {/* ── Main Concrete Dock Pier ─────────────────────────────── */}
      <mesh castShadow receiveShadow position={[0, 0.25, 0]}>
        <boxGeometry args={[3.2, 0.5, 8.0]} />
        <meshStandardMaterial color="#16202C" roughness={0.8} metalness={0.2} />
      </mesh>

      {/* Dock Wooden Planks Top ──────────────────────────────────── */}
      <mesh position={[0, 0.52, 0]}>
        <boxGeometry args={[3.3, 0.06, 8.1]} />
        <meshStandardMaterial color="#0E1620" roughness={0.9} metalness={0.1} />
      </mesh>

      {/* Wooden Pylons Driven into Sea Floor ────────────────────── */}
      {[-3.5, -1.8, 0, 1.8, 3.5].map((z, idx) => (
        <group key={idx}>
          <mesh position={[-1.4, -1.0, z]}>
            <cylinderGeometry args={[0.12, 0.14, 2.5, 8]} />
            <meshStandardMaterial color="#080E17" roughness={0.95} />
          </mesh>
          <mesh position={[1.4, -1.0, z]}>
            <cylinderGeometry args={[0.12, 0.14, 2.5, 8]} />
            <meshStandardMaterial color="#080E17" roughness={0.95} />
          </mesh>
        </group>
      ))}

      {/* Dock Mooring Cleats ───────────────────────────────────── */}
      {[-2.5, 0, 2.5].map((z, idx) => (
        <mesh key={idx} position={[1.5, 0.60, z]}>
          <boxGeometry args={[0.2, 0.1, 0.4]} />
          <meshStandardMaterial color="#2B3A4A" metalness={0.8} roughness={0.3} />
        </mesh>
      ))}

      {/* ── Breakwater Beacon Tower ────────────────────────────── */}
      <mesh position={[1.2, 1.8, -3.4]}>
        <cylinderGeometry args={[0.35, 0.5, 2.4, 12]} />
        <meshStandardMaterial color="#1A2736" roughness={0.6} metalness={0.4} />
      </mesh>

      {/* Beacon Light Housing / Gallery ──────────────────────────── */}
      <mesh position={[1.2, 3.1, -3.4]}>
        <cylinderGeometry args={[0.42, 0.42, 0.2, 12]} />
        <meshStandardMaterial color="#0D141E" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Amber Beacon Lens ──────────────────────────────────────── */}
      <mesh ref={beaconMeshRef} position={[1.2, 3.35, -3.4]}>
        <cylinderGeometry args={[0.28, 0.28, 0.35, 12]} />
        <meshStandardMaterial
          color="#FF9900"
          emissive="#FF7700"
          emissiveIntensity={2.0}
          roughness={0.1}
        />
      </mesh>

      {/* Point Light from Beacon Lens */}
      <pointLight
        ref={beaconLightRef}
        position={[1.2, 3.4, -3.4]}
        color="#FF9900"
        intensity={2.2}
        distance={25}
        decay={2}
      />
    </group>
  );
}

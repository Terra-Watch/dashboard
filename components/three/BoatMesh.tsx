'use client';

/**
 * components/three/BoatMesh.tsx
 *
 * Sculpted High-Fidelity Maritime Vessel.
 * Replaces crude box geometries with smooth extruded hydrodynamic hull shapes & rounded bevels.
 */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { missionProgressStore } from '@/lib/mission-progress';
import { interpolateKeyframes, lerp } from '@/lib/utils';
import { MISSION_CONFIG } from '@/lib/mission-config';

// ─── Voyage Path ──────────────────────────────────────────────────────────────
const VOYAGE_WAYPOINTS = [
  new THREE.Vector3(-5.8, 0,  1.0),  // 0.00 Harbor water
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

const SPEED_SCALE: [number, number][] = [
  [0.00, 0.0], [0.08, 0.6], [0.10, 1.0], [0.35, 1.0],
  [0.45, 0.7], [0.52, 0.9], [0.60, 0.5], [0.70, 0.1],
  [0.78, 0.4], [0.85, 0.9], [0.92, 0.9], [0.98, 0.5], [1.00, 0.0],
];

function getWaveSurfaceElevation(x: number, z: number, time: number, amplitude: number, frequency: number): number {
  const A = amplitude;
  const F = frequency;
  const wave1 = Math.sin(x * F * 0.8 + time * 0.6) * Math.cos(z * F * 0.6 + time * 0.45) * A * 1.00;
  const wave2 = Math.sin(x * F * 0.5 + z * F * 1.2 + time * 0.75 + 1.571) * A * 0.52;
  const wave3 = Math.sin(x * F * 2.1 + z * F * 1.5 + time * 1.10 + 3.142) * A * 0.32;
  return wave1 + wave2 + wave3;
}

export function BoatMesh() {
  const groupRef = useRef<THREE.Group>(null);
  const radarRef = useRef<THREE.Mesh>(null);
  const signalLightRef = useRef<THREE.PointLight>(null);
  const signalMeshRef = useRef<THREE.Mesh>(null);

  const bobPhaseRef = useRef(0);
  const currentRotation = useRef(new THREE.Euler());

  const curve = useMemo(
    () => new THREE.CatmullRomCurve3(VOYAGE_WAYPOINTS, false, 'catmullrom', 0.5),
    [],
  );

  // ── Sculpted Smooth Hydrodynamic Hull Geometry ────────────────────────────
  const hullGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    // Smooth side profile: Stem -> Bow -> Deck -> Transom -> Keel
    shape.moveTo(-2.1, 0.38);
    shape.bezierCurveTo(-1.8, -0.42, 1.6, -0.40, 2.2, 0.12); // Keel line
    shape.lineTo(2.4, 0.48);                                 // Raked Bow Stem
    shape.lineTo(-2.1, 0.48);                                // Sheer Deck Line
    shape.closePath();

    const extrudeSettings = {
      steps: 2,
      depth: 1.35,
      bevelEnabled: true,
      bevelThickness: 0.12,
      bevelSize: 0.10,
      bevelOffset: 0,
      bevelSegments: 8,
    };

    const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geom.center();
    return geom;
  }, []);

  // ── Sculpted Cabin / Wheelhouse Geometry ──────────────────────────────────
  const cabinGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.8, 0.0);
    shape.lineTo(0.7, 0.0);
    shape.lineTo(0.6, 0.82); // Slanted windshield
    shape.lineTo(-0.8, 0.82);
    shape.closePath();

    const extrudeSettings = {
      steps: 1,
      depth: 0.95,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.06,
      bevelSegments: 6,
    };

    const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geom.center();
    return geom;
  }, []);

  useFrame(({ clock }, delta) => {
    if (!groupRef.current) return;

    const p = missionProgressStore.value;
    const t = clock.getElapsedTime();

    // ── 1. Position along Spline ───────────────────────────────────────────
    const clampedP = Math.max(0.0001, Math.min(p, 0.9999));
    const targetPoint = curve.getPoint(clampedP);
    
    groupRef.current.position.x = lerp(groupRef.current.position.x, targetPoint.x, 0.04);
    groupRef.current.position.z = lerp(groupRef.current.position.z, targetPoint.z, 0.04);

    // ── 2. Heading Derivation ──────────────────────────────────────────────
    const lookAheadPoint = curve.getPoint(Math.min(clampedP + 0.005, 0.9999));
    const tangent = lookAheadPoint.clone().sub(targetPoint);
    
    if (tangent.lengthSq() > 0.00001) {
      const targetHeading = Math.atan2(tangent.x, tangent.z);
      let headingDiff = targetHeading - currentRotation.current.y;
      headingDiff = Math.atan2(Math.sin(headingDiff), Math.cos(headingDiff));
      currentRotation.current.y += headingDiff * 0.035;
    }

    // ── 3. Hydrodynamic Swell Snapping ─────────────────────────────────────
    const waveAmp = interpolateKeyframes(MISSION_CONFIG.TELEMETRY.waveHeight, p);
    const speedMult = interpolateKeyframes(SPEED_SCALE, p);

    const surfaceY = getWaveSurfaceElevation(
      groupRef.current.position.x,
      groupRef.current.position.z,
      t,
      waveAmp,
      0.35
    );

    bobPhaseRef.current += delta * (0.85 + waveAmp * 0.75 + speedMult * 0.4);
    const bobFactor = waveAmp * 0.18;

    const heave = Math.sin(bobPhaseRef.current) * bobFactor;
    groupRef.current.position.y = surfaceY * 0.65 + heave;

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

    // ── 4. Radar Dome ──────────────────────────────────────────────────────
    if (radarRef.current) {
      radarRef.current.rotation.y += delta * 2.5;
    }

    // ── 5. Signal Light ───────────────────────────────────────────────────
    if (signalLightRef.current && signalMeshRef.current) {
      const isEmergency = p >= 0.70 && p < 0.85;
      const isLoraActive = p >= 0.52;

      const mat = signalMeshRef.current.material as THREE.MeshStandardMaterial;

      if (isEmergency) {
        const strobe = Math.sin(t * 12) > 0 ? 1 : 0;
        const col = strobe ? '#FF4400' : '#220500';
        signalLightRef.current.color.set(col);
        signalLightRef.current.intensity = strobe * 2.8;
        mat.color.set(col);
        mat.emissive.set(col);
        mat.emissiveIntensity = strobe * 3.0;
      } else if (isLoraActive) {
        const pulse = 0.75 + Math.sin(t * 2.5) * 0.25;
        signalLightRef.current.color.set('#00C8DC');
        signalLightRef.current.intensity = pulse * 1.5;
        mat.color.set('#00C8DC');
        mat.emissive.set('#00C8DC');
        mat.emissiveIntensity = pulse * 2.2;
      } else {
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
      {/* ── Sculpted Hull (Smooth Metallic Deep Navy) ─────────────── */}
      <mesh geometry={hullGeometry} castShadow receiveShadow position={[0, 0, 0]}>
        <meshStandardMaterial
          color="#162840"
          metalness={0.5}
          roughness={0.4}
        />
      </mesh>

      {/* ── Deckhouse / Wheelhouse (Bevelled Glass Cabin) ───────── */}
      <mesh geometry={cabinGeometry} castShadow receiveShadow position={[-0.4, 0.75, 0]}>
        <meshStandardMaterial
          color="#0E1D2E"
          metalness={0.4}
          roughness={0.5}
        />
      </mesh>

      {/* Windshield Glass Panel ───────────────────────────────────── */}
      <mesh position={[0.22, 1.15, 0]} rotation={[0, 0, -0.15]}>
        <boxGeometry args={[0.04, 0.35, 0.85]} />
        <meshStandardMaterial
          color="#00C8DC"
          emissive="#008899"
          emissiveIntensity={0.8}
          roughness={0.1}
          metalness={0.9}
        />
      </mesh>

      {/* Side Windows ────────────────────────────────────────────── */}
      <mesh position={[-0.4, 1.15, 0.49]}>
        <boxGeometry args={[1.0, 0.30, 0.02]} />
        <meshStandardMaterial
          color="#00C8DC"
          emissive="#008899"
          emissiveIntensity={0.6}
          roughness={0.1}
        />
      </mesh>
      <mesh position={[-0.4, 1.15, -0.49]}>
        <boxGeometry args={[1.0, 0.30, 0.02]} />
        <meshStandardMaterial
          color="#00C8DC"
          emissive="#008899"
          emissiveIntensity={0.6}
          roughness={0.1}
        />
      </mesh>

      {/* ── Slender Tapered Mast & Antenna Rigging ───────────────── */}
      <mesh castShadow position={[0.6, 2.1, 0]}>
        <cylinderGeometry args={[0.03, 0.05, 2.8, 12]} />
        <meshStandardMaterial color="#22364C" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Mast Crossbar ────────────────────────────────────────────── */}
      <mesh position={[0.6, 2.5, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.02, 0.02, 1.3, 8]} />
        <meshStandardMaterial color="#22364C" metalness={0.8} roughness={0.2} />
      </mesh>

      {/* Radar Scanner Base & Bar ─────────────────────────────────── */}
      <mesh position={[0.6, 2.7, 0]}>
        <cylinderGeometry args={[0.10, 0.10, 0.06, 12]} />
        <meshStandardMaterial color="#111" metalness={0.9} roughness={0.1} />
      </mesh>
      <mesh ref={radarRef} position={[0.6, 2.75, 0]}>
        <boxGeometry args={[0.38, 0.05, 0.07]} />
        <meshStandardMaterial color="#F0F4F8" metalness={0.2} roughness={0.3} />
      </mesh>

      {/* Whisker Antenna ──────────────────────────────────────────── */}
      <mesh position={[0.6, 3.65, 0]}>
        <cylinderGeometry args={[0.01, 0.01, 0.75, 6]} />
        <meshStandardMaterial color="#33485E" metalness={0.9} roughness={0.1} />
      </mesh>

      {/* ── Beacon Signal Globe ────────────────────────────────────── */}
      <mesh ref={signalMeshRef} position={[0.6, 3.32, 0]}>
        <sphereGeometry args={[0.13, 16, 16]} />
        <meshStandardMaterial
          color="#005566"
          emissive="#003344"
          emissiveIntensity={0.5}
          roughness={0.1}
        />
      </mesh>
      <pointLight
        ref={signalLightRef}
        position={[0.6, 3.32, 0]}
        color="#005566"
        intensity={0.35}
        distance={12}
        decay={2}
      />

      {/* ── Navigation Lights ─────────────────────────────────────── */}
      <mesh position={[1.7, 0.52, -0.65]}>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshStandardMaterial color="#FF2200" emissive="#FF1100" emissiveIntensity={2.0} />
      </mesh>
      <mesh position={[1.7, 0.52, 0.65]}>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshStandardMaterial color="#00FF44" emissive="#00CC33" emissiveIntensity={2.0} />
      </mesh>
    </group>
  );
}

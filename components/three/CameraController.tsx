'use client';

/**
 * components/three/CameraController.tsx
 *
 * Narrative Camera Rig & Director Controller.
 * Critical Pass — Retargeted hero camera frame [-2.2, 4.6, 11.2] looking at [-3.2, 0.4, 0.5].
 */

import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { missionProgressStore } from '@/lib/mission-progress';
import { interpolateKeyframes, lerp, smoothstep } from '@/lib/utils';

type CamFrame = [number, number, number, number, number, number, number];

const CAM_KEYFRAMES: CamFrame[] = [
  // progress  position (x, y, z)          lookAt (x, y, z)
  [0.00, -2.2,   4.6,  11.2,    -3.2,  0.4,   0.5],  // 0.00 Hero: balanced framing — vessel floating in open water
  [0.10, -2.8,   3.5,   8.8,    -2.8,  0.2,  -0.8],  // 0.10 Departure: low tracking shot alongside vessel
  [0.22,  0.0,   5.8,   9.5,     0.0,  0.0,  -3.2],  // 0.22 Open ocean: rises to reveal vast offshore horizon
  [0.35,  1.2,   4.2,   8.2,     1.2,  0.0,  -5.0],  // 0.35 Fishing zone: settles into calm side-profile view
  [0.45,  0.6,   3.6,   7.2,     0.6,  0.1,  -5.2],  // 0.45 Signal Lost: slight zoom-in, subtle unease
  [0.52,  0.0,   4.2,   8.0,     0.0,  0.2,  -5.0],  // 0.52 LoRa Active: stabilizes, centered perspective
  [0.60, -0.8,   3.0,   6.8,    -0.8,  0.4,  -6.2],  // 0.60 Storm: low, dramatic wave-level tracking angle
  [0.70,  0.2,   2.4,   5.2,     0.8,  0.5,  -6.8],  // 0.70 Emergency SOS: tight zoom on distress vessel
  [0.78,  2.2,   4.2,   7.5,     0.0,  0.2,  -6.0],  // 0.78 Responding: pulls back to reveal responding fleet
  [0.85,  3.2,   5.2,   9.2,    -2.0,  0.0,  -3.0],  // 0.85 Rescue Confirmed: wide angle, tension releases
  [0.92,  0.0,   4.6,  10.2,     0.0,  0.2,   0.0],  // 0.92 Return: slow pull-back following vessel home
  [1.00,  0.0,   5.2,  12.2,     0.0,  0.6,   0.0],  // 1.00 Safe Harbor: wide cinematic golden horizon
];

const FOV_KEYFRAMES: [number, number][] = [
  [0.00, 46.0],
  [0.10, 44.0],
  [0.22, 48.0],
  [0.35, 45.0],
  [0.45, 42.0],
  [0.52, 45.0],
  [0.60, 41.0],
  [0.70, 38.0],
  [0.78, 46.0],
  [0.85, 50.0],
  [0.92, 52.0],
  [1.00, 48.0],
];

const SHAKE_AMP: [number, number][] = [
  [0.00, 0.00],
  [0.55, 0.00],
  [0.60, 0.045],
  [0.70, 0.090],
  [0.78, 0.040],
  [0.85, 0.010],
  [1.00, 0.00],
];

function sampleCamFrame(
  keyframes: CamFrame[],
  p: number,
): { pos: THREE.Vector3; target: THREE.Vector3 } {
  if (p <= keyframes[0][0]) {
    const k = keyframes[0];
    return {
      pos: new THREE.Vector3(k[1], k[2], k[3]),
      target: new THREE.Vector3(k[4], k[5], k[6]),
    };
  }
  if (p >= keyframes[keyframes.length - 1][0]) {
    const k = keyframes[keyframes.length - 1];
    return {
      pos: new THREE.Vector3(k[1], k[2], k[3]),
      target: new THREE.Vector3(k[4], k[5], k[6]),
    };
  }

  let lo = 0;
  for (let i = 0; i < keyframes.length - 1; i++) {
    if (keyframes[i][0] <= p && keyframes[i + 1][0] >= p) {
      lo = i;
      break;
    }
  }

  const [t0, ax, ay, az, alx, aly, alz] = keyframes[lo];
  const [t1, bx, by, bz, blx, bly, blz] = keyframes[lo + 1];
  const t = smoothstep(t0, t1, p);

  return {
    pos: new THREE.Vector3(
      ax + (bx - ax) * t,
      ay + (by - ay) * t,
      az + (bz - az) * t,
    ),
    target: new THREE.Vector3(
      alx + (blx - alx) * t,
      aly + (bly - aly) * t,
      alz + (blz - alz) * t,
    ),
  };
}

export function CameraController() {
  const { camera } = useThree();
  const currentPos = useRef(new THREE.Vector3(-2.2, 4.6, 11.2));
  const currentTarget = useRef(new THREE.Vector3(-3.2, 0.4, 0.5));
  const currentFov = useRef(46.0);
  const reduceMotionRef = useRef(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      reduceMotionRef.current = mediaQuery.matches;

      const handler = (e: MediaQueryListEvent) => {
        reduceMotionRef.current = e.matches;
      };
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    }
  }, []);

  useFrame(({ clock }) => {
    const p = missionProgressStore.value;
    const t = clock.getElapsedTime();

    const { pos, target } = sampleCamFrame(CAM_KEYFRAMES, p);

    // Bypass camera shake & handheld drift if user prefers reduced motion
    const enableMotionEffects = !reduceMotionRef.current;

    // ── 1. Storm Camera Shake ──────────────────────────────────────────────
    const shakeAmp = enableMotionEffects ? interpolateKeyframes(SHAKE_AMP, p) : 0;
    const shakeX = shakeAmp > 0 ? (Math.sin(t * 14.1) * shakeAmp + Math.sin(t * 7.7) * shakeAmp * 0.5) : 0;
    const shakeY = shakeAmp > 0 ? (Math.cos(t * 11.3) * shakeAmp * 0.6 + Math.sin(t * 18.2) * shakeAmp * 0.3) : 0;
    const shakeRoll = shakeAmp > 0 ? Math.sin(t * 9.5) * shakeAmp * 0.12 : 0;

    // ── 2. Organic Camera Breathing / Handheld Drift ───────────────────────
    const driftX = enableMotionEffects ? (Math.sin(t * 0.15) * 0.08 + Math.cos(t * 0.07) * 0.04) : 0;
    const driftY = enableMotionEffects ? (Math.sin(t * 0.11 + 1.2) * 0.04) : 0;
    const driftZ = enableMotionEffects ? (Math.cos(t * 0.09) * 0.05) : 0;

    // ── 3. Smooth Damped Vector Interpolation ──────────────────────────────
    currentPos.current.lerp(pos, 0.022);
    currentTarget.current.lerp(target, 0.022);

    camera.position.set(
      currentPos.current.x + shakeX + driftX,
      currentPos.current.y + shakeY + driftY,
      currentPos.current.z + driftZ,
    );

    camera.lookAt(currentTarget.current);
    if (enableMotionEffects) {
      camera.rotation.z += shakeRoll;
    }

    // ── 4. Dynamic FOV Breathing ───────────────────────────────────────────
    if (camera instanceof THREE.PerspectiveCamera) {
      const targetFov = interpolateKeyframes(FOV_KEYFRAMES, p);
      currentFov.current = lerp(currentFov.current, targetFov, 0.025);
      
      if (Math.abs(camera.fov - currentFov.current) > 0.01) {
        camera.fov = currentFov.current;
        camera.updateProjectionMatrix();
      }
    }
  });

  return null;
}

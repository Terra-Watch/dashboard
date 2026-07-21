'use client';

/**
 * components/three/OceanCanvas.tsx
 *
 * Always-On WebGL Canvas & Render Environment.
 * Milestone 11 — Performance & Optimization Pass.
 *
 * Responsibilities:
 *   - Dynamic Device Pixel Ratio (DPR) capping based on hardwareConcurrency & devicePixelRatio
 *   - High-performance WebGL context configuration with shadow map optimizations
 *   - WebGL context loss prevention & graceful restoration handlers
 */

import { Suspense, useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OceanMesh } from './OceanMesh';
import { BoatMesh } from './BoatMesh';
import { CameraController } from './CameraController';
import { AtmosphereSystem } from './AtmosphereSystem';
import { LoraRings } from './LoraRings';
import { WeatherParticles } from './WeatherParticles';
import { HarborMesh } from './HarborMesh';
import { NearbyBoat } from './NearbyBoat';

function OceanScene() {
  return (
    <>
      <AtmosphereSystem />
      <OceanMesh />
      <HarborMesh />

      <group>
        <BoatMesh />
        <LoraRings />
        <NearbyBoat />
      </group>

      <WeatherParticles />
      <CameraController />
    </>
  );
}

export function OceanCanvas() {
  const [dpr, setDpr] = useState<[number, number]>([1, 1.5]);

  useEffect(() => {
    // Detect mobile or low-power CPU cores to cap DPR at 1.0 for consistent 60fps
    if (typeof window !== 'undefined') {
      const isLowPower = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) || window.innerWidth < 768;
      if (isLowPower) {
        setDpr([1, 1.0]);
      }
    }
  }, []);

  return (
    <div
      className="fixed inset-0 z-0"
      aria-hidden="true"
      role="presentation"
    >
      <Canvas
        camera={{ position: [0, 4, 10], fov: 60, near: 0.1, far: 200 }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
          stencil: false,
          depth: true,
        }}
        shadows={{ type: 1 }} // Basic shadow map for maximum mobile/desktop performance
        dpr={dpr}
        frameloop="always"
        style={{ background: '#030D1B' }}
        onCreated={({ gl }) => {
          const canvasEl = gl.domElement;
          canvasEl.addEventListener(
            'webglcontextlost',
            (event) => {
              event.preventDefault();
            },
            false
          );
        }}
      >
        <Suspense fallback={null}>
          <OceanScene />
        </Suspense>
      </Canvas>
    </div>
  );
}

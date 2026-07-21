/**
 * shaders/ocean.ts
 *
 * Production-quality GLSL shaders for the Jalri ocean surface.
 * Milestone 1 — Environment Foundation.
 *
 * Architecture decision: shaders are TypeScript string constants, not .glsl
 * files. This avoids a webpack raw-loader / Turbopack rule requirement while
 * keeping the GLSL readable and syntax-highlighted via the /* glsl * / comment
 * tag (understood by VS Code GLSL Literal extension).
 *
 * VERTEX SHADER responsibilities:
 *   1. Displace the flat plane geometry vertically using 5 superimposed sine
 *      waves — each with its own frequency, amplitude, direction, and phase.
 *   2. Compute the analytical surface normal from the sum of each wave's
 *      partial derivatives. This is the key upgrade over the MVP: the ocean
 *      now has a real surface normal every frame without any texture lookup.
 *   3. Pass world-space normal and position to the fragment shader for
 *      view-dependent lighting (Fresnel requires the camera position).
 *
 * FRAGMENT SHADER responsibilities:
 *   1. Blinn-Phong specular highlight — tight sun glint on wave peaks.
 *   2. Schlick Fresnel — grazing angles reflect the sky, normal-incidence
 *      shows depth. This is what makes water look like water.
 *   3. Micro-ripple detail — two layers of high-frequency sine patterns
 *      animate across the surface, simulating what a scrolling normal map
 *      texture would add. No texture required.
 *   4. Foam at crests — smooth-stepped to only appear at true peaks.
 *   5. Fake subsurface scatter — warm light bleeds through thin wave tips.
 *
 * IMPORTANT: `cameraPosition` is a Three.js built-in ShaderMaterial uniform.
 * It is automatically injected into both vertex and fragment shader programs.
 * Do NOT declare it as a custom uniform.
 */

// ─── Vertex Shader ─────────────────────────────────────────────────────────────

export const OCEAN_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uAmplitude;
  uniform float uFrequency;

  varying float vElevation;
  varying vec2  vUv;
  varying vec3  vWorldNormal;
  varying vec3  vWorldPosition;

  // -------------------------------------------------------------------
  // Wave primitive.
  // Returns a vec4 encoding:
  //   .x = height contribution  (A * sin(phi))
  //   .y = dHeight/dx            (A * fx * cos(phi))
  //   .z = dHeight/dz            (A * fz * cos(phi))
  //   .w = unused (padding)
  //
  // Why analytical derivatives?
  //   The normal to a displaced surface y = H(x,z) is:
  //       N = normalize( -dH/dx, 1, -dH/dz )
  //   Computing this analytically (from cos) is exact, cheap, and
  //   eliminates the need for a normal-map texture in the base pass.
  // -------------------------------------------------------------------
  vec4 computeWave(
    vec2  xz,
    float A,     // amplitude
    float fx,    // spatial frequency X
    float fz,    // spatial frequency Z
    float speed, // temporal frequency
    float offset // phase offset (radians)
  ) {
    float phi  = xz.x * fx + xz.y * fz + uTime * speed + offset;
    float s    = sin(phi);
    float c    = cos(phi);
    return vec4(A * s,  A * fx * c,  A * fz * c,  0.0);
  }

  void main() {
    vUv = uv;

    float A = uAmplitude;
    float F = uFrequency;
    vec2  xz = vec2(position.x, position.z);

    float h  = 0.0;   // total elevation
    float gx = 0.0;   // dH/dx (sum of wave gradients)
    float gz = 0.0;   // dH/dz

    // ── 5 Wave layers ──────────────────────────────────────────────
    // Each layer has a distinct direction, scale, and speed so they
    // create natural-looking interference rather than a repeating grid.

    // Layer 1 — primary long swell (dominant NW-ish direction)
    vec4 w0 = computeWave(xz, A * 1.00, F * 0.80, F * 0.60, 0.60, 0.000);
    // Layer 2 — secondary swell (broader, slightly NE)
    vec4 w1 = computeWave(xz, A * 0.52, F * 0.50, F * 1.20, 0.75, 1.571);
    // Layer 3 — mid-period chop
    vec4 w2 = computeWave(xz, A * 0.32, F * 2.10, F * 1.50, 1.10, 3.142);
    // Layer 4 — short chop running roughly perpendicular to swell
    vec4 w3 = computeWave(xz, A * 0.20, F * 1.80, F * 2.40, 1.30, 0.785);
    // Layer 5 — fine cross-swell (adds irregular texture)
    vec4 w4 = computeWave(xz, A * 0.12, F * 3.20, F * 1.20, 0.90, 2.356);

    h  = w0.x + w1.x + w2.x + w3.x + w4.x;
    gx = w0.y + w1.y + w2.y + w3.y + w4.y;
    gz = w0.z + w1.z + w2.z + w3.z + w4.z;

    // ── Displaced world position ────────────────────────────────────
    vec3 displaced = vec3(position.x, h, position.z);

    // ── Analytical surface normal ───────────────────────────────────
    // For surface y = H(x,z):
    //   tangent_X = (1, gx, 0),  tangent_Z = (0, gz, 1)
    //   normal    = cross(tangent_Z, tangent_X) = (-gx, 1, -gz)
    // Normalize gives the outward-pointing surface normal.
    vWorldNormal = normalize(vec3(-gx, 1.0, -gz));

    // Normalised elevation drives color blending in fragment shader.
    // Clamped to [-1, 1]; 0 = mean water level.
    vElevation = clamp(h / max(A * 2.2, 0.001), -1.0, 1.0);

    // World-space position needed for view-direction calculation (Fresnel).
    vWorldPosition = (modelMatrix * vec4(displaced, 1.0)).xyz;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

// ─── Fragment Shader ───────────────────────────────────────────────────────────

export const OCEAN_FRAGMENT = /* glsl */ `
  precision highp float;

  // ── Uniforms set by OceanMesh.tsx ──────────────────────────────────
  uniform vec3  uDeepColor;      // darkest deep-water colour
  uniform vec3  uSurfaceColor;   // mid-water / sub-surface scatter colour
  uniform vec3  uFoamColor;      // near-white foam at wave crests
  uniform vec3  uSunColor;       // directional sun colour (matches AtmosphereSystem)
  uniform vec3  uSunDirection;   // normalised world-space sun direction
  uniform float uFoamStrength;   // 0 = no foam, 1 = full foam
  uniform float uTime;           // elapsed time (seconds)

  // NOTE: cameraPosition is a Three.js built-in — do NOT re-declare it.

  varying float vElevation;
  varying vec2  vUv;
  varying vec3  vWorldNormal;
  varying vec3  vWorldPosition;

  void main() {
    // ── Vectors ──────────────────────────────────────────────────────
    vec3 N = normalize(vWorldNormal);                       // macro surface normal
    vec3 V = normalize(cameraPosition - vWorldPosition);   // view direction (to camera)
    vec3 L = normalize(uSunDirection);                     // light direction (to sun)
    vec3 H = normalize(L + V);                             // half-vector for Blinn-Phong

    float NdotL = max(dot(N, L), 0.0);
    float NdotV = max(dot(N, V), 0.001);
    float NdotH = max(dot(N, H), 0.0);

    // ── Micro-ripple detail ──────────────────────────────────────────
    // Two layers of tiling sine patterns scroll in different directions
    // and at different scales. The combined result perturbs the specular
    // normal, producing the characteristic shimmer of a real water surface
    // without requiring a normal-map texture.
    vec2 r1uv = vUv * 40.0 + vec2( uTime * 0.07,  uTime * 0.05);
    vec2 r2uv = vUv * 24.0 + vec2(-uTime * 0.04,  uTime * 0.09);
    float micro =
        sin(r1uv.x * 6.2832) * sin(r1uv.y * 6.2832) * 0.020 +
        sin(r2uv.x * 6.2832) * sin(r2uv.y * 6.2832) * 0.011;

    // Build a micro-perturbed normal (only deviates from N by a small angle)
    vec3 N_micro = normalize(N + vec3(micro, 0.0, micro * 0.65));

    // ── Base water colour ────────────────────────────────────────────
    // Blend from deep (dark navy) to surface (mid-blue) based on elevation.
    // The 0.5 factor keeps the surface colour subtle — water absorbs most
    // incident light and the colour remains dark.
    float elevT = clamp(vElevation * 0.5 + 0.5, 0.0, 1.0);
    vec3 waterColor = mix(uDeepColor, uSurfaceColor, elevT * 0.48);

    // ── Diffuse (Lambert) ────────────────────────────────────────────
    // Ambient term (0.30) prevents the under-wave faces from going pure black.
    float ambient = 0.30;
    float diffuse = ambient + NdotL * (1.0 - ambient);
    waterColor *= diffuse;

    // ── Foam ────────────────────────────────────────────────────────
    // Only appears at genuine crests (vElevation > 0.55 normalised).
    float foam = smoothstep(0.55, 0.92, vElevation) * uFoamStrength;
    waterColor  = mix(waterColor, uFoamColor, foam);

    // ── Schlick Fresnel ──────────────────────────────────────────────
    // F0 ≈ 0.02 for calm water (IOR ≈ 1.33).
    // At grazing angles the ocean surface becomes a near-perfect mirror.
    // At normal incidence it is nearly transparent (shows depth/colour).
    float F0      = 0.02;
    float fresnel = F0 + (1.0 - F0) * pow(1.0 - NdotV, 5.0);

    // Sky reflection colour: a desaturated blend of sun colour + deep blue.
    vec3 skyReflect = mix(uDeepColor * 1.8, uSunColor * 0.4, 0.5);
    waterColor = mix(waterColor, skyReflect, clamp(fresnel * 0.75, 0.0, 0.55));

    // ── Blinn-Phong specular (macro normal) ──────────────────────────
    // Very tight exponent (256) gives a small, intense sun disc on the water.
    float spec_macro = pow(NdotH, 256.0) * NdotL;
    waterColor += uSunColor * spec_macro * 0.65;

    // ── Fine specular shimmer (micro-perturbed normal) ───────────────
    // Broader, softer shimmer across wave faces — the "sparkle" effect.
    float NdotH_m  = max(dot(N_micro, H), 0.0);
    float spec_micro = pow(NdotH_m, 72.0) * NdotL;
    waterColor += uSunColor * spec_micro * 0.22;

    // ── Fake subsurface scatter ──────────────────────────────────────
    // Wave crests are physically thinner — light transmits through them
    // giving a warm glow. We fake this by adding uSurfaceColor at peaks.
    float scatter = smoothstep(0.35, 1.0, vElevation) * NdotL * 0.14;
    waterColor += uSurfaceColor * scatter;

    gl_FragColor = vec4(waterColor, 1.0);
  }
`;

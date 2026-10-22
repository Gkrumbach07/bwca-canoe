import * as THREE from 'three';

// The look's light model (docs/look.md, rule 2), one chunk every lit material composes: terrain, ground
// cover, trees, rocks, props, the canoe. Smooth Lambert from one warm key (the sun, with its cascaded
// shadows, see sunlight.js) plus the hemisphere fill as the sky probe. No ramps, no rims, no steps.
//
// How a material composes it. Start from a MeshLambertMaterial (the chunk replaces three's
// lights_lambert_pars_fragment, so only Lambert materials take it) and call applyLook first in
// onBeforeCompile, then make your own patches; give the material a cache key that names its variant:
//
//   const m = new THREE.MeshLambertMaterial({ vertexColors: true });
//   m.onBeforeCompile = (shader) => {
//     applyLook(shader, { wrap: 0 });            // the light, the fog hook, the noise functions
//     shader.fragmentShader = shader.fragmentShader.replace(...);  // the material's own colour
//   };
//   m.customProgramCacheKey = () => 'look-mything';
//
// or let makeLookMaterial(params, { wrap, name, compile }) do exactly that.
//
// What a material gets:
//   wrap      how far the key wraps past the terminator: 0 is Lambert (ground, rock, bark, props);
//             0.667 gives dotNL * 0.6 + 0.4 (foliage, which scatters light through itself); 'varying'
//             reads it per vertex from `attribute float aWrap` (vegetation: leaves wrap, bark does not).
//   lookSky   a fragment-scope float (default 1) the material may lower before the lights run to say how
//             much of the sky this point sees (a canopy overhead, say): it scales the hemisphere fill only.
//   lookHash / lookNoise / lookFbm   world-space value noise in both stages (see glslNoise below): integer
//             lattice hashes, so they are exact at any world coordinate and never seam.
//   the fog hook   lookFog.pars is declared after <fog_pars_fragment> and lookFog.fragment runs where
//             <fog_fragment> was. Today that is fog.js's aerial haze, unchanged. Pass 4 fills the hook
//             (fog as a colour ramp by distance, a second ramp toward the sun) by setting these two
//             strings before the materials compile; every material that composes the look follows.
//
// Occlusion is not in the chunk: it is baked per vertex into the colour (occlusion.js) and, on screen,
// by the AO pass in post.js. Shadows are three's sun shadows, softened and made stable in sunlight.js.

export const lookFog = {
  pars: '',
  fragment: '#include <fog_fragment>',
};

// World-space noise. Value noise on an integer lattice with a quintic fade; each fbm octave is turned and
// shifted so the lattice never lines up. Seeds are uints. Inputs are world metres divided by a scale.
export const glslNoise = /* glsl */ `
float lookHash(ivec2 c, uint seed) {
  uvec2 q = uvec2(c + 1048576) * uvec2(1597334677u, 3812015801u) + uvec2(seed * 747796405u, seed * 2891336453u);
  uint n = (q.x ^ (q.y >> 3u)) * 1597334677u;
  n ^= n >> 15u;
  n *= 2246822519u;
  return float(n >> 8u) * (1.0 / 16777216.0);
}
float lookNoise(vec2 p, uint seed) {
  vec2 i = floor(p), f = p - i;
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  ivec2 c = ivec2(i);
  float a = lookHash(c, seed), b = lookHash(c + ivec2(1, 0), seed);
  float d = lookHash(c + ivec2(0, 1), seed), e = lookHash(c + ivec2(1, 1), seed);
  return mix(mix(a, b, u.x), mix(d, e, u.x), u.y);
}
// octaves 1..4, each half the size and half the weight of the last; result in [0, 1], mean 0.5
float lookFbm(vec2 p, uint seed, int octaves) {
  const mat2 turn = mat2(0.8, 0.6, -0.6, 0.8);
  float v = 0.0, amp = 0.5, norm = 0.0;
  for (int i = 0; i < 4; i++) {
    if (i >= octaves) break;
    v += amp * lookNoise(p, seed + uint(i) * 101u);
    norm += amp;
    amp *= 0.5;
    p = turn * p * 2.03 + vec2(17.3, -9.1);
  }
  return v / norm;
}
// how much of a detail scale metres across survives at px metres per pixel (1 near, 0 once it would alias)
float lookFade(float scale, float px) { return 1.0 - smoothstep(0.2 * scale, 0.6 * scale, px); }
`;

// The light: three's Lambert pair with the direct term wrapped and the indirect (the hemisphere, the sky
// probe) scaled by lookSky. `wrapExpr` is GLSL: a constant or the per-vertex varying.
function lightChunk(wrapExpr, varyingWrap) {
  return /* glsl */ `
varying vec3 vViewPosition;
${varyingWrap ? 'varying float vLookWrap;' : ''}
float lookSky = 1.0;
struct LambertMaterial {
  vec3 diffuseColor;
  float specularStrength;
};
void RE_Direct_Look( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
  float w = ${wrapExpr};
  float k = saturate( ( dot( geometryNormal, directLight.direction ) + w ) / ( 1.0 + w ) );
  reflectedLight.directDiffuse += k * directLight.color * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Look( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
  reflectedLight.indirectDiffuse += irradiance * lookSky * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct RE_Direct_Look
#define RE_IndirectDiffuse RE_IndirectDiffuse_Look
`;
}

const warned = new Set();
function swap(src, from, to, what) {
  if (!src.includes(from)) { if (!warned.has(what)) { warned.add(what); console.warn(`shading: ${what} not found, the look is not applied there`); } return src; }
  return src.replace(from, to);
}

// Patches a Lambert shader with the look. Call it first in onBeforeCompile.
export function applyLook(shader, { wrap = 0 } = {}) {
  const varying = wrap === 'varying';
  const wrapExpr = varying ? 'vLookWrap' : Number(wrap).toFixed(4);
  let vs = shader.vertexShader, fs = shader.fragmentShader;
  vs = swap(vs, '#include <common>', '#include <common>\n' + glslNoise, 'vertex <common>');
  fs = swap(fs, '#include <common>', '#include <common>\n' + glslNoise, 'fragment <common>');
  fs = swap(fs, '#include <lights_lambert_pars_fragment>', lightChunk(wrapExpr, varying), 'lights_lambert_pars_fragment');
  fs = swap(fs, '#include <fog_pars_fragment>', '#include <fog_pars_fragment>\n' + lookFog.pars, 'fog_pars_fragment');
  fs = swap(fs, '#include <fog_fragment>', lookFog.fragment, 'fog_fragment');
  if (varying) {
    vs = swap(vs, '#include <color_pars_vertex>', '#include <color_pars_vertex>\nattribute float aWrap;\nvarying float vLookWrap;', 'color_pars_vertex');
    vs = swap(vs, '#include <color_vertex>', '#include <color_vertex>\n\tvLookWrap = aWrap;', 'color_vertex');
  }
  shader.vertexShader = vs; shader.fragmentShader = fs;
  return shader;
}

// A Lambert material that composes the look. `compile(shader, renderer)` runs after applyLook for the
// material's own patches; `name` keys the program cache (one program per distinct name and wrap).
export function makeLookMaterial(params = {}, { wrap = 0, name = 'look', compile = null } = {}) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, ...params });
  m.onBeforeCompile = (shader, renderer) => {
    applyLook(shader, { wrap });
    if (compile) compile(shader, renderer);
  };
  m.customProgramCacheKey = () => `${name}|${wrap}`;
  m.userData.look = { wrap, name };
  return m;
}

// The foliage wrap the per-vertex tag carries (rocks.js smoothToon writes aWrap = FOLIAGE_WRAP on leaves).
export const FOLIAGE_WRAP = 0.667;

import * as THREE from 'three';
import { glslSurface } from './water.js';
import { CLASS_SPLAT } from './terrain-build.js';
import { groundUniforms, glslGround } from './terrain.js';
import { applyLook } from './shading.js';

// Grass tufts and fireweed on a camera-following patch. Each tuft belongs to a world cell (so it stays put
// as the patch slides) but sits at a hashed offset inside it, so no lattice shows; presence, size and
// colour come from the cell hash, a clump field and the per-cell cover map baked into the water atlas
// (none in water, on bare rock, trails or campsites; a sparse few under the forest; thick on the meadows,
// in the burns and along the shore). The tufts gather in clumps a few metres across with open ground
// between, so the floor is seen. The material is the look's smooth Lambert (shading.js) with an upward
// normal, so a tuft takes the same sun, sky and shadows as the ground it stands on and darkens with it at
// dusk; its colour is the ground's own at the root (the terrain's splat, glslGround, evaluated under the
// tuft from the class map), lighter and warmer toward the tip, never darker than the ground under it.

const SIZE = 128, SPACING = 0.87;   // one tuft slot per 0.76 m²: a third of the old half-metre lattice
const N = CLASS_SPLAT.length;

const decl = /* glsl */ `
  uniform vec2 uCenterLocal;   // patch centre relative to the floating origin, snapped to the lattice
  uniform float uTime, uHalf, uFlower;
  uniform vec3 uGrassTint;
  uniform vec4 uClassA[${N}];
  uniform vec4 uClassB[${N}];
  uniform float uClassSunny[${N}];
  attribute vec2 aOffset;
  ${glslSurface}
  ${glslGround}
  // The terrain's splat under a point, rebuilt from the cover atlas: the four cells around it, each class
  // turned into material weights (terrain-build.js CLASS_SPLAT), the moss weight and the canopy shade from
  // the atlas's fourth byte (tile-worker.js packFloor), blended bilinearly as the terrain's vertices are.
  void classSplat(vec2 rel, out vec4 wA, out vec4 wB, out vec4 fl) {
    vec2 f = (rel - uAtlas.xy) * uAtlas.z - 0.5;
    vec2 fi = floor(f), a = f - fi;
    ivec2 c = ivec2(fi), mx = ivec2(int(uAtlas.w) - 1);
    wA = vec4(0.0); wB = vec4(0.0); fl = vec4(0.0);
    for (int k = 0; k < 4; k++) {
      ivec2 o = ivec2(k & 1, k >> 1);
      vec4 t = texelFetch(uCoverTex, clamp(c + o, ivec2(0), mx), 0);
      float g = (o.x == 1 ? a.x : 1.0 - a.x) * (o.y == 1 ? a.y : 1.0 - a.y);
      int cls = clamp(int(t.b * 255.0 + 0.5), 0, ${N - 1});
      float packed = floor(t.a * 255.0 + 0.5), sunny = uClassSunny[cls];
      float moss = floor(packed / 16.0) / 15.0 * (1.0 - 0.6 * sunny), shade = mod(packed, 16.0) / 15.0;
      vec4 ca = uClassA[cls];
      wA += g * vec4(ca.x * (1.0 - moss), ca.y + ca.x * moss, ca.z, ca.w);
      wB += g * uClassB[cls];
      fl += g * vec4(shade * (1.0 - 0.8 * sunny), sunny, 0.0, 0.0);
    }
  }
  vec3 hash3(vec2 p) { vec3 q = vec3(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)), dot(p, vec2(419.2, 371.9))); return fract(sin(q) * 43758.5453); }
  // smooth value noise for the clumps: the lattice spacing in metres is set by the caller
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash3(i).x, hash3(i + vec2(1.0, 0.0)).x, f.x), mix(hash3(i + vec2(0.0, 1.0)).x, hash3(i + vec2(1.0, 1.0)).x, f.x), f.y);
  }
`;
const body = /* glsl */ `
  vec2 rel = uCenterLocal + aOffset;
  vec2 cell = floor((rel + uOrigin) / ${SPACING.toFixed(2)});   // the world cell: stable identity as the patch slides
  vec3 h = hash3(mod(cell, 4096.0));
  vec3 h2 = hash3(mod(cell + 17.0, 4096.0));
  vec3 h3 = hash3(mod(cell + 53.0, 4096.0));
  rel += (h3.xy - 0.5) * ${SPACING.toFixed(2)} * 0.95;             // off the lattice
  vec2 cv = coverAt(rel); // cover, golden
  float edge = 1.0 - smoothstep(0.7, 1.0, max(abs(aOffset.x), abs(aOffset.y)) / uHalf);
  // clumps: a 3 m noise gates the cover, full at a clump's heart and empty between (the gain keeps the mean)
  float clump = vnoise(mod(rel + uOrigin, 4096.0) / 3.2);
  float heart = smoothstep(0.3, 0.7, clump);
  float present = step(h.x, cv.r * heart * 2.0) * edge;
  float sc = present * (0.6 + 0.8 * h.y * h.y + 0.25 * heart);
  float yaw = h.z * 6.2832;
  vec3 p = position * sc;
  p.xz = mat2(cos(yaw), -sin(yaw), sin(yaw), cos(yaw)) * p.xz;
  p.x += sin(uTime * 1.6 + rel.x * 0.35 + rel.y * 0.25) * 0.08 * position.y;
  vec3 transformed = vec3(rel.x + p.x, surfaceAt(rel) - 0.05 + p.y, rel.y + p.z);
  // colour: the ground's own at the root (the blade's vertex colour lifts it toward a lit tip), a touch
  // greener per tuft, the season's tint; golden in burns and dry clearings; fireweed stalks in high summer
  vec4 gA, gB, gF;
  classSplat(rel, gA, gB, gF);
  vec3 ground = groundColor(rel + uOrigin, gA, gB, gF, length(rel + uOrigin - cameraPosition.xz) * 0.0015);
  vec3 tint = mix(vec3(1.0, 1.02, 0.94), vec3(1.08, 1.12, 0.92), h2.x) * uGrassTint;
  vec3 base = ground * tint;
  base = mix(base, base * vec3(1.3, 1.08, 0.55), cv.g * (0.6 + 0.4 * h2.y));
  float flower = step(0.94, h.x) * cv.g * step(0.75, position.y) * uFlower;
  vColor.rgb *= mix(base, vec3(0.95, 0.35, 0.6), flower);
`;

// A blade is lit as the ground under it from either side: three flips the normal on a back face of a
// double-sided material, which left every blade seen from behind lit only from below (near black), so the
// flip is taken out of the normal chunk. The light is the terrain's own (shading.js, no wrap), so a tuft's
// root is exactly the ground's tone under the same sun and sky.
const noFlip = THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '');
if (noFlip === THREE.ShaderChunk.normal_fragment_begin) console.warn('groundcover: normal chunk changed, blades seen from behind will go dark');

function tuftGeometry() {
  // three broad blades fanned at 60 degrees, each a bent strip that narrows to a blunt tip and leans out;
  // the vertex colour runs from the ground's own tone at the root to a warm, lit tip
  const pos = [], col = [], nrm = [];
  const blades = 3, hgt = 0.5, half = 0.12, root = -0.15; // the root sits below ground so slopes never show a gap
  const leans = [0.16, -0.11, 0.2];
  const push = (x, y, z, c) => { pos.push(x, y, z); col.push(c[0], c[1], c[2]); nrm.push(0, 1, 0); }; // lit like the ground under it
  const cRoot = [1.0, 1.0, 1.0], cMid = [1.12, 1.1, 1.02], cTip = [1.38, 1.3, 1.0];
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI;
    const dx = Math.cos(a) * half, dz = Math.sin(a) * half;
    const lx = -Math.sin(a) * leans[i], lz = Math.cos(a) * leans[i];
    const midH = hgt * 0.5, tipH = hgt * (0.8 + 0.2 * (i % 2));
    const bl = [-dx, root, -dz], br = [dx, root, dz];
    const ml = [-dx * 0.75 + lx * 0.35, midH, -dz * 0.75 + lz * 0.35], mr = [dx * 0.75 + lx * 0.35, midH, dz * 0.75 + lz * 0.35];
    const tip = [lx, tipH, lz];
    push(...bl, cRoot); push(...br, cRoot); push(...mr, cMid);
    push(...bl, cRoot); push(...mr, cMid); push(...ml, cMid);
    push(...ml, cMid); push(...mr, cMid); push(...tip, cTip);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

export class GroundCover {
  constructor(water) {
    this.water = water;
    const n = Math.round(SIZE / SPACING);
    const offsets = new Float32Array(n * n * 2);
    let o = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { offsets[o++] = (i - n / 2) * SPACING; offsets[o++] = (j - n / 2) * SPACING; }
    const base = tuftGeometry();
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('normal', base.getAttribute('normal'));
    geo.setAttribute('color', base.getAttribute('color'));
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 2));
    geo.instanceCount = n * n;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.u = {
      ...water.surfaceUniforms(),
      uCenterLocal: { value: new THREE.Vector2() }, uTime: { value: 0 }, uHalf: { value: SIZE / 2 },
      uFlower: { value: 1 }, uGrassTint: { value: new THREE.Vector3(1, 1, 1) },
      ...groundUniforms,
      uClassA: { value: CLASS_SPLAT.map((c) => new THREE.Vector4(c.w[0], c.w[1], c.w[2], c.w[3])) },
      uClassB: { value: CLASS_SPLAT.map((c) => new THREE.Vector4(c.w[4], c.w[5], c.w[6], c.w[7])) },
      uClassSunny: { value: CLASS_SPLAT.map((c) => c.sunny) },
    };
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.material.onBeforeCompile = (shader) => {
      applyLook(shader, { wrap: 0 });
      Object.assign(shader.uniforms, this.u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <color_pars_vertex>', '#include <color_pars_vertex>\n' + decl)
        .replace('#include <begin_vertex>', body);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <normal_fragment_begin>', noFlip);
    };
    this.material.customProgramCacheKey = () => 'look-grass';
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
  }
  setSeason(s) {
    this.u.uGrassTint.value.set(s.grassTint[0], s.grassTint[1], s.grassTint[2]);
    this.u.uFlower.value = s.flower;
  }
  update(dt, x, z) {
    const o = this.water.origin, u = this.u;
    u.uTime.value += dt;
    u.uCenterLocal.value.set(Math.round(x / SPACING) * SPACING - o.x, Math.round(z / SPACING) * SPACING - o.z);
    this.mesh.position.set(o.x, 0, o.z);
  }
}

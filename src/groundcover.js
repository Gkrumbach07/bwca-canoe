import * as THREE from 'three';
import { glslSurface } from './water.js';
import { GROUND_PALETTE } from './terrain-build.js';

// Grass tufts and fireweed on a camera-following patch. Each tuft belongs to a world cell (so it stays put
// as the patch slides) but sits at a hashed offset inside it, so no lattice shows; presence, size and
// colour come from the cell hash and the per-cell cover map baked into the water atlas (none in water,
// on bare rock, trails or campsites; thin under dense canopy; thick in clearings and burns).
// The tufts are a Lambert material with an upward normal, so they take the same sun, sky and shadows as the
// ground they stand on and darken with it at dusk; the colour is the ground's own, a little lighter.

const SIZE = 128, SPACING = 0.5;
const N = GROUND_PALETTE.length;

const decl = /* glsl */ `
  uniform vec2 uCenterLocal;   // patch centre relative to the floating origin, snapped to the lattice
  uniform float uTime, uHalf, uFlower;
  uniform vec3 uGrassTint;
  uniform vec3 uGroundPalette[${N}];
  attribute vec2 aOffset;
  ${glslSurface}
  vec3 hash3(vec2 p) { vec3 q = vec3(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)), dot(p, vec2(419.2, 371.9))); return fract(sin(q) * 43758.5453); }
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
  float present = step(h.x, cv.r) * edge;
  float sc = present * (0.55 + 1.0 * h.y * h.y);
  float yaw = h.z * 6.2832;
  vec3 p = position * sc;
  p.xz = mat2(cos(yaw), -sin(yaw), sin(yaw), cos(yaw)) * p.xz;
  p.x += sin(uTime * 1.6 + rel.x * 0.35 + rel.y * 0.25) * 0.08 * position.y;
  vec3 transformed = vec3(rel.x + p.x, surfaceAt(rel) - 0.05 + p.y, rel.y + p.z);
  // colour: the ground's own colour, a little lighter and warmer toward the tips, with a spread per
  // tuft and the season's tint; golden in burns and dry clearings; a few fireweed stalks in high summer
  vec3 ground = uGroundPalette[clamp(groundClassAt(rel), 0, ${N - 1})];
  vec3 tint = mix(vec3(1.0, 1.08, 0.86), vec3(1.3, 1.22, 0.9), h2.x) * uGrassTint;
  vec3 base = ground * tint;
  base = mix(base, base * vec3(1.3, 1.08, 0.55), cv.g * (0.6 + 0.4 * h2.y));
  float flower = step(0.94, h.x) * cv.g * step(0.75, position.y) * uFlower;
  vColor.rgb *= mix(base, vec3(0.95, 0.35, 0.6), flower);
`;

function tuftGeometry() {
  // four blades fanned at 45 degrees, leaning outward a little; brightness darkens toward the base
  const pos = [], col = [], nrm = [];
  const blades = 4, hgt = 0.55, half = 0.075, root = -0.18; // the root sits below ground so slopes never show a gap
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI;
    const dx = Math.cos(a) * half, dz = Math.sin(a) * half;
    const lean = i % 2 ? 0.16 : -0.12;
    const tipX = -Math.sin(a) * lean, tipZ = Math.cos(a) * lean;
    pos.push(-dx, root, -dz, dx, root, dz, tipX, hgt * (0.85 + 0.15 * (i % 3)), tipZ);
    col.push(0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 1.15, 1.15, 1.15); // brightness only: the hue is the ground's
    nrm.push(0, 1, 0, 0, 1, 0, 0, 1, 0);                      // lit like the ground under it
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
      uGroundPalette: { value: GROUND_PALETTE.map((c) => new THREE.Vector3(c[0], c[1], c[2])) },
    };
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + decl)
        .replace('#include <begin_vertex>', body);
    };
    this.material.customProgramCacheKey = () => 'grass';
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

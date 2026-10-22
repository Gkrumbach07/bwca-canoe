import * as THREE from 'three';
import { glslSurface } from './water.js';
import { GROUND_PALETTE } from './terrain-build.js';

// Grass tufts and fireweed on a camera-following patch. Each tuft belongs to a world cell (so it stays put
// as the patch slides) but sits at a hashed offset inside it, so no lattice shows; presence, size and
// colour come from the cell hash and the per-cell cover map baked into the water atlas (none in water,
// on bare rock, trails or campsites; thin under dense canopy; thick in clearings and burns).

const SIZE = 128, SPACING = 0.5;

const vert = /* glsl */ `
  uniform vec2 uCenterLocal;   // patch centre relative to the floating origin, snapped to the lattice
  uniform float uTime, uHalf;
  uniform vec3 uGroundPalette[${GROUND_PALETTE.length}];
  attribute vec2 aOffset;
  attribute vec3 color;
  varying vec3 vColor;
  varying float vLight;
  #include <common>
  #include <fog_pars_vertex>
  ${glslSurface}
  vec3 hash3(vec2 p) { vec3 q = vec3(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)), dot(p, vec2(419.2, 371.9))); return fract(sin(q) * 43758.5453); }
  void main() {
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
    float sway = sin(uTime * 1.6 + rel.x * 0.35 + rel.y * 0.25) * 0.08 * position.y;
    p.x += sway;
    vec3 local = vec3(rel.x + p.x, surfaceAt(rel) - 0.05 + p.y, rel.y + p.z);
    // colour: the ground's own colour, a little lighter and warmer toward the tips, with a spread per
    // tuft; golden in burns and dry clearings; a few fireweed stalks
    vec3 ground = uGroundPalette[clamp(groundClassAt(rel), 0, ${GROUND_PALETTE.length - 1})];
    vec3 tint = mix(vec3(1.0, 1.08, 0.86), vec3(1.3, 1.22, 0.9), h2.x);
    vec3 base = ground * color * tint;
    base = mix(base, base * vec3(1.3, 1.08, 0.55), cv.g * (0.6 + 0.4 * h2.y));
    float flower = step(0.94, h.x) * cv.g * step(0.75, position.y);
    vColor = mix(base, vec3(0.95, 0.35, 0.6), flower);
    vLight = 0.45 + 0.55 * position.y;
    vec4 mvPosition = modelViewMatrix * vec4(local, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;
const frag = /* glsl */ `
  uniform vec3 uSky, uGround, uSun;
  varying vec3 vColor;
  varying float vLight;
  #include <fog_pars_fragment>
  void main() {
    vec3 col = vColor * (mix(uGround, uSky, vLight) * 0.7 + uSun * (0.25 + 0.35 * vLight));
    gl_FragColor = vec4(col, 1.0);
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function tuftGeometry() {
  // four blades fanned at 45 degrees, leaning outward a little; colour darkens toward the base
  const pos = [], col = [];
  const blades = 4, hgt = 0.55, half = 0.075, root = -0.18; // the root sits below ground so slopes never show a gap
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI;
    const dx = Math.cos(a) * half, dz = Math.sin(a) * half;
    const lean = i % 2 ? 0.16 : -0.12;
    const tipX = -Math.sin(a) * lean, tipZ = Math.cos(a) * lean;
    pos.push(-dx, root, -dz, dx, root, dz, tipX, hgt * (0.85 + 0.15 * (i % 3)), tipZ);
    col.push(0.7, 0.7, 0.7, 0.7, 0.7, 0.7, 1.15, 1.15, 1.15); // brightness only: the hue is the ground's
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
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
    geo.setAttribute('color', base.getAttribute('color'));
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 2));
    geo.instanceCount = n * n;
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag,
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...water.surfaceUniforms(), uCenterLocal: { value: new THREE.Vector2() }, uTime: { value: 0 }, uHalf: { value: SIZE / 2 }, uGroundPalette: { value: GROUND_PALETTE.map((c) => new THREE.Vector3(c[0], c[1], c[2])) }, uSky: { value: new THREE.Color(0xa9c6e0) }, uGround: { value: new THREE.Color(0x6f7a60) }, uSun: { value: new THREE.Color(0xffe9c4) } },
      side: THREE.DoubleSide, fog: true,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
  }
  update(dt, x, z, hemi, sun) {
    const o = this.water.origin, u = this.material.uniforms;
    u.uTime.value += dt;
    u.uCenterLocal.value.set(Math.round(x / SPACING) * SPACING - o.x, Math.round(z / SPACING) * SPACING - o.z);
    this.mesh.position.set(o.x, 0, o.z);
    if (hemi) { u.uSky.value.copy(hemi.color).multiplyScalar(hemi.intensity); u.uGround.value.copy(hemi.groundColor).multiplyScalar(hemi.intensity); }
    if (sun) u.uSun.value.copy(sun.color).multiplyScalar(sun.intensity * 0.5);
  }
}

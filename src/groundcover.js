import * as THREE from 'three';
import { glslSurface } from './water.js';
import { clearingAt, burnAt } from './fields.js';

// Grass tufts and fireweed on a camera-following patch. Tufts are placed on a world-snapped grid, so
// they stay put as the patch slides; presence, size and colour come from a hash of the world cell and
// a per-cell cover map (none in water or on bare rock, thin under dense canopy, thick in clearings).

const SIZE = 96, SPACING = 0.85;

const vert = /* glsl */ `
  uniform vec2 uCenter;
  uniform float uTime, uHalf;
  uniform sampler2D uCoverTex;
  attribute vec2 aOffset;
  attribute vec3 color;
  varying vec3 vColor;
  varying float vLight;
  #include <common>
  #include <fog_pars_vertex>
  ${glslSurface}
  vec3 hash3(vec2 p) { vec3 q = vec3(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)), dot(p, vec2(419.2, 371.9))); return fract(sin(q) * 43758.5453); }
  void main() {
    vec2 w = uCenter + aOffset;
    vec2 cell = floor(w / ${SPACING.toFixed(2)});
    vec3 h = hash3(mod(cell, 4096.0));
    vec2 cv = texture2D(uCoverTex, (w - uGrid.xy) * uGrid.z / vec2(uGridSize)).rg; // cover, golden
    float edge = 1.0 - smoothstep(0.75, 1.0, max(abs(aOffset.x), abs(aOffset.y)) / uHalf);
    float present = step(h.x, cv.r) * edge;
    float sc = present * (0.45 + 1.0 * h.y * h.y);
    float yaw = h.z * 6.2832;
    vec3 p = position * sc;
    p.xz = mat2(cos(yaw), -sin(yaw), sin(yaw), cos(yaw)) * p.xz;
    float sway = sin(uTime * 1.6 + w.x * 0.35 + w.y * 0.25) * 0.08 * position.y;
    p.x += sway;
    vec3 world = vec3(w.x + p.x, surfaceAt(w) - 0.05 + p.y, w.y + p.z);
    // colour: a spread of greens per tuft, golden in burns and dry clearings; a few fireweed stalks
    vec3 h2 = hash3(mod(cell + 17.0, 4096.0));
    vec3 tint = mix(vec3(0.78, 0.9, 0.62), vec3(1.12, 1.04, 0.72), h2.x);
    vec3 base = color * tint;
    base = mix(base, base * vec3(1.3, 1.08, 0.55), cv.g * (0.6 + 0.4 * h2.y));
    float flower = step(0.94, h.x) * cv.g * step(0.75, position.y);
    vColor = mix(base, vec3(0.95, 0.35, 0.6), flower);
    vLight = 0.45 + 0.55 * position.y;
    vec4 mvPosition = viewMatrix * vec4(world, 1.0);
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
  // three narrow blades crossing at 60 degrees; colour darkens toward the base
  const pos = [], col = [];
  const blades = 3, hgt = 0.5, half = 0.04, root = -0.18; // the root sits below ground so slopes never show a gap
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI;
    const dx = Math.cos(a) * half, dz = Math.sin(a) * half;
    const tipX = -Math.sin(a) * 0.08, tipZ = Math.cos(a) * 0.08;
    pos.push(-dx, root, -dz, dx, root, dz, tipX, hgt, tipZ);
    col.push(0.3, 0.38, 0.18, 0.3, 0.38, 0.18, 0.58, 0.64, 0.3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

export class GroundCover {
  constructor(world, water, shade, exclusions = []) {
    const W = world.width, H = world.height;
    const cover = new Uint8Array(W * H * 2);
    // bare ground along trails and in campsites
    const bare = new Uint8Array(W * H);
    for (const [x1, z1, x2, z2, r] of exclusions) {
      const rr = Math.max(r, 3.5);
      const i0 = Math.max(0, world.cellI(Math.min(x1, x2) - rr)), i1 = Math.min(W - 1, world.cellI(Math.max(x1, x2) + rr));
      const j0 = Math.max(0, world.cellJ(Math.min(z1, z2) - rr)), j1 = Math.min(H - 1, world.cellJ(Math.max(z1, z2) + rr));
      const dx = x2 - x1, dz = z2 - z1, L2 = dx * dx + dz * dz || 1;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const px = world.cellX(i), pz = world.cellZ(j);
        const t = Math.min(1, Math.max(0, ((px - x1) * dx + (pz - z1) * dz) / L2));
        if (Math.hypot(px - (x1 + dx * t), pz - (z1 + dz * t)) < rr) bare[j * W + i] = 1;
      }
    }
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = j * W + i, sd = world.sd[k];
      let c = 0, gold = 0;
      if (sd > 2.6) {
        const x = world.cellX(i), z = world.cellZ(j);
        const slope = world.slopeAt(x, z), burn = burnAt(x, z), clearing = clearingAt(x, z);
        c = slope > 0.38 ? 0.05 : 0.15;
        c *= 1 - (shade ? shade[k] : 0) * 0.75;
        if (clearing > 0.62) c = Math.max(c, 0.9);
        if (burn > 0.5) c = Math.max(c, 0.85);
        gold = Math.max(burn, clearing > 0.66 ? 0.6 : 0);
        if (bare[k]) c = 0;
      }
      cover[k * 2] = Math.round(Math.min(1, c) * 255);
      cover[k * 2 + 1] = Math.round(Math.min(1, gold) * 255);
    }
    const coverTex = new THREE.DataTexture(cover, W, H, THREE.RGFormat, THREE.UnsignedByteType);
    coverTex.minFilter = coverTex.magFilter = THREE.LinearFilter; coverTex.needsUpdate = true;
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
      uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...water.surfaceUniforms(), uCenter: { value: new THREE.Vector2() }, uTime: { value: 0 }, uHalf: { value: SIZE / 2 }, uCoverTex: { value: coverTex }, uSky: { value: new THREE.Color(0xa9c6e0) }, uGround: { value: new THREE.Color(0x6f7a60) }, uSun: { value: new THREE.Color(0xffe9c4) } },
      side: THREE.DoubleSide, fog: true,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
  }
  update(dt, x, z, hemi, sun) {
    this.material.uniforms.uTime.value += dt;
    this.material.uniforms.uCenter.value.set(Math.round(x / SPACING) * SPACING, Math.round(z / SPACING) * SPACING);
    if (hemi) { this.material.uniforms.uSky.value.copy(hemi.color).multiplyScalar(hemi.intensity); this.material.uniforms.uGround.value.copy(hemi.groundColor).multiplyScalar(hemi.intensity); }
    if (sun) this.material.uniforms.uSun.value.copy(sun.color).multiplyScalar(sun.intensity * 0.5);
  }
}

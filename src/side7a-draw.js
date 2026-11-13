// What Round 7 stream 7a draws (60 S2, S3, S4): the animals of the night on Big Moose (a cow moose and her calf, a black
// bear upright at the serviceberry, eyeshine two metres up), the wolves (adults lying in the meadow grass, pups tumbling
// at the alders' edge: heard more than seen, so drawn only there, far off), ravens over a kill, the lights over Fourtown
// (the aurora's curtain low in the north, a satellite train climbing out of the west, a fog lantern on a branch,
// foxfire on a rotten birch, the one light), and tracks on the ground. Loaded only under STORY_ON (feed-side7a.js).
// The animals and the tracks use the props' one material (no new program); the lights are additive sprites and one
// curtain shader (the aurora: compiled when first shown, on a strong night only).
//
//   const D = new Draw7a({ scene, world, tiles, camera }) · D.ground(x, z) → y (the drawn ground or the water)
//   D.creature(kind) → Group  ('moose' | 'calf' | 'bear' | 'wolf' | 'pup' | 'raven'); place with D.put(g, x, z, heading)
//   D.eyes(on, at) · D.aurora(on, a, t) · D.train(on, k) · D.glow(id, on, { x, y, z, color, size, a }) · D.ravens(at, t)
//   D.tracks(id, kind, x, z, heading, n) / D.dropTracks(id) · D.update(dt, t)
import * as THREE from 'three';
import { PropBuilder, TILE, propMaterial } from './prop-kit.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const C = (hex) => new THREE.Color(hex);
const LOOK = {
  moose: { len: 2.6, h: 1.9, r: 0.42, leg: 1.1, head: 0.75, col: C(0x2b2219), head2: C(0x3a2e22), neck: 0.5 },
  calf: { len: 1.5, h: 1.25, r: 0.26, leg: 0.8, head: 0.45, col: C(0x5a3e28), head2: C(0x6a4a30), neck: 0.3 },
  bear: { len: 1.5, h: 0.95, r: 0.36, leg: 0.5, head: 0.38, col: C(0x1b1816), head2: C(0x76593e), neck: 0.12 },
  wolf: { len: 1.25, h: 0.8, r: 0.2, leg: 0.5, head: 0.32, col: C(0x6a665e), head2: C(0x8a857a), neck: 0.18, tail: 0.45 },
  pup: { len: 0.6, h: 0.42, r: 0.12, leg: 0.24, head: 0.2, col: C(0x5e5850), head2: C(0x7a7468), neck: 0.08, tail: 0.18 },
};
function quadGeo(k) {
  const b = new PropBuilder(), L = k.len, y = k.leg + k.r * 0.6;
  b.tube([V(-L / 2, y, 0), V(-L / 6, y + k.r * 0.15, 0), V(L / 6, y + k.r * 0.25, 0), V(L / 2, y + k.r * 0.1, 0)], (t) => k.r * (0.8 + 0.25 * Math.sin(Math.PI * t)), 8, TILE.PLAIN, k.col, { cap0: true, cap1: true });
  for (const [sx, sz] of [[0.36, 0.55], [0.36, -0.55], [-0.38, 0.55], [-0.38, -0.55]]) b.cyl(V(sx * L, y, sz * k.r), V(sx * L + 0.02, 0, sz * k.r), k.r * 0.22, k.r * 0.14, 5, TILE.PLAIN, k.col, { cap1: true });
  const nx = L / 2, ny = y + k.r * 0.3, hx = nx + k.neck * 0.7, hy = ny + k.neck;
  b.cyl(V(nx - 0.05, ny, 0), V(hx, hy, 0), k.r * 0.45, k.r * 0.32, 6, TILE.PLAIN, k.col);
  b.cyl(V(hx - 0.05, hy, 0), V(hx + k.head, hy - k.head * 0.35, 0), k.r * 0.34, k.r * 0.16, 6, TILE.PLAIN, k.head2, { cap1: true });
  if (k.tail) b.cyl(V(-L / 2, y + 0.02, 0), V(-L / 2 - k.tail * 0.8, y - k.tail * 0.5, 0), k.r * 0.22, k.r * 0.08, 5, TILE.PLAIN, k.col, { cap1: true });
  return { geo: b.build(), eye: V(hx + k.head * 0.55, hy, 0) };
}
function ravenGeo() {
  const b = new PropBuilder(), col = C(0x101012);
  b.face([V(0, 0, 0), V(-0.25, 0.02, 0.55), V(-0.1, 0, 0)], TILE.PLAIN, col, { ref: V(0, 1, 0) });
  b.face([V(0, 0, 0), V(-0.1, 0, 0), V(-0.25, 0.02, -0.55)], TILE.PLAIN, col, { ref: V(0, 1, 0) });
  b.cyl(V(0.2, 0, 0), V(-0.3, 0, 0), 0.06, 0.03, 5, TILE.PLAIN, col, { cap0: true, cap1: true });
  return b.build();
}
const PRINT = {
  wolf: { w: 0.07, l: 0.09, gap: 0.62, col: C(0x2c2620) }, pup: { w: 0.04, l: 0.05, gap: 0.3, col: C(0x2c2620) },
  moose: { w: 0.1, l: 0.14, gap: 1.0, col: C(0x2a241c) }, bear: { w: 0.11, l: 0.17, gap: 0.7, col: C(0x2a241c) },
  boots: { w: 0.1, l: 0.28, gap: 0.75, col: C(0x2e2922) }, yours: { w: 0.1, l: 0.27, gap: 0.7, col: C(0x2e2922) },
};

const AUR_V = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const AUR_F = /* glsl */ `
  uniform float uT; uniform float uA; varying vec2 vUv;
  float h(float x) { return fract(sin(x * 127.1) * 43758.5453); }
  float n(float x) { float i = floor(x), f = fract(x); return mix(h(i), h(i + 1.0), f * f * (3.0 - 2.0 * f)); }
  void main() {
    float x = vUv.x * 40.0, wave = n(x * 0.35 + uT * 0.05) * 0.25;
    float rays = 0.45 + 0.55 * n(x * 3.0 + uT * 0.4) * n(x * 0.7 - uT * 0.13);
    float y = vUv.y - wave, base = smoothstep(0.0, 0.08, y) * (1.0 - smoothstep(0.35, 1.0, y));
    float edge = smoothstep(0.0, 0.15, vUv.x) * (1.0 - smoothstep(0.85, 1.0, vUv.x));
    vec3 col = mix(vec3(0.15, 0.95, 0.45), vec3(0.85, 0.2, 0.35), smoothstep(0.45, 0.95, y));
    gl_FragColor = vec4(col * base * rays * edge * uA * 0.55, 1.0);
  }`;
function glowTex() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Draw7a {
  constructor({ scene, world, tiles, camera }) {
    Object.assign(this, { scene, world, tiles, camera });
    this.root = new THREE.Group(); this.root.name = 'story 7a'; scene.add(this.root);
    this.geos = {}; this.glows = new Map(); this.trackSets = new Map(); this.t = 0;
    this.tex = glowTex();
  }
  ground(x, z) {
    let g = 0;
    try { g = this.tiles && this.tiles.groundAt ? this.tiles.groundAt(x, z) : this.world.heightAt(x, z); } catch { g = 0; }
    let w = -Infinity; try { w = this.world.levelAt(x, z); } catch { /* none */ }
    return Math.max(Number.isFinite(g) ? g : 0, Number.isFinite(w) ? w : -Infinity);
  }
  creature(kind) {
    const g = new THREE.Group(); g.name = `story 7a ${kind}`;
    if (kind === 'raven') { if (!this.geos.raven) this.geos.raven = ravenGeo(); g.add(new THREE.Mesh(this.geos.raven, propMaterial())); }
    else {
      if (!this.geos[kind]) this.geos[kind] = quadGeo(LOOK[kind]);
      const q = this.geos[kind], body = new THREE.Mesh(q.geo, propMaterial()); body.castShadow = false;
      g.add(body); g.userData.body = body; g.userData.eye = q.eye;
    }
    g.visible = false; this.root.add(g);
    return g;
  }
  put(g, x, z, heading = 0, { y = null, pose = null, t = 0 } = {}) {
    if (!g) return;
    g.visible = true;
    const gy = y ?? this.ground(x, z);
    g.position.set(x, gy, z); g.rotation.set(0, heading, 0);
    const b = g.userData.body;
    if (b) {
      b.rotation.set(0, 0, 0); b.position.set(0, 0, 0);
      if (pose === 'walk' || pose === 'flee' || pose === 'charge') b.position.y = Math.abs(Math.sin(t * (pose === 'walk' ? 3 : 7))) * 0.05;
      if (pose === 'upright') { b.rotation.z = 1.25; b.position.set(-0.55, 0.15, 0); }
      if (pose === 'lie') { b.position.y = -LOOK.wolf.leg * 0.85; }
      if (pose === 'tumble') { b.rotation.x = Math.sin(t * 6) * 0.9; b.position.y = Math.abs(Math.sin(t * 5)) * 0.12; }
    }
  }
  hide(g) { if (g) g.visible = false; }
  eyes(on, at = null, color = 0xd8e070) {
    if (!this.eyeMesh) {
      const m = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const s = new THREE.SphereGeometry(0.035, 8, 6), g = new THREE.Group();
      for (const dz of [-0.09, 0.09]) { const e = new THREE.Mesh(s, m); e.position.z = dz; g.add(e); }
      g.name = 'story 7a eyeshine'; this.eyeMesh = g; this.root.add(g);
    }
    this.eyeMesh.visible = !!on && !!at;
    if (on && at) { this.eyeMesh.position.set(at.x, at.y, at.z); this.eyeMesh.rotation.y = at.heading || 0; }
  }
  // the aurora's curtain: low in the north, a few km off, following the eye (as the stars do)
  aurora(on, a = 1) {
    if (!on) { if (this.aur) this.aur.visible = false; return; }
    if (!this.aur) {
      const geo = new THREE.CylinderGeometry(6000, 6000, 2200, 64, 1, true, -Math.PI * 0.32, Math.PI * 0.64);
      geo.translate(0, 1500, 0);
      const mat = new THREE.ShaderMaterial({ vertexShader: AUR_V, fragmentShader: AUR_F, uniforms: { uT: { value: 0 }, uA: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
      this.aur = new THREE.Mesh(geo, mat); this.aur.name = 'story 7a aurora'; this.aur.frustumCulled = false; this.aur.renderOrder = -8;
      // the arc's middle on -z (north): a cylinder's theta 0 is +z, so turn it half round
      this.aur.rotation.y = Math.PI;
      this.root.add(this.aur);
    }
    this.aur.visible = true; this.aur.material.uniforms.uA.value = a;
  }
  // the satellite train: a line of points climbing out of the west (k 0 → 1 over its pass)
  train(on, k = 0) {
    if (!on) { if (this.trn) this.trn.visible = false; return; }
    if (!this.trn) {
      const n = 14, pos = new Float32Array(n * 3), geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({ color: 0xf4f0e6, size: 2.2, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false });
      this.trn = new THREE.Points(geo, mat); this.trn.name = 'story 7a train'; this.trn.frustumCulled = false; this.trn.renderOrder = -8; this.root.add(this.trn);
    }
    const P = this.trn.geometry.attributes.position, R = 5800;
    for (let i = 0; i < P.count; i++) {
      const s = Math.max(0, Math.min(1, k - i * 0.025)), az = (-100 + s * 120) * Math.PI / 180, el = (6 + s * 70) * Math.PI / 180;
      P.setXYZ(i, Math.sin(az) * Math.cos(el) * R, Math.sin(el) * R, -Math.cos(az) * Math.cos(el) * R);
    }
    P.needsUpdate = true; this.trn.visible = true;
  }
  glow(id, on, { x = 0, y = 0, z = 0, color = 0xffe0b0, size = 1, a = 1 } = {}) {
    let s = this.glows.get(id);
    if (!on) { if (s) s.visible = false; return; }
    if (!s) {
      s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      s.name = `story 7a ${id}`; this.glows.set(id, s); this.root.add(s);
    }
    s.visible = true; s.position.set(x, y, z); s.scale.set(size, size, 1); s.material.opacity = a; s.material.color.set(color);
  }
  ravens(at, on = true) {
    if (!this.rv) this.rv = [0, 1, 2].map(() => this.creature('raven'));
    this.rv.forEach((g, i) => {
      if (!on || !at) { g.visible = false; return; }
      const a = this.t * (0.35 + i * 0.07) + i * 2.1, r = 22 + i * 7;
      g.visible = true; g.position.set(at.x + Math.cos(a) * r, at.y + 38 + i * 6 + Math.sin(this.t + i) * 2, at.z + Math.sin(a) * r);
      g.rotation.set(0, -a, Math.sin(this.t * 3 + i) * 0.15);
    });
  }
  // a line of prints: n of them from (x, z) along heading (the world's: atan2(-dz, dx)), the kind's stride
  tracks(id, kind, x, z, heading = 0, n = 8) {
    this.dropTracks(id);
    const P = PRINT[kind] || PRINT.wolf, b = new PropBuilder(), dx = Math.cos(heading), dz = -Math.sin(heading);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1, px = x + dx * P.gap * i - dz * side * P.w * 1.4, pz = z + dz * P.gap * i + dx * side * P.w * 1.4, py = this.ground(px, pz) + 0.015;
      const ring = [];
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, u = Math.cos(a) * P.l, v = Math.sin(a) * P.w; ring.push(V(px + dx * u - dz * v, py, pz + dz * u + dx * v)); }
      b.face(ring, TILE.PLAIN, P.col, { ref: V(0, 1, 0) });
      pts.push({ x: px, z: pz });
    }
    const m = new THREE.Mesh(b.build(), propMaterial()); m.name = `story 7a tracks ${id}`; m.receiveShadow = true;
    this.root.add(m); this.trackSets.set(id, { m, kind, pts, x, z, heading, n });
    return this.trackSets.get(id);
  }
  dropTracks(id) { const s = this.trackSets.get(id); if (!s) return; this.root.remove(s.m); s.m.geometry.dispose(); this.trackSets.delete(id); }
  update(dt) {
    this.t += dt;
    const cam = this.camera;
    if (this.aur && this.aur.visible) { this.aur.position.set(cam.position.x, cam.position.y - 200, cam.position.z); this.aur.material.uniforms.uT.value = this.t; }
    if (this.trn && this.trn.visible) this.trn.position.copy(cam.position);
  }
}

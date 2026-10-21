import * as THREE from 'three';
import { GeoBuilder, vary } from './geobuilder.js';
import { mulberry32, fbm, hash2, clamp, smoothstep } from './rng.js';
import { burnAt, clearingAt } from './fields.js';

// ---------- species (full detail) ------------------------------------------------

function whitePine(rng) {
  const g = new GeoBuilder();
  const h = 13 + rng() * 6;
  g.trunk(0, -0.5, 0, 0.45, 0.22, h * 0.78, 5, vary(0x5a4030, rng), rng, (rng() - 0.5) * 0.8);
  const layers = 3 + Math.floor(rng() * 2);
  for (let i = 0; i < layers; i++) {
    const t = i / layers;
    g.cone((rng() - 0.5) * 1.2, h * (0.35 + t * 0.5), (rng() - 0.5) * 1.2, (3.6 - t * 1.8) * (0.85 + rng() * 0.3), 2.8 + rng() * 1.2, 6, vary(0x2f5a3a, rng), rng, 0.35);
  }
  g.cone(0, h * 0.85, 0, 1.4, 2.2, 5, vary(0x356341, rng), rng, 0.3);
  return g.build();
}
function spruce(rng) {
  const g = new GeoBuilder();
  const h = 9 + rng() * 7;
  g.trunk(0, -0.5, 0, 0.3, 0.1, h, 5, vary(0x4a3a2c, rng), rng);
  const layers = 5 + Math.floor(rng() * 2);
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1);
    g.cone(0, h * (0.12 + t * 0.78), 0, (2.3 - t * 1.6) * (0.9 + rng() * 0.25), 2.2 + rng() * 0.8, 6, vary(i === layers - 1 ? 0x3a6a3e : 0x274a2f, rng), rng, 0.3);
  }
  return g.build();
}
function redPine(rng) {
  const g = new GeoBuilder();
  const h = 12 + rng() * 6;
  g.trunk(0, -0.5, 0, 0.42, 0.26, h, 5, vary(0x8a4a2e, rng), rng, (rng() - 0.5) * 0.6);
  const n = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) g.blob((rng() - 0.5) * 2.2, h - 0.6 + (rng() - 0.3) * 1.6, (rng() - 0.5) * 2.2, 2 + rng() * 1.1, vary(0x3b6b36, rng), rng, 0.35, 1.2, 0.75, 1.2);
  return g.build();
}
function birch(rng) {
  const g = new GeoBuilder();
  const h = 8 + rng() * 5, lean = (rng() - 0.5) * 1.6;
  g.trunk(0, -0.5, 0, 0.22, 0.1, h * 0.75, 5, vary(0xe6e2d6, rng, 0.04), rng, lean);
  const base = rng() < 0.12 ? 0xd9a33a : 0x7da84a;
  const n = 2 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) g.blob(lean + (rng() - 0.5) * 2.4, h * 0.6 + rng() * h * 0.35, (rng() - 0.5) * 2.4, 1.6 + rng() * 1.2, vary(base, rng, 0.1), rng, 0.35, 1, 1.15, 1);
  return g.build();
}
function cedar(rng) {
  const g = new GeoBuilder();
  const h = 6 + rng() * 4, lean = (rng() - 0.5) * 1.5;
  g.trunk(0, -0.5, 0, 0.35, 0.15, h * 0.5, 5, vary(0x6b4a34, rng), rng, lean);
  for (let i = 0; i < 3; i++) { const t = i / 2; g.cone(lean * (0.4 + t * 0.6), h * (0.1 + t * 0.55), 0, (2.4 - t * 1.0) * (0.9 + rng() * 0.2), 3.2 + rng(), 6, vary(0x2d5436, rng), rng, 0.4); }
  return g.build();
}
function snag(rng) {
  const g = new GeoBuilder();
  const h = 6 + rng() * 6, col = vary(0x9a9388, rng, 0.08);
  g.trunk(0, -0.5, 0, 0.35, 0.08, h, 5, col, rng, (rng() - 0.5) * 1.2);
  for (let i = 0; i < 2 + Math.floor(rng() * 2); i++) {
    const y = h * (0.4 + rng() * 0.45), a = rng() * 6.28, L = 1 + rng() * 1.5;
    g.tube(g.ring(0, y, 0, 0.1, 4, rng), g.ring(Math.cos(a) * L, y + L * 0.4, Math.sin(a) * L, 0.03, 4, rng), col, new THREE.Vector3(Math.cos(a) * L * 0.5, y, Math.sin(a) * L * 0.5));
  }
  return g.build();
}
// old-growth pine: a long bare trunk with a small ragged crown and a few stub branches
function tallPine(rng) {
  const g = new GeoBuilder();
  const h = 17 + rng() * 6;
  const bark = vary(0x6b4a34, rng);
  g.trunk(0, -0.5, 0, 0.42, 0.2, h * 0.92, 5, bark, rng, (rng() - 0.5) * 0.9);
  for (let i = 0; i < 2 + Math.floor(rng() * 2); i++) {
    const y = h * (0.55 + rng() * 0.3), a = rng() * 6.28, L = 1.2 + rng() * 1.6;
    g.tube(g.ring(0, y, 0, 0.09, 4, rng), g.ring(Math.cos(a) * L, y + L * 0.25, Math.sin(a) * L, 0.04, 4, rng), bark, new THREE.Vector3(Math.cos(a) * L * 0.5, y, Math.sin(a) * L * 0.5));
    g.blob(Math.cos(a) * L, y + L * 0.3, Math.sin(a) * L, 0.9 + rng() * 0.5, vary(0x3a6a40, rng), rng, 0.4, 1.3, 0.5, 1.3);
  }
  for (let i = 0; i < 2 + Math.floor(rng() * 2); i++) g.blob((rng() - 0.5) * 2.6, h * (0.9 + rng() * 0.08), (rng() - 0.5) * 2.6, 1.6 + rng() * 0.9, vary(0x3b6b42, rng), rng, 0.4, 1.3, 0.6, 1.3);
  return g.build();
}

function boulder(rng) {
  const g = new GeoBuilder();
  const r = 0.7 + rng() * 1.4;
  g.blob(0, r * 0.25, 0, r, vary(0x8d8a80, rng, 0.1), rng, 0.45, 1 + rng() * 0.5, 0.6 + rng() * 0.3, 1 + rng() * 0.4);
  if (rng() < 0.4) g.blob(r * 0.8, r * 0.15, (rng() - 0.5) * r, r * 0.5, vary(0x7d7a72, rng, 0.1), rng, 0.4, 1.2, 0.6, 1);
  return g.build();
}
function shrub(rng) {
  const g = new GeoBuilder();
  const base = [0x5c8a3a, 0x6f9440, 0x4e7a34, 0x7f9a44][Math.floor(rng() * 4)];
  const n = 1 + (rng() < 0.5 ? 1 : 0);
  for (let i = 0; i < n; i++) g.blob((rng() - 0.5) * 0.9, 0.55 + rng() * 0.3, (rng() - 0.5) * 0.9, 0.7 + rng() * 0.6, vary(base, rng, 0.1), rng, 0.4, 1.3, 0.7, 1.2);
  return g.build();
}

// ---------- low-detail twins for distant regions ---------------------------------

function lowConifer(rng, h, r, cols, trunkCol, lift = 0.2) {
  const g = new GeoBuilder();
  g.cone(0, h * lift, 0, r, h * (0.55 - lift), 5, cols[0], rng, 0.15);
  g.cone(0, h * 0.5, 0, r * 0.6, h * 0.5, 5, cols[1], rng, 0.15);
  return g.build();
}
// a diamond: two cones base to base, the cheapest round-ish canopy
function lowBlob(rng, y, r, col) {
  const g = new GeoBuilder();
  const ring = g.ring(0, y, 0, r, 5, rng, 0.1);
  g.fan(new THREE.Vector3(0, y + r * 0.9, 0), ring, col, new THREE.Vector3(0, y, 0));
  g.fan(new THREE.Vector3(0, y - r * 0.8, 0), ring, col, new THREE.Vector3(0, y, 0));
  return g;
}
const LOW = {
  whitePine: (rng) => lowConifer(rng, 14 + rng() * 5, 3.2, [vary(0x2f5a3a, rng), vary(0x356341, rng)], vary(0x5a4030, rng), 0.35),
  spruce: (rng) => lowConifer(rng, 10 + rng() * 6, 2.2, [vary(0x274a2f, rng), vary(0x3a6a3e, rng)], vary(0x4a3a2c, rng), 0.12),
  redPine: (rng) => { const h = 12 + rng() * 6; const g = lowBlob(rng, h, 2.6, vary(0x3b6b36, rng)); g.trunk(0, -0.5, 0, 0.4, 0.25, h, 3, vary(0x8a4a2e, rng), rng); return g.build(); },
  birch: (rng) => { const h = 8 + rng() * 5; const g = lowBlob(rng, h * 0.75, 2.4, vary(0x7da84a, rng, 0.1)); g.trunk(0, -0.5, 0, 0.2, 0.1, h * 0.7, 3, vary(0xe6e2d6, rng, 0.04), rng); return g.build(); },
  cedar: (rng) => lowConifer(rng, 7 + rng() * 3, 2.3, [vary(0x2d5436, rng), vary(0x2d5436, rng)], vary(0x6b4a34, rng), 0.1),
  snag: (rng) => { const g = new GeoBuilder(); g.trunk(0, -0.5, 0, 0.3, 0.08, 7 + rng() * 5, 4, vary(0x9a9388, rng, 0.08), rng); return g.build(); },
  boulder,
  shrub,
  tallPine: (rng) => { const h = 17 + rng() * 6; const g = lowBlob(rng, h * 0.93, 2.4, vary(0x3b6b42, rng)); g.trunk(0, -0.5, 0, 0.4, 0.2, h * 0.9, 3, vary(0x6b4a34, rng), rng); return g.build(); },
};

export const SPECIES = [
  { name: 'whitePine', make: whitePine, scale: [0.85, 1.3], giant: 0.04 },
  { name: 'spruce', make: spruce, scale: [0.75, 1.2] },
  { name: 'redPine', make: redPine, scale: [0.75, 1.15] },
  { name: 'birch', make: birch, scale: [0.7, 1.15] },
  { name: 'cedar', make: cedar, scale: [0.75, 1.2] },
  { name: 'snag', make: snag, scale: [0.8, 1.2] },
  { name: 'boulder', make: boulder, scale: [0.6, 1.6] },
  { name: 'shrub', make: shrub, scale: [0.7, 1.5] },
  { name: 'tallPine', make: tallPine, scale: [0.85, 1.25] },
];
const VARIANTS = 4;
const LOD_DISTANCE = 750;  // metres from the camera to a region centre before its low-detail twin is used
const CULL_DISTANCE = 3200; // beyond this a region's trees are not drawn at all

// ---------- placement -------------------------------------------------------------

function trailMask(world, exclusions) {
  const mask = new Map(); // cellIndex -> [[x1,z1,x2,z2,r], ...]
  const add = (k, seg) => { const a = mask.get(k); if (a) a.push(seg); else mask.set(k, [seg]); };
  for (const seg of exclusions) {
    const [x1, z1, x2, z2, r] = seg;
    const i0 = world.cellI(Math.min(x1, x2) - r) - 1, i1 = world.cellI(Math.max(x1, x2) + r) + 1;
    const j0 = world.cellJ(Math.min(z1, z2) - r) - 1, j1 = world.cellJ(Math.max(z1, z2) + r) + 1;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (i >= 0 && j >= 0 && i < world.width && j < world.height) add(world.idx(i, j), seg);
  }
  return mask;
}

function segDist(px, pz, x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1, L2 = dx * dx + dz * dz || 1;
  const t = clamp(((px - x1) * dx + (pz - z1) * dz) / L2, 0, 1);
  return Math.hypot(px - (x1 + dx * t), pz - (z1 + dz * t));
}

export function treeDensity(sd, slope, clearing) {
  let d;
  if (sd < 2) d = 0.1; else if (sd < 10) d = 1.5; else if (sd < 40) d = 1.4; else if (sd < 250) d = 0.95; else if (sd < 700) d = 0.5; else if (sd < 1500) d = 0.32; else d = 0.16;
  d *= 1 - smoothstep(0.45, 0.8, slope) * 0.85;
  d *= 1 - clearing * 0.85;
  return d;
}

export async function buildVegetation(world, { seed = 1, regionSize = 640, exclusions = [], onProgress = () => {} } = {}) {
  const rng = mulberry32(seed);
  const variants = SPECIES.map((s) => Array.from({ length: VARIANTS }, (_, v) => ({
    full: s.make(mulberry32(seed * 131 + v * 17 + s.name.length)),
    low: LOW[s.name](mulberry32(seed * 131 + v * 17 + s.name.length)),
  })));
  const mask = trailMask(world, exclusions);
  const W = world.width, H = world.height;
  const rx = Math.ceil(world.sizeX / regionSize);
  const bins = new Map();
  const binFor = (r, s) => { const k = r * 16 + s; let b = bins.get(k); if (!b) { b = { r, s, items: [] }; bins.set(k, b); } return b; };
  const shadeCount = new Float32Array(W * H);
  let total = 0;
  const color = new THREE.Color();
  for (let j = 1; j < H - 1; j++) {
    if ((j & 15) === 0) { onProgress(j / H); await new Promise((r) => setTimeout(r)); }
    for (let i = 1; i < W - 1; i++) {
      const k = world.idx(i, j);
      const sd = world.sd[k];
      if (sd < -4) continue;
      const cx = world.cellX(i), cz = world.cellZ(j);
      const slope = world.slopeAt(cx, cz);
      const clearing = smoothstep(0.62, 0.78, clearingAt(cx, cz));
      const burn = burnAt(cx, cz);
      const segs = mask.get(k);
      // trails run through thick woods: more trees and brush right beside them
      const trailSide = segs && segs.some((g) => g[4] < 5) ? 2.6 : 1;
      const e = sd < 0 ? 0 : treeDensity(sd, slope, trailSide > 1 ? 0 : clearing) * 1.05 * trailSide * (1 - burn * 0.5);
      const trees = Math.floor(e) + (rng() < e - Math.floor(e) ? 1 : 0);
      const eShrub = (sd > 0.5 && sd < 35 ? (0.75 - smoothstep(10, 35, sd) * 0.5) * (1 - clearing * 0.5) * trailSide : (sd > 0 && trailSide > 1 ? 0.5 : 0)) + burn * 0.5;
      const shrubs = Math.floor(eShrub) + (rng() < eShrub - Math.floor(eShrub) ? 1 : 0);
      const rockP = sd < 8 && sd > -4 ? 0.1 + smoothstep(0.3, 0.6, slope) * 0.25 : 0;
      const rocks = rng() < rockP ? 1 : 0;
      const region = Math.floor((cz - world.minZ) / regionSize) * rx + Math.floor((cx - world.minX) / regionSize);
      const n = trees + shrubs + rocks;
      for (let q = 0; q < n; q++) {
        const isTree = q < trees, isShrub = !isTree && q < trees + shrubs, isRock = !isTree && !isShrub;
        const x = cx + (rng() - 0.5) * world.cell, z = cz + (rng() - 0.5) * world.cell;
        const s = world.shoreAt(x, z);
        if (isRock ? s < -3 || s > 9 : s < 0.6) continue;
        if (segs && segs.some((g) => segDist(x, z, g[0], g[1], g[2], g[3]) < g[4] + (isRock ? 0.5 : isShrub ? 0.4 : 1.2))) continue;
        let sp;
        if (isRock) sp = 6;
        else if (isShrub) sp = 7;
        else {
          const h = world.heightAt(x, z);
          const patch = fbm(x * 0.0025 + 7, z * 0.0025, 3, 33);
          const r = rng();
          // spruce-dominated boreal mix, birch in stands, cedar along the shore; burn scars are
          // standing snags with young spruce coming up; old pines on rocky points and ridges
          if (burn > 0.5) sp = r < 0.72 ? 5 : 1;
          else if (s < 22 && r < 0.2) sp = 4;
          else if (((s < 35 && slope > 0.15) || h > 496) && r < 0.3) sp = 8;
          else if (patch > 0.62 && r < 0.55) sp = 3;
          else if (r < 0.02) sp = 5;
          else if (h > 492 && r < 0.3) sp = 0;
          else if (r < 0.12) sp = 2; else if (r < 0.25) sp = 0; else if (r < 0.32) sp = 3; else sp = 1;
          shadeCount[k] += 1;
        }
        const spec = SPECIES[sp];
        let scale = spec.scale[0] + rng() * (spec.scale[1] - spec.scale[0]);
        if (spec.giant && rng() < spec.giant) scale *= 1.45;
        if (isTree && burn > 0.5) scale *= sp === 5 ? 1.25 : 0.45; // tall dead stems, small regrowth
        if (isRock && s > -2 && rng() < 0.08 + smoothstep(0.25, 0.5, slope) * 0.2) scale *= 2.6; // granite outcrop blocks
        if (isTree && s > 600) scale *= 1.15;
        binFor(region, sp).items.push(x, world.heightAt(x, z) - (isRock ? 0.4 : 0.35), z, rng() * Math.PI * 2, scale, 0.92 + rng() * 0.16, 0.9 + rng() * 0.2);
        total++;
      }
    }
  }
  // canopy shade for the ground: tree count per cell, softened over the neighbours
  const shade = new Float32Array(W * H);
  for (let j = 1; j < H - 1; j++) for (let i = 1; i < W - 1; i++) {
    let s = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) s += shadeCount[(j + dj) * W + i + di];
    shade[j * W + i] = clamp(s / 7, 0, 1);
  }
  const group = new THREE.Group();
  group.name = 'vegetation';
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const dummy = new THREE.Object3D();
  for (const b of bins.values()) {
    const count = b.items.length / 7;
    const v = variants[b.s][Math.floor(hash2(b.r, b.s, 9) * VARIANTS)];
    const mesh = new THREE.InstancedMesh(v.full, material, count);
    for (let n = 0; n < count; n++) {
      const o = n * 7;
      dummy.position.set(b.items[o], b.items[o + 1], b.items[o + 2]);
      dummy.rotation.set(0, b.items[o + 3], 0);
      const sc = b.items[o + 4];
      dummy.scale.set(sc * b.items[o + 6], sc, sc * (2 - b.items[o + 6]));
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      color.setRGB(b.items[o + 5], b.items[o + 5] * (0.97 + hash2(n, b.r, 2) * 0.06), b.items[o + 5]);
      mesh.setColorAt(n, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere(); // computed once with the full geometry, kept across LOD swaps
    mesh.matrixAutoUpdate = false;
    const rxi = b.r % rx, rzi = (b.r - rxi) / rx;
    mesh.userData.lod = { full: v.full, low: v.low, cx: world.minX + (rxi + 0.5) * regionSize, cz: world.minZ + (rzi + 0.5) * regionSize };
    group.add(mesh);
  }
  onProgress(1);
  group.userData.count = total;
  group.userData.shade = shade;
  return group;
}

export function updateVegetationLOD(group, camPos) {
  for (const m of group.children) {
    const l = m.userData.lod;
    if (!l) continue;
    const d = Math.hypot(l.cx - camPos.x, l.cz - camPos.z);
    m.visible = d < CULL_DISTANCE;
    const want = d > LOD_DISTANCE ? l.low : l.full;
    if (m.geometry !== want) m.geometry = want;
  }
}

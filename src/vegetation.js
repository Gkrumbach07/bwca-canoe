import * as THREE from 'three';
import { GeoBuilder, vary } from './geobuilder.js';
import { mulberry32, hash2 } from './rng.js';
import { smoothBoulder, makeRockMaterial, makeToonMaterial, smoothToon } from './rocks.js';

// Tree, shrub and boulder geometry. Placement lives in placement.js (it runs in the build worker); this file
// turns a tile's placement bins into instanced meshes in tile-local coordinates. Everything is welded smooth
// and shaded with the stepped toon ramp (see rocks.js): low-poly silhouettes, soft painted volumes.

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
  boulder: (rng) => smoothBoulder(rng, rng() * 50),
  shrub,
  tallPine: (rng) => { const h = 17 + rng() * 6; const g = lowBlob(rng, h * 0.93, 2.4, vary(0x3b6b42, rng)); g.trunk(0, -0.5, 0, 0.4, 0.2, h * 0.9, 3, vary(0x6b4a34, rng), rng); return g.build(); },
};

// index order must match placement.js SPECIES
export const SPECIES = [
  { name: 'whitePine', make: whitePine },
  { name: 'spruce', make: spruce },
  { name: 'redPine', make: redPine },
  { name: 'birch', make: birch },
  { name: 'cedar', make: cedar },
  { name: 'snag', make: snag },
  { name: 'boulder', make: (rng) => smoothBoulder(rng, rng() * 50), rock: true },
  { name: 'shrub', make: shrub },
  { name: 'tallPine', make: tallPine },
];
const VARIANTS = 4;
const LOD_DISTANCE = 750;  // metres from the camera to a region centre before its low-detail twin is used
const CULL_DISTANCE = 3200; // beyond this a region's trees are not drawn at all

// Geometry variants (built once) and the shared materials.
export function makeVegetationKit(seed = 3) {
  const variants = SPECIES.map((s) => Array.from({ length: VARIANTS }, (_, v) => {
    const full = s.make(mulberry32(seed * 131 + v * 17 + s.name.length));
    const low = LOW[s.name](mulberry32(seed * 131 + v * 17 + s.name.length));
    return s.rock ? { full, low } : { full: smoothToon(full), low: smoothToon(low) };
  }));
  const material = makeToonMaterial();
  const rockMaterial = makeRockMaterial();
  return { variants, material, rockMaterial, seed };
}

// One instanced mesh per (region, species) bin, matrices and colours straight from the worker.
export function makeVegetationMeshes(bins, kit) {
  const meshes = [];
  for (const b of bins) {
    if (!b.count) continue;
    const spec = SPECIES[b.sp];
    const v = kit.variants[b.sp][Math.floor(hash2(b.rx * 7919 + b.rz, b.sp, 9) * VARIANTS)];
    const mesh = new THREE.InstancedMesh(v.full, spec.rock ? kit.rockMaterial : kit.material, b.count);
    mesh.instanceMatrix = new THREE.InstancedBufferAttribute(b.matrices, 16);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(b.colors, 3);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere(); // computed once with the full geometry, kept across LOD swaps
    mesh.matrixAutoUpdate = false;
    mesh.userData.lod = { full: v.full, low: v.low, cx: b.cx, cz: b.cz, lod: LOD_DISTANCE, cull: CULL_DISTANCE };
    meshes.push(mesh);
  }
  return meshes;
}

// Distance-based LOD and culling for any mesh carrying userData.lod (trees, shrubs, rocks, lake vegetation).
export function updateVegetationLOD(meshes, camPos) {
  for (const m of meshes) {
    const l = m.userData.lod;
    const d = Math.hypot(l.cx - camPos.x, l.cz - camPos.z);
    m.visible = d < l.cull;
    const want = d > l.lod ? l.low : l.full;
    if (m.geometry !== want) m.geometry = want;
  }
}

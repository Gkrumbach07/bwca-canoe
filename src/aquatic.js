import * as THREE from 'three';
import { GeoBuilder, vary } from './geobuilder.js';
import { mulberry32 } from './rng.js';
import { makeFloatingMaterial, makeSwayMaterial } from './floating.js';

// Lake vegetation geometry (lily pads, reeds, submerged weeds). Placement runs in the build worker
// (placement.js placeAquatic); this file turns a tile's bins into instanced meshes in tile-local
// coordinates that ride the rendered water surface.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const CULL = 700;

// lily pad: a flat seven-sided disc with a notch, sometimes a flower
function lilyPad(rng, flower) {
  const g = new GeoBuilder();
  const n = 7, top = vary(0x4a7d3a, rng, 0.08), ctr = V(0, 0, 0), ref = V(0, -2, 0);
  const pts = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + 0.3; const r = 0.9 + rng() * 0.2; pts.push(V(Math.cos(a) * r, 0, Math.sin(a) * r)); }
  for (let i = 0; i < n - 1; i++) g.tri(ctr, pts[i], pts[i + 1], top, ref); // the missing wedge is the notch
  if (flower) {
    const c = vary(rng() < 0.5 ? 0xf6f1e6 : 0xf0b7c8, rng, 0.05);
    g.blob(0.15, 0.12, 0.1, 0.22, c, rng, 0.35, 1.1, 0.7, 1.1);
    g.blob(0.15, 0.2, 0.1, 0.08, vary(0xf2d26a, rng, 0.05), rng, 0.2);
  }
  return g.build();
}

// reeds: a clump of thin blades, a couple with cattail heads
function reeds(rng) {
  const g = new GeoBuilder();
  const n = 4 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const a = rng() * Math.PI * 2, d = rng() * 0.25, h = 1.1 + rng() * 0.9, tilt = (rng() - 0.5) * 0.3;
    const bx = Math.cos(a) * d, bz = Math.sin(a) * d;
    const col = vary(rng() < 0.6 ? 0x8a9a4e : 0x6f8a3a, rng, 0.1);
    const w = 0.025;
    g.tri(V(bx - w, 0, bz), V(bx + w, 0, bz), V(bx + tilt, h, bz + tilt * 0.5), col, V(bx, h * 0.3, bz - 5));
    g.tri(V(bx, 0, bz - w), V(bx, 0, bz + w), V(bx + tilt, h, bz + tilt * 0.5), col, V(bx - 5, h * 0.3, bz));
    if (i < 2 && rng() < 0.6) g.tube(g.ring(bx + tilt * 0.85, h * 0.78, bz + tilt * 0.4, 0.035, 4, rng), g.ring(bx + tilt, h * 0.95, bz + tilt * 0.5, 0.03, 4, rng), vary(0x5a3e2a, rng), V(bx, h * 0.85, bz));
  }
  return g.build();
}

// submerged weed: two crossed blades rising from the bed, y from 0 (bed) to 1 (tip) for the sway
function weed(rng) {
  const g = new GeoBuilder();
  const h = 1.0, col = vary(0x2f5a3c, rng, 0.1), tip = vary(0x4d7f4a, rng, 0.1);
  for (const a of [0, Math.PI / 2]) {
    const dx = Math.cos(a) * 0.14, dz = Math.sin(a) * 0.14;
    g.tri(V(-dx, 0, -dz), V(dx, 0, dz), V(dx * 0.6, h, dz * 0.6), col, V(0, 0.3, 0));
    g.tri(V(-dx, 0, -dz), V(dx * 0.6, h, dz * 0.6), V(-dx * 0.6, h, -dz * 0.6), tip, V(0, 0.3, 0));
  }
  return g.build();
}

// kinds: 0 pad, 1 reed, 2 weed (placement.js AQUATIC)
export function makeAquaticKit(water, seed = 9) {
  const rng = mulberry32(seed);
  const geos = [[lilyPad(rng, false), lilyPad(rng, false), lilyPad(rng, true)], [reeds(rng), reeds(rng), reeds(rng)], [weed(rng), weed(rng)]];
  const mats = [makeFloatingMaterial(water), makeFloatingMaterial(water), makeSwayMaterial(water)];
  return { geos, mats };
}

export function makeAquaticMeshes(bins, kit) {
  const meshes = [];
  for (const b of bins) {
    if (!b.count) continue;
    const geo = kit.geos[b.kind][Math.min(b.variant, kit.geos[b.kind].length - 1)];
    const mesh = new THREE.InstancedMesh(geo, kit.mats[b.kind], b.count);
    mesh.instanceMatrix = new THREE.InstancedBufferAttribute(b.matrices, 16);
    mesh.receiveShadow = b.kind !== 2;
    mesh.computeBoundingSphere();
    mesh.matrixAutoUpdate = false;
    mesh.renderOrder = b.kind === 2 ? 0 : 11; // pads and reeds draw after the water so they sit on it
    mesh.userData.lod = { full: geo, low: geo, cx: b.cx, cz: b.cz, lod: Infinity, cull: CULL };
    meshes.push(mesh);
  }
  return meshes;
}

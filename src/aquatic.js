import * as THREE from 'three';
import { GeoBuilder, vary } from './geobuilder.js';
import { mulberry32, hash2, smoothstep } from './rng.js';
import { calmAt } from './fields.js';
import { makeFloatingMaterial, makeSwayMaterial } from './floating.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

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

const CULL = 700;

export async function buildAquatic(world, water, { seed = 9, regionSize = 640, onProgress = () => {} } = {}) {
  const rng = mulberry32(seed);
  const geos = { pad: [lilyPad(rng, false), lilyPad(rng, false), lilyPad(rng, true)], reed: [reeds(rng), reeds(rng), reeds(rng)], weed: [weed(rng), weed(rng)] };
  const mats = { pad: makeFloatingMaterial(water), reed: makeFloatingMaterial(water), weed: makeSwayMaterial(water) };
  const W = world.width, H = world.height, rx = Math.ceil(world.sizeX / regionSize);
  const bins = new Map();
  const binFor = (r, kind) => { const k = r + ':' + kind; let b = bins.get(k); if (!b) { b = { r, kind, items: [] }; bins.set(k, b); } return b; };
  let total = 0;
  for (let j = 1; j < H - 1; j++) {
    if ((j & 31) === 0) { onProgress(j / H); await new Promise((r) => setTimeout(r)); }
    for (let i = 1; i < W - 1; i++) {
      const k = j * W + i, sd = world.sd[k];
      if (sd < -32 || sd > 2) continue;
      const cx = world.cellX(i), cz = world.cellZ(j);
      const level = world.levelAt(cx, cz, 3);
      const depth = level - world.hCell(i, j);
      const calm = calmAt(cx, cz);
      const region = Math.floor((cz - world.minZ) / regionSize) * rx + Math.floor((cx - world.minX) / regionSize);
      const place = (kind, expected, test) => {
        const n = Math.floor(expected) + (rng() < expected - Math.floor(expected) ? 1 : 0);
        for (let q = 0; q < n; q++) {
          const x = cx + (rng() - 0.5) * world.cell, z = cz + (rng() - 0.5) * world.cell;
          const s = world.shoreAt(x, z), d = level - world.heightAt(x, z);
          if (!test(s, d)) continue;
          const y = kind === 'weed' ? world.heightAt(x, z) : level + 0.07;
          binFor(region, kind).items.push(x, y, z, rng() * Math.PI * 2, kind === 'weed' ? Math.min(0.4 + d * 0.4 * rng() + 0.25, d * 0.8) : kind === 'pad' ? 0.17 + rng() * 0.2 : 0.8 + rng() * 0.5, kind === 'pad' && rng() < 0.12 ? 2 : Math.floor(rng() * 2));
          total++;
        }
      };
      if (sd < -1.0 && sd > -22 && depth < 3.0 && calm > 0.5) place('pad', 24 * smoothstep(0.5, 0.66, calm), (s, d) => s < -0.7 && d > 0.25 && d < 3.2);
      if (sd > -6 && sd < 1.6 && calm > 0.5) place('reed', 2.6 * smoothstep(0.5, 0.68, calm), (s, d) => s < 1.8 && d < 1.4);
      if (sd < -3 && sd > -30 && depth > 0.4 && depth < 3.4 && calm > 0.42) place('weed', 1.6, (s, d) => s < -2 && d > 0.35 && d < 3.6);
    }
  }
  const group = new THREE.Group();
  group.name = 'aquatic';
  const dummy = new THREE.Object3D();
  for (const b of bins.values()) {
    const count = b.items.length / 6;
    // one mesh per variant so geometry can differ
    const byVariant = new Map();
    for (let n = 0; n < count; n++) { const v = b.items[n * 6 + 5]; if (!byVariant.has(v)) byVariant.set(v, []); byVariant.get(v).push(n); }
    for (const [v, list] of byVariant) {
      const geo = geos[b.kind][Math.min(v, geos[b.kind].length - 1)];
      const mesh = new THREE.InstancedMesh(geo, mats[b.kind], list.length);
      list.forEach((n, m) => {
        const o = n * 6;
        dummy.position.set(b.items[o], b.items[o + 1], b.items[o + 2]);
        dummy.rotation.set(0, b.items[o + 3], 0);
        const sc = b.items[o + 4];
        dummy.scale.set(sc, sc, sc);
        dummy.updateMatrix();
        mesh.setMatrixAt(m, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.receiveShadow = b.kind !== 'weed';
      mesh.computeBoundingSphere();
      mesh.matrixAutoUpdate = false;
      mesh.renderOrder = b.kind === 'weed' ? 0 : 11; // pads and reeds draw after the water so they sit on it
      const rxi = b.r % rx, rzi = (b.r - rxi) / rx;
      mesh.userData.center = [world.minX + (rxi + 0.5) * regionSize, world.minZ + (rzi + 0.5) * regionSize];
      mesh.userData.kind = b.kind;
      group.add(mesh);
    }
  }
  group.userData.count = total;
  group.userData.update = (camPos) => { for (const m of group.children) { const c = m.userData.center; m.visible = Math.hypot(c[0] - camPos.x, c[1] - camPos.z) < CULL; } };
  onProgress(1);
  return group;
}

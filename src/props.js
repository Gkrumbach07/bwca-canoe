import * as THREE from 'three';
import { GeoBuilder, vary } from './geobuilder.js';
import { mulberry32, hash2 } from './rng.js';
import { surfaceAt } from './terrain.js';
import { smoothBoulder, makeRockMaterial } from './rocks.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Resample a polyline at roughly `step` metre spacing.
export function resample(pts, step) {
  const out = [[pts[0][0], pts[0][1]]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, z0] = pts[i - 1], [x1, z1] = pts[i];
    const L = Math.hypot(x1 - x0, z1 - z0);
    let d = step - carry;
    while (d <= L) { out.push([x0 + ((x1 - x0) * d) / L, z0 + ((z1 - z0) * d) / L]); d += step; }
    carry = L - (d - step);
  }
  out.push([pts[pts.length - 1][0], pts[pts.length - 1][1]]);
  return out;
}

// Vegetation exclusion segments: [x1,z1,x2,z2,radius]
export function exclusionsFor(world) {
  const segs = [];
  for (const p of world.portages) for (let i = 1; i < p.pts.length; i++) segs.push([p.pts[i - 1][0], p.pts[i - 1][1], p.pts[i][0], p.pts[i][1], 2.2]);
  for (const c of world.campsites) segs.push([c.x, c.z, c.x, c.z, 9]);
  return segs;
}

export function buildPortageTrails(world) {
  const rng = mulberry32(42);
  const g = new GeoBuilder();
  const signs = new GeoBuilder();
  const half = 0.85;
  for (const p of world.portages) {
    const pts = resample(p.pts, 2.5);
    let prevL = null, prevR = null;
    for (let i = 0; i < pts.length; i++) {
      const [x, z] = pts[i];
      const [xa, za] = pts[Math.max(0, i - 1)], [xb, zb] = pts[Math.min(pts.length - 1, i + 1)];
      let dx = xb - xa, dz = zb - za; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      const nx = -dz, nz = dx;
      const y = surfaceAt(world, x, z) + 0.12;
      const l = V(x + nx * half, surfaceAt(world, x + nx * half, z + nz * half) + 0.12, z + nz * half);
      const r = V(x - nx * half, surfaceAt(world, x - nx * half, z - nz * half) + 0.12, z - nz * half);
      l.y = Math.max(l.y, y - 0.3); r.y = Math.max(r.y, y - 0.3);
      if (prevL) g.quad(prevL, prevR, r, l, vary(0x6e5236, rng, 0.1, 0.1), V(x, y - 10, z));
      prevL = l; prevR = r;
    }
    // a small wooden marker post at each end
    for (const end of [p.pts[0], p.pts[p.pts.length - 1]]) {
      const [x, z] = end, y = surfaceAt(world, x, z);
      const post = vary(0x7a5a3a, rng, 0.08);
      signs.tube(signs.ring(x, y - 0.2, z, 0.07, 4, rng), signs.ring(x, y + 1.5, z, 0.06, 4, rng), post, V(x, y + 0.6, z));
      const a = hash2(Math.round(x), Math.round(z), 1) * 6.28;
      const ax = Math.cos(a) * 0.22, az = Math.sin(a) * 0.22, px = -Math.sin(a) * 0.04, pz = Math.cos(a) * 0.04;
      const c = vary(0xe9c35c, rng, 0.05);
      signs.quad(V(x - ax + px, y + 1.2, z - az + pz), V(x + ax + px, y + 1.2, z + az + pz), V(x + ax + px, y + 1.48, z + az + pz), V(x - ax + px, y + 1.48, z - az + pz), c, V(x - px * 50, y + 1.3, z - pz * 50));
      signs.quad(V(x - ax - px, y + 1.2, z - az - pz), V(x + ax - px, y + 1.2, z + az - pz), V(x + ax - px, y + 1.48, z + az - pz), V(x - ax - px, y + 1.48, z - az - pz), c, V(x + px * 50, y + 1.3, z + pz * 50));
    }
  }
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const trail = new THREE.Mesh(g.build(), mat);
  trail.receiveShadow = true;
  const sign = new THREE.Mesh(signs.build(), mat);
  sign.castShadow = true;
  const group = new THREE.Group();
  group.add(trail, sign);
  return group;
}

export function buildCampsites(world) {
  const rng = mulberry32(7);
  const g = new GeoBuilder();
  const outcrops = []; // [x, y, z, yaw, sx, sy, sz]
  for (const c of world.campsites) {
    const a = hash2(Math.round(c.x), Math.round(c.z), 5) * 6.28;
    // the fire ring sits a few metres back from the water, on the land side of the node
    const dir = world.deeperDir(c.x, c.z);
    const fx = c.x - dir.x * (c.shore < 4 ? 6 : 0), fz = c.z - dir.z * (c.shore < 4 ? 6 : 0);
    const fy = surfaceAt(world, fx, fz);
    for (let i = 0; i < 9; i++) {
      const t = (i / 9) * 6.28;
      g.blob(fx + Math.cos(t) * 0.75, fy + 0.05, fz + Math.sin(t) * 0.75, 0.22 + rng() * 0.1, vary(0x76736a, rng, 0.1), rng, 0.4, 1.2, 0.7, 1);
    }
    // the iron fire grate every BWCA site has
    const gc = new THREE.Color(0x2a2a2a);
    g.quad(V(fx - 0.35, fy + 0.3, fz - 0.25), V(fx + 0.35, fy + 0.3, fz - 0.25), V(fx + 0.35, fy + 0.3, fz + 0.25), V(fx - 0.35, fy + 0.3, fz + 0.25), gc, V(fx, fy - 2, fz));
    g.quad(V(fx - 0.35, fy + 0.27, fz - 0.25), V(fx + 0.35, fy + 0.27, fz - 0.25), V(fx + 0.35, fy + 0.27, fz + 0.25), V(fx - 0.35, fy + 0.27, fz + 0.25), gc, V(fx, fy + 3, fz));
    for (const [lx, lz] of [[-0.3, -0.2], [0.3, -0.2], [-0.3, 0.2], [0.3, 0.2]]) g.tube(g.ring(fx + lx, fy, fz + lz, 0.02, 3, rng), g.ring(fx + lx, fy + 0.28, fz + lz, 0.02, 3, rng), gc, V(fx + lx, fy + 0.1, fz + lz));
    // a couple of charred logs in the ring and a log bench
    g.blob(fx, fy + 0.1, fz, 0.3, new THREE.Color(0x3b2a1e), rng, 0.3, 1.6, 0.5, 0.7);
    const bx = fx + Math.cos(a) * 2.6, bz = fz + Math.sin(a) * 2.6, by = surfaceAt(world, bx, bz);
    g.tube(g.ring(bx - Math.sin(a) * 1.2, by + 0.2, bz + Math.cos(a) * 1.2, 0.2, 5, rng, 0.1), g.ring(bx + Math.sin(a) * 1.2, by + 0.2, bz - Math.cos(a) * 1.2, 0.2, 5, rng, 0.1), vary(0x8a6a48, rng), rng && V(bx, by + 0.2, bz));
    // granite outcrop between the fire ring and the water: smooth Shield rock slabs
    if (c.shore < 30) {
      const n = 2 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) {
        const t = 2 + i * 2.6 + rng() * 1.5, side = (rng() - 0.5) * 7;
        const ox = fx + dir.x * t - dir.z * side, oz = fz + dir.z * t + dir.x * side;
        const oy = Math.max(surfaceAt(world, ox, oz), world.levelAt(ox, oz) + 0.2) - 0.6;
        const r = 2.2 + rng() * 2.2;
        outcrops.push(ox, oy, oz, rng() * 6.28, r * (1.3 + rng() * 0.6), r * (0.4 + rng() * 0.2), r * (1.0 + rng() * 0.5));
        if (rng() < 0.6) outcrops.push(ox + (rng() - 0.5) * r, oy + 0.15, oz + (rng() - 0.5) * r, rng() * 6.28, r * 0.6, r * 0.25, r * 0.55);
      }
    }
    // tent on the flattest nearby spot: an A-frame with a fly
    const ta = a + 2.2, tx = fx + Math.cos(ta) * 6, tz = fz + Math.sin(ta) * 6, ty = surfaceAt(world, tx, tz) + 0.05;
    const yaw = rng() * 6.28, cx = Math.cos(yaw), sx = Math.sin(yaw);
    const P = (lx, ly, lz) => V(tx + lx * cx - lz * sx, ty + ly, tz + lx * sx + lz * cx);
    const tc = vary([0xd9752e, 0x4f8a5a, 0x3f6fae][Math.floor(rng() * 3)], rng, 0.08);
    const ref = P(0, -3, 0);
    const h = 1.35, w = 1.15, l = 1.3;
    g.quad(P(-l, 0, -w), P(l, 0, -w), P(l, h, 0), P(-l, h, 0), tc, ref);
    g.quad(P(-l, 0, w), P(l, 0, w), P(l, h, 0), P(-l, h, 0), tc, ref);
    g.tri(P(l, 0, -w), P(l, 0, w), P(l, h, 0), tc.clone().offsetHSL(0, 0, -0.08), ref);
    g.tri(P(-l, 0, -w), P(-l, 0, w), P(-l, h, 0), tc.clone().offsetHSL(0, 0, -0.08), ref);
  }
  const mesh = new THREE.Mesh(g.build(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const group = new THREE.Group();
  group.add(mesh);
  const count = outcrops.length / 7;
  if (count) {
    const rocks = new THREE.InstancedMesh(smoothBoulder(rng, 11), makeRockMaterial(), count);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const o = i * 7;
      dummy.position.set(outcrops[o], outcrops[o + 1], outcrops[o + 2]);
      dummy.rotation.set(0, outcrops[o + 3], 0);
      dummy.scale.set(outcrops[o + 4], outcrops[o + 5], outcrops[o + 6]);
      dummy.updateMatrix();
      rocks.setMatrixAt(i, dummy.matrix);
    }
    rocks.instanceMatrix.needsUpdate = true;
    rocks.castShadow = true; rocks.receiveShadow = true;
    rocks.computeBoundingSphere();
    group.add(rocks);
  }
  return group;
}

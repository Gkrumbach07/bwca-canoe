import * as THREE from 'three';
import { GeoBuilder, vary } from './geobuilder.js';
import { mulberry32, hash2 } from './rng.js';
import { surfaceAt } from './terrain-build.js';
import { angularRock, makeRockMaterial, makeToonMaterial } from './rocks.js';

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

let propMaterial = null, rockMaterial = null, outcropGeo = null;
function shared() {
  if (!propMaterial) { propMaterial = makeToonMaterial(); rockMaterial = makeRockMaterial(); outcropGeo = angularRock(mulberry32(11), 'slab'); }
}

// Portage trails, trail markers and campsites that fall inside tile (tx, ty), built in tile-local
// coordinates from the tile's own halo'd grid (tg) so they never wait for a neighbour. Everything stands
// on the shaped terrain surface (surfaceAt), the same one the mesh is built from.
export function buildTileProps(tg, world, tx, ty) {
  shared();
  const [ox, oz] = world.tileOrigin(tx, ty), size = world.tileMetres;
  const inside = (x, z) => x >= ox && x < ox + size && z >= oz && z < oz + size;
  const V = (x, y, z) => new THREE.Vector3(x - ox, y, z - oz);
  const H = (x, z) => surfaceAt(tg, x, z);
  const group = new THREE.Group();
  group.name = 'props';
  const rng = mulberry32(42 + tx * 1000 + ty);
  const g = new GeoBuilder(), signs = new GeoBuilder();
  const half = 0.85;
  for (const p of world.portages) {
    const [bx0, bz0, bx1, bz1] = p.bbox;
    if (bx1 < ox - 4 || bx0 > ox + size + 4 || bz1 < oz - 4 || bz0 > oz + size + 4) continue;
    const pts = p.resampled || (p.resampled = resample(p.pts, 2.5));
    let prevL = null, prevR = null, prevIn = false;
    for (let i = 0; i < pts.length; i++) {
      const [x, z] = pts[i];
      const [xa, za] = pts[Math.max(0, i - 1)], [xb, zb] = pts[Math.min(pts.length - 1, i + 1)];
      let dx = xb - xa, dz = zb - za; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      const nx = -dz, nz = dx;
      const y = H(x, z) + 0.12;
      const l = V(x + nx * half, H(x + nx * half, z + nz * half) + 0.12, z + nz * half);
      const r = V(x - nx * half, H(x - nx * half, z - nz * half) + 0.12, z - nz * half);
      l.y = Math.max(l.y, y - 0.3); r.y = Math.max(r.y, y - 0.3);
      // each ribbon segment belongs to the tile holding its first point, so it is drawn exactly once
      if (prevL && prevIn) g.quad(prevL, prevR, r, l, vary(0x6e5236, rng, 0.1, 0.1), V(x, y - 10, z));
      prevL = l; prevR = r; prevIn = inside(x, z);
    }
    // a small wooden marker post at each end
    for (const end of [p.pts[0], p.pts[p.pts.length - 1]]) {
      const [x, z] = end;
      if (!inside(x, z)) continue;
      const y = H(x, z), lx = x - ox, lz = z - oz;
      const post = vary(0x7a5a3a, rng, 0.08);
      signs.tube(signs.ring(lx, y - 0.2, lz, 0.07, 4, rng), signs.ring(lx, y + 1.5, lz, 0.06, 4, rng), post, new THREE.Vector3(lx, y + 0.6, lz));
      const a = hash2(Math.round(x), Math.round(z), 1) * 6.28;
      const ax = Math.cos(a) * 0.22, az = Math.sin(a) * 0.22, px = -Math.sin(a) * 0.04, pz = Math.cos(a) * 0.04;
      const c = vary(0xe9c35c, rng, 0.05);
      signs.quad(V(x - ax + px, y + 1.2, z - az + pz), V(x + ax + px, y + 1.2, z + az + pz), V(x + ax + px, y + 1.48, z + az + pz), V(x - ax + px, y + 1.48, z - az + pz), c, V(x - px * 50, y + 1.3, z - pz * 50));
      signs.quad(V(x - ax - px, y + 1.2, z - az - pz), V(x + ax - px, y + 1.2, z + az - pz), V(x + ax - px, y + 1.48, z + az - pz), V(x - ax - px, y + 1.48, z - az - pz), c, V(x + px * 50, y + 1.3, z + pz * 50));
    }
  }
  if (g.p.length) { const trail = new THREE.Mesh(g.build(), propMaterial); trail.receiveShadow = true; trail.matrixAutoUpdate = false; group.add(trail); }
  if (signs.p.length) { const sign = new THREE.Mesh(signs.build(), propMaterial); sign.castShadow = true; sign.matrixAutoUpdate = false; group.add(sign); }

  const cg = new GeoBuilder();
  const crng = mulberry32(7 + tx * 1000 + ty);
  const outcrops = []; // [x, y, z, yaw, sx, sy, sz] in tile-local coordinates
  for (const c of world.campsites) {
    if (!inside(c.x, c.z)) continue;
    const a = hash2(Math.round(c.x), Math.round(c.z), 5) * 6.28;
    // the fire ring sits a few metres back from the water, on the land side of the node
    const dir = tg.deeperDir(c.x, c.z);
    const fx = c.x - dir.x * (c.shore < 4 ? 6 : 0), fz = c.z - dir.z * (c.shore < 4 ? 6 : 0);
    const fy = H(fx, fz);
    const lfx = fx - ox, lfz = fz - oz;
    for (let i = 0; i < 9; i++) {
      const t = (i / 9) * 6.28;
      cg.blob(lfx + Math.cos(t) * 0.75, fy + 0.05, lfz + Math.sin(t) * 0.75, 0.22 + crng() * 0.1, vary(0x76736a, crng, 0.1), crng, 0.4, 1.2, 0.7, 1);
    }
    // the iron fire grate every BWCA site has
    const gc = new THREE.Color(0x2a2a2a);
    cg.quad(V(fx - 0.35, fy + 0.3, fz - 0.25), V(fx + 0.35, fy + 0.3, fz - 0.25), V(fx + 0.35, fy + 0.3, fz + 0.25), V(fx - 0.35, fy + 0.3, fz + 0.25), gc, V(fx, fy - 2, fz));
    cg.quad(V(fx - 0.35, fy + 0.27, fz - 0.25), V(fx + 0.35, fy + 0.27, fz - 0.25), V(fx + 0.35, fy + 0.27, fz + 0.25), V(fx - 0.35, fy + 0.27, fz + 0.25), gc, V(fx, fy + 3, fz));
    for (const [lx, lz] of [[-0.3, -0.2], [0.3, -0.2], [-0.3, 0.2], [0.3, 0.2]]) cg.tube(cg.ring(lfx + lx, fy, lfz + lz, 0.02, 3, crng), cg.ring(lfx + lx, fy + 0.28, lfz + lz, 0.02, 3, crng), gc, new THREE.Vector3(lfx + lx, fy + 0.1, lfz + lz));
    // a couple of charred logs in the ring and a log bench
    cg.blob(lfx, fy + 0.1, lfz, 0.3, new THREE.Color(0x3b2a1e), crng, 0.3, 1.6, 0.5, 0.7);
    const bx = fx + Math.cos(a) * 2.6, bz = fz + Math.sin(a) * 2.6, by = H(bx, bz), lbx = bx - ox, lbz = bz - oz;
    cg.tube(cg.ring(lbx - Math.sin(a) * 1.2, by + 0.2, lbz + Math.cos(a) * 1.2, 0.2, 5, crng, 0.1), cg.ring(lbx + Math.sin(a) * 1.2, by + 0.2, lbz - Math.cos(a) * 1.2, 0.2, 5, crng, 0.1), vary(0x8a6a48, crng), new THREE.Vector3(lbx, by + 0.2, lbz));
    // granite outcrop between the fire ring and the water: smooth Shield rock slabs
    if (c.shore < 30) {
      const n = 2 + Math.floor(crng() * 3);
      for (let i = 0; i < n; i++) {
        const t = 2 + i * 2.6 + crng() * 1.5, side = (crng() - 0.5) * 7;
        const rx = fx + dir.x * t - dir.z * side, rz = fz + dir.z * t + dir.x * side;
        const oy = Math.max(H(rx, rz), tg.levelAt(rx, rz) + 0.2) - 0.6;
        const r = 2.2 + crng() * 2.2;
        outcrops.push(rx - ox, oy, rz - oz, crng() * 6.28, r * (1.3 + crng() * 0.6), r * (0.4 + crng() * 0.2), r * (1.0 + crng() * 0.5));
        if (crng() < 0.6) outcrops.push(rx - ox + (crng() - 0.5) * r, oy + 0.15, rz - oz + (crng() - 0.5) * r, crng() * 6.28, r * 0.6, r * 0.25, r * 0.55);
      }
    }
    // tent on the flattest nearby spot: an A-frame with a fly
    const ta = a + 2.2, tx_ = fx + Math.cos(ta) * 6, tz_ = fz + Math.sin(ta) * 6, ty_ = H(tx_, tz_) + 0.05;
    const yaw = crng() * 6.28, cx = Math.cos(yaw), sx = Math.sin(yaw);
    const P = (lx, ly, lz) => V(tx_ + lx * cx - lz * sx, ty_ + ly, tz_ + lx * sx + lz * cx);
    const tc = vary([0xd9752e, 0x4f8a5a, 0x3f6fae][Math.floor(crng() * 3)], crng, 0.08);
    const ref = P(0, -3, 0);
    const h = 1.35, w = 1.15, l = 1.3;
    cg.quad(P(-l, 0, -w), P(l, 0, -w), P(l, h, 0), P(-l, h, 0), tc, ref);
    cg.quad(P(-l, 0, w), P(l, 0, w), P(l, h, 0), P(-l, h, 0), tc, ref);
    cg.tri(P(l, 0, -w), P(l, 0, w), P(l, h, 0), tc.clone().offsetHSL(0, 0, -0.08), ref);
    cg.tri(P(-l, 0, -w), P(-l, 0, w), P(-l, h, 0), tc.clone().offsetHSL(0, 0, -0.08), ref);
  }
  if (cg.p.length) { const m = new THREE.Mesh(cg.build(), propMaterial); m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false; group.add(m); }
  const count = outcrops.length / 7;
  if (count) {
    const rocks = new THREE.InstancedMesh(outcropGeo, rockMaterial, count);
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
    rocks.matrixAutoUpdate = false;
    group.add(rocks);
  }
  return group;
}

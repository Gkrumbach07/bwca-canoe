import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GeoBuilder, vary } from './geobuilder.js';
import { mulberry32, hash2 } from './rng.js';
import { surfaceAt } from './terrain-build.js';
import { rockGeometry, makeRockMaterial, makeToonMaterial } from './rocks.js';
import { bakeOcclusion } from './occlusion.js';
import { outfitterName } from './outfitter.js';
import { SPECIES as SP, bedding } from './placement.js';

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

// Vegetation exclusion segments: [x1,z1,x2,z2,radius]. A negative radius is a lawn (placement.js): the
// trees and brush stay off it but the grass grows through.
export function exclusionsFor(world) {
  const segs = [];
  for (const p of world.portages) for (let i = 1; i < p.pts.length; i++) segs.push([p.pts[i - 1][0], p.pts[i - 1][1], p.pts[i][0], p.pts[i][1], 2.2]);
  for (const c of world.campsites) segs.push([c.x, c.z, c.x, c.z, 9]);
  for (const ep of world.entryPoints) segs.push([ep.x, ep.z, ep.x, ep.z, -36]); // the mown yard around an outfitter's dock
  return segs;
}

let propMaterial = null, rockMaterial = null, ledgeGeos = null;
function shared() {
  if (!propMaterial) {
    propMaterial = makeToonMaterial(); rockMaterial = makeRockMaterial();
    // the campsite ledges (rocks.js families): layered flats, and slanted rocks for the odd site
    ledgeGeos = [rockGeometry('slab', 11), rockGeometry('block', 12)];
  }
}

// A prop part with its occlusion baked into the vertex colour (occlusion.js, cheap settings) against a ground
// plane at y = ground (tile-local metres): the shack's walls darken into the yard, the dock's piles into the
// water and under its deck, the fire ring's stones into the ground, so they sit there instead of standing on
// it. The bake costs vertices x triangles, so each piece (a stone, the grate, the tent, the shack, a hull) is
// baked on its own and the pieces merged after: a tile's props bake in a few milliseconds.
function bakedPart(builder, ground) {
  const geo = builder.build();
  bakeOcclusion(geo, { rays: 10, reach: 1.4, ground, floor: 0.3 });
  underground(geo, ground, 0.4, 0.4);
  return geo;
}
// The bake sees nothing above a vertex that is under its own ground plane (a wall's foot, a stone's lower
// half), so those go dark here, over `depth` metres: the faces that run into the ground darken toward it.
function underground(geo, ground, floor, depth) {
  const pos = geo.getAttribute('position'), col = geo.getAttribute('color');
  for (let i = 0; i < pos.count; i++) {
    const d = pos.getY(i) - ground;
    if (d >= 0) continue;
    const t = Math.min(1, -d / depth), k = 1 - (1 - floor) * t * t * (3 - 2 * t);
    col.setXYZ(i, col.getX(i) * k, col.getY(i) * k, col.getZ(i) * k);
  }
  col.needsUpdate = true;
}
// One mesh of the props' look material from the parts that have any triangles.
function propMesh(geos) {
  const parts = geos.filter((g) => g && g.getAttribute('position').count);
  if (!parts.length) return null;
  const m = new THREE.Mesh(parts.length > 1 ? mergeGeometries(parts) : parts[0], propMaterial);
  m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false;
  return m;
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
  // what the walker cannot pass, in world coordinates (tiles.js hands them to player.js with the trunks):
  // circles { x, z, r } and boxes { x, z, ux, uz, hx, hz, box: true } with half extents hx along (ux, uz)
  const obstacles = [];
  group.userData.obstacles = obstacles;
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
      obstacles.push({ x, z, r: 0.1 });
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
  // an outfitter at every entry point landing: a dock, a shack with the name over the door, a canoe rack
  const built = [];
  for (const ep of world.entryPoints) if (inside(ep.x, ep.z)) built.push(...buildOutfitter(tg, ep, ox, oz, rng, group, obstacles));
  const sign = propMesh([signs.p.length ? signs.build() : null, ...built]);
  if (sign) group.add(sign);

  const crng = mulberry32(7 + tx * 1000 + ty);
  const camps = [], ledges = [[], []]; // the baked campsite parts; the ledge rocks' matrices, flats and slanted
  for (const c of world.campsites) {
    if (!inside(c.x, c.z)) continue;
    let cg = new GeoBuilder();
    const piece = (ground) => { camps.push(bakedPart(cg, ground)); cg = new GeoBuilder(); };
    const a = hash2(Math.round(c.x), Math.round(c.z), 5) * 6.28;
    // the fire ring sits a few metres back from the water, on the land side of the node
    const dir = tg.deeperDir(c.x, c.z);
    const fx = c.x - dir.x * (c.shore < 4 ? 6 : 0), fz = c.z - dir.z * (c.shore < 4 ? 6 : 0);
    const fy = H(fx, fz);
    const lfx = fx - ox, lfz = fz - oz;
    obstacles.push({ x: fx, z: fz, r: 1.0 });
    for (let i = 0; i < 9; i++) {
      const t = (i / 9) * 6.28;
      cg.blob(lfx + Math.cos(t) * 0.75, fy + 0.05, lfz + Math.sin(t) * 0.75, 0.22 + crng() * 0.1, vary(0x938b80, crng, 0.1), crng, 0.4, 1.2, 0.7, 1);
      piece(fy);
    }
    // the iron fire grate every BWCA site has
    const gc = new THREE.Color(0x2a2a2a);
    cg.quad(V(fx - 0.35, fy + 0.3, fz - 0.25), V(fx + 0.35, fy + 0.3, fz - 0.25), V(fx + 0.35, fy + 0.3, fz + 0.25), V(fx - 0.35, fy + 0.3, fz + 0.25), gc, V(fx, fy - 2, fz));
    cg.quad(V(fx - 0.35, fy + 0.27, fz - 0.25), V(fx + 0.35, fy + 0.27, fz - 0.25), V(fx + 0.35, fy + 0.27, fz + 0.25), V(fx - 0.35, fy + 0.27, fz + 0.25), gc, V(fx, fy + 3, fz));
    for (const [lx, lz] of [[-0.3, -0.2], [0.3, -0.2], [-0.3, 0.2], [0.3, 0.2]]) cg.tube(cg.ring(lfx + lx, fy, lfz + lz, 0.02, 3, crng), cg.ring(lfx + lx, fy + 0.28, lfz + lz, 0.02, 3, crng), gc, new THREE.Vector3(lfx + lx, fy + 0.1, lfz + lz));
    // a couple of charred logs in the ring and a log bench
    cg.blob(lfx, fy + 0.1, lfz, 0.3, new THREE.Color(0x3b2a1e), crng, 0.3, 1.6, 0.5, 0.7);
    piece(fy);
    const bx = fx + Math.cos(a) * 2.6, bz = fz + Math.sin(a) * 2.6, by = H(bx, bz), lbx = bx - ox, lbz = bz - oz;
    obstacles.push({ x: bx, z: bz, ux: -Math.sin(a), uz: Math.cos(a), hx: 1.2, hz: 0.25, box: true });
    cg.tube(cg.ring(lbx - Math.sin(a) * 1.2, by + 0.2, lbz + Math.cos(a) * 1.2, 0.2, 5, crng, 0.1), cg.ring(lbx + Math.sin(a) * 1.2, by + 0.2, lbz - Math.cos(a) * 1.2, 0.2, 5, crng, 0.1), vary(0x8a6a48, crng), new THREE.Vector3(lbx, by + 0.2, lbz));
    piece(by);
    // a granite ledge between the fire ring and the water (from a stream of its own; the draws the old slabs
    // took from crng are still taken, so the tent keeps its place and colour)
    if (c.shore < 30) {
      const n = 2 + Math.floor(crng() * 3);
      for (let i = 0; i < n; i++) { for (let k = 0; k < 7; k++) crng(); if (crng() < 0.6) { crng(); crng(); crng(); } }
      campLedge(tg, c, fx, fz, dir, ox, oz, H, ledges, obstacles);
    }
    // tent on the flattest nearby spot: an A-frame with a fly
    const ta = a + 2.2, tx_ = fx + Math.cos(ta) * 6, tz_ = fz + Math.sin(ta) * 6, ty_ = H(tx_, tz_) + 0.05;
    const yaw = crng() * 6.28, cx = Math.cos(yaw), sx = Math.sin(yaw);
    const P = (lx, ly, lz) => V(tx_ + lx * cx - lz * sx, ty_ + ly, tz_ + lx * sx + lz * cx);
    const tc = vary([0xd9752e, 0x4f8a5a, 0x3f6fae][Math.floor(crng() * 3)], crng, 0.08);
    const ref = P(0, -3, 0);
    const h = 1.35, w = 1.15, l = 1.3;
    obstacles.push({ x: tx_, z: tz_, ux: cx, uz: sx, hx: l, hz: w, box: true });
    cg.quad(P(-l, 0, -w), P(l, 0, -w), P(l, h, 0), P(-l, h, 0), tc, ref);
    cg.quad(P(-l, 0, w), P(l, 0, w), P(l, h, 0), P(-l, h, 0), tc, ref);
    cg.tri(P(l, 0, -w), P(l, 0, w), P(l, h, 0), tc.clone().offsetHSL(0, 0, -0.08), ref);
    cg.tri(P(-l, 0, -w), P(-l, 0, w), P(-l, h, 0), tc.clone().offsetHSL(0, 0, -0.08), ref);
    piece(ty_ - 0.05);
  }
  const camp = propMesh(camps);
  if (camp) group.add(camp);
  ledges.forEach((ms, k) => {
    if (!ms.length) return;
    const rocks = new THREE.InstancedMesh(ledgeGeos[k], rockMaterial, ms.length);
    ms.forEach((m, i) => rocks.setMatrixAt(i, m));
    rocks.instanceMatrix.needsUpdate = true;
    rocks.castShadow = true; rocks.receiveShadow = true;
    rocks.computeBoundingSphere();
    rocks.matrixAutoUpdate = false;
    group.add(rocks);
  });
  // The fallen trunks, stumps and granite outcrops the worker placed with the trees (placement.js) hold the
  // walker off too: a trunk as a box along its length (vegetation.js builds it 6.4–7.2 m along local x), a
  // stump and an outcrop as circles of their scale that a carried canoe rides over (rock). They are read from
  // the tile's vegetation meshes (one per bin, holding all of its instances), which tiles.js makes before it
  // builds the props.
  const entry = world.tiles && world.tiles.tiles && world.tiles.tiles.get(`${tx},${ty}`);
  if (entry && entry.veg) for (const mesh of entry.veg) {
    const sp = mesh.userData.sp;
    if (sp !== SP.log && sp !== SP.stump && sp !== SP.outcrop) continue;
    const m = mesh.instanceMatrix.array, log = sp === SP.log, foot = sp === SP.stump ? 0.3 : 0.95;
    for (let i = 0; i < mesh.instanceMatrix.count; i++) {
      const o = i * 16, sx = Math.hypot(m[o], m[o + 1], m[o + 2]), sz = Math.hypot(m[o + 8], m[o + 9], m[o + 10]);
      const x = m[o + 12] + ox, z = m[o + 14] + oz;
      if (log) obstacles.push({ x, z, ux: m[o] / sx, uz: m[o + 2] / sx, hx: 3.4 * sx, hz: 0.36 * sz, box: true });
      else obstacles.push({ x, z, r: foot * sx, rock: true });
    }
  }
  return group;
}

// The granite ledge of a campsite, between the fire ring (fx, fz) and the water (dir points out to it): two or
// three stacks of layered flats lying along the slope, or now and then a group of slanted rocks at one tilt
// standing off to one side so the way from the landing to the fire stays open (those hold the walker off, the
// low flats are walked over). Matrices go to ledges[0] (flats) and ledges[1] (slanted), tile-local.
function campLedge(tg, c, fx, fz, dir, ox, oz, H, ledges, obstacles) {
  const r = mulberry32((hash2(Math.round(c.x), Math.round(c.z), 13) * 4294967296) >>> 0);
  const m4 = (x, y, z, az, tilt, spin, s, sq = 1) => new THREE.Matrix4().makeRotationY(az)
    .multiply(new THREE.Matrix4().makeRotationZ(tilt)).multiply(new THREE.Matrix4().makeRotationY(spin))
    .scale(new THREE.Vector3(s * sq, s, s * (2 - sq))).setPosition(x - ox, y, z - oz);
  const kx = -dir.z, kz = dir.x; // along the shore
  if (r() < 0.25) {
    const az = r() * Math.PI * 2, tilt = 0.3 + r() * 0.35, side = r() < 0.5 ? -1 : 1, n = 3 + Math.floor(r() * 3);
    const bury = Math.max(0.05, 0.6 * Math.cos(tilt) - 0.9 * Math.sin(tilt) + 0.05);
    let o = 3 + r() * 1.5;
    for (let i = 0; i < n; i++) {
      const s = i === 0 ? 1.2 + r() * 0.7 : 0.6 + r() * 0.7, t = 3.5 + r() * 2;
      const x = fx + dir.x * t + kx * side * o, z = fz + dir.z * t + kz * side * o;
      o += s * (1.1 + r() * 0.5);
      if (tg.shoreAt(x, z) < -1.5) continue;
      ledges[1].push(m4(x, H(x, z) - s * bury, z, az, tilt, (r() - 0.5) * 0.12, s, 0.85 + r() * 0.3));
      if (s > 0.75) obstacles.push({ x, z, r: 0.8 * s, rock: true });
    }
    return;
  }
  const n = 2 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const t = 2.5 + i * 2.8 + r() * 1.5, side = (r() - 0.5) * 7, s = 1.1 + r() * 1.0;
    const x = fx + dir.x * t + kx * side, z = fz + dir.z * t + kz * side;
    if (tg.shoreAt(x, z) < -1.5) continue;
    const bed = bedding(tg, x, z), tilt = Math.min(0.4, bed.angle * 0.85);
    const sink = s * (0.03 + Math.max(0, Math.tan(bed.angle) - Math.tan(tilt)) * 1.1);
    ledges[0].push(m4(x, H(x, z) - sink, z, bed.angle < 0.04 ? r() * Math.PI * 2 : bed.az, tilt, r() * Math.PI * 2, s, 0.85 + r() * 0.3));
  }
}

// --- outfitters ------------------------------------------------------------------------------------------------
const signCache = new Map();
function signMaterial(name) {
  let m = signCache.get(name);
  if (m) return m;
  const c = document.createElement('canvas'); c.width = 512; c.height = 112;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#efe3c6'; ctx.fillRect(0, 0, 512, 112);
  ctx.strokeStyle = '#6b4f2e'; ctx.lineWidth = 6; ctx.strokeRect(6, 6, 500, 100);
  ctx.fillStyle = '#3a2a1a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let size = 46; ctx.font = `600 ${size}px Georgia, "Times New Roman", serif`;
  while (ctx.measureText(name).width > 468 && size > 18) { size -= 2; ctx.font = `600 ${size}px Georgia, "Times New Roman", serif`; }
  ctx.fillText(name, 256, 58);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  m = makeToonMaterial({ vertexColors: false, map: tex, side: THREE.DoubleSide });
  signCache.set(name, m);
  return m;
}

// A dock out from the landing, planks on piles; the shack nine metres back with its door to the lake and the
// outfitter's name on a board above it; two canoes on a rack beside. All of it stands on the shaped surface.
// Returns its pieces (the dock, the shack, the rack, the hulls) as geometries with their occlusion baked, the
// dock's against the water, the rest against the ground under the shack.
function buildOutfitter(tg, ep, ox, oz, rng, group, obstacles) {
  let g = new GeoBuilder();
  const V = (x, y, z) => new THREE.Vector3(x - ox, y, z - oz);
  const H = (x, z) => surfaceAt(tg, x, z);
  // the shore: from the landing (usually a little way out on the water) up onto dry ground, then back to the edge
  let x = ep.x, z = ep.z, d = tg.deeperDir(x, z);
  for (let i = 0; i < 300 && tg.shoreAt(x, z) < 1.0; i++) { x -= d.x * 0.5; z -= d.z * 0.5; if (i % 10 === 9) d = tg.deeperDir(x, z); }
  for (let i = 0; i < 300 && tg.shoreAt(x, z) > 1.2; i++) { x += d.x * 0.5; z += d.z * 0.5; if (i % 10 === 9) d = tg.deeperDir(x, z); }
  d = tg.deeperDir(x, z);
  const nx = -d.z, nz = d.x, level = tg.levelAt(x, z), deckY = level + 0.45;
  const pile = vary(0x5e4630, rng, 0.05), stringer = vary(0x6e5236, rng, 0.05);
  const hw = 0.85, back = -1.6, len = 10;
  obstacles.push({ x: x + d.x * (back + len) / 2, z: z + d.z * (back + len) / 2, ux: d.x, uz: d.z, hx: (len - back) / 2, hz: hw, box: true });
  for (let s = back; s < len; s += 0.34) {
    const s1 = s + 0.27;
    g.quad(V(x + d.x * s + nx * hw, deckY, z + d.z * s + nz * hw), V(x + d.x * s1 + nx * hw, deckY, z + d.z * s1 + nz * hw),
      V(x + d.x * s1 - nx * hw, deckY, z + d.z * s1 - nz * hw), V(x + d.x * s - nx * hw, deckY, z + d.z * s - nz * hw), vary(0x8c6b47, rng, 0.09), V(x + d.x * s, deckY - 3, z + d.z * s));
  }
  for (const side of [-1, 1]) {
    const a = hw - 0.16, b = hw - 0.04;
    const Q = (s, t, y) => V(x + d.x * s + nx * side * t, y, z + d.z * s + nz * side * t);
    const ref = V(x + d.x * (len / 2), deckY - 0.1, z + d.z * (len / 2));
    g.quad(Q(back, a, deckY - 0.2), Q(len, a, deckY - 0.2), Q(len, a, deckY - 0.02), Q(back, a, deckY - 0.02), stringer, ref);
    g.quad(Q(back, b, deckY - 0.2), Q(len, b, deckY - 0.2), Q(len, b, deckY - 0.02), Q(back, b, deckY - 0.02), stringer, ref);
    for (let s = back + 0.6; s < len; s += 2.4) {
      const px = x + d.x * s + nx * side * (hw - 0.1), pz = z + d.z * s + nz * side * (hw - 0.1);
      const bed = Math.min(H(px, pz), level - 0.2) - 0.3;
      g.tube(g.ring(px - ox, bed, pz - oz, 0.09, 5, rng), g.ring(px - ox, deckY + 0.12, pz - oz, 0.08, 5, rng), pile, new THREE.Vector3(px - ox, deckY - 1, pz - oz));
    }
  }
  const parts = [bakedPart(g, level)];
  g = new GeoBuilder();
  // the shack
  const sx = x - d.x * 9, sz = z - d.z * 9;
  const P = (a, y, b) => V(sx + d.x * b + nx * a, y, sz + d.z * b + nz * a);
  const W = 1.9, D = 1.5, wallH = 2.3, ov = 0.4;
  obstacles.push({ x: sx, z: sz, ux: d.x, uz: d.z, hx: D, hz: W, box: true });
  const corners = [[-W, -D], [W, -D], [W, D], [-W, D]];
  let floor = -Infinity, yard = 0;
  for (const [a, b] of corners) { const h = H(sx + d.x * b + nx * a, sz + d.z * b + nz * a); floor = Math.max(floor, h); yard += h / 4; }
  floor += 0.08;
  const y0 = floor - 0.9, y1 = floor + wallH, yr = y1 + 1.15;
  const wall = vary(0x7a5636, rng, 0.05), wall2 = wall.clone().offsetHSL(0, 0, -0.05), roof = vary(0x4b5a44, rng, 0.05), trim = vary(0xe9dcbf, rng, 0.03);
  const door = new THREE.Color(0x3c2a1c), glass = new THREE.Color(0x9fb8c4), ref = P(0, floor + 1, 0);
  // each wall in rows (under the ground, the foot, the rest) so the baked occlusion darkens it at the ground line
  const rows = [y0, floor, floor + 0.6, y1];
  for (let i = 0; i < 4; i++) {
    const [a0, b0] = corners[i], [a1, b1] = corners[(i + 1) % 4];
    for (let r = 0; r < 3; r++) g.quad(P(a0, rows[r], b0), P(a1, rows[r], b1), P(a1, rows[r + 1], b1), P(a0, rows[r + 1], b0), i % 2 ? wall2 : wall, ref);
  }
  g.tri(P(-W, y1, D), P(W, y1, D), P(0, yr, D), trim, ref);
  g.tri(P(-W, y1, -D), P(W, y1, -D), P(0, yr, -D), trim, ref);
  const eave = y1 - (yr - y1) * (ov / W), refRoof = P(0, floor, 0);
  g.quad(P(-W - ov, eave, D + ov), P(0, yr + 0.02, D + ov), P(0, yr + 0.02, -D - ov), P(-W - ov, eave, -D - ov), roof, refRoof);
  g.quad(P(W + ov, eave, D + ov), P(0, yr + 0.02, D + ov), P(0, yr + 0.02, -D - ov), P(W + ov, eave, -D - ov), roof, refRoof);
  g.quad(P(-0.45, floor, D + 0.02), P(0.45, floor, D + 0.02), P(0.45, floor + 1.95, D + 0.02), P(-0.45, floor + 1.95, D + 0.02), door, ref);
  g.quad(P(-1.55, floor + 1.1, D + 0.02), P(-0.85, floor + 1.1, D + 0.02), P(-0.85, floor + 1.7, D + 0.02), P(-1.55, floor + 1.7, D + 0.02), glass, ref);
  g.quad(P(0.85, floor + 1.1, D + 0.02), P(1.55, floor + 1.1, D + 0.02), P(1.55, floor + 1.7, D + 0.02), P(0.85, floor + 1.7, D + 0.02), glass, ref);
  // the stoop
  const stoop = vary(0x8c6b47, rng, 0.06), refS = P(0, floor - 1, D + 0.6);
  g.quad(P(-0.8, floor - 0.02, D), P(0.8, floor - 0.02, D), P(0.8, floor - 0.02, D + 1.1), P(-0.8, floor - 0.02, D + 1.1), stoop, refS);
  g.quad(P(-0.8, floor - 0.35, D + 1.1), P(0.8, floor - 0.35, D + 1.1), P(0.8, floor - 0.02, D + 1.1), P(-0.8, floor - 0.02, D + 1.1), stoop.clone().offsetHSL(0, 0, -0.06), refS);
  // the name over the door
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.57), signMaterial(outfitterName(ep)));
  sign.position.set(sx + d.x * (D + 0.06) - ox, y1 - 0.42, sz + d.z * (D + 0.06) - oz);
  sign.rotation.y = Math.atan2(d.x, d.z);
  sign.matrixAutoUpdate = false; sign.updateMatrix();
  group.add(sign);
  parts.push(bakedPart(g, yard));
  g = new GeoBuilder();
  // the canoe rack beside the shack: two trestles and two hulls
  const ra = W + 2.6, post = vary(0x6e5236, rng, 0.05);
  obstacles.push({ x: sx + nx * ra, z: sz + nz * ra, ux: d.x, uz: d.z, hx: 2.4, hz: 0.7, box: true });
  for (const b of [-1.4, 1.4]) {
    const px = sx + d.x * b + nx * ra, pz = sz + d.z * b + nz * ra, py = H(px, pz);
    for (const side of [-0.55, 0.55]) g.tube(g.ring(px + nx * side - ox, py - 0.3, pz + nz * side - oz, 0.06, 4, rng), g.ring(px + nx * side - ox, py + 1.5, pz + nz * side - oz, 0.05, 4, rng), post, new THREE.Vector3(px - ox, py + 0.6, pz - oz));
    for (const h of [0.7, 1.4]) g.tube(g.ring(px - nx * 0.7 - ox, py + h, pz - nz * 0.7 - oz, 0.045, 4, rng), g.ring(px + nx * 0.7 - ox, py + h, pz + nz * 0.7 - oz, 0.045, 4, rng), post, new THREE.Vector3(px - ox, py + h - 1, pz - oz));
  }
  const cx = sx + nx * ra, cz = sz + nz * ra, cy = H(cx, cz);
  for (const [h, col] of [[0.92, 0xd8b063], [1.62, 0x4f8a5a]]) {
    // the hull: a stretched blob turned to lie along the rack, built in a local frame and rotated by hand
    const hull = new GeoBuilder();
    hull.blob(0, 0, 0, 0.5, vary(col, rng, 0.04), rng, 0.08, 4.8, 0.5, 1.0);
    const yaw = Math.atan2(-d.z, d.x);
    for (let i = 0; i < hull.p.length; i += 3) {
      const lx = hull.p[i], lz = hull.p[i + 2];
      hull.p[i] = cx - ox + lx * Math.cos(yaw) + lz * Math.sin(yaw); hull.p[i + 1] += cy + h; hull.p[i + 2] = cz - oz - lx * Math.sin(yaw) + lz * Math.cos(yaw);
      const nx_ = hull.n[i], nz_ = hull.n[i + 2];
      hull.n[i] = nx_ * Math.cos(yaw) + nz_ * Math.sin(yaw); hull.n[i + 2] = -nx_ * Math.sin(yaw) + nz_ * Math.cos(yaw);
    }
    parts.push(bakedPart(hull, yard));
  }
  parts.push(bakedPart(g, yard));
  return parts;
}

// --- lost-and-found items for the task board: small, flat-coloured, sitting on y = 0 ------------------------------
export function buildItemProp(kind, seed = 1) {
  shared();
  const rng = mulberry32(100 + seed), g = new GeoBuilder();
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  if (kind === 'paddle') {
    // a paddle lying across the rocks, grip up on a stone, blade down at the water
    const wood = vary(0xb98a52, rng, 0.05), grip = vary(0x3a2a1e, rng, 0.05), blade = vary(0xd9c27a, rng, 0.05);
    g.tube(g.ring(-0.75, 0.16, 0, 0.022, 5, rng), g.ring(0.55, 0.05, 0, 0.022, 5, rng), wood, V(0, 0.1, 0));
    g.blob(-0.78, 0.16, 0, 0.05, grip, rng, 0.1, 1, 0.7, 1.7);
    const b0 = V(0.55, 0.05, -0.09), b1 = V(0.55, 0.05, 0.09), b2 = V(1.0, 0.02, 0.11), b3 = V(1.0, 0.02, -0.11);
    g.quad(b0, b1, b2, b3, blade, V(0.8, -1, 0)); g.quad(b0, b1, b2, b3, blade, V(0.8, 1, 0));
  } else if (kind === 'locket') {
    // a gold locket and a loop of chain on the rock
    const gold = new THREE.Color(0xe8be4c), chain = new THREE.Color(0xcfa93e);
    g.blob(0, 0.05, 0, 0.07, gold, rng, 0.12, 1, 0.5, 1);
    for (let i = 0; i < 14; i++) { const a = (i / 14) * 6.28; g.blob(Math.cos(a) * 0.13, 0.012, Math.sin(a) * 0.13 + 0.07, 0.013, chain, rng, 0.2); }
  } else {
    // a roll-top dry bag
    const bag = vary(0x2f6fb8, rng, 0.05), top = new THREE.Color(0x1f1f24), buckle = new THREE.Color(0x9fa3a8), ref = V(0, 0.25, 0);
    const r0 = g.ring(0, 0, 0, 0.2, 8, rng, 0.05), r1 = g.ring(0, 0.3, 0, 0.21, 8, rng, 0.05), r2 = g.ring(0, 0.46, 0, 0.17, 8, rng, 0.05), r3 = g.ring(0, 0.52, 0, 0.09, 8, rng, 0.05);
    g.tube(r0, r1, bag, ref); g.tube(r1, r2, bag, ref); g.tube(r2, r3, top, ref);
    g.fan(V(0, 0.54, 0), r3, top, ref); g.fan(V(0, -0.02, 0), r0, bag, ref);
    g.blob(0, 0.5, 0.1, 0.03, buckle, rng, 0.1, 1.6, 0.6, 1);
  }
  const m = new THREE.Mesh(g.build(), propMaterial);
  m.castShadow = true; m.name = `item ${kind}`;
  return m;
}

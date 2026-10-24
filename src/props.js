import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, hash2 } from './rng.js';
import { surfaceAt, meshHeightAt } from './terrain-build.js';
import { rockGeometry, makeRockMaterial, makeToonMaterial } from './rocks.js';
import { outfitterName } from './outfitter.js';
import { bedding, seatRock, ROCK_FOOT, ROCK_KIND } from './placement.js';
import { RockShape } from './collide.js';
import { TILE, PropBuilder, propMaterial, trailMaterial, occlude, obb, bakeSelf, MeshGround, buildHull, hullProfile, chunkStone, HULL_LENGTH } from './prop-kit.js';

// The built things: portage trails and their signs, campsites, and at every entry point an outfitter's dock,
// shack and canoe rack, plus the lost-and-found items of the task board. Simple shapes put together the way
// they would be built (planks with gaps on stringers and caps on piles, a shack with a roof over its walls
// and frames round its openings, a split log on two rounds), worn (boards out of line, paint back to grey
// wood, a dark band on the piles at the waterline), on one material from prop-kit.js and grounded by
// occlusion baked into them. Everything stands on the terrain mesh as it is drawn (tiles.js groundAt).

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const C = (hex) => new THREE.Color(hex);
const tone = (hex, rng, dl = 0.05, dh = 0.012) => new THREE.Color(hex).offsetHSL((rng() - 0.5) * dh, 0, (rng() - 0.5) * dl);
const sm = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

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

let rockMaterial = null, ledgeGeos = null;
function shared() {
  if (!rockMaterial) {
    rockMaterial = makeRockMaterial();
    // the campsite ledges (rocks.js families): layered flats, and slanted rocks for the odd site
    ledgeGeos = [rockGeometry('slab', 11), rockGeometry('block', 12)];
  }
}

// The height of the drawn ground at world (x, z) (tasks.js sets the lost items on it): the game's ground query,
// tiles.js TileManager.groundAt; without the tiles, the smooth field.
export function groundAt(world, x, z) {
  return world.tiles && world.tiles.groundAt ? world.tiles.groundAt(x, z) : surfaceAt(world, x, z);
}

// One mesh of the props' material from the baked pieces.
function propMesh(geos) {
  const parts = geos.filter((g) => g && g.getAttribute('position').count);
  if (!parts.length) return null;
  const m = new THREE.Mesh(parts.length > 1 ? mergeGeometries(parts) : parts[0], propMaterial());
  m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false; m.name = 'props built';
  return m;
}

// Portage trails, trail signs, campsites and outfitters that fall inside tile (tx, ty), built in tile-local
// coordinates from the tile's own halo'd grid (tg) so they never wait for a neighbour.
export function buildTileProps(tg, world, tx, ty) {
  const it = tilePropsSteps(tg, world, tx, ty);
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}
// The same a piece at a time: a generator that yields after each trail, outfitter and campsite (an outfitter's yard
// with its occlusion bakes is the most of 20 ms) and returns the group, so tiles.js can spread a tile's props over a
// few frames under a time budget.
export function* tilePropsSteps(tg, world, tx, ty) {
  shared();
  const [ox, oz] = world.tileOrigin(tx, ty), size = world.tileMetres;
  const inside = (x, z) => x >= ox && x < ox + size && z >= oz && z < oz + size;
  const group = new THREE.Group();
  group.name = 'props';
  // what the walker cannot pass, in world coordinates (tiles.js hands them to player.js with the trunks):
  // circles { x, z, r } and boxes { x, z, ux, uz, hx, hz, box: true } with half extents hx along (ux, uz)
  const obstacles = [];
  group.userData.obstacles = obstacles;
  // The drawn ground: tiles.js registers this tile's terrain mesh (entry.ground) before it builds the props, so
  // the game's ground query reads it, the neighbour's mesh where a piece reaches over the seam (the first half
  // cell of a tile is its neighbour's last quad), and this tile's grid (meshHeightAt) where that is not in yet.
  const tiles = world.tiles && world.tiles.groundAt ? world.tiles : null;
  const entry = tiles && tiles.tiles.get(`${tx},${ty}`);
  let mg = entry && entry.ground ? entry.ground : null, mgTried = !!mg;
  const mesh = () => {
    if (!mgTried) { mgTried = true; const t = entry && entry.result && entry.result.terrain; if (t && t.pos && t.idx) mg = new MeshGround(t, tg.cell, tg.tileSize); }
    return mg;
  };
  const H = tiles ? (x, z) => tiles.groundAt(x, z, tg) : (x, z) => {
    const m = mesh(); if (m) { const y = m.height(x - ox, z - oz); if (y === y) return y; }
    return meshHeightAt(tg, x, z);
  };
  // the terrain triangle under world (x, z), on whichever installed tile draws it: { mesh, hit } or null
  const locate = (x, z) => {
    const g = tiles ? tiles.locate(x, z) : mesh() && { mesh: mg, ox, oz };
    const hit = g && g.mesh.locate(x - g.ox, z - g.oz);
    return hit ? { mesh: g.mesh, hit } : null;
  };
  if (entry) clearYards(entry, yards, size); // the yards of stores built before this tile came in
  const ctx = { tg, world, ox, oz, H, locate, obstacles, inside, entry };
  const pieces = [];
  const rng = mulberry32(42 + tx * 1000 + ty);

  const decal = new TrailDecal();
  for (const p of world.portages) {
    const [bx0, bz0, bx1, bz1] = p.bbox;
    if (bx1 < ox - 4 || bx0 > ox + size + 4 || bz1 < oz - 4 || bz0 > oz + size + 4) continue;
    buildTrail(ctx, p, decal, pieces);
    yield;
  }
  decal.lift(ctx);
  const trail = decal.mesh();
  if (trail) group.add(trail);

  for (const ep of world.entryPoints) if (inside(ep.x, ep.z)) { yield; yield* buildOutfitter(ctx, ep, rng, pieces, group); yield; }

  const ledges = [[], []]; // the ledge rocks' matrices, flats and slanted
  for (const c of world.campsites) if (inside(c.x, c.z)) { buildCampsite(ctx, c, pieces, ledges); yield; }

  const built = propMesh(pieces);
  if (built) group.add(built);
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
  // (The fallen trunks and stumps the worker placed with the trees hold the walker off by their own drawn geometry,
  // as the rocks do: tile-worker.js collisionOf, tiles.js treesNear.)
  flushStoreNews(); // the stores built here are told of once the tile is in, with its obstacles
  return group;
}

// The ground as a function of tile-local (x, z), for the occlusion bake.
const localGround = (ctx) => (x, z) => ctx.H(x + ctx.ox, z + ctx.oz);

// A frame at world (x, z) facing d (unit xz): local (a, y, b) is a to the right of someone looking along -d
// back at it, y the absolute height, b along d. X, Y, Z are its axes as world vectors (right-handed).
function frame(ctx, x, z, d) {
  const X = V(d.z, 0, -d.x), Y = V(0, 1, 0), Z = V(d.x, 0, d.z), { ox, oz } = ctx;
  return {
    X, Y, Z,
    W: (a, b) => [x + X.x * a + Z.x * b, z + X.z * a + Z.z * b],
    P: (a, y, b) => V(x - ox + X.x * a + Z.x * b, y, z - oz + X.z * a + Z.z * b),
    D: (a, y, b) => V(X.x * a + Z.x * b, y, X.z * a + Z.z * b).normalize(),
    G: (a, b) => { const [wx, wz] = [x + X.x * a + Z.x * b, z + X.z * a + Z.z * b]; return ctx.H(wx, wz); },
  };
}
// a stone (prop-kit.js chunkStone, about two units across) at tile-local p, scaled (s, s * up, s * deep) and
// turned yaw, granite grey unless tinted
function stone(b, p, s, yaw, rng, { up = 1.6, deep = 1.15, tilt = 0, tint = null } = {}) {
  const m = new THREE.Matrix4().makeRotationY(yaw).multiply(new THREE.Matrix4().makeRotationZ(tilt)).scale(V(s, s * up * 0.62, s * deep * 0.9)).setPosition(p);
  chunkStone(b, m, rng, tint || tone(0x8e8780, rng, 0.08, 0.02));
}

// --- portage trails ---------------------------------------------------------------------------------------------
// The path as a decal over the drawn ground: rows across it every 1.6 m, five vertices a row from margin to
// margin, each carrying the terrain's splat weights, floor and normal at that point (so the shader paints the
// ground under it exactly and wears the middle down to soil), and where it is across the path, how far it
// has faded (at the ends and at the water) and how worn its middle is. Indexed, one mesh a tile.
const ACROSS = [-1, -0.55, 0, 0.55, 1];
class TrailDecal {
  constructor() { this.p = []; this.n = []; this.sa = []; this.sb = []; this.fl = []; this.tr = []; this.ix = []; this.rows = 0; }
  // a row: centre (world x, z), unit normal (nx, nz), half width, fade, wear; returns its row index
  row(ctx, x, z, nx, nz, hw, fade, wear) {
    const f4 = [0, 0, 0, 0], n3 = [0, 1, 0], p3 = [0, 0, 0];
    for (const t of ACROSS) {
      const px = x + nx * t * hw, pz = z + nz * t * hw, lx = px - ctx.ox, lz = pz - ctx.oz;
      const at = ctx.locate(px, pz); // this tile's mesh, or the neighbour's over the seam
      let y;
      if (at) {
        const m = at.mesh;
        y = m.interp(m.t.pos, 3, p3)[1];
        m.interp(m.t.nrm, 3, n3, 1 / 127); this.n.push(n3[0], n3[1], n3[2]);
        m.interp(m.t.splatA, 4, f4, 1 / 255); this.sa.push(...f4);
        m.interp(m.t.splatB, 4, f4, 1 / 255); this.sb.push(...f4);
        m.interp(m.t.floor, 4, f4, 1 / 255); this.fl.push(...f4);
        y += 0.02;
      } else {
        y = ctx.H(px, pz) + 0.03;
        this.n.push(0, 1, 0); this.sa.push(1, 0, 0, 0); this.sb.push(0, 0, 0, 0); this.fl.push(0, 0, 0, 0);
      }
      this.p.push(lx, y, lz);
      this.tr.push(t, 0, fade, wear);
    }
    return this.rows++;
  }
  join(r0, r1) {
    const k = ACROSS.length;
    for (let i = 0; i < k - 1; i++) { const a = r0 * k + i, b = r0 * k + i + 1, c = r1 * k + i + 1, d = r1 * k + i; this.ix.push(a, b, d, b, c, d); }
  }
  // A straight span of the decal cuts under the ground where a terrain crease runs across it (the shore band's
  // bumps fold the mesh every 5 m): every triangle is tested at its edge midpoints and centre, and its corners
  // raised by however far the ground pokes through, twice over.
  lift(ctx) {
    const P = this.p, I = this.ix, ox = ctx.ox, oz = ctx.oz;
    if (!I.length) return;
    const y = (i) => P[i * 3 + 1];
    for (let pass = 0; pass < 2; pass++) {
      const up = new Float32Array(P.length / 3);
      for (let t = 0; t < I.length; t += 3) {
        const a = I[t], b = I[t + 1], c = I[t + 2];
        let need = 0;
        for (const [wa, wb, wc] of [[0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [1 / 3, 1 / 3, 1 / 3]]) {
          const x = P[a * 3] * wa + P[b * 3] * wb + P[c * 3] * wc, z = P[a * 3 + 2] * wa + P[b * 3 + 2] * wb + P[c * 3 + 2] * wc;
          const g = ctx.H(x + ox, z + oz);
          if (Number.isFinite(g)) need = Math.max(need, g + 0.015 - (y(a) * wa + y(b) * wb + y(c) * wc));
        }
        if (need > 0) for (const v of [a, b, c]) up[v] = Math.max(up[v], need);
      }
      for (let v = 0; v < up.length; v++) P[v * 3 + 1] += up[v];
    }
  }
  mesh() {
    if (!this.ix.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('aSplatA', new THREE.Float32BufferAttribute(this.sa, 4));
    g.setAttribute('aSplatB', new THREE.Float32BufferAttribute(this.sb, 4));
    g.setAttribute('aFloor', new THREE.Float32BufferAttribute(this.fl, 4));
    g.setAttribute('aTrail', new THREE.Float32BufferAttribute(this.tr, 4));
    g.setIndex(this.ix);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, trailMaterial());
    m.receiveShadow = true; m.castShadow = false; m.matrixAutoUpdate = false; m.name = 'trail';
    m.renderOrder = -1; // under the other see-through things (the water)
    return m;
  }
}
// The polyline with its corners rounded off (a fillet up to 2 m along each leg), so the path bends instead
// of kinking and its rows never fold over on the inside of a turn; it stays inside the vegetation's 2.2 m.
function rounded(pts) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], [cx, cz] = pts[i + 1];
    const l1 = Math.hypot(bx - ax, bz - az), l2 = Math.hypot(cx - bx, cz - bz), r = Math.min(2, l1 / 3, l2 / 3);
    const p0 = [bx + ((ax - bx) / l1) * r, bz + ((az - bz) / l1) * r], p2 = [bx + ((cx - bx) / l2) * r, bz + ((cz - bz) / l2) * r];
    for (let k = 0; k <= 4; k++) { const t = k / 4, u = 1 - t; out.push([u * u * p0[0] + 2 * u * t * bx + t * t * p2[0], u * u * p0[1] + 2 * u * t * bz + t * t * p2[1]]); }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
const n1 = (x, seed) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash2(i, seed, 7) * (1 - u) + hash2(i + 1, seed, 7) * u; };
function buildTrail(ctx, p, decal, pieces) {
  const { tg, inside, ox, oz } = ctx;
  const pts = p.trailPts || (p.trailPts = resample(rounded(p.pts), 1.6));
  const m = pts.length, cum = [0];
  for (let i = 1; i < m; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[m - 1], seed = Math.floor(hash2(Math.round(p.pts[0][0]), Math.round(p.pts[0][1]), 3) * 100000);
  const prng = mulberry32(seed + 17);
  // which rows this tile draws: a segment belongs to the tile holding its first point
  const want = new Uint8Array(m);
  for (let i = 0; i < m - 1; i++) if (inside(pts[i][0], pts[i][1])) { want[i] = 1; want[i + 1] = 1; }
  const rowOf = new Int32Array(m).fill(-1);
  const bits = new PropBuilder();
  for (let i = 0; i < m; i++) {
    if (!want[i]) continue;
    const [x, z] = pts[i], [xa, za] = pts[Math.max(0, i - 1)], [xb, zb] = pts[Math.min(m - 1, i + 1)];
    let dx = xb - xa, dz = zb - za; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const nx = -dz, nz = dx, s = cum[i];
    const meander = (n1(s / 7, seed) - 0.5) * 0.4, hw = 0.95 + 0.35 * (n1(s / 5 + 40, seed) - 0.5);
    const cx = x + nx * meander, cz = z + nz * meander, sd = tg.shoreAt(x, z);
    const fade = Math.min(sm(0, 3, s), sm(0, 3, total - s)) * sm(-0.2, 1.2, sd);
    const wear = 0.55 + 0.45 * Math.min(sm(0, 6, s), sm(0, 6, total - s)) * (0.8 + 0.2 * n1(s / 11 + 90, seed));
    rowOf[i] = decal.row(ctx, cx, cz, nx, nz, hw, fade, wear);
    if (i > 0 && rowOf[i - 1] >= 0 && want[i - 1] && inside(pts[i - 1][0], pts[i - 1][1])) decal.join(rowOf[i - 1], rowOf[i]);
    // roots and stones across the tread, sparse, never at the landings
    if (!inside(x, z) || s < 3 || total - s < 3 || sd < 2) continue;
    const r = prng();
    if (r < 0.045) {
      // a root crossing the path at a slant, half in the ground
      const ang = (prng() < 0.5 ? 1 : -1) * (0.5 + prng() * 0.6), ca = Math.cos(ang), sa = Math.sin(ang);
      const ux = dx * sa + nx * ca, uz = dz * sa + nz * ca, len = 1.3 + prng() * 0.9, rr = 0.025 + prng() * 0.02;
      const line = [];
      for (let k = 0; k <= 4; k++) {
        const t = k / 4 - 0.5, wob = (prng() - 0.5) * 0.08, px = cx + ux * t * len + dx * wob, pz = cz + uz * t * len + dz * wob;
        line.push(V(px - ox, ctx.H(px, pz) + rr * (0.25 + 0.2 * Math.sin(k * 1.7)) - 0.004, pz - oz));
      }
      bits.tube(line, (t) => rr * (1.15 - 0.4 * Math.abs(t - 0.5)), 5, TILE.BARK, tone(0x5b4a3b, prng, 0.08));
    } else if (r < 0.11) {
      const off = (prng() - 0.5) * 1.2, px = cx + nx * off, pz = cz + nz * off, s0 = 0.04 + prng() * 0.05;
      stone(bits, V(px - ox, ctx.H(px, pz) - s0 * 0.35, pz - oz), s0, prng() * 6.28, prng, { up: 1.3 });
    }
  }
  if (bits.count) { const g = bits.build(); occlude(g, [], { ground: localGround(ctx), rays: 6, reach: 0.3, floor: 0.5, bury: 0.05 }); pieces.push(g); }
  // a sign at each landing: a short post with a routed board, beside the path, facing the water
  for (const end of [0, 1]) {
    const e = end ? p.pts[p.pts.length - 1] : p.pts[0];
    if (!inside(e[0], e[1])) continue;
    pieces.push(portageSign(ctx, pts, end, seed + end));
  }
}
function portageSign(ctx, pts, end, seed) {
  const m = pts.length, idx = (k) => (end ? m - 1 - k : k), rng = mulberry32(seed);
  // up the path from the landing until the ground is dry and firm, at most ten rows
  let k = 0;
  while (k < Math.min(10, m - 2) && ctx.tg.shoreAt(pts[idx(k)][0], pts[idx(k)][1]) < 2.2) k++;
  const [x, z] = pts[idx(k)], [xn, zn] = pts[idx(k + 1)];
  let fx = x - xn, fz = z - zn; const L = Math.hypot(fx, fz) || 1; fx /= L; fz /= L; // facing out along the path, to the water
  const side = rng() < 0.5 ? 1 : -1, px = x + fz * side * 1.15, pz = z - fx * side * 1.15;
  const F = frame(ctx, px, pz, { x: fx, z: fz }), g = F.G(0, 0), b = new PropBuilder();
  ctx.obstacles.push({ x: px, z: pz, r: 0.15 });
  const post = tone(0x7f6851, rng, 0.06), top = g + 1.12, ref = F.P(0, g + 0.5, 0);
  b.box(F.P(0, (g - 0.35 + top) / 2, 0), F.X, F.Y, F.Z, 0.045, (top - g + 0.35) / 2, 0.045, TILE.WOOD, post, { grain: 'y', skip: ['+y'] });
  b.face([F.P(-0.045, top, -0.045), F.P(0.045, top, -0.045), F.P(0, top + 0.05, 0)], TILE.WOOD, post, { ref });
  b.face([F.P(0.045, top, -0.045), F.P(0.045, top, 0.045), F.P(0, top + 0.05, 0)], TILE.WOOD, post, { ref });
  b.face([F.P(0.045, top, 0.045), F.P(-0.045, top, 0.045), F.P(0, top + 0.05, 0)], TILE.WOOD, post, { ref });
  b.face([F.P(-0.045, top, 0.045), F.P(-0.045, top, -0.045), F.P(0, top + 0.05, 0)], TILE.WOOD, post, { ref });
  // the board on the post's face, a little proud of it, its face routed
  const by = top - 0.16, bb = 0.045 + 0.017, board = tone(0x75573d, rng, 0.04);
  b.box(F.P(0, by, bb), F.X, F.Y, F.Z, 0.29, 0.105, 0.017, TILE.WOOD, board, { grain: 'x', skip: ['+z'] });
  b.face([F.P(-0.29, by + 0.105, bb + 0.017), F.P(0.29, by + 0.105, bb + 0.017), F.P(0.29, by - 0.105, bb + 0.017), F.P(-0.29, by - 0.105, bb + 0.017)], TILE.SIGN, C(0xffffff),
    { ref: F.P(0, by, 0), uvs: [[0.02, 0.3], [0.98, 0.3], [0.98, 0.7], [0.02, 0.7]] });
  const geo = b.build();
  occlude(geo, [obb(F.P(0, (g + top) / 2, 0), F.X, F.Y, F.Z, 0.045, (top - g) / 2, 0.045)], { ground: localGround(ctx), rays: 8, reach: 0.6 });
  return geo;
}

// --- outfitters ------------------------------------------------------------------------------------------------
const signCache = new Map();
function signMaterial(name) {
  let m = signCache.get(name);
  if (m) return m;
  const c = document.createElement('canvas'); c.width = 512; c.height = 112;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e2d6b6'; ctx.fillRect(0, 0, 512, 112);
  for (let i = 0; i < 26; i++) { // the board's grain under the paint, and a little weather
    const y = (i * 41) % 112;
    ctx.strokeStyle = `rgba(120,95,60,${0.04 + (i % 4) * 0.015})`; ctx.lineWidth = 1 + (i % 3);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(160, y + 2, 340, y - 3, 512, y + 1); ctx.stroke();
  }
  ctx.strokeStyle = '#5e4429'; ctx.lineWidth = 6; ctx.strokeRect(8, 8, 496, 96);
  ctx.fillStyle = '#35261a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let size = 46; ctx.font = `600 ${size}px Georgia, "Times New Roman", serif`;
  while (ctx.measureText(name).width > 464 && size > 18) { size -= 2; ctx.font = `600 ${size}px Georgia, "Times New Roman", serif`; }
  ctx.fillText(name, 256, 58);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  m = makeToonMaterial({ vertexColors: false, map: tex, side: THREE.DoubleSide });
  signCache.set(name, m);
  return m;
}

// the store's painted signs inside: cream letters on a green board, a material per text (the name sign's program)
function shelfSignMaterial(text) {
  const key = `shelf:${text}`;
  let m = signCache.get(key);
  if (m) return m;
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#2f4537'; ctx.fillRect(0, 0, 512, 96);
  ctx.strokeStyle = '#d9cfae'; ctx.lineWidth = 4; ctx.strokeRect(10, 10, 492, 76);
  ctx.fillStyle = '#e6dcbc'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let size = 44; const font = () => `600 ${size}px Georgia, "Times New Roman", serif`;
  ctx.font = font();
  const spaced = text.split('').join('\u200a');
  while (ctx.measureText(spaced).width > 440 && size > 16) { size -= 2; ctx.font = font(); }
  ctx.fillText(spaced, 256, 51);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  m = makeToonMaterial({ vertexColors: false, map: tex, side: THREE.DoubleSide });
  signCache.set(key, m);
  return m;
}

// A dock out from the landing and, up the yard from it, the outfitter's store (buildStore) with its door to the
// lake and the outfitter's name over it, a canoe rack beside it. The frame: from the landing up onto dry ground and
// back to the edge, d out to the water.
function* buildOutfitter(ctx, ep, rng, pieces, group) {
  const tg = ctx.tg;
  let x = ep.x, z = ep.z, d = tg.deeperDir(x, z);
  for (let i = 0; i < 300 && tg.shoreAt(x, z) < 1.0; i++) { x -= d.x * 0.5; z -= d.z * 0.5; if (i % 10 === 9) d = tg.deeperDir(x, z); }
  for (let i = 0; i < 300 && tg.shoreAt(x, z) > 1.2; i++) { x += d.x * 0.5; z += d.z * 0.5; if (i % 10 === 9) d = tg.deeperDir(x, z); }
  d = tg.deeperDir(x, z);
  const F = frame(ctx, x, z, d), level = tg.levelAt(x, z);
  const dock = buildDock(ctx, F, level, rng);
  pieces.push(dock.geo);
  yield;
  yield* buildStore(ctx, F, rng, ep, group, pieces, dock);
}

// The dock: weathered cedar planks of uneven width and tone across three stringers, a few out of line;
// the stringers on cap beams bolted to pairs of round piles with a dark band at the waterline, braced along
// the sides; two posts at the end, cleats and a coil of line; the land end on a sill in the bank.
function buildDock(ctx, F, level, rng) {
  const b = new PropBuilder(), occ = [];
  const hw = 0.9, deckY = level + 0.55, pT = 0.045, strH = 0.18, capH = 0.12, len = 10.5;
  const strTop = deckY - pT, strBot = strTop - strH, capTop = strBot, capBot = capTop - capH;
  // the sill goes where the bank comes up under the stringers; the deck runs a little past it
  let sill = -6;
  for (let s = 0.8; s >= -6; s -= 0.1) if (Math.max(F.G(-hw, s), F.G(0, s), F.G(hw, s)) >= strBot - 0.17) { sill = s; break; }
  let back = sill - 0.3;
  if (Math.max(F.G(-hw, back), F.G(hw, back)) > deckY - 0.08) back = sill - 0.08;
  // the deck to the walker: a box with a top, stepped onto from the bank and held off from the water
  ctx.obstacles.push({ x: F.W(0, (back + len) / 2)[0], z: F.W(0, (back + len) / 2)[1], ux: F.Z.x, uz: F.Z.z, hx: (len - back) / 2, hz: hw, box: true, top: deckY });
  // planks
  const dryA = C(0x9d978b), dryB = C(0x8c7f6c);
  for (let s = back; s < len - 0.04;) {
    const w = 0.13 + rng() * 0.08, s1 = Math.min(len, s + w), mid = (s + s1) / 2;
    const off = rng() < 0.14 ? (rng() - 0.5) * 0.09 : (rng() - 0.5) * 0.016, yaw = rng() < 0.16 ? (rng() - 0.5) * 0.06 : (rng() - 0.5) * 0.01;
    const sag = rng() < 0.08 ? -0.008 - rng() * 0.008 : (rng() - 0.5) * 0.005, half = hw + (rng() - 0.5) * 0.04;
    const Xr = F.X.clone().multiplyScalar(Math.cos(yaw)).addScaledVector(F.Z, Math.sin(yaw)), Zr = F.Z.clone().multiplyScalar(Math.cos(yaw)).addScaledVector(F.X, -Math.sin(yaw));
    const col = dryA.clone().lerp(dryB, rng()).offsetHSL(0, (rng() - 0.5) * 0.04, (rng() - 0.5) * 0.07);
    b.box(F.P(off, deckY - pT / 2 + sag, mid), Xr, F.Y, Zr, half, pT / 2, (s1 - s) / 2, TILE.WOOD, col, { grain: 'x', skip: ['-y'], shift: [rng() * 4, rng() * 4] });
    s = s1 + 0.01 + rng() * 0.012;
  }
  occ.push(obb(F.P(0, deckY - pT / 2, (back + len) / 2), F.X, F.Y, F.Z, hw, pT / 2, (len - back) / 2));
  // stringers
  for (const a of [-hw + 0.1, 0, hw - 0.1]) b.box(F.P(a, strBot + strH / 2, (back + len) / 2), F.X, F.Y, F.Z, 0.025, strH / 2, (len - back) / 2, TILE.WOOD, tone(0x6f675b, rng), { grain: 'z', endTile: TILE.END });
  occ.push(obb(F.P(0, strBot + strH / 2, (back + len) / 2), F.X, F.Y, F.Z, hw - 0.12, strH / 2, (len - back) / 2));
  // bents: a cap beam on two piles every 2.3 m back from the end, while there is water under them
  const dry = C(0x857b6b), wet = C(0x4b4239), algae = C(0x3a4033);
  const colY = (y) => dry.clone().lerp(wet, sm(level + 0.28, level + 0.06, y)).lerp(algae, sm(level - 0.04, level - 0.32, y));
  const bents = [];
  for (let s = len - 0.25; s > sill + 0.8; s -= 2.3) bents.push(s);
  const pa = hw + 0.13;
  bents.forEach((s, k) => {
    b.box(F.P(0, capBot + capH / 2, s), F.X, F.Y, F.Z, pa + 0.1, capH / 2, 0.05, TILE.WOOD, tone(0x6a6255, rng), { grain: 'x', endTile: TILE.END });
    occ.push(obb(F.P(0, capBot + capH / 2, s), F.X, F.Y, F.Z, pa + 0.1, capH / 2, 0.05));
    for (const side of [-1, 1]) {
      const a = side * pa, bed = F.G(a, s) - 0.5, top = k === 0 ? deckY + 0.5 : deckY + 0.06;
      const la = (rng() - 0.5) * 0.07, lb = (rng() - 0.5) * 0.07;
      const ys = [bed, level - 0.36, level - 0.05, level + 0.06, level + 0.24, top].filter((y, i, arr) => i === 0 || i === arr.length - 1 || (y > bed + 0.02 && y < top - 0.02));
      const ts = ys.map((y) => (y - bed) / (top - bed));
      b.cyl(F.P(a - la, bed, s - lb), F.P(a + la * 0.3, top, s + lb * 0.3), 0.105, 0.095, 8, TILE.WOOD, (t) => colY(bed + t * (top - bed)), { ts, cap1: true, capCol: C(0xb3a693), phase: rng() * 6.28 });
    }
  });
  // braces along each side, outside the piles: from a cap down to the next bent at the water, alternating
  for (const side of [-1, 1]) for (let k = 0; k < bents.length - 1; k++) {
    const s0 = bents[k], s1 = bents[k + 1], hi = capBot + 0.02, lo = level - 0.25;
    const [ya, yb] = k % 2 ? [hi, lo] : [lo, hi];
    const p0 = F.P(side * (pa + 0.12), ya, s0), p1 = F.P(side * (pa + 0.12), yb, s1), along = p1.clone().sub(p0), L = along.length();
    along.normalize();
    const up = F.X.clone().cross(along).normalize();
    b.box(p0.clone().add(p1).multiplyScalar(0.5), along, up, F.X, L / 2 + 0.05, 0.05, 0.013, TILE.WOOD, tone(0x766d60, rng), { grain: 'x' });
  }
  // the sill in the bank, stones under its ends where the ground falls away
  const sillTop = strBot, sillBot = strBot - 0.2;
  b.box(F.P(0, (sillTop + sillBot) / 2, sill), F.X, F.Y, F.Z, hw + 0.16, 0.1, 0.1, TILE.WOOD, C(0x5f574b), { grain: 'x', endTile: TILE.END });
  occ.push(obb(F.P(0, (sillTop + sillBot) / 2, sill), F.X, F.Y, F.Z, hw + 0.16, 0.1, 0.1));
  for (const a of [-hw, hw]) {
    const g = F.G(a, sill);
    if (g < sillBot - 0.03) stone(b, F.P(a, g - 0.06, sill), Math.min(0.28, (sillBot - g + 0.08) / 1.1 + 0.08), rng() * 6.28, rng, { up: 2.2 });
  }
  // cleats at the end, and a coil of line by one of them
  const iron = C(0x37342f);
  for (const side of [-1, 1]) {
    const a = side * (hw - 0.14), s = len - 0.75;
    b.box(F.P(a, deckY + 0.015, s), F.X, F.Y, F.Z, 0.025, 0.015, 0.06, TILE.METAL, iron);
    b.box(F.P(a, deckY + 0.04, s), F.X, F.Y, F.Z, 0.022, 0.012, 0.13, TILE.METAL, iron);
  }
  const rope = C(0xb5a17a), cA = -hw + 0.42, cB = len - 1.25, coil = [];
  for (let k = 0; k <= 44; k++) { const t = (k / 16) * Math.PI * 2, r = 0.15 + 0.012 * Math.sin(t * 0.5), lift = 0.011 + Math.floor(k / 16) * 0.016; coil.push(F.P(cA + Math.cos(t) * r, deckY + lift, cB + Math.sin(t) * r * 0.9)); }
  coil.push(F.P(-(hw - 0.14) + 0.02, deckY + 0.04, len - 0.82));
  b.tube(coil, 0.011, 5, TILE.ROPE, rope);
  const geo = b.build();
  occlude(geo, occ, { ground: localGround(ctx), rays: 12, reach: 0.9, floor: 0.32 });
  return { geo, back, sill, hw, len, deckY };
}

// --- the outfitter's store ------------------------------------------------------------------------------------
// An 8 x 6 m board-and-batten store, gable end to the lake: a porch (or a stoop) up from the dock to an open door, a
// plank floor, knotty pine walls and an open roof inside with a canoe up on the tie beams, the counter across the back
// with room for the keeper behind it, three shelf units (food; tackle, with a rack of rods; gear against the wall), a
// pegboard of lures on the left wall, the cork board inside the door on the right, a box stove in the back corner, a
// window in each side wall and one in the front, a map table under the right-hand window with a Fisher sheet spread
// on it (feedback 2026-10-24: the maps have a table of their own), and a lamp over the middle aisle.
//
// The store's own frame: a across (+a to the right of someone looking at the front from the lake), y up from the
// floor's top, b along it (+b to the lake: the front wall, with the door, faces +b). Everything that is the same in
// every store (the walls inside and out, the floor, the roof inside, the fittings and the goods, the glass) is built
// once in this frame (the store kit), its occlusion baked once with a daylight term for what is inside (a point far
// from the door and the windows sees little of the sky), and each store is a copy of it turned into its landing's
// frame and recoloured to its outfitter's look (stain, battens, trim, door). What depends on the ground or on the
// look's shape (the roof's cover, the porch or the stoop and its steps, the foundation, the woodpile) is built per
// store, in the same frame. Light: the sun comes in through the windows and the door by the shadow map (the glass
// casts none), and the lamp is the campfires' one PointLight lent to the store nearest the eye (fire.js steady).
const ST = { hW: 3.0, hD: 4.0, wall: 0.14, eave: 2.62, tp: 2 / 3, eo: 0.42, ro: 0.36, th: 0.07, sill: -0.26, base: -0.42 };
ST.iW = ST.hW - ST.wall; ST.iD = ST.hD - ST.wall; ST.aE = ST.hW + ST.eo; ST.bE = ST.hD + ST.ro;
const sheath = (a) => ST.eave + 0.025 + (ST.hW - Math.abs(a)) * ST.tp; // the roof boards' top over a (the cover lies on them)
const ceil = (a) => sheath(a) - 0.025;                                 // their underside: the ceiling inside, the soffit out
ST.ridge = sheath(0);
const DOOR = { a0: -0.85, a1: 0.35, y1: 2.05 }; DOOR.a = (DOOR.a0 + DOOR.a1) / 2;
// where things stand inside, in the store's frame (the build, the collision and the layout read them)
const IN = {
  counter: { a0: -0.6, a1: ST.iW, b0: -2.95, b1: -2.35, h: 0.95 },
  back: { a0: -0.6, a1: ST.iW, b0: -ST.iD, b1: -ST.iD + 0.3 },
  food: { a: -1.2, b0: -1.0, b1: 1.4, d: 0.7, h: 1.45 },
  tackle: { a: 0.85, b0: -1.0, b1: 1.4, d: 0.7, h: 1.45, rack: 0.22 },
  gear: { a0: 2.36, a1: ST.iW, b0: -1.6, b1: 0.4, h: 1.92 },
  pegs: { b0: 1.3, b1: 3.4, y0: 0.75, y1: 2.08 },
  board: { b0: 2.4, b1: 3.5, y0: 1.0, y1: 1.85 },
  maps: { a0: ST.iW - 0.64, a1: ST.iW - 0.02, b0: 0.66, b1: 1.94, h: 0.82 },
  stove: { a0: -2.55, a1: -1.8, b0: -3.0, b1: -2.5, y0: 0.24, y1: 0.7, pipe: [-2.3, -2.75] },
  wood: { a0: -1.72, a1: -1.28, b0: -ST.iD + 0.02, b1: -3.44 },
  chair: { a: -1.12, b: -2.72 },
  lamp: { a: -0.2, y: 2.1, b: -1.0 },
  canoe: { a: -1.25 },
  ties: [-2.0, 2.0], tieY: [2.42, 2.58],
};
// the painted signs inside, in the store's frame: the text, its centre (a, y, b), its size, the way it faces (na, nb)
const SIGNS = [
  { text: 'GROCERIES', a: IN.food.a - 0.014, y: IN.food.h + 0.14, b: (IN.food.b0 + IN.food.b1) / 2, w: 1.1, h: 0.2, n: [-1, 0] },
  { text: 'GROCERIES', a: IN.food.a + 0.014, y: IN.food.h + 0.14, b: (IN.food.b0 + IN.food.b1) / 2, w: 1.1, h: 0.2, n: [1, 0] },
  { text: 'TACKLE & BAIT', a: IN.tackle.a - 0.014, y: IN.tackle.h + 0.14, b: (IN.tackle.b0 + IN.tackle.b1) / 2, w: 1.1, h: 0.2, n: [-1, 0] },
  { text: 'TACKLE & BAIT', a: IN.tackle.a + 0.014, y: IN.tackle.h + 0.14, b: (IN.tackle.b0 + IN.tackle.b1) / 2, w: 1.1, h: 0.2, n: [1, 0] },
  { text: 'CAMP GEAR', a: IN.gear.a0 - 0.016, y: 1.86, b: (IN.gear.b0 + IN.gear.b1) / 2, w: 1.0, h: 0.17, n: [-1, 0] },
  { text: 'LURES', a: -ST.iW + 0.026, y: IN.pegs.y1 + 0.17, b: (IN.pegs.b0 + IN.pegs.b1) / 2, w: 0.8, h: 0.17, n: [1, 0] },
  { text: 'NOTICES', a: ST.iW - 0.026, y: IN.board.y1 + 0.16, b: (IN.board.b0 + IN.board.b1) / 2, w: 0.7, h: 0.15, n: [-1, 0] },
  { text: 'PERMITS · MAPS', a: 1.1, y: 2.44, b: -ST.iD + 0.026, w: 1.4, h: 0.22, n: [0, 1] },
];
// the walls going round, each from its outside-left corner (u along it, n out from its outside face): front, right,
// back, left; and their openings (u along the wall, y up from the floor)
const WALLS = [
  { o: [-ST.hW, ST.hD], U: [1, 0], N: [0, 1], len: 2 * ST.hW, gable: true },
  { o: [ST.hW, ST.hD], U: [0, -1], N: [1, 0], len: 2 * ST.hD },
  { o: [ST.hW, -ST.hD], U: [-1, 0], N: [0, -1], len: 2 * ST.hW, gable: true },
  { o: [-ST.hW, -ST.hD], U: [0, 1], N: [-1, 0], len: 2 * ST.hD },
];
const OPENINGS = [
  { w: 0, u0: DOOR.a0 + ST.hW, u1: DOOR.a1 + ST.hW, y0: 0, y1: DOOR.y1, door: true },
  { w: 0, u0: 4.0, u1: 5.2, y0: 0.8, y1: 2.05 },
  { w: 1, u0: 2.2, u1: 3.2, y0: 0.95, y1: 1.9 },
  { w: 3, u0: 3.4, u1: 4.4, y0: 0.95, y1: 1.9 },
];
WALLS.forEach((w, i) => { w.Uv = V(w.U[0], 0, w.U[1]); w.Nv = V(w.N[0], 0, w.N[1]); w.open = OPENINGS.filter((o) => o.w === i).sort((p, q) => p.u0 - q.u0); });
const wp = (w, u, y, n = 0) => V(w.o[0] + w.U[0] * u + w.N[0] * n, y, w.o[1] + w.U[1] * u + w.N[1] * n);
const wtop = (w, u, inner) => (w.gable ? ceil(u - ST.hW) : inner ? ceil(ST.iW) : ST.eave);
// a convex piece of a wall's face (n out from its outside face) from y0 up to top(u) over [u0, u1], the gable's peak put in
function wallCol(w, u0, u1, y0, top, n) {
  const pts = [wp(w, u0, y0, n), wp(w, u1, y0, n), wp(w, u1, top(u1), n)];
  if (w.gable && u0 < ST.hW - 1e-4 && u1 > ST.hW + 1e-4) pts.push(wp(w, ST.hW, top(ST.hW), n));
  pts.push(wp(w, u0, top(u0), n));
  return pts;
}
const AX = V(1, 0, 0), AY = V(0, 1, 0), AZ = V(0, 0, 1);
// a box between (a0, y0, c0) and (a1, y1, c1) in the store's frame, and the same as an occluder
const sbox = (b, a0, a1, y0, y1, c0, c1, tile, col, opts) => b.box(V((a0 + a1) / 2, (y0 + y1) / 2, (c0 + c1) / 2), AX, AY, AZ, Math.abs(a1 - a0) / 2, Math.abs(y1 - y0) / 2, Math.abs(c1 - c0) / 2, tile, col, opts);
const sobb = (a0, a1, y0, y1, c0, c1) => obb(V((a0 + a1) / 2, (y0 + y1) / 2, (c0 + c1) / 2), AX, AY, AZ, Math.abs(a1 - a0) / 2, Math.abs(y1 - y0) / 2, Math.abs(c1 - c0) / 2);
// a piece built in its own frame (x along it, y up, z across) and set down at (a, y, b) turned yaw about the vertical
const turned = (a, y, b, yaw = 0) => new THREE.Matrix4().makeRotationY(yaw).setPosition(a, y, b);
function placed(b, m, build) { const t = new RoleBuilder(); t.role = b.role; build(t); if (!t.count) return; const g = t.build(); g.applyMatrix4(m); b.addBuilt(g); }

// What of a vertex's colour comes from the outfitter's look: the stain on the siding, the battens (a shade darker), the
// painted trim, the door. The kit is coloured with DEF_LOOK; a store's copy is scaled by its look over that.
const ROLE = { FIX: 0, STAIN: 1, BATTEN: 2, TRIM: 3, DOOR: 4 };
class RoleBuilder extends PropBuilder {
  constructor() { super(); this.r = []; this.role = ROLE.FIX; }
  vert(p, n, u, v, tile, col) { super.vert(p, n, u, v, tile, col); this.r.push(this.role); }
  addBuilt(g) { super.addBuilt(g); for (let i = g.getAttribute('position').count; i > 0; i--) this.r.push(this.role); return this; }
}
export const DEF_LOOK = { stain: 0x7b4a33, roof: 0x55564c, trim: 0xd8ceb2, door: 0x435d49, porch: true, roofKind: 'shingle' };
// stream C's palette (outfitters.js), for a look seeded by the entry point while its module is not in the build
const LOOK_STUB = {
  stain: [0x6e3a2e, 0x8a3b2c, 0x8a857a, 0x3f5642, 0x8e5a3a, 0x5e4630, 0xa8823e, 0x4e6170, 0xd9d3c3],
  roof: [[0x55564c, 'shingle'], [0x3e5a46, 'steel'], [0x7e3528, 'steel'], [0x2f2f2d, 'shingle'], [0x7a6650, 'shake']],
  trim: [0xd8ceb2, 0xe6e2d6, 0x4a3a2c, 0x3a5040],
  door: [0x435d49, 0x7a3a2c, 0x3d5568, 0x8a6a48],
};
// the outfitters' characters (stream C, src/outfitters.js) when the build has them: an empty glob until then
const OUTFITTERS = import.meta.glob('./outfitters.js', { eager: true })['./outfitters.js'] || null;
function lookOf(ep, world) {
  if (OUTFITTERS && OUTFITTERS.outfitterProfile) {
    try {
      const p = OUTFITTERS.outfitterProfile(ep.ep, world), l = p && p.look;
      if (l) return { ...DEF_LOOK, ...l, porch: l.porch !== undefined ? !!l.porch : DEF_LOOK.porch, roofKind: l.roofKind || 'shingle' };
    } catch (e) { console.warn('the outfitter’s look', e); }
  }
  if (ep.ep === 30) return { ...DEF_LOOK };
  const r = mulberry32(977 + ep.ep * 131), pick = (a) => a[Math.floor(r() * a.length)];
  const [roof, roofKind] = pick(LOOK_STUB.roof);
  return { stain: pick(LOOK_STUB.stain), roof, roofKind, trim: pick(LOOK_STUB.trim), door: pick(LOOK_STUB.door), porch: r() < 0.6 };
}
const roleColours = (look) => {
  const s = C(look.stain);
  return [null, s, s.clone().offsetHSL(0, 0, -0.03), C(look.trim), C(look.door)];
};

// --- daylight inside: how much of the outdoors a point inside sees through the door and the windows (the view factor
// of each opening, by its centre and area, softened close to it), turned into a factor on the baked occlusion
export const STORE_LIGHT = { dim: 0.46, gain: 4.5 };
const DAY = OPENINGS.map((o) => { const w = WALLS[o.w]; return { c: wp(w, (o.u0 + o.u1) / 2, (o.y0 + o.y1) / 2, -ST.wall), n: w.Nv.clone().negate(), A: (o.u1 - o.u0) * (o.y1 - o.y0) }; });
function daylit(geo) {
  const P = geo.getAttribute('position').array, N = geo.getAttribute('normal').array, O = geo.getAttribute('aOcc'), { dim, gain } = STORE_LIGHT;
  for (let v = 0; v < O.count; v++) {
    const px = P[v * 3], py = P[v * 3 + 1], pz = P[v * 3 + 2], nx = N[v * 3], ny = N[v * 3 + 1], nz = N[v * 3 + 2];
    let vf = 0;
    for (const o of DAY) {
      const dx = o.c.x - px, dy = o.c.y - py, dz = o.c.z - pz, r2 = dx * dx + dy * dy + dz * dz, r = Math.sqrt(r2) || 1e-3;
      const cv = (dx * nx + dy * ny + dz * nz) / r, co = -(dx * o.n.x + dy * o.n.y + dz * o.n.z) / r;
      if (cv > 0 && co > 0) vf += (o.A * cv * co) / (Math.PI * r2 + o.A);
    }
    O.setX(v, O.getX(v) * (dim + (1 - dim) * (1 - Math.exp(-vf * gain))));
  }
  O.needsUpdate = true;
}

// --- the kit: the parts' baked geometry gathered into flat arrays, with each vertex's look role
class KitAcc {
  constructor() { this.a = { position: [], normal: [], color: [], aPropUv: [], aPropTile: [], aOcc: [] }; this.r = []; }
  add(g, roles) {
    for (const k in this.a) { const src = g.getAttribute(k).array, dst = this.a[k]; for (let i = 0; i < src.length; i++) dst.push(src[i]); }
    for (const r of roles) this.r.push(r);
  }
  done() { const out = { n: this.r.length, r: Uint8Array.from(this.r) }; for (const k in this.a) out[k] = Float32Array.from(this.a[k]); return out; }
}
function bakePart(K, b, boxes, { interior = true, rays = 8, reach = 0.6, floor = 0.35, ground = null } = {}) {
  if (!b.count) return;
  const g = b.build();
  occlude(g, boxes, { rays, reach, floor, ground });
  if (interior) daylit(g);
  K.add(g, b.r);
}
// the shell as a few solid blocks, for the bakes: the walls between their openings, the floor, the roof's two slopes
let shellOcc = null;
function shellBoxes() {
  if (shellOcc) return shellOcc;
  const out = [];
  const slab = (w, u0, u1, y0, y1) => { if (u1 - u0 > 0.02 && y1 - y0 > 0.02) out.push(obb(wp(w, (u0 + u1) / 2, (y0 + y1) / 2, -ST.wall / 2), w.Uv, AY, w.Nv, (u1 - u0) / 2, (y1 - y0) / 2, ST.wall / 2)); };
  for (const w of WALLS) {
    let u = 0;
    for (const op of w.open) { slab(w, u, op.u0, ST.sill, ST.eave); slab(w, op.u0, op.u1, ST.sill, op.y0); slab(w, op.u0, op.u1, op.y1, ST.eave); u = op.u1; }
    slab(w, u, w.len, ST.sill, ST.eave);
    if (w.gable) slab(w, ST.hW - 1.6, ST.hW + 1.6, ST.eave, ST.eave + 1.05);
  }
  out.push(sobb(-ST.hW, ST.hW, ST.base, 0, -ST.hD, ST.hD));
  for (const s of [-1, 1]) {
    const p0 = V(0, ST.ridge, 0), p1 = V(s * ST.aE, sheath(ST.aE), 0), along = p1.clone().sub(p0), L = along.length(); along.normalize();
    const up = V(-along.y * s, Math.abs(along.x), 0).normalize();
    out.push(obb(p0.clone().add(p1).multiplyScalar(0.5).addScaledVector(up, 0.01), along, up, AZ, L / 2, 0.05, ST.bE));
  }
  return (shellOcc = out);
}

const PINE = 0xc0915c, PINE_DARK = 0x95683f, FLOOR = 0x8e6b4b, CEILING = 0xc79f6b, SHELF = 0xa97f53, IRON = 0x34322f;
const LABELS = [0x9a3b2e, 0x3e5f45, 0xd8c79a, 0x4c6178, 0xc28a3a, 0x7a4f3a, 0xb9b3a0, 0x2f3a33, 0xa85a3a, 0xc9b38a];
const TIN = C(0xb9b6ae);

// The outside of the walls: the siding (painted boards) cut round the openings, battens every 34 cm, corner boards,
// the casings, sills and drip caps of the openings, the reveals through the wall, the sashes and their glass, the sill
// under the walls; the soffits, the fascia and the barge boards; the backing board for the name over the door; the
// stovepipe above the roof. The glass goes to its own builder (it casts no shadow, so the sun comes in).
function shellOutside(b, glass, rng) {
  const D = DEF_LOOK, stain = C(D.stain), batten = stain.clone().offsetHSL(0, 0, -0.03), trim = C(D.trim);
  WALLS.forEach((w, wi) => {
    const topO = (u) => wtop(w, u, false), inside = (u) => wp(w, u, 1.2, -1), org = wp(w, 0, ST.sill);
    b.role = ROLE.STAIN;
    const rect = (u0, u1, y0, top) => { if (u1 - u0 > 1e-3) b.face(wallCol(w, u0, u1, y0, top, 0), TILE.PAINT, stain, { ref: inside((u0 + u1) / 2), U: AY, o: org }); };
    let u = 0;
    for (const op of w.open) { rect(u, op.u0, ST.sill, topO); if (op.y0 > ST.sill + 1e-3) rect(op.u0, op.u1, ST.sill, () => op.y0); rect(op.u0, op.u1, op.y1, topO); u = op.u1; }
    rect(u, w.len, ST.sill, topO);
    b.role = ROLE.TRIM;
    const S = (uu, y, n, hu, hy, hn, tile, col, grain = 'y') => b.box(wp(w, uu, y, n), w.Uv, AY, w.Nv, hu, hy, hn, tile, col, { grain });
    for (const op of w.open) {
      const dp = ST.wall, um = (op.u0 + op.u1) / 2, ym = (op.y0 + op.y1) / 2;
      // the reveals through the wall
      b.face([wp(w, op.u0, op.y0), wp(w, op.u0, op.y1), wp(w, op.u0, op.y1, -dp), wp(w, op.u0, op.y0, -dp)], TILE.PAINT, trim, { ref: wp(w, op.u0 - 0.1, ym, -dp / 2) });
      b.face([wp(w, op.u1, op.y0), wp(w, op.u1, op.y1), wp(w, op.u1, op.y1, -dp), wp(w, op.u1, op.y0, -dp)], TILE.PAINT, trim, { ref: wp(w, op.u1 + 0.1, ym, -dp / 2) });
      b.face([wp(w, op.u0, op.y1), wp(w, op.u1, op.y1), wp(w, op.u1, op.y1, -dp), wp(w, op.u0, op.y1, -dp)], TILE.PAINT, trim, { ref: wp(w, um, op.y1 + 0.1, -dp / 2) });
      if (!op.door) {
        b.face([wp(w, op.u0, op.y0), wp(w, op.u1, op.y0), wp(w, op.u1, op.y0, -dp), wp(w, op.u0, op.y0, -dp)], TILE.PAINT, trim, { ref: wp(w, um, op.y0 - 0.1, -dp / 2) });
        // the sash in the middle of the wall: a frame round the glass and a cross of muntins (four panes)
        const gn = -0.07, hu = (op.u1 - op.u0) / 2, hy = (op.y1 - op.y0) / 2;
        S(op.u0 + 0.025, ym, gn, 0.025, hy, 0.022, TILE.PAINT, trim); S(op.u1 - 0.025, ym, gn, 0.025, hy, 0.022, TILE.PAINT, trim);
        S(um, op.y1 - 0.025, gn, hu, 0.025, 0.022, TILE.PAINT, trim, 'x'); S(um, op.y0 + 0.03, gn, hu, 0.03, 0.022, TILE.PAINT, trim, 'x');
        S(um, ym, gn, 0.012, hy - 0.04, 0.016, TILE.PAINT, trim); S(um, ym, gn, hu - 0.04, 0.012, 0.016, TILE.PAINT, trim, 'x');
        glass.face([wp(w, op.u0, op.y1, gn), wp(w, op.u1, op.y1, gn), wp(w, op.u1, op.y0, gn), wp(w, op.u0, op.y0, gn)], TILE.GLASS, C(0xffffff), { ref: wp(w, um, ym, -1), uvs: [[0.02, 0.02], [0.98, 0.02], [0.98, 0.98], [0.02, 0.98]] });
        S(um, op.y0 - 0.025, 0.035, hu + 0.1, 0.025, 0.05, TILE.PAINT, trim, 'x'); // sill
        S(um, op.y0 - 0.1, 0.012, hu, 0.05, 0.012, TILE.PAINT, trim, 'x');       // apron
      } else {
        b.role = ROLE.FIX;
        S(um, 0.007, -dp / 2, (op.u1 - op.u0) / 2, 0.007, dp / 2 + 0.04, TILE.WOOD, C(0x7d6a52), 'x'); // the threshold
        b.role = ROLE.TRIM;
      }
      // the casing round it, a head with a drip cap over it
      const yb = op.door ? op.y0 : op.y0 - 0.05;
      S(op.u0 - 0.045, (yb + op.y1 + 0.1) / 2, 0.014, 0.045, (op.y1 + 0.1 - yb) / 2, 0.014, TILE.PAINT, trim);
      S(op.u1 + 0.045, (yb + op.y1 + 0.1) / 2, 0.014, 0.045, (op.y1 + 0.1 - yb) / 2, 0.014, TILE.PAINT, trim);
      S(um, op.y1 + 0.055, 0.016, (op.u1 - op.u0) / 2 + 0.1, 0.055, 0.016, TILE.PAINT, trim, 'x');
      S(um, op.y1 + 0.12, 0.03, (op.u1 - op.u0) / 2 + 0.12, 0.01, 0.03, TILE.PAINT, trim, 'x');
    }
    // battens every 34 cm, cut round the casings and the name board, up to the eave or under the rake
    b.role = ROLE.BATTEN;
    const blocks = w.open.map((op) => ({ u0: op.u0 - 0.12, u1: op.u1 + 0.12, y0: op.door ? -9 : op.y0 - 0.16, y1: op.y1 + 0.15 }));
    if (wi === 0) blocks.push({ u0: ST.hW - 1.3, u1: ST.hW + 1.3, y0: 2.8, y1: 3.44 });
    for (let ub = 0.19; ub < w.len - 0.16; ub += 0.34) {
      const top = w.gable ? wtop(w, ub, false) - 0.1 : ST.eave - 0.005;
      let segs = [[ST.sill + 0.01, top]];
      for (const k of blocks) {
        if (ub + 0.03 < k.u0 || ub - 0.03 > k.u1) continue;
        segs = segs.flatMap(([y0, y1]) => [[y0, Math.min(y1, k.y0)], [Math.max(y0, k.y1), y1]]).filter(([y0, y1]) => y1 - y0 > 0.05);
      }
      for (const [y0, y1] of segs) b.box(wp(w, ub, (y0 + y1) / 2, 0.011), w.Uv, AY, w.Nv, 0.028, (y1 - y0) / 2, 0.011, TILE.PAINT, batten, { grain: 'y', shift: [rng() * 3, rng() * 3] });
    }
    // corner boards (the start one wraps over the end of the wall before), the sill beam under the siding
    b.role = ROLE.TRIM;
    b.box(wp(w, 0.0425, (ST.sill + ST.eave) / 2, 0.0125), w.Uv, AY, w.Nv, 0.0675, (ST.eave - ST.sill) / 2, 0.0125, TILE.PAINT, trim, { grain: 'y' });
    b.box(wp(w, w.len - 0.055, (ST.sill + ST.eave) / 2, 0.0125), w.Uv, AY, w.Nv, 0.055, (ST.eave - ST.sill) / 2, 0.0125, TILE.PAINT, trim, { grain: 'y' });
    b.role = ROLE.FIX;
    b.box(wp(w, w.len / 2, (ST.base + ST.sill) / 2, -0.06), w.Uv, AY, w.Nv, w.len / 2 - 0.08, (ST.sill - ST.base) / 2, 0.05, TILE.WOOD, C(0x5d554a), { grain: 'x', endTile: TILE.END });
  });
  // under the floor, closing it from below
  b.face([V(-ST.hW + 0.02, ST.base, ST.hD - 0.02), V(ST.hW - 0.02, ST.base, ST.hD - 0.02), V(ST.hW - 0.02, ST.base, -ST.hD + 0.02), V(-ST.hW + 0.02, ST.base, -ST.hD + 0.02)], TILE.PLAIN, C(0x2c2925), { ref: V(0, 0, 0) });
  // the soffits: under the eaves' overhang, and under the gables' overhang
  const soffit = C(0x6b6052), up = (a, bb) => V(a, ceil(a) + 1, bb);
  for (const s of [-1, 1]) {
    b.face([V(s * ST.hW, ceil(ST.hW), -ST.bE), V(s * ST.aE, ceil(ST.aE), -ST.bE), V(s * ST.aE, ceil(ST.aE), ST.bE), V(s * ST.hW, ceil(ST.hW), ST.bE)], TILE.WOOD, soffit, { ref: up(s * 3.2, 0), U: AZ });
    for (const e of [-1, 1]) b.face([V(0, ceil(0), e * ST.hD), V(s * ST.hW, ceil(ST.hW), e * ST.hD), V(s * ST.hW, ceil(ST.hW), e * ST.bE), V(0, ceil(0), e * ST.bE)], TILE.WOOD, soffit, { ref: up(s, e * ST.hD), U: AZ });
  }
  // the fascia along each eave and the barge boards under the rakes, the cover's top line along their tops
  b.role = ROLE.TRIM;
  const top = (a) => sheath(a) + ST.th;
  for (const s of [-1, 1]) {
    b.box(V(s * (ST.aE + 0.016), top(ST.aE) - 0.085, 0), AX, AY, AZ, 0.016, 0.085, ST.bE + 0.03, TILE.PAINT, trim, { grain: 'z' });
    const along = V(s * ST.aE, top(ST.aE) - top(0), 0), Lr = along.length(); along.normalize();
    const upv = AZ.clone().cross(along).normalize(); if (upv.y < 0) upv.negate();
    for (const e of [-1, 1]) b.box(V(s * ST.aE / 2, (top(0) + top(ST.aE)) / 2, e * (ST.bE + 0.016)).addScaledVector(upv, -0.085), along, upv, AZ, Lr / 2 + 0.02, 0.085, 0.016, TILE.PAINT, trim, { grain: 'x' });
  }
  // the backing board for the name, over the door
  b.box(V(0, 3.12, ST.hD + 0.022), AX, AY, AZ, 1.25, 0.28, 0.022, TILE.PAINT, trim, { grain: 'x' });
  // the stovepipe above the roof: a collar on the cover, the pipe, a rain cap
  b.role = ROLE.FIX;
  const [pa, pb] = IN.stove.pipe, iron = C(IRON), yr = top(pa), pipeTop = ST.ridge + 0.75;
  b.cyl(V(pa, sheath(pa) - 0.04, pb), V(pa, pipeTop, pb), 0.075, 0.075, 10, TILE.METAL, iron, {});
  b.cyl(V(pa, yr - 0.02, pb), V(pa, yr + 0.06, pb), 0.11, 0.1, 10, TILE.METAL, iron.clone().offsetHSL(0, 0, 0.04), { cap1: true, capTile: TILE.METAL });
  b.cyl(V(pa, pipeTop, pb), V(pa, pipeTop + 0.06, pb), 0.05, 0.05, 8, TILE.METAL, iron, {});
  b.cyl(V(pa, pipeTop + 0.06, pb), V(pa, pipeTop + 0.17, pb), 0.17, 0.03, 10, TILE.METAL, iron, { cap0: true, capTile: TILE.METAL });
}

// The inside of the shell: knotty pine boards up the walls to the ceiling (cut round the openings, their edges on the
// casings), the casings and the window stools, the baseboards, the plank floor, the ceiling of boards between the
// rafters, the ridge beam, the wall plates and the tie beams.
function shellInside(b, rng) {
  const pine = (r) => tone(PINE, r, 0.08, 0.012), groove = C(0x4a301c);
  WALLS.forEach((w) => {
    const n = -ST.wall, topI = (u) => wtop(w, u, true), u0w = ST.wall, u1w = w.len - ST.wall;
    const blocks = w.open.map((op) => ({ u0: op.u0 - 0.075, u1: op.u1 + 0.075, y0: op.door ? -9 : op.y0 - 0.11, y1: op.y1 + 0.09 }));
    // the boards' edges: random widths, with an edge at every block's side and at the gable's peak
    const cuts = new Set([u0w, u1w]);
    for (const k of blocks) { cuts.add(k.u0); cuts.add(k.u1); }
    if (w.gable) cuts.add(ST.hW);
    const fixed = [...cuts].filter((u) => u >= u0w && u <= u1w).sort((p, q) => p - q), edges = [];
    for (let i = 0; i < fixed.length - 1; i++) {
      const a = fixed[i], c = fixed[i + 1], k = Math.max(1, Math.round((c - a) / 0.15));
      for (let j = 0; j < k; j++) edges.push(a + ((c - a) * j) / k);
    }
    edges.push(u1w);
    for (let i = 0; i < edges.length - 1; i++) {
      const c0 = edges[i], c1 = edges[i + 1], um = (c0 + c1) / 2, col = pine(rng), sh = [rng() * 3, rng() * 3];
      let segs = [[0, Infinity]];
      for (const k of blocks) { if (um < k.u0 || um > k.u1) continue; segs = segs.flatMap(([y0, y1]) => [[y0, Math.min(y1, k.y0)], [Math.max(y0, k.y1), y1]]).filter(([y0, y1]) => y1 - y0 > 0.02); }
      for (const [y0, y1] of segs) {
        const reach = y1 === Infinity, yTop = reach ? Math.min(topI(c0), topI(c1)) : y1, steps = Math.max(1, Math.ceil((yTop - y0) / 0.9));
        for (let s = 0; s < steps; s++) {
          const ya = y0 + ((yTop - y0) * s) / steps, yb = y0 + ((yTop - y0) * (s + 1)) / steps, last = s === steps - 1;
          const pts = last && reach ? wallCol(w, c0, c1, ya, topI, n) : [wp(w, c0, ya, n), wp(w, c1, ya, n), wp(w, c1, yb, n), wp(w, c0, yb, n)];
          b.face(pts, TILE.SPLIT, col, { ref: wp(w, um, ya, 0), U: AY, o: wp(w, c0, 0, n), shift: sh });
        }
        // the groove at the board's edge, a dark line up it
        if (c0 > u0w + 1e-3) { const g0 = c0 - 0.004, g1 = c0 + 0.004, yt = reach ? topI(c0) : y1; b.face([wp(w, g0, y0, n - 0.0015), wp(w, g1, y0, n - 0.0015), wp(w, g1, yt, n - 0.0015), wp(w, g0, yt, n - 0.0015)], TILE.PLAIN, groove, { ref: wp(w, c0, y0, 0) }); }
      }
    }
    // the casings round the openings and the windows' stools and aprons
    const cas = C(PINE_DARK), S = (uu, y, nn, hu, hy, hn, col = cas, grain = 'y') => b.box(wp(w, uu, y, nn), w.Uv, AY, w.Nv, hu, hy, hn, TILE.WOOD, col, { grain });
    for (const op of w.open) {
      const um = (op.u0 + op.u1) / 2, yb = op.door ? 0 : op.y0 - 0.06, cn = n - 0.011;
      S(op.u0 - 0.0375, (yb + op.y1 + 0.09) / 2, cn, 0.0375, (op.y1 + 0.09 - yb) / 2, 0.011);
      S(op.u1 + 0.0375, (yb + op.y1 + 0.09) / 2, cn, 0.0375, (op.y1 + 0.09 - yb) / 2, 0.011);
      S(um, op.y1 + 0.045, cn - 0.002, (op.u1 - op.u0) / 2 + 0.075, 0.045, 0.013, cas, 'x');
      if (!op.door) {
        S(um, op.y0 - 0.012, n - 0.03, (op.u1 - op.u0) / 2 + 0.09, 0.012, 0.035, tone(PINE_DARK, rng, 0.03), 'x');
        S(um, op.y0 - 0.075, cn, (op.u1 - op.u0) / 2 + 0.05, 0.05, 0.011, cas, 'x');
      }
    }
    // the baseboard, round the door
    const runs = w.open.some((op) => op.door) ? [[u0w, w.open[0].u0 - 0.075], [w.open[0].u1 + 0.075, u1w]] : [[u0w, u1w]];
    for (const [s0, s1] of runs) if (s1 - s0 > 0.05) S((s0 + s1) / 2, 0.06, n - 0.009, (s1 - s0) / 2, 0.06, 0.009, C(0x6e4c30), 'x');
  });
  // the floor: planks along the store, their ends staggered, every piece of them a quad or so a metre long, on a dark
  // subfloor (what shows in the gaps)
  b.face([V(-ST.iW, -0.012, -ST.iD), V(ST.iW, -0.012, -ST.iD), V(ST.iW, -0.012, ST.iD), V(-ST.iW, -0.012, ST.iD)], TILE.PLAIN, C(0x2a221b), { ref: V(0, -1, 0) });
  for (let a = -ST.iW; a < ST.iW - 0.02;) {
    const w = Math.min(ST.iW - a, 0.15 + rng() * 0.05), a0 = a + 0.003, a1 = a + w - 0.003;
    let c = -ST.iD - rng() * 1.6;
    while (c < ST.iD) {
      const c0 = Math.max(-ST.iD, c), c1 = Math.min(ST.iD, c + 1.4 + rng() * 1.6), col = tone(FLOOR, rng, 0.1, 0.015), sh = [rng() * 4, rng() * 4];
      const k = Math.max(1, Math.ceil((c1 - c0) / 0.75));
      for (let j = 0; j < k; j++) {
        const s0 = c0 + ((c1 - c0) * j) / k, s1 = c0 + ((c1 - c0) * (j + 1)) / k;
        b.face([V(a0, 0, s0), V(a1, 0, s0), V(a1, 0, s1), V(a0, 0, s1)], TILE.WOOD, col, { ref: V(a, -1, s0), U: AZ, o: V(a0, 0, c0), shift: sh });
      }
      c = c1 + 0.002;
    }
    a += w;
  }
  // the ceiling: boards along the store on the rafters, both slopes, in strips up the slope
  for (const s of [-1, 1]) {
    const strips = 4, col = tone(CEILING, rng, 0.04);
    for (let i = 0; i < strips; i++) {
      const aa = s * ST.iW * (1 - i / strips), ab = s * ST.iW * (1 - (i + 1) / strips);
      for (let c = -ST.iD; c < ST.iD - 1e-3; c += ST.iD / 4) {
        const c1 = Math.min(ST.iD, c + ST.iD / 4);
        b.face([V(aa, ceil(aa), c), V(ab, ceil(ab), c), V(ab, ceil(ab), c1), V(aa, ceil(aa), c1)], TILE.WOOD, col, { ref: V((aa + ab) / 2, ceil((aa + ab) / 2) + 1, c), U: AZ, o: V(0, 0, -ST.iD) });
      }
    }
    // the rafters under them, from the wall plate to the ridge beam
    const A0 = ST.iW - 0.02, A1 = 0.06, p0 = V(s * A0, ceil(A0), 0), p1 = V(s * A1, ceil(A1), 0), along = p1.clone().sub(p0), L = along.length(); along.normalize();
    const upv = AZ.clone().cross(along).normalize(); if (upv.y < 0) upv.negate();
    for (let c = -ST.iD + 0.32; c < ST.iD - 0.2; c += 0.61) {
      b.box(V((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, c).addScaledVector(upv, -0.07), along, upv, AZ, L / 2, 0.07, 0.024, TILE.WOOD, tone(0xa47a50, rng, 0.05), { grain: 'x', endTile: TILE.END });
    }
    // the wall plate the rafters stand on
    sbox(b, s * (ST.iW - 0.09), s * ST.iW, ceil(ST.iW) - 0.16, ceil(ST.iW - 0.09), -ST.iD, ST.iD, TILE.WOOD, C(0x9a7048), { grain: 'z' });
  }
  sbox(b, -0.05, 0.05, ST.ridge - 0.025 - 0.22, ST.ridge - 0.02, -ST.iD, ST.iD, TILE.WOOD, C(0x8f6743), { grain: 'z' });
  for (const t of IN.ties) sbox(b, -ST.iW, ST.iW, IN.tieY[0], IN.tieY[1], t - 0.05, t + 0.05, TILE.WOOD, tone(0x9c7450, rng, 0.04), { grain: 'x', endTile: TILE.END });
}

// --- the goods ------------------------------------------------------------------------------------------------
// a row of tins standing on a shelf: n of radius r and height h from c along b, at a (the front of the row)
function tins(b, a, y, c, n, r, h, col, { step = 2.15, sides = 6, lid = TIN } = {}) {
  for (let i = 0; i < n; i++) { const cc = c + r + i * r * step; b.cyl(V(a, y, cc), V(a, y + h, cc), r, r, sides, TILE.PLAIN, col, { cap1: true, capTile: TILE.PLAIN, capCol: lid }); }
  return c + n * r * step;
}
// a carton standing at (a, y, c): w along b, d along a, h tall, turned a little
const carton = (b, a, y, c, w, d, h, col, yaw = 0) => placed(b, turned(a, y, c, yaw), (t) => t.box(V(0, h / 2, 0), AX, AY, AZ, d / 2, h / 2, w / 2, TILE.PLAIN, col, { grain: 'y', skip: ['-y'] }));
// a sack of flour or rice: a soft block, its neck gathered and tied
function sack(b, a, y, c, w, d, h, col, rng) {
  placed(b, turned(a, y, c, (rng() - 0.5) * 0.3), (t) => {
    t.tube([V(0, 0, 0), V(0, h * 0.15, 0), V(0, h * 0.7, 0), V(0, h * 0.92, 0)], (q) => [0.5, 0.56, 0.5, 0.32][Math.min(3, Math.round(q * 3))] * Math.min(w, d), 7, TILE.CANVAS, col, { cap0: true, cap1: true });
    t.cyl(V(0, h * 0.9, 0), V(0, h * 1.02, 0), 0.03, 0.018, 5, TILE.CANVAS, col, { cap1: true, capTile: TILE.CANVAS });
    t.cyl(V(0, h * 0.89, 0), V(0, h * 0.92, 0), 0.034, 0.034, 6, TILE.ROPE, C(0xa08a62), {});
  });
}
// a tackle box: the tray in the base, the lid, a seam, a handle and its catch
function tackleBox(b, a, y, c, w, d, h, col) {
  sbox(b, a - d / 2, a + d / 2, y, y + h * 0.62, c - w / 2, c + w / 2, TILE.FIBRE, col, { grain: 'z', skip: ['-y'] });
  sbox(b, a - d / 2 + 0.004, a + d / 2 - 0.004, y + h * 0.62, y + h, c - w / 2 + 0.004, c + w / 2 - 0.004, TILE.FIBRE, col.clone().offsetHSL(0, 0, 0.03), { grain: 'z' });
  sbox(b, a - 0.012, a + 0.012, y + h, y + h + 0.025, c - w * 0.22, c + w * 0.22, TILE.FIBRE, C(0x2e2e2c), { grain: 'z' });
  sbox(b, a - d / 2 - 0.006, a - d / 2, y + h * 0.5, y + h * 0.72, c - 0.02, c + 0.02, TILE.METAL, C(0x8d8a84));
}
// What a shelf holds: groups of goods along it from c0 to c1, the front of them at a = ao (s: the way out of the
// shelf, +1 or -1 along a), on y0 with `room` up to the shelf above. kind: 'food' | 'tackle' | 'back'.
function shelfGoods(b, kind, level, s, y0, room, ao, depth, c0, c1, rng) {
  const A = (t) => ao - s * t; // t metres in from the shelf's front edge
  let c = c0 + 0.02 + rng() * 0.04;
  const label = () => C(LABELS[Math.floor(rng() * LABELS.length)]).offsetHSL(0, -0.05, (rng() - 0.5) * 0.06);
  const room0 = room - 0.02;
  while (c < c1 - 0.12) {
    const left = c1 - c, r = rng();
    let kindHere;
    if (kind === 'food') kindHere = level === 0 ? (r < 0.6 ? 'sack' : 'case') : level === 3 ? (r < 0.5 ? 'cartons' : 'tins-tall') : r < 0.5 ? 'tins' : r < 0.75 ? 'cartons' : 'jars';
    else if (kind === 'tackle') kindHere = level === 0 ? (r < 0.55 ? 'bucket' : 'case') : level === 1 ? 'tackle' : level === 2 ? (r < 0.6 ? 'spools' : 'smallbox') : (r < 0.5 ? 'smallbox' : 'cartons');
    else kindHere = r < 0.35 ? 'tins' : r < 0.7 ? 'cartons' : r < 0.85 ? 'jars' : 'smallbox';
    if (kindHere === 'sack') {
      const w = Math.min(left, 0.3 + rng() * 0.08), d = Math.min(depth - 0.04, 0.26), h = Math.min(room0, 0.26 + rng() * 0.06);
      sack(b, A(d / 2 + 0.02), y0, c + w / 2, w, d, h, tone([0xe0d8c0, 0xd6c9a4, 0xc9b98e, 0xe8e2d2][Math.floor(rng() * 4)], rng, 0.04), rng);
      c += w + 0.03;
    } else if (kindHere === 'case') {
      const w = Math.min(left, 0.3 + rng() * 0.1), d = Math.min(depth - 0.03, 0.24 + rng() * 0.06), h = Math.min(room0, 0.2 + rng() * 0.08);
      carton(b, A(d / 2 + 0.015), y0, c + w / 2, w, d, h, tone(0x9c7a52, rng, 0.06), (rng() - 0.5) * 0.08);
      if (room0 > h + 0.12 && rng() < 0.5) carton(b, A(d / 2 + 0.03), y0 + h, c + w / 2, w * 0.9, d * 0.9, Math.min(room0 - h, 0.14), tone(0x9c7a52, rng, 0.08), (rng() - 0.5) * 0.15);
      c += w + 0.03;
    } else if (kindHere === 'tins' || kindHere === 'tins-tall' || kindHere === 'jars') {
      const jar = kindHere === 'jars', rr = jar ? 0.04 : 0.033 + rng() * 0.01, h = Math.min(room0 - 0.01, jar ? 0.11 : kindHere === 'tins-tall' ? 0.15 : 0.1 + rng() * 0.03);
      const n = Math.max(1, Math.min(Math.floor((left - 0.02) / (rr * 2.15)), 3 + Math.floor(rng() * 5))), col = jar ? tone([0x8a4a2a, 0x6e3a2a, 0xa8823e][Math.floor(rng() * 3)], rng, 0.05) : label();
      const lid = jar ? C([0xc9a44e, 0x9a3b2e, 0xd8d0b8][Math.floor(rng() * 3)]) : TIN;
      tins(b, A(rr + 0.012), y0, c, n, rr, h, col, { lid });
      if (depth > 4 * rr + 0.05) tins(b, A(3 * rr + 0.03), y0, c + rr * 0.5, Math.max(1, n - 1), rr, h, col, { lid });
      if (!jar && room0 > 2 * h + 0.03 && rng() < 0.35) tins(b, A(rr + 0.012), y0 + h, c + rr, Math.max(1, n - 2), rr, h, col, { lid });
      c += n * rr * 2.15 + 0.03;
    } else if (kindHere === 'cartons' || kindHere === 'smallbox') {
      const small = kindHere === 'smallbox', col = label(), w = small ? 0.06 + rng() * 0.03 : 0.12 + rng() * 0.07, d = small ? 0.05 + rng() * 0.03 : 0.06 + rng() * 0.03;
      const h = Math.min(room0 - 0.01, small ? 0.08 + rng() * 0.05 : 0.17 + rng() * 0.1), n = Math.max(1, Math.min(Math.floor(left / (w + 0.012)), 2 + Math.floor(rng() * 4)));
      for (let i = 0; i < n; i++) {
        carton(b, A(d / 2 + 0.012), y0, c + w / 2 + i * (w + 0.012), w, d, h, col, (rng() - 0.5) * 0.06);
        if (depth > 2 * d + 0.06 && rng() < 0.6) carton(b, A(1.5 * d + 0.03), y0, c + w / 2 + i * (w + 0.012), w, d, h, col, (rng() - 0.5) * 0.06);
      }
      c += n * (w + 0.012) + 0.03;
    } else if (kindHere === 'tackle') {
      const w = Math.min(left, 0.34 + rng() * 0.06), d = Math.min(depth - 0.03, 0.19), h = Math.min(room0 - 0.04, 0.14 + rng() * 0.04);
      tackleBox(b, A(d / 2 + 0.015), y0, c + w / 2, w, d, h, tone([0x4b6b4a, 0x7c7d74, 0x6b4a32, 0xb8642e, 0x3f5a6a][Math.floor(rng() * 5)], rng, 0.04));
      c += w + 0.035;
    } else if (kindHere === 'bucket') {
      const rr = 0.11 + rng() * 0.02, h = Math.min(room0 - 0.03, 0.24), col = tone([0xc9c2a8, 0x6a8a5a, 0xb85a32][Math.floor(rng() * 3)], rng, 0.04), cc = c + rr;
      b.cyl(V(A(rr + 0.02), y0, cc), V(A(rr + 0.02), y0 + h, cc), rr * 0.92, rr, 9, TILE.FIBRE, col, { cap1: true, capTile: TILE.FIBRE, capCol: col.clone().offsetHSL(0, 0, -0.05) });
      const bail = []; for (let k = 0; k <= 8; k++) { const t = (k / 8) * Math.PI; bail.push(V(A(rr + 0.02), y0 + h + Math.sin(t) * 0.05, cc + Math.cos(t) * rr)); }
      b.tube(bail, 0.004, 3, TILE.METAL, C(0x8d8a84));
      c += 2 * rr + 0.04;
    } else if (kindHere === 'spools') {
      const n = Math.max(1, Math.min(Math.floor(left / 0.11), 4 + Math.floor(rng() * 5))), col = C([0x6f8a5a, 0xd8d4c8, 0x4c6178, 0xb8a04a][Math.floor(rng() * 4)]);
      for (let i = 0; i < n; i++) {
        const cc = c + 0.05 + i * 0.11;
        b.cyl(V(A(0.06), y0, cc), V(A(0.06), y0 + 0.05, cc), 0.05, 0.05, 8, TILE.PLAIN, C(0x2f2f2d), { cap1: true, capTile: TILE.PLAIN, capCol: col });
      }
      c += n * 0.11 + 0.03;
    }
    c += rng() * 0.03;
  }
}
// A double-sided shelf unit (a gondola) standing along the store at a: a kick base, the ends, a back down its middle,
// four shelves a side with a pale price strip on their edges, a top; the goods on every shelf. Its boards go in `occ`.
function gondola(b, g, kind, rng, occ) {
  const { a, b0, b1, d, h } = g, hd = d / 2, wood = () => tone(SHELF, rng, 0.04), lip = C(0xd9cfb4);
  sbox(b, a - hd + 0.04, a + hd - 0.04, 0, 0.1, b0 + 0.02, b1 - 0.02, TILE.WOOD, C(0x4a3b2e), { grain: 'z' });
  for (const e of [b0, b1 - 0.025]) sbox(b, a - hd, a + hd, 0, h, e, e + 0.025, TILE.WOOD, wood(), { grain: 'y', endTile: TILE.END });
  sbox(b, a - 0.012, a + 0.012, 0.1, h - 0.025, b0 + 0.025, b1 - 0.025, TILE.WOOD, tone(0x9b7450, rng, 0.04), { grain: 'z' });
  sbox(b, a - hd, a + hd, h - 0.025, h, b0, b1, TILE.WOOD, wood(), { grain: 'z' });
  occ.push(sobb(a - hd + 0.04, a + hd - 0.04, 0, 0.1, b0, b1), sobb(a - 0.012, a + 0.012, 0.1, h, b0, b1), sobb(a - hd, a + hd, 0, h, b0, b0 + 0.025), sobb(a - hd, a + hd, 0, h, b1 - 0.025, b1), sobb(a - hd, a + hd, h - 0.025, h, b0, b1));
  const levels = [0.1, 0.46, 0.82, 1.18];
  for (const s of [-1, 1]) {
    const ai = a + s * 0.012, ao = a + s * hd;
    levels.forEach((y, i) => {
      const yTop = y + 0.022, next = i < levels.length - 1 ? levels[i + 1] : h - 0.025;
      sbox(b, ai, ao, y, yTop, b0 + 0.025, b1 - 0.025, TILE.WOOD, wood(), { grain: 'z' });
      occ.push(sobb(ai, ao, y, yTop, b0, b1));
      sbox(b, ao, ao + s * 0.008, y + 0.002, y + 0.045, b0 + 0.025, b1 - 0.025, TILE.PLAIN, lip, { grain: 'z' });
      shelfGoods(b, kind, i, s, yTop, next - yTop, ao - s * 0.005, hd - 0.02, b0 + 0.03, b1 - 0.03, rng);
    });
  }
}
// the rack of rods at the front end of the tackle unit: a base with the butts in it, a rail, eight rods with their reels
function rodRack(b, g, rng, occ) {
  const c0 = g.b1, c1 = g.b1 + g.rack, wood = C(0x8a6440);
  sbox(b, g.a - 0.3, g.a + 0.3, 0, 0.12, c0, c1, TILE.WOOD, wood, { grain: 'x' });
  sbox(b, g.a - 0.3, g.a + 0.3, 1.0, 1.03, c1 - 0.06, c1 - 0.02, TILE.WOOD, wood, { grain: 'x' });
  for (const e of [-0.3, 0.27]) sbox(b, g.a + e, g.a + e + 0.03, 0.12, 1.03, c1 - 0.06, c1 - 0.02, TILE.WOOD, wood, { grain: 'y' });
  occ.push(sobb(g.a - 0.3, g.a + 0.3, 0, 0.12, c0, c1));
  for (let k = 0; k < 8; k++) {
    const a = g.a - 0.25 + k * 0.071, c = c0 + 0.09 + (rng() - 0.5) * 0.03, lean = (rng() - 0.5) * 0.05, top = 1.95 + rng() * 0.15;
    const p0 = V(a, 0.12, c), p1 = V(a + lean, top, c + 0.04 + rng() * 0.03), blank = C([0x2e2e30, 0x5a3a2a, 0x3d4a5a, 0x6a6a5a][k % 4]);
    b.cyl(p0, p1, 0.007, 0.0028, 4, TILE.PLAIN, blank, {});
    const g0 = p0.clone().lerp(p1, 0.02), g1 = p0.clone().lerp(p1, 0.17);
    b.cyl(g0, g1, 0.013, 0.012, 5, TILE.CANVAS, C(0xb39467), { cap0: true, capTile: TILE.CANVAS });
    const r0 = p0.clone().lerp(p1, 0.2);
    sbox(b, r0.x - 0.022, r0.x + 0.022, r0.y - 0.03, r0.y + 0.03, r0.z - 0.06, r0.z - 0.012, TILE.METAL, C(0x6d6a64));
  }
}
// a Duluth pack standing against the wall: the canvas body, the flap over its top, two leather straps with buckles
function duluth(b, a, y, c, col, rng, face = -1) {
  const w = 0.27, d = 0.12, h = 0.54, leather = C(0x5a3a24);
  placed(b, turned(a, y, c, face > 0 ? Math.PI : 0), (t) => {
    t.box(V(0, h / 2, 0), AX, AY, AZ, d, h / 2, w, TILE.CANVAS, col, { grain: 'y' });
    t.box(V(-d - 0.012, h - 0.12, 0), AX, AY, AZ, 0.014, 0.13, w - 0.01, TILE.CANVAS, col.clone().offsetHSL(0, 0, -0.03), { grain: 'z' });
    t.box(V(0, h + 0.012, 0), AX, AY, AZ, d + 0.02, 0.014, w + 0.005, TILE.CANVAS, col.clone().offsetHSL(0, 0, -0.03), { grain: 'z' });
    for (const z of [-0.12, 0.12]) {
      t.box(V(-d - 0.028, h - 0.2, z), AX, AY, AZ, 0.004, 0.17, 0.018, TILE.PLAIN, leather, { grain: 'y' });
      t.box(V(-d - 0.033, h - 0.33, z), AX, AY, AZ, 0.004, 0.02, 0.022, TILE.METAL, C(0x8a7a5a));
    }
  });
  void rng;
}
// a stuff sack lying along the shelf (a tent, a sleeping pad rolled): a cylinder with a cinched end
function rollBag(b, a, y, c, r, len, col) {
  b.cyl(V(a, y + r, c - len / 2), V(a, y + r, c + len / 2), r, r, 8, TILE.CANVAS, col, { cap0: true, cap1: true, capTile: TILE.CANVAS, capCol: col.clone().offsetHSL(0, 0, -0.04), phase: 0.4 });
  b.cyl(V(a, y + r, c + len / 2), V(a, y + r, c + len / 2 + 0.05), r * 0.5, 0.012, 6, TILE.CANVAS, col, {});
}
// the gear against the right wall: uprights, four shelves; packs and the food barrel low, tents and pads, the cook kits,
// the life jackets on top, two paddles on pegs above
function gearWall(b, rng, occ) {
  const g = IN.gear, wood = () => tone(SHELF, rng, 0.04), levels = [0.08, 0.72, 1.32, g.h - 0.025];
  for (const c of [g.b0, (g.b0 + g.b1) / 2, g.b1 - 0.03]) sbox(b, g.a0, g.a1, 0, g.h, c, c + 0.03, TILE.WOOD, wood(), { grain: 'y', endTile: TILE.END });
  for (const y of levels) { sbox(b, g.a0, g.a1, y, y + 0.025, g.b0, g.b1, TILE.WOOD, wood(), { grain: 'z' }); occ.push(sobb(g.a0, g.a1, y, y + 0.025, g.b0, g.b1)); }
  occ.push(sobb(g.a0, g.a1, 0, g.h, g.b0, g.b0 + 0.03), sobb(g.a0, g.a1, 0, g.h, g.b1 - 0.03, g.b1));
  const fa = g.a0 + 0.03; // the front of the shelves
  // the packs and the barrel
  duluth(b, g.a1 - 0.14, levels[0] + 0.025, g.b0 + 0.36, tone(0xb39a6a, rng, 0.04), rng);
  duluth(b, g.a1 - 0.14, levels[0] + 0.025, g.b0 + 0.95, tone(0x6b7350, rng, 0.04), rng);
  const bc = g.b1 - 0.3, ba = (g.a0 + g.a1) / 2 + 0.02, by = levels[0] + 0.025, blue = C(0x3d6a8a);
  b.cyl(V(ba, by, bc), V(ba, by + 0.56, bc), 0.19, 0.2, 12, TILE.FIBRE, blue, { cap1: true, capTile: TILE.FIBRE, capCol: blue.clone().offsetHSL(0, 0, -0.05) });
  b.cyl(V(ba, by + 0.5, bc), V(ba, by + 0.56, bc), 0.205, 0.205, 12, TILE.FIBRE, C(0x2c4e66), {});
  // tents and pads
  const y1 = levels[1] + 0.025;
  rollBag(b, g.a1 - 0.12, y1, g.b0 + 0.35, 0.095, 0.48, tone(0x5c7a55, rng, 0.04));
  rollBag(b, fa + 0.1, y1, g.b0 + 0.4, 0.085, 0.42, tone(0xa8693f, rng, 0.04));
  rollBag(b, g.a1 - 0.1, y1, g.b0 + 1.15, 0.075, 0.55, tone(0x56708a, rng, 0.04));
  rollBag(b, fa + 0.09, y1, g.b0 + 1.2, 0.075, 0.55, tone(0xb8a04a, rng, 0.04));
  rollBag(b, fa + 0.1, y1, g.b0 + 1.72, 0.09, 0.4, tone(0x8d4f45, rng, 0.04));
  // cook kits: nested pots with lids, fuel bottles, a coil of rope
  const y2 = levels[2] + 0.025, pot = C(0x8e8c86);
  for (const [c, r, h] of [[g.b0 + 0.2, 0.11, 0.12], [g.b0 + 0.48, 0.095, 0.1], [g.b0 + 0.74, 0.12, 0.13]]) {
    b.cyl(V(fa + r + 0.03, y2, c), V(fa + r + 0.03, y2 + h, c), r, r, 10, TILE.PLAIN, tone(0x8e8c86, rng, 0.05), { cap1: true, capTile: TILE.PLAIN, capCol: pot.clone().offsetHSL(0, 0, 0.05) });
    b.cyl(V(fa + r + 0.03, y2 + h, c), V(fa + r + 0.03, y2 + h + 0.02, c), 0.015, 0.015, 5, TILE.PLAIN, C(0x2c2a28), { cap1: true });
  }
  tins(b, fa + 0.05, y2, g.b0 + 1.0, 4, 0.035, 0.2, C(0xa8402e), { lid: C(0x9a9890) });
  const coil = []; for (let k = 0; k <= 40; k++) { const t = (k / 14) * Math.PI * 2, r = 0.12; coil.push(V(fa + 0.17 + Math.cos(t) * r, y2 + 0.012 + Math.floor(k / 14) * 0.02, g.b1 - 0.25 + Math.sin(t) * r)); }
  b.tube(coil, 0.011, 5, TILE.ROPE, C(0xc9b48a));
  // life jackets folded on top, in two stacks
  const y3 = levels[3] + 0.025;
  for (const [c, n] of [[g.b0 + 0.45, 4], [g.b0 + 1.45, 3]]) for (let k = 0; k < n; k++) {
    const col = tone([0xc4602e, 0xa8402e, 0xc9a23a, 0x3d5a6a][(k + n) % 4], rng, 0.04), yy = y3 + k * 0.065;
    placed(b, turned((g.a0 + g.a1) / 2 + 0.02, yy, c, (rng() - 0.5) * 0.15), (t) => t.box(V(0, 0.03, 0), AX, AY, AZ, 0.2, 0.03, 0.23, TILE.CANVAS, col, { grain: 'z' }));
  }
  // two paddles on pegs above, blades toward the back
  for (const [y, wood] of [[2.24, C(0xb0895a)], [2.46, C(0x9a7a50)]]) {
    const pb = new PropBuilder(); paddle(pb, mulberry32(Math.round(y * 100)), wood); const pg = pb.build();
    pg.applyMatrix4(new THREE.Matrix4().makeBasis(V(0, 0, -1), V(-1, 0, 0), V(0, 1, 0)).setPosition(ST.iW - 0.035, y, (g.b0 + g.b1) / 2));
    b.addBuilt(pg);
    for (const c of [-0.45, 0.35]) b.cyl(V(ST.iW, y - 0.03, (g.b0 + g.b1) / 2 + c), V(ST.iW - 0.07, y - 0.025, (g.b0 + g.b1) / 2 + c), 0.008, 0.008, 5, TILE.WOOD, C(0x6e4c30), { cap1: true });
  }
}
// the pegboard of lures on the left wall: the board in a pine frame, rows of hooks, a card on most with its lure
function lureWall(b, rng, occ) {
  const P = IN.pegs, x0 = -ST.iW, frame = C(PINE_DARK);
  sbox(b, x0, x0 + 0.012, P.y0, P.y1, P.b0, P.b1, TILE.PLAIN, C(0xb48e60), { grain: 'z' });
  for (const [c0, c1, y0, y1] of [[P.b0 - 0.04, P.b0, P.y0 - 0.04, P.y1 + 0.04], [P.b1, P.b1 + 0.04, P.y0 - 0.04, P.y1 + 0.04], [P.b0, P.b1, P.y1, P.y1 + 0.04], [P.b0, P.b1, P.y0 - 0.04, P.y0]]) sbox(b, x0, x0 + 0.025, y0, y1, c0, c1, TILE.WOOD, frame, { grain: c1 - c0 > 0.1 ? 'z' : 'y' });
  occ.push(sobb(x0, x0 + 0.012, P.y0, P.y1, P.b0, P.b1));
  const cards = [0xe8e2d0, 0xd9cfa8, 0xc9d3c8, 0xe0c890, 0xd8d8d0], lures = [[0xc23a2a, 0xe8e2d0], [0xc8c8c0, 0xc8c8c0], [0xc9a24a, 0xc9a24a], [0xb7c43a, 0x3a3a30], [0xd0702e, 0xd0702e], [0x2a2a2a, 0xc9a24a], [0xd8d2c0, 0x3d6a5a], [0x6a8a3a, 0xd0c040]];
  for (let y = P.y1 - 0.1; y > P.y0 + 0.2; y -= 0.235) for (let c = P.b0 + 0.13; c < P.b1 - 0.06; c += 0.235) {
    b.cyl(V(x0 + 0.012, y, c), V(x0 + 0.085, y + 0.012, c), 0.003, 0.003, 4, TILE.PLAIN, C(0x8a8780), {});
    if (rng() < 0.12) continue; // a bare hook, sold out
    const card = C(cards[Math.floor(rng() * cards.length)]), [l0, l1] = lures[Math.floor(rng() * lures.length)], cc = c + (rng() - 0.5) * 0.01, x1 = x0 + 0.055;
    for (let k = 0; k < (rng() < 0.5 ? 2 : 1); k++) {
      const xk = x1 + k * 0.012;
      sbox(b, xk, xk + 0.003, y - 0.145, y + 0.005, cc - 0.035, cc + 0.035, TILE.PLAIN, card, { grain: 'y' });
      sbox(b, xk + 0.003, xk + 0.012, y - 0.115, y - 0.07, cc - 0.012, cc + 0.012, TILE.PLAIN, C(l0), { grain: 'y' });
      sbox(b, xk + 0.003, xk + 0.011, y - 0.07, y - 0.035, cc - 0.01, cc + 0.01, TILE.PLAIN, C(l1), { grain: 'y' });
    }
  }
}
// The map table under the right-hand window: a pine table on square legs, its top's end grain, a stack of folded sheets
// at the door end and a pencil; the sheet spread on it is a texture of its own (mapSheetMaterial), laid on per store.
function mapTable(b, rng, occ) {
  const M = IN.maps, top = M.h, leg = C(0x6e4c30);
  sbox(b, M.a0, M.a1, top - 0.04, top, M.b0, M.b1, TILE.WOOD, tone(0x9a7650, rng, 0.04), { grain: 'z', endTile: TILE.END });
  for (const [a, c] of [[M.a0 + 0.06, M.b0 + 0.06], [M.a1 - 0.06, M.b0 + 0.06], [M.a0 + 0.06, M.b1 - 0.06], [M.a1 - 0.06, M.b1 - 0.06]]) sbox(b, a - 0.03, a + 0.03, 0, top - 0.04, c - 0.03, c + 0.03, TILE.WOOD, leg, { grain: 'y' });
  sbox(b, M.a0 + 0.06, M.a1 - 0.06, top - 0.13, top - 0.04, M.b0 + 0.04, M.b0 + 0.065, TILE.WOOD, leg, { grain: 'x' });
  sbox(b, M.a0 + 0.06, M.a1 - 0.06, top - 0.13, top - 0.04, M.b1 - 0.065, M.b1 - 0.04, TILE.WOOD, leg, { grain: 'x' });
  sbox(b, M.a0 + 0.04, M.a0 + 0.065, top - 0.13, top - 0.04, M.b0 + 0.06, M.b1 - 0.06, TILE.WOOD, leg, { grain: 'z' });
  sbox(b, M.a0 + 0.08, M.a1 - 0.08, 0.16, 0.18, M.b0 + 0.08, M.b1 - 0.08, TILE.WOOD, tone(0x7a5a3a, rng, 0.04), { grain: 'z' });
  // the folded sheets, each a little askew, and a bundle on the low shelf
  const cols = [0xe4dcc0, 0xd9d0b2, 0xe8e0c8, 0xdcd4ba, 0xe2d8bc];
  for (let k = 0; k < 5; k++) {
    const o = (rng() - 0.5) * 0.03, y = top + k * 0.009;
    sbox(b, M.a0 + 0.06 + o, M.a0 + 0.3 + o, y, y + 0.008, M.b1 - 0.3 - o, M.b1 - 0.07 - o, TILE.PLAIN, C(cols[k]), { grain: 'x' });
    sbox(b, M.a0 + 0.06 + o, M.a0 + 0.3 + o, y + 0.008, y + 0.0085, M.b1 - 0.3 - o, M.b1 - 0.26 - o, TILE.PLAIN, C(0x2d4f66), { grain: 'x' });
  }
  for (let k = 0; k < 3; k++) sbox(b, M.a0 + 0.14, M.a1 - 0.14, 0.18 + k * 0.012, 0.19 + k * 0.012, M.b0 + 0.2, M.b0 + 0.62, TILE.PLAIN, C(cols[k + 1]), { grain: 'x' });
  b.cyl(V(M.a1 - 0.12, top + 0.004, M.b0 + 0.12), V(M.a1 - 0.12, top + 0.004, M.b0 + 0.3), 0.004, 0.004, 6, TILE.PLAIN, C(0xd9a032), { cap0: true, cap1: true, capTile: TILE.PLAIN });
  occ.push(sobb(M.a0, M.a1, top - 0.04, top, M.b0, M.b1), sobb(M.a0 + 0.08, M.a1 - 0.08, 0.16, 0.18, M.b0 + 0.08, M.b1 - 0.08));
}
// the sheet spread on the map table: a Fisher-style sheet drawn once (lakes, shore lines, a few contours, the red
// portage rods and campsites, the neatline and its number), one material for every store (the cork board's program)
function mapSheetMaterial() {
  let m = signCache.get('maptable');
  if (m) return m;
  const W = 512, H = 820, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d'), r = mulberry32(2424);
  x.fillStyle = '#ece4ca'; x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(150, 120, 80, .35)'; x.lineWidth = 1.2;
  for (let k = 0; k < 14; k++) { x.beginPath(); let px = 0, py = r() * H; x.moveTo(px, py); while (px < W) { px += 30 + r() * 30; py += (r() - 0.5) * 60; x.lineTo(px, py); } x.stroke(); }
  const lake = (cx, cy, rx, ry, n) => {
    x.beginPath();
    for (let i = 0; i <= n; i++) { const t = (i / n) * Math.PI * 2, w = 0.75 + r() * 0.45; const px = cx + Math.cos(t) * rx * w, py = cy + Math.sin(t) * ry * w; if (i === 0) x.moveTo(px, py); else x.lineTo(px, py); }
    x.closePath(); x.fillStyle = '#9cc2d6'; x.fill(); x.strokeStyle = '#2d4f66'; x.lineWidth = 2; x.stroke();
  };
  const lakes = [[150, 170, 110, 60, 22], [330, 290, 140, 70, 26], [140, 470, 90, 120, 24], [380, 560, 80, 50, 18], [250, 700, 160, 55, 24], [430, 120, 50, 40, 14], [70, 320, 40, 30, 12]];
  for (const l of lakes) lake(...l);
  x.setLineDash([7, 6]); x.strokeStyle = '#b4321f'; x.lineWidth = 3;
  for (const [a, b2, c2, d] of [[220, 210, 270, 250], [190, 380, 170, 410], [300, 360, 360, 520], [210, 560, 230, 660]]) { x.beginPath(); x.moveTo(a, b2); x.lineTo(c2, d); x.stroke(); }
  x.setLineDash([]); x.fillStyle = '#b4321f';
  for (const [a, b2] of [[120, 150], [290, 300], [160, 500], [390, 560], [260, 700], [420, 130]]) { x.beginPath(); x.arc(a, b2, 5, 0, 7); x.fill(); }
  x.strokeStyle = 'rgba(60, 40, 20, .25)'; x.lineWidth = 1;
  for (let gx = 0; gx <= W; gx += 128) { x.beginPath(); x.moveTo(gx, 0); x.lineTo(gx, H); x.stroke(); }
  for (let gy = 0; gy <= H; gy += 128) { x.beginPath(); x.moveTo(0, gy); x.lineTo(W, gy); x.stroke(); }
  x.strokeStyle = '#2a2016'; x.lineWidth = 6; x.strokeRect(14, 14, W - 28, H - 28);
  x.fillStyle = '#2a2016'; x.font = '600 34px Georgia, serif'; x.fillText('F-24', 32, H - 36);
  x.font = 'italic 22px Georgia, serif'; x.fillText('Lake One · Snowbank · Moose', 140, H - 38);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  m = makeToonMaterial({ vertexColors: false, map: tex, side: THREE.DoubleSide });
  signCache.set('maptable', m);
  return m;
}
// the cork board's frame inside the door, on the right wall (the cork, the notices on it, is a texture of its own)
function boardFrame(b) {
  const B = IN.board, x1 = ST.iW, f = C(PINE_DARK);
  for (const [c0, c1, y0, y1] of [[B.b0 - 0.05, B.b0, B.y0 - 0.05, B.y1 + 0.05], [B.b1, B.b1 + 0.05, B.y0 - 0.05, B.y1 + 0.05], [B.b0, B.b1, B.y1, B.y1 + 0.05], [B.b0, B.b1, B.y0 - 0.05, B.y0]]) sbox(b, x1 - 0.03, x1, y0, y1, c0, c1, TILE.WOOD, f, { grain: c1 - c0 > 0.1 ? 'z' : 'y' });
  sbox(b, x1 - 0.012, x1, B.y0, B.y1, B.b0, B.b1, TILE.PLAIN, C(0x8a6440), { grain: 'z' }); // behind the cork
  sbox(b, x1 - 0.07, x1, B.y0 - 0.07, B.y0 - 0.05, B.b0, B.b1, TILE.WOOD, f, { grain: 'z' }); // a ledge for the pencil
  b.cyl(V(x1 - 0.045, B.y0 - 0.044, B.b0 + 0.2), V(x1 - 0.045, B.y0 - 0.044, B.b0 + 0.36), 0.004, 0.004, 5, TILE.PLAIN, C(0xc9a23a), { cap0: true, cap1: true });
}
// the counter across the back: a beadboard front on a kick, an end, a worn top, a shelf on the keeper's side; on it the
// till, a bell, a jar of jerky, the permits, a rack of map sheets; the shelves on the back wall behind
function counter(b, rng, occ) {
  const K = IN.counter, top = K.h, stain = 0x6e4a30;
  for (let a = K.a0 + 0.03; a < K.a1 - 0.01; a += 0.09) {
    const a1 = Math.min(K.a1, a + 0.09);
    b.face([V(a, 0.1, K.b1), V(a1, 0.1, K.b1), V(a1, top - 0.045, K.b1), V(a, top - 0.045, K.b1)], TILE.WOOD, tone(stain, rng, 0.06, 0.01), { ref: V(a, 0.5, K.b0), U: AY, shift: [rng() * 3, rng() * 3] });
    sbox(b, a1 - 0.006, a1, 0.1, top - 0.045, K.b1, K.b1 + 0.006, TILE.WOOD, C(0x4a3020), { grain: 'y' });
  }
  sbox(b, K.a0 + 0.03, K.a1, 0, 0.1, K.b1 - 0.05, K.b1 - 0.04, TILE.WOOD, C(0x3a2a20), { grain: 'x' });
  sbox(b, K.a0, K.a0 + 0.03, 0, top - 0.045, K.b0, K.b1, TILE.WOOD, tone(stain, rng, 0.04), { grain: 'y' });
  sbox(b, K.a0 - 0.04, K.a1, top - 0.045, top, K.b0 - 0.02, K.b1 + 0.05, TILE.WOOD, C(0x8b6a4a), { grain: 'x', endTile: TILE.END });
  sbox(b, K.a0 + 0.03, K.a1, 0.36, 0.38, K.b0, K.b1 - 0.02, TILE.WOOD, tone(stain, rng, 0.04), { grain: 'x' });
  occ.push(sobb(K.a0, K.a1, 0, top, K.b1 - 0.05, K.b1), sobb(K.a0 - 0.04, K.a1, top - 0.045, top, K.b0, K.b1 + 0.05), sobb(K.a0 + 0.03, K.a1, 0.36, 0.38, K.b0, K.b1));
  for (let a = K.a0 + 0.2; a < K.a1 - 0.25; a += 0.32 + rng() * 0.25) carton(b, a, 0.38, K.b0 + 0.18, 0.24 + rng() * 0.08, 0.2 + rng() * 0.08, 0.1 + rng() * 0.2, tone(0x9c7a52, rng, 0.06), (rng() - 0.5) * 0.12);
  // the till: a body, the sloped keys, the drawer, a little sign on top
  const ta = 2.05, tc = (K.b0 + K.b1) / 2;
  sbox(b, ta - 0.19, ta + 0.19, top, top + 0.16, tc - 0.18, tc + 0.12, TILE.METAL, C(0x5a5650));
  placed(b, new THREE.Matrix4().makeRotationX(-0.5).setPosition(ta, top + 0.15, tc + 0.12), (t) => t.box(V(0, 0, 0.07), AX, AY, AZ, 0.18, 0.03, 0.08, TILE.METAL, C(0x6e6a62)));
  sbox(b, ta - 0.17, ta + 0.17, top + 0.16, top + 0.27, tc - 0.16, tc - 0.08, TILE.METAL, C(0x5a5650));
  sbox(b, ta - 0.1, ta + 0.1, top + 0.18, top + 0.25, tc - 0.08, tc - 0.075, TILE.PLAIN, C(0xd8cfa8));
  // the bell, a jar of jerky, the permits, the map sheets in a rack
  b.cyl(V(0.35, top, tc + 0.12), V(0.35, top + 0.012, tc + 0.12), 0.045, 0.045, 8, TILE.WOOD, C(0x3a2a20), { cap1: true });
  b.cyl(V(0.35, top + 0.012, tc + 0.12), V(0.35, top + 0.055, tc + 0.12), 0.04, 0.012, 8, TILE.PLAIN, C(0xc9a44e), { cap1: true, capTile: TILE.PLAIN });
  b.cyl(V(0.9, top, tc), V(0.9, top + 0.22, tc), 0.075, 0.075, 10, TILE.PLAIN, C(0x7a4a2a), { cap1: true, capTile: TILE.PLAIN, capCol: C(0x6a6a62) });
  sbox(b, 1.25, 1.47, top, top + 0.025, tc - 0.05, tc + 0.11, TILE.PLAIN, C(0xe6e0cc), { grain: 'x' });
  sbox(b, 1.29, 1.31, top + 0.025, top + 0.03, tc - 0.02, tc + 0.12, TILE.PLAIN, C(0x2a3a5a), { grain: 'z' });
  sbox(b, -0.48, -0.12, top, top + 0.03, tc - 0.1, tc + 0.1, TILE.WOOD, C(0x5a3a24), { grain: 'x' });
  for (let k = 0; k < 4; k++) placed(b, new THREE.Matrix4().makeRotationX(-0.25).setPosition(-0.42 + k * 0.085, top + 0.03, tc), (t) => t.box(V(0, 0.11, 0), AX, AY, AZ, 0.035, 0.11, 0.006, TILE.PLAIN, C([0xd8d4b8, 0xb9c9b0, 0xd9c79a, 0xc9d3c8][k]), { grain: 'y' }));
  // the shelves on the back wall behind the keeper, on brackets
  const B = IN.back;
  for (const y of [1.05, 1.45, 1.85]) {
    sbox(b, B.a0, B.a1, y, y + 0.022, B.b0, B.b1, TILE.WOOD, tone(SHELF, rng, 0.04), { grain: 'x' });
    occ.push(sobb(B.a0, B.a1, y, y + 0.022, B.b0, B.b1));
    for (const a of [B.a0 + 0.15, (B.a0 + B.a1) / 2, B.a1 - 0.15]) sbox(b, a - 0.012, a + 0.012, y - 0.16, y, B.b0, B.b0 + 0.2, TILE.WOOD, C(0x6e4c30), { grain: 'y' });
    backGoods(b, y + 0.022, 0.36, rng);
  }
}
// what is on the back wall's shelves: along a, the front at b = IN.back.b1
function backGoods(b, y0, room, rng) {
  const B = IN.back;
  let a = B.a0 + 0.04 + rng() * 0.05;
  while (a < B.a1 - 0.12) {
    const r = rng(), col = C(LABELS[Math.floor(rng() * LABELS.length)]);
    if (r < 0.35) { const n = 3 + Math.floor(rng() * 4), rr = 0.035; for (let i = 0; i < n; i++) b.cyl(V(a + rr + i * 0.075, y0, B.b1 - 0.06), V(a + rr + i * 0.075, y0 + 0.11, B.b1 - 0.06), rr, rr, 6, TILE.PLAIN, col, { cap1: true, capTile: TILE.PLAIN, capCol: TIN }); a += n * 0.075 + 0.04; }
    else if (r < 0.7) { const n = 2 + Math.floor(rng() * 3), w = 0.11 + rng() * 0.06, h = Math.min(room - 0.04, 0.16 + rng() * 0.12); for (let i = 0; i < n; i++) carton(b, a + w / 2 + i * (w + 0.012), y0, B.b1 - 0.06, 0.07, w, h, col, (rng() - 0.5) * 0.06); a += n * (w + 0.012) + 0.04; }
    else if (r < 0.85) { for (let i = 0; i < 5; i++) sbox(b, a, a + 0.24, y0 + i * 0.012, y0 + i * 0.012 + 0.01, B.b1 - 0.22, B.b1 - 0.02, TILE.PLAIN, C([0xd8d4b8, 0xb9c9b0, 0xd9c79a][i % 3]), { grain: 'x' }); a += 0.3; }
    else { sbox(b, a, a + 0.3, y0, y0 + 0.17, B.b1 - 0.2, B.b1 - 0.04, TILE.WOOD, C(0x5a3a24), { grain: 'x' }); b.cyl(V(a + 0.08, y0 + 0.09, B.b1 - 0.04), V(a + 0.08, y0 + 0.09, B.b1 - 0.032), 0.035, 0.035, 8, TILE.PLAIN, C(0xd8cfa8), { cap1: true, capTile: TILE.PLAIN }); a += 0.36; }
  }
}
// the stove in the back corner: a slate hearth, a box stove on legs with its door to the room and a kettle on it, the
// pipe up through the roof, a sheet of iron on the wall behind, a box of split wood, a chair pulled up to it
function stoveCorner(b, rng, occ) {
  const s = IN.stove, iron = C(0x3d3934), IRONT = TILE.PLAIN;
  sbox(b, -ST.iW, -1.45, 0, 0.03, -ST.iD, -2.05, TILE.STONE, C(0x5e5a54), { grain: 'x' });
  sbox(b, s.a0, s.a1, s.y0, s.y1, s.b0, s.b1, IRONT, iron, { grain: 'x' });
  sbox(b, s.a0 - 0.02, s.a1 + 0.02, s.y1, s.y1 + 0.02, s.b0 - 0.02, s.b1 + 0.02, IRONT, iron.clone().offsetHSL(0, 0, -0.03), { grain: 'x' });
  for (const [a, c] of [[s.a0 + 0.04, s.b0 + 0.04], [s.a1 - 0.04, s.b0 + 0.04], [s.a0 + 0.04, s.b1 - 0.04], [s.a1 - 0.04, s.b1 - 0.04]]) sbox(b, a - 0.02, a + 0.02, 0.03, s.y0, c - 0.02, c + 0.02, IRONT, iron, { grain: 'y' });
  const mid = (s.b0 + s.b1) / 2;
  sbox(b, s.a1, s.a1 + 0.012, s.y0 + 0.07, s.y1 - 0.08, mid - 0.17, mid + 0.17, IRONT, C(0x2b2825), { grain: 'z' });
  sbox(b, s.a1 + 0.012, s.a1 + 0.04, s.y0 + 0.2, s.y0 + 0.23, mid + 0.08, mid + 0.14, TILE.METAL, C(0x6a6660));
  occ.push(sobb(s.a0, s.a1, s.y0, s.y1, s.b0, s.b1));
  const [pa, pb] = s.pipe;
  b.cyl(V(pa, s.y1 + 0.02, pb), V(pa, ceil(pa) + 0.01, pb), 0.075, 0.075, 10, IRONT, iron, {});
  b.cyl(V(pa, ceil(pa) - 0.02, pb), V(pa, ceil(pa), pb), 0.13, 0.13, 10, IRONT, C(0x4a4640), { cap0: true, capTile: TILE.METAL });
  // the kettle
  const ka = s.a1 - 0.18, kc = s.b1 - 0.14, ky = s.y1 + 0.02;
  b.cyl(V(ka, ky, kc), V(ka, ky + 0.11, kc), 0.1, 0.085, 10, TILE.PLAIN, C(0x3d5a6a), { cap1: true, capTile: TILE.PLAIN });
  b.tube([V(ka + 0.07, ky + 0.04, kc), V(ka + 0.13, ky + 0.09, kc), V(ka + 0.16, ky + 0.12, kc)], 0.014, 5, TILE.PLAIN, C(0x3d5a6a));
  const hd = []; for (let k = 0; k <= 8; k++) { const t = (k / 8) * Math.PI; hd.push(V(ka + Math.cos(t) * 0.07, ky + 0.11 + Math.sin(t) * 0.08, kc)); }
  b.tube(hd, 0.006, 4, TILE.PLAIN, C(0x2a2826));
  // the heat shield on the wall behind it
  sbox(b, -ST.iW, -ST.iW + 0.012, 0.12, 1.25, -3.4, -2.25, TILE.PLAIN, C(0x8d8c86), { grain: 'z' });
  for (const [y, c] of [[0.12, -2.25], [1.25, -2.25]]) { void c; sbox(b, -ST.iW + 0.012, -ST.iW + 0.03, y - 0.01, y + 0.01, -3.4, -2.25, TILE.PLAIN, C(0x6e6d68), { grain: 'z' }); }
  // the wood box with split wood in it
  const w = IN.wood, bw = C(0x7a5a3a);
  sbox(b, w.a0, w.a1, 0, 0.42, w.b0, w.b0 + 0.02, TILE.WOOD, bw, { grain: 'x' });
  sbox(b, w.a0, w.a1, 0, 0.42, w.b1 - 0.02, w.b1, TILE.WOOD, bw, { grain: 'x' });
  for (const a of [w.a0, w.a1 - 0.02]) sbox(b, a, a + 0.02, 0, 0.42, w.b0, w.b1, TILE.WOOD, bw, { grain: 'z' });
  sbox(b, w.a0, w.a1, 0, 0.03, w.b0, w.b1, TILE.WOOD, bw, { grain: 'x' });
  occ.push(sobb(w.a0, w.a1, 0, 0.42, w.b0, w.b1));
  for (let k = 0; k < 7; k++) {
    const a = w.a0 + 0.07 + (k % 3) * 0.12 + (rng() - 0.5) * 0.02, y = 0.08 + Math.floor(k / 3) * 0.1, r = 0.045 + rng() * 0.01;
    b.cyl(V(a, y + r * 0.6, w.b0 + 0.04), V(a + (rng() - 0.5) * 0.04, y + r * 0.6, w.b1 - 0.04), r, r * 0.95, 6, TILE.BARK, tone(0x6a5440, rng, 0.08), { arc: [Math.PI * 0.1, Math.PI * 1.9], cap0: true, cap1: true, capCol: C(0xc9b28e) });
  }
  // a chair by it, turned to the fire
  placed(b, turned(IN.chair.a, 0, IN.chair.b, 0.35), (t) => chair(t, rng));
}
// a plain kitchen chair in its own frame, facing -x (the seat's front at -x), the floor at y = 0
function chair(t, rng) {
  const wood = tone(0x7a5232, rng, 0.04), r = 0.2;
  t.box(V(0, 0.45, 0), AX, AY, AZ, r, 0.02, r, TILE.WOOD, wood, { grain: 'x' });
  for (const [x, z] of [[-r + 0.03, -r + 0.03], [-r + 0.03, r - 0.03], [r - 0.03, -r + 0.03], [r - 0.03, r - 0.03]]) t.box(V(x, 0.215, z), AX, AY, AZ, 0.016, 0.215, 0.016, TILE.WOOD, wood, { grain: 'y' });
  for (const z of [-r + 0.03, r - 0.03]) t.box(V(r - 0.03, 0.7, z), AX, AY, AZ, 0.016, 0.23, 0.016, TILE.WOOD, wood, { grain: 'y' });
  for (const y of [0.62, 0.78, 0.9]) t.box(V(r - 0.03, y, 0), AX, AY, AZ, 0.012, 0.03, r - 0.02, TILE.WOOD, wood, { grain: 'z' });
  t.box(V(0, 0.16, 0), AX, AY, AZ, r - 0.04, 0.01, 0.012, TILE.WOOD, wood, { grain: 'x' });
}
// up in the roof: a canoe upside down on the tie beams; the lamp on its cord from the ridge beam, an enamel shade over
// a bulb (the light sits just under it, so the shade's inside and the bulb glow)
function overhead(b, rng, occ) {
  const u = Math.abs(IN.ties[0]) / (HULL_LENGTH / 2), gw = hullProfile(u).g + 0.02;
  const g = hullGeo(C(0xb7834a), C(0x8a6440), C(0xc9b48a));
  g.applyMatrix4(new THREE.Matrix4().makeRotationY(-Math.PI / 2).multiply(new THREE.Matrix4().makeRotationX(Math.PI)).setPosition(IN.canoe.a, IN.tieY[1] + gw, 0));
  b.addBuilt(g);
  occ.push(obb(V(IN.canoe.a, IN.tieY[1] + 0.3, 0), AX, AY, AZ, 0.45, 0.3, 2.3));
  const L = IN.lamp, sTop = L.y + 0.2, sBot = L.y + 0.06, green = C(0x3f5a46), white = C(0xece6d6);
  b.cyl(V(L.a, ST.ridge - 0.25, L.b), V(L.a, sTop + 0.04, L.b), 0.004, 0.004, 4, TILE.PLAIN, C(0x2a2826), {});
  b.cyl(V(L.a, sTop, L.b), V(L.a, sTop + 0.05, L.b), 0.03, 0.025, 8, TILE.PLAIN, green, { cap1: true, capTile: TILE.PLAIN });
  const sides = 14, ring = (y, r) => Array.from({ length: sides + 1 }, (_, i) => { const t = (i / sides) * Math.PI * 2; return V(L.a + Math.cos(t) * r, y, L.b + Math.sin(t) * r); });
  const top = ring(sTop, 0.05), bot = ring(sBot, 0.21), lip = ring(sBot - 0.01, 0.215);
  for (let i = 0; i < sides; i++) {
    const out = V(L.a, sTop - 1, L.b);
    b.face([top[i], top[i + 1], bot[i + 1], bot[i]], TILE.PLAIN, green, { ref: V(L.a, sTop - 0.4, L.b) });
    b.face([top[i], top[i + 1], bot[i + 1], bot[i]], TILE.PLAIN, white, { ref: V(L.a + Math.cos((i + 0.5) / sides * 6.283) * 0.5, sTop + 0.2, L.b + Math.sin((i + 0.5) / sides * 6.283) * 0.5) });
    b.face([bot[i], bot[i + 1], lip[i + 1], lip[i]], TILE.PLAIN, green, { ref: out });
  }
  b.cyl(V(L.a, sTop - 0.02, L.b), V(L.a, L.y + 0.04, L.b), 0.016, 0.016, 6, TILE.PLAIN, C(0x8a8780), {});
  b.cyl(V(L.a, L.y + 0.075, L.b), V(L.a, L.y + 0.025, L.b), 0.03, 0.034, 8, TILE.PLAIN, C(0xfff2d0), { cap1: true, capTile: TILE.PLAIN, capCol: C(0xfff6e0) });
  void rng;
}
// the boards the painted signs are on (the letters are a texture of their own, per store): the shelf units' headers
// stand on two posts on their tops; the others are on the walls and the gear's top shelf
function signBoards(b) {
  const wood = C(0x5a3e28);
  for (const g of [IN.food, IN.tackle]) {
    const c = (g.b0 + g.b1) / 2;
    sbox(b, g.a - 0.012, g.a + 0.012, g.h + 0.02, g.h + 0.26, c - 0.58, c + 0.58, TILE.WOOD, wood, { grain: 'z' });
    for (const e of [-0.45, 0.45]) sbox(b, g.a - 0.015, g.a + 0.015, g.h, g.h + 0.05, c + e - 0.015, c + e + 0.015, TILE.WOOD, wood, { grain: 'y' });
  }
  for (const S of SIGNS) {
    if (S.text === 'GROCERIES' || S.text === 'TACKLE & BAIT') continue;
    const [na, nb] = S.n, hw = S.w / 2 + 0.03, hh = S.h / 2 + 0.03, d = 0.012, ca = S.a - na * d, cb = S.b - nb * d;
    sbox(b, ca - (na ? d : hw), ca + (na ? d : hw), S.y - hh, S.y + hh, cb - (nb ? d : hw), cb + (nb ? d : hw), TILE.WOOD, wood, { grain: na ? 'z' : 'x' });
  }
}
// the door, open into the store against the front wall; the rag rug inside it; paddles leaning on a rail by the door
function doorway(b, rng) {
  const D = DOOR, w = D.a1 - D.a0 - 0.03, h = D.y1 - 0.01, th = 0.045, ang = 1.62, hx = D.a0 + 0.02, hz = ST.iD - 0.03;
  const dir = V(Math.cos(ang), 0, -Math.sin(ang)), nrm = V(dir.z, 0, -dir.x);
  b.role = ROLE.DOOR;
  const P = (s, y, n) => V(hx + dir.x * s + nrm.x * n, y, hz + dir.z * s + nrm.z * n), dc = C(DEF_LOOK.door);
  b.box(P(w / 2, h / 2 + 0.005, 0), dir, AY, nrm, w / 2, h / 2, th / 2, TILE.PAINT, dc, { grain: 'y' });
  for (const n of [-1, 1]) {
    for (const [s, hs] of [[0.06, 0.05], [w - 0.06, 0.05]]) b.box(P(s, h / 2, n * (th / 2 + 0.006)), dir, AY, nrm, hs, h / 2 - 0.01, 0.006, TILE.PAINT, dc, { grain: 'y' });
    for (const y of [0.09, 0.98, h - 0.08]) b.box(P(w / 2, y, n * (th / 2 + 0.006)), dir, AY, nrm, w / 2 - 0.11, 0.06, 0.006, TILE.PAINT, dc, { grain: 'x' });
    b.box(P(w - 0.12, 1.0, n * (th / 2 + 0.03)), dir, AY, nrm, 0.02, 0.02, 0.025, TILE.METAL, C(0x8a7a5a));
  }
  b.role = ROLE.FIX;
  sbox(b, DOOR.a - 0.62, DOOR.a + 0.62, 0, 0.012, ST.iD - 1.15, ST.iD - 0.12, TILE.CANVAS, C(0x7a4a3a), { grain: 'z' });
  sbox(b, DOOR.a - 0.55, DOOR.a + 0.55, 0.012, 0.014, ST.iD - 1.08, ST.iD - 0.19, TILE.CANVAS, C(0x9a7a4a), { grain: 'z' });
  // the paddle rail inside the front wall, left of the door (as you face out), and four paddles leaning on it
  const rz = ST.iD - 0.045;
  sbox(b, -2.62, -1.12, 1.38, 1.44, rz - 0.03, rz + 0.03, TILE.WOOD, C(PINE_DARK), { grain: 'x' });
  [[-2.45, 0xb0895a], [-2.08, 0x9a7a50], [-1.72, 0xc29a62], [-1.36, 0x8a6a48]].forEach(([a, col], k) => {
    const pb = new PropBuilder(); paddle(pb, mulberry32(30 + k), C(col)); const pg = pb.build(), lean = 0.2;
    const Xp = V(0, -Math.cos(lean), -Math.sin(lean)), Yp = V(0, -Math.sin(lean), Math.cos(lean)), Zp = Xp.clone().cross(Yp);
    const tip = V(a, 0.004, rz - 0.06 - 1.4 * Math.sin(lean));
    pg.applyMatrix4(new THREE.Matrix4().makeBasis(Xp, Yp, Zp).setPosition(tip.clone().addScaledVector(Xp, -0.72)));
    b.addBuilt(pg);
  });
  void rng;
}

// The kit, built (and baked) a part at a time: a step generator, so the first store's tile spreads it over frames.
let storeKit = null;
export const storeStats = { kit: [], stores: {} }; // ms each part of the kit took, and each store's own steps
function* buildStoreKit() {
  propMaterial(); // the props' atlas, generated on first use (once a session, most of 0.1 s): a step of its own
  yield;
  const K = new KitAcc(), rng = mulberry32(9001), glass = new PropBuilder(), shell = shellBoxes();
  const part = (fn, opts, boxes = []) => {
    const t0 = performance.now(), b = new RoleBuilder(), occ = []; fn(b, occ); const t1 = performance.now(); bakePart(K, b, [...shell, ...boxes, ...occ], opts);
    storeStats.kit.push({ verts: b.count, build: +(t1 - t0).toFixed(1), bake: +(performance.now() - t1).toFixed(1) });
  };
  part((b) => shellOutside(b, glass, rng), { interior: false, rays: 10, reach: 1.0, floor: 0.35, ground: -0.75 });
  yield;
  part((b) => shellInside(b, rng), { rays: 8, reach: 0.8, floor: 0.4 });
  yield;
  part((b) => doorway(b, rng), { rays: 8, reach: 0.5, floor: 0.45 });
  yield;
  part((b, occ) => counter(b, rng, occ), { rays: 6, reach: 0.4, floor: 0.4 });
  yield;
  part((b, occ) => gondola(b, IN.food, 'food', rng, occ), { rays: 6, reach: 0.35, floor: 0.4 });
  yield;
  part((b, occ) => { gondola(b, IN.tackle, 'tackle', rng, occ); rodRack(b, IN.tackle, rng, occ); }, { rays: 6, reach: 0.35, floor: 0.4 });
  yield;
  part((b, occ) => gearWall(b, rng, occ), { rays: 6, reach: 0.4, floor: 0.4 });
  yield;
  part((b, occ) => mapTable(b, rng, occ), { rays: 6, reach: 0.35, floor: 0.4 });
  yield;
  part((b, occ) => { lureWall(b, rng, occ); boardFrame(b); }, { rays: 6, reach: 0.3, floor: 0.45 });
  yield;
  part((b, occ) => stoveCorner(b, rng, occ), { rays: 6, reach: 0.45, floor: 0.4 });
  yield;
  part((b, occ) => { overhead(b, rng, occ); signBoards(b); }, { rays: 6, reach: 0.6, floor: 0.45 });
  const kit = K.done();
  const gl = glass.build();
  kit.glass = { position: gl.getAttribute('position').array, normal: gl.getAttribute('normal').array, color: gl.getAttribute('color').array, aPropUv: gl.getAttribute('aPropUv').array, aPropTile: gl.getAttribute('aPropTile').array, aOcc: gl.getAttribute('aOcc').array };
  storeKit = kit;
}

// --- a store at its landing ---------------------------------------------------------------------------------------
// The layouts of the stores built, by entry point (storeLayout), and who wants to hear when one is built or dropped.
const stores = new Map();
const storeHeard = [];
const storeNews = []; // built in this tile's steps: told once the tile is in (its obstacles with it)
// The layout of entry point ep's store (its number, or its world.entryPoints record) once its tile has built it, else
// null: { ep, name, look, floorY, inside(x, z), door: { x, z, y, heading }, counter, board, wall, shelves: [{ kind,
// x, z }], mapTable, keeper: { x, z, heading }, lamp: { x, y, z }, dockSide: { x, z }, dockLand: { x, z }, centre }.
// World metres; a heading is player.heading's (forward = (cos h, -sin h)). door is the spot on the stoop or porch just
// outside the threshold, heading in; counter, board, wall, mapTable and each shelf is the floor spot in front of it (heading
// toward it, `at` the thing itself, y absolute); keeper stands behind the counter facing the room.
export function storeLayout(ep) { const n = ep && typeof ep === 'object' ? ep.ep : Number(ep); return stores.get(n) || null; }
export function storeLayouts() { return [...stores.values()]; }
// fn(layout, ep) when a store is built (and at once for those already built), fn(null, ep) when its tile lets it go
export function onStore(fn) {
  storeHeard.push(fn);
  for (const L of stores.values()) fn(L, L.ep);
  return () => { const i = storeHeard.indexOf(fn); if (i >= 0) storeHeard.splice(i, 1); };
}
function tellStore(L, ep) { for (const fn of storeHeard) { try { fn(L, ep); } catch (e) { console.warn('onStore', e); } } }
function flushStoreNews() {
  if (!storeNews.length) return;
  const news = storeNews.splice(0);
  queueMicrotask(() => { for (const L of news) if (stores.get(L.ep) === L) tellStore(L, L.ep); });
}

// The cork board inside the door: a canvas of cork with the outfitter's notices pinned on it (setStoreNotices, from the
// board's live notices: tasks.js board(ep)), or a few scribbled papers until then.
const BOARD_PX = [1024, 768];
function drawBoard(cv, notices = null) {
  const x = cv.getContext('2d'), [W, H] = BOARD_PX, r = mulberry32(5 + (notices ? notices.length : 0));
  x.fillStyle = '#a47a4e'; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 2600; i++) { const v = r(); x.fillStyle = v < 0.5 ? `rgba(70,45,25,${0.12 + r() * 0.15})` : `rgba(215,175,125,${0.1 + r() * 0.12})`; x.fillRect(r() * W, r() * H, 2 + r() * 3, 2 + r() * 3); }
  const slots = [[40, 36], [532, 52], [56, 404], [540, 392]], list = notices || [null, { scribble: 1 }, { scribble: 2 }, null];
  list.slice(0, 4).forEach((t, i) => {
    const [px, py] = slots[i], w = 430, h = 330, rot = (r() - 0.5) * 0.06, pin = ['#b83a2a', '#3a5a8a', '#d8b03a', '#3f6a45'][i];
    x.save(); x.translate(px + w / 2, py + h / 2); x.rotate(rot);
    if (!t) { // a bare pin, a torn corner left on it
      x.fillStyle = '#e8e0c8'; x.beginPath(); x.moveTo(-14, -h / 2 + 4); x.lineTo(26, -h / 2 + 2); x.lineTo(8, -h / 2 + 40); x.closePath(); x.fill();
    } else {
      x.fillStyle = 'rgba(40,25,10,0.28)'; x.fillRect(-w / 2 + 8, -h / 2 + 10, w, h);
      x.fillStyle = t.taken ? '#e4dcc4' : '#efe8d4'; x.fillRect(-w / 2, -h / 2, w, h);
      x.fillStyle = '#2b2218'; x.textAlign = 'left'; x.textBaseline = 'top';
      if (t.scribble) {
        x.strokeStyle = 'rgba(40,32,24,0.75)'; x.lineWidth = 3;
        for (let k = 0; k < 6; k++) { const y = -h / 2 + 50 + k * 42, len = (k === 0 ? 0.55 : 0.75 + r() * 0.2) * (w - 70); x.beginPath(); x.moveTo(-w / 2 + 34, y); for (let s = 0; s < len; s += 18) x.lineTo(-w / 2 + 34 + s, y + Math.sin(s * 0.3 + k) * 3); x.stroke(); }
      } else {
        let size = 40; x.font = `700 ${size}px Georgia, "Times New Roman", serif`;
        while (x.measureText(t.title || '').width > w - 50 && size > 22) { size -= 2; x.font = `700 ${size}px Georgia, "Times New Roman", serif`; }
        x.fillText(t.title || '', -w / 2 + 24, -h / 2 + 26);
        x.font = 'italic 25px Georgia, "Times New Roman", serif';
        const words = String(t.text || '').split(/\s+/); let line = '', y = -h / 2 + 34 + size, n = 0;
        for (const wd of words) {
          const tryL = line ? `${line} ${wd}` : wd;
          if (x.measureText(tryL).width > w - 48) { x.fillText(line, -w / 2 + 24, y); y += 31; line = wd; if (++n >= 6) { line = ''; break; } } else line = tryL;
        }
        if (line && n < 6) x.fillText(line, -w / 2 + 24, y);
        if (t.sign) { x.font = '22px Georgia, "Times New Roman", serif'; x.textAlign = 'right'; x.fillText(`— ${t.sign}`, w / 2 - 22, h / 2 - 44); }
        if (t.taken) { x.save(); x.rotate(-0.2); x.strokeStyle = 'rgba(150,40,30,0.8)'; x.lineWidth = 5; x.strokeRect(-70, -26, 140, 52); x.fillStyle = 'rgba(150,40,30,0.85)'; x.font = '700 30px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('TAKEN', 0, 1); x.restore(); }
      }
    }
    x.fillStyle = pin; x.beginPath(); x.arc(0, -h / 2 + 18, 11, 0, Math.PI * 2); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.45)'; x.beginPath(); x.arc(-3, -h / 2 + 15, 4, 0, Math.PI * 2); x.fill();
    x.restore();
  });
}
// Pin up entry point ep's notices on its store's board (tasks.js board(ep): a notice, or null for a bare pin). A notice
// reads { title, text, sign } and `taken` when it is out with you.
export function setStoreNotices(ep, notices) {
  const L = storeLayout(ep);
  if (!L || !L.boardCanvas) return false;
  const list = (notices || []).map((t) => (t ? { title: t.title, text: t.text, sign: t.sign, taken: !!t.status && t.status !== 'offered' } : null));
  drawBoard(L.boardCanvas, list);
  L.boardTex.needsUpdate = true;
  return true;
}

// copy arrays of the store's frame (a, y, b) into the tile's (origin O, axes X and Z), colours scaled per look role
function placeArrays(src, O, X, Z, ratio = null, roles = null) {
  const n = src.position.length / 3, p = new Float32Array(n * 3), nr = new Float32Array(n * 3), c = new Float32Array(src.color);
  const P = src.position, N = src.normal;
  for (let i = 0; i < n; i++) {
    const a = P[i * 3], y = P[i * 3 + 1], b = P[i * 3 + 2], na = N[i * 3], ny = N[i * 3 + 1], nb = N[i * 3 + 2];
    p[i * 3] = O.x + X.x * a + Z.x * b; p[i * 3 + 1] = O.y + y; p[i * 3 + 2] = O.z + X.z * a + Z.z * b;
    nr[i * 3] = X.x * na + Z.x * nb; nr[i * 3 + 1] = ny; nr[i * 3 + 2] = X.z * na + Z.z * nb;
    if (ratio && roles[i]) { const k = ratio[roles[i]]; c[i * 3] *= k[0]; c[i * 3 + 1] *= k[1]; c[i * 3 + 2] *= k[2]; }
  }
  return { position: p, normal: nr, color: c, aPropUv: src.aPropUv, aPropTile: src.aPropTile, aOcc: src.aOcc };
}
function joinArrays(list) {
  const g = new THREE.BufferGeometry();
  for (const [k, size] of [['position', 3], ['normal', 3], ['color', 3], ['aPropUv', 2], ['aPropTile', 1], ['aOcc', 1]]) {
    const total = list.reduce((s, a) => s + a[k].length, 0), out = new Float32Array(total);
    let o = 0; for (const a of list) { out.set(a[k], o); o += a[k].length; }
    g.setAttribute(k, new THREE.BufferAttribute(out, size));
  }
  g.computeBoundingSphere();
  return g;
}
const arraysOf = (g) => ({ position: g.getAttribute('position').array, normal: g.getAttribute('normal').array, color: g.getAttribute('color').array, aPropUv: g.getAttribute('aPropUv').array, aPropTile: g.getAttribute('aPropTile').array, aOcc: g.getAttribute('aOcc').array });

// The roof's cover over the sheathing, by the look's kind: shingles (the atlas's courses), standing-seam steel (a rib
// every 40 cm), or cedar shakes (the courses bigger and rougher); a ridge cap over the top.
function roofCover(b, kind, col, rng) {
  const th = ST.th, f0 = ST.bE, f1 = -ST.bE, y = (a) => sheath(a) + th;
  for (const s of [-1, 1]) {
    const e = s * ST.aE, U = s > 0 ? AZ : AZ.clone().negate();
    const pts = [V(0, y(0), f0), V(0, y(0), f1), V(e, y(e), f1), V(e, y(e), f0)];
    if (kind === 'steel') {
      b.face(pts, TILE.PLAIN, col, { ref: V(0, ST.eave, 0), U });
      const along = V(e, y(e) - y(0), 0), L = along.length(); along.normalize();
      const up = AZ.clone().cross(along).normalize(); if (up.y < 0) up.negate();
      for (let c = f1 + 0.2; c < f0 - 0.1; c += 0.4) b.box(V(e / 2, (y(0) + y(e)) / 2, c).addScaledVector(up, 0.012), along, up, AZ, L / 2, 0.012, 0.008, TILE.PLAIN, col.clone().offsetHSL(0, 0, 0.03), { grain: 'x' });
    } else b.face(pts, TILE.ROOF, col, { ref: V(0, ST.eave, 0), U, o: V(e, y(e), s > 0 ? f0 : f1), shift: [rng(), 0], scale: kind === 'shake' ? 1.45 : 1 });
    // the eave's edge and the gable ends of the cover
    b.face([V(e, y(e), f1), V(e, y(e), f0), V(e, y(e) - th, f0), V(e, y(e) - th, f1)], TILE.WOOD, col.clone().offsetHSL(0, 0, -0.06), { ref: V(0, y(e), 0) });
    for (const f of [f0, f1]) b.face([V(0, y(0), f), V(e, y(e), f), V(e, y(e) - th, f), V(0, y(0) - th, f)], TILE.WOOD, col.clone().offsetHSL(0, 0, -0.06), { ref: V(e / 2, y(e / 2), 0) });
    const along = V(e, y(e) - y(0), 0); along.normalize();
    const up = AZ.clone().cross(along).normalize(); if (up.y < 0) up.negate();
    b.box(V(s * 0.07, y(0) + 0.014 - 0.07 * ST.tp, 0), along, up, AZ, 0.085, 0.014, ST.bE + 0.03, kind === 'steel' ? TILE.PLAIN : TILE.ROOF, col.clone().offsetHSL(0, 0, -0.05), { grain: 'z' });
  }
}

const STEP_RISE = 0.165, STEP_RUN = 0.28;
// The porch across the front (look.porch) or a stoop at the door, at the floor's height less 4 cm, and its steps down to
// the ground: as many even risers (at most STEP_RISE) as it takes to meet the ground at their foot. g(a, b): the ground in
// the store's frame. Returns { deck: [a0, a1, b0, b1], treads: [{ a0, a1, b0, b1, y }], posts: [[a, b]] } for the walker.
function porchAndSteps(b, porch, g, look, rng, occ) {
  const ys = -0.04, d = porch ? 1.8 : 1.2, a0 = porch ? -ST.hW - 0.1 : DOOR.a - 0.85, a1 = porch ? ST.hW + 0.1 : DOOR.a + 0.85, s0 = ST.hD, s1 = ST.hD + d;
  const out = { deck: [a0, a1, s0, s1], treads: [], posts: [] }, deck = C(0x8f8576), frameC = C(0x6a6255);
  // the deck: planks across, on a rim joist; posts down to the ground under its front edge
  for (let s = s0 + 0.005; s < s1 - 0.02;) {
    const w = 0.13 + rng() * 0.03, e = Math.min(s1, s + w), col = tone(0x8f8576, rng, 0.08);
    const k = Math.max(1, Math.ceil((a1 - a0) / 1.6));
    for (let j = 0; j < k; j++) { const p0 = a0 + ((a1 - a0) * j) / k, p1 = a0 + ((a1 - a0) * (j + 1)) / k; sbox(b, p0, p1, ys - 0.035, ys, s, e, TILE.WOOD, col, { grain: 'x', skip: ['-y', ...(j > 0 ? ['-x'] : []), ...(j < k - 1 ? ['+x'] : [])], shift: [rng() * 3, rng() * 3] }); }
    s = e + 0.008;
  }
  sbox(b, a0, a1, ys - 0.2, ys - 0.035, s1 - 0.04, s1, TILE.WOOD, frameC, { grain: 'x' });
  for (const a of [a0, a1 - 0.04]) sbox(b, a, a + 0.04, ys - 0.2, ys - 0.035, s0, s1, TILE.WOOD, frameC, { grain: 'z' });
  occ.push(sobb(a0, a1, ys - 0.2, ys, s0, s1));
  const postsA = porch ? [-ST.hW - 0.02, -1.3, 0.8, ST.hW + 0.02] : [a0 + 0.08, a1 - 0.08];
  let gmin = Infinity;
  for (const a of postsA) {
    const pb = s1 - 0.1, gy = g(a, pb) - 0.3; gmin = Math.min(gmin, gy + 0.3);
    sbox(b, a - 0.045, a + 0.045, gy, ys - 0.2, pb - 0.045, pb + 0.045, TILE.WOOD, frameC, { grain: 'y' });
  }
  // the dark under the deck
  // a low deck is skirted with boards; a high one stands open on its posts, braced
  if (ys - gmin < 0.75) skirt(b, [[a0 + 0.06, s0], [a0 + 0.06, s1 - 0.06], [a1 - 0.06, s1 - 0.06], [a1 - 0.06, s0]], ys - 0.19, g, rng, V((a0 + a1) / 2, 0, (s0 + s1) / 2 - 0.3));
  else for (let k = 0; k < postsA.length - 1; k++) {
    const pa = postsA[k], qa = postsA[k + 1], pb = s1 - 0.1, top = ys - 0.22, bot = Math.max(g(pa, pb), g(qa, pb)) + 0.25;
    if (top - bot < 0.4) continue;
    const p0 = V(pa, top, pb + 0.06), p1 = V(qa, bot, pb + 0.06), along = p1.clone().sub(p0), L = along.length(); along.normalize();
    const up = AZ.clone().cross(along).normalize(); if (up.y < 0) up.negate();
    b.box(p0.clone().add(p1).multiplyScalar(0.5), along, up, AZ, L / 2, 0.045, 0.02, TILE.WOOD, frameC, { grain: 'x' });
  }
  if (porch) {
    // posts up to a header, the roof sloping from the wall to it, a ceiling under, the cover by the look
    const yw = 2.6, yf = 2.3, sF = s1 + 0.2, roofY = (s) => yw + ((yf - yw) * (s - s0)) / (sF - s0), hb = s1 - 0.1, hTop = roofY(hb) - ST.th - 0.02;
    for (const a of postsA) { sbox(b, a - 0.055, a + 0.055, ys, hTop - 0.14, hb - 0.055, hb + 0.055, TILE.WOOD, tone(0x8a7c68, rng, 0.04), { grain: 'y', endTile: TILE.END }); out.posts.push([a, hb]); }
    sbox(b, a0 - 0.05, a1 + 0.05, hTop - 0.14, hTop, hb - 0.06, hb + 0.06, TILE.PAINT, C(look.trim), { grain: 'x' });
    sbox(b, a0 - 0.05, a1 + 0.05, roofY(sF) - 0.14, roofY(sF), sF, sF + 0.025, TILE.PAINT, C(look.trim), { grain: 'x' });
    const slope = V(0, yf - yw, sF - s0).normalize(), upv = V(0, slope.z, -slope.y);
    const L = Math.hypot(sF - s0, yf - yw), mid = V(0, (yw + yf) / 2, (s0 + sF) / 2);
    for (let a = a0 + 0.1; a < a1; a += 0.8) b.box(V(a, mid.y - ST.th - 0.06, mid.z), AX, upv, slope, 0.022, 0.06, L / 2, TILE.WOOD, C(0x9a8a72), { grain: 'z' });
    b.face([V(a0 - 0.05, yw - ST.th, s0), V(a1 + 0.05, yw - ST.th, s0), V(a1 + 0.05, yf - ST.th, sF), V(a0 - 0.05, yf - ST.th, sF)], TILE.WOOD, C(0xb09a7a), { ref: V(0, 9, s0 + 1), U: AX });
    const col = C(look.roof), roofPts = [V(a0 - 0.05, yw, s0), V(a1 + 0.05, yw, s0), V(a1 + 0.05, yf, sF), V(a0 - 0.05, yf, sF)];
    if (look.roofKind === 'steel') {
      b.face(roofPts, TILE.PLAIN, col, { ref: V(0, 0, s0 + 1), U: slope });
      for (let a = a0 + 0.15; a < a1; a += 0.4) b.box(V(a, mid.y + 0.012, mid.z), AX, upv, slope, 0.008, 0.012, L / 2, TILE.PLAIN, col.clone().offsetHSL(0, 0, 0.03), { grain: 'z' });
    } else b.face(roofPts, TILE.ROOF, col, { ref: V(0, 0, s0 + 1), U: AX, scale: look.roofKind === 'shake' ? 1.45 : 1 });
    b.face([V(a0 - 0.05, yf, sF), V(a1 + 0.05, yf, sF), V(a1 + 0.05, yf - ST.th, sF), V(a0 - 0.05, yf - ST.th, sF)], TILE.WOOD, col.clone().offsetHSL(0, 0, -0.06), { ref: V(0, yf, s0) });
    for (const a of [a0 - 0.05, a1 + 0.05]) b.face([V(a, yw, s0), V(a, yf, sF), V(a, yf - ST.th - 0.12, sF), V(a, yw - ST.th - 0.12, s0)], TILE.WOOD, C(0x8a7c68), { ref: V(0, yw, s0 + 0.5) });
    occ.push(obb(mid.clone().addScaledVector(upv, -ST.th / 2), AX, upv, slope, (a1 - a0) / 2 + 0.05, ST.th, L / 2));
    // a bench under the front window
    const bw = C(0x7a6a52);
    sbox(b, 1.0, 2.45, 0.42, 0.46, s0 + 0.22, s0 + 0.58, TILE.WOOD, bw, { grain: 'x' });
    for (const a of [1.08, 2.37]) sbox(b, a - 0.03, a + 0.03, ys, 0.42, s0 + 0.25, s0 + 0.55, TILE.WOOD, bw, { grain: 'y' });
    out.bench = [1.0, 2.45, s0 + 0.2, s0 + 0.6];
  }
  // the steps, centred on the door: risers of at most STEP_RISE, so the tread two up is still within the walker's step
  // (player.js: 0.35 m) and does not hold him off the one between
  const run = STEP_RUN, sw = porch ? 0.62 : 0.55, ca = DOOR.a;
  let rises = 1, rh = ys - g(ca, s1 + 0.25);
  for (let n = 1; n <= 20; n++) { rises = n; rh = (ys - g(ca, s1 + (n - 1) * run + 0.25)) / n; if (rh <= STEP_RISE) break; }
  const treads = rh * rises > 0.25 ? rises - 1 : 0, gFront = ys - rh * rises;
  for (let k = 1; k <= treads; k++) {
    const ty = ys - k * rh, ts = s1 + (k - 0.5) * run;
    sbox(b, ca - sw, ca + sw, ty - 0.035, ty, ts - run / 2 - 0.01, ts + run / 2 + 0.01, TILE.WOOD, tone(0x8f8576, rng, 0.08), { grain: 'x', shift: [rng() * 3, rng() * 3] });
    sbox(b, ca - sw + 0.02, ca + sw - 0.02, ty - rh, ty - 0.035, ts - run / 2 + 0.005, ts - run / 2 + 0.03, TILE.WOOD, frameC, { grain: 'x' });
    out.treads.push({ a0: ca - sw, a1: ca + sw, b0: ts - run / 2, b1: ts + run / 2, y: ty });
  }
  if (treads) for (const side of [-1, 1]) {
    const p0 = V(ca + side * (sw - 0.03), ys - 0.06, s1), p1 = V(ca + side * (sw - 0.03), gFront - 0.05, s1 + treads * run + 0.05), along = p1.clone().sub(p0), L = along.length(); along.normalize();
    const up = AX.clone().cross(along).normalize(); if (up.y < 0) up.negate();
    b.box(p0.clone().add(p1).multiplyScalar(0.5).addScaledVector(up, -0.06), along, up, AX, L / 2, 0.1, 0.02, TILE.WOOD, frameC, { grain: 'x' });
  }
  out.foot = s1 + treads * run;
  // a railing round a deck that stands high (the gap left for the steps), and handrails down a long flight
  out.rails = [];
  const high = ys - Math.min(g(a0 + 0.1, s1 - 0.1), g(ca, s1 - 0.1), g(a1 - 0.1, s1 - 0.1));
  if (high > 0.75) {
    const rail = tone(0x8a7c68, rng, 0.04), ry = ys + 0.92, my = ys + 0.48;
    const runs = [[[a0 + 0.04, s0 + 0.05], [a0 + 0.04, s1 - 0.04]], [[a0 + 0.04, s1 - 0.04], [ca - sw - 0.04, s1 - 0.04]], [[ca + sw + 0.04, s1 - 0.04], [a1 - 0.04, s1 - 0.04]], [[a1 - 0.04, s1 - 0.04], [a1 - 0.04, s0 + 0.05]]];
    for (const [[pa, pc], [qa, qc]] of runs) {
      const L = Math.hypot(qa - pa, qc - pc); if (L < 0.2) continue;
      const along = V(qa - pa, 0, qc - pc).normalize(), side = V(along.z, 0, -along.x), mid = V((pa + qa) / 2, 0, (pc + qc) / 2);
      for (const [y, h] of [[ry, 0.03], [my, 0.022]]) b.box(mid.clone().setY(y), along, AY, side, L / 2, h, 0.025, TILE.WOOD, rail, { grain: 'x', endTile: TILE.END });
      const n = Math.max(1, Math.round(L / 1.4));
      for (let k = 0; k <= n; k++) { const t = k / n, x = pa + (qa - pa) * t, z = pc + (qc - pc) * t; sbox(b, x - 0.035, x + 0.035, ys, ry, z - 0.035, z + 0.035, TILE.WOOD, rail, { grain: 'y', endTile: TILE.END }); }
      out.rails.push([Math.min(pa, qa) - 0.04, Math.max(pa, qa) + 0.04, Math.min(pc, qc) - 0.04, Math.max(pc, qc) + 0.04]);
    }
  }
  if (treads >= 4) for (const side of [-1, 1]) {
    const a = ca + side * (sw + 0.03), p0 = V(a, ys + 0.9, s1), p1 = V(a, gFront + 0.9, s1 + treads * run), along = p1.clone().sub(p0), L = along.length(); along.normalize();
    const up = AX.clone().cross(along).normalize(); if (up.y < 0) up.negate();
    b.box(p0.clone().add(p1).multiplyScalar(0.5), along, up, AX, L / 2 + 0.03, 0.025, 0.025, TILE.WOOD, tone(0x8a7c68, rng, 0.04), { grain: 'x', endTile: TILE.END });
    for (const t of [0, 0.5, 1]) { const q = p0.clone().lerp(p1, t), gy = t === 1 ? gFront - 0.05 : ys - (t * treads + 0.5) * rh; sbox(b, a - 0.03, a + 0.03, gy, q.y, q.z - 0.03, q.z + 0.03, TILE.WOOD, tone(0x8a7c68, rng, 0.04), { grain: 'y' }); }
  }
  return out;
}

// A skirt of boards round the gap under a floor: down from y0 to a little into the ground along the polyline pts (in the
// store's frame), facing away from `inside`, in pieces a metre or so long that follow the ground.
function skirt(b, pts, y0, g, rng, inside, stone = false) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [a0, c0] = pts[i], [a1, c1] = pts[i + 1], L = Math.hypot(a1 - a0, c1 - c0), k = Math.max(1, Math.ceil(L / 1.0)), col = stone ? tone(0x8d877d, rng, 0.06) : tone(0x6f665a, rng, 0.05);
    for (let j = 0; j < k; j++) {
      const t0 = j / k, t1 = (j + 1) / k, pa = a0 + (a1 - a0) * t0, pc = c0 + (c1 - c0) * t0, qa = a0 + (a1 - a0) * t1, qc = c0 + (c1 - c0) * t1;
      const gp = g(pa, pc) - 0.08, gq = g(qa, qc) - 0.08;
      if (gp >= y0 && gq >= y0) continue;
      if (stone) b.face([V(pa, Math.min(gp, y0), pc), V(qa, Math.min(gq, y0), qc), V(qa, y0, qc), V(pa, y0, pc)], TILE.STONE, col, { ref: inside, U: V(qa - pa, 0, qc - pc), scale: 0.7, shift: [rng() * 3, rng() * 3] });
      else b.face([V(pa, Math.min(gp, y0), pc), V(qa, Math.min(gq, y0), qc), V(qa, y0, qc), V(pa, y0, pc)], TILE.WOOD, col, { ref: inside, U: AY, scale: 1.6, shift: [rng() * 3, rng() * 3] });
    }
  }
}
// what the store stands on: a skirt of boards round the crawl space under the sill, down into the ground, and a stone
// at each corner where it meets the ground; on a bank, where the floor stands over a metre up, a fieldstone wall
function foundation(b, g, rng, high) {
  const hw = ST.hW - 0.05, hd = ST.hD - 0.05;
  skirt(b, [[-hw, hd], [hw, hd], [hw, -hd], [-hw, -hd], [-hw, hd]], ST.base + 0.02, g, rng, V(0, 0, 0), high);
  for (const [a, c] of [[-ST.hW, -ST.hD], [ST.hW, -ST.hD], [-ST.hW, ST.hD], [ST.hW, ST.hD]]) {
    const gy = g(a, c);
    if (gy < ST.base - 0.05) chunkStone(b, new THREE.Matrix4().makeRotationY(rng() * 6.28).scale(V(0.26, 0.22, 0.26)).setPosition(a, gy - 0.06, c), rng, tone(0x8e8780, rng, 0.08, 0.02));
  }
}

// a woodpile along the right wall, under the eave: split rounds stacked across two skids
function woodpile(b, g, rng, occ) {
  const a0 = ST.hW + 0.14, a1 = ST.hW + 0.64, c0 = -3.3, c1 = -0.5;
  let base = -Infinity;
  for (let c = c0; c <= c1; c += 0.4) for (const a of [a0, a1]) base = Math.max(base, g(a, c));
  base += 0.1;
  for (const a of [a0 + 0.1, a1 - 0.1]) {
    sbox(b, a - 0.05, a + 0.05, base - 0.1, base, c0, c1, TILE.BARK, tone(0x5b4a3b, rng, 0.06), { grain: 'z' });
    for (const c of [c0 + 0.2, (c0 + c1) / 2, c1 - 0.2]) { const gy = g(a, c); if (base - 0.1 > gy) sbox(b, a - 0.06, a + 0.06, gy - 0.1, base - 0.1, c - 0.06, c + 0.06, TILE.WOOD, C(0x6e665a), { grain: 'y' }); }
  }
  const rows = 4;
  for (let j = 0; j < rows; j++) {
    let c = c0 + 0.08 + (j % 2) * 0.05;
    while (c < c1 - 0.08) {
      const r = 0.055 + rng() * 0.02, y = base + 0.06 + j * 0.125 + r * 0.6;
      if (j === rows - 1 && rng() < 0.3) { c += 2 * r + 0.01; continue; }
      b.cyl(V(a0 - 0.02 + rng() * 0.03, y, c + r), V(a1 + rng() * 0.03, y + (rng() - 0.5) * 0.02, c + r + (rng() - 0.5) * 0.03), r, r * 0.95, 6, TILE.BARK, tone(0x5f4c3a, rng, 0.1), { arc: rng() < 0.5 ? [Math.PI * 0.15, Math.PI * 1.85] : null, cap0: true, cap1: true, capCol: tone(0xc9b28e, rng, 0.08), phase: rng() * 6 });
      c += 2 * r + 0.012;
    }
  }
  occ.push(sobb(a0, a1, base, base + rows * 0.125, c0, c1));
  return [a0 - 0.05, a1 + 0.05, c0, c1];
}

// --- a store's yard: no tree, shrub, log or rock stands in it ---------------------------------------------------
// The mown yard round a landing (exclusionsFor) is centred on the entry point's own spot, which for some lies far out
// on the lake (Moose Lake's is 125 m out), so a store could stand in the woods with a pine through its porch. Each store
// keeps a yard (its footprint with room round it, the porch and the steps, a path down to the dock), and every tile's
// props step lets go of the vegetation standing in a yard: its instances are zeroed (drawn as nothing; tiles.js
// prepares their culling again) and its trunks and rocks moved out of the walker's way.
const yards = [];
function inYard(Y, x, z) {
  const dx = x - Y.x, dz = z - Y.z, a = dx * Y.ax + dz * Y.az, b = dx * Y.bx + dz * Y.bz;
  for (const [a0, a1, b0, b1] of Y.rects) if (a >= a0 && a <= a1 && b >= b0 && b <= b1) return true;
  return false;
}
function clearYards(e, list, size) {
  if (!e || !e.veg || e.ox === undefined) return 0;
  const near = list.filter((Y) => Y.x + Y.r > e.ox && Y.x - Y.r < e.ox + size && Y.z + Y.r > e.oz && Y.z - Y.r < e.oz + size);
  if (!near.length) return 0;
  const hit = (x, z) => near.some((Y) => inYard(Y, x, z));
  let n = 0;
  for (const vm of e.veg) {
    if (vm.userData.sp === undefined) continue; // the lake plants
    const A = vm.instanceMatrix.array, N = vm.instanceMatrix.count;
    let any = false;
    for (let i = 0; i < N; i++) {
      const o = i * 16;
      if (A[o] === 0 && A[o + 5] === 0 && A[o + 10] === 0) continue;
      if (hit(A[o + 12] + e.ox, A[o + 14] + e.oz)) { A.fill(0, o, o + 16); any = true; n++; }
    }
    if (!any) continue;
    const l = vm.userData.lod;
    for (const m of [vm, ...(l && l.groups && l.groups.meshes ? l.groups.meshes : [])]) {
      m.instanceMatrix.needsUpdate = true;
      const st = m.userData.cull;
      if (st) { st.ready = false; for (const P of [st.view, st.c0, st.c1]) if (P) P.userData.sigN = -1; }
    }
  }
  const C = e.collide;
  if (C) {
    const T = C.trunks, R = C.rocks;
    for (let o = 0; o < T.length; o += 3) if (hit(T[o] + e.ox, T[o + 1] + e.oz)) { T[o] = -1e7; T[o + 1] = -1e7; }
    for (let o = 0; o < R.length; o += 15) if (hit(R[o] + e.ox, R[o + 2] + e.oz)) { R[o] = -1e7; R[o + 2] = -1e7; if (e.shapes) e.shapes.delete(o / 15); }
  }
  return n;
}

// Where a store stands in its landing's frame F: { ao, b0, floorY, rise } (see buildStore).
function storeSite(ctx, F, ep, dock, pd) {
  const lawn = 31, steps = (floorY, ao, b0) => {
    const ys = floorY - 0.04, front = b0 + ST.hD + pd, rise = ys - F.G(ao + DOOR.a, front + 0.4);
    return front + Math.max(0, Math.ceil(rise / STEP_RISE) - 1) * STEP_RUN;
  };
  let best = null;
  for (let b0 = -10.5; b0 >= -26; b0 -= 1) for (const ao of [0, -2.5, 2.5, -5, 5, -7.5, 7.5, -10, 10]) {
    let gmax = -Infinity, gmin = Infinity, bad = false, wild = 0;
    for (let a = -ST.hW - 0.2; a <= ST.hW + 0.25 && !bad; a += 1.6) for (let c = -ST.hD; c <= ST.hD + pd + 0.01; c += 1.45) {
      const [wx, wz] = F.W(ao + a, b0 + c);
      if (ctx.tg.shoreAt(wx, wz) < 1.5) { bad = true; break; }
      if (Math.hypot(wx - ep.x, wz - ep.z) > lawn) wild = 0.3; // out of the mown yard: the woods are cleared for it
      if (c <= ST.hD) { const y = F.G(ao + a, b0 + c); gmax = Math.max(gmax, y); gmin = Math.min(gmin, y); }
    }
    if (bad) continue;
    const floorY = Math.max(gmax + 0.3, gmin + 0.45), foot = steps(floorY, ao, b0);
    const [fx, fz] = F.W(ao + DOOR.a, foot + 0.3);
    if (ctx.tg.shoreAt(fx, fz) < 0.5) continue; // the steps' foot in the water
    if (foot > dock.back - 1.5 && Math.abs(ao + DOOR.a) < dock.hw + 1.6) continue; // onto the dock
    const score = floorY - gmin + wild + 0.06 * Math.abs(b0 + 12) + 0.05 * Math.abs(ao);
    if (!best || score < best.score) best = { score, ao, b0, floorY, rise: +(floorY - gmin).toFixed(2) };
  }
  if (best) return best;
  // nowhere fits: straight back from the dock, far enough for its steps
  let b0 = Math.min(-11, dock.back - 2.4 - pd - ST.hD), floorY = 0;
  for (let it = 0; it < 6; it++) {
    let gmax = -Infinity, gmin = Infinity;
    for (let a = -ST.hW; a <= ST.hW + 1e-6; a += 1) for (let c = -ST.hD; c <= ST.hD + 1e-6; c += 1) { const y = F.G(a, b0 + c); gmax = Math.max(gmax, y); gmin = Math.min(gmin, y); }
    floorY = Math.max(gmax + 0.3, gmin + 0.45);
    const foot = steps(floorY, 0, b0);
    if (foot <= dock.back - 1.5) return { ao: 0, b0, floorY, rise: +(floorY - gmin).toFixed(2), fallback: true };
    b0 -= foot - (dock.back - 1.5) + 0.05;
  }
  return { ao: 0, b0, floorY, fallback: true };
}

// The store at its landing: where it stands (back from the dock's land end by the porch or stoop, its steps and a path's
// width; the floor a little over the highest ground under it), the kit turned into place and recoloured, the parts
// built here, the sign over the door and the cork board, the walker's obstacles and the layout.
function* buildStore(ctx, F, rng, ep, group, pieces, dock) {
  if (!storeKit) yield* buildStoreKit();
  const t0 = performance.now(), took = storeStats.stores[ep.ep] = [];
  const look = lookOf(ep, ctx.world), porch = !!look.porch, name = outfitterName(ep), K = storeKit;
  // Where it stands: of the spots back from the dock and to either side of it, the one whose floor stands least over the
  // ground under it, that is dry, inside the outfitter's mown yard (exclusionsFor: 36 m round the landing, so no tree
  // stands in it), and whose steps come down behind the dock's land end or beside it. ao: across, b0: back (its centre).
  const pd = porch ? 1.8 : 1.2, site = storeSite(ctx, F, ep, dock, pd);
  const { ao, b0, floorY } = site;
  const G = (a, bb) => F.G(ao + a, bb);
  const gC = (a, c) => G(a, b0 + c) - floorY; // the ground in the store's frame
  const O = F.P(ao, floorY, b0), X = F.X, Z = F.Z, ratio = (() => {
    const d = roleColours(DEF_LOOK), l = roleColours(look);
    return [null, 1, 2, 3, 4].map((k) => (k ? [l[k].r / Math.max(1e-4, d[k].r), l[k].g / Math.max(1e-4, d[k].g), l[k].b / Math.max(1e-4, d[k].b)] : null));
  })();
  // the parts built here, in the store's frame
  const b = new RoleBuilder(), occ = [...shellBoxes()];
  roofCover(b, look.roofKind, C(look.roof), rng);
  const pr = porchAndSteps(b, porch, gC, look, rng, occ);
  foundation(b, gC, rng, -Math.min(gC(-ST.hW, ST.hD), gC(ST.hW, ST.hD), gC(0, ST.hD), gC(-ST.hW, -ST.hD), gC(ST.hW, -ST.hD)) > 1.0);
  const pile = woodpile(b, gC, rng, occ);
  const here = b.build();
  occlude(here, occ, { ground: (a, c) => gC(a, c), rays: 8, reach: 0.9, floor: 0.35 });
  const hereRoles = b.r;
  took.push(+(performance.now() - t0).toFixed(1));
  yield;
  const t1 = performance.now();
  const geo = joinArrays([placeArrays(K, O, X, Z, ratio, K.r), placeArrays(arraysOf(here), O, X, Z, ratio, hereRoles)]);
  const mesh = new THREE.Mesh(geo, propMaterial());
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.name = `store ${ep.ep}`;
  group.add(mesh);
  const glass = new THREE.Mesh(joinArrays([placeArrays(K.glass, O, X, Z)]), propMaterial());
  glass.castShadow = false; glass.receiveShadow = true; glass.matrixAutoUpdate = false; glass.name = `store ${ep.ep} glass`;
  group.add(glass);
  // the name over the door, and the cork board inside it
  const at = (a, y, c) => F.P(ao + a, floorY + y, b0 + c), yawOf = (v) => Math.atan2(v.x, v.z);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.5), signMaterial(name));
  sign.position.copy(at(0, 3.12, ST.hD + 0.056)); sign.rotation.y = yawOf(Z);
  sign.receiveShadow = true; sign.matrixAutoUpdate = false; sign.updateMatrix();
  group.add(sign);
  const B = IN.board, cv = document.createElement('canvas'); cv.width = BOARD_PX[0]; cv.height = BOARD_PX[1];
  drawBoard(cv);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const cork = new THREE.Mesh(new THREE.PlaneGeometry(B.b1 - B.b0, B.y1 - B.y0), makeToonMaterial({ vertexColors: false, map: tex, side: THREE.DoubleSide }));
  cork.position.copy(at(ST.iW - 0.02, (B.y0 + B.y1) / 2, (B.b0 + B.b1) / 2)); cork.rotation.y = yawOf(X.clone().negate());
  cork.receiveShadow = true; cork.matrixAutoUpdate = false; cork.updateMatrix(); cork.name = `store ${ep.ep} board`;
  group.add(cork);
  // the sheet spread on the map table, flat on its top, the long way along the store
  {
    const M = IN.maps, q = new THREE.Quaternion().setFromAxisAngle(AY, yawOf(Z)).multiply(new THREE.Quaternion().setFromAxisAngle(AX, -Math.PI / 2));
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.74), mapSheetMaterial());
    sheet.position.copy(at((M.a0 + M.a1) / 2 + 0.02, M.h + 0.003, (M.b0 + M.b1) / 2 - 0.16)); sheet.quaternion.copy(q);
    sheet.receiveShadow = true; sheet.matrixAutoUpdate = false; sheet.updateMatrix(); sheet.name = `store ${ep.ep} map`;
    group.add(sheet);
  }
  for (const S of SIGNS) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(S.w, S.h), shelfSignMaterial(S.text));
    m.position.copy(at(S.a + S.n[0] * 0.002, S.y, S.b + S.n[1] * 0.002));
    m.rotation.y = yawOf(X.clone().multiplyScalar(S.n[0]).addScaledVector(Z, S.n[1]));
    m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix(); m.name = `store ${ep.ep} sign ${S.text}`;
    group.add(m);
  }
  // the walker: the walls (a gap at the door), the floor and the porch or stoop and each step to stand on, what stands
  // inside, the porch posts, the woodpile, the rack
  const box = (a0, a1, c0, c1, top) => {
    const [x, z] = F.W(ao + (a0 + a1) / 2, b0 + (c0 + c1) / 2), o = { x, z, ux: X.x, uz: X.z, hx: Math.abs(a1 - a0) / 2, hz: Math.abs(c1 - c0) / 2, box: true };
    if (top !== undefined) o.top = floorY + top;
    ctx.obstacles.push(o);
  };
  const I = IN;
  box(-ST.hW, DOOR.a0, ST.iD, ST.hD); box(DOOR.a1, ST.hW, ST.iD, ST.hD);
  box(ST.iW, ST.hW, -ST.hD, ST.hD); box(-ST.hW, -ST.iW, -ST.hD, ST.hD); box(-ST.hW, ST.hW, -ST.hD, -ST.iD);
  box(-ST.hW, ST.hW, -ST.hD, ST.hD, 0);
  box(pr.deck[0], pr.deck[1], pr.deck[2], pr.deck[3], -0.04);
  for (const t of pr.treads) box(t.a0, t.a1, t.b0, t.b1, t.y);
  for (const g of [I.food, I.tackle]) box(g.a - g.d / 2, g.a + g.d / 2, g.b0, g.b1 + (g.rack || 0));
  box(I.gear.a0, I.gear.a1, I.gear.b0, I.gear.b1);
  box(I.maps.a0, I.maps.a1, I.maps.b0, I.maps.b1);
  box(I.counter.a0 - 0.04, I.counter.a1, I.counter.b0, I.counter.b1 + 0.05);
  box(I.stove.a0, I.stove.a1, I.stove.b0, I.stove.b1);
  box(I.wood.a0, I.wood.a1, I.wood.b0, I.wood.b1);
  box(DOOR.a0 - 0.08, DOOR.a0 + 0.02, ST.iD - 1.12, ST.iD); // the open door
  { const [x, z] = F.W(ao + I.chair.a, b0 + I.chair.b); ctx.obstacles.push({ x, z, r: 0.26 }); }
  for (const [a, c] of pr.posts) { const [x, z] = F.W(ao + a, b0 + c); ctx.obstacles.push({ x, z, r: 0.08 }); }
  if (pr.bench) box(...pr.bench);
  for (const r of pr.rails) box(...r);
  box(...pile);
  pieces.push(...buildRack(ctx, F, rng, ao + (ao > 1 ? ST.hW + 2.3 : -(ST.hW + 2.3)), b0 + 1.2));
  // the yard: the store and its porch, steps, rack and woodpile with room round them, and a path down to the dock
  {
    const foot = pr.foot, dockC = dock.back - b0, pa0 = Math.min(DOOR.a, -ao) - 1.8, pa1 = Math.max(DOOR.a, -ao) + 1.8;
    const rects = [[-ST.hW - 4.2, ST.hW + 4.2, -ST.hD - 4, foot + 1.5], [pa0, pa1, foot, Math.max(foot, dockC + 1)]];
    const r = Math.max(...rects.flatMap(([a0, a1, c0, c1]) => [Math.hypot(a0, c0), Math.hypot(a1, c0), Math.hypot(a0, c1), Math.hypot(a1, c1)]));
    const [yx, yz] = F.W(ao, b0), Y = { ep: ep.ep, x: yx, z: yz, ax: X.x, az: X.z, bx: Z.x, bz: Z.z, rects, r };
    const i = yards.findIndex((q) => q.ep === ep.ep);
    if (i >= 0) yards[i] = Y; else yards.push(Y);
    const T = ctx.world.tiles, size = ctx.world.tileMetres;
    let cleared = clearYards(ctx.entry, [Y], size);
    if (T && T.tiles) for (const e of T.tiles.values()) if (e !== ctx.entry && e.state === 'ready') cleared += clearYards(e, [Y], size);
    site.cleared = cleared;
  }
  // the layout
  const cx = F.W(ao, b0)[0], cz = F.W(ao, b0)[1];
  const W2 = (a, c) => { const [x, z] = F.W(ao + a, b0 + c); return { x, z }; };
  const at3 = (a, y, c) => { const [x, z] = F.W(ao + a, b0 + c); return { x, y: floorY + y, z }; };
  const heading = (da, dc) => { const dx = X.x * da + Z.x * dc, dz = X.z * da + Z.z * dc; return Math.atan2(-dz, dx); };
  const L = {
    ep: ep.ep, name, look, floorY, site, centre: { x: cx, z: cz }, front: heading(0, 1), axes: { a: { x: X.x, z: X.z }, b: { x: Z.x, z: Z.z } }, size: { hW: ST.hW, hD: ST.hD, iW: ST.iW, iD: ST.iD },
    inside: (x, z) => { const dx = x - cx, dz = z - cz, a = dx * X.x + dz * X.z, c = dx * Z.x + dz * Z.z; return Math.abs(a) < ST.iW && Math.abs(c) < ST.iD; },
    door: { ...W2(DOOR.a, ST.hD + 0.45), y: floorY - 0.04, heading: heading(0, -1) },
    counter: { ...W2(0.6, I.counter.b1 + 0.6), heading: heading(0, -1), at: at3(1.1, I.counter.h, (I.counter.b0 + I.counter.b1) / 2) },
    keeper: { ...W2(1.0, (I.counter.b0 + I.back.b1) / 2), heading: heading(0, 1) },
    board: { ...W2(ST.iW - 0.62, (B.b0 + B.b1) / 2), heading: heading(1, 0), at: at3(ST.iW - 0.02, (B.y0 + B.y1) / 2, (B.b0 + B.b1) / 2) },
    wall: { ...W2(-ST.iW + 0.62, (I.pegs.b0 + I.pegs.b1) / 2), heading: heading(-1, 0), at: at3(-ST.iW + 0.05, (I.pegs.y0 + I.pegs.y1) / 2, (I.pegs.b0 + I.pegs.b1) / 2) },
    shelves: [
      { kind: 'food', ...W2(I.food.a - I.food.d / 2 - 0.6, 0.2), heading: heading(1, 0), at: at3(I.food.a - I.food.d / 2, 0.8, 0.2) },
      { kind: 'tackle', ...W2(I.tackle.a - I.tackle.d / 2 - 0.6, 0.4), heading: heading(1, 0), at: at3(I.tackle.a - I.tackle.d / 2, 0.8, 0.4) },
      { kind: 'gear', ...W2(I.gear.a0 - 0.6, (I.gear.b0 + I.gear.b1) / 2), heading: heading(1, 0), at: at3(I.gear.a0, 1.0, (I.gear.b0 + I.gear.b1) / 2) },
    ],
    mapTable: { ...W2(I.maps.a0 - 0.6, (I.maps.b0 + I.maps.b1) / 2), heading: heading(1, 0), at: at3((I.maps.a0 + I.maps.a1) / 2, I.maps.h, (I.maps.b0 + I.maps.b1) / 2) },
    lamp: at3(I.lamp.a, I.lamp.y, I.lamp.b),
    dockSide: (() => { const [x, z] = F.W(dock.hw + 1.3, dock.len * 0.65); return { x, z }; })(),
    dockLand: (() => { const [x, z] = F.W(0, dock.back + 0.5); return { x, z }; })(),
    stepsFoot: W2(DOOR.a, pr.foot + 0.6),
    boardCanvas: cv, boardTex: tex, mesh, glass,
  };
  stores.set(ep.ep, L);
  storeNews.push(L);
  took.push(+(performance.now() - t1).toFixed(1));
  geo.addEventListener('dispose', () => { if (stores.get(ep.ep) === L) { stores.delete(ep.ep); tellStore(null, ep.ep); } tex.dispose(); });
}

// The canoe rack: two timber trestles, posts set in the ground, two cross bars each on knee braces, tied
// along the bottom; a canoe upside down on each pair of bars, along the rack, bows to the lake.
const HULL_COLOURS = [0xc5a46e, 0x5b7a5a, 0x9c4b3b, 0xa9aca8, 0x4d6a82];
let hullOcc = null;
function hullGeo(shell, wood, cane) {
  const b = new PropBuilder();
  buildHull(b, shell, shell.clone().offsetHSL(0, -0.05, 0.06), wood, cane);
  const g = b.build();
  if (!hullOcc) { const w = new PropBuilder(); const W = C(0xffffff); buildHull(w, W, W, W, W); const wg = w.build(); bakeSelf(wg, { rays: 10, reach: 0.6, floor: 0.35 }); hullOcc = wg.getAttribute('aOcc').array.slice(); }
  g.getAttribute('aOcc').array.set(hullOcc);
  return g;
}
function buildRack(ctx, F, rng, ra, rb) {
  const b = new PropBuilder(), occ = [], out = [];
  const tb = [rb - 1.25, rb + 1.25], pa = [ra - 0.62, ra + 0.62];
  let base = -Infinity;
  for (const s of tb) for (const a of pa) base = Math.max(base, F.G(a, s));
  const timber = tone(0x8a7c68, rng, 0.05), lo = base + 0.66, hi = base + 1.36, top = base + 1.6;
  ctx.obstacles.push({ x: F.W(ra, rb)[0], z: F.W(ra, rb)[1], ux: F.Z.x, uz: F.Z.z, hx: 2.6, hz: 0.75, box: true });
  for (const s of tb) {
    for (const a of pa) {
      const g = F.G(a, s) - 0.4;
      b.box(F.P(a, (g + top) / 2, s), F.X, F.Y, F.Z, 0.05, (top - g) / 2, 0.05, TILE.WOOD, tone(0x8a7c68, rng, 0.06), { grain: 'y', endTile: TILE.END });
    }
    for (const y of [lo, hi]) {
      b.box(F.P(ra, y, s + 0.075), F.X, F.Y, F.Z, 0.74, 0.065, 0.025, TILE.WOOD, timber, { grain: 'x', endTile: TILE.END });
      for (const side of [-1, 1]) { // knee braces under the bar from each post
        const p0 = F.P(ra + side * 0.57, y - 0.36, s + 0.075), p1 = F.P(ra + side * 0.27, y - 0.06, s + 0.075), along = p1.clone().sub(p0), L = along.length(); along.normalize();
        const up = F.Z.clone().cross(along).normalize();
        b.box(p0.clone().add(p1).multiplyScalar(0.5), along, up, F.Z, L / 2, 0.035, 0.02, TILE.WOOD, timber, { grain: 'x' });
      }
      occ.push(obb(F.P(ra, y, s + 0.075), F.X, F.Y, F.Z, 0.74, 0.065, 0.025));
    }
  }
  for (const side of [-1, 1]) b.box(F.P(ra + side * 0.695, base + 0.36, rb), F.X, F.Y, F.Z, 0.02, 0.06, 1.38, TILE.WOOD, timber, { grain: 'z' });
  // the hulls: upside down, gunwales on the bars
  const pick = Math.floor(rng() * HULL_COLOURS.length), cols = [HULL_COLOURS[pick], HULL_COLOURS[(pick + 1 + Math.floor(rng() * (HULL_COLOURS.length - 1))) % HULL_COLOURS.length]];
  const yaw = Math.atan2(-F.Z.z, F.Z.x), u = 1.25 / 2.5, gw = hullProfile(u).g + 0.025;
  const hulls = [];
  [lo, hi].forEach((y, k) => {
    const g = hullGeo(tone(cols[k], rng, 0.04), tone(0x5e4530, rng, 0.05), C(0xb39b74));
    const m = new THREE.Matrix4().makeRotationY(yaw).multiply(new THREE.Matrix4().makeRotationX(Math.PI)).setPosition(F.P(ra, y + 0.065 + gw, rb + (rng() - 0.5) * 0.2));
    g.applyMatrix4(m);
    hulls.push(g);
    occ.push(obb(F.P(ra, y + 0.065 + 0.33, rb), F.Z, F.Y, F.X, 2.35, 0.3, 0.4));
  });
  const geo = b.build();
  occlude(geo, occ, { ground: localGround(ctx), rays: 10, reach: 0.8, floor: 0.32 });
  out.push(geo);
  for (const [k, g] of hulls.entries()) { occlude(g, occ.filter((o, i) => i !== occ.length - 2 + k), { ground: localGround(ctx), rays: 8, reach: 0.9, floor: 0.4 }); out.push(g); }
  return out;
}

// --- campsites -------------------------------------------------------------------------------------------------
// A BWCA site: the steel fire grate on its legs in a ring of rocks, higher at the back, ash and charred ends
// in it; a split-log bench on two rounds; the latrine box back in the woods; the granite ledge down to the water.
// No tent: you pitch your own (camp.js), on the flattest clear spot by the ring, which the site keeps as
// c.layout = { fire: { x, z, y, a }, pad: { x, z, fdx, fdz }, bench: { x, z, ax, az } } in world metres (fire.a:
// the grate's bearing; pad.fd: the way the door faces, to the fire; bench.a: along the log). Recorded when the
// site's tile builds its props (the same every time: the search reads the drawn ground).
function buildCampsite(ctx, c, pieces, ledges) {
  const { tg, ox, oz, H } = ctx;
  const crng = mulberry32(7 + Math.round(c.x) * 31 + Math.round(c.z) * 17);
  const a = hash2(Math.round(c.x), Math.round(c.z), 5) * 6.28;
  const dir = tg.deeperDir(c.x, c.z);
  const fx = c.x - dir.x * (c.shore < 4 ? 6 : 0), fz = c.z - dir.z * (c.shore < 4 ? 6 : 0), fy = H(fx, fz);
  const L = (x, y, z) => V(x - ox, y, z - oz);
  ctx.obstacles.push({ x: fx, z: fz, r: 1.0 });
  const b = new PropBuilder(), occ = [];
  // the ring: rocks round the grate, bigger and doubled at the back (away from the water)
  const n = 11 + Math.floor(crng() * 3), backX = -dir.x, backZ = -dir.z;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * 6.28 + (crng() - 0.5) * 0.25, ux = Math.cos(t), uz = Math.sin(t), r = 0.8 + (crng() - 0.5) * 0.1;
    const back = ux * backX + uz * backZ, s = (0.12 + crng() * 0.05) * (back > 0.3 ? 1.25 : 1);
    const x = fx + ux * r, z = fz + uz * r;
    stone(b, L(x, H(x, z) - s * 0.3, z), s, Math.atan2(-uz, ux) + (crng() - 0.5) * 0.8, crng, { up: 1.8, deep: 1.3 });
    if (back > 0.45) stone(b, L(x + ux * 0.04, H(x, z) + s * 0.55, z + uz * 0.04), s * 0.85, crng() * 6.28, crng, { up: 1.6, deep: 1.2 });
  }
  // ash and charcoal in the ring, a low mound
  const rings = [0, 0.3, 0.66], segs = 10, ash = C(0xffffff), pt = (rr, k) => { const t = (k / segs) * 6.28, x = fx + Math.cos(t) * rr, z = fz + Math.sin(t) * rr; return L(x, H(x, z) + 0.012 + 0.035 * (1 - (rr / 0.66) ** 2), z); };
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < segs; k++) {
    const q = [pt(rings[i], k), pt(rings[i], k + 1), pt(rings[i + 1], k + 1), pt(rings[i + 1], k)];
    const uv = q.map((p) => [(p.x + ox) / 0.9, (p.z + oz) / 0.9]);
    if (i === 0) b.face([q[0], q[2], q[3]], TILE.ASH, ash, { ref: L(fx, fy - 1, fz), uvs: [uv[0], uv[2], uv[3]] });
    else b.face(q, TILE.ASH, ash, { ref: L(fx, fy - 1, fz), uvs: uv });
  }
  for (let k = 0; k < 2; k++) { // charred ends of wood
    const t = crng() * 6.28, l = 0.45 + crng() * 0.25, r = 0.05 + crng() * 0.025, cx = fx + (crng() - 0.5) * 0.3, cz = fz + (crng() - 0.5) * 0.3;
    const p0 = L(cx - Math.cos(t) * l / 2, H(cx, cz) + r * 0.7 + k * 0.03, cz - Math.sin(t) * l / 2), p1 = L(cx + Math.cos(t) * l / 2, H(cx, cz) + r * 0.7 + k * 0.03, cz + Math.sin(t) * l / 2);
    b.cyl(p0, p1, r, r * 0.9, 6, TILE.BARK, C(0x2b2724), { cap0: true, cap1: true, capCol: C(0x7d766c), phase: crng() });
  }
  // the grate: a frame of flat bar, round bars across it, angle-iron legs into the ground, a back rail
  const gy = fy + 0.3, ga = Math.atan2(backZ, backX), gX = V(-Math.sin(ga), 0, Math.cos(ga)), gZ = V(Math.cos(ga), 0, Math.sin(ga)), Y = V(0, 1, 0), iron = C(0xffffff);
  const GP = (u, y, w) => L(fx + gX.x * u + gZ.x * w, y, fz + gX.z * u + gZ.z * w);
  for (const w of [-0.26, 0.26]) b.box(GP(0, gy, w), gX, Y, gZ, 0.42, 0.014, 0.012, TILE.METAL, iron, { grain: 'x' });
  for (const u of [-0.41, 0.41]) b.box(GP(u, gy, 0), gX, Y, gZ, 0.012, 0.014, 0.26, TILE.METAL, iron, { grain: 'z' });
  for (let k = 0; k < 9; k++) { const u = -0.36 + k * 0.09; b.cyl(GP(u, gy + 0.012, -0.25), GP(u, gy + 0.012, 0.25), 0.008, 0.008, 4, TILE.METAL, iron, {}); }
  for (const [u, w] of [[-0.4, -0.25], [0.4, -0.25], [-0.4, 0.25], [0.4, 0.25]]) { const x = fx + gX.x * u + gZ.x * w, z = fz + gX.z * u + gZ.z * w, g = H(x, z) - 0.22; b.box(L(x, (g + gy) / 2, z), gX, Y, gZ, 0.016, (gy - g) / 2, 0.016, TILE.METAL, iron, { grain: 'y' }); }
  b.cyl(GP(-0.41, gy + 0.16, 0.26), GP(0.41, gy + 0.16, 0.26), 0.009, 0.009, 4, TILE.METAL, iron, {});
  for (const u of [-0.41, 0.41]) b.box(GP(u, gy + 0.08, 0.26), gX, Y, gZ, 0.01, 0.08, 0.01, TILE.METAL, iron, { grain: 'y' });
  // the bench: a split log, flat face up, on two rounds standing in the ground
  const bx = fx + Math.cos(a) * 2.6, bz = fz + Math.sin(a) * 2.6, ax = -Math.sin(a), az = Math.cos(a);
  ctx.obstacles.push({ x: bx, z: bz, ux: ax, uz: az, hx: 1.1, hz: 0.25, box: true });
  const rounds = [-0.72, 0.72].map((t) => { const x = bx + ax * t, z = bz + az * t; return { x, z, g: H(x, z) }; });
  const rTop = Math.max(rounds[0].g, rounds[1].g) + 0.26, bark = tone(0x5b4a3b, crng, 0.06);
  for (const r of rounds) b.cyl(L(r.x, r.g - 0.25, r.z), L(r.x, rTop, r.z), 0.19, 0.18, 9, TILE.BARK, bark, { cap1: true, capCol: C(0xc9c2b4), jitter: 0.1, rng: crng });
  const lr = 0.17, ly = rTop + lr;
  b.cyl(L(bx - ax * 1.05, ly, bz - az * 1.05), L(bx + ax * 1.05, ly + 0.01, bz + az * 1.05), lr, lr * 0.93, 7, TILE.BARK, bark, { arc: [Math.PI, Math.PI * 2], flatTile: TILE.SPLIT, flatCol: tone(0xb39e80, crng, 0.06), cap0: true, cap1: true, capCol: C(0xc9c2b4), up: Y });
  occ.push(obb(L(bx, ly - lr / 2, bz), V(ax, 0, az), Y, V(az, 0, -ax), 1.05, lr / 2, lr));
  const geo = b.build();
  occlude(geo, occ, { ground: localGround(ctx), rays: 8, reach: 0.6, floor: 0.4, bury: 0.15 });
  pieces.push(geo);
  // a granite ledge between the fire ring and the water
  if (c.shore < 30) campLedge(tg, c, fx, fz, dir, ox, oz, ledges, ctx.obstacles, H);
  // the tent pad: the flattest clear spot nearby (off the ledge rocks, on dry ground), door to the fire
  const rocks = [...ledges[0], ...ledges[1]].map((m) => ({ x: m.elements[12] + ox, z: m.elements[14] + oz, r: Math.hypot(m.elements[0], m.elements[1], m.elements[2]) }));
  let best = null;
  for (let k = 0; k < 10; k++) {
    const ta = a + 2.2 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.55, cx = fx + Math.cos(ta) * 6, cz = fz + Math.sin(ta) * 6;
    if (tg.shoreAt(cx, cz) < 2.5) continue;
    if (rocks.some((q) => Math.hypot(q.x - cx, q.z - cz) < q.r + 1.7)) continue;
    let lo = Infinity, hi = -Infinity;
    for (const [u, v] of [[-1.2, -1.2], [1.2, -1.2], [1.2, 1.2], [-1.2, 1.2], [0, 0]]) { const h = H(cx + u, cz + v); lo = Math.min(lo, h); hi = Math.max(hi, h); }
    const score = hi - lo + k * 0.02;
    if (!best || score < best.score) best = { score, x: cx, z: cz };
  }
  const tx = best ? best.x : fx + Math.cos(a + 2.2) * 6, tz = best ? best.z : fz + Math.sin(a + 2.2) * 6;
  let fdx = fx - tx, fdz = fz - tz; const fl = Math.hypot(fdx, fdz) || 1; fdx /= fl; fdz /= fl;
  c.layout = { fire: { x: fx, z: fz, y: fy, a: ga }, pad: { x: tx, z: tz, fdx, fdz }, bench: { x: bx, z: bz, ax, az } };
  // the latrine back in the trees, away from the water
  const la = Math.atan2(backZ, backX) + (crng() - 0.5) * 1.2, lx = fx + Math.cos(la) * 15, lz = fz + Math.sin(la) * 15;
  if (tg.shoreAt(lx, lz) > 3) { pieces.push(latrine(ctx, lx, lz, la, crng)); c.layout.latrine = { x: lx, z: lz }; } // hubs 3A: E at the box (camp.js)
}

// The granite ledge of a campsite, between the fire ring (fx, fz) and the water (dir points out to it): two or
// three stacks of layered flats lying along the slope, one big and the others smaller, or now and then a group
// of slanted rocks at one tilt (one big shard, the rest smaller) standing off to one side so the way from the
// landing to the fire stays open (those hold the walker off, the low flats are walked over). Every rock is
// seated on the drawn ground (H, the game's ground query) as placement.js seats the rocks of the woods on the
// mesh. Matrices go to ledges[0] (flats) and ledges[1] (slanted), tile-local.
function campLedge(tg, c, fx, fz, dir, ox, oz, ledges, obstacles, H = null) {
  const r = mulberry32((hash2(Math.round(c.x), Math.round(c.z), 13) * 4294967296) >>> 0);
  const ground = H || ((x, z) => meshHeightAt(tg, x, z));
  const place = (kind, x, z, az, tilt, spin, s, sq, tall) => {
    const y = seatRock(ground, ROCK_FOOT[kind], x, z, s, sq, tall, spin, az, tilt, tg.slopeAt(x, z));
    return new THREE.Matrix4().makeRotationY(az).multiply(new THREE.Matrix4().makeRotationZ(tilt)).multiply(new THREE.Matrix4().makeRotationY(spin))
      .scale(new THREE.Vector3(s * sq, s * tall, s * (2 - sq))).setPosition(x - ox, y, z - oz);
  };
  const kx = -dir.z, kz = dir.x; // along the shore
  if (r() < 0.25) {
    const az = r() * Math.PI * 2, tilt = 0.32 + r() * 0.3, side = r() < 0.5 ? -1 : 1, n = 2 + Math.floor(r() * 4);
    let o = 3 + r() * 1.5;
    for (let i = 0; i < n; i++) {
      const s = i === 0 ? 1.5 + r() * 0.8 : 0.45 + r() * 0.6, t = 3.5 + r() * 2;
      const x = fx + dir.x * t + kx * side * o, z = fz + dir.z * t + kz * side * o;
      o += s * (1.0 + r() * 0.5);
      if (tg.shoreAt(x, z) < -1.5) continue;
      ledges[1].push(ledgeRock(obstacles, 1, place(ROCK_KIND.block, x, z, az, tilt, (r() - 0.5) * 0.5, s, 0.85 + r() * 0.3, 0.85 + r() * 0.3), ox, oz, 1.7 * s));
    }
    return;
  }
  const n = 2 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const t = 2.5 + i * 2.8 + r() * 1.5, side = (r() - 0.5) * 7, s = i === 0 ? 1.4 + r() * 0.8 : 0.7 + r() * 0.7;
    const x = fx + dir.x * t + kx * side, z = fz + dir.z * t + kz * side;
    if (tg.shoreAt(x, z) < -1.5) continue;
    const bed = bedding(tg, x, z), tilt = Math.min(0.4, bed.angle * 0.85);
    ledges[0].push(ledgeRock(obstacles, 0, place(ROCK_KIND.slab, x, z, bed.angle < 0.04 ? r() * Math.PI * 2 : bed.az, tilt, r() * Math.PI * 2, s, 0.85 + r() * 0.3, 0.8 + r() * 0.3), ox, oz, 1.3 * s));
  }
}

// A ledge rock (matrix m, tile-local) to the walker: its own geometry where it stands, as the rocks of the woods are
// (collide.js RockShape; the low flats are stepped onto, the big shards stop him at their edge). Returns m.
function ledgeRock(obstacles, k, m, ox, oz, reach) {
  const e = m.elements, rec = [e[12], e[13], e[14], reach, 0, 0, e[0], e[1], e[2], e[4], e[5], e[6], e[8], e[9], e[10]];
  obstacles.push({ x: e[12] + ox, z: e[14] + oz, r: reach, rock: true, shape: new RockShape(ledgeGeos[k], rec, 0, ox, oz) });
  return m;
}

// The dome tent, a two-person one, built in its own frame (x along it, z across, the door at +z, y up from the
// ground): a rounded-rectangle dome for the fly, the vestibule bulging out over the door, the inner tent showing
// under the fly's hem, guy lines out to stakes; its occlusion baked once. Pitched by camp.js (buildTentMesh,
// tentPose) on the slope of the drawn ground where it stands. The flies come in muted colours.
export const TENT_COLOURS = [0xa8693f, 0x5c7a55, 0x56708a, 0xa8925f, 0x8d4f45];
const TA = 1.15, TB = 0.82, TH = 1.12;
export const TENT_SIZE = { a: TA, b: TB, h: TH }; // half length, half width, height (m)
let tentOcc = null;
function tentBuild(fly, inner, line, peg) {
  const b = new PropBuilder(), S = 16, K = 5;
  const foot = (t) => { const c = Math.cos(t), s = Math.sin(t); return [TA * Math.sign(c) * Math.abs(c) ** 0.62, TB * Math.sign(s) * Math.abs(s) ** 0.62]; };
  const hY = (r) => TH * Math.max(0, 1 - r ** 2.6) ** 0.55;
  const rHem = 0.997; // where the fly comes down to a hand's width off the ground
  const door = (t) => { const dt = ((((t - Math.PI / 2) % 6.2832) + 9.4248) % 6.2832) - 3.1416; return Math.exp(-((dt / 0.55) ** 2)); };
  // the panels sag a little between the poles (which run corner to corner, at t = pi/4 + k pi/2)
  const sag = (t, r) => 1 - 0.045 * Math.sin(2 * (t - Math.PI / 4)) ** 2 * sm(0.15, 0.6, r) * (1 - sm(0.85, 1, r));
  const flyPt = (t, r) => { const [fx, fz] = foot(t), k = (1.05 + 0.55 * door(t) * sm(0.45, 1.0, r / rHem)) * sag(t, r); return V(fx * r * k, (hY(r) + 0.035) * (0.97 + 0.03 * sag(t, r)) - 0.12 * door(t) * sm(0.7, 1.0, r / rHem), fz * r * k); };
  const grid = [];
  for (let i = 0; i <= K; i++) { const r = (i / K) ** 0.85 * rHem, row = []; for (let k = 0; k <= S; k++) row.push(flyPt((k / S) * 6.2832 + Math.PI / 4, r)); grid.push(row); }
  const seam = (k) => (k % 4 === 0 ? 0.84 : 1); // the poles' sleeves, corner to corner
  const nrm = (i, k) => {
    const a = grid[Math.min(K, i + 1)][k].clone().sub(grid[Math.max(0, i - 1)][k]), c = grid[i][(k + 1) % S].clone().sub(grid[i][(k - 1 + S) % S]);
    const n = c.cross(a).normalize(); const p = grid[i][k]; if (n.dot(V(p.x, p.y - 0.35, p.z)) < 0) n.negate(); if (i === 0) n.set(0, 1, 0); return n;
  };
  const N = grid.map((row, i) => row.map((_, k) => nrm(i, k % S)));
  for (let i = 0; i < K; i++) for (let k = 0; k < S; k++) {
    const q = [[i, k], [i, k + 1], [i + 1, k + 1], [i + 1, k]];
    // the door panel on the vestibule a shade darker, zipped down its middle
    const col = (ii, kk) => { const t = (kk / S) * 6.2832 + Math.PI / 4, dz = door(t) * sm(0.35, 0.6, ii / K); return fly.clone().multiplyScalar(seam(kk) * (1 - 0.05 * (ii / K)) * (1 - 0.14 * dz)); };
    const tri = (ids) => {
      const P = ids.map(([ii, kk]) => grid[ii][kk]), e = P[1].clone().sub(P[0]).cross(P[2].clone().sub(P[0])), nn = N[ids[0][0]][ids[0][1]];
      const order = e.dot(nn.clone().add(N[ids[2][0]][ids[2][1]])) >= 0 ? [0, 1, 2] : [0, 2, 1];
      for (const o of order) { const [ii, kk] = ids[o], p = grid[ii][kk]; b.vert(p, N[ii][kk], (kk / S) * 7, ii / K * 1.3, TILE.CANVAS, col(ii, kk)); }
    };
    tri([q[0], q[1], q[2]]); tri([q[0], q[2], q[3]]);
  }
  // the pole sleeves over the fly, hem to hem across the top, and the door's zip
  const sleeve = fly.clone().multiplyScalar(0.62);
  for (const t0 of [Math.PI / 4, Math.PI * 3 / 4]) {
    const line = [];
    for (let i = K; i >= 0; i--) line.push(flyPt(t0 + Math.PI, (i / K) ** 0.85 * rHem));
    for (let i = 1; i <= K; i++) line.push(flyPt(t0, (i / K) ** 0.85 * rHem));
    b.tube(line.map((p) => p.clone().add(V(p.x * 0.012, 0.012, p.z * 0.012))), 0.011, 4, TILE.CANVAS, sleeve);
  }
  const zip = []; for (let i = 2; i <= K; i++) { const p = flyPt(Math.PI / 2, (i / K) ** 0.85 * rHem); zip.push(p.add(V(0, 0.003, 0.006))); }
  b.tube(zip, 0.005, 3, TILE.PLAIN, fly.clone().multiplyScalar(0.5));
  // the inner tent's walls under the hem
  for (let k = 0; k < S; k++) {
    const t0 = (k / S) * 6.2832, t1 = ((k + 1) / S) * 6.2832, f0 = foot(t0), f1 = foot(t1), s = 0.97;
    const p = [V(f0[0] * s, 0.0, f0[1] * s), V(f1[0] * s, 0.0, f1[1] * s), V(f1[0] * s * 0.95, 0.22, f1[1] * s * 0.95), V(f0[0] * s * 0.95, 0.22, f0[1] * s * 0.95)];
    b.face(p, TILE.CANVAS, inner, { ref: V(0, 0.3, 0) });
  }
  // guy lines from the fly to stakes, and the stakes at the hem's corners
  for (const t of [0, Math.PI, Math.PI * 1.25, Math.PI * 1.75, Math.PI * 0.5]) {
    const r = t === Math.PI * 0.5 ? rHem : 0.72 * rHem, a = flyPt(t, r), [fx, fz] = foot(t), out = Math.hypot(fx, fz);
    const sx = (fx / out) * (out * 1.05 + (t === Math.PI * 0.5 ? 0.62 : 0.75)), sz = (fz / out) * (out * 1.05 + (t === Math.PI * 0.5 ? 0.62 : 0.75));
    b.tube([a, V(sx, 0.05, sz)], 0.0045, 3, TILE.PLAIN, line);
    b.box(V(sx, 0.0, sz), V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.006, 0.07, 0.006, TILE.METAL, peg, { grain: 'y' });
  }
  return b;
}
// A tent with a fly of `colour` (a hex or a THREE.Color), in its own frame (the door at +z, the ground at y = 0):
// one mesh of the props' material, its occlusion baked against itself and the ground under it. camp.js keeps a
// few and stands them where they are pitched (tentPose).
export function buildTentMesh(colour = TENT_COLOURS[0]) {
  shared();
  const fly = new THREE.Color(colour), inner = C(0xcfc7ad);
  const g = tentBuild(fly, inner, C(0xc8c2b0), C(0x8f8c86)).build();
  if (!tentOcc) { const W = C(0xffffff), w = tentBuild(W, W, W, W).build(); bakeSelf(w, { rays: 10, reach: 0.9, ground: 0, floor: 0.35 }); tentOcc = w.getAttribute('aOcc').array.slice(); }
  g.getAttribute('aOcc').array.set(tentOcc);
  occlude(g, [], { ground: 0, rays: 6, reach: 0.4, floor: 0.6, bury: 0.08 });
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, propMaterial());
  m.castShadow = true; m.receiveShadow = true; m.name = 'tent';
  return m;
}
// The A-frame tent (the starting kit's: "Two poles and a fly. It sags when it rains."), in the dome's frame turned end
// on: x across, z along the ridge with the door at the +z end, y up from the ground. An A of two poles at each end and
// a ridge pole between them hold the canvas (tent.js draws those stages); the rain fly goes over the ridge and down to
// a hand's width off the ground on either side, sagging a little between the poles, beaked out at the back and out over
// the door into a vestibule staked to the ground, its right flap rolled back and tied so the tent's door shows; guy lines
// from the ridge's ends and the eaves out to stakes. One mesh of the props' material, its occlusion baked once.
const AW = 0.8, AL = 1.1, AH = 1.05, AV = 0.62, AB = 0.24; // half width, half length (the ridge), ridge height, how far the vestibule and the back beak reach out
export const AFRAME_SIZE = { a: AW, b: AL, h: AH, vest: AV, back: AB, ahead: AL + AV + 0.72 };
const AEX = AW * 1.12, AEY = 0.13, AL1 = AL * 1.03; // the fly's eaves (out and up) and its ends along the ridge
export const aframeRidge = (z) => AH + 0.035 - 0.045 * (1 - (z / AL1) ** 2); // the ridge sags a little between the A's
let aframeOcc = null;
function aframeBuild(fly, line, peg) {
  const b = new PropBuilder(), K = 4, S = 8;
  // a point on side s's panel: u from the ridge (0) down to the eave (1), v along it from the back (-1) to the front (1);
  // the cloth sags between the poles, most in the middle of the panel
  const P = (s, u, v) => { const z = v * AL1, sag = 0.045 * Math.sin(Math.PI * u) * (1 - v * v); return V(s * (AEX * u - sag * 0.35), aframeRidge(z) * (1 - u) + AEY * u - sag, z); };
  const shadeOf = (u, v) => (u < 0.06 ? 0.8 : u > 0.94 ? 0.86 : 1) * (1 - 0.06 * u) * (Math.abs(v) > 0.97 ? 0.9 : 1); // the ridge's seam tape and the hem's binding darker
  for (const s of [-1, 1]) {
    const grid = [], N = [];
    for (let i = 0; i <= K; i++) {
      const row = [], nr = [];
      for (let k = 0; k <= S; k++) {
        const u = i / K, v = -1 + (2 * k) / S, e = 0.02, p = P(s, u, v);
        const du = P(s, Math.min(1, u + e), v).sub(P(s, Math.max(0, u - e), v)), dv = P(s, u, Math.min(1, v + e)).sub(P(s, u, Math.max(-1, v - e)));
        const n = dv.cross(du).normalize(); if (n.x * s + n.y * 0.2 < 0) n.negate();
        row.push(p); nr.push(n);
      }
      grid.push(row); N.push(nr);
    }
    for (let i = 0; i < K; i++) for (let k = 0; k < S; k++) {
      const q = [[i, k], [i, k + 1], [i + 1, k + 1], [i + 1, k]];
      const tri = (ids) => {
        const A = grid[ids[0][0]][ids[0][1]], B = grid[ids[1][0]][ids[1][1]], Cc = grid[ids[2][0]][ids[2][1]];
        const e = B.clone().sub(A).cross(Cc.clone().sub(A)), order = e.dot(N[ids[0][0]][ids[0][1]]) >= 0 ? [0, 1, 2] : [0, 2, 1];
        for (const o of order) { const [ii, kk] = ids[o], u = ii / K, v = -1 + (2 * kk) / S; b.vert(grid[ii][kk], N[ii][kk], (v * AL1) / 1.2, (u * 1.3) / 1.2, TILE.CANVAS, fly.clone().multiplyScalar(shadeOf(u, v))); }
      };
      tri([q[0], q[1], q[2]]); tri([q[0], q[2], q[3]]);
    }
  }
  // the ends: a short beak at the back, closed; the vestibule out over the door, its left flap zipped down to the stake
  // and its right one rolled back to the eave and tied (both sides of the cloth drawn, for the look in through the door)
  const Rb = V(0, aframeRidge(-AL1), -AL1), Bk = V(0, 0.08, -AL1 - AB), Rf = V(0, aframeRidge(AL1), AL1), F = V(0, 0.06, AL1 + AV);
  const E = (s, z) => V(s * AEX, AEY, z), end = fly.clone().multiplyScalar(0.9), under = fly.clone().multiplyScalar(0.55);
  for (const s of [-1, 1]) b.face([Rb, E(s, -AL1), Bk], TILE.CANVAS, end, { ref: V(0, 0.35, 0) });
  b.face([Rf, E(-1, AL1), F], TILE.CANVAS, fly.clone().multiplyScalar(0.84), { ref: V(0, 0.35, 0) });
  b.face([Rf, E(-1, AL1), F], TILE.CANVAS, under, { ref: V(-1, 0.6, AL1 + AV * 0.6) });
  b.tube([Rf.clone().add(V(0.004, 0.004, 0.004)), F.clone().add(V(0.004, 0.012, 0.006))], 0.006, 3, TILE.PLAIN, fly.clone().multiplyScalar(0.45)); // the zip
  const roll = [];
  for (let i = 0; i <= 6; i++) { const t = i / 6, p = Rf.clone().lerp(E(1, AL1), 0.12 + 0.86 * t); roll.push(p.add(V(0.02, 0.025, 0.035))); }
  b.tube(roll, (t) => 0.026 + 0.018 * Math.sin(Math.PI * t), 6, TILE.CANVAS, fly.clone().multiplyScalar(0.8), { cap0: true, cap1: true });
  for (const t of [0.38, 0.72]) { const p = roll[Math.round(t * 6)]; b.tube([p.clone().add(V(-0.02, 0.05, -0.02)), p.clone().add(V(0.04, -0.05, 0.03))], 0.008, 4, TILE.PLAIN, line); } // its ties
  // guy lines: the ridge's ends out along it, the eaves' middles out to the side; a stake at each and at the hem's corners
  const stake = (p) => b.box(p, V(1, 0, 0), V(0, 1, 0), V(0, 0, 1), 0.006, 0.07, 0.006, TILE.METAL, peg, { grain: 'y' });
  const guys = [[Rb.clone().add(V(0, 0.02, -0.01)), V(0, 0.02, -AL1 - AB - 0.62)], [Rf.clone().add(V(0, 0.02, 0.01)), V(0, 0.02, AL1 + AV + 0.38)]];
  for (const s of [-1, 1]) guys.push([P(s, 0.72, 0).add(V(s * 0.01, 0.01, 0)), V(s * (AEX + 0.62), 0.02, 0)]);
  for (const [a, g] of guys) { b.tube([a, g], 0.0045, 3, TILE.PLAIN, line); stake(g); }
  for (const s of [-1, 1]) for (const z of [-AL1, AL1]) stake(V(s * (AEX + 0.05), 0.0, z));
  stake(F.clone().setY(0)); stake(Bk.clone().setY(0));
  return b;
}
export function buildAFrameMesh(colour = TENT_COLOURS[0]) {
  shared();
  const g = aframeBuild(new THREE.Color(colour), C(0xc8c2b0), C(0x8f8c86)).build();
  if (!aframeOcc) { const W = C(0xffffff), w = aframeBuild(W, W, W).build(); bakeSelf(w, { rays: 10, reach: 0.9, ground: 0, floor: 0.35 }); aframeOcc = w.getAttribute('aOcc').array.slice(); }
  g.getAttribute('aOcc').array.set(aframeOcc);
  occlude(g, [], { ground: 0, rays: 6, reach: 0.4, floor: 0.6, bury: 0.08 });
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, propMaterial());
  m.castShadow = true; m.receiveShadow = true; m.name = 'tent-aframe';
  return m;
}
// Where a tent pitched at world (x, z) with its door facing (fdx, fdz) stands: on the slope of the ground under its
// footprint (ground(x, z): the drawn ground, tiles.js groundAt), its hem a little into it. Returns the world matrix
// and what it is to the walker, a box { x, z, ux, uz, hx, hz, box: true } (tiles.js treesNear, player.js). size: the
// tent's (TENT_SIZE, the dome's, or AFRAME_SIZE: its vestibule and back beak lengthen the box toward the door).
export function tentPose(ground, x, z, fdx, fdz, size = TENT_SIZE) {
  const A = size.a, B = size.b, Zf = V(fdx, 0, fdz), Xf = V(-fdz, 0, fdx);
  const at = (u, w) => { const px = x + Xf.x * u + Zf.x * w, pz = z + Xf.z * u + Zf.z * w; return V(px, ground(px, pz), pz); };
  const c00 = at(-A, -B), c11 = at(A, B), c01 = at(-A, B), c10 = at(A, -B);
  const up = c11.clone().sub(c00).cross(c01.clone().sub(c10)).normalize(); if (up.y < 0) up.negate();
  const Zt = Zf.clone().addScaledVector(up, -Zf.dot(up)).normalize(), Xt = up.clone().cross(Zt).normalize();
  const y = (c00.y + c11.y + c01.y + c10.y) / 4 - 0.03;
  const matrix = new THREE.Matrix4().makeBasis(Xt, up, Zt).setPosition(x, y, z);
  const fwd = size.vest ? (size.vest - (size.back || 0)) / 2 : 0.15, hz = size.vest ? B + (size.vest + (size.back || 0)) / 2 - 0.1 : B + 0.3;
  return { matrix, y, obstacle: { x: x + Zf.x * fwd, z: z + Zf.z * fwd, ux: Xf.x, uz: Xf.z, hx: A + 0.1, hz, box: true, tent: true } };
}
// The latrine: a fibreglass box with its lid down, set into the ground.
function latrine(ctx, x, z, ang, rng) {
  const b = new PropBuilder(), g = ctx.H(x, z), Y = V(0, 1, 0), X = V(Math.cos(ang + 0.4), 0, Math.sin(ang + 0.4)), Z = X.clone().cross(Y).negate();
  const L = (y) => V(x - ctx.ox, y, z - ctx.oz), body = tone(0x4d5b49, rng, 0.04);
  b.box(L(g + 0.14), X, Y, Z, 0.3, 0.3, 0.3, TILE.FIBRE, body, { grain: 'x' });
  b.box(L(g + 0.455), X, Y, Z, 0.27, 0.015, 0.27, TILE.FIBRE, body.clone().offsetHSL(0, 0, 0.04), { grain: 'x' });
  b.box(L(g + 0.445).addScaledVector(Z, -0.25), X, Y, Z, 0.08, 0.02, 0.02, TILE.METAL, C(0x6a6660), { grain: 'x' });
  ctx.obstacles.push({ x, z, r: 0.45 });
  const geo = b.build();
  occlude(geo, [obb(L(g + 0.14), X, Y, Z, 0.3, 0.3, 0.3)], { ground: localGround(ctx), rays: 8, reach: 0.5 });
  return geo;
}

// --- lost-and-found items for the task board: small, sitting on y = 0 in their own frame --------------------------
// A canoe paddle lying flat, x from its grip (-0.75) to its tip (+0.72): a round shaft, a T-grip, a blade with
// a ridge down its middle and a dark tip guard.
function paddle(b, rng, wood) {
  const Y = V(0, 1, 0), X = V(1, 0, 0), Z = V(0, 0, 1), r = 0.016;
  b.cyl(V(-0.72, r + 0.002, 0), V(0.16, r + 0.002, 0), r, r * 1.05, 7, TILE.WOOD, wood, { cap0: true, capCol: wood });
  b.box(V(-0.745, r + 0.004, 0), X, Y, Z, 0.028, 0.017, 0.055, TILE.WOOD, wood.clone().offsetHSL(0, 0, -0.04), { grain: 'z' });
  const half = (x) => (x < 0.1 ? 0.02 : x < 0.36 ? 0.02 + 0.086 * Math.sin(((x - 0.1) / 0.26) * Math.PI / 2) : x < 0.62 ? 0.106 : 0.106 * Math.sqrt(Math.max(0, 1 - ((x - 0.62) / 0.1) ** 2)));
  const xs = [0.1, 0.16, 0.24, 0.32, 0.4, 0.5, 0.6, 0.65, 0.69, 0.715];
  const tipC = C(0x3b3430);
  for (let i = 0; i < xs.length - 1; i++) {
    const x0 = xs[i], x1 = xs[i + 1], w0 = Math.max(0.004, half(x0)), w1 = Math.max(0.004, half(x1)), col = x0 > 0.66 ? tipC : wood;
    const ridge0 = 0.014, ridge1 = 0.014, edge = 0.005;
    for (const s of [-1, 1]) {
      b.face([V(x0, ridge0, 0), V(x1, ridge1, 0), V(x1, edge, s * w1), V(x0, edge, s * w0)], TILE.WOOD, col, { ref: V((x0 + x1) / 2, -1, 0), U: X });
      b.face([V(x0, 0.001, 0), V(x1, 0.001, 0), V(x1, 0.001, s * w1), V(x0, 0.001, s * w0)], TILE.WOOD, col, { ref: V((x0 + x1) / 2, 1, 0), U: X });
      b.face([V(x0, edge, s * w0), V(x1, edge, s * w1), V(x1, 0.001, s * w1), V(x0, 0.001, s * w0)], TILE.WOOD, col, { ref: V((x0 + x1) / 2, 0.005, 0), U: X });
    }
  }
  return b;
}
export function buildItemProp(kind, seed = 1) {
  shared();
  const rng = mulberry32(100 + seed), b = new PropBuilder();
  const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);
  if (kind === 'paddle') {
    paddle(b, rng, tone(0xae8656, rng, 0.05));
  } else if (kind === 'locket') {
    // a gold locket, domed, with its bail, and a loop of fine chain on the rock
    const gold = C(0xc79f4c), sides = 16, ring = (y, s) => Array.from({ length: sides }, (_, i) => { const t = (i / sides) * 6.2832; return V(Math.cos(t) * 0.032 * s, y, Math.sin(t) * 0.041 * s); });
    const r0 = ring(0.001, 1), r1 = ring(0.008, 1), r2 = ring(0.011, 0.8), top = V(0, 0.013, 0);
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      b.face([r0[i], r0[j], r1[j], r1[i]], TILE.PLAIN, gold, { ref: V(0, 0.005, 0) });
      b.face([r1[i], r1[j], r2[j], r2[i]], TILE.PLAIN, gold, { ref: V(0, -0.02, 0) });
      b.face([r2[i], r2[j], top], TILE.PLAIN, gold, { ref: V(0, -0.02, 0) });
    }
    const bail = []; for (let k = 0; k <= 10; k++) { const t = (k / 10) * 6.2832; bail.push(V(Math.cos(t) * 0.005, 0.003, 0.047 + Math.sin(t) * 0.005)); }
    b.tube(bail, 0.0015, 3, TILE.PLAIN, gold);
    const chain = [];
    for (let k = 0; k <= 46; k++) { const t = k / 46, a = t * 6.2832 * 1.15 + 0.2; chain.push(V(Math.sin(a) * (0.1 + 0.02 * Math.sin(t * 9)) + 0.02, 0.0022, 0.052 + (1 - Math.cos(a)) * 0.07 + 0.01 * Math.sin(t * 13))); }
    b.tube(chain, 0.0019, 3, TILE.PLAIN, gold.clone().offsetHSL(0, -0.05, -0.05));
  } else {
    // a roll-top dry bag: a soft body, the top rolled down and buckled across, straps down its sides
    const bag = tone(0x41698f, rng, 0.04), dark = C(0x2c3034), strap = C(0x2a2a2a);
    const ys = [0, 0.02, 0.12, 0.26, 0.35, 0.39], rs = [0.135, 0.15, 0.158, 0.154, 0.12, 0.05];
    const rAt = (t) => { const y = t * 0.39; let i = 1; while (i < ys.length - 1 && ys[i] < y) i++; const f = (y - ys[i - 1]) / (ys[i] - ys[i - 1]); return rs[i - 1] + (rs[i] - rs[i - 1]) * f; };
    b.tube(ys.map((y) => V(0, y, 0)), rAt, 10, TILE.CANVAS, bag, { cap0: true, cap1: true });
    b.cyl(V(-0.17, 0.41, 0), V(0.17, 0.41, 0), 0.034, 0.034, 8, TILE.CANVAS, dark, { cap0: true, cap1: true, capTile: TILE.CANVAS });
    for (const s of [-1, 1]) {
      b.box(V(s * 0.168, 0.33, 0), X, Y, Z, 0.006, 0.07, 0.012, TILE.PLAIN, strap, { grain: 'y' });
      b.box(V(s * 0.172, 0.27, 0), X, Y, Z, 0.008, 0.02, 0.018, TILE.PLAIN, C(0x1d1d1f), { grain: 'y' });
    }
  }
  const geo = b.build();
  bakeSelf(geo, { rays: 10, reach: kind === 'drybag' ? 0.25 : 0.08, ground: 0, floor: 0.45 });
  const m = new THREE.Mesh(geo, propMaterial());
  m.castShadow = true; m.receiveShadow = true; m.name = `item ${kind}`;
  return m;
}

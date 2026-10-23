import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, hash2 } from './rng.js';
import { surfaceAt, meshHeightAt } from './terrain-build.js';
import { rockGeometry, makeRockMaterial, makeToonMaterial } from './rocks.js';
import { outfitterName } from './outfitter.js';
import { SPECIES as SP, bedding, seatRock, ROCK_FOOT, ROCK_KIND } from './placement.js';
import { TILE, PropBuilder, propMaterial, trailMaterial, occlude, obb, bakeSelf, MeshGround, buildHull, hullProfile, chunkStone } from './prop-kit.js';

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
  const ctx = { tg, world, ox, oz, H, locate, obstacles, inside };
  const pieces = [];
  const rng = mulberry32(42 + tx * 1000 + ty);

  const decal = new TrailDecal();
  for (const p of world.portages) {
    const [bx0, bz0, bx1, bz1] = p.bbox;
    if (bx1 < ox - 4 || bx0 > ox + size + 4 || bz1 < oz - 4 || bz0 > oz + size + 4) continue;
    buildTrail(ctx, p, decal, pieces);
  }
  decal.lift(ctx);
  const trail = decal.mesh();
  if (trail) group.add(trail);

  for (const ep of world.entryPoints) if (inside(ep.x, ep.z)) buildOutfitter(ctx, ep, rng, pieces, group);

  const ledges = [[], []]; // the ledge rocks' matrices, flats and slanted
  for (const c of world.campsites) if (inside(c.x, c.z)) buildCampsite(ctx, c, pieces, ledges);

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
  // The fallen trunks, stumps and granite outcrops the worker placed with the trees (placement.js) hold the
  // walker off too: a trunk as a box along its length (vegetation.js builds it 6.4–7.2 m along local x), a
  // stump and an outcrop as circles of their scale that a carried canoe rides over (rock). They are read from
  // the tile's vegetation meshes (one per bin, holding all of its instances), which tiles.js makes before it
  // builds the props.
  if (entry && entry.veg) for (const vm of entry.veg) {
    const sp = vm.userData.sp;
    if (sp !== SP.log && sp !== SP.stump && sp !== SP.outcrop) continue;
    const m = vm.instanceMatrix.array, log = sp === SP.log, foot = sp === SP.stump ? 0.3 : 0.95;
    for (let i = 0; i < vm.instanceMatrix.count; i++) {
      const o = i * 16, sx = Math.hypot(m[o], m[o + 1], m[o + 2]), sz = Math.hypot(m[o + 8], m[o + 9], m[o + 10]);
      const x = m[o + 12] + ox, z = m[o + 14] + oz;
      if (log) obstacles.push({ x, z, ux: m[o] / sx, uz: m[o + 2] / sx, hx: 3.4 * sx, hz: 0.36 * sz, box: true });
      else obstacles.push({ x, z, r: foot * sx, rock: true });
    }
  }
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

// A dock out from the landing, the shack nine metres back with its door to the lake and the outfitter's
// name over it, a canoe rack beside it. The frame: from the landing up onto dry ground and back to the
// edge, d out to the water.
function buildOutfitter(ctx, ep, rng, pieces, group) {
  const tg = ctx.tg;
  let x = ep.x, z = ep.z, d = tg.deeperDir(x, z);
  for (let i = 0; i < 300 && tg.shoreAt(x, z) < 1.0; i++) { x -= d.x * 0.5; z -= d.z * 0.5; if (i % 10 === 9) d = tg.deeperDir(x, z); }
  for (let i = 0; i < 300 && tg.shoreAt(x, z) > 1.2; i++) { x += d.x * 0.5; z += d.z * 0.5; if (i % 10 === 9) d = tg.deeperDir(x, z); }
  d = tg.deeperDir(x, z);
  const F = frame(ctx, x, z, d), level = tg.levelAt(x, z);
  pieces.push(buildDock(ctx, F, level, rng));
  const shack = buildShack(ctx, F, rng, -9.6, group, outfitterName(ep));
  pieces.push(shack.geo);
  pieces.push(...buildRack(ctx, F, rng, -(shack.hW + 3.0), -9.3));
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
  ctx.obstacles.push({ x: F.W(0, (back + len) / 2)[0], z: F.W(0, (back + len) / 2)[1], ux: F.Z.x, uz: F.Z.z, hx: (len - back) / 2, hz: hw + 0.15, box: true });
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
  return geo;
}

// The shack: board-and-batten walls stained and worn, painted trim (corner boards, casings, fascia and
// barge boards), a shingled gable roof with an overhang and a ridge cap, a stovepipe, glass in the windows,
// a panelled door, on a sill over stone piers, a stoop with steps to the door, and the outfitter's name on
// a board over it. Its front to the lake, centred b0 back from the landing.
function buildShack(ctx, F, rng, b0, group, name) {
  const b = new PropBuilder(), occ = [];
  const hW = 2.2, hD = 1.8, pitch = 0.6, tp = Math.tan(pitch), bF = b0 + hD, bB = b0 - hD;
  let gmax = -Infinity, gmin = Infinity;
  for (const a of [-hW, 0, hW]) for (const s of [bB, b0, bF]) { const g = F.G(a, s); gmax = Math.max(gmax, g); gmin = Math.min(gmin, g); }
  // the floor a little over the highest ground, but never more than a storey over the lowest (on a steep
  // bank the uphill side sits down into the slope)
  const floorY = Math.min(gmax + 0.34, gmin + 1.5), wall0 = floorY - 0.26, eaveY = floorY + 2.5, rise = hW * tp, ridgeY = eaveY + rise;
  const stain = tone(0x7b4a33, rng, 0.04), batten = stain.clone().offsetHSL(0, 0, -0.03), trim = tone(0xd8ceb2, rng, 0.03);
  const doorC = tone(0x435d49, rng, 0.04), roofC = tone(0x55564c, rng, 0.04), soffit = C(0x6b6052), iron = C(0x3a3836);
  ctx.obstacles.push({ x: F.W(0, b0)[0], z: F.W(0, b0)[1], ux: F.Z.x, uz: F.Z.z, hx: hD + 0.08, hz: hW + 0.08, box: true });
  // the four walls, going round: each wall's u = 0 end is where the one before it ends
  const doorA = -0.55, door = { u0: doorA + hW - 0.47, u1: doorA + hW + 0.47, y0: floorY, y1: floorY + 2.0, depth: 0.07, fill: 'door' };
  const walls = [
    { o: [-hW, bF], U: F.X, N: F.Z, len: 2 * hW, gable: true, open: [door, { u0: 1.2 + hW - 0.42, u1: 1.2 + hW + 0.42, y0: floorY + 1.0, y1: floorY + 1.88, depth: 0.1, fill: 'glass' }] },
    { o: [hW, bF], U: F.Z.clone().negate(), N: F.X, len: 2 * hD, open: [{ u0: hD - 0.1 - 0.4, u1: hD - 0.1 + 0.4, y0: floorY + 1.0, y1: floorY + 1.82, depth: 0.1, fill: 'glass' }] },
    { o: [hW, bB], U: F.X.clone().negate(), N: F.Z.clone().negate(), len: 2 * hW, gable: true, open: [] },
    { o: [-hW, bB], U: F.Z, N: F.X.clone().negate(), len: 2 * hD, open: [{ u0: hD - 0.2 - 0.4, u1: hD - 0.2 + 0.4, y0: floorY + 1.0, y1: floorY + 1.82, depth: 0.1, fill: 'glass' }] },
  ];
  const nameBoard = { u0: hW - 1.22, u1: hW + 1.22, y0: floorY + 2.1, y1: floorY + 2.74 };
  for (const [wi, w] of walls.entries()) {
    const O = F.P(w.o[0], 0, w.o[1]), at = (u, y, n = 0) => O.clone().addScaledVector(w.U, u).addScaledVector(w.N, n).setY(y);
    const inside = at(w.len / 2, (wall0 + eaveY) / 2, -1), org = at(0, wall0);
    const rect = (u0, u1, y0, y1) => { if (u1 - u0 > 1e-3 && y1 - y0 > 1e-3) b.face([at(u0, y0), at(u1, y0), at(u1, y1), at(u0, y1)], TILE.PAINT, stain, { ref: inside, U: F.Y, o: org }); };
    // the outer face, cut round the openings
    const ops = [...w.open].sort((p, q) => p.u0 - q.u0);
    let u = 0;
    for (const op of ops) { rect(u, op.u0, wall0, eaveY); rect(op.u0, op.u1, wall0, op.y0); rect(op.u0, op.u1, op.y1, eaveY); u = op.u1; }
    rect(u, w.len, wall0, eaveY);
    if (w.gable) b.face([at(0, eaveY), at(w.len, eaveY), at(w.len / 2, ridgeY)], TILE.PAINT, stain, { ref: inside, U: F.Y, o: org });
    // each opening: its reveals, its glass or door, its casing
    for (const op of ops) {
      const dp = op.depth, um = (op.u0 + op.u1) / 2, ym = (op.y0 + op.y1) / 2;
      b.face([at(op.u0, op.y0), at(op.u0, op.y1), at(op.u0, op.y1, -dp), at(op.u0, op.y0, -dp)], TILE.PAINT, trim, { ref: at(op.u0 - 0.1, ym, -dp / 2) });
      b.face([at(op.u1, op.y0), at(op.u1, op.y1), at(op.u1, op.y1, -dp), at(op.u1, op.y0, -dp)], TILE.PAINT, trim, { ref: at(op.u1 + 0.1, ym, -dp / 2) });
      b.face([at(op.u0, op.y1), at(op.u1, op.y1), at(op.u1, op.y1, -dp), at(op.u0, op.y1, -dp)], TILE.PAINT, trim, { ref: at(um, op.y1 + 0.1, -dp / 2) });
      if (op.fill === 'glass') b.face([at(op.u0, op.y0), at(op.u1, op.y0), at(op.u1, op.y0, -dp), at(op.u0, op.y0, -dp)], TILE.PAINT, trim, { ref: at(um, op.y0 - 0.1, -dp / 2) });
      const S = (uu, y, n, hu, hy, hn, tile, col, grain = 'y') => b.box(at(uu, y, n), w.U, F.Y, w.N, hu, hy, hn, tile, col, { grain: grain === 'y' ? 'y' : 'x' });
      if (op.fill === 'glass') {
        b.face([at(op.u0, op.y1, -dp), at(op.u1, op.y1, -dp), at(op.u1, op.y0, -dp), at(op.u0, op.y0, -dp)], TILE.GLASS, C(0xffffff), { ref: at(um, ym, -1), uvs: [[0.02, 0.02], [0.98, 0.02], [0.98, 0.98], [0.02, 0.98]] });
        S(um, ym, -dp + 0.016, 0.016, (op.y1 - op.y0) / 2, 0.014, TILE.PAINT, trim);
        S(um, ym, -dp + 0.017, (op.u1 - op.u0) / 2, 0.016, 0.013, TILE.PAINT, trim, 'x');
        S(um, op.y0 - 0.025, 0.035, (op.u1 - op.u0) / 2 + 0.1, 0.025, 0.05, TILE.PAINT, trim, 'x'); // sill
        S(um, op.y0 - 0.1, 0.012, (op.u1 - op.u0) / 2, 0.05, 0.012, TILE.PAINT, trim, 'x');           // apron
      } else {
        // a panelled door in its frame, a knob, a threshold
        const dd = -dp - 0.02;
        S(um, ym - 0.003, dd, (op.u1 - op.u0) / 2 - 0.004, (op.y1 - op.y0) / 2 - 0.003, 0.02, TILE.PAINT, doorC);
        for (const [uu, hu] of [[op.u0 + 0.06, 0.05], [op.u1 - 0.06, 0.05]]) S(uu, ym, -dp + 0.006, hu, (op.y1 - op.y0) / 2 - 0.01, 0.006, TILE.PAINT, doorC);
        for (const yy of [op.y0 + 0.08, op.y0 + 0.95, op.y1 - 0.08]) S(um, yy, -dp + 0.006, (op.u1 - op.u0) / 2 - 0.11, 0.06, 0.006, TILE.PAINT, doorC, 'x');
        S(op.u1 - 0.14, op.y0 + 1.0, -dp + 0.03, 0.02, 0.02, 0.025, TILE.METAL, C(0x8a7a5a));
        S(um, op.y0 + 0.012, -dp / 2, (op.u1 - op.u0) / 2, 0.012, dp / 2 + 0.02, TILE.WOOD, C(0x7d7264), 'x');
      }
      // casing round the opening, a head with a drip cap over it
      const yb = op.fill === 'glass' ? op.y0 - 0.05 : op.y0;
      S(op.u0 - 0.045, (yb + op.y1 + 0.1) / 2, 0.014, 0.045, (op.y1 + 0.1 - yb) / 2, 0.014, TILE.PAINT, trim);
      S(op.u1 + 0.045, (yb + op.y1 + 0.1) / 2, 0.014, 0.045, (op.y1 + 0.1 - yb) / 2, 0.014, TILE.PAINT, trim);
      S(um, op.y1 + 0.055, 0.016, (op.u1 - op.u0) / 2 + 0.1, 0.055, 0.016, TILE.PAINT, trim, 'x');
      S(um, op.y1 + 0.12, 0.03, (op.u1 - op.u0) / 2 + 0.12, 0.01, 0.03, TILE.PAINT, trim, 'x');
    }
    // battens every 0.34 m, cut round the casings and the name board, up to the eave or under the rake
    const blocks = ops.map((op) => ({ u0: op.u0 - 0.12, u1: op.u1 + 0.12, y0: (op.fill === 'glass' ? op.y0 - 0.16 : op.y0 - 1), y1: op.y1 + 0.15 }));
    if (wi === 0) blocks.push(nameBoard);
    for (let ub = 0.19; ub < w.len - 0.16; ub += 0.34) {
      const top = w.gable ? eaveY + (w.len / 2 - Math.abs(ub - w.len / 2)) * tp - 0.13 : eaveY - 0.005;
      let segs = [[wall0 + 0.01, top]];
      for (const k of blocks) {
        if (ub + 0.03 < k.u0 || ub - 0.03 > k.u1) continue;
        segs = segs.flatMap(([y0, y1]) => [[y0, Math.min(y1, k.y0)], [Math.max(y0, k.y1), y1]]).filter(([y0, y1]) => y1 - y0 > 0.05);
      }
      for (const [y0, y1] of segs) b.box(at(ub, (y0 + y1) / 2, 0.011), w.U, F.Y, w.N, 0.028, (y1 - y0) / 2, 0.011, TILE.PAINT, batten, { grain: 'y', shift: [rng() * 3, rng() * 3] });
    }
    // corner boards: the start one wraps over the end board of the wall before
    b.box(at(0.0425, (wall0 + eaveY) / 2, 0.0125), w.U, F.Y, w.N, 0.0675, (eaveY - wall0) / 2, 0.0125, TILE.PAINT, trim, { grain: 'y' });
    b.box(at(w.len - 0.055, (wall0 + eaveY) / 2, 0.0125), w.U, F.Y, w.N, 0.055, (eaveY - wall0) / 2, 0.0125, TILE.PAINT, trim, { grain: 'y' });
    // the sill under the wall, set back under the siding's edge
    b.box(at(w.len / 2, wall0 - 0.07, -0.08), w.U, F.Y, w.N, w.len / 2 - 0.15, 0.09, 0.06, TILE.WOOD, C(0x5d554a), { grain: 'x', endTile: TILE.END });
  }
  // the name over the door: a painted backing board, the sign on it
  b.box(F.P(0, floorY + 2.42, bF + 0.022), F.X, F.Y, F.Z, 1.18, 0.3, 0.022, TILE.PAINT, trim, { grain: 'x' });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.48), signMaterial(name));
  sign.position.copy(F.P(0, floorY + 2.42, bF + 0.044 + 0.012));
  sign.rotation.y = Math.atan2(F.Z.x, F.Z.z);
  sign.receiveShadow = true; sign.matrixAutoUpdate = false; sign.updateMatrix();
  group.add(sign);
  // the roof: two shingled slabs over the walls, overhanging the eaves and the gables
  const yb = (a) => ridgeY - Math.abs(a) * tp, th = 0.085, eo = 0.42, ro = 0.36, aE = hW + eo, f0 = bF + ro, f1 = bB - ro;
  for (const s of [-1, 1]) {
    const e = s * aE, U = s > 0 ? F.Z : F.Z.clone().negate();
    const top = [F.P(0, ridgeY + th, f0), F.P(0, ridgeY + th, f1), F.P(e, yb(e) + th, f1), F.P(e, yb(e) + th, f0)];
    b.face(top, TILE.ROOF, roofC, { ref: F.P(0, eaveY, b0), U, o: F.P(e, yb(e) + th, s > 0 ? f0 : f1), shift: [rng(), 0] });
    b.face([F.P(0, ridgeY, f0), F.P(0, ridgeY, f1), F.P(e, yb(e), f1), F.P(e, yb(e), f0)], TILE.WOOD, soffit, { ref: F.P(0, ridgeY + 1, b0), U: F.Z });
    // fascia along the eave, barge boards under the rakes
    b.box(F.P(s * (aE + 0.016), yb(e) + th - 0.09, b0), F.X, F.Y, F.Z, 0.016, 0.09, hD + ro + 0.03, TILE.PAINT, trim, { grain: 'z' });
    const along = F.X.clone().multiplyScalar(s * aE).add(V(0, yb(e) - ridgeY, 0)), Lr = along.length(); along.normalize();
    const up = F.Z.clone().cross(along).normalize(); if (up.y < 0) up.negate();
    for (const bb of [f0 + 0.016, f1 - 0.016]) b.box(F.P(s * aE / 2, (ridgeY + yb(e)) / 2 + th - 0.09, bb).addScaledVector(up, 0), along, up, F.Z, Lr / 2 + 0.02, 0.09, 0.016, TILE.PAINT, trim, { grain: 'x' });
    // the ridge cap, a board down each side of the ridge
    b.box(F.P(s * 0.06, ridgeY + th + 0.012 - 0.06 * tp, b0), along, up, F.Z, 0.075, 0.012, hD + ro + 0.04, TILE.ROOF, roofC.clone().offsetHSL(0, 0, -0.05), { grain: 'z' });
    occ.push(obb(F.P(s * aE / 2, (ridgeY + yb(e)) / 2 + th / 2, b0), along, up, F.Z, Lr / 2, th / 2, hD + ro));
  }
  // the stovepipe through the right slope, a collar, a rain cap
  const sa = 1.15, sb = b0 - 0.45, yr = yb(sa) + th;
  const pipeTop = ridgeY + 0.7;
  b.cyl(F.P(sa, yr - 0.06, sb), F.P(sa, pipeTop, sb), 0.075, 0.075, 10, TILE.METAL, iron, {});
  b.cyl(F.P(sa, yr - 0.02, sb), F.P(sa, yr + 0.06, sb), 0.11, 0.1, 10, TILE.METAL, iron.clone().offsetHSL(0, 0, 0.04), { cap1: true, capTile: TILE.METAL });
  b.cyl(F.P(sa, pipeTop, sb), F.P(sa, pipeTop + 0.06, sb), 0.05, 0.05, 8, TILE.METAL, iron, {});
  b.cyl(F.P(sa, pipeTop + 0.06, sb), F.P(sa, pipeTop + 0.17, sb), 0.17, 0.03, 10, TILE.METAL, iron, { cap0: true, capTile: TILE.METAL });
  // the foundation: stacked stone piers under the sill where the ground is near, and where it falls away a
  // post foundation (posts on footing stones, braced, the floor's joists showing under it); the floor's
  // underside closes the shack from below
  const pierTop = wall0 - 0.16, piers = [];
  for (const [a, s] of [[-hW, bB], [0, bB], [hW, bB], [hW, b0], [hW, bF], [0, bF], [-hW, bF], [-hW, b0]]) {
    const ia = a - Math.sign(a) * 0.08, is = s - Math.sign(s - b0) * 0.08, g = F.G(ia, is) - 0.1;
    piers.push({ ia, is, g, h: pierTop - g });
  }
  const open = piers.some((p) => p.h > 0.7), wood = C(0x6e665a);
  for (const { ia, is, g, h } of piers) {
    if (h < 0.06) continue;
    if (h > 0.7) {
      b.box(F.P(ia, (g + pierTop) / 2, is), F.X, F.Y, F.Z, 0.065, h / 2, 0.065, TILE.WOOD, wood, { grain: 'y', endTile: TILE.END });
      stone(b, F.P(ia, g - 0.02, is), 0.2, rng() * 6.28, rng, { up: 1.4 });
    } else {
      const n = Math.max(1, Math.round(h / 0.17)), sh = h / n;
      for (let k = 0; k < n; k++) {
        const yaw = (rng() - 0.5) * 0.4, Xr = F.X.clone().multiplyScalar(Math.cos(yaw)).addScaledVector(F.Z, Math.sin(yaw)), Zr = F.Z.clone().multiplyScalar(Math.cos(yaw)).addScaledVector(F.X, -Math.sin(yaw));
        b.box(F.P(ia + (rng() - 0.5) * 0.04, g + sh * (k + 0.5), is + (rng() - 0.5) * 0.04), Xr, F.Y, Zr, 0.17 + rng() * 0.04, sh / 2 - 0.004, 0.15 + rng() * 0.04, TILE.STONE, tone(0x8f8a83, rng, 0.1), { grain: 'x' });
      }
    }
  }
  const under = C(0x2c2925), cb = gmin - 0.35, ci = 0.24;
  b.face([F.P(-hW + 0.02, pierTop, bF - 0.02), F.P(hW - 0.02, pierTop, bF - 0.02), F.P(hW - 0.02, pierTop, bB + 0.02), F.P(-hW + 0.02, pierTop, bB + 0.02)], TILE.PLAIN, under, { ref: F.P(0, floorY, b0) });
  if (open) {
    // joists under the floor, braces between the posts round the outside
    for (const a of [-1.6, -0.8, 0, 0.8, 1.6]) b.box(F.P(a, pierTop - 0.075, b0), F.X, F.Y, F.Z, 0.03, 0.075, hD - 0.12, TILE.WOOD, wood, { grain: 'z', endTile: TILE.END });
    for (let k = 0; k < piers.length; k++) {
      const p = piers[k], q = piers[(k + 1) % piers.length];
      if (Math.min(p.h, q.h) < 0.8) continue;
      const [hi, lo] = k % 2 ? [p, q] : [q, p];
      const ox = Math.sign(hi.ia + lo.ia) * (Math.abs(hi.ia - lo.ia) < 0.01 ? 0.08 : 0), oz = Math.sign((hi.is + lo.is) / 2 - b0) * (Math.abs(hi.is - lo.is) < 0.01 ? 0.08 : 0);
      const p0 = F.P(hi.ia + ox, pierTop - 0.12, hi.is + oz), p1 = F.P(lo.ia + ox, Math.max(lo.g + 0.25, pierTop - 1.6), lo.is + oz);
      const along = p1.clone().sub(p0), L = along.length(); along.normalize();
      const side = (Math.abs(hi.ia - lo.ia) < 0.01 ? F.X : F.Z).clone(), up = side.clone().cross(along).normalize();
      b.box(p0.clone().add(p1).multiplyScalar(0.5), along, up, side, L / 2, 0.045, 0.018, TILE.WOOD, wood, { grain: 'x' });
    }
  } else {
    for (const [p, q] of [[[-hW + ci, bF - ci], [hW - ci, bF - ci]], [[hW - ci, bF - ci], [hW - ci, bB + ci]], [[hW - ci, bB + ci], [-hW + ci, bB + ci]], [[-hW + ci, bB + ci], [-hW + ci, bF - ci]]]) {
      b.face([F.P(p[0], cb, p[1]), F.P(q[0], cb, q[1]), F.P(q[0], pierTop + 0.05, q[1]), F.P(p[0], pierTop + 0.05, p[1])], TILE.PLAIN, under, { ref: F.P(0, cb, b0) });
    }
  }
  // the stoop at the door: planks on a frame, posts at its front, steps down to the ground
  const ys = floorY - 0.04, sd = 1.15, sw = 0.85, s0 = bF, s1 = bF + sd;
  for (let s = s0 + 0.005; s < s1 - 0.02;) {
    const w = 0.13 + rng() * 0.03, e = Math.min(s1, s + w);
    b.box(F.P(doorA + (rng() - 0.5) * 0.01, ys - 0.0175, (s + e) / 2), F.X, F.Y, F.Z, sw + (rng() - 0.5) * 0.02, 0.0175, (e - s) / 2, TILE.WOOD, tone(0x8f8576, rng, 0.08), { grain: 'x', skip: ['-y'], shift: [rng() * 3, rng() * 3] });
    s = e + 0.008;
  }
  const frameC = C(0x6a6255);
  b.box(F.P(doorA, ys - 0.035 - 0.07, s1 - 0.025), F.X, F.Y, F.Z, sw - 0.02, 0.07, 0.025, TILE.WOOD, frameC, { grain: 'x' });
  for (const side of [-1, 1]) {
    b.box(F.P(doorA + side * (sw - 0.04), ys - 0.035 - 0.07, (s0 + s1) / 2), F.X, F.Y, F.Z, 0.025, 0.07, sd / 2, TILE.WOOD, frameC, { grain: 'z' });
    const pg = F.G(doorA + side * (sw - 0.08), s1 - 0.08) - 0.3;
    b.box(F.P(doorA + side * (sw - 0.08), (pg + ys - 0.035) / 2, s1 - 0.08), F.X, F.Y, F.Z, 0.045, (ys - 0.035 - pg) / 2, 0.045, TILE.WOOD, frameC, { grain: 'y' });
  }
  occ.push(obb(F.P(doorA, ys - 0.1, (s0 + s1) / 2), F.X, F.Y, F.Z, sw, 0.08, sd / 2));
  // steps down to the ground: as many even risers (at most 21 cm) as it takes to meet the bank at their foot
  const run = 0.27;
  let rises = 1, rh = ys - F.G(doorA, s1 + 0.25);
  for (let n = 1; n <= 16; n++) { rises = n; rh = (ys - F.G(doorA, s1 + (n - 1) * run + 0.25)) / n; if (rh <= 0.21) break; }
  const treads = rh * rises > 0.25 ? rises - 1 : 0, gFront = ys - rh * rises;
  for (let k = 1; k <= treads; k++) {
    const ty = ys - k * rh, ts = s1 + (k - 0.5) * run;
    b.box(F.P(doorA, ty - 0.0175, ts), F.X, F.Y, F.Z, 0.5, 0.0175, run / 2 + 0.01, TILE.WOOD, tone(0x8f8576, rng, 0.08), { grain: 'x', shift: [rng() * 3, rng() * 3] });
  }
  if (treads) for (const side of [-1, 1]) {
    const p0 = F.P(doorA + side * 0.47, ys - 0.06, s1), p1 = F.P(doorA + side * 0.47, gFront - 0.05, s1 + treads * run + 0.05), along = p1.clone().sub(p0), L = along.length(); along.normalize();
    const up = F.X.clone().cross(along).normalize(); if (up.y < 0) up.negate();
    b.box(p0.clone().add(p1).multiplyScalar(0.5).addScaledVector(up, -0.06), along, up, F.X, L / 2, 0.1, 0.02, TILE.WOOD, frameC, { grain: 'x' });
  }
  const sx = F.W(doorA, (s0 + s1 + treads * run) / 2);
  ctx.obstacles.push({ x: sx[0], z: sx[1], ux: F.Z.x, uz: F.Z.z, hx: (sd + treads * run) / 2 + 0.05, hz: sw + 0.05, box: true });
  // two paddles leaning on the right wall by the front corner
  for (const [k, s] of [[0, bF - 0.38], [1, bF - 0.62]]) {
    const tip = F.P(hW + 0.46 + k * 0.04, F.G(hW + 0.46, s) + 0.005, s + k * 0.05), grip = F.P(hW + 0.085, floorY + 1.32 - k * 0.06, s);
    const Xp = tip.clone().sub(grip).normalize(), Zp = F.Z.clone(), Yp = Zp.clone().cross(Xp).normalize(); Zp.copy(Xp.clone().cross(Yp)).normalize();
    const m = new THREE.Matrix4().makeBasis(Xp, Yp, Zp).setPosition(tip.clone().addScaledVector(Xp, -0.72));
    const pb = new PropBuilder(); paddle(pb, mulberry32(k + 5), k ? C(0x9a7a50) : C(0xb0895a)); const pg = pb.build(); pg.applyMatrix4(m);
    b.addBuilt(pg);
  }
  occ.push(obb(F.P(0, (wall0 + eaveY) / 2, b0), F.X, F.Y, F.Z, hW - 0.12, (eaveY - wall0) / 2, hD - 0.12));
  occ.push(obb(F.P(0, eaveY + rise * 0.3, b0), F.X, F.Y, F.Z, hW * 0.55, rise * 0.3, hD - 0.12));
  if (!open) occ.push(obb(F.P(0, (cb + pierTop) / 2, b0), F.X, F.Y, F.Z, hW - ci, (pierTop - cb) / 2, hD - ci));
  else occ.push(obb(F.P(0, pierTop - 0.08, b0), F.X, F.Y, F.Z, hW - 0.1, 0.08, hD - 0.1));
  const geo = b.build();
  occlude(geo, occ, { ground: localGround(ctx), rays: 12, reach: 1.1, floor: 0.3 });
  return { geo, hW };
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
// in it; a split-log bench on two rounds; a dome tent with its fly, guyed out and staked; the latrine box
// back in the woods; the granite ledge down to the water.
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
  // the tent on the flattest clear spot nearby (off the ledge rocks, on dry ground), door to the fire, pitched
  // on the slope of the ground under it
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
  pieces.push(placeTent(ctx, tx, tz, fdx, fdz, crng));
  // the latrine back in the trees, away from the water
  const la = Math.atan2(backZ, backX) + (crng() - 0.5) * 1.2, lx = fx + Math.cos(la) * 15, lz = fz + Math.sin(la) * 15;
  if (tg.shoreAt(lx, lz) > 3) pieces.push(latrine(ctx, lx, lz, la, crng));
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
      ledges[1].push(place(ROCK_KIND.block, x, z, az, tilt, (r() - 0.5) * 0.5, s, 0.85 + r() * 0.3, 0.85 + r() * 0.3));
      if (s > 0.75) obstacles.push({ x, z, r: 0.8 * s, rock: true });
    }
    return;
  }
  const n = 2 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const t = 2.5 + i * 2.8 + r() * 1.5, side = (r() - 0.5) * 7, s = i === 0 ? 1.4 + r() * 0.8 : 0.7 + r() * 0.7;
    const x = fx + dir.x * t + kx * side, z = fz + dir.z * t + kz * side;
    if (tg.shoreAt(x, z) < -1.5) continue;
    const bed = bedding(tg, x, z), tilt = Math.min(0.4, bed.angle * 0.85);
    ledges[0].push(place(ROCK_KIND.slab, x, z, bed.angle < 0.04 ? r() * Math.PI * 2 : bed.az, tilt, r() * Math.PI * 2, s, 0.85 + r() * 0.3, 0.8 + r() * 0.3));
  }
}

// The dome tent, built once in its own frame (x along it, z across, the door at +z, y up from the ground):
// a rounded-rectangle dome for the fly, the vestibule bulging out over the door, the inner tent showing under
// the fly's hem, guy lines out to stakes; its occlusion baked once. Placed per site on the slope under it.
const TENT_COLOURS = [0xb26a3e, 0x5c7a55, 0x56708a, 0xa8925f, 0x8d4f45];
const TA = 1.15, TB = 0.82, TH = 1.12;
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
function placeTent(ctx, x, z, fdx, fdz, rng) {
  const fly = tone(TENT_COLOURS[Math.floor(rng() * TENT_COLOURS.length)], rng, 0.05), inner = tone(0xcfc7ad, rng, 0.04);
  const g = tentBuild(fly, inner, C(0xc8c2b0), C(0x8f8c86)).build();
  if (!tentOcc) { const W = C(0xffffff), w = tentBuild(W, W, W, W).build(); bakeSelf(w, { rays: 10, reach: 0.9, ground: 0, floor: 0.35 }); tentOcc = w.getAttribute('aOcc').array.slice(); }
  g.getAttribute('aOcc').array.set(tentOcc);
  // the ground's slope under the footprint, from its four corners
  const Zf = V(fdx, 0, fdz), Xf = V(-fdz, 0, fdx);
  const at = (u, w) => { const px = x + Xf.x * u + Zf.x * w, pz = z + Xf.z * u + Zf.z * w; return V(px, ctx.H(px, pz), pz); };
  const c00 = at(-TA, -TB), c11 = at(TA, TB), c01 = at(-TA, TB), c10 = at(TA, -TB);
  const up = c11.clone().sub(c00).cross(c01.clone().sub(c10)).normalize(); if (up.y < 0) up.negate();
  const Zt = Zf.clone().addScaledVector(up, -Zf.dot(up)).normalize(), Xt = up.clone().cross(Zt).normalize();
  const y = (c00.y + c11.y + c01.y + c10.y) / 4 - 0.03;
  g.applyMatrix4(new THREE.Matrix4().makeBasis(Xt, up, Zt).setPosition(x - ctx.ox, y, z - ctx.oz));
  ctx.obstacles.push({ x: x + Zf.x * 0.15, z: z + Zf.z * 0.15, ux: Xf.x, uz: Xf.z, hx: TA + 0.1, hz: TB + 0.3, box: true });
  occlude(g, [], { ground: localGround(ctx), rays: 6, reach: 0.4, floor: 0.6, bury: 0.08 });
  return g;
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

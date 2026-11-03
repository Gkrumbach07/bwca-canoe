#!/usr/bin/env node
// Round world (2026-11-02, the owner: "campsites that are on cliffs or are not super accessible from the water. In real
// life, there's usually some form of landing ... and there is some sort of, not necessarily a path, but a clearing where
// you can get up to the campsite that is not just literally climbing up a mountain ... That also goes for the latrine.
// Usually there's some kind of trail that takes you to the latrine, and the latrine is usually farther").
//
// For every campsite (the release's and world-fixes.json's), on the ground the walker walks (the 2 m LiDAR lattice as
// detail-build.js chunkGround draws it, else the 10 m mesh), from the fire ring as props.js buildCampsite places it:
//   the landing   the nearest stretch of bank, by the way up, where a canoe floats a few metres out and the bank rises
//                 gently from the water, and the way up from it to the ring: a least-cost walk on a 1 m lattice that
//                 never takes a step steeper than ACCESS.grade (the walker's wall is 40°, player.js MAX_GRADE)
//   the latrine   back from the water, LATRINE.len metres or so along a walk from the ring, on ground flat enough for
//                 the box, and the faint trail to it
// and writes src/camp-access.json, which the game reads at startup (world.js: each site's `access`; props.js
// exclusionsFor clears both ways of trees, brush and rocks; site.js lays the shelf along the way up; player.js walks both
// graded, as a trail, and noses a canoe in to the landing). Run again after a data release (the table is keyed to the
// release's bake stamp and ignored on any other):
//
//   node scripts/camp-access.mjs [--data public/data] [--out src/camp-access.json] [--only 120] [--check] [--verify]
//
// --check: writes nothing; prints the sweep's numbers. --verify (scripts/check-access.mjs): the written table checked
// against the ground, the numbers before and after.
// The sweep counts, for each site, whether the old way (straight down the shore's fall line from the ring to the water,
// as site.js laid the shelf) can be walked (no 1.5 m step steeper than the walker's wall), and whether the new one can.
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

export const ACCESS = { grade: Math.tan((33 * Math.PI) / 180), wall: Math.tan((40 * Math.PI) / 180), reach: 90, cell: 1 };
export const FIRE_DRY = 2; // (props.js CAMP_FIRE_DRY)
export const LATRINE = { len: [45, 75], want: 55, back: 25, flat: 0.32 };

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.resolve(arg('--data', path.join(root, 'public/data'))) + '/';
const outFile = path.resolve(arg('--out', path.join(root, 'src/camp-access.json')));
const only = arg('--only', null) ? +arg('--only') : null;
const checkOnly = process.argv.includes('--check');
const onlyKey = arg('--key', null), debug = !!onlyKey;

const vite = await createServer({ root, configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
let gridMod, terrain, detailBuild;
try {
  gridMod = await vite.ssrLoadModule('/src/grid.js');
  terrain = await vite.ssrLoadModule('/src/terrain-build.js');
  detailBuild = await vite.ssrLoadModule('/src/detail-build.js');
} catch (e) { await vite.close(); throw e; }
const { TileGrid, GridQueries } = gridMod;

const index = JSON.parse(fs.readFileSync(dataDir + 'index.json', 'utf8'));
const g = index.grid;
const desc = { cell: g.cell, originX: g.originX, originZ: g.originZ, tile: g.tile, halo: g.halo, fields: index.version >= 4 ? index.fields : undefined };
const levelById = new Float32Array(index.lakes.length + 1);
for (const l of index.lakes) if (l) levelById[l.id] = l.level;
const tiles = new Map();
function tileGrid(tx, ty) {
  const k = `${tx},${ty}`;
  if (!tiles.has(k)) {
    let tg = null;
    try {
      const raw = zlib.gunzipSync(fs.readFileSync(`${dataDir}tiles/${tx}_${ty}.bin`));
      tg = new TileGrid(desc, tx, ty, raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), levelById);
    } catch { /* no tile */ }
    tiles.set(k, tg);
  }
  return tiles.get(k);
}
class WorldGrid extends GridQueries {
  constructor() { super(); this.cell = g.cell; this.originX = g.originX; this.originZ = g.originZ; this.tile = g.tile; }
  at(i, j) { return tileGrid(Math.min(g.ntx - 1, Math.max(0, Math.floor(i / g.tile))), Math.min(g.nty - 1, Math.max(0, Math.floor(j / g.tile)))); }
  hCell(i, j) { const t = this.at(i, j); return t ? t.hCell(i, j) : 0; }
  sdCell(i, j) { const t = this.at(i, j); return t ? t.sdCell(i, j) : 100; }
  lakeCell(i, j) { const t = this.at(i, j); return t ? t.lakeCell(i, j) : 0; }
  levelCell(i, j) { const t = this.at(i, j); return t ? t.levelCell(i, j) : 0; }
  levelOf(id) { return levelById[id]; }
}
const world = new WorldGrid();
const cache = new Map();
const H10 = (x, z) => terrain.meshHeightAt(world, x, z, cache);
let detailIndex = null;
try { detailIndex = JSON.parse(fs.readFileSync(dataDir + 'detail/index.json', 'utf8')); } catch { /* 10 m only */ }
const chunks2 = new Map();
function chunk2(x, z) {
  if (!detailIndex) return null;
  const L = detailIndex.levels['2'], gox = g.originX + g.cell / 2, goz = g.originZ + g.cell / 2;
  const gx = Math.floor((x - gox) / L.size), gy = Math.floor((z - goz) / L.size), tx = Math.floor(gx / L.perTile), ty = Math.floor(gy / L.perTile);
  const name = `${tx}_${ty}_${gx - tx * L.perTile}_${gy - ty * L.perTile}`;
  if (!chunks2.has(name)) {
    let G = null;
    if ((detailIndex.chunks['2'] || {})[name]) {
      const raw = zlib.gunzipSync(fs.readFileSync(`${dataDir}detail/${L.dir}/${name}.bin`));
      G = detailBuild.chunkGround(world, detailBuild.decodeChunk(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)), cache).L;
    }
    if (chunks2.size > 400) chunks2.clear();
    chunks2.set(name, G);
  }
  return chunks2.get(name);
}
const H = (x, z) => { const L = chunk2(x, z); if (L) { const y = detailBuild.latticeAt(L, x, z); if (y === y) return y; } return H10(x, z); };

// the campsites as the game has them (world.js: the release's, then world-fixes.json's appended)
let fixes = null;
try { fixes = JSON.parse(fs.readFileSync(path.join(root, 'src/world-fixes.json'), 'utf8')); } catch { /* none */ }
const sites = index.campsites.map((c) => ({ x: c.x, z: c.z, shore: c.shore }));
if (fixes && fixes.for === (index.source && index.source.baked)) for (const c of fixes.campsites || []) if (Number.isFinite(c.x)) sites.push({ x: c.x, z: c.z, shore: c.shore ?? 10 });
const keyOf = (c) => `${Math.round(c.x)}:${Math.round(c.z)}`;
const TM = g.tile * g.cell, tileOf = (x, z) => `${Math.floor((x - g.originX) / TM)},${Math.floor((z - g.originZ) / TM)}`;
// the portages' lines and the other sites' rings near a point, for the latrine (never on a trail, nor by another site)
const BIN = 200, pBins = new Map(), sBins = new Map();
const binAdd = (M, x, z, v) => { const k = `${Math.floor(x / BIN)},${Math.floor(z / BIN)}`; if (!M.has(k)) M.set(k, []); M.get(k).push(v); };
for (const p of index.portages) for (let i = 1; i < p.pts.length; i++) { const [x0, z0] = p.pts[i - 1], [x1, z1] = p.pts[i], n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 50)); for (let k = 0; k <= n; k++) binAdd(pBins, x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n, [x0, z0, x1, z1]); }
function nearTrail(x, z, r) {
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) for (const [x0, z0, x1, z1] of pBins.get(`${Math.floor(x / BIN) + di},${Math.floor(z / BIN) + dj}`) || []) {
    const ex = x1 - x0, ez = z1 - z0, L2 = ex * ex + ez * ez || 1, t = Math.max(0, Math.min(1, ((x - x0) * ex + (z - z0) * ez) / L2));
    if (Math.hypot(x - x0 - ex * t, z - z0 - ez * t) < r) return true;
  }
  return false;
}
function nearOtherSite(x, z, me, r) {
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) for (const s of sBins.get(`${Math.floor(x / BIN) + di},${Math.floor(z / BIN) + dj}`) || []) if (s !== me && Math.hypot(s.x - x, s.z - z) < r) return true;
  return false;
}

// Round flat (2026-11-03, the owner: "find a flat spot for the campsite, or flattest spot. not just exactly where the point
// is. the point is not fully accurate bc in real life the campsite is up on that flat instead of the hill"). The USFS point
// can sit on the slope below the site's real flat; the camp (the ring, its bench 2.6 m out, a tent pad 6 to 10 m out) wants
// FLAT.disc metres of level ground. Within FLAT.reach of the point, on a FLAT.step lattice of the walker's ground: the rise
// across that disc (highest less lowest), plus a little for each metre moved and for being far back from the water, on dry
// upland (not bog, swamp, marsh or a pond: the ground channel), off a cliff face, off a portage, away from the other sites.
// The site moves only where its ring has more than FLAT.keep metres of rise (about 6° across the disc), to ground FLAT.gain
// metres flatter and FLAT.ratio of the rise at most; world.js then moves the site
// itself (c.x, c.z, c.shore) and keeps its key, so a save's camps, claims and the rest still find it.
export const FLAT = { way: 110, reach: 70, step: 2, disc: 7, land: 0.7, gain: 0.6, ratio: 0.6, keep: 1.4, sd: [4, 30], perM: 0.012, back: 0.03, trail: 14, other: 45, tries: 5 };
const WET = new Set([2, 3, 4, 5, 6, 7, 8, 9, 13]);
const cellIJ = (x, z) => [Math.floor((x - g.originX) / g.cell), Math.floor((z - g.originZ) / g.cell)];
const kindAt = (x, z) => { const [i, j] = cellIJ(x, z), t = world.at(i, j); return t && t.chCell ? t.chCell('ground', i, j) : 0; };
const faceAt = (x, z) => { const [i, j] = cellIJ(x, z), t = world.at(i, j), v = t && t.chCell ? t.chCell('cliff', i, j) : 0; return v >> 6 === 3; };
const moved = []; // the sites moved so far (for "away from the other sites")
function flatOf(c) {
  const S = FLAT.step, n = Math.round(FLAT.reach / S), pad = Math.ceil(FLAT.disc / S), side = 2 * (n + pad) + 1;
  const X = (i) => c.x + (i - n - pad) * S, Z = (j) => c.z + (j - n - pad) * S;
  const h = new Float32Array(side * side), sd = new Float32Array(side * side);
  for (let j = 0; j < side; j++) for (let i = 0; i < side; i++) { const x = X(i), z = Z(j), q = j * side + i; sd[q] = world.shoreAt(x, z); h[q] = sd[q] > 0 ? H(x, z) : NaN; }
  const disc = []; for (let dj = -pad; dj <= pad; dj++) for (let di = -pad; di <= pad; di++) if (Math.hypot(di, dj) * S <= FLAT.disc) disc.push([di, dj]);
  // (the land of the disc: a ring by the water has the lake in its disc, and that is no slope; FLAT.land of it land at least)
  const riseAt = (i, j) => { let lo = Infinity, hi = -Infinity, k = 0; for (const [di, dj] of disc) { const v = h[(j + dj) * side + i + di]; if (v !== v) continue; k++; if (v < lo) lo = v; if (v > hi) hi = v; } return k >= FLAT.land * disc.length ? hi - lo : Infinity; };
  const rise0 = (() => { const f = fireOf(c), i = Math.round((f.x - c.x) / S) + n + pad, j = Math.round((f.z - c.z) / S) + n + pad; return riseAt(Math.max(pad, Math.min(side - 1 - pad, i)), Math.max(pad, Math.min(side - 1 - pad, j))); })();
  if (rise0 <= FLAT.keep) return { rise0, rise: rise0, cands: [] };
  const cands = [];
  for (let j = pad; j < side - pad; j++) for (let i = pad; i < side - pad; i++) {
    const q = j * side + i, x = X(i), z = Z(j), d = Math.hypot(x - c.x, z - c.z);
    if (d > FLAT.reach || sd[q] < FLAT.sd[0]) continue;
    const r = riseAt(i, j);
    if (!(r < rise0 - FLAT.gain && r < rise0 * FLAT.ratio)) continue;
    if (WET.has(kindAt(x, z)) || faceAt(x, z)) continue;
    const score = r + FLAT.perM * d + FLAT.back * Math.max(0, sd[q] - FLAT.sd[1]);
    cands.push({ x, z, sd: sd[q], rise: r, d, score });
  }
  cands.sort((a, b) => a.score - b.score);
  const out = [];
  for (const k of cands) {
    if (out.length >= FLAT.tries * 3) break;
    if (out.some((o) => Math.hypot(o.x - k.x, o.z - k.z) < 10)) continue;
    // (a disc's worth of wet or cliff ground anywhere on it, no: the centre alone can miss a bog's edge)
    let bad = 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = k.x + di * FLAT.disc * 0.7, z = k.z + dj * FLAT.disc * 0.7; if (WET.has(kindAt(x, z)) || faceAt(x, z)) bad++; }
    if (bad > 1 || nearTrail(k.x, k.z, FLAT.trail) || nearOtherSite(k.x, k.z, c, FLAT.other) || moved.some((m) => m.c !== c && Math.hypot(m.x - k.x, m.z - k.z) < FLAT.other)) continue;
    out.push(k);
  }
  return { rise0, rise: out.length ? out[0].rise : rise0, cands: out.slice(0, FLAT.tries) };
}

// the fire ring as props.js buildCampsite puts it
// (old: as before round world; else on up the bank out of the water, as props.js campFire does now)
function fireOf(c, old = false) {
  const dir = world.deeperDir(c.x, c.z), off = c.shore < 4 ? 6 : 0;
  let x = c.x - dir.x * off, z = c.z - dir.z * off;
  if (!old) for (let i = 0; i < 60 && world.shoreAt(x, z) < FIRE_DRY; i++) { const d = world.deeperDir(x, z); x -= d.x; z -= d.z; }
  return { x, z, dir };
}
// the old way walkable: the ring on dry land, and no 1.5 m step past the wall from it down to the water
function oldOkOf(c) {
  const f = fireOf(c, true), old = oldWay(f), g = steepest(old);
  return { ok: world.shoreAt(f.x, f.z) > 0.5 && g <= ACCESS.wall && world.shoreAt(old[old.length - 1][0], old[old.length - 1][1]) <= 0.5, g };
}

// a walk's steps: the steepest 1.5 m step along the polyline pts (both ways: up is the wall, down too as a return)
function steepest(pts, step = 0.5, span = 1.5) {
  const s = [];
  for (let i = 1; i < pts.length; i++) {
    const [x0, z0] = pts[i - 1], [x1, z1] = pts[i], L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / step));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) s.push([x0 + ((x1 - x0) * k) / n, z0 + ((z1 - z0) * k) / n]);
  }
  const k = Math.max(1, Math.round(span / step));
  let worst = 0;
  const h = s.map(([x, z]) => H(x, z));
  const cum = [0]; // (along the walk, not the chord: a hairpin's corner is no steeper than its legs)
  for (let i = 1; i < s.length; i++) cum.push(cum[i - 1] + Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]));
  for (let i = k; i < s.length; i++) { const d = cum[i] - cum[i - k] || 1; worst = Math.max(worst, Math.abs(h[i] - h[i - k]) / d); }
  return worst;
}
// the old way: from the ring straight down the shore's fall line to the waterline
function oldWay(f) {
  const pts = [[f.x, f.z]];
  let x = f.x, z = f.z;
  for (let i = 0; i < 200; i++) {
    const sd = world.shoreAt(x, z);
    if (sd <= 0.2) break;
    const d = world.deeperDir(x, z);
    x += d.x * 0.5; z += d.z * 0.5;
    pts.push([x, z]);
  }
  return pts;
}

// is (x, z) on the bank a canoe can be landed at: the water a few metres out deep enough to float it, the bank from the
// waterline up to here no steeper than the walk; returns the bank's grade, or -1
function landingAt(x, z) {
  const sd = world.shoreAt(x, z);
  if (sd < 0.6 || sd > 3) return -1;
  const d = world.deeperDir(x, z);
  const wx = x + d.x * sd, wz = z + d.z * sd; // the waterline
  const ox = x + d.x * (sd + 4), oz = z + d.z * (sd + 4); // 4 m out
  if (world.shoreAt(ox, oz) > -2) return -1;
  const lv = world.levelAt(ox, oz, 3);
  if (!(lv - H10(ox, oz) >= 0.3)) return -1; // (the canoe floats there)
  const h = H(x, z);
  if (h < lv + 0.05) return -1; // dry
  const bank = steepest([[wx, wz], [x, z]], 0.25, 1.0);
  return bank <= ACCESS.grade ? bank : -1;
}

// least-cost walks out from the ring on a 1 m lattice: { n, side, cost, len, prev, h, sd, ok }
function walks(f) {
  const R = ACCESS.reach, c = ACCESS.cell, n = Math.round(R / c), side = 2 * n + 1, N = side * side;
  const X = (q) => f.x + ((q % side) - n) * c, Z = (q) => f.z + (Math.floor(q / side) - n) * c;
  const h = new Float32Array(N), sd = new Float32Array(N);
  for (let q = 0; q < N; q++) { const x = X(q), z = Z(q); sd[q] = world.shoreAt(x, z); h[q] = sd[q] > -1 ? H(x, z) : -1e4; }
  const cost = new Float32Array(N).fill(Infinity), len = new Float32Array(N), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  const start = n * side + n;
  cost[start] = 0;
  // a binary heap of [cost, q]
  const heap = [[0, start]];
  const push = (e) => { heap.push(e); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1], [2, 1], [1, 2], [-2, 1], [-1, 2], [2, -1], [1, -2], [-2, -1], [-1, -2]];
  while (heap.length) {
    const [cq, q] = pop();
    if (done[q]) continue;
    done[q] = 1;
    const qi = q % side, qj = Math.floor(q / side);
    for (const [di, dj] of NB) {
      const i = qi + di, j = qj + dj;
      if (i < 0 || j < 0 || i >= side || j >= side) continue;
      const p = j * side + i;
      if (done[p] || sd[p] < 0.5) continue; // (on land: the bank's last half metre is the landing's)
      const L = Math.hypot(di, dj) * c, gr = Math.abs(h[p] - h[q]) / L;
      if (gr > ACCESS.grade) continue;
      // a knight's move must not jump a steep bit in between: the midpoint's ground on the line
      if (Math.abs(di) + Math.abs(dj) === 3) { const hm = H((X(p) + X(q)) / 2, (Z(p) + Z(q)) / 2); if (Math.abs(hm - h[q]) / (L / 2) > ACCESS.grade || Math.abs(h[p] - hm) / (L / 2) > ACCESS.grade) continue; }
      const w = cq + L * (1 + 5 * gr * gr + (sd[p] < 2 ? 0.5 : 0));
      if (w < cost[p]) { cost[p] = w; len[p] = len[q] + L; prev[p] = q; push([w, p]); }
    }
  }
  return { n, side, cost, len, prev, h, sd, X, Z };
}
function trace(W, q) {
  const pts = [];
  for (let p = q; p >= 0; p = W.prev[p]) pts.push([W.X(p), W.Z(p)]);
  return pts.reverse(); // from the ring
}
// Douglas-Peucker, then no stretch longer than `most`
function simplify(pts, tol = 1.4) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop();
    if (b - a < 2) continue;
    const [x0, z0] = pts[a], [x1, z1] = pts[b], dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz) || 1;
    let best = -1, bd = tol;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i][0] - x0) * dz - (pts[i][1] - z0) * dx) / L; if (d > bd) { bd = d; best = i; } }
    // (and never a straight stretch steeper than the walk the lattice found: cut at its middle until it is not)
    if (best < 0 && steepest([pts[a], pts[b]]) > ACCESS.grade + 0.08) best = (a + b) >> 1;
    if (best > 0) { keep[best] = 1; st.push([a, best], [best, b]); }
  }
  return pts.filter((p, i) => keep[i]);
}
const r1 = (v) => Math.round(v * 10) / 10;
// the table's points: flat [dx, dz, ...] in decimetres from the site's rounded x, z (world.js decodes them)
const pack = (c, pts) => pts.flatMap(([x, z]) => [Math.round((x - Math.round(c.x)) * 10), Math.round((z - Math.round(c.z)) * 10)]);
const unpack = (c, a) => { const out = []; for (let i = 0; i + 1 < a.length; i += 2) out.push([Math.round(c.x) + a[i] / 10, Math.round(c.z) + a[i + 1] / 10]); return out; };

for (const c of sites) binAdd(sBins, c.x, c.z, c);
const pathLen = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; };
const qq = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1) : null; };

// --verify (scripts/check-access.mjs): the written table against the ground, site by site: the old way and the new one
// walkable (no 1.5 m step past the walker's wall), the landing's water, the latrine's walk from the ring then and now
if (process.argv.includes('--verify')) {
  const T = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  const V = { sites: sites.length, stamp: T.for === (index.source && index.source.baked), old: { walkable: 0, not: 0 }, now: { walkable: 0, steep: [], none: [] }, latrine: { now: [], shore: [], none: 0 } };
  for (const c of sites) {
    const O = oldOkOf(c), og = O.g;
    if (O.ok) V.old.walkable++; else V.old.not++;
    const e0 = T.sites[keyOf(c)], e = e0 && { l: e0.l ? unpack(c, e0.l) : null, t: e0.t ? unpack(c, e0.t) : null };
    if (!e || !e.l) V.now.none.push({ x: Math.round(c.x), z: Math.round(c.z), oldSteepest: +og.toFixed(2) });
    else {
      const ng = steepest(e.l.slice(0, -1)), [wx, wz] = e.l[e.l.length - 1], d = world.deeperDir(wx, wz);
      const floats = world.levelAt(wx + d.x * 4, wz + d.z * 4, 3) - H10(wx + d.x * 4, wz + d.z * 4) >= 0.25;
      if (ng <= ACCESS.wall && floats) V.now.walkable++; else V.now.steep.push({ x: Math.round(c.x), z: Math.round(c.z), steepest: +ng.toFixed(2), floats });
    }
    if (e && e.t) { V.latrine.now.push(pathLen(e.t)); V.latrine.shore.push(world.shoreAt(e.t[e.t.length - 1][0], e.t[e.t.length - 1][1])); } else V.latrine.none++;
  }
  console.log(JSON.stringify({
    sites: V.sites, tableForThisRelease: V.stamp,
    landing: { before: { walkable: V.old.walkable, notWalkable: V.old.not }, after: { walkable: V.now.walkable, steep: V.now.steep.length, none: V.now.none.length } },
    latrine: { before: { walk: 15, note: '15 m straight back from the ring (props.js before round world)' }, after: { placed: V.latrine.now.length, none: V.latrine.none, walk: { min: qq(V.latrine.now, 0), p50: qq(V.latrine.now, 0.5), max: qq(V.latrine.now, 1) }, shore: { min: qq(V.latrine.shore, 0), p50: qq(V.latrine.shore, 0.5) } } },
    exceptions: { none: V.now.none, steep: V.now.steep },
  }, null, 1));
  await vite.close();
  process.exit(0);
}
const table = {};
const stats = { rise0: [], riseAfter: [], flatMoved: [], sites: 0, oldOk: 0, oldBad: 0, newOk: 0, none: [], moved: 0, latrine: 0, latrineLen: [], latrineSd: [], wayLen: [], wayGrade: [], oldWorst: [] };
const t0 = Date.now();
sites.forEach((c, idx) => {
  if (only !== null && idx !== only) return;
  if (onlyKey && keyOf(c) !== onlyKey) return;
  stats.sites++;
  const O = oldOkOf(c), oldG = O.g, oldOk = O.ok, old = oldWay(fireOf(c, true));
  if (oldOk) stats.oldOk++; else { stats.oldBad++; stats.oldWorst.push([keyOf(c), +oldG.toFixed(2)]); }
  // the landing: of the bank's points reached, the cheapest by the walk plus its bank
  const landingOf = (W) => {
    let best = -1, bestC = Infinity, bestBank = 0;
    for (let q = 0; q < W.cost.length; q++) {
      if (!(W.cost[q] < Infinity) || W.sd[q] > 3) continue;
      const bank = landingAt(W.X(q), W.Z(q));
      if (bank < 0) continue;
      const cc = W.cost[q] + 12 * bank;
      if (cc < bestC) { bestC = cc; best = q; bestBank = bank; }
    }
    return { best, bestBank };
  };
  const e = {};
  // round flat: the site on the flattest ground near its point that has a landing in reach (FLAT), else where it is
  let site = c, f = null, W = null, Lw = null;
  const F = flatOf(c);
  stats.rise0.push(F.rise0);
  for (const k of F.cands) {
    const m = { x: k.x, z: k.z, shore: k.sd }, f2 = fireOf(m), W2 = walks(f2), L2 = landingOf(W2);
    if (L2.best < 0 || W2.len[L2.best] > FLAT.way) continue;
    site = m; f = f2; W = W2; Lw = L2;
    e.m = [Math.round((k.x - Math.round(c.x)) * 10), Math.round((k.z - Math.round(c.z)) * 10)]; e.ms = Math.round(k.sd * 10) / 10;
    moved.push({ c, x: k.x, z: k.z });
    stats.flatMoved.push(+Math.hypot(k.x - c.x, k.z - c.z).toFixed(1)); stats.riseAfter.push(k.rise);
    break;
  }
  if (!f) { f = fireOf(c); W = walks(f); Lw = landingOf(W); stats.riseAfter.push(F.rise0); }
  const best = Lw.best, bestBank = Lw.bestBank;
  if (debug) {
    let reached = 0, bankN = 0; const why = {};
    for (let q = 0; q < W.cost.length; q++) if (W.cost[q] < Infinity) { reached++; if (W.sd[q] <= 3 && W.sd[q] >= 0.6) { bankN++; const x = W.X(q), z = W.Z(q), d = world.deeperDir(x, z), sd = W.sd[q], ox = x + d.x * (sd + 4), oz = z + d.z * (sd + 4); const k = world.shoreAt(ox, oz) > -2 ? 'out not water' : !(world.levelAt(ox, oz, 3) - H10(ox, oz) >= 0.3) ? 'shallow' : H(x, z) < world.levelAt(ox, oz, 3) + 0.05 ? 'wet' : 'bank steep'; why[k] = (why[k] || 0) + 1; } }
    const sdq = []; for (let q = 0; q < W.cost.length; q++) if (W.cost[q] < Infinity) sdq.push(W.sd[q]);
    console.log({ fire: f, sdFire: world.shoreAt(f.x, f.z), shore: c.shore, reached, bankN, why, minSdReached: Math.min(...sdq), level: world.levelAt(f.x, f.z, 6), hFire: H(f.x, f.z) });
  }
  if (best >= 0) {
    const way = simplify(trace(W, best));
    // on to the waterline
    const [lx, lz] = way[way.length - 1], d = world.deeperDir(lx, lz), s = world.shoreAt(lx, lz);
    const wl = [lx + d.x * s, lz + d.z * s];
    const L = [...way.map(([x, z]) => [r1(x), r1(z)]), [r1(wl[0]), r1(wl[1])]];
    e.l = pack(c, L);
    const g2 = steepest(L.slice(0, -1));
    if (debug) { const raw = trace(W, best); console.log('raw steepest', steepest(raw).toFixed(2), 'simplified', g2.toFixed(2)); for (let i = 1; i < L.length - 1; i++) console.log(i, L[i - 1], L[i], steepest([L[i - 1], L[i]]).toFixed(2), 'sd', world.shoreAt(L[i][0], L[i][1]).toFixed(1)); }
    stats.newOk++; stats.wayLen.push(W.len[best]); stats.wayGrade.push(g2);
    const ox = old[old.length - 1][0], oz = old[old.length - 1][1];
    if (Math.hypot(wl[0] - ox, wl[1] - oz) > 8) stats.moved++;
    e.b = +bestBank.toFixed(2);
  } else stats.none.push({ key: keyOf(c), x: Math.round(c.x), z: Math.round(c.z), old: +oldG.toFixed(2) });
  // the latrine: back from the water along a walk, on flat ground
  const sdF = world.shoreAt(f.x, f.z), home = tileOf(site.x, site.z);
  let lb = -1, lbS = -Infinity;
  for (let q = 0; q < W.cost.length; q++) {
    const L = W.len[q];
    if (!(W.cost[q] < Infinity) || L < LATRINE.len[0] || L > LATRINE.len[1]) continue;
    const x = W.X(q), z = W.Z(q), sd = W.sd[q];
    if (sd < Math.max(sdF + 6, 12)) continue; // never toward the water
    if (tileOf(x, z) !== home || nearTrail(x, z, 8) || nearOtherSite(x, z, c, 30)) continue; // (in the site's own tile: props.js builds it there)
    const e2 = 0.8, flat = Math.hypot(H(x + e2, z) - H(x - e2, z), H(x, z + e2) - H(x, z - e2)) / (2 * e2);
    if (flat > LATRINE.flat) continue;
    const sc = Math.min(sd, sdF + 45) - 0.6 * Math.abs(L - LATRINE.want) - 25 * flat;
    if (sc > lbS) { lbS = sc; lb = q; }
  }
  if (lb >= 0) {
    const tr = simplify(trace(W, lb), 0.7);
    e.t = pack(c, tr);
    stats.latrine++; stats.latrineLen.push(W.len[lb]); stats.latrineSd.push(W.sd[lb]);
  }
  if (e.l || e.t) table[keyOf(c)] = e;
  if (cache.size > 4e6) cache.clear();
  if (idx % 200 === 0) process.stdout.write(`  ${idx}/${sites.length} ${((Date.now() - t0) / 1000).toFixed(0)} s\n`);
});

const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1) : null; };
console.log(JSON.stringify({
  sites: stats.sites,
  before: { walkable: stats.oldOk, notWalkable: stats.oldBad },
  after: { landing: stats.newOk, none: stats.none.length, movedOver8m: stats.moved, wayLen: { p50: q(stats.wayLen, 0.5), p90: q(stats.wayLen, 0.9), max: q(stats.wayLen, 1) }, wayGrade: { p50: q(stats.wayGrade, 0.5), p90: q(stats.wayGrade, 0.9), max: q(stats.wayGrade, 1) } },
  flat: { moved: stats.flatMoved.length, by: { p50: q(stats.flatMoved, 0.5), p90: q(stats.flatMoved, 0.9), max: q(stats.flatMoved, 1) }, riseAtRing: { before: { p50: q(stats.rise0, 0.5), p90: q(stats.rise0, 0.9), over1m: stats.rise0.filter((r) => r > 1).length, over2m: stats.rise0.filter((r) => r > 2).length, over3m: stats.rise0.filter((r) => r > 3).length }, after: { p50: q(stats.riseAfter, 0.5), p90: q(stats.riseAfter, 0.9), over1m: stats.riseAfter.filter((r) => r > 1).length, over2m: stats.riseAfter.filter((r) => r > 2).length, over3m: stats.riseAfter.filter((r) => r > 3).length } } },
  latrine: { placed: stats.latrine, len: { p10: q(stats.latrineLen, 0.1), p50: q(stats.latrineLen, 0.5), p90: q(stats.latrineLen, 0.9) }, shore: { p10: q(stats.latrineSd, 0.1), p50: q(stats.latrineSd, 0.5) } },
  exceptions: stats.none,
  worstOld: stats.oldWorst.sort((a, b) => b[1] - a[1]).slice(0, 12),
}, null, 1));
if (!checkOnly && only === null) {
  const out = { about: 'Round world: each campsite\'s landing and way up (l: from the fire ring to the waterline) and latrine trail (t: from the ring to the box), keyed by the site\'s rounded x:z, as flat [dx, dz, ...] in decimetres from that point; b the bank\'s grade; m: the site moved to its flat (round flat: [dx, dz] decimetres from the key, ms its shore distance, m), so the ring and the rest are there. Written by scripts/camp-access.mjs; read by world.js.', for: index.source && index.source.baked, sites: table };
  fs.writeFileSync(outFile, JSON.stringify(out));
  console.log('wrote', outFile, (fs.statSync(outFile).size / 1024).toFixed(0), 'KB');
}
await vite.close();

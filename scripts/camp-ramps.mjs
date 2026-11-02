#!/usr/bin/env node
// Round ramps (2026-11-02, the owner: "steep landings for campsites need to be more gradual. a switch back maybe").
//
// For every campsite way up in src/camp-access.json (scripts/camp-access.mjs), on the ground the game draws there (the 2 m
// LiDAR lattice as detail-build.js chunkGround makes it, else the 10 m mesh), a ramp (src/ramps.js): the way's 3D line
// from the waterline to the fire ring, graded into the ground at runtime. The ramp
//   - starts on a low shelf RAMP.shelf m over the water, flat for SHELF m (where you step out of the canoe)
//   - climbs no steeper than RAMP.grade (20°), following the ground where the ground is gentler and cutting or filling
//     where it is not
//   - where the way is too short for its rise at that grade, is laid as a switchback instead: legs zig-zag across the
//     line from the shelf to the ring, with a flat turn (TURN m either side) between them; the way (`l`) becomes the
//     switchback, so the clearing, the faint strip and the walker follow it (`l0` keeps the way it replaces)
//   - eases back to the ground over a shoulder as wide as its cut or fill wants (SHOULDER)
// Written into the same table as r (flat [dx, dz, h, w] per point: decimetres from the site, centimetres over rb, shoulder
// decimetres), rb, sw. Run after camp-access.mjs, on the same release:
//
//   node scripts/camp-ramps.mjs [--data public/data] [--table src/camp-access.json] [--check] [--key x:z] [--sweep out.json]
//
// --check: writes nothing. --sweep: the drawn ground's steepest 1.5 m along each site's way from the water before (the way
// as camp-access.mjs left it, no ramps) and after (the ramped way on the ramped ground), per site, to a JSON file.
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const SHELF = 1.2, TURN = 0.9, FLAT = 0.06;
const SHOULDER = (cut) => Math.min(9, 1.5 + 2.2 * Math.abs(cut));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.resolve(arg('--data', path.join(root, 'public/data'))) + '/';
const tableFile = path.resolve(arg('--table', path.join(root, 'src/camp-access.json')));
const checkOnly = process.argv.includes('--check');
const onlyKey = arg('--key', null), sweepOut = arg('--sweep', null);

const vite = await createServer({ root, configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
let gridMod, terrain, detailBuild, ramps, rngMod;
try {
  gridMod = await vite.ssrLoadModule('/src/grid.js');
  terrain = await vite.ssrLoadModule('/src/terrain-build.js');
  detailBuild = await vite.ssrLoadModule('/src/detail-build.js');
  ramps = await vite.ssrLoadModule('/src/ramps.js');
  rngMod = await vite.ssrLoadModule('/src/rng.js');
} catch (e) { await vite.close(); throw e; }
const { TileGrid, GridQueries } = gridMod;
const G = ramps.RAMP.grade;

// the release's ground, as scripts/camp-access.mjs reads it
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
    if (tiles.size > 60) tiles.clear();
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
let cache = new Map();
const H10 = (x, z) => terrain.meshHeightAt(world, x, z, cache);
let detailIndex = null;
try { detailIndex = JSON.parse(fs.readFileSync(dataDir + 'detail/index.json', 'utf8')); } catch { /* 10 m only */ }
// the 2 m ground in BLK-square blocks of a chunk, each worked out by chunkGround on its own (it is per sample), so a site
// costs a block or two, not a whole 640 m chunk; a block starts on an even sample, so its squares split as the chunk's do
const BLK = 64;
let raws = new Map(), blocks = new Map();
function chunk2(x, z) {
  if (!detailIndex) return null;
  const L = detailIndex.levels['2'], gox = g.originX + g.cell / 2, goz = g.originZ + g.cell / 2;
  const gx = Math.floor((x - gox) / L.size), gy = Math.floor((z - goz) / L.size), tx = Math.floor(gx / L.perTile), ty = Math.floor(gy / L.perTile);
  const name = `${tx}_${ty}_${gx - tx * L.perTile}_${gy - ty * L.perTile}`;
  if (!raws.has(name)) {
    let D = null;
    if ((detailIndex.chunks['2'] || {})[name]) {
      const raw = zlib.gunzipSync(fs.readFileSync(`${dataDir}detail/${L.dir}/${name}.bin`));
      D = detailBuild.decodeChunk(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
    }
    if (raws.size > 24) raws.clear();
    raws.set(name, D);
  }
  const D = raws.get(name);
  if (!D) return null;
  const K = Math.floor((x - D.x0) / D.r), M = Math.floor((z - D.z0) / D.r);
  if (K < 0 || M < 0 || K >= D.n - 1 || M >= D.n - 1) return null;
  const bk = Math.floor(K / BLK), bm = Math.floor(M / BLK), key = `${name}/${bk}/${bm}`;
  if (!blocks.has(key)) {
    const k0 = bk * BLK, m0 = bm * BLK, N = BLK + 1, h = new Float32Array(N * N);
    // (square, as chunkGround reads n x n; past the chunk's far edges the last sample repeats, never read by latticeAt here)
    for (let l = 0; l < N; l++) for (let k = 0; k < N; k++) h[l * N + k] = D.h[Math.min(D.n - 1, m0 + l) * D.n + Math.min(D.n - 1, k0 + k)];
    const Lg = detailBuild.chunkGround(world, { n: N, r: D.r, x0: D.x0 + k0 * D.r, z0: D.z0 + m0 * D.r, h }, cache).L;
    if (blocks.size > 400) blocks.clear();
    blocks.set(key, Lg);
  }
  return blocks.get(key);
}
const lidar = (x, z) => !!chunk2(x, z);
const H = (x, z) => { const L = chunk2(x, z); if (L) { const y = detailBuild.latticeAt(L, x, z); if (y === y) return y; } return H10(x, z); };
const reset = () => { cache = new Map(); blocks = new Map(); };

const T = JSON.parse(fs.readFileSync(tableFile, 'utf8'));
if (T.for !== (index.source && index.source.baked)) { console.error('table is for', T.for, 'not this release', index.source && index.source.baked); await vite.close(); process.exit(1); }
const unpack = (rx, rz, a) => { const out = []; for (let i = 0; i + 1 < a.length; i += 2) out.push([rx + a[i] / 10, rz + a[i + 1] / 10]); return out; };
const pack = (rx, rz, pts) => pts.flatMap(([x, z]) => [Math.round((x - rx) * 10), Math.round((z - rz) * 10)]);

// a polyline's samples every ~step metres: { x, z, s, v } (v: the index of the vertex a sample sits on, else -1)
function samples(pts, step = 0.5) {
  const out = [{ x: pts[0][0], z: pts[0][1], s: 0, v: 0 }];
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, z0] = pts[i - 1], [x1, z1] = pts[i], L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / step));
    for (let k = 1; k <= n; k++) out.push({ x: x0 + ((x1 - x0) * k) / n, z: z0 + ((z1 - z0) * k) / n, s: s + (L * k) / n, v: k === n ? i : -1 });
    s += L;
  }
  return out;
}
// the steepest grade over `span` metres of walk along samples with heights h
function steepestOf(S, h, span = 1.5) {
  let worst = 0, at = -1;
  for (let i = 1, j = 0; i < S.length; i++) {
    while (j < i && S[i].s - S[j + 1].s >= span) j++;
    const d = S[i].s - S[j].s;
    if (d < span * 0.66) continue;
    const gr = Math.abs(h[i] - h[j]) / d;
    if (gr > worst) { worst = gr; at = i; }
  }
  return { worst, at };
}
const deg = (gr) => (Math.atan(gr) * 180) / Math.PI;

// The graded profile along pts (from the waterline up): pinned at h0 at the water and at the ground at the ring, each step
// no steeper than its limit (the shelf and the turns nearly flat), as near the ground as that allows: the ground clamped
// into the band the two pins and the limits leave, then the limits enforced forward and backward and the two averaged.
function fit(pts, h0, scale = 1) {
  const S = samples(pts), n = S.length;
  const turns = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const ax = pts[i][0] - pts[i - 1][0], az = pts[i][1] - pts[i - 1][1], bx = pts[i + 1][0] - pts[i][0], bz = pts[i + 1][1] - pts[i][1];
    const c = (ax * bx + az * bz) / ((Math.hypot(ax, az) * Math.hypot(bx, bz)) || 1);
    if (c < Math.cos((50 * Math.PI) / 180)) turns.push(S.find((q) => q.v === i).s);
  }
  const gnd = S.map((q) => H(q.x, q.z));
  const lim = new Float64Array(n); // the most a step from i - 1 to i may rise or fall
  for (let i = 1; i < n; i++) {
    const sm = (S[i].s + S[i - 1].s) / 2, ds = S[i].s - S[i - 1].s;
    const flat = sm < SHELF || turns.some((t) => Math.abs(sm - t) < TURN);
    lim[i] = ds * (flat ? FLAT : G * scale);
  }
  const h1 = gnd[n - 1], up = new Float64Array(n);
  for (let i = 1; i < n; i++) up[i] = up[i - 1] + lim[i];
  const total = up[n - 1];
  const need = Math.abs(h1 - h0);
  if (need > total + 1e-6) return { ok: false, need, total, S, gnd };
  const lo = new Float64Array(n), hi = new Float64Array(n), p = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    lo[i] = Math.max(h0 - up[i], h1 - (total - up[i])); hi[i] = Math.min(h0 + up[i], h1 + (total - up[i]));
    p[i] = Math.min(hi[i], Math.max(lo[i], gnd[i]));
  }
  const f = Float64Array.from(p), b = Float64Array.from(p);
  for (let i = 1; i < n; i++) f[i] = Math.min(f[i - 1] + lim[i], Math.max(f[i - 1] - lim[i], f[i]));
  for (let i = n - 2; i >= 0; i--) b[i] = Math.min(b[i + 1] + lim[i + 1], Math.max(b[i + 1] - lim[i + 1], b[i]));
  for (let i = 0; i < n; i++) p[i] = (f[i] + b[i]) / 2;
  let cut = 0;
  for (let i = 0; i < n; i++) cut = Math.max(cut, Math.abs(p[i] - gnd[i]));
  return { ok: true, need, total, S, gnd, p, cut, len: S[n - 1].s, turns: turns.length };
}

// switchbacks from the shelf's end S0 to the ring F: n legs zig-zagging a metres either side of the line between them
// (and to points past the ring inland, back to it by a last leg: a ring a few metres over the water on a steep bank)
function zigzags(W0, S0, F) {
  const out = [];
  const dx = F[0] - S0[0], dz = F[1] - S0[1], D0 = Math.hypot(dx, dz) || 1;
  for (const ext of [0, 4, 8]) {
    const E = [F[0] + (dx / D0) * ext, F[1] + (dz / D0) * ext];
    for (const z of zigzagsTo(W0, S0, E)) { if (ext) z.pts.push(F); out.push(z); }
  }
  return out;
}
function zigzagsTo(W0, S0, F) {
  const dx = F[0] - S0[0], dz = F[1] - S0[1], D = Math.hypot(dx, dz);
  if (D < 2) return [];
  const ux = dx / D, uz = dz / D, nx = -uz, nz = ux, out = [];
  // (both ways round, and one-sided: every other turn back on the line, for a way that runs along the shore)
  for (let n = 2; n <= 8; n++) for (const a of [2, 2.5, 3, 3.5, 4, 5, 6, 7, 8]) for (const side of [1, -1]) for (const one of [false, true]) {
    if (D / n < 1.4 || (one && n < 3)) continue; // (legs closer than that along the line are one bank)
    const pts = [W0, S0];
    for (let k = 1; k < n; k++) { const o = side * (k % 2 ? 1 : one ? 0 : -1) * a, t = (D * k) / n; pts.push([S0[0] + ux * t + nx * o, S0[1] + uz * t + nz * o]); }
    pts.push(F);
    out.push({ pts, n, a });
  }
  return out;
}
// (a leg never along the water's edge: the 2 m lattice's squares astride the waterline cannot draw a way there)
const onLand = (pts, from = SHELF + 0.6) => { const S = samples(pts), end = S[S.length - 1].s - 2.5; return S.every((q) => q.s < from || q.s > end || world.shoreAt(q.x, q.z) > 1.8); };

// Douglas-Peucker over the profile: keep the plan's vertices, and the samples the height or the shoulder needs
function simplifyRamp(S, p, w, keepIdx) {
  const n = S.length, keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  for (const i of keepIdx) keep[i] = 1;
  const idx = []; for (let i = 0; i < n; i++) if (keep[i]) idx.push(i);
  const st = []; for (let k = 1; k < idx.length; k++) st.push([idx[k - 1], idx[k]]);
  while (st.length) {
    const [a, b] = st.pop();
    if (b - a < 2) continue;
    let best = -1, bd = 0;
    for (let i = a + 1; i < b; i++) {
      const t = (S[i].s - S[a].s) / (S[b].s - S[a].s || 1);
      const e = Math.max(Math.abs(p[i] - (p[a] + (p[b] - p[a]) * t)) / 0.04, Math.abs(w[i] - (w[a] + (w[b] - w[a]) * t)) / 0.5);
      if (e > 1 && e > bd) { bd = e; best = i; }
    }
    if (best > 0) { keep[best] = 1; st.push([a, best], [best, b]); }
  }
  const out = []; for (let i = 0; i < n; i++) if (keep[i]) out.push(i);
  return out;
}

// the camp's bench as props.js buildCampsite puts it (2.6 m from the ring at the site's own bearing, 1.44 m long): no leg
// through it, and none through the ring's ground but the last few metres in (the walker goes round the bench and the seats)
function clearOfCamp(key, pts) {
  const [rx, rz] = key.split(':').map(Number), F = pts[pts.length - 1];
  const a = rngMod.hash2(rx, rz, 5) * 6.28, bx = F[0] + Math.cos(a) * 2.6, bz = F[1] + Math.sin(a) * 2.6, ax = -Math.sin(a), az = Math.cos(a);
  const S = samples(pts), end = S[S.length - 1].s;
  for (const q of S) {
    const t = Math.max(-0.72, Math.min(0.72, (q.x - bx) * ax + (q.z - bz) * az));
    if (Math.hypot(q.x - bx - ax * t, q.z - bz - az * t) < 1.4) return false;
    if (q.s < end - 3.2 && Math.hypot(q.x - F[0], q.z - F[1]) < 3.2) return false;
  }
  return true;
}
// a fitted candidate's ramp: its points [x, z, h, w] (simplified) and the shoulder by the cut or fill, the widest within 2 m
// along so it never pinches
function rampOf(F) {
  const { S, p, gnd } = F, n = S.length;
  const cutAt = gnd.map((y, i) => p[i] - y);
  const w = S.map((q) => { let m = 0; for (let j = 0; j < n; j++) if (Math.abs(S[j].s - q.s) <= 2) m = Math.max(m, Math.abs(cutAt[j])); return SHOULDER(m); });
  const keepIdx = S.map((q, i) => (q.v >= 0 ? i : -1)).filter((i) => i >= 0);
  return simplifyRamp(S, p, w, keepIdx).map((i) => [S[i].x, S[i].z, p[i], w[i]]);
}
// the drawn ground's steepest 1.5 m along pts with only this ramp in (the unramped ground's caches kept aside)
function drawnWith(pts, R) {
  const saved = [cache, blocks];
  const segs = [];
  for (let j = 1; j < R.length; j++) segs.push(...R[j - 1], ...R[j]);
  ramps.setRamps(new Float32Array(segs)); cache = new Map(); blocks = new Map();
  const gr = wayGrade(pts);
  ramps.setRamps(null); [cache, blocks] = saved;
  return gr;
}

// The ramp for a site: the way as it is if the grade fits in its length, else the switchback that fits with the least cut;
// either judged on the ground as it will be drawn (the 2 m lattice's squares astride the waterline cannot follow a way that
// hugs the shore, so a way along the water may draw steeper than its profile): the candidates are tried, best first, until
// one draws no steeper than DRAWN, else the one that draws gentlest.
const DRAWN = 22;
function plan(key, e) {
  const [rx, rz] = key.split(':').map(Number);
  const way = unpack(rx, rz, e.l0 || e.l), P = [...way].reverse(); // from the water up
  const W0 = P[0], d = world.deeperDir(W0[0], W0[1]);
  const lv = world.levelAt(W0[0] + d.x * 4, W0[1] + d.z * 4, 3);
  if (!(lv === lv)) return null;
  const h0 = lv + ramps.RAMP.shelf;
  // the shelf runs on from the waterline the way the way first goes, then the zig-zags from there to the ring
  const [x1, z1] = P[1], L1 = Math.hypot(x1 - W0[0], z1 - W0[1]) || 1;
  const S0 = [W0[0] + ((x1 - W0[0]) / L1) * SHELF, W0[1] + ((z1 - W0[1]) / L1) * SHELF];
  const cands = [];
  const straight = fit(P, h0);
  if (straight.ok) cands.push({ pts: P, Z: null, f: straight, score: 1.5 * straight.cut + 0.12 * straight.len - 1 });
  const direct = [W0, S0, P[P.length - 1]];
  const zs = [{ pts: direct, n: 1, a: 0 }, ...zigzags(W0, S0, P[P.length - 1])];
  let longest = null;
  for (const Z of zs) {
    if (!onLand(Z.pts) || !clearOfCamp(key, Z.pts)) continue;
    const f = fit(Z.pts, h0);
    if (!f.ok) { if (!longest || f.total / f.need > longest.f.total / longest.f.need) longest = { Z, f }; continue; }
    cands.push({ pts: Z.pts, Z: Z.n > 1 ? Z : null, f, score: 1.5 * f.cut + 0.12 * f.len + (Z.n > 1 ? 0.5 : 0) });
  }
  cands.sort((a, b) => a.score - b.score);
  let best = null;
  for (const c of cands.slice(0, 24)) {
    const R = rampOf(c.f), gr = drawnWith(c.pts, R);
    if (!best || gr < best.gr - 0.5 || (Math.abs(gr - best.gr) <= 0.5 && c.score < best.c.score)) best = { c, R, gr };
    if (gr <= DRAWN) break;
  }
  let relaxed = null;
  if (!best) {
    // no switchback fits on the land there: the straight way (or the longest zig-zag) at the grade its rise needs
    const base = longest && longest.f.total > straight.total ? longest : { Z: null, f: straight };
    const pts = base.Z ? base.Z.pts : P;
    let scale = Math.max(1, base.f.need / base.f.total), F = null;
    for (let k = 0; k < 60; k++, scale *= 1.05) { F = fit(pts, h0, scale); if (F.ok) break; }
    if (!F || !F.ok) return null;
    relaxed = deg(G * scale);
    const c = { pts, Z: base.Z && base.Z.n > 1 ? base.Z : null, f: F };
    const R = rampOf(F);
    best = { c, R, gr: drawnWith(pts, R) };
  }
  const { c, R } = best, F = c.f, sw = c.Z;
  const rb = Math.floor(Math.min(...R.map((q) => q[2])));
  const r = R.flatMap(([x, z, h, w]) => [Math.round((x - rx) * 10), Math.round((z - rz) * 10), Math.round((h - rb) * 100), Math.round(w * 10)]);
  const moved = c.pts !== P;
  return { r, rb, sw: !!sw, l: moved ? pack(rx, rz, [...c.pts].reverse()) : null, cut: F.cut, len: F.len, relaxed, drawn: best.gr, lidar: lidar(W0[0], W0[1]), turns: sw ? sw.n - 1 : 0 };
}

// the drawn ground's steepest 1.5 m along a way (from the water up, the waterline in)
function wayGrade(pts) {
  const S = samples(pts), h = S.map((q) => H(q.x, q.z));
  return deg(steepestOf(S, h).worst);
}

// (in the 2 m chunks' order, so each chunk's ground is worked out once a pass)
const chunkOrder = (k) => { const [x, z] = k.split(':').map(Number); return Math.floor((z - g.originZ) / 640) * 1e6 + Math.floor((x - g.originX) / 640); };
const keys = Object.keys(T.sites).filter((k) => T.sites[k].l && (!onlyKey || k === onlyKey)).sort((a, b) => chunkOrder(a) - chunkOrder(b));
const before = new Map();
const t0 = Date.now();
if (sweepOut) for (const k of keys) { const [rx, rz] = k.split(':').map(Number); before.set(k, wayGrade([...unpack(rx, rz, T.sites[k].l0 || T.sites[k].l)].reverse())); }
if (sweepOut) console.log('before sweep', ((Date.now() - t0) / 1000).toFixed(0), 's');
const stats = { sites: keys.length, ramps: 0, straight: 0, switchbacks: 0, relaxed: [], cut: [], noLidar: 0 };
let i = 0;
for (const k of keys) {
  const e = T.sites[k];
  delete e.r; delete e.rb; delete e.sw;
  if (e.l0) { e.l = e.l0; delete e.l0; }
  const R = plan(k, e);
  if (++i % 250 === 0) console.log(`  ${i}/${keys.length} ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  if (!R) continue;
  // a way whose ground needs (nearly) nothing: no ramp
  if (R.cut < 0.12 && !R.l) { stats.straight++; continue; }
  e.r = R.r; e.rb = R.rb;
  if (R.l) { e.l0 = e.l; e.l = R.l; }
  if (R.sw) { e.sw = 1; stats.switchbacks++; }
  stats.ramps++; stats.cut.push(R.cut);
  if (!R.lidar) stats.noLidar++;
  if (R.relaxed) stats.relaxed.push([k, +R.relaxed.toFixed(1)]);
  if (onlyKey) console.log(JSON.stringify({ key: k, ...R, r: undefined, l: undefined }));
}
const q = (a, f) => { const s = [...a].sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(f * s.length))].toFixed(2) : null; };
console.log(JSON.stringify({ sites: stats.sites, ramps: stats.ramps, gentleAlready: stats.straight, switchbacks: stats.switchbacks, on10mOnly: stats.noLidar, cut: { p50: q(stats.cut, 0.5), p90: q(stats.cut, 0.9), max: q(stats.cut, 1) }, steeperThan20: stats.relaxed.length, relaxed: stats.relaxed.sort((a, b) => b[1] - a[1]).slice(0, 20) }, null, 1));

// The outfitters (--outfitters: the in-game sweep's JSON, each store's dockLand, dockHeading and door, as props.js laid
// them on the release's ground): the same grade from the water up the dock's line, through its land end, to the store's
// door, straight (a yard, no switchbacks). The dock's frame comes from the shore's distance field, not the ground, so it
// stands where it stood; its sill and steps, and the store's search, read the ramped ground as they are built.
const outFile = arg('--outfitters', null), outRows = [];
if (outFile) {
  T.outfitters = {};
  for (const o of JSON.parse(fs.readFileSync(path.resolve(outFile), 'utf8'))) {
    if (!o || o.none || !o.dockLand) continue;
    const Zx = Math.cos(o.dockHeading), Zz = -Math.sin(o.dockHeading);
    let [ax, az] = o.dockLand;
    for (let i = 0; i < 80 && world.shoreAt(ax, az) > 0; i++) { ax += Zx * 0.25; az += Zz * 0.25; }
    const pts = [[ax, az], o.dockLand, [o.door[0], o.door[1]]];
    if (Math.hypot(ax - o.dockLand[0], az - o.dockLand[1]) < 0.3) pts.splice(1, 1);
    const lv = world.levelAt(ax + Zx * 4, az + Zz * 4, 3);
    if (!(lv === lv)) continue;
    let F = fit(pts, lv + ramps.RAMP.shelf), relaxed = null;
    for (let k = 0, scale = 1.05; !F.ok && k < 60; k++, scale *= 1.05) { F = fit(pts, lv + ramps.RAMP.shelf, scale); relaxed = deg(G * scale); }
    if (!F.ok) continue;
    const before = wayGrade(pts);
    if (F.cut < 0.12) { outRows.push({ ep: o.ep, before: +before.toFixed(1), after: +before.toFixed(1), ramp: false }); continue; }
    const R = rampOf(F), rb = Math.floor(Math.min(...R.map((p) => p[2])));
    T.outfitters[o.ep] = { x: Math.round(ax * 10) / 10, z: Math.round(az * 10) / 10, rb, r: R.flatMap(([x, z, h, w]) => [Math.round((x - ax) * 10), Math.round((z - az) * 10), Math.round((h - rb) * 100), Math.round(w * 10)]) };
    outRows.push({ ep: o.ep, before: +before.toFixed(1), pts, ramp: true, relaxed, cut: +F.cut.toFixed(2) });
  }
  console.log('outfitters', Object.keys(T.outfitters).length, 'ramps of', outRows.length);
}

if (sweepOut) {
  // after: the ramps in the ground (as the game sets them: ramps.js makeRamps), the ground read again
  const segs = [];
  for (const k of keys) {
    const e = T.sites[k];
    if (!e.r) continue;
    const [rx, rz] = k.split(':').map(Number), pts = [];
    for (let j = 0; j + 3 < e.r.length; j += 4) pts.push([rx + e.r[j] / 10, rz + e.r[j + 1] / 10, e.rb + e.r[j + 2] / 100, e.r[j + 3] / 10]);
    for (let j = 1; j < pts.length; j++) segs.push(...pts[j - 1], ...pts[j]);
  }
  for (const o of Object.values(T.outfitters || {})) {
    const pts = [];
    for (let j = 0; j + 3 < o.r.length; j += 4) pts.push([o.x + o.r[j] / 10, o.z + o.r[j + 1] / 10, o.rb + o.r[j + 2] / 100, o.r[j + 3] / 10]);
    for (let j = 1; j < pts.length; j++) segs.push(...pts[j - 1], ...pts[j]);
  }
  ramps.setRamps(new Float32Array(segs));
  reset();
  const rows = [];
  for (const k of keys) {
    const e = T.sites[k], [rx, rz] = k.split(':').map(Number);
    const P = [...unpack(rx, rz, e.l)].reverse();
    rows.push({ key: k, before: +before.get(k).toFixed(1), after: +wayGrade(P).toFixed(1), sw: !!e.sw, ramp: !!e.r, lidar: lidar(P[0][0], P[0][1]) });
    if (onlyKey) console.log(samples(P).map((q) => `${q.s.toFixed(1)}:${world.shoreAt(q.x, q.z).toFixed(1)}:${H(q.x, q.z).toFixed(2)}:${ramps.rampAt(q.x, q.z, -999).toFixed(2)}`).join(' '));
  }
  const count = (f, t) => rows.filter((r) => r[f] > t).length;
  const sum = { sites: rows.length, before: { over25: count('before', 25), over35: count('before', 35), over45: count('before', 45), p50: q(rows.map((r) => r.before), 0.5), max: q(rows.map((r) => r.before), 1) }, after: { over25: count('after', 25), over35: count('after', 35), over45: count('after', 45), p50: q(rows.map((r) => r.after), 0.5), max: q(rows.map((r) => r.after), 1) } };
  for (const o of outRows) if (o.pts) { o.after = +wayGrade(o.pts).toFixed(1); delete o.pts; }
  if (outRows.length) sum.outfitters = { stores: outRows.length, ramps: outRows.filter((o) => o.ramp).length, before: { over25: outRows.filter((o) => o.before > 25).length, over35: outRows.filter((o) => o.before > 35).length, over45: outRows.filter((o) => o.before > 45).length }, after: { over25: outRows.filter((o) => o.after > 25).length, over35: outRows.filter((o) => o.after > 35).length, over45: outRows.filter((o) => o.after > 45).length } };
  console.log(JSON.stringify(sum, null, 1));
  fs.writeFileSync(path.resolve(sweepOut), JSON.stringify({ summary: sum, rows: rows.sort((a, b) => b.before - a.before), outfitters: outRows.sort((a, b) => b.before - a.before) }));
  console.log('sweep', sweepOut, ((Date.now() - t0) / 1000).toFixed(0), 's');
}
if (!checkOnly && !onlyKey) {
  fs.writeFileSync(tableFile, JSON.stringify(T));
  console.log('wrote', tableFile, (fs.statSync(tableFile).size / 1024).toFixed(0), 'KB');
}
await vite.close();

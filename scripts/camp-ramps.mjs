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
function withRamp(R, fn) {
  const saved = [cache, blocks], segs = [];
  for (let j = 1; j < (R ? R.length : 0); j++) segs.push(...R[j - 1], ...R[j]);
  ramps.setRamps(new Float32Array(segs)); cache = new Map(); blocks = new Map();
  try { return fn(); } finally { ramps.setRamps(null); [cache, blocks] = saved; }
}
// the rock steps along samples S with heights p: stretches whose grade over a metre stays past STEP.grade (from 0.5 m in),
// a tread every STEP.rise of their rise; { steps: [[x, z, yaw]], stepS: [[s0, s1]] }
function stepsOn(S, p, { tall = STEP.tall, most: mostOk = STEP.most } = {}) {
  const n = S.length, steep = new Uint8Array(n), steps = [], stepS = [];
  for (let i = 1, j = 0; i < n; i++) { while (j < i && S[i].s - S[j + 1].s >= 1) j++; const d = S[i].s - S[j].s; if (d > 0.6 && Math.abs(p[i] - p[j]) / d > STEP.grade) for (let k = j; k <= i; k++) steep[k] = 1; }
  for (let i = 0; i < n; ) {
    if (!steep[i]) { i++; continue; }
    let j = i; while (j + 1 < n && steep[j + 1]) j++;
    // (a few steps up a short pitch; a face steeper than STEP.most or taller than STEP.tall is a cliff, not a stair)
    let most = 0;
    for (let k = i + 2; k <= j; k++) most = Math.max(most, Math.abs(p[k] - p[k - 2]) / ((S[k].s - S[k - 2].s) || 1));
    if (Math.abs(p[j] - p[i]) >= STEP.minRise && Math.abs(p[j] - p[i]) <= tall && most <= mostOk && S[j].s > 0.5) {
      stepS.push([S[i].s, S[j].s]);
      let last = p[i];
      for (let k = i + 1; k <= j; k++) if (Math.abs(p[k] - last) >= STEP.rise) {
        last = p[k];
        const a = S[Math.max(0, k - 1)], b = S[Math.min(n - 1, k + 1)];
        steps.push([S[k].x, S[k].z, Math.atan2(b.z - a.z, b.x - a.x)]);
      }
    }
    i = j + 1;
  }
  return { steps, stepS };
}
function drawnWith(pts, R, skip = null) {
  const saved = [cache, blocks];
  const segs = [];
  for (let j = 1; j < (R ? R.length : 0); j++) segs.push(...R[j - 1], ...R[j]);
  ramps.setRamps(new Float32Array(segs)); cache = new Map(); blocks = new Map();
  const gr = skip ? wayGradeOff(pts, skip) : wayGrade(pts);
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
// ---- Round ramps 2 (2026-11-02, the owner on round 1: "so i dont like how it cuts the terrain like this. these sites have
// some way to get to them, many times the entrance to the site is further down, i wonder if there is another way to make the
// paths up without cutting the terrain too much"). The natural way up, not a carved one:
//   - the landing is looked for along the shore up to NAT.reach metres of walk from the ring, on the drawn ground: a low
//     bank (a cove, a shelving rock, a beach) where the ground at the waterline stands near the water and the first metres
//     are gentle, the canoe floating 4 m out; a longer walk is fine
//   - the way up is the least-cost walk on the drawn ground from there to the ring: slope costs little up to NAT.flat (18°),
//     dearly past it, and is barred past NAT.max (49°), so the walk runs along the contours, round the outcrops and slants
//     up the slope, winding as a real campsite trail does (a switchback only where the land itself gives the room)
//   - the ground is only touched lightly: no more than CAP m of cut or fill along the way (CAP_LAND at the waterline, where
//     the 2 m mesh's face is smoothed into a step-out), and where a short stretch stays steep, rock steps (flat slabs seated
//     on it, props.js campSteps: the `k` treads) instead of a cut
//   - a site whose way up is already gentle keeps it; a site with no gentle approach in reach keeps round 1's smallest ramp
//     (the fallback, listed)
const NAT = { reach: 170, cell: 1.5, flat: Math.tan((18 * Math.PI) / 180), max: 1.15, sdMin: 1.0, sdLand: 3.5 };
const CAP = 0.4, CAP_LAND = 0.8, STEP = { grade: Math.tan((27 * Math.PI) / 180), rise: 0.26, minRise: 0.35, tall: 1.8, most: Math.tan((46 * Math.PI) / 180) };
const capAt = (s) => CAP_LAND + (CAP - CAP_LAND) * Math.min(1, Math.max(0, (s - 1.5) / 2.5)); // (eased, never a step where it changes)
const edgeCost = (L, gr) => { const o = Math.max(0, gr - NAT.flat); return L * (1 + 1.2 * gr + 25 * o + 40 * o * o); };

// a landing at lattice point (x, z) on the bank: the canoe floats 4 m out, and the bank from the waterline up to here, as
// drawn; returns { pen, W (the waterline point), lv, bank, step } or null
function landingOf(x, z) {
  const sd = world.shoreAt(x, z), d = world.deeperDir(x, z);
  const W = [x + d.x * sd, z + d.z * sd], ox = W[0] + d.x * 4, oz = W[1] + d.z * 4;
  if (world.shoreAt(ox, oz) > -2) return null;
  const lv = world.levelAt(ox, oz, 3);
  if (!(lv === lv) || !(lv - H10(ox, oz) >= 0.3)) return null;
  const S = samples([W, [x, z]], 0.25), h = S.map((q) => H(q.x, q.z));
  const bank = steepestOf(S, h, 1.0).worst, step = H(W[0] - d.x * 0.6, W[1] - d.z * 0.6) - lv;
  if (bank > 2.5) return null;
  // (dear: a walk of a couple of hundred metres along the shore is better than a bank to climb out onto)
  return { pen: 12 * Math.max(0, bank - 0.3) + 220 * Math.max(0, bank - 0.45) + 150 * Math.max(0, step - 0.35), W, lv, bank, step };
}

// the least-cost walk from (fx, fz) over the drawn ground; target(q, x, z) -> null | { pen, ... } ends it at a cell (the
// best total of walk and pen), or `goal` [x, z] a fixed end. Returns { pts (from the start), cost, end } or null.
function walkFrom(fx, fz, { reach = NAT.reach, target = null, goal = null, blocked = null } = {}) {
  const c = NAT.cell, n = Math.round(reach / c), side = 2 * n + 1, N = side * side;
  const X = (q) => fx + ((q % side) - n) * c, Z = (q) => fz + (Math.floor(q / side) - n) * c;
  const h = new Float32Array(N).fill(NaN), sd = new Float32Array(N).fill(NaN);
  const hOf = (q) => { if (h[q] !== h[q]) { sd[q] = world.shoreAt(X(q), Z(q)); h[q] = sd[q] >= NAT.sdMin - 0.6 ? H(X(q), Z(q)) : -1e4; } return h[q]; };
  const cost = new Float32Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  const start = n * side + n;
  cost[start] = 0; hOf(start);
  const heap = [[0, start]];
  const push = (e) => { heap.push(e); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1], [2, 1], [1, 2], [-2, 1], [-1, 2], [2, -1], [1, -2], [-2, -1], [-1, -2]];
  const gq = goal ? Math.round((goal[1] - fz) / c + n) * side + Math.round((goal[0] - fx) / c + n) : -1;
  let best = null;
  while (heap.length) {
    const [cq, q] = pop();
    if (done[q]) continue;
    done[q] = 1;
    if (best && cq > best.total) break;
    if (q === gq) { best = { q, total: cq, end: null }; break; }
    if (target && sd[q] <= NAT.sdLand && q !== start) {
      const t = target(X(q), Z(q));
      if (t && cq + t.pen < (best ? best.total : Infinity)) best = { q, total: cq + t.pen, end: t };
    }
    const qi = q % side, qj = Math.floor(q / side);
    for (const [di, dj] of NB) {
      const i = qi + di, j = qj + dj;
      if (i < 0 || j < 0 || i >= side || j >= side) continue;
      const p = j * side + i;
      if (done[p]) continue;
      const hp = hOf(p);
      if (sd[p] < NAT.sdMin && p !== gq) continue;
      if (blocked && blocked(X(p), Z(p))) continue;
      const L = Math.hypot(di, dj) * c;
      let gr = Math.abs(hp - h[q]) / L;
      if (Math.abs(di) + Math.abs(dj) === 3) { const hm = H((X(p) + X(q)) / 2, (Z(p) + Z(q)) / 2); gr = Math.max(gr, Math.abs(hm - h[q]) / (L / 2), Math.abs(hp - hm) / (L / 2)); }
      if (gr > NAT.max) continue;
      const w = cq + edgeCost(L, gr);
      if (w < cost[p]) { cost[p] = w; prev[p] = q; push([w, p]); }
    }
  }
  if (onlyKey) { let reached = 0, bank = 0, minSd = Infinity; for (let q = 0; q < N; q++) if (done[q]) { reached++; minSd = Math.min(minSd, sd[q]); if (sd[q] <= NAT.sdLand) bank++; } console.log('walkFrom', { reached, bank, minSd, startSd: sd[start] }); }
  if (!best) return null;
  const pts = [];
  for (let p = best.q; p >= 0; p = prev[p]) pts.push([X(p), Z(p)]);
  return { pts: pts.reverse(), cost: best.total, end: best.end };
}

// Douglas-Peucker on a walk, never a chord steeper on the drawn ground than the walk it stands for
function simplifyWalk(pts, tol = 0.6) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  const gradeOf = (P) => { const S = samples(P, 0.5); return steepestOf(S, S.map((q) => H(q.x, q.z))).worst; };
  while (st.length) {
    const [a, b] = st.pop();
    if (b - a < 2) continue;
    const [x0, z0] = pts[a], [x1, z1] = pts[b], dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz) || 1;
    let best = -1, bd = tol;
    for (let i = a + 1; i < b; i++) { const d = Math.abs((pts[i][0] - x0) * dz - (pts[i][1] - z0) * dx) / L; if (d > bd) { bd = d; best = i; } }
    if (best < 0 && gradeOf([pts[a], pts[b]]) > gradeOf(pts.slice(a, b + 1)) + 0.06) best = (a + b) >> 1;
    if (best > 0) { keep[best] = 1; st.push([a, best], [best, b]); }
  }
  return pts.filter((p, i) => keep[i]);
}

// the light shaping along a way P (from the waterline up): round 1's graded profile, held to within CAP of the drawn ground
// (CAP_LAND over the first 2.5 m, the step-out at the water); the shoulder by the cut; the rock steps where it stays steep.
// Returns { R (ramp points, or null when it moves nothing), cut, steps [[x, z, yaw]], stepS [[s0, s1]], len }
function shapeWay(P, lv, { steps = true } = {}) {
  const h0 = lv + ramps.RAMP.shelf;
  let F = fit(P, h0);
  for (let k = 0, scale = 1.1; !F.ok && k < 80; k++, scale *= 1.1) F = fit(P, h0, scale);
  const S = F.S, g = F.gnd, n = S.length;
  const p = new Float64Array(n);
  for (let i = 0; i < n; i++) { const cap = capAt(S[i].s); p[i] = Math.min(g[i] + cap, Math.max(g[i] - cap, F.ok ? F.p[i] : g[i])); }
  p[n - 1] = g[n - 1];
  for (let pass = 0; pass < 2; pass++) for (let i = 1; i < n - 1; i++) { const cap = capAt(S[i].s), m = (p[i - 1] + 2 * p[i] + p[i + 1]) / 4; p[i] = Math.min(g[i] + cap, Math.max(g[i] - cap, m)); }
  let cut = 0;
  for (let i = 0; i < n; i++) cut = Math.max(cut, Math.abs(p[i] - g[i]));
  // the rock steps: stretches whose shaped grade over a metre stays past STEP.grade, a tread every STEP.rise of their rise
  const out = [], stepS = [];
  if (steps) {
    const steep = new Uint8Array(n);
    for (let i = 1, j = 0; i < n; i++) { while (j < i && S[i].s - S[j + 1].s >= 1) j++; const d = S[i].s - S[j].s; if (d > 0.6 && Math.abs(p[i] - p[j]) / d > STEP.grade) for (let k = j; k <= i; k++) steep[k] = 1; }
    for (let i = 0; i < n; ) {
      if (!steep[i]) { i++; continue; }
      let j = i; while (j + 1 < n && steep[j + 1]) j++;
      const rise = Math.abs(p[j] - p[i]);
      if (rise >= STEP.minRise && S[i].s > 0.8) {
        stepS.push([S[i].s, S[j].s]);
        let last = p[i];
        for (let k = i + 1; k <= j; k++) if (Math.abs(p[k] - last) >= STEP.rise) {
          last = p[k];
          const a = S[Math.max(0, k - 1)], b = S[Math.min(n - 1, k + 1)];
          out.push([S[k].x, S[k].z, Math.atan2(b.z - a.z, b.x - a.x)]);
        }
      }
      i = j + 1;
    }
  }
  if (cut < 0.08) return { R: null, cut, steps: out, stepS, len: S[n - 1].s };
  const w = S.map((q) => { let m = 0; for (let j = 0; j < n; j++) if (Math.abs(S[j].s - q.s) <= 2) m = Math.max(m, Math.abs(p[j] - g[j])); return SHOULDER(m); });
  const keepIdx = S.map((q, i) => (q.v >= 0 ? i : -1)).filter((i) => i >= 0);
  const R = simplifyRamp(S, p, w, keepIdx).map((i) => [S[i].x, S[i].z, p[i], w[i]]);
  return { R, cut, steps: out, stepS, len: S[n - 1].s };
}
const packRamp = (rx, rz, R) => { const rb = Math.floor(Math.min(...R.map((q) => q[2]))); return { rb, r: R.flatMap(([x, z, h, w]) => [Math.round((x - rx) * 10), Math.round((z - rz) * 10), Math.round((h - rb) * 100), Math.round(w * 10)]) }; };
const wayLen = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; };
// the drawn steepest along a way, leaving out the stretches its rock steps climb
function wayGradeOff(pts, skip) {
  const S = samples(pts), h = S.map((q) => H(q.x, q.z));
  let worst = 0;
  for (let i = 1, j = 0; i < S.length; i++) {
    while (j < i && S[i].s - S[j + 1].s >= 1.5) j++;
    const d = S[i].s - S[j].s;
    if (d < 1) continue;
    if (skip.some(([a, b]) => S[i].s >= a - 0.3 && S[j].s <= b + 0.3)) continue;
    worst = Math.max(worst, Math.abs(h[i] - h[j]) / d);
  }
  return deg(worst);
}

const stats = { sites: keys.length, kept: 0, natural: 0, fallback: [], cut: [], len: [], steps: 0, stepSites: 0, moved: [] };
const stepRanges = new Map();
let i = 0;
for (const k of keys) {
  const e = T.sites[k];
  delete e.r; delete e.rb; delete e.sw; delete e.k; delete e.nat; delete e.fb;
  if (e.l0) { e.l = e.l0; delete e.l0; }
  if (++i % 100 === 0) console.log(`  ${i}/${keys.length} ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  const [rx, rz] = k.split(':').map(Number);
  const way = unpack(rx, rz, e.l), ring = way[0], P0 = [...way].reverse();
  const d0 = world.deeperDir(P0[0][0], P0[0][1]), lv0 = world.levelAt(P0[0][0] + d0.x * 4, P0[0][1] + d0.z * 4, 3);
  // the candidates, each shaped lightly and judged on the ground as it will be drawn (its rock steps' stretches left out):
  // the way as it is, and, where that is not already gentle, the natural one from the best low landing in reach
  const cands = [];
  const judge = (P, lv, how) => {
    const R = shapeWay(P, lv, { steps: false });
    // the rock steps where the ground as drawn with this shaping still climbs past STEP.grade (not the profile: the lattice
    // draws its own), then the steepest left between them
    withRamp(R.R, () => { const S = samples(P), h = S.map((q) => H(q.x, q.z)); const st = stepsOn(S, h); R.steps = st.steps; R.stepS = st.stepS; });
    cands.push({ P, lv, how, R, off: drawnWith(P, R.R, R.stepS) });
  };
  cands.push({ P: P0, lv: lv0, how: 'asis', R: { R: null, cut: 0, steps: [], stepS: [], len: 0 }, off: drawnWith(P0, null) });
  judge(P0, lv0, 'kept');
  if (cands[0].off > 22) {
    // (round the camp's bench and its seats, as props.js puts them: 2.6 m from the ring at the site's own bearing)
    const ba = rngMod.hash2(rx, rz, 5) * 6.28, bx = ring[0] + Math.cos(ba) * 2.6, bz = ring[1] + Math.sin(ba) * 2.6, bax = -Math.sin(ba), baz = Math.cos(ba);
    const blocked = (x, z) => { const t = Math.max(-0.72, Math.min(0.72, (x - bx) * bax + (z - bz) * baz)); return Math.hypot(x - bx - bax * t, z - bz - baz * t) < 1.6; };
    const W = walkFrom(ring[0], ring[1], { target: landingOf, blocked });
    if (onlyKey) console.log('walk', W ? { cost: W.cost, n: W.pts.length, end: W.end && { bank: W.end.bank, step: W.end.step, pen: W.end.pen } } : null);
    if (W && W.end) judge([W.end.W, ...[...simplifyWalk(W.pts)].reverse()], W.end.lv, 'natural');
  }
  // the natural way unless the way as it is draws gentler by more than a couple of degrees
  const here = cands[1].off < cands[0].off - 0.5 ? cands[1] : cands[0], nat = cands[2], best = nat && nat.off <= Math.max(22, here.off + 2) ? nat : here;
  if (onlyKey) console.log('cands', cands.map((c) => ({ how: c.how, off: c.off, cut: c.R.cut, len: wayLen(c.P), steps: c.R.steps.length })));
  // past what the light touch and the steps can make walkable (a stretch past 40° left between the steps): the fallback
  let { P, R, how } = best.off > 40 ? { P: null, R: null, how: null } : best;
  if (!P) {
    const F = plan(k, e);
    if (F) { e.r = F.r; e.rb = F.rb; if (F.l) { e.l0 = e.l; e.l = F.l; } if (F.sw) e.sw = 1; }
    e.fb = 1; stats.fallback.push(k); stats.cut.push(F ? F.cut : 0);
    continue;
  }
  if (how === 'natural') { e.l0 = e.l; e.l = pack(rx, rz, [...P].reverse()); e.nat = 1; stats.natural++; stats.moved.push(Math.hypot(P[0][0] - P0[0][0], P[0][1] - P0[0][1])); } else stats.kept++;
  if (R.R) { const pr = packRamp(rx, rz, R.R); e.r = pr.r; e.rb = pr.rb; }
  if (R.steps.length) { e.k = R.steps.flatMap(([x, z, a]) => [Math.round((x - rx) * 10), Math.round((z - rz) * 10), Math.round(a * 100)]); stats.steps += R.steps.length; stats.stepSites++; }
  stepRanges.set(k, R.stepS);
  stats.cut.push(R.R ? R.cut : 0); stats.len.push(wayLen(P));
  if (onlyKey) console.log(JSON.stringify({ key: k, how, len: wayLen(P), cut: R.cut, steps: R.steps.length, stepS: R.stepS, pts: P.length }));
}
const q = (a, f) => { const s = [...a].sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(f * s.length))].toFixed(2) : null; };
console.log(JSON.stringify({ sites: stats.sites, keptGentle: stats.kept, naturalWay: stats.natural, fallback: stats.fallback.length, landingMoved: { p50: q(stats.moved, 0.5), p90: q(stats.moved, 0.9), max: q(stats.moved, 1) }, cut: { p50: q(stats.cut, 0.5), p90: q(stats.cut, 0.9), max: q(stats.cut, 1) }, walk: { p10: q(stats.len, 0.1), p50: q(stats.len, 0.5), p90: q(stats.len, 0.9), max: q(stats.len, 1) }, steps: stats.steps, stepSites: stats.stepSites, fallbackSites: stats.fallback }, null, 1));

// The outfitters (--outfitters: the in-game sweep's JSON, each store's dockLand and door as props.js laid them; the store
// is sited on the ground as it stood, props.js withoutRamps, so it stands where it stood): the least-cost walk on the drawn
// ground from the door to the dock's land end, winding if it has to, shaped as lightly (no steps: the yard is walked graded)
const outFile = arg('--outfitters', null), outRows = [];
if (outFile) {
  T.outfitters = {};
  for (const o of JSON.parse(fs.readFileSync(path.resolve(outFile), 'utf8'))) {
    if (!o || o.none || !o.dockLand) continue;
    const Zx = Math.cos(o.dockHeading), Zz = -Math.sin(o.dockHeading);
    let [ax, az] = o.dockLand;
    for (let k = 0; k < 80 && world.shoreAt(ax, az) > 0; k++) { ax += Zx * 0.25; az += Zz * 0.25; }
    const lv = world.levelAt(ax + Zx * 4, az + Zz * 4, 3);
    if (!(lv === lv)) continue;
    const straight = [[ax, az], o.dockLand, [o.door[0], o.door[1]]];
    if (Math.hypot(ax - o.dockLand[0], az - o.dockLand[1]) < 0.3) straight.splice(1, 1);
    const before = wayGrade(straight);
    let P = straight;
    if (before > 22) {
      const W = walkFrom(o.door[0], o.door[1], { reach: Math.hypot(o.door[0] - o.dockLand[0], o.door[1] - o.dockLand[1]) + 25, goal: o.dockLand });
      if (W) P = [[ax, az], ...[...simplifyWalk(W.pts)].reverse()];
    }
    const R = shapeWay(P, lv, { steps: false });
    // (rock steps up the bank at the dock's foot where it stays steep: props.js outfitterSteps)
    const st = withRamp(R.R, () => { const S = samples(P); return stepsOn(S, S.map((q) => H(q.x, q.z)), { tall: 4.5, most: Math.tan((65 * Math.PI) / 180) }); }); // (an outfitter's: a stone stair up a bank as tall as the yard's)
    outRows.push({ ep: o.ep, before: +before.toFixed(1), pts: P, stepS: st.stepS, steps: st.steps.length, ramp: !!R.R, cut: +R.cut.toFixed(2), len: +wayLen(P).toFixed(1), wound: P !== straight });
    const ox = Math.round(ax * 10) / 10, oz = Math.round(az * 10) / 10, rec = { x: ox, z: oz };
    if (R.R) { const pr = packRamp(ox, oz, R.R); rec.rb = pr.rb; rec.r = pr.r; }
    if (st.steps.length) rec.k = st.steps.flatMap(([x, z, a]) => [Math.round((x - ox) * 10), Math.round((z - oz) * 10), Math.round(a * 100)]);
    if (rec.r || rec.k) T.outfitters[o.ep] = rec;
  }
  console.log('outfitters', Object.keys(T.outfitters).length, 'ramps of', outRows.length, 'wound', outRows.filter((r) => r.wound).length);
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
    if (!o.r) continue;
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
    rows.push({ key: k, before: +before.get(k).toFixed(1), after: +wayGrade(P).toFixed(1), off: +wayGradeOff(P, stepRanges.get(k) || []).toFixed(1), len: +wayLen(P).toFixed(1), nat: !!e.nat, fb: !!e.fb, steps: e.k ? e.k.length / 3 : 0, ramp: !!e.r, lidar: lidar(P[0][0], P[0][1]) });
    if (onlyKey) console.log(samples(P).map((q) => `${q.s.toFixed(1)}:${world.shoreAt(q.x, q.z).toFixed(1)}:${H(q.x, q.z).toFixed(2)}:${ramps.rampAt(q.x, q.z, -999).toFixed(2)}`).join(' '));
  }
  const count = (f, t) => rows.filter((r) => r[f] > t).length;
  const sum = { sites: rows.length, before: { over25: count('before', 25), over35: count('before', 35), over45: count('before', 45), p50: q(rows.map((r) => r.before), 0.5), max: q(rows.map((r) => r.before), 1) }, after: { over25: count('after', 25), over35: count('after', 35), over45: count('after', 45), p50: q(rows.map((r) => r.after), 0.5), max: q(rows.map((r) => r.after), 1) }, afterOffSteps: { over25: count('off', 25), over35: count('off', 35), over45: count('off', 45) }, walk: { p10: q(rows.map((r) => r.len), 0.1), p50: q(rows.map((r) => r.len), 0.5), p90: q(rows.map((r) => r.len), 0.9), max: q(rows.map((r) => r.len), 1) } };
  for (const o of outRows) if (o.pts) { o.after = +wayGrade(o.pts).toFixed(1); o.off = +wayGradeOff(o.pts, o.stepS || []).toFixed(1); delete o.pts; delete o.stepS; }
  if (outRows.length) sum.outfitters = { stores: outRows.length, ramps: outRows.filter((o) => o.ramp).length, wound: outRows.filter((o) => o.wound).length, cut: { p50: q(outRows.map((o) => o.cut), 0.5), p90: q(outRows.map((o) => o.cut), 0.9), max: q(outRows.map((o) => o.cut), 1) }, before: { over25: outRows.filter((o) => o.before > 25).length, over35: outRows.filter((o) => o.before > 35).length, over45: outRows.filter((o) => o.before > 45).length }, after: { over25: outRows.filter((o) => o.after > 25).length, over35: outRows.filter((o) => o.after > 35).length, over45: outRows.filter((o) => o.after > 45).length }, afterOffSteps: { over25: outRows.filter((o) => o.off > 25).length, over35: outRows.filter((o) => o.off > 35).length, over45: outRows.filter((o) => o.off > 45).length }, steps: outRows.reduce((a, o) => a + o.steps, 0) };
  console.log(JSON.stringify(sum, null, 1));
  fs.writeFileSync(path.resolve(sweepOut), JSON.stringify({ summary: sum, rows: rows.sort((a, b) => b.before - a.before), outfitters: outRows.sort((a, b) => b.before - a.before) }));
  console.log('sweep', sweepOut, ((Date.now() - t0) / 1000).toFixed(0), 's');
}
if (!checkOnly && !onlyKey) {
  fs.writeFileSync(tableFile, JSON.stringify(T));
  console.log('wrote', tableFile, (fs.statSync(tableFile).size / 1024).toFixed(0), 'KB');
}
await vite.close();

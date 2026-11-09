#!/usr/bin/env node
// The edge of the Boundary Waters (docs/build/edge-and-roads.md, streams E1 + E2, with the owner's decisions of
// 2026-11-08: no turn-back and no wall anywhere; a clear notice that stays up while you are out of the wilderness; Quetico
// open, with its own notice without a Quetico permit; the map past the edge only slightly faded, with the roads and the
// town names on it). Writes two small tables in src/:
//
//   src/edge.bin       where you are: a 50 m grid of zones over the baked box, and the outlines the map draws
//   src/map-roads.bin  the roads and towns the map letters (OpenStreetMap), gzipped JSON in whole metres
//
//   node scripts/edge.mjs [--data ~/bwca-data-v9] [--cache data-cache/edge] [--cell 50]
//
// The zones (src/edge.js reads them):
//   0 out       past the band: "You have left the Boundary Waters" (private land, cabins and motorboats, the roads to town)
//   1 wild      inside the BWCAW (src/boundary.bin, the Forest Service's line)
//   2 doorstep  no notice: 400 m round the BWCAW (the owner's band), 1.5 km round every entry point's put-in, lot, head
//               and outfitter's yard, each entry point's way in by water (round 4: a cheapest path over the water and
//               the portages only, never across other dry land nor Quetico, from its put-in or dock to the band, 250 m
//               wide, and the water within 700 m of it), the road from each lot 1.5 km toward town and the walk from a
//               lot to its road, the roads between lots that sit close (the owner: "lots joined by the road corridor"),
//               and every road of src/roads.json (the made two-tracks, a lot's road out to the map's edge)
//   3 quetico   Quetico Provincial Park (and 400 m round it on the Canadian side), more than 60 m past the BWCAW's
//               own line (the border lakes' slop). (The owner's later call: Quetico is out of bounds for now, as any
//               land past the band; src/edge.js decides what the zone shows)
// A margin of 200 m inside the box's own edges is out unless it is a doorstep (Bog Lake's store and lot, Little Isabella
// and Snake River's lots stand 170 m in, by the south edge near Isabella, their roads out to it); past the box
// everything is out. Run it again whenever a lot, a store or a road moves (after scripts/roads.mjs).
//
// edge.bin (little-endian, gzipped as a whole): u32 'EDG1', u16 version 1, u16 cell (m), i32 originX, i32 originZ, u16
// W, u16 H, varint runs, then per run a u8 zone and a varint length (row-major from the north-west corner); u16 rings,
// then per ring a u8 kind (0 the outline of zones 1-3 against 0, 1 Quetico's own outline), a varint point count and the
// points as zigzag varints in whole metres (the first absolute, the rest steps): boundary.bin's own encoding.
//
// Sources: src/boundary.bin (USFS EDW), data-cache/edge (scripts/edge-osm.mjs: OSM roads, towns, Quetico relation
// 14520069; © OpenStreetMap contributors, ODbL), the release's index.json and tiles (the water), src/ep-fixes.json and
// src/outfitter-places.json (the entry points and yards as the game builds them).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { loadData } from './ep-lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const dataDir = arg('--data', path.join(os.homedir(), 'bwca-data-v9')).replace(/\/?$/, '/');
const cacheDir = arg('--cache', 'data-cache/edge');
const CELL = Number(arg('--cell', 50));
const BAND = 400, DISC = 1500, ROAD_REACH = 1500, ROAD_HALF = 60, TRAIL_MAX = 3200, WATER_HALF = 250, SLOP = 60, MARGIN = 200, JOIN = 4000, JOIN_ROAD = 6000;

const index = JSON.parse(fs.readFileSync(dataDir + 'index.json', 'utf8'));
const P = index.proj, g = index.grid;
const toXZ = ([lon, lat]) => [(lon - P.lon0) * P.mPerDegLon, -(lat - P.lat0) * P.mPerDegLat];
const X0 = g.originX, Z0 = g.originZ, SX = g.width * g.cell, SZ = g.height * g.cell;
const W = Math.ceil(SX / CELL), H = Math.ceil(SZ / CELL), N = W * H;
const ci = (x) => Math.floor((x - X0) / CELL), cj = (z) => Math.floor((z - Z0) / CELL);
const cx = (i) => X0 + (i + 0.5) * CELL, cz = (j) => Z0 + (j + 0.5) * CELL;
console.log(`grid ${W} x ${H} at ${CELL} m`);

// --- rings -----------------------------------------------------------------------------------------------------------
function readRings(file) {
  const b = zlib.gunzipSync(fs.readFileSync(file));
  let o = 8; const n = b.readUInt16LE(6), rings = [];
  const varint = () => { let v = 0, s = 1, c; do { c = b[o++]; v += (c & 127) * s; s *= 128; } while (c & 128); return v; };
  const zz = () => { const v = varint(); return v % 2 ? -(v + 1) / 2 : v / 2; };
  for (let r = 0; r < n; r++) { const kind = b[o++], m = varint(), pts = []; let x = 0, z = 0; for (let k = 0; k < m; k++) { x += zz(); z += zz(); pts.push([x, z]); } rings.push({ kind, pts }); }
  return rings;
}
// even-odd scanline fill of rings (outer and holes together) into a mask
function fill(mask, rings, v = 1) {
  for (let j = 0; j < H; j++) {
    const z = cz(j), xs = [];
    for (const r of rings) {
      const p = r.pts || r;
      for (let a = 0, b = p.length - 1; a < p.length; b = a++) {
        const [xa, za] = p[a], [xb, zb] = p[b];
        if ((za > z) !== (zb > z)) xs.push(xa + ((z - za) / (zb - za)) * (xb - xa));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k] - X0) / CELL - 0.5)), i1 = Math.min(W - 1, Math.floor((xs[k + 1] - X0) / CELL - 0.5));
      for (let i = i0; i <= i1; i++) mask[j * W + i] = v;
    }
  }
}
// Quetico: the relation's ways joined end to end into rings
function queticoRings() {
  const j = JSON.parse(fs.readFileSync(path.join(cacheDir, 'quetico.json'), 'utf8'));
  const rel = j.elements.find((e) => e.type === 'relation');
  const segs = rel.members.filter((m) => m.type === 'way' && m.geometry && (m.role === 'outer' || m.role === 'inner' || !m.role)).map((m) => m.geometry.map((p) => toXZ([p.lon, p.lat])));
  const key = (p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`, rings = [];
  const left = segs.slice();
  while (left.length) {
    let ring = left.shift().slice();
    for (let guard = 0; guard < 10000 && key(ring[0]) !== key(ring[ring.length - 1]); guard++) {
      const end = key(ring[ring.length - 1]);
      const k = left.findIndex((s) => key(s[0]) === end || key(s[s.length - 1]) === end);
      if (k < 0) break;
      const s = left.splice(k, 1)[0];
      ring = ring.concat(key(s[0]) === end ? s.slice(1) : s.slice().reverse().slice(1));
    }
    rings.push(ring);
  }
  return rings;
}

// Douglas-Peucker on a closed ring (as scripts/boundary.mjs)
function simplify(ring, tol) {
  let pts = ring.slice();
  if (pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
  if (pts.length < 4) return pts;
  let far = 0, fd = -1;
  for (let i = 1; i < pts.length; i++) { const d = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2; if (d > fd) { fd = d; far = i; } }
  const dp = (a) => {
    const keep = new Uint8Array(a.length); keep[0] = keep[a.length - 1] = 1;
    const stack = [[0, a.length - 1]];
    while (stack.length) {
      const [i0, i1] = stack.pop(), [x0, z0] = a[i0], [x1, z1] = a[i1], dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz;
      let best = -1, bd = tol * tol;
      for (let i = i0 + 1; i < i1; i++) {
        const [x, z] = a[i];
        const t = L2 ? Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / L2)) : 0, d = (x - x0 - t * dx) ** 2 + (z - z0 - t * dz) ** 2;
        if (d > bd) { bd = d; best = i; }
      }
      if (best > 0) { keep[best] = 1; stack.push([i0, best], [best, i1]); }
    }
    return a.filter((_, i) => keep[i]);
  };
  const A = dp(pts.slice(0, far + 1)), B = dp([...pts.slice(far), pts[0]]);
  return [...A, ...B.slice(1, -1)];
}
function simplifyLine(a, tol) { // an open line
  if (a.length < 3) return a;
  const keep = new Uint8Array(a.length); keep[0] = keep[a.length - 1] = 1;
  const stack = [[0, a.length - 1]];
  while (stack.length) {
    const [i0, i1] = stack.pop(), [x0, z0] = a[i0], [x1, z1] = a[i1], dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz;
    let best = -1, bd = tol * tol;
    for (let i = i0 + 1; i < i1; i++) { const [x, z] = a[i]; const t = L2 ? Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / L2)) : 0, d = (x - x0 - t * dx) ** 2 + (z - z0 - t * dz) ** 2; if (d > bd) { bd = d; best = i; } }
    if (best > 0) { keep[best] = 1; stack.push([i0, best], [best, i1]); }
  }
  return a.filter((_, i) => keep[i]);
}

// exact Euclidean distance (cells) to the nearest set cell (Felzenszwalb & Huttenlocher), squared
function edt(mask) {
  const INF = 1e12, f = new Float64Array(Math.max(W, H)), d = new Float64Array(N), v = new Int32Array(Math.max(W, H)), zz = new Float64Array(Math.max(W, H) + 1);
  const line = (n, get, set) => {
    for (let q = 0; q < n; q++) f[q] = get(q);
    let k = 0; v[0] = 0; zz[0] = -INF; zz[1] = INF;
    for (let q = 1; q < n; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= zz[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; zz[k] = s; zz[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) { while (zz[k + 1] < q) k++; set(q, (q - v[k]) ** 2 + f[v[k]]); }
  };
  for (let j = 0; j < H; j++) line(W, (i) => (mask[j * W + i] ? 0 : INF), (i, val) => { d[j * W + i] = val; });
  for (let i = 0; i < W; i++) line(H, (j) => d[j * W + i], (j, val) => { d[j * W + i] = val; });
  return d;
}

// --- the layers --------------------------------------------------------------------------------------------------------
const bw = new Uint8Array(N); fill(bw, readRings('src/boundary.bin'));
const qRings = queticoRings();
const qt = new Uint8Array(N); fill(qt, qRings);
const dBW = edt(bw), dQ = edt(qt);
const door = new Uint8Array(N);
const stamp = (x, z, r) => {
  const rc = r / CELL, i0 = Math.max(0, Math.floor(ci(x) - rc)), i1 = Math.min(W - 1, Math.ceil(ci(x) + rc)), j0 = Math.max(0, Math.floor(cj(z) - rc)), j1 = Math.min(H - 1, Math.ceil(cj(z) + rc));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if ((cx(i) - x) ** 2 + (cz(j) - z) ** 2 <= r * r) door[j * W + i] = 1;
};
const stampLine = (pts, r) => { for (let k = 0; k + 1 < pts.length; k++) { const [ax, az] = pts[k], [bx, bz] = pts[k + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / (CELL / 2))); for (let s = 0; s <= n; s++) stamp(ax + ((bx - ax) * s) / n, az + ((bz - az) * s) / n, r); } };

// the water, from the release's own fine tiles: a 50 m cell is water if any 10 m cell in it is
const water = new Uint8Array(N);
{
  const T = g.tile, HALO = g.halo, SIDE = T + 2 * HALO, n = SIDE * SIDE;
  let tiles = 0;
  for (let ty = 0; ty < g.nty; ty++) for (let tx = 0; tx < g.ntx; tx++) {
    let raw; try { raw = zlib.gunzipSync(fs.readFileSync(`${dataDir}tiles/${tx}_${ty}.bin`)); } catch { continue; }
    tiles++;
    const lake = new Uint16Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), n * 2, n);
    for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
      if (!lake[(j + HALO) * SIDE + i + HALO]) continue;
      const x = X0 + (tx * T + i + 0.5) * g.cell, z = Z0 + (ty * T + j + 0.5) * g.cell;
      water[cj(z) * W + ci(x)] = 1;
    }
  }
  let wc = 0; for (let k = 0; k < N; k++) wc += water[k];
  console.log(`water: ${tiles} tiles, ${(wc * CELL * CELL / 1e6).toFixed(0)} km² at ${CELL} m`);
}

// the entry points and the outfitters' yards, as the game builds them
const fixes = JSON.parse(fs.readFileSync('src/ep-fixes.json', 'utf8'));
const placesOf = JSON.parse(fs.readFileSync('src/outfitter-places.json', 'utf8')).places;
const fixOn = fixes.for === (index.source && index.source.baked);
const eps = index.entryPoints.map((e) => {
  const r = fixOn ? fixes.entryPoints.find((q) => q.ep === e.ep) : null, out = { ep: e.ep, name: (r && r.name) || e.name, x: e.x, z: e.z, spots: [] };
  if (r && Number.isFinite(r.x)) { out.x = r.x; out.z = r.z; }
  out.spots.push([out.x, out.z]);
  if (r) {
    for (const p of [r.lot, r.head, r.head && r.head.lot, r.open && r.open.join, r.head && r.head.open && r.head.open.join]) if (p && Number.isFinite(p.x)) out.spots.push([p.x, p.z]);
  }
  const pl = placesOf[String(e.ep)];
  if (pl) { out.store = pl.store; out.dock = pl.dock; out.spots.push(pl.store, pl.dock); }
  out.lot = (r && r.lot) || (r && r.head && r.head.lot) || null;
  if (r && r.head && Number.isFinite(r.head.x)) out.headPut = [r.head.x, r.head.z]; // (round 4: an outfitter's own start's put-in has a way in too)
  return out;
});
for (const e of eps) for (const [x, z] of e.spots) stamp(x, z, DISC);

// the roads: a graph of the drivable ways
const roads = JSON.parse(fs.readFileSync(path.join(cacheDir, 'roads.json'), 'utf8')).ways;
const RANK = { motorway: 0, trunk: 0, primary: 0, secondary: 1, tertiary: 1, unclassified: 2, residential: 3, road: 3, service: 4, track: 4 };
const node = new Map(); // osm id -> { x, z, adj: [[id, m], ...], rank }
for (const w of roads) {
  w.xz = w.pts.map(toXZ);
  for (let k = 0; k < w.nodes.length; k++) {
    const id = w.nodes[k];
    let n = node.get(id); if (!n) { n = { x: w.xz[k][0], z: w.xz[k][1], adj: [], rank: 9 }; node.set(id, n); }
    n.rank = Math.min(n.rank, RANK[w.hw] ?? 5);
    if (k) { const a = node.get(w.nodes[k - 1]), m = Math.hypot(a.x - n.x, a.z - n.z); a.adj.push([id, m]); n.adj.push([w.nodes[k - 1], m]); }
  }
}
const B = 500, bins = new Map();
for (const [id, n] of node) { const k = `${Math.floor(n.x / B)},${Math.floor(n.z / B)}`; if (!bins.has(k)) bins.set(k, []); bins.get(k).push(id); }
function nearestNode(x, z, reach = TRAIL_MAX) {
  let best = null, bd = reach; const r = Math.ceil(reach / B), bi = Math.floor(x / B), bj = Math.floor(z / B);
  for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) for (const id of bins.get(`${bi + di},${bj + dj}`) || []) { const n = node.get(id), d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = id; } }
  return best == null ? null : { id: best, d: bd };
}
// Dijkstra over the roads from a node: stop at maxM, or when stop(n) says so; → { dist, prev, hit }
function roadSearch(from, maxM, stop = null) {
  const dist = new Map([[from, 0]]), prev = new Map(), done = new Set(), heap = [[0, from]];
  const push = (e) => { heap.push(e); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  let hit = null;
  while (heap.length) {
    const [d, id] = pop(); if (done.has(id)) continue; done.add(id);
    if (stop && stop(id, d)) { hit = id; break; }
    for (const [to, m] of node.get(id).adj) { const nd = d + m; if (nd <= maxM && nd < (dist.get(to) ?? Infinity)) { dist.set(to, nd); prev.set(to, id); push([nd, to]); } }
  }
  return { dist, prev, hit, done };
}
const pathTo = (prev, id) => { const out = []; for (let k = id; k != null; k = prev.get(k)) out.push(k); return out.reverse(); };
const mapSpurs = []; // the roads from the lots out to the main road, for the map
for (const e of eps) {
  const at = e.lot ? [e.lot.x, e.lot.z] : e.store || [e.x, e.z];
  const nn = nearestNode(at[0], at[1]); if (!nn) { console.log(`EP ${e.ep}: no road within ${TRAIL_MAX} m`); continue; }
  const n0 = node.get(nn.id);
  stampLine([at, [n0.x, n0.z]], ROAD_HALF); // the walk (or the drive) from the lot to its road
  const s = roadSearch(nn.id, ROAD_REACH);
  for (const id of s.done) for (const [to] of node.get(id).adj) if (s.done.has(to)) { const a = node.get(id), b = node.get(to); stampLine([[a.x, a.z], [b.x, b.z]], ROAD_HALF); }
  const main = roadSearch(nn.id, 40000, (id) => node.get(id).rank <= 1);
  if (main.hit != null) mapSpurs.push(pathTo(main.prev, main.hit).map((id) => [node.get(id).x, node.get(id).z]));
  e.road = { node: nn.id, d: Math.round(nn.d) };
}
// lots that sit close: the road between them
let joins = 0;
for (let a = 0; a < eps.length; a++) for (let b = a + 1; b < eps.length; b++) {
  const A = eps[a], Bq = eps[b];
  if (!A.road || !Bq.road || Math.hypot(A.x - Bq.x, A.z - Bq.z) > JOIN) continue;
  const s = roadSearch(A.road.node, JOIN_ROAD, (id) => id === Bq.road.node);
  if (s.hit == null) continue;
  stampLine(pathTo(s.prev, s.hit).map((id) => [node.get(id).x, node.get(id).z]), ROAD_HALF); joins++;
}
console.log(`roads: ${node.size} nodes; ${joins} lot-to-lot joins`);

// the way in by water (round 4, the adversarial check: South Lake's way crossed 2 km of dry land, so the paddle in left
// the doorstep): the shortest path from a put-in, a dock or an outfitter's head put-in to the wilderness's own water over the release's own
// 10 m water and the portages' lines only (no other dry land, no Quetico: out of bounds as any land past the band; a
// 50 m cell with any water in it joins water a canoe cannot pass), stamped WATER_HALF wide and every water cell within
// WATER_SPREAD of it (a straight paddle across a wide lake stays in). scripts/r4-doorstep-check.mjs holds the zones to
// it apart.
const WATER_SPREAD = 700;
const D10 = loadData(dataDir.replace(/\/$/, '')), GW = g.width, GH = g.height, C10 = g.cell;
const carry10 = new Uint8Array(GW * GH);
{
  const lines = index.portages.map((p) => p && p.pts);
  if (fixOn) for (const q of fixes.portages || []) if (q.pts && q.pts.length > 1) lines[q.i] = q.pts;
  for (const pts of lines) if (pts && pts.length > 1) for (let k = 0; k + 1 < pts.length; k++) {
    const [ax, az] = pts[k], [bx, bz] = pts[k + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 3));
    for (let q = 0; q <= n; q++) { const i = Math.floor((ax + ((bx - ax) * q) / n - X0) / C10), j = Math.floor((az + ((bz - az) * q) / n - Z0) / C10); if (i >= 0 && j >= 0 && i < GW && j < GH) carry10[j * GW + i] = 1; }
  }
}
const inBand = (k) => bw[k] || dBW[k] <= (BAND / CELL) ** 2;
const c10x = (i) => X0 + (i + 0.5) * C10, c10z = (j) => Z0 + (j + 0.5) * C10;
const wet10 = (i, j) => D10.lakeAt(c10x(i), c10z(j)) > 0;
function waterWay(x, z, maxM = 40000) {
  const k50 = (i, j) => cj(c10z(j)) * W + ci(c10x(i));
  const s = Math.floor((z - Z0) / C10) * GW + Math.floor((x - X0) / C10);
  if (s < 0 || s >= GW * GH || bw[k50(s % GW, (s / GW) | 0)]) return null;
  const dist = new Map([[s, 0]]), prev = new Map(), heap = [[0, s]];
  const push = (e) => { heap.push(e); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) {
    const [d, k] = pop(); if (d > (dist.get(k) ?? Infinity)) continue;
    const i = k % GW, j = (k / GW) | 0, K = k50(i, j);
    if (bw[K] && wet10(i, j)) { // (the wilderness's own water: the band's water may not lead on into it) const pts = []; for (let q = k; q != null; q = prev.get(q)) pts.push([c10x(q % GW), c10z((q / GW) | 0)]); return { pts: pts.reverse(), m: d }; }
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue; const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= GW || jj >= GH) continue;
      const q = jj * GW + ii, Q = k50(ii, jj);
      if (!wet10(ii, jj) && !carry10[q]) continue;
      if (qt[Q] && !bw[Q]) continue;
      const nd = d + C10 * (di && dj ? Math.SQRT2 : 1) * (wet10(ii, jj) ? 1 : 2); if (nd > maxM) continue;
      if (nd < (dist.get(q) ?? Infinity)) { dist.set(q, nd); prev.set(q, k); push([nd, q]); }
    }
  }
  return null;
}
const ways = [], wayPts = [];
const spreadC = Math.ceil(WATER_SPREAD / CELL);
for (const e of eps) {
  for (const p of [[e.x, e.z], e.dock, e.headPut].filter(Boolean)) {
    const r = waterWay(p[0], p[1]);
    if (!r) { if (!bw[cj(p[1]) * W + ci(p[0])]) console.log(`!! EP ${e.ep} ${e.name}: no way in by water and carries from ${p.map(Math.round)}`); continue; }
    stampLine(r.pts, WATER_HALF); ways.push(`${e.ep} ${(r.m / 1000).toFixed(1)} km`);
    wayPts.push({ ep: e.ep, pts: r.pts });
    // the water round the way, out to WATER_SPREAD (on the 50 m grid)
    const seen = new Set();
    for (let q = 0; q < r.pts.length; q += 3) {
      const [x, z] = r.pts[q]; if (!D10.lakeAt(x, z)) continue;
      const i0 = ci(x), j0 = cj(z);
      for (let dj = -spreadC; dj <= spreadC; dj++) for (let di = -spreadC; di <= spreadC; di++) {
        if (di * di + dj * dj > spreadC * spreadC) continue;
        const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= W || j >= H) continue;
        const k = j * W + i; if (!water[k] || qt[k] || seen.has(k)) continue;
        seen.add(k); door[k] = 1;
      }
    }
  }
}
console.log(`ways in by water: ${ways.join(', ') || 'none needed'}`);
// the made two-tracks and every road of src/roads.json (round 4: a lot's road out to the map's edge), stamped as roads
{
  let t = null; try { t = JSON.parse(fs.readFileSync('src/roads.json', 'utf8')); } catch { /* none */ }
  if (t && t.for === (index.source && index.source.baked)) {
    for (const r of t.roads) { let x = 0, z = 0; const pts = []; for (let k = 0; k + 3 < r.p.length; k += 4) { x += r.p[k]; z += r.p[k + 1]; pts.push([x / 10, z / 10]); } stampLine(pts, ROAD_HALF); }
    console.log(`roads.json: ${t.roads.length} roads stamped`);
  }
}

// --- the zones --------------------------------------------------------------------------------------------------------
const zone = new Uint8Array(N), m = MARGIN / CELL;
const bandC = (BAND / CELL) ** 2, slopC = (SLOP / CELL) ** 2;
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  const k = j * W + i;
  let z = 0;
  if (bw[k]) z = 1;
  else if (door[k]) z = 2;
  else if ((qt[k] || dQ[k] <= bandC) && dBW[k] > slopC) z = 3;
  else if (dBW[k] <= bandC) z = 2;
  if ((i < m || j < m || i >= W - m || j >= H - m) && !door[k]) z = 0; // (a lot by the box's edge keeps its doorstep)
  zone[k] = z;
}
const area = [0, 0, 0, 0]; for (let k = 0; k < N; k++) area[zone[k]] += CELL * CELL / 1e6;
console.log(`zones km²: out ${area[0].toFixed(0)}, wild ${area[1].toFixed(0)}, doorstep ${area[2].toFixed(0)}, quetico ${area[3].toFixed(0)}; no notice ${(((area[1] + area[2]) / (area.reduce((a, b) => a + b))) * 100).toFixed(1)} %`);
const zoneAt = (x, z) => { const i = ci(x), j = cj(z); return i < 0 || j < 0 || i >= W || j >= H ? 0 : zone[j * W + i]; };
for (const e of eps) for (const [x, z] of e.spots) if (zoneAt(x, z) === 0 || zoneAt(x, z) === 3) console.log(`!! EP ${e.ep} ${e.name}: a spot in zone ${zoneAt(x, z)} at ${x.toFixed(0)},${z.toFixed(0)}`);
// every way in by water through the doorstep (round 4: the rig's own check, edge-test.mjs reads the zones the same way)
for (const w of wayPts) { const outs = w.pts.filter(([x, z]) => zoneAt(x, z) === 0).length; if (outs) console.log(`!! EP ${w.ep}: its way in by water crosses ${outs} out cells`); }
const past = index.campsites.filter((c) => zoneAt(c.x, c.z) === 0).length;
console.log(`campsites past the band: ${past} of ${index.campsites.length}`);

// the outline of zones 1-3 against 0: each cell edge between an in cell and an out one, directed with the in side on
// its left, chained into closed rings, simplified
function outline(isIn) {
  const out = new Map(); // vertex key -> [next vertex keys]
  const add = (a, b) => { const k = a[0] * 100000 + a[1]; if (!out.has(k)) out.set(k, []); out.get(k).push(b); };
  const IN = (i, j) => i >= 0 && j >= 0 && i < W && j < H && isIn(j * W + i);
  for (let j = -1; j < H; j++) for (let i = -1; i < W; i++) {
    const a = IN(i, j), r = IN(i + 1, j), d = IN(i, j + 1);
    // vertical edge between (i, j) and (i+1, j) at x = i+1, z from j to j+1
    if (a !== r) { if (a) add([i + 1, j + 1], [i + 1, j]); else add([i + 1, j], [i + 1, j + 1]); }
    if (a !== d) { if (a) add([i, j + 1], [i + 1, j + 1]); else add([i + 1, j + 1], [i, j + 1]); }
  }
  const rings = [];
  for (const [k0, list] of out) {
    while (list.length) {
      const start = [Math.floor(k0 / 100000), k0 % 100000], ring = [start];
      let cur = list.pop();
      for (let guard = 0; guard < 1e7; guard++) {
        ring.push(cur);
        const k = cur[0] * 100000 + cur[1]; if (k === k0) break;
        const l = out.get(k); if (!l || !l.length) break; cur = l.pop();
      }
      rings.push(ring.map(([i, j]) => [X0 + i * CELL, Z0 + j * CELL]));
    }
  }
  return rings;
}
const ringsOut = [];
for (const r of outline((k) => zone[k] !== 0)) { const s = simplify(r, CELL * 0.75).map(([x, z]) => [Math.round(x), Math.round(z)]); if (s.length >= 3) ringsOut.push({ kind: 0, pts: s }); }
for (const r of qRings) { const s = simplify(r, 30).map(([x, z]) => [Math.round(x), Math.round(z)]); if (s.length >= 3) ringsOut.push({ kind: 1, pts: s }); }

// --- write edge.bin -----------------------------------------------------------------------------------------------------
{
  const bytes = [], u8 = (v) => bytes.push(v & 255);
  const varint = (v) => { do { let b = v % 128; v = Math.floor(v / 128); if (v) b |= 128; u8(b); } while (v); };
  const zig = (v) => varint(v < 0 ? -2 * v - 1 : 2 * v);
  const runs = []; for (let k = 0; k < N;) { let e = k; while (e < N && zone[e] === zone[k]) e++; runs.push([zone[k], e - k]); k = e; }
  varint(runs.length); for (const [v, n] of runs) { u8(v); varint(n); }
  u8(ringsOut.length & 255); u8(ringsOut.length >> 8);
  for (const r of ringsOut) { u8(r.kind); varint(r.pts.length); let px = 0, pz = 0; for (const [x, z] of r.pts) { zig(x - px); zig(z - pz); px = x; pz = z; } }
  const head = Buffer.alloc(20); head.write('EDG1', 0, 'latin1'); head.writeUInt16LE(1, 4); head.writeUInt16LE(CELL, 6); head.writeInt32LE(X0, 8); head.writeInt32LE(Z0, 12); head.writeUInt16LE(W, 16); head.writeUInt16LE(H, 18);
  const out = zlib.gzipSync(Buffer.concat([head, Buffer.from(bytes)]), { level: 9 });
  fs.writeFileSync('src/edge.bin', out);
  console.log(`src/edge.bin: ${runs.length} runs, ${ringsOut.length} rings (${ringsOut.reduce((n, r) => n + r.pts.length, 0)} points), ${out.length} bytes`);
}

// --- map-roads.bin: the roads and the towns, for the map -----------------------------------------------------------------
{
  const inBox = (x, z) => x >= X0 && x <= X0 + SX && z >= Z0 && z <= Z0 + SZ;
  const names = [], nameIx = new Map(), nm = (s) => { if (!s) return -1; if (!nameIx.has(s)) { nameIx.set(s, names.length); names.push(s); } return nameIx.get(s); };
  const lines = [];
  const enc = (cls, name, pts, surface) => {
    const s = simplifyLine(pts, 12).map(([x, z]) => [Math.round(x), Math.round(z)]); if (s.length < 2) return;
    const flat = [cls, nm(name), surface ? 1 : 0]; let px = 0, pz = 0; for (const [x, z] of s) { flat.push(x - px, z - pz); px = x; pz = z; }
    lines.push(flat);
  };
  const PAVED = /asphalt|paved|concrete/;
  let km = 0;
  for (const w of roads) {
    const r = RANK[w.hw] ?? 5; if (r > 1 || !w.xz.some(([x, z]) => inBox(x, z))) continue;
    enc(r, w.ref && w.name ? `${w.name}` : w.name || w.ref || '', w.xz, PAVED.test(w.surface || ''));
    for (let k = 1; k < w.xz.length; k++) km += Math.hypot(w.xz[k][0] - w.xz[k - 1][0], w.xz[k][1] - w.xz[k - 1][1]) / 1000;
  }
  // the spurs to the lots, the minor roads (class 2)
  const spurKey = new Set();
  for (const sp of mapSpurs) { const k = sp.map(([x, z]) => `${x | 0},${z | 0}`).join(); if (spurKey.has(k)) continue; spurKey.add(k); enc(2, '', sp, false); for (let q = 1; q < sp.length; q++) km += Math.hypot(sp[q][0] - sp[q - 1][0], sp[q][1] - sp[q - 1][1]) / 1000; }
  // the spurs' names: the named way most of each spur runs on is lettered from the roads themselves at draw time; the
  // towns from OSM (village and town lettered larger than a hamlet)
  const towns = JSON.parse(fs.readFileSync(path.join(cacheDir, 'places.json'), 'utf8')).map((p) => { const [x, z] = toXZ([p.lon, p.lat]); return [p.name, Math.round(x), Math.round(z), p.place === 'hamlet' ? 0 : 1]; }).filter(([, x, z]) => inBox(x, z));
  // where the main roads leave the box: "to <town> N mi", the town the road heads for beyond the box
  const BEYOND = [['Grand Marais', 47.7504, -90.3343], ['Two Harbors', 47.0227, -91.6707], ['Virginia', 47.5233, -92.5366], ['Cook', 47.8524, -92.6896], ['Orr', 48.0544, -92.8313], ['Atikokan', 48.7570, -91.6216], ['Thunder Bay', 48.3809, -89.2477], ['Silver Bay', 47.2944, -91.2574], ['Finland', 47.4144, -91.2496], ['Grand Portage', 47.9636, -89.6848], ['Hoyt Lakes', 47.5199, -92.1385], ['Babbitt', 47.7085, -91.9446]].map(([n, la, lo]) => { const [x, z] = toXZ([lo, la]); return { n, x, z }; });
  const exits = [];
  for (const w of [...roads].sort((a, b) => (RANK[a.hw] ?? 5) - (RANK[b.hw] ?? 5))) { // (the highways lettered first)
    const r = RANK[w.hw] ?? 5; if (r > 1) continue;
    for (let k = 1; k < w.xz.length; k++) {
      const a = w.xz[k - 1], b = w.xz[k]; if (inBox(...a) === inBox(...b)) continue;
      const [ix, iz] = inBox(...a) ? a : b, [ox, oz] = inBox(...a) ? b : a, hx = ox - ix, hz = oz - iz, hl = Math.hypot(hx, hz) || 1;
      let best = null, bs = Infinity;
      for (const t of BEYOND) { if (inBox(t.x, t.z)) continue; const dx = t.x - ix, dz = t.z - iz, d = Math.hypot(dx, dz), cos = (dx * hx + dz * hz) / (d * hl); if (cos < 0.3 || d > 60000) continue; const sc = d * (2 - cos); if (sc < bs) { bs = sc; best = { t, d }; } }
      if (!best || exits.some((q) => Math.hypot(q[1] - ix, q[2] - iz) < (q[5] === best.t.n ? 20000 : 3000))) continue; // (one label a town in 20 km: the south edge's forest roads all head for Finland)
      exits.push([`to ${best.t.n} ${Math.max(1, Math.round((best.d * 1.15) / 1609.34))} mi`, Math.round(ix), Math.round(iz), +Math.atan2(hz, hx).toFixed(3), nm(w.ref || w.name || ''), best.t.n]);
    }
  }
  const doc = { v: 1, source: '© OpenStreetMap contributors, ODbL', names, lines, towns, exits };
  const out = zlib.gzipSync(Buffer.from(JSON.stringify(doc)), { level: 9 });
  fs.writeFileSync('src/map-roads.bin', out);
  console.log(`src/map-roads.bin: ${lines.length} lines (${km.toFixed(0)} km), ${towns.length} towns, ${exits.length} exits (${exits.map((e) => e[0]).join('; ')}), ${out.length} bytes`);
}

#!/usr/bin/env node
// Round 4 (stream B, the adversarial check of loop-r4: "South Lake has no doorstep way in by water"): every start's way
// in, held to src/edge.bin's zones on the release's own 10 m water, apart from the way scripts/edge.mjs found it.
//
//   node scripts/r4-doorstep-check.mjs [--data ~/bwca-data-v9]     (a host: it reads the release's tiles)
//
// For each entry point's start (its put-in, an outfitter's dock, a lot and the put-in its carry ends at):
//   1. the way in by water: the shortest path in metres over the 10 m water cells and the portages' lines (no other dry
//      land) to the BWCAW's own water; every cell on it inside the box, and none of them "out" (zone 0) or Quetico
//   2. a straight paddle: from the start to the nearest wilderness water cell it can see across its own lake (the line
//      all water), none of its samples out
//   3. the start itself, its lot, its store and its road (src/roads.json's route) never out
// Exit 1 on any out cell. The figures go to stdout as one line a start.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { loadData } from './ep-lib.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const dataDir = arg('--data', path.join(os.homedir(), 'bwca-data-v9'));
const D = loadData(dataDir), I = D.index, g = D.grid;

// the zones (edge.mjs's format, documented there)
let raw = fs.readFileSync('src/edge.bin'); if (raw.readUInt32LE(0) !== 0x31474445) raw = zlib.gunzipSync(raw);
let o = 6; const cell = raw.readUInt16LE(o); o += 2; const ox = raw.readInt32LE(o); o += 4; const oz = raw.readInt32LE(o); o += 4; const W = raw.readUInt16LE(o); o += 2; const H = raw.readUInt16LE(o); o += 2;
const varint = () => { let v = 0, s = 1, c; do { c = raw[o++]; v += (c & 127) * s; s *= 128; } while (c & 128); return v; };
const runs = varint(), Z = new Uint8Array(W * H); for (let r = 0, k = 0; r < runs; r++) { const z = raw[o++], n = varint(); Z.fill(z, k, k + n); k += n; }
const zoneAt = (x, z) => { const i = Math.floor((x - ox) / cell), j = Math.floor((z - oz) / cell); return i < 0 || j < 0 || i >= W || j >= H ? 0 : Z[j * W + i]; };

const fixes = JSON.parse(fs.readFileSync('src/ep-fixes.json', 'utf8'));
const fixOn = fixes.for === (I.source && I.source.baked);
const places = JSON.parse(fs.readFileSync('src/outfitter-places.json', 'utf8')).places;
const roads = JSON.parse(fs.readFileSync('src/roads.json', 'utf8'));
// the portages as the game has them, rasterised to 10 m cells (the carries a way in may cross land on)
const C = g.cell, GW = g.width, GH = g.height;
const carry = new Uint8Array(GW * GH);
{
  const lines = I.portages.map((p) => p && p.pts);
  if (fixOn) for (const q of fixes.portages || []) if (q.pts && q.pts.length > 1) lines[q.i] = q.pts;
  for (const pts of lines) if (pts) for (let k = 0; k + 1 < pts.length; k++) {
    const [ax, az] = pts[k], [bx, bz] = pts[k + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / 3));
    for (let q = 0; q <= n; q++) { const i = Math.floor((ax + ((bx - ax) * q) / n - g.originX) / C), j = Math.floor((az + ((bz - az) * q) / n - g.originZ) / C); if (i >= 0 && j >= 0 && i < GW && j < GH) carry[j * GW + i] = 1; }
  }
}
const cxOf = (i) => g.originX + (i + 0.5) * C, czOf = (j) => g.originZ + (j + 0.5) * C;
const isWater = (i, j) => D.lakeAt(cxOf(i), czOf(j)) > 0;
// 1. the way in: Dijkstra over 10 m cells (water and carries), to a water cell in the wilderness
function wayIn(x, z, maxM = 30000) {
  const s = Math.floor((z - g.originZ) / C) * GW + Math.floor((x - g.originX) / C);
  const dist = new Map([[s, 0]]), prev = new Map(), heap = [[0, s]];
  const push = (e) => { heap.push(e); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) {
    const [d, k] = pop(); if (d > (dist.get(k) ?? Infinity)) continue;
    const i = k % GW, j = (k / GW) | 0;
    if (isWater(i, j) && zoneAt(cxOf(i), czOf(j)) === 1) { const cells = []; for (let q = k; q != null; q = prev.get(q)) cells.push(q); return { cells: cells.reverse(), m: d }; }
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue; const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= GW || jj >= GH) continue;
      const q = jj * GW + ii; if (!isWater(ii, jj) && !carry[q]) continue;
      const nd = d + C * (di && dj ? Math.SQRT2 : 1); if (nd > maxM) continue;
      if (nd < (dist.get(q) ?? Infinity)) { dist.set(q, nd); prev.set(q, k); push([nd, q]); }
    }
  }
  return null;
}
// 2. a straight paddle across the start's own lake to the nearest wilderness water it can see
function straight(x, z) {
  const lake = D.lakeAt(x, z); if (!lake) return null;
  let best = null;
  for (let r = 0; r <= 4000 && !best; r += 20) for (let a = 0; a < 360; a += Math.max(1, 360 / Math.max(8, (2 * Math.PI * r) / 20))) {
    const px = x + r * Math.cos((a * Math.PI) / 180), pz = z + r * Math.sin((a * Math.PI) / 180);
    if (D.lakeAt(px, pz) !== lake || zoneAt(px, pz) !== 1) continue;
    let ok = true, outs = 0; const L = Math.hypot(px - x, pz - z);
    for (let d = 0; d <= L && ok; d += 5) { const qx = x + ((px - x) * d) / L, qz = z + ((pz - z) * d) / L; if (!D.lakeAt(qx, qz)) ok = false; else if (zoneAt(qx, qz) === 0 || zoneAt(qx, qz) === 3) outs++; }
    if (ok) { best = { m: Math.round(L), outs }; break; }
  }
  return best;
}
const rows = [], bad = [];
const routeOf = (key) => { const r = roads.routes.find((q) => q.key === String(key)); if (!r) return null; let x = 0, z = 0; const pts = []; for (let k = 0; k + 1 < r.p.length; k += 2) { x += r.p[k]; z += r.p[k + 1]; pts.push([x / 10, z / 10]); } return { ...r, pts }; };
for (const e0 of I.entryPoints) {
  const r = fixOn ? fixes.entryPoints.find((q) => q.ep === e0.ep) : null;
  const e = { ...e0, ...(r && Number.isFinite(r.x) ? { x: r.x, z: r.z, lake: r.lake } : {}) };
  const starts = [['put-in', e.x, e.z]];
  const pl = places[String(e.ep)];
  if (pl) starts.push(['dock', pl.dock[0], pl.dock[1]]);
  if (r && r.head) starts.push(['head put-in', r.head.x, r.head.z]);
  const spots = [];
  for (const L of [r && r.lot, r && r.head && r.head.lot]) if (L) spots.push(['lot', L.x, L.z]);
  if (pl) spots.push(['store', pl.store[0], pl.store[1]], ['door', pl.door[0], pl.door[1]]);
  const out = [];
  for (const [what, x, z] of spots) { const zn = zoneAt(x, z); if (zn === 0 || zn === 3) out.push(`${what} in zone ${zn}`); if (!D.inBounds(x, z, 150)) out.push(`${what} within 150 m of the map's edge`); }
  for (const key of [String(e.ep), `h${e.ep}`]) { const R = routeOf(key); if (!R) continue; const o2 = R.pts.filter(([x, z]) => zoneAt(x, z) === 0 || zoneAt(x, z) === 3).length; if (o2) out.push(`road ${key}: ${o2} of ${R.pts.length} points out`); }
  const ways = [];
  for (const [what, x, z] of starts) {
    if (zoneAt(x, z) === 1) { ways.push(`${what} in the wilderness`); continue; }
    const w = wayIn(x, z);
    if (!w) { out.push(`${what}: no way in by water and carries`); continue; }
    const o1 = w.cells.filter((k) => { const zn = zoneAt(cxOf(k % GW), czOf((k / GW) | 0)); return zn === 0 || zn === 3; }).length;
    if (o1) out.push(`${what}: its way in (${(w.m / 1000).toFixed(1)} km) crosses ${o1} out cells`);
    const st = straight(x, z);
    if (st && st.outs) out.push(`${what}: a straight paddle of ${st.m} m clips ${st.outs * 5} m of out`);
    ways.push(`${what} ${(w.m / 1000).toFixed(1)} km${st ? `, straight ${st.m} m` : ''}`);
  }
  rows.push(`EP ${String(e.ep).padStart(2)} ${(e.name || '').padEnd(32)} ${ways.join('; ')}${out.length ? '  !! ' + out.join('; ') : ''}`);
  if (out.length) bad.push(e.ep);
}
for (const r of rows) console.log(r);
console.log(bad.length ? `FAIL: ${bad.length} entry points with out cells on their way in: ${bad.join(', ')}` : `PASS: every start's way in, lot, store and road is in the doorstep or the wilderness (${rows.length} entry points)`);
process.exit(bad.length ? 1 : 0);

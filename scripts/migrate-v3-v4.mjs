#!/usr/bin/env node
// Saves made on the data-v3 release, carried to data-v4 (src/migrate.js): v4 numbers its lakes, campsites and portages
// afresh (Quetico's Ontario lakes in among Minnesota's, the official campsites and portages added: Lake One goes from
// lake 78 to 103), so a v3 season's lake ids and site and trail indices would point at the wrong water. This writes
// src/migrate-v3-v4.json, the old number to the new for each, from the two releases' own index.json:
//
//   lakes      by the lake's OpenStreetMap id (both releases carry one on every lake); a v3 lake whose id is gone from
//              v4 (Ontario's water rejoined into bigger polygons) by its cells: the v4 lake under most of the v3 lake's
//              own cells in the two releases' fine tiles (the same grid), when that is at least half of them
//   portages   the v3 world's own list (index + src/world-fixes.json's connected and USFS trails, as world.js appends
//              them): the v4 trail with the same points, else the one whose ends and line are within a few metres
//   campsites  the v3 world's (index + world-fixes.json's official sites): the v4 site at the same place, else the
//              nearest within 100 m
// and for the two things saved by place, not by number: a campsite's "x:z" key (camp.js campKey) and a portage's first
// landing's "x:z" (trip.js logbook), the few whose place moved.
//
// Each map is runs [from, to, n] (from + k → to + k for k < n; anything outside a run is gone in v4), flattened. The
// table names the two bakes; `check` holds a few v4 lakes, sites and trails by place so a v4 rebaked without
// renumbering (a new bake time, the same numbers) is still recognised (migrate.js sameNumbering).
//
//   node scripts/migrate-v3-v4.mjs --v3 <dir with index.json> --v4 <dir with index.json and tiles/>
//     [--v3-tiles <dir or URL of the v3 tiles/>] [--cache data-cache/v3-tiles] [--out src/migrate-v3-v4.json]
// (the v3 tiles are only read for the lakes OpenStreetMap does not match: a few dozen, fetched with curl and cached)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const v3Dir = arg('--v3'), v4Dir = arg('--v4');
if (!v3Dir || !v4Dir) { console.error('usage: node scripts/migrate-v3-v4.mjs --v3 <dir> --v4 <dir> [--v3-tiles <dir|url>] [--out file]'); process.exit(1); }
const v3Tiles = arg('--v3-tiles', 'https://gkrumbach07.github.io/bwca-canoe/data/tiles/').replace(/\/?$/, '/');
const cacheDir = arg('--cache', 'data-cache/v3-tiles');
const outFile = arg('--out', 'src/migrate-v3-v4.json');
const here = path.dirname(new URL(import.meta.url).pathname);

const A = JSON.parse(fs.readFileSync(path.join(v3Dir, 'index.json'), 'utf8'));
const B = JSON.parse(fs.readFileSync(path.join(v4Dir, 'index.json'), 'utf8'));
const fixes = JSON.parse(fs.readFileSync(path.join(here, '../src/world-fixes.json'), 'utf8'));
if (fixes.for !== A.source.baked) throw new Error(`world-fixes.json is for ${fixes.for}, the v3 index is ${A.source.baked}`);
for (const k of ['proj', 'grid']) for (const f of Object.keys(A[k])) if (JSON.stringify(A[k][f]) !== JSON.stringify(B[k][f])) throw new Error(`the two releases' ${k}.${f} differ: positions would not carry over`);

// --- the v3 world as world.js made it (applyFixes: the trails whose lakes are all there, then the sites) -------------
const P3 = [...A.portages, ...fixes.portages.filter((p) => p.pts && p.pts.length >= 2 && p.launch && !p.launch.some((l) => !A.lakes[l.lake - 1]))];
const C3 = [...A.campsites, ...fixes.campsites.filter((c) => Number.isFinite(c.x) && Number.isFinite(c.z))];
const P4 = B.portages, C4 = B.campsites;

// --- lakes ----------------------------------------------------------------------------------------------------------
const lakeMap = new Int32Array(A.lakes.length + 1); // v3 id → v4 id (0: gone)
const byOsm = new Map();
for (const l of B.lakes) if (l && l.osm) byOsm.set(l.osm, l.id);
const lost = [];
for (const l of A.lakes) { if (!l) continue; const id = l.osm ? byOsm.get(l.osm) : 0; if (id) lakeMap[l.id] = id; else lost.push(l); }
console.log(`lakes: ${A.lakes.filter(Boolean).length - lost.length} by OpenStreetMap id, ${lost.length} by their cells`);

const g = A.grid, SIDE = g.tile + 2 * g.halo, N = SIDE * SIDE;
const gunzip = (b) => (b[0] === 0x1f && b[1] === 0x8b ? zlib.gunzipSync(b) : b);
const lakePlane = (raw) => { const b = gunzip(raw); return new Uint16Array(b.buffer.slice(b.byteOffset + N * 2, b.byteOffset + N * 4)); };
const tileCache = new Map();
function v3Tile(tx, ty) {
  const k = `3:${tx}_${ty}`;
  if (tileCache.has(k)) return tileCache.get(k);
  let t = null;
  try {
    let file = /^https?:/.test(v3Tiles) ? path.join(cacheDir, `${tx}_${ty}.bin`) : path.join(v3Tiles, `${tx}_${ty}.bin`);
    if (/^https?:/.test(v3Tiles) && !fs.existsSync(file)) {
      fs.mkdirSync(cacheDir, { recursive: true });
      execFileSync('curl', ['-sSf', '-o', file, `${v3Tiles}${tx}_${ty}.bin`]);
    }
    t = lakePlane(fs.readFileSync(file));
  } catch { t = null; }
  tileCache.set(k, t);
  return t;
}
function v4Tile(tx, ty) {
  const k = `4:${tx}_${ty}`;
  if (tileCache.has(k)) return tileCache.get(k);
  let t = null;
  try { t = lakePlane(fs.readFileSync(path.join(v4Dir, 'tiles', `${tx}_${ty}.bin`))); } catch { t = null; }
  tileCache.set(k, t);
  return t;
}
const geo = [];
for (const l of lost) {
  // the v3 lake's own cells in the tiles round its middle (each tile's inner part only: the halo repeats a neighbour's)
  const ci = Math.floor((l.cx - g.originX) / g.cell), cj = Math.floor((l.cz - g.originZ) / g.cell);
  const tx0 = Math.floor(ci / g.tile), ty0 = Math.floor(cj / g.tile), votes = new Map();
  let cells = 0;
  for (let ty = ty0 - 1; ty <= ty0 + 1; ty++) for (let tx = tx0 - 1; tx <= tx0 + 1; tx++) {
    if (tx < 0 || ty < 0 || tx >= g.ntx || ty >= g.nty) continue;
    const a = v3Tile(tx, ty); if (!a) continue;
    const b = v4Tile(tx, ty);
    for (let j = g.halo; j < g.halo + g.tile; j++) for (let i = g.halo; i < g.halo + g.tile; i++) {
      const k = j * SIDE + i;
      if (a[k] !== l.id) continue;
      cells++;
      const to = b ? b[k] : 0;
      if (to) votes.set(to, (votes.get(to) || 0) + 1);
    }
  }
  let best = 0, bn = 0;
  for (const [id, n] of votes) if (n > bn) { best = id; bn = n; }
  const ok = best && bn >= 0.5 * cells;
  if (ok) lakeMap[l.id] = best;
  geo.push({ id: l.id, name: l.name, cells, to: ok ? best : 0, toName: best ? B.lakes[best - 1].name : null, share: cells ? +(bn / cells).toFixed(2) : 0 });
}
for (const r of geo) console.log(`  v3 ${r.id} ${r.name || '(unnamed)'} (${r.cells} cells) → ${r.to ? `v4 ${r.to} ${r.toName || '(unnamed)'}` : 'gone'} (${Math.round(r.share * 100)}% under it)`);

// --- portages -------------------------------------------------------------------------------------------------------
const portMap = new Int32Array(P3.length).fill(-1);
{
  const used = new Set(), byPts = new Map();
  P4.forEach((p, j) => { const k = JSON.stringify(p.pts); if (!byPts.has(k)) byPts.set(k, []); byPts.get(k).push(j); });
  P3.forEach((p, i) => { const j = (byPts.get(JSON.stringify(p.pts)) || []).find((q) => !used.has(q)); if (j != null) { portMap[i] = j; used.add(j); } });
  const d = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
  const meanTo = (S, T) => { let s = 0; for (const [x, z] of S) { let m = Infinity; for (const [u, v] of T) m = Math.min(m, Math.hypot(x - u, z - v)); s += m; } return s / S.length; };
  let near = 0;
  P3.forEach((p, i) => {
    if (portMap[i] >= 0) return;
    let best = null;
    P4.forEach((q, j) => {
      if (used.has(j)) return;
      const ends = Math.min(d(p.launch[0], q.launch[0]) + d(p.launch[1], q.launch[1]), d(p.launch[0], q.launch[1]) + d(p.launch[1], q.launch[0]));
      if (ends > 80) return;
      const line = Math.max(meanTo(p.pts, q.pts), meanTo(q.pts, p.pts));
      if (line < 10 && (!best || ends + line < best.e)) best = { j, e: ends + line };
    });
    if (best) { portMap[i] = best.j; used.add(best.j); near++; }
    console.log(`  portage ${i} ${p.name}: ${best ? `→ ${best.j} ${P4[best.j].name}` : 'gone'}`);
  });
  console.log(`portages: ${P3.length} in the v3 world, ${[...portMap].filter((j) => j >= 0).length - near} the same line, ${near} near, ${[...portMap].filter((j) => j < 0).length} gone`);
}

// --- campsites ------------------------------------------------------------------------------------------------------
const key = (c) => `${Math.round(c.x)}:${Math.round(c.z)}`;
const campMap = new Int32Array(C3.length).fill(-1);
{
  const used = new Set(), at = new Map();
  C4.forEach((c, j) => { const k = key(c); if (!at.has(k)) at.set(k, []); at.get(k).push(j); });
  C3.forEach((c, i) => { const j = (at.get(key(c)) || []).find((q) => !used.has(q)); if (j != null) { campMap[i] = j; used.add(j); } });
  C3.forEach((c, i) => {
    if (campMap[i] >= 0) return;
    let best = -1, bd = 100;
    C4.forEach((q, j) => { const e = Math.hypot(q.x - c.x, q.z - c.z); if (!used.has(j) && e < bd) { bd = e; best = j; } });
    if (best >= 0) { campMap[i] = best; used.add(best); }
    console.log(`  campsite ${i} ${c.name || ''} ${key(c)}: ${best >= 0 ? `→ ${best} ${key(C4[best])} (${bd.toFixed(1)} m)` : 'gone'}`);
  });
  console.log(`campsites: ${C3.length} in the v3 world, ${[...campMap].filter((j) => j >= 0).length} found in v4`);
}

// --- the keys saved by place ----------------------------------------------------------------------------------------
const campKeys = {}, portKeys = {};
C3.forEach((c, i) => { const j = campMap[i]; if (j >= 0 && key(c) !== key(C4[j])) campKeys[key(c)] = key(C4[j]); });
P3.forEach((p, i) => { const j = portMap[i], a = p.launch && p.launch[0], b = j >= 0 ? P4[j].launch && P4[j].launch[0] : null; if (a && b && key(a) !== key(b)) portKeys[key(a)] = key(b); });

// --- runs: [from, to, n]; a v3 slot with nothing in it (a lake id never used) may sit inside a run -------------------
function runs(map, base, present) {
  const out = [];
  let cur = null;
  for (let i = base; i < map.length; i++) {
    if (!present(i)) continue;
    const to = map[i];
    if (to < (base === 1 ? 1 : 0)) { cur = null; continue; }
    if (cur && i - cur.from === to - cur.to) { cur.n = i - cur.from + 1; continue; }
    cur = { from: i, to, n: 1 };
    out.push(cur);
  }
  return out.flatMap((r) => [r.from, r.to, r.n]);
}
const lakeRuns = runs(lakeMap, 1, (i) => !!A.lakes[i - 1]);
const portRuns = runs(portMap, 0, () => true);
const campRuns = runs(campMap, 0, () => true);

// a few of the v4 records by place: the same numbers in another bake of v4 (migrate.js sameNumbering)
const pick = (arr, n) => Array.from({ length: n }, (_, k) => Math.floor(((k + 0.5) * arr.length) / n));
const check = {
  lakes: B.lakes.length, portages: P4.length, campsites: C4.length,
  lake: pick(B.lakes, 24).map((i) => B.lakes[i]).filter(Boolean).map((l) => [l.id, Math.round(l.cx), Math.round(l.cz)]),
  site: pick(C4, 12).map((i) => [i, Math.round(C4[i].x), Math.round(C4[i].z)]),
  trail: pick(P4, 12).map((i) => [i, Math.round(P4[i].pts[0][0]), Math.round(P4[i].pts[0][1])]),
};

const out = {
  about: 'v3 lake ids, portage and campsite indices to v4 (scripts/migrate-v3-v4.mjs; read by src/migrate.js). Runs [from, to, n]; outside a run: gone.',
  from: { version: A.version, baked: A.source.baked }, to: { version: B.version, baked: B.source.baked },
  lakes: lakeRuns, portages: portRuns, campsites: campRuns, campKeys, portKeys, check,
};
fs.writeFileSync(outFile, JSON.stringify(out) + '\n');
const size = fs.statSync(outFile).size, gz = zlib.gzipSync(fs.readFileSync(outFile)).length;
console.log(`wrote ${outFile}: ${(size / 1024).toFixed(1)} KB (${(gz / 1024).toFixed(1)} KB gzipped); runs: ${lakeRuns.length / 3} lakes, ${portRuns.length / 3} portages, ${campRuns.length / 3} campsites; ${Object.keys(campKeys).length} site keys and ${Object.keys(portKeys).length} landing keys moved`);

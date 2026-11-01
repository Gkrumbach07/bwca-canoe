#!/usr/bin/env node
// A season carried from one map release to another (src/migrate.js): a release that renumbers its lakes, campsites or
// portages would leave a season's lake ids and site and trail indices pointing at the wrong water. This writes one
// table, the old number to the new for each, from the two releases' own index.json (docs/migration.md):
//
//   lakes      by the lake's OpenStreetMap id (every release carries one on every lake); a lake whose id is gone from the
//              new release (water rejoined into a bigger polygon, a pond turned wetland) by its cells: the new lake under
//              most of the old lake's own cells in the two releases' fine tiles (one grid), when that is at least half
//              of them. Only the tiles round those lakes are read (a few dozen to a few hundred), from a folder or a
//              URL (fetched read-only with curl and cached).
//   portages   the old world's own list (index, plus src/world-fixes.json's trails when the release is the one those
//              fixes are for, as world.js appends them): the new trail with the same points, else the one whose ends and
//              line are within a few metres
//   campsites  likewise (index + world-fixes.json's sites for that release): the new site at the same place, else the
//              nearest within 100 m
// and for the two things saved by place, not by number: a campsite's "x:z" key (camp.js campKey) and a portage's first
// landing's "x:z" (trip.js logbook), the few whose place moved.
//
// Each map is runs [from, to, n] (from + k → to + k for k < n; anything outside a run is gone), flattened. The table
// names the two bakes; `check` holds a few of the new release's lakes, sites and trails by place so a rebake of it that
// keeps its numbers (a new bake time) is still recognised (migrate.js sameNumbering).
//
//   node scripts/migrate-table.mjs --from <dir|index.json> --to <dir|index.json>
//     [--from-tiles <dir|URL of tiles/>] [--to-tiles <dir|URL>] [--cache <dir>] [--out src/migrate/<from-baked>.json]
// (tiles default to <dir>/tiles beside the index; a URL's tiles are cached under --cache, default data-cache/tiles)
// Then add the table to TABLES in src/migrate.js and run scripts/migrate-check.mjs.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const here = path.dirname(new URL(import.meta.url).pathname);
const indexPath = (p) => (p && fs.existsSync(p) && fs.statSync(p).isDirectory() ? path.join(p, 'index.json') : p);
const fromIdx = indexPath(arg('--from')), toIdx = indexPath(arg('--to'));
if (!fromIdx || !toIdx) { console.error('usage: node scripts/migrate-table.mjs --from <dir|index.json> --to <dir|index.json> [--from-tiles <dir|url>] [--to-tiles <dir|url>] [--cache dir] [--out file]'); process.exit(1); }
const A = JSON.parse(fs.readFileSync(fromIdx, 'utf8'));
const B = JSON.parse(fs.readFileSync(toIdx, 'utf8'));
const tilesOf = (flag, idx) => { const t = arg(flag) || path.join(path.dirname(idx), 'tiles'); return /^https?:/.test(t) ? t.replace(/\/?$/, '/') : t; };
const fromTiles = tilesOf('--from-tiles', fromIdx), toTiles = tilesOf('--to-tiles', toIdx);
const cacheRoot = arg('--cache', 'data-cache/tiles');
export const fileFor = (baked) => `${String(baked).replace(/[:.]/g, '-')}.json`;
const outFile = arg('--out', path.join(here, '../src/migrate', fileFor(A.source.baked)));
const fixes = JSON.parse(fs.readFileSync(path.join(here, '../src/world-fixes.json'), 'utf8'));
for (const k of ['proj', 'grid']) for (const f of ['lat0', 'lon0', 'mPerDegLat', 'mPerDegLon', 'width', 'height', 'cell', 'originX', 'originZ', 'tile', 'halo', 'ntx', 'nty']) {
  if (A[k][f] !== undefined && JSON.stringify(A[k][f]) !== JSON.stringify(B[k][f])) throw new Error(`the two releases' ${k}.${f} differ: positions would not carry over`);
}
console.log(`from ${A.version} ${A.source.baked} (${fromIdx}) to ${B.version} ${B.source.baked} (${toIdx})`);

// --- each world as world.js makes it (applyFixes, for the release the fixes are for: the trails whose lakes are all
// there, then the sites) ------------------------------------------------------------------------------------------------
const world = (I) => {
  const f = fixes.for === I.source.baked ? fixes : null;
  return {
    P: [...I.portages, ...(f ? f.portages.filter((p) => p.pts && p.pts.length >= 2 && p.launch && !p.launch.some((l) => !I.lakes[l.lake - 1])) : [])],
    C: [...I.campsites, ...(f ? f.campsites.filter((c) => Number.isFinite(c.x) && Number.isFinite(c.z)) : [])],
    fixed: !!f,
  };
};
const { P: P3, C: C3, fixed: fixedA } = world(A), { P: P4, C: C4 } = world(B);
if (fixedA) console.log(`the old world with src/world-fixes.json (its release): ${P3.length - A.portages.length} trails and ${C3.length - A.campsites.length} sites appended`);

// --- lakes ----------------------------------------------------------------------------------------------------------
const lakeMap = new Int32Array(A.lakes.length + 1); // old id → new id (0: gone)
const byOsm = new Map();
for (const l of B.lakes) if (l && l.osm) byOsm.set(l.osm, l.id);
const lost = [];
for (const l of A.lakes) { if (!l) continue; const id = l.osm ? byOsm.get(l.osm) : 0; if (id) lakeMap[l.id] = id; else lost.push(l); }
const nOld = A.lakes.filter(Boolean).length;
console.log(`lakes: ${nOld - lost.length} by OpenStreetMap id, ${lost.length} by their cells`);

const g = A.grid, SIDE = g.tile + 2 * g.halo, N = SIDE * SIDE;
const gunzip = (b) => (b[0] === 0x1f && b[1] === 0x8b ? zlib.gunzipSync(b) : b);
const lakePlane = (raw) => { const b = gunzip(raw); return new Uint16Array(b.buffer.slice(b.byteOffset + N * 2, b.byteOffset + N * 4)); };
let fetched = 0;
function tile(src, tag, tx, ty) {
  let file;
  if (/^https?:/.test(src)) {
    const dir = path.join(cacheRoot, tag);
    file = path.join(dir, `${tx}_${ty}.bin`);
    if (!fs.existsSync(file)) {
      fs.mkdirSync(dir, { recursive: true });
      try { execFileSync('curl', ['-sSf', '--retry', '4', '-o', file, `${src}${tx}_${ty}.bin`]); fetched++; } catch { try { fs.unlinkSync(file); } catch { /* none */ } return null; }
    }
  } else file = path.join(src, `${tx}_${ty}.bin`);
  try { return lakePlane(fs.readFileSync(file)); } catch { return null; }
}
const geo = [];
if (lost.length) {
  // the tiles round each lost lake's middle; each is read once, its inner part only (the halo repeats a neighbour's)
  const want = new Set(), lostId = new Set(lost.map((l) => l.id));
  for (const l of lost) {
    const tx0 = Math.floor((l.cx - g.originX) / g.cell / g.tile), ty0 = Math.floor((l.cz - g.originZ) / g.cell / g.tile);
    for (let ty = ty0 - 1; ty <= ty0 + 1; ty++) for (let tx = tx0 - 1; tx <= tx0 + 1; tx++) if (tx >= 0 && ty >= 0 && tx < g.ntx && ty < g.nty) want.add(`${tx}_${ty}`);
  }
  const tagA = fileFor(A.source.baked).replace(/\.json$/, ''), tagB = fileFor(B.source.baked).replace(/\.json$/, '');
  const cells = new Map(), votes = new Map();
  let missing = 0;
  for (const k of want) {
    const [tx, ty] = k.split('_').map(Number);
    const a = tile(fromTiles, tagA, tx, ty);
    if (!a) { missing++; continue; }
    let b = null, any = false;
    for (let j = g.halo; j < g.halo + g.tile; j++) for (let i = g.halo; i < g.halo + g.tile; i++) {
      const c = j * SIDE + i, id = a[c];
      if (!id || !lostId.has(id)) continue;
      if (!any) { any = true; b = tile(toTiles, tagB, tx, ty); }
      cells.set(id, (cells.get(id) || 0) + 1);
      const to = b ? b[c] : 0;
      if (to) { let v = votes.get(id); if (!v) votes.set(id, (v = new Map())); v.set(to, (v.get(to) || 0) + 1); }
    }
  }
  console.log(`  ${want.size} tiles round them${fetched ? ` (${fetched} fetched)` : ''}${missing ? `, ${missing} not found` : ''}`);
  for (const l of lost) {
    const n = cells.get(l.id) || 0;
    let best = 0, bn = 0;
    for (const [id, c] of votes.get(l.id) || []) if (c > bn) { best = id; bn = c; }
    const ok = best && bn >= 0.5 * n;
    if (ok) lakeMap[l.id] = best;
    geo.push({ id: l.id, name: l.displayName || l.name, cells: n, to: ok ? best : 0, toName: best ? B.lakes[best - 1].displayName || B.lakes[best - 1].name : null, share: n ? +(bn / n).toFixed(2) : 0 });
  }
  const named = geo.filter((r) => r.name);
  for (const r of named) console.log(`  ${r.id} ${r.name} (${r.cells} cells) → ${r.to ? `${r.to} ${r.toName || '(unnamed)'}` : 'gone'} (${Math.round(r.share * 100)}% under it)`);
  console.log(`  by cells: ${geo.filter((r) => r.to).length} found (${named.filter((r) => r.to).length} named), ${geo.filter((r) => !r.to).length} gone (${geo.filter((r) => !r.cells).length} with no cells in the old tiles)`);
}

// --- portages -------------------------------------------------------------------------------------------------------
const portMap = new Int32Array(P3.length).fill(-1);
let portSame = 0, portNear = 0;
{
  const used = new Set(), byPts = new Map();
  P4.forEach((p, j) => { const k = JSON.stringify(p.pts); if (!byPts.has(k)) byPts.set(k, []); byPts.get(k).push(j); });
  P3.forEach((p, i) => { const j = (byPts.get(JSON.stringify(p.pts)) || []).find((q) => !used.has(q)); if (j != null) { portMap[i] = j; used.add(j); portSame++; } });
  const d = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);
  const meanTo = (S, T) => { let s = 0; for (const [x, z] of S) { let m = Infinity; for (const [u, v] of T) m = Math.min(m, Math.hypot(x - u, z - v)); s += m; } return s / S.length; };
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
    if (best) { portMap[i] = best.j; used.add(best.j); portNear++; }
    console.log(`  portage ${i} ${p.name}: ${best ? `→ ${best.j} ${P4[best.j].name}` : 'gone'}`);
  });
  console.log(`portages: ${P3.length} in the old world, ${portSame} the same line, ${portNear} near, ${P3.length - portSame - portNear} gone`);
}

// --- campsites ------------------------------------------------------------------------------------------------------
const key = (c) => `${Math.round(c.x)}:${Math.round(c.z)}`;
const campMap = new Int32Array(C3.length).fill(-1);
let campSame = 0, campNear = 0;
{
  const used = new Set(), at = new Map();
  C4.forEach((c, j) => { const k = key(c); if (!at.has(k)) at.set(k, []); at.get(k).push(j); });
  C3.forEach((c, i) => { const j = (at.get(key(c)) || []).find((q) => !used.has(q)); if (j != null) { campMap[i] = j; used.add(j); campSame++; } });
  C3.forEach((c, i) => {
    if (campMap[i] >= 0) return;
    let best = -1, bd = 100;
    C4.forEach((q, j) => { const e = Math.hypot(q.x - c.x, q.z - c.z); if (!used.has(j) && e < bd) { bd = e; best = j; } });
    if (best >= 0) { campMap[i] = best; used.add(best); campNear++; }
    console.log(`  campsite ${i} ${c.name || ''} ${key(c)}: ${best >= 0 ? `→ ${best} ${key(C4[best])} (${bd.toFixed(1)} m)` : 'gone'}`);
  });
  console.log(`campsites: ${C3.length} in the old world, ${campSame} at the same place, ${campNear} within 100 m, ${C3.length - campSame - campNear} gone`);
}

// --- the keys saved by place ----------------------------------------------------------------------------------------
const campKeys = {}, portKeys = {};
C3.forEach((c, i) => { const j = campMap[i]; if (j >= 0 && key(c) !== key(C4[j])) campKeys[key(c)] = key(C4[j]); });
P3.forEach((p, i) => { const j = portMap[i], a = p.launch && p.launch[0], b = j >= 0 ? P4[j].launch && P4[j].launch[0] : null; if (a && b && key(a) !== key(b)) portKeys[key(a)] = key(b); });

// --- runs: [from, to, n]; an old slot with nothing in it (a lake id never used) may sit inside a run -----------------
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

// a few of the new release's records by place: the same numbers in another bake of it (migrate.js sameNumbering)
const pick = (arr, n) => Array.from({ length: n }, (_, k) => Math.floor(((k + 0.5) * arr.length) / n));
const BL = B.lakes.filter(Boolean);
const check = {
  lakes: BL.length ? BL[BL.length - 1].id : 0, portages: P4.length, campsites: C4.length,
  lake: pick(BL, 24).map((i) => BL[i]).map((l) => [l.id, Math.round(l.cx), Math.round(l.cz)]),
  site: pick(C4, 12).map((i) => [i, Math.round(C4[i].x), Math.round(C4[i].z)]),
  trail: pick(P4, 12).map((i) => [i, Math.round(P4[i].pts[0][0]), Math.round(P4[i].pts[0][1])]),
};

const lakesFound = [...lakeMap].filter((v) => v > 0).length;
const out = {
  about: `lake ids, portage and campsite indices from data ${A.version} (${A.source.baked}) to data ${B.version} (${B.source.baked}) (scripts/migrate-table.mjs; read by src/migrate.js). Runs [from, to, n]; outside a run: gone.`,
  from: { version: A.version, baked: A.source.baked }, to: { version: B.version, baked: B.source.baked },
  counts: { lakes: [lakesFound, nOld], byOsm: nOld - lost.length, byCells: geo.filter((r) => r.to).length, portages: [portSame + portNear, P3.length], campsites: [campSame + campNear, C3.length] },
  lakes: lakeRuns, portages: portRuns, campsites: campRuns, campKeys, portKeys, check,
};
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(out) + '\n');
const size = fs.statSync(outFile).size, gz = zlib.gzipSync(fs.readFileSync(outFile)).length;
console.log(`wrote ${outFile}: ${(size / 1024).toFixed(1)} KB (${(gz / 1024).toFixed(1)} KB gzipped); lakes ${lakesFound} of ${nOld}, portages ${portSame + portNear} of ${P3.length}, campsites ${campSame + campNear} of ${C3.length}; runs: ${lakeRuns.length / 3} lakes, ${portRuns.length / 3} portages, ${campRuns.length / 3} campsites; ${Object.keys(campKeys).length} site keys and ${Object.keys(portKeys).length} landing keys moved`);

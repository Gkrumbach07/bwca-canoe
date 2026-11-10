#!/usr/bin/env node
// Round 5, stream C: every dock in src/cabins.json proved on the game's own water (src/cabins-water.js dockWaterway: the
// release's tiles, its levels and rapids.json's drops), and every cabin's spot checked off the water and the roads.
// Plain node, no Vite (the tiles read raw): the bake's own proof, run again over the table as it stands.
//
//   node scripts/cabins-water-check.mjs [--data <release dir>] [--table src/cabins.json] [--json out.json] [--stores]
// Prints a line a cabin and PASS/FAIL; exits 1 when any dock fails. --stores: the outfitters' store docks too
// (src/outfitter-places.json), reported only (not this table's: they are not held to it here).
import fs from 'node:fs';
import zlib from 'node:zlib';
import { dockWaterway, dropsOf, DOCK_WATER } from '../src/cabins-water.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const dataDir = arg('--data', fs.existsSync('public/data/index.json') ? 'public/data' : '/Users/gkrumbac/Documents/bwca-canoe/public-data-v9').replace(/\/?$/, '/');
const table = JSON.parse(fs.readFileSync(arg('--table', 'src/cabins.json'), 'utf8'));
const index = JSON.parse(fs.readFileSync(dataDir + 'index.json', 'utf8'));
const g = index.grid, T = g.tile, HALO = g.halo, SIDE = T + 2 * HALO, n2 = SIDE * SIDE;
const tiles = new Map();
const tile = (tx, ty) => {
  const k = `${tx}_${ty}`;
  if (!tiles.has(k)) {
    let t = null;
    try { const raw = zlib.gunzipSync(fs.readFileSync(`${dataDir}tiles/${k}.bin`)); const b = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength); t = { h: new Int16Array(b, 0, n2), lake: new Uint16Array(b, n2 * 2, n2), sd: new Int16Array(b, n2 * 4, n2), lvl: new Int16Array(b, n2 * 6, n2) }; } catch { /* none */ }
    tiles.set(k, t);
  }
  return tiles.get(k);
};
const at = (i, j, f, d) => { const tx = Math.floor(i / T), ty = Math.floor(j / T), t = tile(tx, ty); return t ? t[f][(j - ty * T + HALO) * SIDE + (i - tx * T + HALO)] : d; };
const grid = {
  cell: g.cell,
  cellI: (x) => Math.floor((x - g.originX) / g.cell), cellJ: (z) => Math.floor((z - g.originZ) / g.cell),
  cellX: (i) => g.originX + (i + 0.5) * g.cell, cellZ: (j) => g.originZ + (j + 0.5) * g.cell,
  hCell: (i, j) => at(i, j, 'h', 0) * 0.1, sdCell: (i, j) => at(i, j, 'sd', 1000) * 0.1, lakeCell: (i, j) => at(i, j, 'lake', 0), levelCell: (i, j) => at(i, j, 'lvl', 0) * 0.1,
};
const drops = dropsOf(JSON.parse(fs.readFileSync('src/rapids.json', 'utf8')));
const sdAt = (x, z) => grid.sdCell(grid.cellI(x), grid.cellJ(z));
let osm = [];
try { for (const w of JSON.parse(fs.readFileSync(arg('--roads', fs.existsSync('data-cache/edge/roads.json') ? 'data-cache/edge/roads.json' : '/Users/gkrumbac/Documents/bwca-canoe/data-cache/edge/roads.json'), 'utf8')).ways) osm.push(w.pts.map(([lon, lat]) => [(lon - index.proj.lon0) * index.proj.mPerDegLon, -(lat - index.proj.lat0) * index.proj.mPerDegLat])); } catch { osm = null; }
const segDist = (x, z, [ax, az], [bx, bz]) => { const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz, t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L)) : 0; return Math.hypot(ax + dx * t - x, az + dz * t - z); };
const roadDist = (x, z) => { let b = Infinity; for (const p of osm || []) for (let i = 1; i < p.length; i++) { if (Math.abs(p[i][0] - x) > 3000 && Math.abs(p[i - 1][0] - x) > 3000) continue; b = Math.min(b, segDist(x, z, p[i - 1], p[i])); } return b; };

const rows = [];
let fails = 0;
table.cabins.forEach((c, i) => {
  const lake = index.lakes[c.lake - 1], r = { i, lake: c.lake, osm: c.osm, sd: +sdAt(c.x, c.z).toFixed(1), road: osm ? Math.round(roadDist(c.x, c.z)) : null };
  if (c.dock) {
    const D = c.dock, end = c.dock.end || [D.x + D.dx * (4 + D.len), D.z + D.dz * (4 + D.len)];
    const w = dockWaterway(grid, end[0], end[1], lake.level, drops);
    Object.assign(r, { dock: true, ok: w.ok, why: w.why, reached: w.reached, toOpen: w.open ? w.open.steps * g.cell : null });
  } else Object.assign(r, { dock: false, ok: true });
  const dropNear = Math.min(...drops.map(([a, b]) => Math.hypot(a - c.x, b - c.z)));
  r.drop = Math.round(dropNear);
  if (!r.ok) fails++;
  rows.push(r);
  console.log(`${r.ok ? 'PASS' : 'FAIL'} cabin ${i} lake ${c.lake} ${c.osm || 'made'} sd ${r.sd} road ${r.road} m drop ${r.drop} m ${r.dock ? `dock: ${r.why || `open water ${r.toOpen} m out, ${r.reached} cells`}` : 'no dock'}`);
});
if (process.argv.includes('--stores')) {
  const P = JSON.parse(fs.readFileSync('src/outfitter-places.json', 'utf8')).places || {};
  for (const [ep, v] of Object.entries(P)) {
    if (!v.dock) continue;
    const [x, z] = v.dock, i = grid.cellI(x), j = grid.cellJ(z), L = grid.lakeCell(i, j), w = dockWaterway(grid, x, z, grid.levelCell(i, j), drops);
    console.log(`${w.ok ? 'ok  ' : 'NOT '} store dock EP ${ep} ${v.name} on ${(index.lakes[L - 1] && index.lakes[L - 1].name) || `water ${L}`}: ${w.why || `open water ${w.open.steps * g.cell} m out`}`);
  }
}
console.log(`${rows.length - fails}/${rows.length} pass (docks ${rows.filter((r) => r.dock).length}; DOCK_WATER ${JSON.stringify(DOCK_WATER)})`);
if (arg('--json')) fs.writeFileSync(arg('--json'), JSON.stringify(rows, null, 1));
process.exit(fails ? 1 : 0);

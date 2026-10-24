#!/usr/bin/env node
// The runtime correction table for a published data release: runs the bake's landing and portage code
// (world-links.mjs) on that release's own tiles and lake table, and writes src/world-fixes.json, which world.js applies
// to that release only (matched by its bake time). A new bake does all of this itself and needs no table.
//
//   BWCA_CACHE=/path/to/data-cache node scripts/world-fixes.mjs [--data public/data] [--out src/world-fixes.json]
//
// It needs the OSM extract the release was baked from (data-cache/osm/extract-v2-<box>.json, as bake.mjs caches it).
import fs from 'node:fs';
import zlib from 'node:zlib';
import { CFG, log, makeProjection, makeGrid } from './config.mjs';
import { loadOsm } from './osm-extract.mjs';
import { makeWater, placeLandings, linkPortages, chainsFrom } from './world-links.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const dataDir = arg('--data', CFG.outDir).replace(/\/?$/, '/');
const outFile = arg('--out', 'src/world-fixes.json');

const index = JSON.parse(fs.readFileSync(dataDir + 'index.json', 'utf8'));
const proj = makeProjection(index.bbox), grid = makeGrid(index.bbox, proj);
const g = index.grid;
if (grid.width !== g.width || grid.originX !== g.originX || proj.lat0 !== index.proj.lat0) throw new Error('the index grid does not match config.mjs');
// the tiles' cells: (tile + 2 halo)^2 of [height Int16][lake Uint16][sdist Int16 dm][level Int16]
const T = g.tile, HALO = g.halo, SIDE = T + 2 * HALO, n = SIDE * SIDE;
const tiles = new Map();
const tileOf = (tx, ty) => {
  const k = ty * g.ntx + tx;
  let t = tiles.get(k);
  if (t === undefined) {
    try {
      const raw = zlib.gunzipSync(fs.readFileSync(`${dataDir}tiles/${tx}_${ty}.bin`));
      const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
      t = { lake: new Uint16Array(buf, n * 2, n), sd: new Int16Array(buf, n * 4, n) };
    } catch { t = null; }
    if (tiles.size > 600) tiles.clear();
    tiles.set(k, t);
  }
  return t;
};
const cellOf = (i, j) => { const t = tileOf((i / T) | 0, (j / T) | 0); return t ? [t, ((j % T) + HALO) * SIDE + (i % T) + HALO] : null; };
const lakeAt = (i, j) => { const c = cellOf(i, j); return c ? c[0].lake[c[1]] : 0; };
const sdAt = (i, j) => { const c = cellOf(i, j); return c ? c[0].sd[c[1]] / 10 : 3000; };
const lakeRec = (id) => (id > 0 ? index.lakes[id - 1] : null);
const water = makeWater({ grid, lakeAt, sdAt, name: (id) => { const l = lakeRec(id); return l ? l.displayName || null : null; }, basin: (id) => { const l = lakeRec(id); return l ? l.basin : -1; }, big: (id) => { const l = lakeRec(id); return !!l && !l.creek && l.cells >= 50; } });

// --- portages: the release's own kept list must come out unchanged
const [latS, lonW] = proj.toLatLon(grid.originX, grid.originZ + grid.height * grid.cell);
const [latN, lonE] = proj.toLatLon(grid.originX + grid.width * grid.cell, grid.originZ);
const osm = await loadOsm({ south: latS - 0.005, west: lonW - 0.01, north: latN + 0.005, east: lonE + 0.01 });
const { kept, added, report } = linkPortages(chainsFrom(osm.portages, proj), water);
if (kept.length !== index.portages.length) throw new Error(`kept ${kept.length} portages, the release has ${index.portages.length}`);
kept.forEach((p, i) => {
  const q = index.portages[i];
  if (p.name !== q.name || p.pts.length !== q.pts.length || p.launch.some((l, k) => l.x !== q.launch[k].x || l.z !== q.launch[k].z || l.lake !== q.launch[k].lake)) throw new Error(`portage ${i} differs from the release: ${p.name} / ${q.name}`);
});

// --- landings
const list = JSON.parse(fs.readFileSync(new URL('./entrypoints.json', import.meta.url), 'utf8'));
const landings = placeLandings(list, water, proj, { portages: [...kept, ...added], campsites: index.campsites });
const rows = [];
for (const L of landings) {
  const old = index.entryPoints.find((e) => e.ep === L.ep), e = list.find((x) => x.ep === L.ep);
  const [ux, uz] = proj.toLocal(e.lat, e.lon);
  rows.push({ ep: L.ep, name: L.name, was: old ? Math.round(Math.hypot(old.x - ux, old.z - uz)) : null, now: L.off, how: L.how, lake: water.name(L.lake) });
  log(`EP ${L.ep} ${L.name}: ${old ? `${Math.round(Math.hypot(old.x - ux, old.z - uz))} m` : 'missing'} from the put-in before, ${L.off} m now, on ${water.name(L.lake) || 'unnamed water'} (${L.how})`);
}

log(`portages: ${report.candidates} trails in the extract, ${report.kept} kept by the first bake, ${report.dropped} dropped (${JSON.stringify(report.why)})`);
log(`  connected now: ${report.added} (${JSON.stringify(report.done)}); left out: ${report.left.length}`);
for (const l of report.left) log(`    left out: #${l.ci} ${l.names.join('/') || '-'}: ${l.why}`);
const conn = report.connectors.sort((a, b) => b.m - a.m);
log(`  ${report.joined || 0} pairs of halves joined; connectors: ${conn.length}, ${conn.map((c) => `${c.m} m (${c.names.join('/') || '#' + c.ci})`).join(', ')}`);

const out = {
  about: 'fb E (2026-10-24): runtime corrections for the data release baked at `for` (data-v3): the entry point landings at the real put-ins, and the portages the first bake dropped, connected. Made by scripts/world-fixes.mjs; a new bake has them built in.',
  for: index.source.baked,
  entryPoints: landings.filter((l) => !l.missing).map((l) => ({ ep: l.ep, name: l.name, x: l.x, z: l.z, lake: l.lake, lakeName: water.name(l.lake) })),
  portages: added,
  report: { landings: rows, portages: { candidates: report.candidates, kept: report.kept, dropped: report.dropped, why: report.why, connected: report.added, done: report.done, left: report.left.map((l) => `${l.names.join('/') || 'unnamed'}: ${l.why}`), total: report.total } },
};
fs.writeFileSync(outFile, JSON.stringify(out));
log(`wrote ${outFile} (${(fs.statSync(outFile).size / 1024).toFixed(0)} KB): ${out.entryPoints.length} landings, ${added.length} portages`);

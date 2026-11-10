#!/usr/bin/env node
// A few cabins at the edge (round 4, stream C; the owner's "yes" to docs/build/edge-and-roads.md's "a few cabins at the
// edge"): private cabins and their docks on Burntside, White Iron, Vermilion and Gunflint, just past the Boundary Waters'
// line, so the "private land" the edge notice speaks of is something you see. Writes src/cabins.json (src/cabins.js
// builds them into the tile's props mesh).
//
//   osmium tags-filter <minnesota pbf> nwr/building -o bld.osm.pbf && osmium export bld.osm.pbf -f geojsonseq -o bld.geojsonseq
//   osmium tags-filter <minnesota pbf> w/man_made=pier -o pier.osm.pbf && osmium export pier.osm.pbf -f geojsonseq -o pier.geojsonseq
//   node scripts/cabins.mjs --buildings bld.geojsonseq --piers pier.geojsonseq [--data public/data] [--roads data-cache/edge/roads.json]
// (on a test host: it loads src/terrain-build.js through Vite's SSR for the drawn 10 m mesh, as scripts/roads.mjs does)
//
// Real spots: OpenStreetMap's buildings (© OpenStreetMap contributors, ODbL) on the four lakes' shores, kept when
//   - the edge table (src/edge.bin) has them out (zone 0: past the band, not a doorstep),
//   - the baked water (the release's tiles) of that lake is 12–90 m from the building, the building itself dry,
//   - they are 250 m or more from any entry point, outfitter's yard or lot, 150 m from a campsite or a portage,
//     ROAD_CLEAR m from every road OpenStreetMap has (any the game draws now or later: not on a road's corridor),
//   - house-sized (25–260 m² of footprint; sheds, garages and the like left out),
// and of those the ones nearest the wilderness, a few to a lake, 70 m or more apart. Where the map has too few, plausible
// shore spots near a road stand in.
// Round 5 (the owner, 2026-11-10: "You got to make sure all the cabins can be placed", "Some of the cabins, docks aren't
// really in navigable water"): every one is fitted before it is kept (fit): its spot, or the nearest spot round it
// (nudged along and up the shore, to 48 m) turned to its water a few ways, where
//   - the ground under the cabin and its deck, as drawn (terrain-build.js meshHeightAt, what src/cabins.js builds on),
//     falls no more than STEEP m (cabins.js gives up past CABIN.steep), no water within SHORE_CLEAR m of it, the 2 m
//     LiDAR no higher under it than the floor will be once the detail re-seats it,
//   - its dock (most have one) finds the shore on that line as cabins.js does, its end DOCK_DEEP m deep within 18 m,
//     only water between, and from that end the canoe paddles out to open water and on (src/cabins-water.js
//     dockWaterway: no drop, no rapids or falls near, nothing too shallow or narrow); a cabin without a dock is held to
//     the same water off its front.
// A building or spot that fits nowhere is passed over for the next. The dock's end and its way out go in the table
// (dock.end, dock.open: metres paddled to open water) for the rigs.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dockWaterway, dropsOf } from '../src/cabins-water.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const dataDir = arg('--data', fs.existsSync('public/data/index.json') ? 'public/data' : '/Users/gkrumbac/Documents/bwca-canoe/public-data-v9').replace(/\/?$/, '/');
const bFile = arg('--buildings'), pFile = arg('--piers');
const out = arg('--out', 'src/cabins.json');
if (!bFile) { console.error('--buildings <geojsonseq> needed'); process.exit(1); }

// the lakes (the release's ids) and how many cabins each
const LAKES = { 12: { name: 'Burntside Lake', n: 9 }, 26: { name: 'White Iron Lake', n: 7 }, 2: { name: 'Lake Vermilion', n: 7 }, 24: { name: 'Gunflint Lake', n: 7 } };
const SPACING = 70, NEAR_WATER = 90, DRY = 12, EP_CLEAR = 250, SITE_CLEAR = 150;
// round 5: the fit (see the top)
const ROAD_CLEAR = 35, STEEP = 1.9, SHORE_CLEAR = 3, DOCK_DEEP = 0.7, NUDGE = 48;

const index = JSON.parse(fs.readFileSync(dataDir + 'index.json', 'utf8'));
const P = index.proj, g = index.grid;
const toXZ = (lon, lat) => [(lon - P.lon0) * P.mPerDegLon, -(lat - P.lat0) * P.mPerDegLat];

// --- the edge table (src/edge.js decodeEdge) -------------------------------------------------------------------------
const E = (() => {
  let raw = fs.readFileSync('src/edge.bin');
  if (raw.readUInt32LE(0) !== 0x31474445) raw = zlib.gunzipSync(raw);
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const cell = dv.getUint16(6, true), x0 = dv.getInt32(8, true), z0 = dv.getInt32(12, true), W = dv.getUint16(16, true), H = dv.getUint16(18, true);
  let o = 20;
  const varint = () => { let v = 0, m = 1, b; do { b = dv.getUint8(o++); v += (b & 127) * m; m *= 128; } while (b & 128); return v; };
  const N = W * H, zones = new Uint8Array(N), runs = varint();
  for (let r = 0, k = 0; r < runs; r++) { const v = dv.getUint8(o++), n = varint(); zones.fill(v, k, Math.min(N, k + n)); k += n; }
  return { cell, x0, z0, W, H, zones };
})();
const zoneAt = (x, z) => { const i = Math.floor((x - E.x0) / E.cell), j = Math.floor((z - E.z0) / E.cell); return i >= 0 && j >= 0 && i < E.W && j < E.H ? E.zones[j * E.W + i] : 0; };
// how far (m) to the nearest cell that is not out (the band, the doorstep, the wilderness), searched to 6 km
function toWild(x, z) {
  const ci = Math.floor((x - E.x0) / E.cell), cj = Math.floor((z - E.z0) / E.cell), R = 120;
  let best = Infinity;
  for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
    const i = ci + di, j = cj + dj;
    if (i < 0 || j < 0 || i >= E.W || j >= E.H || !E.zones[j * E.W + i]) continue;
    best = Math.min(best, Math.hypot(di, dj) * E.cell);
  }
  return best;
}

// --- the baked water: the lake id per 10 m cell, from the release's tiles (read as needed) -----------------------------
const T = g.tile, HALO = g.halo, SIDE = T + 2 * HALO, n2 = SIDE * SIDE, tileCache = new Map();
function lakeTile(tx, ty) {
  const k = `${tx}_${ty}`;
  if (!tileCache.has(k)) {
    let lake = null;
    try { const raw = zlib.gunzipSync(fs.readFileSync(`${dataDir}tiles/${k}.bin`)); lake = new Uint16Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), n2 * 2, n2); } catch { /* no tile */ }
    tileCache.set(k, lake);
  }
  return tileCache.get(k);
}
function lakeAt(x, z) {
  const I = Math.floor((x - g.originX) / g.cell), J = Math.floor((z - g.originZ) / g.cell);
  const tx = Math.floor(I / T), ty = Math.floor(J / T), L = lakeTile(tx, ty);
  if (!L) return 0;
  return L[(J - ty * T + HALO) * SIDE + (I - tx * T + HALO)];
}
// the nearest cell of lake `id` within r m: { d, x, z } (cell centres, 5 m steps)
function nearestWater(x, z, id, r = NEAR_WATER + 20) {
  let best = null;
  for (let dz = -r; dz <= r; dz += 5) for (let dx = -r; dx <= r; dx += 5) {
    const d = Math.hypot(dx, dz); if (d > r || (best && d >= best.d)) continue;
    if (lakeAt(x + dx, z + dz) === id) best = { d, x: x + dx, z: z + dz };
  }
  return best;
}
// any water at all (another lake, a river) under a footprint
const wetUnder = (x, z, r) => { for (let dz = -r; dz <= r; dz += 4) for (let dx = -r; dx <= r; dx += 4) if (lakeAt(x + dx, z + dz)) return true; return false; };

// --- what a cabin keeps away from -------------------------------------------------------------------------------------
const keepOff = [];
for (const ep of index.entryPoints) keepOff.push([ep.x, ep.z, EP_CLEAR]);
for (const c of index.campsites) keepOff.push([c.x, c.z, SITE_CLEAR]);
for (const p of index.portages) for (const [x, z] of p.pts) keepOff.push([x, z, SITE_CLEAR]);
try { const pl = JSON.parse(fs.readFileSync('src/outfitter-places.json', 'utf8')).places || {}; for (const v of Object.values(pl)) { const a = v.store || v.yard || v; if (Number.isFinite(a.x)) keepOff.push([a.x, a.z, EP_CLEAR]); } } catch { /* none */ }
try { const fx = JSON.parse(fs.readFileSync('src/ep-fixes.json', 'utf8')); for (const v of Object.values(fx.fixes || fx)) for (const k of ['lot', 'start', 'put', 'x']) { const a = k === 'x' ? v : v && v[k]; if (a && Number.isFinite(a.x)) keepOff.push([a.x, a.z, EP_CLEAR]); } } catch { /* none */ }
// the roads: the game's own (src/roads.json, the last stretch into each lot: 30 m off them) and OpenStreetMap's (the
// shore spots made up where the map has no buildings sit within 700 m of one, as the real cabins do)
const roadPts = [], osmRoad = [], osmWays = [];
try {
  const t = JSON.parse(fs.readFileSync('src/roads.json', 'utf8'));
  for (const r of t.roads) { let x = 0, z = 0; for (let i = 0; i + 3 < r.p.length; i += 4) { x += r.p[i]; z += r.p[i + 1]; roadPts.push([x / 10, z / 10]); } }
} catch { /* none */ }
const roadsFile = arg('--roads', 'data-cache/edge/roads.json');
try { for (const w of JSON.parse(fs.readFileSync(roadsFile, 'utf8')).ways) { const pts = w.pts.map(([lon, lat]) => toXZ(lon, lat)); osmRoad.push(...pts); osmWays.push(pts); } } catch { console.warn(`no ${roadsFile}: the made-up spots are not held near a road`); }
const near = (list, x, z, r) => list.some(([a, b]) => (x - a) ** 2 + (z - b) ** 2 < r * r);
// round 5: off every road's line OpenStreetMap has (stream R may draw any of them), ROAD_CLEAR m
const segDist = (x, z, [ax, az], [bx, bz]) => { const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz, t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L)) : 0; return Math.hypot(ax + dx * t - x, az + dz * t - z); };
const wayBox = osmWays.map((p) => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; for (const [x, z] of p) { a = Math.min(a, x); b = Math.min(b, z); c = Math.max(c, x); d = Math.max(d, z); } return [a, b, c, d]; });
function roadDist(x, z, max = 200) {
  let best = Infinity;
  for (let k = 0; k < osmWays.length; k++) {
    const B = wayBox[k]; if (x < B[0] - max || x > B[2] + max || z < B[1] - max || z > B[3] + max) continue;
    const p = osmWays[k]; for (let i = 1; i < p.length; i++) best = Math.min(best, segDist(x, z, p[i - 1], p[i]));
  }
  return best;
}
const clear = (x, z) => keepOff.every(([a, b, r]) => (x - a) ** 2 + (z - b) ** 2 >= r * r) && !near(roadPts, x, z, ROAD_CLEAR) && roadDist(x, z, ROAD_CLEAR) >= ROAD_CLEAR;

// --- the buildings ----------------------------------------------------------------------------------------------------
const HOUSE = new Set(['yes', 'house', 'cabin', 'residential', 'detached', 'hut', 'bungalow', 'cottage']);
function footprint(f) {
  const gm = f.geometry;
  const ring = gm.type === 'Polygon' ? gm.coordinates[0] : gm.type === 'MultiPolygon' ? gm.coordinates[0][0] : null;
  if (!ring || ring.length < 4) return null;
  const pts = ring.slice(0, -1).map(([lon, lat]) => toXZ(lon, lat));
  let A = 0, cx = 0, cz = 0;
  for (let i = 0; i < pts.length; i++) { const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length], c = ax * bz - bx * az; A += c; cx += (ax + bx) * c; cz += (az + bz) * c; }
  A /= 2; if (Math.abs(A) < 1) return null;
  cx /= 6 * A; cz /= 6 * A;
  // the long wall's bearing: the longest edge
  let best = 0, ux = 1, uz = 0;
  for (let i = 0; i < pts.length; i++) { const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length], L = Math.hypot(bx - ax, bz - az); if (L > best) { best = L; ux = (bx - ax) / L; uz = (bz - az) / L; } }
  let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
  for (const [x, z] of pts) { const a = (x - cx) * ux + (z - cz) * uz, b = -(x - cx) * uz + (z - cz) * ux; a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b); }
  return { x: cx + ux * (a0 + a1) / 2 - uz * (b0 + b1) / 2, z: cz + uz * (a0 + a1) / 2 + ux * (b0 + b1) / 2, area: Math.abs(A), len: a1 - a0, wid: b1 - b0, ux, uz };
}
const piers = [];
if (pFile) for (const line of fs.readFileSync(pFile, 'utf8').split('\n')) {
  const s = line.replace(/^\x1e/, '').trim(); if (!s) continue;
  const f = JSON.parse(s), c = f.geometry.coordinates;
  const pts = f.geometry.type === 'LineString' ? c : f.geometry.type === 'Polygon' ? c[0] : null;
  if (pts) piers.push(pts.map(([lon, lat]) => toXZ(lon, lat)));
}


// --- the ground as drawn (round 5): the 10 m mesh through Vite's SSR (scripts/roads.mjs loadGround), the 2 m LiDAR ------
// (src/cabins.js's numbers, kept in step by hand: CABIN.deck/lift/steep, CABIN_DOCK.back/deep/max)
const CAB = { deck: 1.9, lift: 0.3 }, DK = { back: 1.4, deep: 0.45, max: 18 };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { createServer } = await import('vite');
const vite = await createServer({ root, configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
const gridMod = await vite.ssrLoadModule('/src/grid.js'), terrain = await vite.ssrLoadModule('/src/terrain-build.js'), detailBuild = await vite.ssrLoadModule('/src/detail-build.js');
const desc = { cell: g.cell, originX: g.originX, originZ: g.originZ, tile: g.tile, halo: g.halo, fields: index.version >= 4 ? index.fields : undefined };
const levelById = new Float32Array(index.lakes.length + 1);
for (const l of index.lakes) if (l) levelById[l.id] = l.level;
const grids = new Map();
const tileGrid = (tx, ty) => {
  const k = `${tx},${ty}`;
  if (!grids.has(k)) {
    let tg = null;
    try { const raw = zlib.gunzipSync(fs.readFileSync(`${dataDir}tiles/${tx}_${ty}.bin`)); tg = new gridMod.TileGrid(desc, tx, ty, raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength), levelById); } catch { /* no tile */ }
    if (grids.size > 40) grids.clear();
    grids.set(k, tg);
  }
  return grids.get(k);
};
class WorldGrid extends gridMod.GridQueries {
  constructor() { super(); this.cell = g.cell; this.originX = g.originX; this.originZ = g.originZ; }
  at(i, j) { return tileGrid(Math.min(g.ntx - 1, Math.max(0, Math.floor(i / g.tile))), Math.min(g.nty - 1, Math.max(0, Math.floor(j / g.tile)))); }
  hCell(i, j) { const t = this.at(i, j); return t ? t.hCell(i, j) : 0; }
  sdCell(i, j) { const t = this.at(i, j); return t ? t.sdCell(i, j) : 100; }
  lakeCell(i, j) { const t = this.at(i, j); return t ? t.lakeCell(i, j) : 0; }
  levelCell(i, j) { const t = this.at(i, j); return t ? t.levelCell(i, j) : 0; }
  levelOf(id) { return levelById[id]; }
}
const world = new WorldGrid();
let meshCache = new Map();
const mesh = (x, z) => { if (meshCache.size > 400000) meshCache = new Map(); return terrain.meshHeightAt(world, x, z, meshCache); };
let detailIndex = null;
try { detailIndex = JSON.parse(fs.readFileSync(dataDir + 'detail/index.json', 'utf8')); } catch { console.warn('no LiDAR detail: the 10 m mesh only'); }
const raws = new Map();
function lidar(x, z) { // the 2 m LiDAR's height, else NaN (scripts/roads.mjs)
  if (!detailIndex) return NaN;
  const L = detailIndex.levels['2'], gox = g.originX + g.cell / 2, goz = g.originZ + g.cell / 2;
  const gx = Math.floor((x - gox) / L.size), gy = Math.floor((z - goz) / L.size), tx = Math.floor(gx / L.perTile), ty = Math.floor(gy / L.perTile);
  const name = `${tx}_${ty}_${gx - tx * L.perTile}_${gy - ty * L.perTile}`;
  if (!raws.has(name)) {
    let D = null;
    if ((detailIndex.chunks['2'] || {})[name]) { const raw = zlib.gunzipSync(fs.readFileSync(`${dataDir}detail/${L.dir}/${name}.bin`)); D = detailBuild.decodeChunk(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength)); }
    if (raws.size > 24) raws.clear();
    raws.set(name, D);
  }
  const D = raws.get(name);
  if (!D) return NaN;
  const fx = (x - D.x0) / D.r, fz = (z - D.z0) / D.r, K = Math.floor(fx), M = Math.floor(fz);
  if (K < 0 || M < 0 || K >= D.n - 1 || M >= D.n - 1) return NaN;
  const u = fx - K, w = fz - M, h = (k, m) => D.h[m * D.n + k];
  return (h(K, M) * (1 - u) + h(K + 1, M) * u) * (1 - w) + (h(K, M + 1) * (1 - u) + h(K + 1, M + 1) * u) * w;
}
const drops = dropsOf(JSON.parse(fs.readFileSync('src/rapids.json', 'utf8')));

// --- the fit (round 5) -------------------------------------------------------------------------------------------------
// c: a building or a made-up spot ({ x, z, len, wid, ux, uz, lake, osm, kind }); wantDock; others: those kept so far.
// -> the cabin's table row, or { fail: why } (the last reason met)
const ROT = [0, 0.35, -0.35, 0.7, -0.7];
function spotsRound(x, z) {
  const out = [[x, z, 0]];
  for (let r = 4; r <= NUDGE; r += 4) { const n = Math.max(8, Math.round((2 * Math.PI * r) / 6)); for (let k = 0; k < n; k++) { const a = (k / n) * 2 * Math.PI; out.push([x + Math.cos(a) * r, z + Math.sin(a) * r, r]); } }
  return out;
}
function fit(c, wantDock, others, pier) {
  const level = levelById[c.lake];
  let why = 'no spot';
  for (const [x, z, moved] of spotsRound(c.x, c.z)) {
    if (moved && c.kind === 'made' && moved > 24) break; // (a made-up spot is one of many: not far from where it was found)
    if (zoneAt(x, z) !== 0) { why = 'inside the edge'; continue; }
    if (others.some((o) => Math.hypot(o.x - x, o.z - z) < SPACING)) { why = 'too near another'; continue; }
    if (!clear(x, z)) { why = 'a road, a site or an entry point'; continue; }
    const w = nearestWater(x, z, c.lake);
    if (!w || w.d < DRY || w.d > NEAR_WATER) { why = 'not by its water'; continue; }
    const bx = (w.x - x) / w.d, bz = (w.z - z) / w.d;
    for (const rot of ROT) {
      // the front looks at the water (rot turns it a little either way: a shore at a slant)
      const cs = Math.cos(rot), sn = Math.sin(rot), fx = bx * cs - bz * sn, fz = bx * sn + bz * cs;
      const along = Math.abs(c.ux * fx + c.uz * fz) < 0.7071;
      const cw = Math.min(12, Math.max(5, along ? c.len : c.wid)), cd = Math.min(9, Math.max(4.5, along ? c.wid : c.len));
      const X = [-fz, fx], W = (a, b) => [x + X[0] * a + fx * b, z + X[1] * a + fz * b];
      // the ground under the cabin and its deck (src/cabins.js buildCabin's samples, and between)
      let gMin = Infinity, gMax = -Infinity, wet = false, lMax = -Infinity;
      for (let i = 0; i <= 8 && !wet; i++) for (let j = 0; j <= 8; j++) {
        const [px, pz] = W(-cw / 2 + (i / 8) * cw, -cd / 2 + (j / 8) * (cd + CAB.deck)), h = mesh(px, pz);
        if (!(h === h) || world.shoreAt(px, pz) < SHORE_CLEAR || lakeAt(px, pz)) { wet = true; break; }
        gMin = Math.min(gMin, h); gMax = Math.max(gMax, h);
        const l = lidar(px, pz); if (l === l) lMax = Math.max(lMax, l);
      }
      if (wet) { why = 'water under it'; continue; }
      if (gMax - gMin > STEEP) { why = `the slope (${(gMax - gMin).toFixed(1)} m)`; continue; }
      // the detail re-seats it by the LiDAR's rise at its middle: the LiDAR under it no higher than the floor then
      const lc = lidar(x, z) - mesh(x, z);
      if (lMax > -Infinity && lc === lc && gMax + CAB.lift + lc - lMax < 0.05) { why = 'the LiDAR under it'; continue; }
      // the dock (cabins.js buildDock): from 4 m short of the shore on this line, the shore where the drawn ground
      // drops under the water, out until DOCK_DEEP deep
      let t = 0;
      while (t < w.d + 30 && lakeAt(x + fx * t, z + fz * t) !== c.lake) t += 1;
      if (t >= w.d + 30) { why = 'no shore on its line'; continue; }
      const D = { x: x + fx * (t - 4), z: z + fz * (t - 4) }, G = (s) => mesh(D.x + fx * s, D.z + fz * s);
      let shore = null;
      for (let s = -15; s <= 30; s += 0.5) if (G(s) < level - 0.02) { shore = s; break; }
      if (shore === null) { why = 'no shore drawn'; continue; }
      const back = shore - DK.back, [bkx, bkz] = [D.x + fx * back, D.z + fz * back];
      if ((bkx - x) * fx + (bkz - z) * fz < cd / 2 + CAB.deck + 1.2) { why = 'the shore at its deck'; continue; }
      const s0 = ((Math.imul(Math.round(x) | 0, 73856093) ^ Math.imul(Math.round(z) | 0, 19349663)) >>> 0) / 4294967296;
      let len = 9 + s0 * 5;
      while (len < DK.max && level - G(shore + len) < DOCK_DEEP) len += 0.5;
      if (level - G(shore + len) < DOCK_DEEP) { why = 'too shallow off it'; continue; }
      let dry = false; for (let s = shore + 1; s <= shore + len; s += 0.5) if (G(s) > level - 0.1) { dry = true; break; }
      if (dry) { why = 'land on the dock\'s line'; continue; }
      if (!clear(D.x + fx * (shore + len), D.z + fz * (shore + len))) { why = 'the dock by a site'; continue; }
      const end = [D.x + fx * (shore + len), D.z + fz * (shore + len)];
      const way = dockWaterway(world, end[0], end[1], level, drops);
      if (!way.ok) { why = `its water: ${way.why}`; continue; }
      const dist = Math.hypot(way.open.x - end[0], way.open.z - end[1]);
      return {
        lake: c.lake, x: +x.toFixed(1), z: +z.toFixed(1), fx: +fx.toFixed(4), fz: +fz.toFixed(4), w: +cw.toFixed(1), d: +cd.toFixed(1),
        seed: Math.floor(s0 * 1e6),
        dock: wantDock || pier ? { x: +D.x.toFixed(1), z: +D.z.toFixed(1), dx: +fx.toFixed(4), dz: +fz.toFixed(4), len: +len.toFixed(1), end: end.map((v) => +v.toFixed(1)), open: Math.round(way.open.steps * g.cell), depth: +(level - G(shore + len)).toFixed(2) } : null,
        osm: c.osm, moved: Math.round(moved), turned: rot, ground: +(gMax - gMin).toFixed(2), dist: Math.round(dist),
      };
    }
  }
  return { fail: why };
}

// --- the candidates ---------------------------------------------------------------------------------------------------
const cands = [];
for (const line of fs.readFileSync(bFile, 'utf8').split('\n')) {
  const s = line.replace(/^\x1e/, '').trim(); if (!s) continue;
  const f = JSON.parse(s), kind = f.properties.building;
  if (!HOUSE.has(kind) || f.properties.amenity || f.properties.tourism || f.properties.shop) continue;
  const fp = footprint(f);
  if (!fp || fp.area < 25 || fp.area > 260 || fp.len > 24) continue;
  const { x, z } = fp;
  if (Math.abs(x - g.originX - g.width * g.cell / 2) > g.width * g.cell / 2 - 3000 || Math.abs(z - g.originZ - g.height * g.cell / 2) > g.height * g.cell / 2 - 3000) continue;
  if (zoneAt(x, z) !== 0) continue;
  let lake = 0, w = null;
  for (const id of Object.keys(LAKES).map(Number)) { const q = nearestWater(x, z, id); if (q && (!w || q.d < w.d)) { w = q; lake = id; } }
  if (!w || w.d < DRY || w.d > NEAR_WATER) continue;
  if (wetUnder(x, z, Math.max(fp.len, fp.wid) / 2 + 4)) continue;
  cands.push({ ...fp, lake, w, osm: f.id || f.properties['@id'] || null, kind });
}
console.log(`${cands.length} candidates`);

// --- choose: nearest the wilderness first, spaced, each fitted -----------------------------------------------------------
const why = {};
const dockWanted = (x, z) => ((Math.imul(Math.round(x) | 0, 73856093) ^ Math.imul(Math.round(z) | 0, 19349663)) >>> 0) / 4294967296 < 0.8;
const pierNear = (c) => piers.some((p) => Math.hypot(p[0][0] - c.x, p[0][1] - c.z) < 60 + c.w.d);
function take(c, kept) {
  const r = fit(c, dockWanted(c.x, c.z), kept, pierNear(c));
  if (r.fail) { why[r.fail] = (why[r.fail] || 0) + 1; return null; }
  return r;
}
const chosen = [];
for (const [id, L] of Object.entries(LAKES)) {
  const list = cands.filter((c) => c.lake === Number(id));
  for (const c of list) c.wild = toWild(c.x, c.z);
  list.sort((a, b) => a.wild - b.wild);
  const mine = [];
  let tried = 0;
  for (const c of list) {
    if (mine.length >= L.n) break;
    if (chosen.concat(mine).some((o) => Math.hypot(o.x - c.x, o.z - c.z) < SPACING)) continue;
    tried++;
    const r = take(c, chosen.concat(mine)); if (r) mine.push(r);
  }
  const mapped = mine.length;
  // too few mapped: plausible shore spots of that lake (25–45 m up from its water, dry, out, clear, near a road), the
  // nearest the wilderness first
  if (mine.length < L.n) {
    const lk = index.lakes.find((q) => q && q.id === Number(id)), R = Math.sqrt(lk.cells) * g.cell * 1.6, made = [];
    for (let z = lk.cz - R; z <= lk.cz + R; z += 20) for (let x = lk.cx - R; x <= lk.cx + R; x += 20) {
      if (lakeAt(x, z) || zoneAt(x, z) !== 0 || wetUnder(x, z, 10)) continue;
      const w = nearestWater(x, z, Number(id), 50);
      if (!w || w.d < 25 || w.d > 45 || !clear(x, z) || !near(osmRoad, x, z, 700)) continue;
      made.push({ x, z, len: 8, wid: 6.5, ux: 1, uz: 0, lake: Number(id), w, osm: null, kind: 'made', wild: toWild(x, z) });
    }
    made.sort((a, b) => a.wild - b.wild);
    for (const c of made) {
      if (mine.length >= L.n) break;
      if (chosen.concat(mine).some((o) => Math.hypot(o.x - c.x, o.z - c.z) < SPACING * 2)) continue;
      tried++;
      const r = take(c, chosen.concat(mine)); if (r) mine.push(r);
    }
    console.log(`  ${L.name}: ${made.length} made-up shore spots`);
  }
  console.log(`${L.name}: ${list.length} candidates, ${tried} fitted, ${mine.length} kept (${mapped} mapped), moved ${mine.map((c) => c.moved).join(' ')} m`);
  if (mine.length < L.n) console.warn(`  ${L.name}: only ${mine.length} of ${L.n}`);
  chosen.push(...mine);
}
await vite.close();
console.log('passed over:', JSON.stringify(why));

const cabins = chosen.map(({ moved, turned, ground, dist, ...row }) => row); // eslint-disable-line no-unused-vars
fs.writeFileSync(out, JSON.stringify({ about: 'cabins and docks just past the Boundary Waters (scripts/cabins.mjs; buildings from OpenStreetMap, © OpenStreetMap contributors, ODbL)', lakes: Object.fromEntries(Object.entries(LAKES).map(([k, v]) => [k, v.name])), cabins }, null, 0).replace(/\},\{"lake"/g, '},\n{"lake"') + '\n');
console.log(`${cabins.length} cabins (${cabins.filter((c) => c.dock).length} docks; ground ${chosen.map((c) => c.ground).join(' ')}) → ${path.resolve(out)}`);

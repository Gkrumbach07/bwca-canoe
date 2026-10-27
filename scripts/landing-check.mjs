#!/usr/bin/env node
// Checks every entry point's landing against a data release: the put-in, the landing on the shore, the dock and the
// outfitter's store (with its porch, steps and canoe rack), placed exactly as the game places them (props.js
// landingPlan, loaded through Vite so the game's own code runs) and sampled on the release's tiles.
//
//   node scripts/landing-check.mjs [--data public/data] [--ep 30,25] [--json out.json] [--quiet] [--search]
//
// What fails:
//   put-in    the entry point's own spot is not on water (shore distance >= 0 or no lake there)
//   landing   the anchor the landing walked to is not at the shore (|shore distance - 1.1| > 1), or lies more than
//             150 m from the put-in (or 60 m past the put-in's own distance from the shore)
//   dock      its far end not over water, the water there shallower than 0.3 m where deeper is in reach along its line, its deck less than
//             0.3 m or more than 1.0 m over the highest water under it, or no bank under its land end
//   store     any of its footprint (the store, its porch or stoop, the rack) on a water cell or under the drawn water
//             (ground below the level of water within one cell), its floor less than 0.3 m over the water's level near
//             it, or the ground under it rising more than 2.5 m (a foundation taller than a man)
// The water's level near a spot: the highest level of the lake cells within 30 m (the level the drawn water patch
// reaches there); the shore distance and the lake id as the tile says.
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.resolve(arg('--data', path.join(root, 'public/data'))) + '/';
const only = arg('--ep', null) ? new Set(arg('--ep').split(',').map(Number)) : null;
const jsonOut = arg('--json', null), quiet = process.argv.includes('--quiet'), search = process.argv.includes('--search');

const vite = await createServer({ root, configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
let props, gridMod, terrain;
try {
  props = await vite.ssrLoadModule('/src/props.js');
  gridMod = await vite.ssrLoadModule('/src/grid.js');
  terrain = await vite.ssrLoadModule('/src/terrain-build.js');
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
    } catch { /* no tile: all land at 0 */ }
    tiles.set(k, tg);
  }
  return tiles.get(k);
}
// The whole map's cells from the tiles' cores: the ground the game draws across tile seams, and the world props.js
// reads (outfitters.js profiles it).
class WorldGrid extends GridQueries {
  constructor() {
    super();
    this.cell = g.cell; this.originX = g.originX; this.originZ = g.originZ; this.tile = g.tile;
    this.ntx = g.ntx; this.nty = g.nty; this.tileMetres = g.tile * g.cell; this.meta = index;
    this.lakes = index.lakes; this.basins = index.basins; this.portages = index.portages; this.campsites = index.campsites;
    this.entryPoints = index.entryPoints; this.levelById = levelById;
  }
  at(i, j) {
    const tx = Math.min(g.ntx - 1, Math.max(0, Math.floor(i / g.tile))), ty = Math.min(g.nty - 1, Math.max(0, Math.floor(j / g.tile)));
    return tileGrid(tx, ty);
  }
  hCell(i, j) { const t = this.at(i, j); return t ? t.hCell(i, j) : 0; }
  sdCell(i, j) { const t = this.at(i, j); return t ? t.sdCell(i, j) : 100; }
  lakeCell(i, j) { const t = this.at(i, j); return t ? t.lakeCell(i, j) : 0; }
  levelCell(i, j) { const t = this.at(i, j); return t ? t.levelCell(i, j) : 0; }
  levelOf(id) { return levelById[id]; }
  tileOrigin(tx, ty) { return [g.originX + tx * this.tileMetres, g.originZ + ty * this.tileMetres]; }
  isReady() { return true; }
}
const world = new WorldGrid();
const cache = new Map();
const H = (x, z) => terrain.meshHeightAt(world, x, z, cache);
// the drawn water's level at (x, z): the highest level of the lake cells whose quads reach within r metres, or null
function waterNear(x, z, r = 30) {
  const ci = world.cellI(x), cj = world.cellJ(z), n = Math.ceil(r / g.cell);
  let best = null;
  for (let dj = -n; dj <= n + 1; dj++) for (let di = -n; di <= n + 1; di++) {
    const i = ci + di, j = cj + dj;
    if (!world.lakeCell(i, j)) continue;
    if (Math.hypot(world.cellX(i) - x, world.cellZ(j) - z) > r + g.cell) continue;
    const l = world.levelCell(i, j);
    if (best === null || l > best) best = l;
  }
  return best;
}
// under the drawn water: a water quad covers (x, z) (a corner of its cell quad is a lake cell) and the ground is below it
function flooded(x, z) {
  const fx = (x - g.originX) / g.cell - 0.5, fz = (z - g.originZ) / g.cell - 0.5, i = Math.floor(fx), j = Math.floor(fz);
  let lv = -Infinity;
  for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (world.lakeCell(i + a, j + b)) lv = Math.max(lv, world.levelCell(i + a, j + b));
  return lv > -Infinity && H(x, z) < lv + 0.02 ? lv : null;
}

const r2 = (v) => (v === null || v === undefined || !Number.isFinite(v) ? v : +v.toFixed(2));
const lakeName = (id) => { const l = id > 0 ? index.lakes[id - 1] : null; return l ? l.displayName || l.name || `lake ${id}` : '—'; };

const rows = [];
for (const ep of index.entryPoints) {
  if (only && !only.has(ep.ep)) continue;
  const [tx, ty] = [Math.floor((ep.x - g.originX) / (g.tile * g.cell)), Math.floor((ep.z - g.originZ) / (g.tile * g.cell))];
  const tg = tileGrid(tx, ty);
  const [ox, oz] = world.tileOrigin(tx, ty);
  const ctx = { tg, world, H, ox, oz };
  const fails = [], notes = [];
  // the put-in
  const sdEp = world.shoreAt(ep.x, ep.z), lakeEp = world.lakeIdAt(ep.x, ep.z);
  if (!(sdEp < 0 && lakeEp)) fails.push(`put-in on land (shore ${r2(sdEp)} m)`);
  // the plan
  const P = props.landingPlan(ctx, ep), F = P.F, D = P.dock, S = P.site;
  const sdA = world.shoreAt(P.x, P.z), far = Math.hypot(P.x - ep.x, P.z - ep.z);
  if (Math.abs(sdA - 1.1) > 1) fails.push(`landing not at the shore (shore ${r2(sdA)} m, ${r2(far)} m from the put-in)`);
  if (far > Math.max(150, -sdEp + 60)) fails.push(`landing ${far.toFixed(0)} m from the put-in`);
  // the dock
  const [ex, ez] = F.W(0, D.len), lvEnd = world.levelAt(ex, ez), gEnd = H(ex, ez), depthEnd = lvEnd - gEnd;
  let under = -Infinity; // the highest water under the dock
  for (let b = D.back; b <= D.len; b += 0.5) { const [x, z] = F.W(0, b); if (world.shoreAt(x, z) < 0.5) under = Math.max(under, world.levelAt(x, z, 2)); }
  const deckOver = D.deckY - (under > -Infinity ? under : D.level);
  if (world.shoreAt(ex, ez) >= 0) fails.push(`dock end on land (shore ${r2(world.shoreAt(ex, ez))} m)`);
  if (depthEnd < 0.3) {
    // shallow water: a fail unless there is no deeper water along the dock's line within 18 m (a creek, a flat bed)
    let deepest = -Infinity;
    for (let b = 0; b <= 18; b += 0.5) { const [x, z] = F.W(0, b); if (world.shoreAt(x, z) < 0) deepest = Math.max(deepest, world.levelAt(x, z, 2) - H(x, z)); }
    if (deepest > depthEnd + 0.1) fails.push(`dock end in ${r2(depthEnd)} m of water (${r2(deepest)} m within 18 m)`);
    else notes.push(`shallow water: the dock's end in ${r2(depthEnd)} m, the deepest along it within 18 m ${r2(deepest)} m`);
  }
  if (deckOver < 0.3 || deckOver > 1.0) fails.push(`dock deck ${r2(deckOver)} m over the water`);
  if (D.sill <= -6) fails.push('no bank under the dock\'s land end');
  // the store, its porch or stoop and its steps' landing, and the rack
  const { ao, b0, floorY } = S, hD = 4.0, hW = 3.0;
  let gmin = Infinity, gmax = -Infinity, wl = -Infinity, wet = 0, flood = 0, worstUnder = 0;
  const pts = [];
  for (let a = -hW; a <= hW + 1e-6; a += 1) for (let c = -hD; c <= hD + P.pd + 1e-6; c += 1) pts.push([ao + a, b0 + c]);
  const ra = ao + (ao > 1 ? hW + 2.3 : -(hW + 2.3));
  for (let a = -0.7; a <= 0.71; a += 0.7) for (let c = -1.3; c <= 1.31; c += 0.65) pts.push([ra + a, b0 + 1.2 + c]);
  for (const [a, c] of pts) {
    const [x, z] = F.W(a, c), y = H(x, z);
    gmin = Math.min(gmin, y); gmax = Math.max(gmax, y);
    const w = waterNear(x, z); if (w !== null) wl = Math.max(wl, w);
    if (world.lakeIdAt(x, z) || world.shoreAt(x, z) < 0) wet++;
    const f = flooded(x, z); if (f !== null) { flood++; worstUnder = Math.max(worstUnder, f - y); }
  }
  const clear = wl > -Infinity ? floorY - wl : null;
  if (wet) fails.push(`store: ${wet} of its spots on water cells`);
  if (flood) fails.push(`store: ${flood} of its spots under the drawn water (to ${r2(worstUnder)} m)`);
  if (clear !== null && clear < 0.3) fails.push(`store floor ${r2(clear)} m over the water`);
  if (floorY - gmin > 2.5) fails.push(`store on steep ground (floor ${r2(floorY - gmin)} m over its lowest ground)`);
  if (S.fallback) notes.push('store site: fallback');
  // --search: for a landing on steep ground, the put-ins on the same water within 150 m whose landing stands lowest (a
  // `from` for src/landings.json)
  if (search && floorY - gmin > 2.5) {
    const tried = [];
    for (let r = 15; r <= 150; r += 15) for (let k = 0; k < Math.round(r / 3); k++) {
      const t = (k / Math.round(r / 3)) * Math.PI * 2, x = Math.round(ep.x + Math.cos(t) * r), z = Math.round(ep.z + Math.sin(t) * r);
      if (!(world.shoreAt(x, z) < -1) || world.lakeIdAt(x, z) !== lakeEp) continue;
      const Q = props.landingPlan(ctx, { ...ep, x, z });
      let lo = Infinity;
      for (let a = -3; a <= 3; a += 1) for (let c = -4; c <= 4; c += 1) { const [px, pz] = Q.F.W(Q.site.ao + a, Q.site.b0 + c); lo = Math.min(lo, H(px, pz)); }
      tried.push({ from: [x, z], rise: r2(Q.site.floorY - lo), shore: [r2(Q.x), r2(Q.z)], dist: r2(Math.hypot(Q.x - ep.x, Q.z - ep.z)) });
    }
    tried.sort((a, b) => a.rise - b.rise || a.dist - b.dist);
    notes.push('search: ' + tried.slice(0, 4).map((t) => JSON.stringify(t)).join(' '));
  }
  const row = {
    ep: ep.ep, name: ep.name, lake: lakeName(lakeEp || ep.lake), putIn: { shore: r2(sdEp), lake: lakeEp },
    landing: { x: r2(P.x), z: r2(P.z), shore: r2(sdA), fromPutIn: r2(far), level: r2(P.level) },
    dock: { deckY: r2(D.deckY), level: r2(D.level), deckOver: r2(deckOver), endDepth: r2(depthEnd), sill: r2(D.sill), len: D.len },
    store: { ao, b0, floorY: r2(floorY), water: wl > -Infinity ? r2(wl) : null, clear: r2(clear), groundMin: r2(gmin), groundMax: r2(gmax), wet, under: flood, worstUnder: r2(worstUnder), fallback: !!S.fallback, centre: F.W(ao, b0).map(r2) },
    fails, notes,
  };
  rows.push(row);
}
await vite.close();

const bad = rows.filter((r) => r.fails.length);
const kinds = {};
for (const r of bad) for (const f of r.fails) { const k = f.replace(/[-\d.]+/g, '#').replace(/\(.*\)/, '').trim(); kinds[k] = (kinds[k] || 0) + 1; }
if (!quiet) for (const r of rows) {
  const s = r.store;
  console.log(`${String(r.ep).padStart(2)} ${(r.name + ' / ' + r.lake).slice(0, 44).padEnd(44)} ${r.fails.length ? 'FAIL' : 'ok  '} floor ${s.floorY} water ${s.water} clear ${s.clear} ground ${s.groundMin}..${s.groundMax} dock over ${r.dock.deckOver} end ${r.dock.endDepth} m${r.notes.length ? ' · ' + r.notes.join(', ') : ''}`);
  for (const f of r.fails) console.log(`     - ${f}`);
}
console.log(`\n${dataDir}: ${rows.length} entry points, ${rows.length - bad.length} pass, ${bad.length} fail`);
for (const [k, n] of Object.entries(kinds).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${k}`);
const worst = rows.filter((r) => r.store.clear !== null).sort((a, b) => a.store.clear - b.store.clear).slice(0, 8);
console.log('lowest store floors over the water: ' + worst.map((r) => `${r.ep} ${r.name} ${r.store.clear} m`).join('; '));
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(rows, null, 1));
process.exitCode = bad.length ? 1 : 0;

#!/usr/bin/env node
// Where each of the fourteen outfitters really stands (round 2, markers: the owner, 2026-11-05: "the map has the
// outfitter location a lot of times just like in the middle of the water ... we need to place the points on our map and
// where we get spawned for those after we've placed the buildings"). Each store is laid out exactly as the game lays it
// out (props.js buildOutfitterNow: the landing walked to the shore from the put-in, the dock, the store's site chosen on
// the 10 m ground and kept), and its built door, porch steps, dock and the water beside the dock are written to
// src/outfitter-places.json for the release they were worked out on (index.json source.baked). outfitters.js placeOf
// reads it, so every map, the season's spawn, the rides and the pickups know where the store is without loading its
// tile. scripts/r2-markers-test.mjs holds the table to the live build.
//
// The campsites the same way (the owner: "the campsites also kind of get moved around a little bit, so those need to have
// their locations updated"): each site moved to its flat (src/camp-access.json, round flat, as world.js setCampAccess
// moves it) and its fire ring placed as props.js builds it (campFireAt), written to src/camp-fires.json as the ring's
// offset from the moved point; world.js reads it as c.fire, the spot every map marks the site at (campSpot).
//
//   node scripts/r2-outfitter-places.mjs [--data public/data] [--check]
//
// --check: build again and compare with the table (no write); exit 1 when a spot moved more than 0.5 m.
// Everything x, z is world metres; a heading is player.heading's (atan2(-dz, dx) of the way faced).
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.resolve(arg('--data', path.join(root, 'public/data'))) + '/';
const check = process.argv.includes('--check');
const OUT = path.join(root, 'src/outfitter-places.json'), OUT_FIRES = path.join(root, 'src/camp-fires.json');

// the canvases the store's signs draw on: nothing in node (as landing-check.mjs)
const ctx2d = new Proxy({}, {
  get: (t, k) => (k in t ? t[k] : k === 'getImageData' || k === 'createImageData' ? (a, b, w = 1, h = 1) => ({ data: new Uint8ClampedArray(Math.max(1, w * h) * 4), width: w, height: h })
    : k === 'measureText' ? (q) => ({ width: String(q).length * 8, actualBoundingBoxAscent: 8, actualBoundingBoxDescent: 2 })
      : k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern' ? () => ({ addColorStop() {} }) : () => {}),
  set: (t, k, v) => { t[k] = v; return true; },
});
globalThis.document = globalThis.document || { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => ctx2d, toDataURL: () => '' }) };
const vite = await createServer({ root, configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true, include: [] } });
let props, gridMod, terrain, OF;
try {
  props = await vite.ssrLoadModule('/src/props.js');
  gridMod = await vite.ssrLoadModule('/src/grid.js');
  terrain = await vite.ssrLoadModule('/src/terrain-build.js');
  OF = await vite.ssrLoadModule('/src/outfitters.js');
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
class WorldGrid extends GridQueries {
  constructor() {
    super();
    this.cell = g.cell; this.originX = g.originX; this.originZ = g.originZ; this.tile = g.tile;
    this.ntx = g.ntx; this.nty = g.nty; this.tileMetres = g.tile * g.cell; this.meta = index;
    this.lakes = index.lakes; this.basins = index.basins; this.portages = index.portages; this.campsites = index.campsites;
    this.entryPoints = index.entryPoints; this.levelById = levelById;
  }
  at(i, j) { return tileGrid(Math.min(g.ntx - 1, Math.max(0, Math.floor(i / g.tile))), Math.min(g.nty - 1, Math.max(0, Math.floor(j / g.tile)))); }
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
const H10 = (x, z) => terrain.meshHeightAt(world, x, z, cache);

const r1 = (v) => +v.toFixed(1), r3 = (v) => +v.toFixed(3);
const places = {};
const rows = [];
for (const n of OF.OUTFITTER_EPS) {
  const ep = index.entryPoints.find((e) => e.ep === n);
  if (!ep) { rows.push(`${n}: no such entry point in the release`); continue; }
  const tx = Math.floor((ep.x - g.originX) / (g.tile * g.cell)), ty = Math.floor((ep.z - g.originZ) / (g.tile * g.cell));
  const [ox, oz] = world.tileOrigin(tx, ty);
  const ctx = { tg: tileGrid(tx, ty), world, H: H10, Hsite: H10, ox, oz, obstacles: [] };
  const B = props.buildOutfitterNow(ctx, ep), L = B.layout;
  if (!L) { rows.push(`${n}: no store built`); continue; }
  // the door (on the porch, facing out), the store's middle, the foot of its steps, the dock's land end and its deck by
  // the first berth, the water beside it (dockSide: where a canoe is tied, and where a teleport puts you afloat)
  const p = {
    name: OF.outfitterName(n),
    store: [r1(L.centre.x), r1(L.centre.z)],
    door: [r1(L.door.x), r1(L.door.z), r3(L.door.heading)],
    steps: [r1(L.stepsFoot.x), r1(L.stepsFoot.z)],
    dockLand: [r1(L.dockLand.x), r1(L.dockLand.z)],
    deck: [r1(L.dockDeck.x), r1(L.dockDeck.z)],
    dock: [r1(L.dockSide.x), r1(L.dockSide.z)],
    dockHeading: r3(L.dockHeading),
    floorY: +L.floorY.toFixed(2),
    fromEp: Math.round(Math.hypot(L.centre.x - ep.x, L.centre.z - ep.z)),
  };
  // the door on dry ground and the canoe's spot on the water, as the release says
  p.doorShore = r1(world.shoreAt(L.door.x, L.door.z));
  p.dockShore = r1(world.shoreAt(L.dockSide.x, L.dockSide.z));
  places[n] = p;
  rows.push(`${String(n).padStart(2)} ${p.name.padEnd(28)} store ${p.fromEp} m from EP ${n} (${ep.name}) · door shore ${p.doorShore} m · dock shore ${p.dockShore} m`);
}
// the campsites: moved to their flats (camp-access.json m, as world.js setCampAccess), the ring where props.js builds it
const access = JSON.parse(fs.readFileSync(path.join(root, 'src/camp-access.json'), 'utf8'));
const fires = {};
let nFire = 0, moved = 0, far = 0;
for (const c0 of index.campsites) {
  const c = { ...c0 }, rx = Math.round(c.x), rz = Math.round(c.z), key = `${rx}:${rz}`, e = access.for === (index.source && index.source.baked) ? access.sites[key] : null;
  if (e && e.m && e.m.length === 2) { c.x = rx + e.m[0] / 10; c.z = rz + e.m[1] / 10; if (Number.isFinite(e.ms)) c.shore = e.ms; moved++; }
  const tx = Math.floor((c.x - g.originX) / (g.tile * g.cell)), ty = Math.floor((c.z - g.originZ) / (g.tile * g.cell)), tg = tileGrid(tx, ty);
  if (!tg) continue;
  const f = props.campFireAt(tg, c), dx = Math.round((f.x - c.x) * 10), dz = Math.round((f.z - c.z) * 10);
  nFire++;
  if (dx || dz) { fires[key] = [dx, dz]; if (Math.hypot(dx, dz) > 30) far++; }
}
rows.push(`campsites: ${nFire} rings placed, ${moved} on their flats, ${Object.keys(fires).length} rings off the site's point (${far} more than 3 m)`);
await vite.close();
const fireTable = {
  about: 'Each campsite\'s fire ring as props.js builds it (campFireAt), by the site\'s key (its data point rounded: world.js c.key), as [dx, dz] decimetres from the site\'s spot after round flat\'s move (camp-access.json m); a site not listed has its ring on its spot. Written by scripts/r2-outfitter-places.mjs for the release `for`; read by world.js setCampFires as c.fire, where every map marks the site (campSpot).',
  for: index.source && index.source.baked,
  fires,
};
const table = {
  about: 'Where each outfitter stands, laid out as the game lays it out (props.js buildOutfitterNow on the 10 m ground; the site is chosen there and kept), by entry point number: store (its middle), door ([x, z, heading], on the porch, facing out), steps (the foot of the porch steps), dockLand (the dock\'s land end), deck (on the dock by the first berth), dock (the water beside the dock where a canoe is tied: the spot a season, a ride or a pickup arrives at), dockHeading, floorY, fromEp (m from the entry point\'s own spot), doorShore/dockShore (the release\'s shore distance there). Written by scripts/r2-outfitter-places.mjs for the release `for` (index.json source.baked); read by outfitters.js placeOf; scripts/r2-markers-test.mjs holds it to the live build.',
  for: index.source && index.source.baked,
  places,
};
for (const r of rows) console.log(r);
if (check) {
  let old = null;
  try { old = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { /* none */ }
  let bad = 0;
  if (!old || old.for !== table.for) { console.log(`check: the table is for ${old && old.for}, the release is ${table.for}`); bad++; }
  else for (const [n, p] of Object.entries(places)) {
    const q = old.places[n];
    for (const k of ['store', 'door', 'dock', 'deck']) { const d = q && q[k] ? Math.hypot(q[k][0] - p[k][0], q[k][1] - p[k][1]) : Infinity; if (d > 0.5) { console.log(`check: ${n} ${k} moved ${d.toFixed(2)} m`); bad++; } }
  }
  let oldF = null;
  try { oldF = JSON.parse(fs.readFileSync(OUT_FIRES, 'utf8')); } catch { /* none */ }
  if (!oldF || oldF.for !== fireTable.for) { console.log('check: camp-fires.json is for another release'); bad++; }
  else { let n = 0; for (const k of new Set([...Object.keys(fires), ...Object.keys(oldF.fires)])) { const a = fires[k] || [0, 0], b = oldF.fires[k] || [0, 0]; if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 5) n++; } if (n) { console.log(`check: ${n} campsite rings moved`); bad += n; } }
  console.log(bad ? `check: ${bad} differences` : 'check: the table matches the build');
  process.exitCode = bad ? 1 : 0;
} else {
  fs.writeFileSync(OUT, JSON.stringify(table, null, 1) + '\n');
  fs.writeFileSync(OUT_FIRES, JSON.stringify(fireTable) + '\n');
  console.log(`wrote ${path.relative(root, OUT_FIRES)} (${Object.keys(fires).length} rings off their points)`);
  console.log(`wrote ${path.relative(root, OUT)} (${Object.keys(places).length} outfitters, for ${table.for})`);
}

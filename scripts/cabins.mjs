#!/usr/bin/env node
// A few cabins at the edge (round 4, stream C; the owner's "yes" to docs/build/edge-and-roads.md's "a few cabins at the
// edge"): private cabins and their docks on Burntside, White Iron, Vermilion and Gunflint, just past the Boundary Waters'
// line, so the "private land" the edge notice speaks of is something you see. Writes src/cabins.json (src/cabins.js
// builds them into the tile's props mesh).
//
//   osmium tags-filter <minnesota pbf> nwr/building -o bld.osm.pbf && osmium export bld.osm.pbf -f geojsonseq -o bld.geojsonseq
//   osmium tags-filter <minnesota pbf> w/man_made=pier -o pier.osm.pbf && osmium export pier.osm.pbf -f geojsonseq -o pier.geojsonseq
//   node scripts/cabins.mjs --buildings bld.geojsonseq --piers pier.geojsonseq [--data public-data-v9]
//
// Real spots: OpenStreetMap's buildings (© OpenStreetMap contributors, ODbL) on the four lakes' shores, kept when
//   - the edge table (src/edge.bin) has them out (zone 0: past the band, not a doorstep),
//   - the baked water (the release's tiles) of that lake is 12–90 m from the building, the building itself dry,
//   - they are 250 m or more from any entry point, outfitter's yard or lot, 150 m from a campsite or a portage,
//   - house-sized (25–260 m² of footprint; sheds, garages and the like left out),
// and of those the ones nearest the wilderness, a few to a lake, 70 m or more apart. Each gets a dock out to its lake
// when the water comes close enough (a pier mapped near it, or most of the rest), laid along the line to the water.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const dataDir = arg('--data', '/Users/gkrumbac/Documents/bwca-canoe/public-data-v9').replace(/\/?$/, '/');
const bFile = arg('--buildings'), pFile = arg('--piers');
const out = arg('--out', 'src/cabins.json');
if (!bFile) { console.error('--buildings <geojsonseq> needed'); process.exit(1); }

// the lakes (the release's ids) and how many cabins each
const LAKES = { 12: { name: 'Burntside Lake', n: 9 }, 26: { name: 'White Iron Lake', n: 7 }, 2: { name: 'Lake Vermilion', n: 7 }, 24: { name: 'Gunflint Lake', n: 7 } };
const SPACING = 70, NEAR_WATER = 90, DRY = 12, EP_CLEAR = 250, SITE_CLEAR = 150;

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
const roadPts = [], osmRoad = [];
try {
  const t = JSON.parse(fs.readFileSync('src/roads.json', 'utf8'));
  for (const r of t.roads) { let x = 0, z = 0; for (let i = 0; i + 3 < r.p.length; i += 4) { x += r.p[i]; z += r.p[i + 1]; roadPts.push([x / 10, z / 10]); } }
} catch { /* none */ }
const roadsFile = arg('--roads', 'data-cache/edge/roads.json');
try { for (const w of JSON.parse(fs.readFileSync(roadsFile, 'utf8')).ways) for (const [lon, lat] of w.pts) osmRoad.push(toXZ(lon, lat)); } catch { console.warn(`no ${roadsFile}: the made-up spots are not held near a road`); }
const near = (list, x, z, r) => list.some(([a, b]) => (x - a) ** 2 + (z - b) ** 2 < r * r);
const clear = (x, z) => keepOff.every(([a, b, r]) => (x - a) ** 2 + (z - b) ** 2 >= r * r) && !near(roadPts, x, z, 30);

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
  if (!clear(x, z)) continue;
  cands.push({ ...fp, lake, w, osm: f.id || f.properties['@id'] || null, kind });
}
console.log(`${cands.length} candidates`);

// --- choose: nearest the wilderness first, spaced -----------------------------------------------------------------------
const chosen = [];
for (const [id, L] of Object.entries(LAKES)) {
  const list = cands.filter((c) => c.lake === Number(id));
  for (const c of list) c.wild = toWild(c.x, c.z);
  list.sort((a, b) => a.wild - b.wild);
  const mine = [];
  for (const c of list) {
    if (mine.length >= L.n) break;
    if (chosen.concat(mine).some((o) => Math.hypot(o.x - c.x, o.z - c.z) < SPACING)) continue;
    mine.push(c);
  }
  // too few mapped: plausible shore spots of that lake (25–45 m up from its water, dry, out, clear, near a road), the
  // nearest the wilderness first
  if (mine.length < L.n) {
    const lk = index.lakes.find((q) => q && q.id === Number(id)), R = Math.sqrt(lk.cells) * g.cell * 1.6, made = [];
    for (let z = lk.cz - R; z <= lk.cz + R; z += 20) for (let x = lk.cx - R; x <= lk.cx + R; x += 20) {
      if (lakeAt(x, z) || zoneAt(x, z) !== 0 || wetUnder(x, z, 10)) continue;
      const w = nearestWater(x, z, Number(id), 50);
      if (!w || w.d < 25 || w.d > 45 || !clear(x, z) || !near(osmRoad, x, z, 700) || near(osmRoad, x, z, 35)) continue;
      made.push({ x, z, len: 8, wid: 6.5, ux: 1, uz: 0, lake: Number(id), w, osm: null, kind: 'made', wild: toWild(x, z) });
    }
    made.sort((a, b) => a.wild - b.wild);
    for (const c of made) {
      if (mine.length >= L.n) break;
      if (chosen.concat(mine).some((o) => Math.hypot(o.x - c.x, o.z - c.z) < SPACING * 2)) continue;
      mine.push(c);
    }
    console.log(`  ${L.name}: ${made.length} made-up shore spots`);
  }
  console.log(`${L.name}: ${list.length} candidates, ${mine.length} kept, ${mine.map((c) => Math.round(c.wild)).join(' ')} m from the wild`);
  chosen.push(...mine);
}

// --- the docks --------------------------------------------------------------------------------------------------------
// from the shore (the last dry 1 m step on the line from the cabin to its nearest water) straight out, 7–12 m; a mapped
// pier within 60 m sets the line instead
const cabins = chosen.map((c) => {
  const s = ((Math.imul(Math.round(c.x) | 0, 73856093) ^ Math.imul(Math.round(c.z) | 0, 19349663)) >>> 0) / 4294967296;
  let dx = c.w.x - c.x, dz = c.w.z - c.z; const L = Math.hypot(dx, dz); dx /= L; dz /= L;
  let pier = null;
  for (const p of piers) { const [px, pz] = p[0]; if (Math.hypot(px - c.x, pz - c.z) < 60 + c.w.d) { pier = p; break; } }
  if (pier) { const [ax, az] = pier[0], [bx, bz] = pier[pier.length - 1], dl = Math.hypot(bx - ax, bz - az); if (dl > 3) { const fx = (bx - ax) / dl, fz = (bz - az) / dl, sg = fx * dx + fz * dz > 0 ? 1 : -1; if (Math.abs(fx * dx + fz * dz) > 0.5) { dx = fx * sg; dz = fz * sg; } } }
  // the shore along the line
  let t = 0;
  while (t < c.w.d + 30 && lakeAt(c.x + dx * t, c.z + dz * t) !== c.lake) t += 1;
  const shore = { x: c.x + dx * (t - 4), z: c.z + dz * (t - 4) };
  const dock = (pier || s < 0.8) && t < c.w.d + 30 ? { x: +shore.x.toFixed(1), z: +shore.z.toFixed(1), dx: +dx.toFixed(4), dz: +dz.toFixed(4), len: +(9 + s * 5).toFixed(1) } : null;
  // the cabin turned square to the water: its long side along the shore when that is how the footprint lies
  const along = Math.abs(c.ux * dx + c.uz * dz) < 0.7071;
  const face = { x: dx, z: dz }; // the front (the porch side) looks at the water
  const w = Math.min(12, Math.max(5, along ? c.len : c.wid)), d = Math.min(9, Math.max(4.5, along ? c.wid : c.len));
  return {
    lake: c.lake, x: +c.x.toFixed(1), z: +c.z.toFixed(1), fx: +face.x.toFixed(4), fz: +face.z.toFixed(4), w: +w.toFixed(1), d: +d.toFixed(1),
    seed: Math.floor(s * 1e6), dock, osm: c.osm,
  };
});
fs.writeFileSync(out, JSON.stringify({ about: 'cabins and docks just past the Boundary Waters (scripts/cabins.mjs; buildings from OpenStreetMap, © OpenStreetMap contributors, ODbL)', lakes: Object.fromEntries(Object.entries(LAKES).map(([k, v]) => [k, v.name])), cabins }, null, 0).replace(/\},\{/g, '},\n{') + '\n');
console.log(`${cabins.length} cabins (${cabins.filter((c) => c.dock).length} docks) → ${path.resolve(out)}`);

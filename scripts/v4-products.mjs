// d2 bake: round D1's source products (data-cache/<source>/, docs/data-sources.md "Fetched") read onto the bake's
// whole 10 m grid, and the per-cell channels of tile format v4 made from them.
//
// Every product shares one layout: data-cache/<source>/<tx>_<ty>.<channel>.bin, the gzip of the tile's 256 x 256 core on
// the AREAS.bwca grid (no halo), row 0 at the north edge, little-endian; a tile a product has nothing for isn't written
// and reads as each channel's nodata. The products only fit the bwca grid: on any other grid (a test bake of the
// lakeone box) none are read and the bake comes out as before, on 3DEP and noise.
//
// Tile format v4 (bake.mjs writes it, world.js / grid.js read it): each fine tile is the v3 tile, (tile + 2 halo)^2
// cells of [height Int16 dm][lake Uint16][sdist Int16 dm][level Int16 dm], followed by one Uint8 plane per channel
// below, same cells, same halo, in this order. (The level field is 0 on land in v4: v3 copied the height there.) index.json version 4 names them in `fields` (the four, then these) and
// `channels` ({ name, at, type, nodata }: plane k starts at byte at x side^2). Far tiles stay the v3 four.
//   ground  d1-ground's kind (0 no survey, 1 upland, 2 open bog, 3 conifer bog, 4 shrub swamp, 5 marsh, 6 wet meadow,
//           7 hardwood swamp, 8 in-lake emergent, 9 aquatic bed, 10 rock outcrop, 11 boulder field, 12 sand, 13 open
//           water), with d1-forest-rock's mapped outcrop (`bare`) as 10 where the kind is 0, 1 or 11 (the NWI wetlands
//           2-9, the mapped sand and open water keep theirs). On the bake's water a cell is 8, 9 or 13 (0 where nothing
//           was surveyed); on its land a 13 is a pond OpenStreetMap lacks.
//   forest  d1-forest-rock's forest type 0-23 (LANDFIRE LF2024 EVT; 23 = a tree class north of the Minnesota line). A
//           land cell LANDFIRE calls water (1) or has nothing for takes the nearest land cell's type, height and cover
//           (within FILL cells). The bake's water is 1.
//   canopy  the life form's height, decimetres (LANDFIRE EVH); 0 = none or no data
//   cover   its cover, % in 5 % steps (LANDFIRE EVC); 0 = none or no data
//   rock    the bedrock unit 1-19 (MGS D-05; 0 outside Minnesota): palette and cliff style in forest-rock's manifest
//   cliff   (class << 6) | strength from d1-lidar's 2 m slope, relief and roughness, where the LiDAR is (mask & 17):
//             0  no LiDAR here (Ontario, the voids): fall back to today's ground
//             1  class 0, strength 1: the LiDAR saw nothing (also every water cell it covers)
//             class 1 boulder field  slope < 30 deg, rough >= 25 cm      strength = rough / 4 cm (to 63)
//             class 2 talus or ledge slope 30-50 deg, rough >= 30 cm     strength = rough / 4 cm
//                                    (and slope >= 50 with relief < 3 m, rough >= 30)
//             class 3 face           slope >= 50 deg, relief >= 3 m      strength = the cell's relief in whole metres
//                                                                        (the source caps relief at 25.4 m)
//   stone   d1-ground's surface stone and boulder cover, 254 x sqrt(fraction) (cover % = 100 (byte / 254)^2); 255 = no
//           survey
//   secchi  the water's Secchi depth, byte / 10 m, on the bake's water only (0 on land): d1-quetico-lakes' per-cell value
//           (inside a LakeBrowser basin its own, so bays differ), else the lake's table value
//   cdom    its CDOM (a440), byte / 20 per metre, as secchi
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

export const V4_CHANNELS = [
  { name: 'ground', type: 'u8', nodata: 0, unit: 'kind (d1-ground legend)' },
  { name: 'forest', type: 'u8', nodata: 0, unit: 'type (d1-forest-rock legend)' },
  { name: 'canopy', type: 'u8', nodata: 0, unit: 'dm' },
  { name: 'cover', type: 'u8', nodata: 0, unit: '%' },
  { name: 'rock', type: 'u8', nodata: 0, unit: 'unit (d1-forest-rock legend)' },
  { name: 'cliff', type: 'u8', nodata: 0, unit: '(class << 6) | strength' },
  { name: 'stone', type: 'u8', nodata: 255, unit: '254 sqrt(cover fraction)' },
  { name: 'secchi', type: 'u8', nodata: 0, unit: 'byte / 10 m' },
  { name: 'cdom', type: 'u8', nodata: 0, unit: 'byte / 20 per m' },
];
export const V4_FIELDS = ['height', 'lake', 'sdist', 'level', ...V4_CHANNELS.map((c) => c.name)];
// the thresholds of the cliff byte (d1-lidar's suggestions, checked against Lake One: of its land, boulder 5.7 %,
// talus 4.3 %, face 0.5 %)
export const CLIFF = { face: { slope: 50, relief: 30 }, talus: { slope: 30, rough: 30 }, boulder: { rough: 25 } };
export const FILL = 10; // cells: how far a land cell LANDFIRE calls water looks for its forest
export const BLEND = 80; // metres inside the LiDAR's edge over which its heights take over from 3DEP
export const COVER_STEP = 5; // % : cover is kept in 5 % steps (24 -> 16 MB of the release)

const CORE = 256;

// the product's grid must be the bake's (the bwca box): its manifest says
function fits(dir, grid) {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')), g = m.grid || {};
    return g.width === grid.width && g.height === grid.height && g.originX === grid.originX && g.originZ === grid.originZ && (g.tile || CORE) === CORE;
  } catch { return false; }
}

// one channel of one tile, or null
function readTile(dir, tx, ty, ch, Type) {
  const f = path.join(dir, `${tx}_${ty}.${ch}.bin`);
  if (!fs.existsSync(f)) return null;
  const raw = zlib.gunzipSync(fs.readFileSync(f));
  if (raw.byteLength !== CORE * CORE * Type.BYTES_PER_ELEMENT) throw new Error(`${f}: ${raw.byteLength} bytes`);
  return new Type(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));
}

// every tile of a product's channels into whole-grid arrays: { name: [Type, nodata] } -> { name: array }
function readProduct(dir, grid, chans, log) {
  const W = grid.width, out = {};
  for (const [name, [Type, nodata]] of Object.entries(chans)) out[name] = new Type(grid.width * grid.height).fill(nodata);
  let tiles = 0;
  for (let ty = 0; ty < grid.height / CORE; ty++) for (let tx = 0; tx < grid.width / CORE; tx++) {
    let any = false;
    for (const [name, [Type]] of Object.entries(chans)) {
      const t = readTile(dir, tx, ty, name, Type);
      if (!t) continue;
      any = true;
      const a = out[name];
      for (let r = 0; r < CORE; r++) a.set(t.subarray(r * CORE, (r + 1) * CORE), (ty * CORE + r) * W + tx * CORE);
    }
    if (any) tiles++;
  }
  log(`  ${path.basename(dir)}: ${tiles} tiles of ${Object.keys(chans).join(', ')}`);
  return out;
}

// The products on the bake's grid, or null when none fit. lidar: { h, lvl (Int16 dm), mask, slope, cliff (u8) } or
// null; the rest as their channels.
export function loadProducts(grid, cacheDir, log = console.log) {
  const dirs = Object.fromEntries(['lidar', 'ground', 'forest-rock', 'lake-colour'].map((s) => [s, path.join(cacheDir, s)]));
  const ok = Object.fromEntries(Object.entries(dirs).map(([s, d]) => [s, fits(d, grid)]));
  if (!Object.values(ok).some(Boolean)) { log('d2 bake: no round-D1 products fit this grid: 3DEP heights and no v4 channels'); return null; }
  for (const [s, v] of Object.entries(ok)) if (!v) log(`d2 bake: ${s} has no products for this grid; its channels stay at nodata`);
  const t0 = Date.now();
  const N = grid.width * grid.height, U8 = Uint8Array, I16 = Int16Array;
  const P = { lidar: null };
  if (ok.lidar) {
    const L = readProduct(dirs.lidar, grid, { height: [I16, -32768], level: [I16, -32768], mask: [U8, 0], slope: [U8, 255], relief: [U8, 255], rough: [U8, 255] }, log);
    // the combined cliff byte (see the head of this file); slope, relief and rough are let go after it
    const cliff = new U8(N);
    const counts = [0, 0, 0, 0];
    for (let k = 0; k < N; k++) {
      const m = L.mask[k];
      if ((m & 17) !== 17) continue;
      const s = L.slope[k], r = L.relief[k], g = L.rough[k];
      let c = 1;
      if (!(m & 2) && s !== 255) {
        if (s >= CLIFF.face.slope && r !== 255 && r >= CLIFF.face.relief) c = (3 << 6) | Math.min(63, Math.round(r / 10));
        else if (s >= CLIFF.talus.slope && g !== 255 && g >= CLIFF.talus.rough) c = (2 << 6) | Math.min(63, Math.round(g / 4));
        else if (s < CLIFF.talus.slope && g !== 255 && g >= CLIFF.boulder.rough) c = (1 << 6) | Math.min(63, Math.round(g / 4));
      }
      cliff[k] = c;
      counts[c >> 6]++;
    }
    log(`  cliff byte: ${counts[1]} boulder, ${counts[2]} talus or ledge, ${counts[3]} face cells`);
    P.lidar = { h: L.height, lvl: L.level, mask: L.mask, slope: L.slope, cliff };
  }
  if (ok.ground) Object.assign(P, prefix('g', readProduct(dirs.ground, grid, { kind: [U8, 0], stone: [U8, 255], rock: [U8, 255] }, log)));
  if (ok['forest-rock']) Object.assign(P, prefix('f', readProduct(dirs['forest-rock'], grid, { forest: [U8, 0], height: [U8, 255], cover: [U8, 255], rock: [U8, 0], bare: [U8, 0] }, log)));
  if (ok['lake-colour']) Object.assign(P, prefix('c', readProduct(dirs['lake-colour'], grid, { secchi: [U8, 0], cdom: [U8, 0] }, log)));
  P.colourTable = ok['lake-colour'] ? readColourTable(dirs['lake-colour']) : null;
  P.citations = {};
  for (const [s, d] of Object.entries(dirs)) if (ok[s]) { try { const m = JSON.parse(fs.readFileSync(path.join(d, 'manifest.json'), 'utf8')); P.citations[s] = m.citation || m.source || null; } catch {} }
  log(`d2 bake: round-D1 products read in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  return P;
}
const prefix = (p, o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [p + k[0].toUpperCase() + k.slice(1), v]));

// d1-quetico-lakes' per-polygon colour table, keyed by osm id
function readColourTable(dir) {
  const f = fs.readdirSync(dir).find((n) => /^lake-colour-.*\.json$/.test(n));
  if (!f) return null;
  const t = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  return new Map((t.lakes || []).map((l) => [l.osm, l]));
}

// how far inside the LiDAR each cell lies, as a 0-255 weight that ramps up over BLEND metres from its edge (a
// two-pass 3-4 chamfer distance, clamped): the LiDAR is used where mask & 17 (LiDAR, US side) and its height is valid
export function lidarWeight(grid, lidar) {
  const W = grid.width, H = grid.height, N = W * H, cap = Math.ceil(BLEND / grid.cell) * 3 + 3;
  const d = new Uint16Array(N);
  for (let k = 0; k < N; k++) d[k] = (lidar.mask[k] & 17) === 17 && lidar.h[k] !== -32768 ? cap : 0;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i;
    if (!d[k]) continue;
    let v = d[k];
    if (i > 0) v = Math.min(v, d[k - 1] + 3);
    if (j > 0) { v = Math.min(v, d[k - W] + 3); if (i > 0) v = Math.min(v, d[k - W - 1] + 4); if (i < W - 1) v = Math.min(v, d[k - W + 1] + 4); }
    d[k] = v;
  }
  for (let j = H - 1; j >= 0; j--) for (let i = W - 1; i >= 0; i--) {
    const k = j * W + i;
    if (!d[k]) continue;
    let v = d[k];
    if (i < W - 1) v = Math.min(v, d[k + 1] + 3);
    if (j < H - 1) { v = Math.min(v, d[k + W] + 3); if (i < W - 1) v = Math.min(v, d[k + W + 1] + 4); if (i > 0) v = Math.min(v, d[k + W - 1] + 4); }
    d[k] = v;
  }
  const w = new Uint8Array(N);
  for (let k = 0; k < N; k++) {
    if (!d[k]) continue;
    const m = ((d[k] / 3) - 0.5) * grid.cell, t = Math.max(0, Math.min(1, m / BLEND));
    w[k] = Math.round(255 * t * t * (3 - 2 * t)) || 1;
  }
  return w;
}

// The final per-cell channels on the whole grid (u8 each, V4_CHANNELS order), once the bake knows its water.
// lakeId: the bake's polygon ids; lakeColour(id) -> { secchi, cdom } or null (the polygon's table values).
export function makeChannels(grid, P, lakeId, lakeColour, log = console.log) {
  const W = grid.width, H = grid.height, N = W * H, U8 = Uint8Array;
  const ch = Object.fromEntries(V4_CHANNELS.map((c) => [c.name, new U8(N).fill(c.nodata)]));
  const stats = { bare: 0, pondsOnLand: 0, forestFilled: 0, forestLeft: 0, colourFromTable: 0, colourFromTile: 0 };
  // ground
  if (P.gKind) {
    const g = ch.ground, K = P.gKind, B = P.fBare;
    for (let k = 0; k < N; k++) {
      let v = K[k];
      if (B && B[k] && (v <= 1 || v === 11)) { v = 10; stats.bare++; }
      if (lakeId[k]) v = v === 8 || v === 9 ? v : v ? 13 : 0;
      else if (v === 13) stats.pondsOnLand++;
      g[k] = v;
    }
  }
  if (P.gStone) ch.stone.set(P.gStone);
  // forest, canopy and cover together; a land cell LANDFIRE has as water or nothing takes its nearest land cell's
  if (P.fForest) {
    const F = P.fForest, Hh = P.fHeight, C = P.fCover, f = ch.forest, ca = ch.canopy, co = ch.cover;
    const from = new Int32Array(N).fill(-1);
    const queue = new Int32Array(N);
    let head = 0, tail = 0;
    for (let k = 0; k < N; k++) {
      if (lakeId[k]) { f[k] = 1; continue; }
      if (F[k] >= 2) { from[k] = k; queue[tail++] = k; }
    }
    const reach = new Uint8Array(N);
    while (head < tail) {
      const k = queue[head++], x = k % W, r = reach[k];
      if (r >= FILL) continue;
      const nb = [x > 0 ? k - 1 : -1, x < W - 1 ? k + 1 : -1, k >= W ? k - W : -1, k + W < N ? k + W : -1];
      for (const q of nb) if (q >= 0 && from[q] < 0 && !lakeId[q] && F[q] < 2) { from[q] = from[k]; reach[q] = r + 1; queue[tail++] = q; }
    }
    for (let k = 0; k < N; k++) {
      if (lakeId[k]) continue;
      const s = from[k];
      if (s < 0) { f[k] = F[k]; if (F[k] < 2) stats.forestLeft++; continue; }
      if (s !== k) stats.forestFilled++;
      f[k] = F[s];
      ca[k] = Hh[s] === 255 ? 0 : Hh[s];
      co[k] = C[s] === 255 ? 0 : Math.round(C[s] / COVER_STEP) * COVER_STEP;
    }
  }
  if (P.fRock) ch.rock.set(P.fRock);
  // the cliff byte: water reads "nothing" where the LiDAR covers it
  if (P.lidar) {
    const c = ch.cliff, L = P.lidar.cliff;
    for (let k = 0; k < N; k++) c[k] = lakeId[k] ? (L[k] ? 1 : 0) : L[k];
  }
  // the water's colour, on the bake's water only
  {
    const S = P.cSecchi, D = P.cCdom, s = ch.secchi, d = ch.cdom;
    const byte = (v, q) => Math.max(1, Math.min(255, Math.round(v * q)));
    const memo = new Map();
    for (let k = 0; k < N; k++) {
      const id = lakeId[k];
      if (!id) continue;
      if (S && S[k] && D[k]) { s[k] = S[k]; d[k] = D[k]; stats.colourFromTile++; continue; }
      let c = memo.get(id);
      if (c === undefined) { const r = lakeColour(id); c = r && r.secchi > 0 && r.cdom > 0 ? [byte(r.secchi, 10), byte(r.cdom, 20)] : null; memo.set(id, c); }
      if (c) { s[k] = S && S[k] ? S[k] : c[0]; d[k] = D && D[k] ? D[k] : c[1]; stats.colourFromTable++; }
    }
  }
  log(`d2 bake: channels made: ${JSON.stringify(stats)}`);
  return { ch, stats };
}

// the median of the LiDAR's water level over each basin's cells (where mask & 17 and level is valid), in metres, or
// NaN for a basin with fewer than `min` such cells
export function lidarBasinLevels(N, basin, nb, lidar, min = 8) {
  const count = new Int32Array(nb + 1);
  const ok = (k) => basin[k] >= 0 && (lidar.mask[k] & 17) === 17 && lidar.lvl[k] !== -32768;
  for (let k = 0; k < N; k++) if (ok(k)) count[basin[k] + 1]++;
  for (let b = 0; b < nb; b++) count[b + 1] += count[b];
  const fill = new Int32Array(nb), samples = new Int16Array(count[nb]);
  for (let k = 0; k < N; k++) if (ok(k)) { const b = basin[k]; samples[count[b] + fill[b]++] = lidar.lvl[k]; }
  const out = new Float32Array(nb).fill(NaN), cells = new Int32Array(nb);
  for (let b = 0; b < nb; b++) {
    const seg = samples.subarray(count[b], count[b + 1]);
    cells[b] = seg.length;
    if (seg.length < min) continue;
    seg.sort();
    const m = seg.length >> 1;
    out[b] = (seg.length & 1 ? seg[m] : (seg[m - 1] + seg[m]) / 2) / 10;
  }
  return { level: out, cells };
}

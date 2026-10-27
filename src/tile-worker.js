// Build worker: fetches and decodes one tile, then builds its terrain, far water, forest and lake vegetation
// placement and its ground-cover map as transferable typed arrays. The main thread only wraps them into
// three.js objects.
import { TileGrid } from './grid.js';
import { buildTerrainChunk } from './terrain-build.js';
import { buildWaterChunk } from './water-build.js';
import { placeVegetation, placeAquatic, coverField, COVER_SPLAT_AT, REGION } from './placement.js';
import { hash2 } from './rng.js';
import { Site } from './site.js';
import { gradeTile, gradeAhead } from './water-levels.js'; // p2 B: creek and river levels graded (water-levels.js; round A join: its pieces asked for with the tile)
import { bowlTile } from './lake-facts.js'; // d1 lakes: the DNR's depth for the lakes with no contour map
import { patchTile, lakeRockBins, clearPlants, useV4 as rapidsV4 } from './rapids.js'; // d1 rapids: the real falls and rapids, the rocks in the lakes
import { unpackTint, setLand } from './land.js'; // d2 land: the rocks' bedrock tint; `?land=off`
import { loadBurns, setBurnDate } from './burns.js';

let cfg = null;
// the real burns (burns.js): the table read once, as the worker starts; each build waits for it and then takes the
// season's date its message carries (tiles.js), after its last await, so no other build can move the date under it
let burns = null;
const burnDate = (m) => { if (m.date) setBurnDate(m.date[0], m.date[1]); };

async function fetchTile(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
  const body = res.body.pipeThrough(new DecompressionStream('gzip'));
  return new Response(body).arrayBuffer();
}

// stride floats per instance (x, y, z, yaw, scale[, tint, squash[, azimuth, tilt, tall]], placement.js STRIDE)
// -> a 4x4 column-major matrix per instance, T * Ry(azimuth) * Rz(tilt) * Ry(yaw) * S (the rocks lean: a slanted
// group shares one azimuth and tilt, the flats follow the slope; a rock's height is its scale times `tall`),
// plus an rgb tint when the stride carries one. Every column keeps its axis's scale as its length (tiles.js
// and props.js read the footprint from it).
const _rgb = [1, 1, 1], ROCK_SP = new Set([6, 16, 20, 21]); // (d2 land: the rock species, placement.js ROCKS)
function instanceData(items, stride, rx, rz, sp = -1) {
  const count = items.length / stride;
  const m = new Float32Array(count * 16), c = stride > 5 ? new Float32Array(count * 3) : null;
  // the instances' extent and their largest scale, so the main thread can bound a bin without walking it
  const bounds = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity, 0];
  for (let n = 0; n < count; n++) {
    const o = n * stride, x = items[o], y = items[o + 1], z = items[o + 2], yaw = items[o + 3], sc = items[o + 4];
    const sq = stride > 6 ? items[o + 6] : 1, az = stride > 8 ? items[o + 7] : 0, tl = stride > 8 ? items[o + 8] : 0, tall = stride > 9 ? items[o + 9] : 1;
    const sx = sc * sq, sy = sc * tall, sz = sc * (2 - sq), cy = Math.cos(yaw), sny = Math.sin(yaw);
    const ca = Math.cos(az), sa = Math.sin(az), ct = Math.cos(tl), st = Math.sin(tl);
    // A = Ry(az) * Rz(tl), rows; R = A * Ry(yaw)
    const a00 = ca * ct, a01 = -ca * st, a02 = sa, a10 = st, a11 = ct, a20 = -sa * ct, a21 = sa * st, a22 = ca;
    const e = n * 16;
    m[e] = (a00 * cy - a02 * sny) * sx; m[e + 1] = a10 * cy * sx; m[e + 2] = (a20 * cy - a22 * sny) * sx; m[e + 3] = 0;
    m[e + 4] = a01 * sy; m[e + 5] = a11 * sy; m[e + 6] = a21 * sy; m[e + 7] = 0;
    m[e + 8] = (a00 * sny + a02 * cy) * sz; m[e + 9] = a10 * sny * sz; m[e + 10] = (a20 * sny + a22 * cy) * sz; m[e + 11] = 0;
    m[e + 12] = x; m[e + 13] = y; m[e + 14] = z; m[e + 15] = 1;
    if (x < bounds[0]) bounds[0] = x; if (y < bounds[1]) bounds[1] = y; if (z < bounds[2]) bounds[2] = z;
    if (x > bounds[3]) bounds[3] = x; if (y > bounds[4]) bounds[4] = y; if (z > bounds[5]) bounds[5] = z;
    const sMax = Math.max(Math.abs(sx), Math.abs(sy), Math.abs(sz));
    if (sMax > bounds[6]) bounds[6] = sMax;
    // (a burned trunk's char rides in the tint as whole fours over it, placement.js scorchTint: kept in the blue for the bark;
    // d2 land: a rock's carries its bedrock unit the same way, land.js UNIT_TAG, unpacked here into the unit's colour)
    if (c && ROCK_SP.has(sp)) { unpackTint(items[o + 5], _rgb); c[n * 3] = _rgb[0]; c[n * 3 + 1] = _rgb[1] * (0.97 + hash2(n, rx * 131 + rz, 2) * 0.06); c[n * 3 + 2] = _rgb[2]; }
    else if (c) { const t0 = items[o + 5], k = Math.floor(t0 / 4), tint = t0 - 4 * k; c[n * 3] = tint; c[n * 3 + 1] = tint * (0.97 + hash2(n, rx * 131 + rz, 2) * 0.06); c[n * 3 + 2] = t0; }
  }
  return { count, matrices: m, colors: c, bounds };
}

// What the walker is held off (tiles.js treesNear), built here so a tile's first query costs the main thread
// nothing: the trunks as circles, and the solids (the boulders, the outcrops, the scree, the cliff modules of the
// bluffs, the down logs and the stumps) with what the main thread needs to stand their own drawn geometry where they
// are. Each list is sorted into CELL m cells over the tile with a start index per cell (a cell's items are start[c] ..
// start[c + 1]).
//   trunks     x, z (tile-local), a first radius from the scale (tiles.js measures the drawn one: trunkMeta)
//   trunkMeta  per trunk: the instance's y, its height scale, its mean horizontal scale, its geometry key
//   rocks      the solids: x, y, z (the instance's origin, tile-local), R (its reach round the origin, over the
//              ground), its geometry key, sp, then the instance matrix's three columns (9 floats)
// A geometry key is the bin's index in this tile's list times 64 plus the variant group: tiles.js reads the geometry
// that group of that bin is drawn with (vegetation.js makeVegetationMeshes), so the collision is always the drawn
// shape whatever variant the bin picked.
const COLLIDE_CELL = 16, ROCK_STRIDE_C = 15, TRUNK_META = 4;
const NOT_TRUNKS = new Set([6, 7, 10, 11, 12, 13, 14, 15, 16, 20, 21, 22]); // vegetation.js NOT_TRUNKS and the solids
// the solids and their geometry's reach from the origin over the ground at unit scale (rocks.js FOOT, vegetation.js
// outcrop, log, stump; rocks.js screeBlock; the cliff module is reached by its own frame below)
const SOLID_REACH = { 6: 1.7, 14: 3.75, 15: 1.1, 16: 2.0, 20: 1.0, 21: 0 };
function collisionOf(bins, size) {
  const n = Math.ceil(size / COLLIDE_CELL), N = n * n;
  const trunks = [], rocks = [];
  let maxR = 0;
  bins.forEach((b, bi) => {
    const m = b.matrices, count = b.count, reach = SOLID_REACH[b.sp];
    const groups = b.groups && b.groups.length ? b.groups : [count];
    if (reach !== undefined) {
      for (let g = 0, i = 0; g < groups.length; g++) for (let k = 0; k < groups[g]; k++, i++) {
        const e = i * 16, sx = Math.hypot(m[e], m[e + 1], m[e + 2]), sz = Math.hypot(m[e + 8], m[e + 9], m[e + 10]);
        if (sx < 0.05) continue; // the empty rock a one-family bin carries in group 0 (placement.js)
        if (b.sp === 20 && Math.max(sx, sz) < 0.25) continue; // a pebble of scree: below any step
        // a cliff module: its face along x across [-0.5, 0.5] at z = 0, reaching back into the hill to z = 1 (cliffs.js)
        const R = b.sp === 21 ? Math.hypot(0.55 * sx, 1.05 * sz) : reach * Math.max(sx, sz);
        maxR = Math.max(maxR, R);
        rocks.push([m[e + 12], m[e + 13], m[e + 14], R, bi * 64 + g, b.sp, m[e], m[e + 1], m[e + 2], m[e + 4], m[e + 5], m[e + 6], m[e + 8], m[e + 9], m[e + 10]]);
      }
    } else if (!NOT_TRUNKS.has(b.sp)) {
      for (let g = 0, i = 0; g < groups.length; g++) for (let k = 0; k < groups[g]; k++, i++) {
        const e = i * 16, sx = Math.hypot(m[e], m[e + 1], m[e + 2]), sz = Math.hypot(m[e + 8], m[e + 9], m[e + 10]);
        if (sx < 1e-6) continue;
        trunks.push([m[e + 12], m[e + 14], 0.12 + 0.14 * sx, m[e + 13], Math.hypot(m[e + 4], m[e + 5], m[e + 6]), (sx + sz) / 2, bi * 64 + g]);
      }
    }
  });
  const cellOf = (x, z) => Math.min(n - 1, Math.max(0, Math.floor(z / COLLIDE_CELL))) * n + Math.min(n - 1, Math.max(0, Math.floor(x / COLLIDE_CELL)));
  // records into cells: the start of each cell and the records in cell order (x at k, z at kz of each record)
  const sort = (recs, kz) => {
    const count = recs.length, start = new Uint32Array(N + 1), cells = new Uint32Array(count);
    for (let i = 0; i < count; i++) { cells[i] = cellOf(recs[i][0], recs[i][kz]); start[cells[i] + 1]++; }
    for (let c = 0; c < N; c++) start[c + 1] += start[c];
    const fill = start.slice(0, N), order = new Uint32Array(count);
    for (let i = 0; i < count; i++) order[fill[cells[i]]++] = i;
    return { start, order };
  };
  const t = sort(trunks, 1), nt = trunks.length;
  const trunkArr = new Float32Array(nt * 3), meta = new Float32Array(nt * TRUNK_META);
  for (let j = 0; j < nt; j++) {
    const q = trunks[t.order[j]];
    trunkArr[j * 3] = q[0]; trunkArr[j * 3 + 1] = q[1]; trunkArr[j * 3 + 2] = q[2];
    meta[j * TRUNK_META] = q[3]; meta[j * TRUNK_META + 1] = q[4]; meta[j * TRUNK_META + 2] = q[5]; meta[j * TRUNK_META + 3] = q[6];
  }
  const r = sort(rocks, 2), rockArr = new Float32Array(rocks.length * ROCK_STRIDE_C);
  for (let j = 0; j < rocks.length; j++) rockArr.set(rocks[r.order[j]], j * ROCK_STRIDE_C);
  return { cell: COLLIDE_CELL, n, maxR, trunks: trunkArr, trunkMeta: meta, trunkStart: t.start, rocks: rockArr, rockStart: r.start };
}

// the typed arrays of a terrain chunk (terrain-build.js), handed over rather than copied
const terrainBuffers = (t) => [t.pos.buffer, t.nrm.buffer, t.splatA.buffer, t.splatB.buffer, t.splatC.buffer, t.floor.buffer, t.idx.buffer, ...(t.parts ? [t.parts.buffer] : []), ...(t.land ? [t.land.buffer] : [])];

// round A-C: a fine tile's terrain is one mesh of ~200 000 triangles, so a view, a mirror or a shadow cascade that
// touched any corner of it drew all of it (a 300 m cascade drew three whole tiles, 1.1 M triangles). Its triangles
// are put in order here by the PARTS x PARTS block of the tile their middle lies in, the blocks along a Morton curve
// (so each quarter of the tile, each 2 x 2 of blocks, is one run of the index too), and `parts` lists each block's
// run and a box round it: [start, count, x0, y0, z0, x1, y1, z1] (tile-local), so tiles.js can draw a block or a
// quarter as a mesh of its own over the same arrays and three culls them one by one. Same triangles, same arrays;
// MeshGround and the props read the index in any order.
const PARTS = 4, STRIDE = 8;
const MORTON = (() => { const m = new Uint8Array(PARTS * PARTS); for (let j = 0; j < PARTS; j++) for (let i = 0; i < PARTS; i++) { let k = 0; for (let b = 0; b < 4; b++) k |= (((i >> b) & 1) << (2 * b)) | (((j >> b) & 1) << (2 * b + 1)); m[j * PARTS + i] = k; } return m; })();
function grow(lo, hi, o, P, v) {
  for (let d = 0; d < 3; d++) { const p = P[v + d]; if (p < lo[o + d]) lo[o + d] = p; if (p > hi[o + d]) hi[o + d] = p; }
}
function partTerrain(t, size) {
  const I = t.idx, P = t.pos, nt = I.length / 3, cs = size / PARTS, nb = PARTS * PARTS;
  const block = new Uint8Array(nt), count = new Int32Array(nb);
  const lo = new Float32Array(nb * 3).fill(Infinity), hi = new Float32Array(nb * 3).fill(-Infinity);
  for (let k = 0; k < nt; k++) {
    const a = I[k * 3] * 3, b = I[k * 3 + 1] * 3, c = I[k * 3 + 2] * 3;
    const x = (P[a] + P[b] + P[c]) / 3, z = (P[a + 2] + P[b + 2] + P[c + 2]) / 3;
    const q = MORTON[Math.min(PARTS - 1, Math.max(0, Math.floor(z / cs))) * PARTS + Math.min(PARTS - 1, Math.max(0, Math.floor(x / cs)))];
    block[k] = q; count[q]++;
    grow(lo, hi, q * 3, P, a); grow(lo, hi, q * 3, P, b); grow(lo, hi, q * 3, P, c);
  }
  const at = new Int32Array(nb);
  for (let q = 1; q < nb; q++) at[q] = at[q - 1] + count[q - 1] * 3;
  const parts = new Float32Array(nb * STRIDE), out = new I.constructor(I.length), fill = at.slice();
  for (let k = 0; k < nt; k++) { const o = fill[block[k]]; out[o] = I[k * 3]; out[o + 1] = I[k * 3 + 1]; out[o + 2] = I[k * 3 + 2]; fill[block[k]] += 3; }
  for (let q = 0; q < nb; q++) {
    parts.set(count[q] ? [at[q], count[q] * 3, lo[q * 3], lo[q * 3 + 1], lo[q * 3 + 2], hi[q * 3], hi[q * 3 + 1], hi[q * 3 + 2]] : [at[q], 0, 0, 0, 0, 0, 0, 0], q * STRIDE);
  }
  t.idx = out; t.parts = parts;
  return t;
}

// d2 bake: a v4 release grades its rivers and makes its drops in the bake (no water-grade.bin pieces asked for)
const v4 = () => !!(cfg && cfg.grid && cfg.grid.format >= 4);

async function buildFine(m) {
  const g = cfg.grid;
  if (!v4()) gradeAhead('fine', m.tx, m.ty);
  const buf = await fetchTile(m.url);
  if (!v4()) await gradeTile(buf, 'fine', m.tx, m.ty, cfg.grid); // p2 B
  await burns; burnDate(m);
  bowlTile(buf, 'fine', cfg.grid, cfg.bowlById); // d1 lakes
  const grid = new TileGrid({ cell: g.cell, originX: g.originX, originZ: g.originZ, tile: g.tile, halo: g.halo, fields: g.fields }, m.tx, m.ty, buf, cfg.levelById, cfg.clarityById); // (d2 bake: fields, the v4 channels)
  const i0 = m.tx * g.tile, j0 = m.ty * g.tile;
  const ox = g.originX + i0 * g.cell, oz = g.originZ + j0 * g.cell;
  patchTile(buf, m.tx, m.ty, g); // d1 rapids: each drop where it really is, the rocks' shoals (the grid's arrays view buf)
  // what the ground is like at every cell (cliffs, scree, ridges, wet ground, soil): the paint, the forest, the
  // rocks and the cliffs all read it
  const site = new Site(grid, cfg.exclusions);
  const veg = placeVegetation(grid, i0, j0, g.tile, { seed: cfg.seed, exclusions: cfg.exclusions, originX: ox, originZ: oz, site });
  veg.bins.push(...lakeRockBins(grid, i0, j0, g.tile, ox, oz)); // d1 rapids: NHD's rocks above the water, as boulders
  const aquatic = placeAquatic(grid, i0, j0, g.tile, { seed: cfg.seed, originX: ox, originZ: oz, site, rice: cfg.riceById }); // (d1 lakes: rice by lake)
  clearPlants(aquatic.bins, ox, oz); // d1 rapids: no pads or reeds where the water falls or boils
  // the cover map, its splat part filled by the terrain build: each cell the weights of its centre vertex, so the
  // grass blends what the ground there is drawn with (placement.js coverField, groundcover.js)
  const cover = coverField(grid, i0, j0, g.tile, veg.shade, cfg.exclusions, site);
  const cellSplat = cover.subarray(COVER_SPLAT_AT(grid.side));
  const terrain = partTerrain(buildTerrainChunk(grid, i0, j0, g.tile, { shade: veg.shade, fine: true, originX: ox, originZ: oz, site, cellSplat }), g.tile * g.cell); // round A-C
  const water = buildWaterChunk(grid, i0, j0, g.tile, ox, oz);
  const binCentre = (b, size = REGION) => ({ cx: g.originX + (b.rx + 0.5) * size, cz: g.originZ + (b.rz + 0.5) * size });
  const bins = veg.bins.map((b) => ({ rx: b.rx, rz: b.rz, sp: b.sp, size: b.size, groups: b.groups, ...(b.style !== undefined ? { style: b.style } : {}), ...binCentre(b, b.size), ...instanceData(b.items, b.stride, b.rx, b.rz, b.sp) })); // (d2 land: a cliff bin's family; the rocks' tint by species)
  const abins = aquatic.bins.map((b) => ({ rx: b.rx, rz: b.rz, kind: b.kind, variant: b.variant, ...binCentre(b), ...instanceData(b.items, 5, b.rx, b.rz) }));
  const collide = collisionOf(bins, g.tile * g.cell);
  const transfer = [buf, cover.buffer, ...terrainBuffers(terrain), collide.trunks.buffer, collide.trunkMeta.buffer, collide.trunkStart.buffer, collide.rocks.buffer, collide.rockStart.buffer];
  if (water) transfer.push(water.pos.buffer, water.shore.buffer, water.depth.buffer, water.clarity.buffer, water.idx.buffer);
  for (const b of bins) transfer.push(b.matrices.buffer, b.colors.buffer);
  for (const b of abins) transfer.push(b.matrices.buffer);
  return { msg: { type: 'built', key: m.key, level: 'fine', tx: m.tx, ty: m.ty, data: buf, cover, terrain, water, veg: bins, aquatic: abins, collide, trees: veg.total, plants: aquatic.total }, transfer };
}

// A far tile covers 8 x 8 fine tiles; it is cut into chunks with the footprint of one fine tile each so a
// chunk can be hidden as soon as the fine tile under it is in.
async function buildFar(m) {
  const g = cfg.grid, f = g.far;
  if (!v4()) gradeAhead('far', m.fx, m.fy);
  const buf = await fetchTile(m.url);
  if (!v4()) await gradeTile(buf, 'far', m.fx, m.fy, cfg.grid); // p2 B
  await burns; burnDate(m);
  bowlTile(buf, 'far', cfg.grid, cfg.bowlById); // d1 lakes
  const desc = { cell: g.cell * f.factor, originX: g.originX, originZ: g.originZ, tile: f.tile, halo: f.halo };
  const grid = new TileGrid(desc, m.fx, m.fy, buf, cfg.levelById, cfg.clarityById);
  const per = g.tile / f.factor; // far cells per fine tile
  const chunks = [], transfer = [buf];
  for (let cy = 0; cy < f.tile / per; cy++) for (let cx = 0; cx < f.tile / per; cx++) {
    const tx = m.fx * (f.tile / per) + cx, ty = m.fy * (f.tile / per) + cy;
    if (tx >= g.ntx || ty >= g.nty) continue;
    const i0 = m.fx * f.tile + cx * per, j0 = m.fy * f.tile + cy * per;
    const ox = g.originX + tx * g.tile * g.cell, oz = g.originZ + ty * g.tile * g.cell;
    const terrain = buildTerrainChunk(grid, i0, j0, per, { fine: false, originX: ox, originZ: oz });
    const water = buildWaterChunk(grid, i0, j0, per, ox, oz);
    chunks.push({ tx, ty, terrain, water });
    transfer.push(...terrainBuffers(terrain));
    if (water) transfer.push(water.pos.buffer, water.shore.buffer, water.depth.buffer, water.clarity.buffer, water.idx.buffer);
  }
  return { msg: { type: 'built', key: m.key, level: 'far', fx: m.fx, fy: m.fy, data: buf, chunks }, transfer };
}

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'init') { cfg = m; if (v4()) rapidsV4(); setLand(m.land !== false); burns = loadBurns(); return; } // (d2 bake: the v4 release's drops; d2 land: ?land=off)
  if (m.type !== 'build') return;
  try {
    const r = m.level === 'far' ? await buildFar(m) : await buildFine(m);
    self.postMessage(r.msg, r.transfer);
  } catch (err) {
    self.postMessage({ type: 'error', key: m.key, error: String((err && err.message) || err) });
  }
};

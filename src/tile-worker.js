// Build worker: fetches and decodes one tile, then builds its terrain, far water, forest and lake vegetation
// placement and its ground-cover map as transferable typed arrays. The main thread only wraps them into
// three.js objects.
import { TileGrid } from './grid.js';
import { buildTerrainChunk } from './terrain-build.js';
import { buildWaterChunk } from './water-build.js';
import { placeVegetation, placeAquatic, coverField, COVER_SPLAT_AT, REGION } from './placement.js';
import { hash2 } from './rng.js';
import { Site } from './site.js';

let cfg = null;

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
function instanceData(items, stride, rx, rz) {
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
    if (c) { const tint = items[o + 5]; c[n * 3] = tint; c[n * 3 + 1] = tint * (0.97 + hash2(n, rx * 131 + rz, 2) * 0.06); c[n * 3 + 2] = tint; }
  }
  return { count, matrices: m, colors: c, bounds };
}

// What the walker is held off (tiles.js treesNear), built here so a tile's first query costs the main thread
// nothing: the trunks as circles and the rocks (the boulder species, and the outcrops) with what the main thread
// needs to stand their own geometry where they are drawn. Each list is sorted into CELL m cells over the tile with
// a start index per cell (a cell's items are start[c] .. start[c + 1]).
//   trunks  x, z (tile-local), radius
//   rocks   x, y, z (the instance's origin, tile-local), R (its reach round the origin, over the ground), variant
//           (the geometry: kit.variants[sp][variant]), sp, then the instance matrix's three columns (9 floats)
// A rock's variant is the one its bin's variant group draws (vegetation.js pickVariants: a rock bin's group g draws
// variant (base + g) mod n, base hashed from the region; keep in step).
const COLLIDE_CELL = 16, ROCK_STRIDE_C = 15;
const NOT_TRUNKS = new Set([6, 7, 10, 11, 12, 13, 14, 15, 16, 20, 21]); // vegetation.js NOT_TRUNKS and the rocks
const ROCK_VARIANTS = { 6: 9, 16: 6 };
const ROCK_REACH = { 6: 1.7, 16: 2.0 };   // the geometry's reach from its origin at unit scale (rocks.js FOOT; vegetation.js outcrop)
function collisionOf(bins, size) {
  const n = Math.ceil(size / COLLIDE_CELL), N = n * n;
  const trunks = [], rocks = [];
  let maxR = 0;
  for (const b of bins) {
    const m = b.matrices, count = b.count;
    if (ROCK_VARIANTS[b.sp]) {
      const nv = ROCK_VARIANTS[b.sp], base = Math.floor(hash2(b.rx * 7919 + b.rz, b.sp, 9) * nv);
      const groups = b.groups && b.groups.length ? b.groups : [count];
      for (let g = 0, i = 0; g < groups.length; g++) for (let k = 0; k < groups[g]; k++, i++) {
        const e = i * 16, sx = Math.hypot(m[e], m[e + 1], m[e + 2]), sz = Math.hypot(m[e + 8], m[e + 9], m[e + 10]);
        if (sx < 0.05) continue; // the empty rock a one-family bin carries in group 0 (placement.js)
        const R = ROCK_REACH[b.sp] * Math.max(sx, sz);
        maxR = Math.max(maxR, R);
        rocks.push([m[e + 12], m[e + 13], m[e + 14], R, (base + g) % nv, b.sp, m[e], m[e + 1], m[e + 2], m[e + 4], m[e + 5], m[e + 6], m[e + 8], m[e + 9], m[e + 10]]);
      }
    } else if (!NOT_TRUNKS.has(b.sp)) {
      for (let i = 0; i < count; i++) { const e = i * 16; trunks.push(m[e + 12], m[e + 14], 0.12 + 0.14 * Math.hypot(m[e], m[e + 1], m[e + 2])); }
    }
  }
  const cellOf = (x, z) => Math.min(n - 1, Math.max(0, Math.floor(z / COLLIDE_CELL))) * n + Math.min(n - 1, Math.max(0, Math.floor(x / COLLIDE_CELL)));
  const sort = (count, stride, get) => {
    const start = new Uint32Array(N + 1), cells = new Uint32Array(count);
    for (let i = 0; i < count; i++) { cells[i] = cellOf(get(i, 0), get(i, 1)); start[cells[i] + 1]++; }
    for (let c = 0; c < N; c++) start[c + 1] += start[c];
    const fill = start.slice(0, N), out = new Float32Array(count * stride);
    for (let i = 0; i < count; i++) { const o = fill[cells[i]]++ * stride; for (let k = 0; k < stride; k++) out[o + k] = get(i, k); }
    return { start, items: out };
  };
  const nt = trunks.length / 3, rockX = (i, k) => rocks[i][k === 1 ? 2 : k === 2 ? 1 : k];
  const t = sort(nt, 3, (i, k) => trunks[i * 3 + k]);
  // rocks: sorted by their xz (get's k 0 and 1 are x and z), then written in record order x, y, z, ...
  const r = sort(rocks.length, ROCK_STRIDE_C, (i, k) => (k < 3 ? rockX(i, k) : rocks[i][k]));
  for (let i = 0; i < rocks.length; i++) { const o = i * ROCK_STRIDE_C, z = r.items[o + 1]; r.items[o + 1] = r.items[o + 2]; r.items[o + 2] = z; }
  return { cell: COLLIDE_CELL, n, maxR, trunks: t.items, trunkStart: t.start, rocks: r.items, rockStart: r.start };
}

// the typed arrays of a terrain chunk (terrain-build.js), handed over rather than copied
const terrainBuffers = (t) => [t.pos.buffer, t.nrm.buffer, t.splatA.buffer, t.splatB.buffer, t.splatC.buffer, t.floor.buffer, t.idx.buffer];

async function buildFine(m) {
  const g = cfg.grid;
  const buf = await fetchTile(m.url);
  const grid = new TileGrid({ cell: g.cell, originX: g.originX, originZ: g.originZ, tile: g.tile, halo: g.halo }, m.tx, m.ty, buf, cfg.levelById, cfg.clarityById);
  const i0 = m.tx * g.tile, j0 = m.ty * g.tile;
  const ox = g.originX + i0 * g.cell, oz = g.originZ + j0 * g.cell;
  // what the ground is like at every cell (cliffs, scree, ridges, wet ground, soil): the paint, the forest, the
  // rocks and the cliffs all read it
  const site = new Site(grid, cfg.exclusions);
  const veg = placeVegetation(grid, i0, j0, g.tile, { seed: cfg.seed, exclusions: cfg.exclusions, originX: ox, originZ: oz, site });
  const aquatic = placeAquatic(grid, i0, j0, g.tile, { seed: cfg.seed, originX: ox, originZ: oz, site });
  // the cover map, its splat part filled by the terrain build: each cell the weights of its centre vertex, so the
  // grass blends what the ground there is drawn with (placement.js coverField, groundcover.js)
  const cover = coverField(grid, i0, j0, g.tile, veg.shade, cfg.exclusions, site);
  const cellSplat = cover.subarray(COVER_SPLAT_AT(grid.side));
  const terrain = buildTerrainChunk(grid, i0, j0, g.tile, { shade: veg.shade, fine: true, originX: ox, originZ: oz, site, cellSplat });
  const water = buildWaterChunk(grid, i0, j0, g.tile, ox, oz);
  const binCentre = (b, size = REGION) => ({ cx: g.originX + (b.rx + 0.5) * size, cz: g.originZ + (b.rz + 0.5) * size });
  const bins = veg.bins.map((b) => ({ rx: b.rx, rz: b.rz, sp: b.sp, size: b.size, groups: b.groups, ...binCentre(b, b.size), ...instanceData(b.items, b.stride, b.rx, b.rz) }));
  const abins = aquatic.bins.map((b) => ({ rx: b.rx, rz: b.rz, kind: b.kind, variant: b.variant, ...binCentre(b), ...instanceData(b.items, 5, b.rx, b.rz) }));
  const collide = collisionOf(bins, g.tile * g.cell);
  const transfer = [buf, cover.buffer, ...terrainBuffers(terrain), collide.trunks.buffer, collide.trunkStart.buffer, collide.rocks.buffer, collide.rockStart.buffer];
  if (water) transfer.push(water.pos.buffer, water.shore.buffer, water.depth.buffer, water.clarity.buffer, water.idx.buffer);
  for (const b of bins) transfer.push(b.matrices.buffer, b.colors.buffer);
  for (const b of abins) transfer.push(b.matrices.buffer);
  return { msg: { type: 'built', key: m.key, level: 'fine', tx: m.tx, ty: m.ty, data: buf, cover, terrain, water, veg: bins, aquatic: abins, collide, trees: veg.total, plants: aquatic.total }, transfer };
}

// A far tile covers 8 x 8 fine tiles; it is cut into chunks with the footprint of one fine tile each so a
// chunk can be hidden as soon as the fine tile under it is in.
async function buildFar(m) {
  const g = cfg.grid, f = g.far;
  const buf = await fetchTile(m.url);
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
  if (m.type === 'init') { cfg = m; return; }
  if (m.type !== 'build') return;
  try {
    const r = m.level === 'far' ? await buildFar(m) : await buildFine(m);
    self.postMessage(r.msg, r.transfer);
  } catch (err) {
    self.postMessage({ type: 'error', key: m.key, error: String((err && err.message) || err) });
  }
};

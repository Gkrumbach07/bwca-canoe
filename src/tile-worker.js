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
    if (c) { const tint = items[o + 5]; c[n * 3] = tint; c[n * 3 + 1] = tint * (0.97 + hash2(n, rx * 131 + rz, 2) * 0.06); c[n * 3 + 2] = tint; }
  }
  return { count, matrices: m, colors: c };
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
  const site = new Site(grid);
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
  const transfer = [buf, cover.buffer, ...terrainBuffers(terrain)];
  if (water) transfer.push(water.pos.buffer, water.shore.buffer, water.depth.buffer, water.clarity.buffer, water.idx.buffer);
  for (const b of bins) transfer.push(b.matrices.buffer, b.colors.buffer);
  for (const b of abins) transfer.push(b.matrices.buffer);
  return { msg: { type: 'built', key: m.key, level: 'fine', tx: m.tx, ty: m.ty, data: buf, cover, terrain, water, veg: bins, aquatic: abins, trees: veg.total, plants: aquatic.total }, transfer };
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

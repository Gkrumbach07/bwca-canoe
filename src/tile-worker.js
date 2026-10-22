// Build worker: fetches and decodes one tile, then builds its terrain, far water, forest and lake vegetation
// placement and its ground-cover map as transferable typed arrays. The main thread only wraps them into
// three.js objects.
import { TileGrid } from './grid.js';
import { buildTerrainChunk } from './terrain-build.js';
import { buildWaterChunk } from './water-build.js';
import { placeVegetation, placeAquatic, coverField, REGION } from './placement.js';
import { hash2 } from './rng.js';

let cfg = null;

async function fetchTile(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
  const body = res.body.pipeThrough(new DecompressionStream('gzip'));
  return new Response(body).arrayBuffer();
}

// stride floats per instance (x, y, z, yaw, scale[, tint, squash]) -> a 4x4 column-major matrix per
// instance plus an rgb tint when the stride carries one
function instanceData(items, stride, rx, rz) {
  const count = items.length / stride;
  const m = new Float32Array(count * 16), c = stride > 5 ? new Float32Array(count * 3) : null;
  for (let n = 0; n < count; n++) {
    const o = n * stride, x = items[o], y = items[o + 1], z = items[o + 2], yaw = items[o + 3], sc = items[o + 4];
    const sq = stride > 6 ? items[o + 6] : 1;
    const sx = sc * sq, sy = sc, sz = sc * (2 - sq), cs = Math.cos(yaw), sn = Math.sin(yaw);
    const e = n * 16;
    m[e] = cs * sx; m[e + 1] = 0; m[e + 2] = -sn * sx; m[e + 3] = 0;
    m[e + 4] = 0; m[e + 5] = sy; m[e + 6] = 0; m[e + 7] = 0;
    m[e + 8] = sn * sz; m[e + 9] = 0; m[e + 10] = cs * sz; m[e + 11] = 0;
    m[e + 12] = x; m[e + 13] = y; m[e + 14] = z; m[e + 15] = 1;
    if (c) { const tint = items[o + 5]; c[n * 3] = tint; c[n * 3 + 1] = tint * (0.97 + hash2(n, rx * 131 + rz, 2) * 0.06); c[n * 3 + 2] = tint; }
  }
  return { count, matrices: m, colors: c };
}

async function buildFine(m) {
  const g = cfg.grid;
  const buf = await fetchTile(m.url);
  const grid = new TileGrid({ cell: g.cell, originX: g.originX, originZ: g.originZ, tile: g.tile, halo: g.halo }, m.tx, m.ty, buf, cfg.levelById, cfg.clarityById);
  const i0 = m.tx * g.tile, j0 = m.ty * g.tile;
  const ox = g.originX + i0 * g.cell, oz = g.originZ + j0 * g.cell;
  const veg = placeVegetation(grid, i0, j0, g.tile, { seed: cfg.seed, exclusions: cfg.exclusions, originX: ox, originZ: oz });
  const aquatic = placeAquatic(grid, i0, j0, g.tile, { seed: cfg.seed, originX: ox, originZ: oz });
  const cover = coverField(grid, i0, j0, g.tile, veg.shade, cfg.exclusions);
  const terrain = buildTerrainChunk(grid, i0, j0, g.tile, { shade: veg.shade, fine: true, originX: ox, originZ: oz });
  const water = buildWaterChunk(grid, i0, j0, g.tile, ox, oz);
  const binCentre = (b) => ({ cx: g.originX + (b.rx + 0.5) * REGION, cz: g.originZ + (b.rz + 0.5) * REGION });
  const bins = veg.bins.map((b) => ({ rx: b.rx, rz: b.rz, sp: b.sp, ...binCentre(b), ...instanceData(b.items, 7, b.rx, b.rz) }));
  const abins = aquatic.bins.map((b) => ({ rx: b.rx, rz: b.rz, kind: b.kind, variant: b.variant, ...binCentre(b), ...instanceData(b.items, 5, b.rx, b.rz) }));
  const transfer = [buf, cover.buffer, terrain.pos.buffer, terrain.col.buffer, terrain.idx.buffer];
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
    transfer.push(terrain.pos.buffer, terrain.col.buffer, terrain.idx.buffer);
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

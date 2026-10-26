#!/usr/bin/env node
// d2 bake: the real falls and rapids baked into a v4 release's own levels, so the game patches nothing at load.
//
//   node scripts/rapids.mjs --data <out> --grade none --out <scratch>/rapids-<out>.json   (the drops, over the new bake)
//   node scripts/rapids-bake.mjs --data <out> --table <scratch>/rapids-<out>.json [--src src/rapids.json]
//
// scripts/rapids.mjs makes each drop where it really is as runs of level changes over the release's cells (`rows`,
// [j, i0, level0, change0, change1, ...] in dm, each change to the level and to the bed under it). This applies them
// to the release's fine tiles (every tile whose cells, halo included, the run crosses), refreshes the far field's cells
// under them (the block mean height and the deepest cell's level, as bake.mjs makes them), marks the index
// (`rapids`: what was baked), and writes the new release's list of drops into src/rapids.json as `v4` ({ for, white },
// no rows: the levels hold them), which rapids.js swaps in for a v4 release (useV4). Run once per bake: a run whose
// first cell no longer holds level0 (already baked) is left alone, and the index says when it has been.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { log } from './config.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const dataDir = arg('--data', 'public-data-v4').replace(/\/?$/, '/');
const tableFile = arg('--table', null);
const srcFile = arg('--src', 'src/rapids.json');
if (!tableFile) throw new Error('--table <rapids.mjs output over this release> is needed');

const index = JSON.parse(fs.readFileSync(dataDir + 'index.json', 'utf8'));
const table = JSON.parse(fs.readFileSync(tableFile, 'utf8'));
if (table.for !== index.source.baked) throw new Error(`the table was made for ${table.for}, the release is ${index.source.baked}`);
if (index.rapids && index.rapids.baked) throw new Error(`the drops are already baked into ${dataDir} (${index.rapids.at})`);
const g = index.grid, T = g.tile, HALO = g.halo, SIDE = T + 2 * HALO, n = SIDE * SIDE;
const F = g.far, FS = F.tile + 2 * F.halo, fn = FS * FS;

const readGz = (f) => { const raw = zlib.gunzipSync(fs.readFileSync(f)); return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength); };
const tiles = new Map();
const tile = (tx, ty) => {
  const key = `${tx}_${ty}`;
  let t = tiles.get(key);
  if (!t) { const buf = readGz(`${dataDir}tiles/${key}.bin`); t = { tx, ty, buf, h: new Int16Array(buf, 0, n), lake: new Uint16Array(buf, n * 2, n), sd: new Int16Array(buf, n * 4, n), lvl: new Int16Array(buf, n * 6, n), dirty: false }; tiles.set(key, t); }
  return t;
};

// 1. the rows into every tile holding their cells (a run is cut so it lies wholly inside or outside a tile's halo
//    ring: scripts/rapids.mjs), each checked against its first cell's level in the tile that owns that cell
let applied = 0, skipped = 0, cells = 0;
const fine = new Set(); // global cells changed
for (const r of table.rows || []) {
  const j = r[0], i0 = r[1], lv0 = r[2], len = r.length - 3;
  const ty0 = Math.floor(j / T), tx0 = Math.floor(i0 / T);
  const own = tile(tx0, ty0), m0 = (j - ty0 * T + HALO) * SIDE + (i0 - tx0 * T + HALO);
  if (own.lvl[m0] !== lv0 || !own.lake[m0]) { skipped++; continue; }
  applied++;
  for (let ty = Math.floor((j - HALO) / T); ty <= Math.floor((j + HALO) / T); ty++) {
    if (ty < 0 || ty >= g.nty) continue;
    const lj = j - ty * T + HALO;
    if (lj < 0 || lj >= SIDE) continue;
    for (let tx = Math.floor((i0 - HALO) / T); tx <= Math.floor((i0 + len - 1 + HALO) / T); tx++) {
      if (tx < 0 || tx >= g.ntx) continue;
      const t = tile(tx, ty);
      for (let q = 0; q < len; q++) {
        const li = i0 + q - tx * T + HALO;
        if (li < 0 || li >= SIDE) continue;
        const m = lj * SIDE + li;
        t.h[m] += r[3 + q]; t.lvl[m] += r[3 + q]; t.dirty = true;
      }
    }
  }
  for (let q = 0; q < len; q++) if (r[3 + q]) { fine.add(j * g.width + i0 + q); cells++; }
}
log(`${applied} runs of ${(table.rows || []).length} applied (${skipped} left: their first cell holds another level), ${cells} cells changed`);

// 2. the far field's cells over the changed cells: 80 m blocks, the mean height and the deepest cell's level
const farCells = new Set();
for (const k of fine) { const i = k % g.width, j = (k - i) / g.width; farCells.add(Math.floor(j / F.factor) * F.width + Math.floor(i / F.factor)); }
const farTiles = new Map();
const farTile = (fx, fy) => {
  const key = `${fx}_${fy}`;
  let t = farTiles.get(key);
  if (!t) { const buf = readGz(`${dataDir}far/${key}.bin`); t = { buf, h: new Int16Array(buf, 0, fn), lvl: new Int16Array(buf, fn * 6, fn) }; farTiles.set(key, t); }
  return t;
};
let farChanged = 0;
for (const f of farCells) {
  const fi = f % F.width, fj = (f - fi) / F.width;
  // the block's 64 fine cells lie in one fine tile's core
  const i0 = fi * F.factor, j0 = fj * F.factor, tx = Math.floor(i0 / T), ty = Math.floor(j0 / T), t = tile(tx, ty);
  let sh = 0, minSd = 32767, lv = 0;
  for (let dj = 0; dj < F.factor; dj++) for (let di = 0; di < F.factor; di++) {
    const m = (j0 + dj - ty * T + HALO) * SIDE + (i0 + di - tx * T + HALO);
    sh += t.h[m]; if (t.sd[m] < minSd) { minSd = t.sd[m]; lv = t.lvl[m]; }
  }
  const hv = Math.round(sh / (F.factor * F.factor)), lvv = minSd < 0 ? lv : hv;
  // every far tile holding the cell (its own core, the neighbours' halos)
  for (let fy = Math.floor((fj - F.halo) / F.tile); fy <= Math.floor((fj + F.halo) / F.tile); fy++) for (let fx = Math.floor((fi - F.halo) / F.tile); fx <= Math.floor((fi + F.halo) / F.tile); fx++) {
    if (fx < 0 || fy < 0 || fx >= F.ntx || fy >= F.nty) continue;
    const lj = fj - fy * F.tile + F.halo, li = fi - fx * F.tile + F.halo;
    if (lj < 0 || li < 0 || lj >= FS || li >= FS) continue;
    const ft = farTile(fx, fy), m = lj * FS + li;
    if (ft.h[m] !== hv || ft.lvl[m] !== lvv) { ft.h[m] = hv; ft.lvl[m] = lvv; ft.dirty = true; farChanged++; }
  }
}
log(`${farCells.size} far cells over them, ${farChanged} far values changed`);

// 3. write what changed, the index's mark, and the drops for src/rapids.json
let wrote = 0;
for (const t of tiles.values()) if (t.dirty) { fs.writeFileSync(`${dataDir}tiles/${t.tx}_${t.ty}.bin`, zlib.gzipSync(Buffer.from(t.buf), { level: 6 })); wrote++; }
for (const [key, t] of farTiles) if (t.dirty) fs.writeFileSync(`${dataDir}far/${key}.bin`, zlib.gzipSync(Buffer.from(t.buf), { level: 6 }));
index.rapids = { baked: true, at: new Date().toISOString(), runs: applied, cells, drops: table.white.length, source: table.source };
fs.writeFileSync(dataDir + 'index.json', JSON.stringify(index));
log(`${wrote} fine tiles and ${[...farTiles.values()].filter((t) => t.dirty).length} far tiles rewritten; index marked`);
const src = JSON.parse(fs.readFileSync(srcFile, 'utf8'));
src.v4 = { for: index.source.baked, about: 'd2 bake: the drops of the v4 release baked at `for` (its lake ids, its rivers); its levels hold every drop (scripts/rapids-bake.mjs), so it has no rows. rapids.js useV4() swaps this list in.', white: table.white };
fs.writeFileSync(srcFile, JSON.stringify(src));
log(`${srcFile}: v4 holds ${table.white.length} drops (${table.white.filter((w) => w.hidden).length} hidden), ${(fs.statSync(srcFile).size / 1024).toFixed(1)} KB`);

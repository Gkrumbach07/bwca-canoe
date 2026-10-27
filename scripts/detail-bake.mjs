#!/usr/bin/env node
// Detail bake (docs/data-sources.md "2 m detail"): the Minnesota LiDAR (MnTOPO 2 m DEM) cut at 2 m onto the game's
// grid for the whole US side, in 640 m chunks the game streams within a few hundred metres of the player, plus a 5 m
// set in 1280 m chunks for a mid ring that hides the step down to the 10 m tiles. The successor of the prototype;
// the game streams them (src/detail.js, docs/detail.md).
//
// The lattice. Samples r metres apart whose rows and columns run through the 10 m cell centres (the prototype's
// lattice: zero offset from the 10 m grid). A chunk (cx, cy) of tile (tx, ty) at r covers C cells a side (64 at 2 m,
// 128 at 5 m), from the centre of its first cell i0 = tx * 256 + cx * C to the centre of the next chunk's first: C * 10
// / r intervals, plus one sample of apron each side, so n = C * 10 / r + 3 samples a side (323 at 2 m, 259 at 5 m).
// Sample (k, l) sits at x0 + k r, z0 + l r with x0 = cell centre of i0 less r (row 0 north). Neighbours share their
// edge rows and columns (samples 1 and n - 2 of one are n - 2 and 1 of the next) and overlap by the apron.
//
// How it is cut. Per tile, gdalwarp reads the DEM by window over HTTP (a GDAL VRT of the state's COGs, /vsicurl/)
// straight onto the 2 m lattice of the tile and one cell round it (EPSG:6318 at r / mPerDeg degrees a pixel: the
// game's lat/lon projection is a plain lat/lon grid, scripts/config.mjs), bilinear. Then, per sample:
//   - water (the v4 tile's shore distance, bilinear, under 0): the tile's own water level (mean of the lake cells
//     round it), so the detail's shores meet the game's water sheet; the game draws the lake bed from the 10 m tile
//   - no LiDAR there, or not the US side (mask bit 16 of data-cache/lidar: Ontario stays on today's terrain): the v4
//     tile's height, bilinear, so it meets the 10 m ground
// The 5 m lattice is the box mean of the 2 m one over each 5 m sample's footprint (no second read of the DEM), with
// the same water rule. A chunk is written only if its cells hold US LiDAR on land (mask bits 1 and 16, the v4 tile
// not lake); the others (all water, Ontario, off the flight) are left out and the game keeps the 10 m ground there.
//
// File: <out>/<r>m/<tx>_<ty>_<cx>_<cy>.bin: gzip (the client inflates it, DecompressionStream, like the tiles) of a
// 56-byte header then n * n Int16, row-major, row 0 north, little-endian:
//   0 'BWDC'  4 u32 version (1)  8 i32 tx  12 i32 ty  16 u16 cx  18 u16 cy  20 u16 n  22 u16 predictor
//   24 f32 r (m)  28 f32 unit (m)  32 f32 base (m)  36 i16 min (dm)  38 i16 max (dm)  40 f64 x0  48 f64 z0 (game metres)
// The height of sample q is base + v[q] * unit, where v is the quantised height and the file holds v less a
// prediction: predictor 2 (the plane): v[q-1] + v[q-n] - v[q-n-1], v[q-1] on row 0, v[q-n] on column 0, 0 at q = 0;
// predictor 1: v[q-1] along the row, the row's first against the row before's first. decodeChunk below is the
// reference decoder.
// <out>/index.json lists what exists: levels (r, chunk size, n, dir) and, per level, chunk key -> [bytes, min dm,
// max dm], so the game never asks for a chunk that is not there.
//
// Usage: node scripts/detail-bake.mjs [--tiles all | 30-34:10-12 | 31_20,62_14 | --area lakeone,palisade]
//          [--res 2,5] [--data public-data-v4] [--out <data>/detail] [--jobs 2] [--force] [--limit N]
//          [--measure] [--check] [--shots [dir]]
//   --measure  also sizes other encodings (units, predictors) for each chunk and prints the totals
//   --check    no cutting: the stitch between neighbouring tiles' shared samples, read back from the files
//   --shots    no cutting: hillshade quick-looks (10 | 5 | 2 m) round the DETAIL_AREAS points, from the files
// Resumable: a tile whose chunks are written (state in data-cache/detail/<out>/state, one JSON per tile) is skipped unless
// --force. Parallel-safe: a tile is claimed by a lock file, so two runs can share the list. Needs GDAL (gdalbuildvrt,
// gdalwarp; `brew install gdal`), the v4 tiles in --data and the D1-lidar cache (data-cache/lidar: the mask). The VRT
// (data-cache/lidar/raw/dem2m.vrt) is built if missing. Scratch rasters go to data-cache/detail/work and are deleted.
// Data is git-ignored: never commit it.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn, spawnSync } from 'node:child_process';
import { CFG, AREAS, log, makeProjection, makeGrid } from './config.mjs';

// quick-look and test points
export const DETAIL_AREAS = {
  lakeone: { lat: 47.932, lon: -91.483, note: 'Lake One shore cliff' },
  palisade: { lat: 48.0743, lon: -90.4204, note: 'Border Route palisade' },
  fowl: { lat: 48.0755, lon: -90.0264, note: 'Fowl Lakes cliff (west of North Fowl Lake)' },
};

const BASE = 'https://g46prsaddst01.blob.core.windows.net/mntopo/derivatives/dem2m_100k/';
const SECTIONS = ['5_52', '5_53', '6_52', '6_53', '7_52', '7_53'];
const LIDAR = path.join(CFG.cacheDir, 'lidar');
const RAW = path.join(LIDAR, 'raw');
const VRT = path.join(RAW, 'dem2m.vrt');
const STATE = path.join(CFG.cacheDir, 'detail');
const WORK = path.join(STATE, 'work');
let RUN = STATE; // the run's state: data-cache/detail/<the output folder, as a name>/{state,lock}
const HEADER = 56;
const MAGIC = 0x43445742; // 'BWDC'
const MIN_FREE_GB = 4;

// the levels: r metres, C cells a chunk; the 2 m lattice is the one cut, 5 m is made from it
export const LEVELS = {
  2: { r: 2, cells: 64, unit: 0.05, predictor: 2 },
  5: { r: 5, cells: 128, unit: 0.1, predictor: 2 },
};
const nOf = (L) => (L.cells * CFG.cell) / L.r + 3;
// the tile's 2 m warp: sample W0 of it is the tile's first cell centre; it runs one cell past each side
const W0 = 5, WN = (CFG.tile + 2) * 5 + 1; // 1291

function parseArgs(argv) {
  const o = { tiles: 'all', area: null, res: [2, 5], data: CFG.outDir, out: null, jobs: 2, force: false, limit: Infinity, measure: false, check: false, shots: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tiles') o.tiles = argv[++i];
    else if (a === '--area') o.area = argv[++i];
    else if (a === '--res') o.res = argv[++i].split(',').map(Number);
    else if (a === '--data') o.data = argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--jobs') o.jobs = Math.max(1, +argv[++i]);
    else if (a === '--force') o.force = true;
    else if (a === '--limit') o.limit = +argv[++i];
    else if (a === '--measure') o.measure = true;
    else if (a === '--check') o.check = true;
    else if (a === '--shots') o.shots = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'shots/detail-bake';
    else if (a === '--help') { console.log(fs.readFileSync(new URL(import.meta.url)).toString().split('\n').filter((l) => l.startsWith('//')).join('\n')); process.exit(0); }
    else throw new Error('unknown argument ' + a);
  }
  for (const r of o.res) if (!LEVELS[r]) throw new Error(`--res ${r}: one of ${Object.keys(LEVELS).join(', ')}`);
  if (!o.res.includes(2)) throw new Error('--res must include 2 (the 5 m set is made from the 2 m cut)');
  o.out = o.out || path.join(o.data, 'detail');
  RUN = path.join(STATE, path.resolve(o.out).replace(/^\//, '').replace(/[^\w.-]+/g, '_'));
  return o;
}

// ---------- GDAL ------------------------------------------------------------------------------------------------

const GDAL_ENV = { ...process.env, GDAL_HTTP_MAX_RETRY: '6', GDAL_HTTP_RETRY_DELAY: '3', CPL_VSIL_CURL_CACHE_SIZE: '134217728' };

function runAsync(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args.map(String), { env: GDAL_ENV });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${code}: ${err.trim().slice(0, 300)}`))));
  });
}
async function retry(what, fn) {
  for (let attempt = 0; ; attempt++) {
    try { return await fn(); } catch (e) {
      if (attempt >= 4) throw e;
      log(`${what} failed (${e.message}); retrying in ${2 ** (attempt + 1)} s`);
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
}

function buildVrt() {
  const v = spawnSync('gdalwarp', ['--version'], { encoding: 'utf8' });
  if (v.status !== 0) throw new Error('GDAL is needed (gdalbuildvrt, gdalwarp): brew install gdal');
  if (!fs.existsSync(VRT)) {
    fs.mkdirSync(RAW, { recursive: true });
    const r = spawnSync('gdalbuildvrt', ['-q', '-overwrite', VRT, ...SECTIONS.map((c) => `/vsicurl/${BASE}dem2m_${c}_m.tif`)], { encoding: 'utf8', env: GDAL_ENV });
    if (r.status !== 0) throw new Error('gdalbuildvrt: ' + r.stderr);
    log('built', VRT);
  }
  return VRT;
}

// the tile's 2 m lattice from the DEM: Float32 WN x WN, NaN where no data
async function warpTile(G, tx, ty) {
  const { grid, proj } = G, r = 2;
  const x0 = grid.cx(tx * CFG.tile - 1), z0 = grid.cz(ty * CFG.tile - 1);
  const lonW = proj.lon0 + (x0 - r / 2) / proj.mPerDegLon, lonE = lonW + (WN * r) / proj.mPerDegLon;
  const latN = proj.lat0 - (z0 - r / 2) / proj.mPerDegLat, latS = latN - (WN * r) / proj.mPerDegLat;
  fs.mkdirSync(WORK, { recursive: true });
  const raw = path.join(WORK, `${tx}_${ty}.${process.pid}.f32`);
  const clean = () => { for (const f of [raw, raw.replace(/\.f32$/, '.hdr'), raw + '.aux.xml']) fs.rmSync(f, { force: true }); };
  try {
    await retry(`gdalwarp ${tx}_${ty}`, () => runAsync('gdalwarp', ['-q', '-overwrite', '-t_srs', 'EPSG:6318', '-te', lonW.toFixed(10), latS.toFixed(10), lonE.toFixed(10), latN.toFixed(10),
      '-ts', WN, WN, '-r', 'bilinear', '-ot', 'Float32', '-of', 'ENVI', '-dstnodata', '-9999', '-wm', '256', '-novshift', G.vrt, raw]));
    const b = fs.readFileSync(raw);
    if (b.length !== WN * WN * 4) throw new Error(`${raw}: ${b.length} bytes, expected ${WN * WN * 4}`);
    const a = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
    for (let q = 0; q < a.length; q++) if (!(a[q] > CFG.elevationFloor)) a[q] = NaN;
    return a;
  } finally { clean(); }
}

// ---------- the v4 tiles and the LiDAR mask ----------------------------------------------------------------------

function readV4(dataDir, idx, tx, ty) {
  const g = idx.grid, side = g.tile + 2 * g.halo, n = side * side;
  const f = path.join(dataDir, 'tiles', `${tx}_${ty}.bin`);
  if (!fs.existsSync(f)) return null;
  const buf = zlib.gunzipSync(fs.readFileSync(f));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
  return { side, i0: tx * g.tile - g.halo, j0: ty * g.tile - g.halo, h: new Int16Array(ab, 0, n), lake: new Uint16Array(ab, n * 2, n), sd: new Int16Array(ab, n * 4, n), lvl: new Int16Array(ab, n * 6, n) };
}

function readLidar(tx, ty, ch, C) {
  const f = path.join(LIDAR, `${tx}_${ty}.${ch}.bin`);
  if (!fs.existsSync(f)) return null;
  const b = zlib.gunzipSync(fs.readFileSync(f));
  return new C(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
}

// the mask bits of any cell round a tile (its own and its eight neighbours', read as needed); 0 where no tile
function maskSampler(tx, ty) {
  const T = CFG.tile, cache = new Map();
  const get = (ttx, tty) => {
    const k = ttx + ',' + tty;
    if (!cache.has(k)) cache.set(k, readLidar(ttx, tty, 'mask', Uint8Array));
    return cache.get(k);
  };
  return (i, j) => {
    const ttx = Math.floor(i / T), tty = Math.floor(j / T), m = get(ttx, tty);
    return m ? m[(j - tty * T) * T + (i - ttx * T)] : 0;
  };
}

// bilinear over the v4 tile's cell centres (world metres in, metres out); water: the level of the lake cells round it
function sampler(T, grid) {
  const at = (arr, i, j) => {
    const li = Math.min(T.side - 1, Math.max(0, i - T.i0)), lj = Math.min(T.side - 1, Math.max(0, j - T.j0));
    return arr[lj * T.side + li];
  };
  const bil = (arr, x, z) => {
    const fx = (x - grid.originX) / grid.cell - 0.5, fz = (z - grid.originZ) / grid.cell - 0.5;
    const i = Math.floor(fx), j = Math.floor(fz), ax = fx - i, az = fz - j;
    return ((at(arr, i, j) * (1 - ax) + at(arr, i + 1, j) * ax) * (1 - az) + (at(arr, i, j + 1) * (1 - ax) + at(arr, i + 1, j + 1) * ax) * az) * 0.1;
  };
  const level = (x, z) => {
    const fx = (x - grid.originX) / grid.cell - 0.5, fz = (z - grid.originZ) / grid.cell - 0.5;
    const i = Math.floor(fx), j = Math.floor(fz);
    let s = 0, n = 0;
    for (let dj = -1; dj <= 2; dj++) for (let di = -1; di <= 2; di++) if (at(T.lake, i + di, j + dj)) { s += at(T.lvl, i + di, j + dj) * 0.1; n++; }
    return n ? s / n : NaN;
  };
  return { height: (x, z) => bil(T.h, x, z), sd: (x, z) => bil(T.sd, x, z), level, cellH: (i, j) => at(T.h, i, j) * 0.1, cellLake: (i, j) => at(T.lake, i, j) };
}

// ---------- encoding ---------------------------------------------------------------------------------------------

// heights (Float64/32, n x n) -> the file's bytes (gzip)
export function encodeChunk(h, n, { r, unit, predictor, tx, ty, cx, cy, x0, z0 }, level = 9) {
  let lo = Infinity, hi = -Infinity;
  for (let q = 0; q < n * n; q++) { if (h[q] < lo) lo = h[q]; if (h[q] > hi) hi = h[q]; }
  const base = Math.floor(lo);
  const v = new Int32Array(n * n);
  for (let q = 0; q < n * n; q++) v[q] = Math.round((h[q] - base) / unit);
  const d = new Int16Array(n * n);
  for (let l = 0; l < n; l++) for (let k = 0; k < n; k++) {
    const q = l * n + k;
    let p = 0;
    if (predictor === 2) p = l && k ? v[q - 1] + v[q - n] - v[q - n - 1] : k ? v[q - 1] : l ? v[q - n] : 0;
    else if (predictor === 1) p = k ? v[q - 1] : l ? v[q - n] : 0;
    const e = v[q] - p;
    if (e < -32768 || e > 32767) throw new Error(`chunk ${tx}_${ty}_${cx}_${cy}: residual ${e} out of Int16`);
    d[q] = e;
  }
  const head = Buffer.alloc(HEADER);
  head.writeUInt32LE(MAGIC, 0); head.writeUInt32LE(1, 4); head.writeInt32LE(tx, 8); head.writeInt32LE(ty, 12);
  head.writeUInt16LE(cx, 16); head.writeUInt16LE(cy, 18); head.writeUInt16LE(n, 20); head.writeUInt16LE(predictor, 22);
  head.writeFloatLE(r, 24); head.writeFloatLE(unit, 28); head.writeFloatLE(base, 32);
  head.writeInt16LE(Math.floor(lo * 10), 36); head.writeInt16LE(Math.ceil(hi * 10), 38);
  head.writeDoubleLE(x0, 40); head.writeDoubleLE(z0, 48);
  const raw = Buffer.concat([head, Buffer.from(d.buffer)]);
  return { gz: zlib.gzipSync(raw, { level }), raw: raw.length, min: Math.floor(lo * 10), max: Math.ceil(hi * 10) };
}

// the reference decoder: the inflated bytes (ArrayBuffer) -> { tx, ty, cx, cy, n, r, x0, z0, h: Float32Array metres }
export function decodeChunk(buf) {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error('not a detail chunk');
  const n = dv.getUint16(20, true), pred = dv.getUint16(22, true), r = dv.getFloat32(24, true), unit = dv.getFloat32(28, true), base = dv.getFloat32(32, true);
  const d = new Int16Array(buf, HEADER, n * n), v = new Int32Array(n * n);
  for (let l = 0; l < n; l++) for (let k = 0; k < n; k++) {
    const q = l * n + k;
    let p = 0;
    if (pred === 2) p = l && k ? v[q - 1] + v[q - n] - v[q - n - 1] : k ? v[q - 1] : l ? v[q - n] : 0;
    else if (pred === 1) p = k ? v[q - 1] : l ? v[q - n] : 0;
    v[q] = p + d[q];
  }
  const h = new Float32Array(n * n);
  for (let q = 0; q < n * n; q++) h[q] = base + v[q] * unit;
  return { tx: dv.getInt32(8, true), ty: dv.getInt32(12, true), cx: dv.getUint16(16, true), cy: dv.getUint16(18, true), n, r, x0: dv.getFloat64(40, true), z0: dv.getFloat64(48, true), min: dv.getInt16(36, true) / 10, max: dv.getInt16(38, true) / 10, h };
}

// --measure: other encodings of the same chunk (gzip -6 for speed: the ratios carry over)
const VARIANTS = [
  { name: 'cm row', unit: 0.01, predictor: 1 }, { name: 'cm plane', unit: 0.01, predictor: 2 },
  { name: '2cm plane', unit: 0.02, predictor: 2 }, { name: '5cm plane', unit: 0.05, predictor: 2 },
  { name: 'dm row', unit: 0.1, predictor: 1 }, { name: 'dm plane', unit: 0.1, predictor: 2 }, { name: 'dm none', unit: 0.1, predictor: 0 },
];

// ---------- one tile ----------------------------------------------------------------------------------------------

const chunkKey = (tx, ty, cx, cy) => `${tx}_${ty}_${cx}_${cy}`;
const chunkFile = (out, r, key) => path.join(out, `${r}m`, `${key}.bin`);

// 1-D weights of the 2 m samples in the box mean of a 5 m sample at offset D metres from the tile's first cell centre
function boxWeights(D) {
  const out = [];
  for (let k = Math.floor((D - 3.5) / 2); k <= Math.ceil((D + 3.5) / 2); k++) {
    const w = Math.max(0, Math.min(2 * k + 1, D + 2.5) - Math.max(2 * k - 1, D - 2.5));
    if (w > 0) out.push([k + W0, w / 5]);
  }
  return out;
}

async function bakeTile(G, opt, tx, ty, stats) {
  const { grid, idx } = G, T = CFG.tile;
  const v4 = readV4(opt.data, idx, tx, ty);
  const mask = readLidar(tx, ty, 'mask', Uint8Array);
  const rec = { tx, ty, chunks: {}, check: { n: 0, s1: 0, ss1: 0, s2: 0, ss2: 0 }, seconds: 0 };
  if (!v4 || !mask) return rec;
  const t0 = Date.now();
  const S = sampler(v4, grid);
  // which chunks: US LiDAR on land (not a lake in the v4 tile)
  const want = {};
  for (const r of opt.res) {
    const L = LEVELS[r], per = T / L.cells;
    want[r] = [];
    for (let cy = 0; cy < per; cy++) for (let cx = 0; cx < per; cx++) {
      let land = 0;
      for (let j = cy * L.cells; j < (cy + 1) * L.cells; j++) for (let i = cx * L.cells; i < (cx + 1) * L.cells; i++) {
        if ((mask[j * T + i] & 17) === 17 && !S.cellLake(tx * T + i, ty * T + j)) land++;
      }
      if (land) want[r].push([cx, cy, land]);
    }
  }
  if (!want[2].length) { rec.seconds = (Date.now() - t0) / 1000; return rec; }
  const a = await warpTile(G, tx, ty);
  const tw = Date.now();
  // the 2 m heights over the whole warp: LiDAR on the US side, the water level on water, else the v4 tile
  const M = maskSampler(tx, ty);
  const X0 = grid.cx(tx * T) - W0 * 2, Z0 = grid.cz(ty * T) - W0 * 2;
  const H = new Float32Array(WN * WN);
  let water = 0, filled = 0;
  for (let l = 0; l < WN; l++) for (let k = 0; k < WN; k++) {
    const q = l * WN + k, x = X0 + k * 2, z = Z0 + l * 2;
    let v = a[q];
    if (S.sd(x, z) < 0) { const lv = S.level(x, z); if (lv === lv) { H[q] = lv; water++; continue; } }
    if (!(v === v) || !(M(grid.ci(x), grid.cj(z)) & 16)) { v = S.height(x, z); filled++; }
    H[q] = v;
  }
  // the check: the 2 m LiDAR lattice averaged back onto each 10 m cell ([.5 1 1 1 .5] / 4 a side round its centre)
  // against the D1 cell mean (data-cache/lidar height) and the v4 tile's height, on full-LiDAR US land cells
  const lh = readLidar(tx, ty, 'height', Int16Array);
  const W5 = [0.125, 0.25, 0.25, 0.25, 0.125];
  for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
    const c = j * T + i;
    if ((mask[c] & 31) !== 17 || !lh || lh[c] === -32768) continue;
    const kc = W0 + 5 * i, lc = W0 + 5 * j;
    let s = 0, ok = true;
    for (let dl = -2; dl <= 2 && ok; dl++) for (let dk = -2; dk <= 2; dk++) {
      const v = a[(lc + dl) * WN + kc + dk];
      if (!(v === v)) { ok = false; break; }
      s += v * W5[dl + 2] * W5[dk + 2];
    }
    if (!ok) continue;
    const d1 = s - lh[c] / 10, d2 = s - S.cellH(tx * T + i, ty * T + j), C = rec.check;
    stats.addCheck(d1, d2);
    C.n++; C.s1 += d1; C.ss1 += d1 * d1; C.s2 += d2; C.ss2 += d2 * d2;
  }
  // the chunks
  for (const r of opt.res) {
    const L = LEVELS[r], n = nOf(L);
    const dir = path.join(opt.out, `${r}m`);
    fs.mkdirSync(dir, { recursive: true });
    for (const [cx, cy, land] of want[r]) {
      const key = chunkKey(tx, ty, cx, cy), file = chunkFile(opt.out, r, key);
      const x0 = grid.cx(tx * T + cx * L.cells) - r, z0 = grid.cz(ty * T + cy * L.cells) - r;
      let h;
      if (r === 2) {
        // a window of H: sample (k, l) of the chunk is H's (W0 + cx * 320 - 1 + k, ...)
        const k0 = W0 + cx * 320 - 1, l0 = W0 + cy * 320 - 1;
        h = new Float32Array(n * n);
        for (let l = 0; l < n; l++) for (let k = 0; k < n; k++) h[l * n + k] = H[(l0 + l) * WN + k0 + k];
      } else {
        // the box mean of the 2 m heights, then the water rule again
        const per = (L.cells * CFG.cell);
        const wx = [], wz = [];
        for (let k = 0; k < n; k++) wx.push(boxWeights(cx * per - r + k * r));
        for (let l = 0; l < n; l++) wz.push(boxWeights(cy * per - r + l * r));
        h = new Float32Array(n * n);
        for (let l = 0; l < n; l++) for (let k = 0; k < n; k++) {
          const x = x0 + k * r, z = z0 + l * r;
          if (S.sd(x, z) < 0) { const lv = S.level(x, z); if (lv === lv) { h[l * n + k] = lv; continue; } }
          let s = 0;
          for (const [ql, wl] of wz[l]) for (const [qk, wkk] of wx[k]) s += H[ql * WN + qk] * wl * wkk;
          h[l * n + k] = s;
        }
      }
      const enc = encodeChunk(h, n, { r, unit: L.unit, predictor: L.predictor, tx, ty, cx, cy, x0, z0 });
      fs.writeFileSync(file + '.part', enc.gz);
      fs.renameSync(file + '.part', file);
      rec.chunks[r] = rec.chunks[r] || {};
      rec.chunks[r][key] = [enc.gz.length, enc.min, enc.max, land];
      if (opt.measure) stats.addMeasure(r, h, n, enc.gz.length, { tx, ty, cx, cy, x0, z0, r });
    }
  }
  rec.water = water; rec.filled = filled;
  rec.seconds = (Date.now() - t0) / 1000; rec.warpSeconds = (tw - t0) / 1000;
  return rec;
}

// ---------- the run ---------------------------------------------------------------------------------------------

function tileList(opt, G) {
  const man = JSON.parse(fs.readFileSync(path.join(LIDAR, 'manifest.json'), 'utf8'));
  const us = Object.entries(man.tiles).filter(([, v]) => (v.us || 0) > 0).map(([k]) => k.split('_').map(Number));
  let list;
  if (opt.area) {
    list = opt.area.split(',').map((name) => {
      const A = DETAIL_AREAS[name];
      if (!A) throw new Error(`unknown area ${name} (${Object.keys(DETAIL_AREAS).join(', ')})`);
      const [x, z] = G.proj.toLocal(A.lat, A.lon);
      return [Math.floor(G.grid.ci(x) / CFG.tile), Math.floor(G.grid.cj(z) / CFG.tile)];
    });
  } else if (opt.tiles === 'all') list = us;
  else if (/^\d+-\d+:\d+-\d+$/.test(opt.tiles)) {
    const [a, b] = opt.tiles.split(':').map((s) => s.split('-').map(Number));
    list = us.filter(([tx, ty]) => tx >= a[0] && tx <= a[1] && ty >= b[0] && ty <= b[1]);
  } else list = opt.tiles.split(',').map((t) => t.split('_').map(Number));
  // nearest the game's start first, so a partial run is useful
  const s = G.idx.start || { x: 0, z: 0 };
  const d = ([tx, ty]) => Math.hypot(G.grid.originX + (tx + 0.5) * CFG.tile * CFG.cell - s.x, G.grid.originZ + (ty + 0.5) * CFG.tile * CFG.cell - s.z);
  return list.sort((p, q) => d(p) - d(q)).slice(0, opt.limit);
}

const stateFile = (tx, ty) => path.join(RUN, 'state', `${tx}_${ty}.json`);

function freeGB(dir) {
  try { const s = fs.statfsSync(dir); return (s.bavail * s.bsize) / 2 ** 30; } catch { return Infinity; }
}

function makeStats() {
  // differences in cm, -500..500, histogram
  const B = 1001, h1 = new Float64Array(B), h2 = new Float64Array(B);
  const st = { n: 0, s1: 0, ss1: 0, s2: 0, ss2: 0, measure: {} };
  const bin = (d) => Math.max(0, Math.min(B - 1, Math.round(d * 100) + 500));
  st.addCheck = (d1, d2) => { st.n++; st.s1 += d1; st.ss1 += d1 * d1; st.s2 += d2; st.ss2 += d2 * d2; h1[bin(d1)]++; h2[bin(d2)]++; };
  const pct = (h, p) => { let c = 0; const want = p * st.n; for (let i = 0; i < B; i++) { c += h[i]; if (c >= want) return (i - 500) / 100; } return NaN; };
  const absPct = (h, p) => { const a = new Float64Array(501); for (let i = 0; i < B; i++) a[Math.abs(i - 500)] += h[i]; let c = 0; for (let i = 0; i <= 500; i++) { c += a[i]; if (c >= p * st.n) return i / 100; } return 5; };
  st.summary = () => st.n ? {
    cells: st.n,
    vsLidarCellMean: { mean: +(st.s1 / st.n).toFixed(4), rms: +Math.sqrt(st.ss1 / st.n).toFixed(4), median: pct(h1, 0.5), abs95: absPct(h1, 0.95), abs99: absPct(h1, 0.99), abs999: absPct(h1, 0.999) },
    vsV4Tile: { mean: +(st.s2 / st.n).toFixed(4), rms: +Math.sqrt(st.ss2 / st.n).toFixed(4), median: pct(h2, 0.5), abs95: absPct(h2, 0.95), abs99: absPct(h2, 0.99), abs999: absPct(h2, 0.999) },
  } : null;
  st.addMeasure = (r, h, n, bytes, meta) => {
    const m = st.measure[r] || (st.measure[r] = { chunks: 0, final: 0 });
    m.chunks++; m.final += bytes;
    for (const V of VARIANTS) m[V.name] = (m[V.name] || 0) + encodeChunk(h, n, { ...meta, unit: V.unit, predictor: V.predictor }, 6).gz.length;
  };
  return st;
}

function lock(tx, ty) {
  const f = path.join(RUN, 'lock', `${tx}_${ty}`);
  try { fs.writeFileSync(f, String(process.pid), { flag: 'wx' }); return f; } catch {
    // a lock left by a dead process is taken over
    try { const pid = +fs.readFileSync(f, 'utf8'); process.kill(pid, 0); return null; } catch { fs.writeFileSync(f, String(process.pid)); return f; }
  }
}

function writeIndex(opt, G) {
  const index = {
    version: 1, format: 'BWDC',
    layout: 'see scripts/detail-bake.mjs: <r>m/<tx>_<ty>_<cx>_<cy>.bin, gzip of a 56-byte header and n x n Int16 heights (base + v * unit, v plane-predicted), rows north to south; chunks: key -> [bytes, min dm, max dm, US LiDAR land cells]',
    source: 'Minnesota Statewide Seamless Lidar DEM, 2nd generation, 2 m (MnTOPO), Minnesota DNR / MnGeo; public domain',
    grid: { cell: CFG.cell, tile: CFG.tile, originX: G.grid.originX, originZ: G.grid.originZ, proj: G.idx.proj },
    levels: {}, chunks: {}, check: null, updated: new Date().toISOString(),
  };
  for (const r of opt.res) { const L = LEVELS[r]; index.levels[r] = { r, cells: L.cells, size: L.cells * CFG.cell, perTile: CFG.tile / L.cells, n: nOf(L), unit: L.unit, predictor: L.predictor, dir: `${r}m`, count: 0, bytes: 0 }; index.chunks[r] = {}; }
  const sdir = path.join(RUN, 'state');
  let tiles = 0;
  const agg = { n: 0, s1: 0, ss1: 0, s2: 0, ss2: 0 };
  for (const f of fs.existsSync(sdir) ? fs.readdirSync(sdir) : []) {
    if (!f.endsWith('.json')) continue;
    const rec = JSON.parse(fs.readFileSync(path.join(sdir, f), 'utf8'));
    tiles++;
    for (const r of opt.res) for (const [k, v] of Object.entries((rec.chunks && rec.chunks[r]) || {})) {
      if (!fs.existsSync(chunkFile(opt.out, r, k))) continue;
      index.chunks[r][k] = v.slice(0, 3); index.levels[r].count++; index.levels[r].bytes += v[0];
    }
    if (rec.check) for (const key of Object.keys(agg)) agg[key] += rec.check[key] || 0;
  }
  if (agg.n) index.check = { cells: agg.n, vsLidarCellMean: { mean: +(agg.s1 / agg.n).toFixed(4), rms: +Math.sqrt(agg.ss1 / agg.n).toFixed(4) }, vsV4Tile: { mean: +(agg.s2 / agg.n).toFixed(4), rms: +Math.sqrt(agg.ss2 / agg.n).toFixed(4) } };
  index.tilesBaked = tiles;
  fs.mkdirSync(opt.out, { recursive: true });
  const f = path.join(opt.out, 'index.json');
  fs.writeFileSync(f + '.part', JSON.stringify(index));
  fs.renameSync(f + '.part', f);
  return index;
}

async function bake(opt, G) {
  const list = tileList(opt, G);
  fs.mkdirSync(path.join(RUN, 'state'), { recursive: true });
  fs.mkdirSync(path.join(RUN, 'lock'), { recursive: true });
  const todo = list.filter(([tx, ty]) => opt.force || !fs.existsSync(stateFile(tx, ty)));
  log(`detail bake: ${list.length} tiles, ${list.length - todo.length} done already, ${todo.length} to cut at ${opt.res.join(', ')} m into ${opt.out} (${opt.jobs} jobs)`);
  const stats = makeStats();
  const t0 = Date.now();
  let done = 0, bytes = 0, chunks = 0, next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const [tx, ty] = todo[next++];
      if (freeGB(opt.out) < MIN_FREE_GB) throw new Error(`under ${MIN_FREE_GB} GB free on ${opt.out}: stopping`);
      const lk = lock(tx, ty);
      if (!lk) { log(`tile ${tx}_${ty} is being cut by another run; skipping`); done++; continue; }
      try {
        const rec = await bakeTile(G, opt, tx, ty, stats);
        fs.writeFileSync(stateFile(tx, ty) + '.part', JSON.stringify(rec));
        fs.renameSync(stateFile(tx, ty) + '.part', stateFile(tx, ty));
        done++;
        const c2 = Object.keys((rec.chunks[2]) || {}).length, b = Object.values(rec.chunks).reduce((s, o) => s + Object.values(o).reduce((t, v) => t + v[0], 0), 0);
        bytes += b; chunks += c2;
        const el = (Date.now() - t0) / 1000, eta = (el / done) * (todo.length - done);
        log(`[${done}/${todo.length}] ${tx}_${ty}: ${c2} chunks at 2 m${rec.chunks[5] ? `, ${Object.keys(rec.chunks[5]).length} at 5 m` : ''}, ${(b / 2 ** 20).toFixed(2)} MB, ${rec.seconds.toFixed(1)} s (warp ${(rec.warpSeconds || 0).toFixed(1)}); ${(bytes / 2 ** 20).toFixed(0)} MB so far; ETA ${(eta / 60).toFixed(0)} min`);
      } finally { fs.rmSync(lk, { force: true }); }
      if (done % 50 === 0) writeIndex(opt, G);
    }
  };
  await Promise.all(Array.from({ length: Math.min(opt.jobs, todo.length || 1) }, worker));
  const index = writeIndex(opt, G);
  log(`detail bake: ${chunks} chunks at 2 m this run, ${(bytes / 2 ** 20).toFixed(1)} MB, ${((Date.now() - t0) / 60000).toFixed(1)} min`);
  for (const r of opt.res) log(`  ${r} m: ${index.levels[r].count} chunks, ${(index.levels[r].bytes / 2 ** 20).toFixed(1)} MB in all`);
  const sm = stats.summary();
  if (sm) log('10 m agreement (this run; 2 m averaged back to the 10 m cells, metres):', JSON.stringify(sm));
  if (opt.measure) for (const [r, m] of Object.entries(stats.measure)) {
    log(`encodings at ${r} m over ${m.chunks} chunks (gzip -6; final is the written file at -9):`);
    for (const [k, v] of Object.entries(m)) if (k !== 'chunks') log(`   ${k.padEnd(10)} ${(v / m.chunks / 1024).toFixed(1)} KB a chunk`);
  }
  try { fs.rmdirSync(WORK); } catch { /* not empty or gone */ }
}

// ---------- --check: the stitch between neighbouring tiles -----------------------------------------------------------

function readChunk(out, r, key) {
  const f = chunkFile(out, r, key);
  if (!fs.existsSync(f)) return null;
  const b = zlib.gunzipSync(fs.readFileSync(f));
  return decodeChunk(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
}

function checkStitch(opt) {
  const idx = JSON.parse(fs.readFileSync(path.join(opt.out, 'index.json'), 'utf8'));
  for (const r of opt.res) {
    const L = LEVELS[r], per = CFG.tile / L.cells, n = nOf(L);
    const keys = Object.keys(idx.chunks[r]);
    let pairs = 0, samples = 0, diff = 0, maxd = 0, cross = 0, crossDiff = 0, crossMax = 0;
    for (const key of keys.slice(0, opt.limit === Infinity ? keys.length : opt.limit)) {
      const [tx, ty, cx, cy] = key.split('_').map(Number);
      const A = readChunk(opt.out, r, key);
      // east neighbour: A's columns n-3..n-1 are B's 0..2
      let ncx = cx + 1, ntx = tx;
      if (ncx === per) { ncx = 0; ntx++; }
      const nk = chunkKey(ntx, ty, ncx, cy);
      if (!idx.chunks[r][nk]) continue;
      const B = readChunk(opt.out, r, nk);
      pairs++;
      let md = 0;
      for (let l = 0; l < n; l++) for (let o = 0; o < 3; o++) {
        const d = Math.abs(A.h[l * n + n - 3 + o] - B.h[l * n + o]);
        samples++; if (d > 1e-4) diff++; md = Math.max(md, d);
      }
      maxd = Math.max(maxd, md);
      if (ntx !== tx) { cross++; if (md > 1e-4) crossDiff++; crossMax = Math.max(crossMax, md); }
    }
    log(`stitch at ${r} m: ${pairs} east-west neighbour pairs (${cross} across a tile edge), ${samples} shared samples, ${diff} differ; max ${maxd.toFixed(3)} m (across tiles: ${crossDiff} pairs differ, max ${crossMax.toFixed(3)} m)`);
  }
}

// ---------- --shots: hillshade quick-looks -----------------------------------------------------------------------

async function shots(opt, G, dir) {
  const { PNG } = await import('pngjs');
  fs.mkdirSync(dir, { recursive: true });
  const { grid, proj, idx } = G;
  const SPAN = 1200, PX = 2, W = SPAN / PX; // metres a side, metres a pixel
  const cache = new Map();
  const heightAt = (r, x, z) => {
    const L = LEVELS[r], size = L.cells * CFG.cell;
    const ii = Math.floor((x - grid.cx(0)) / size), jj = Math.floor((z - grid.cz(0)) / size);
    const per = CFG.tile / L.cells, tx = Math.floor(ii / per), ty = Math.floor(jj / per), key = chunkKey(tx, ty, ii - tx * per, jj - ty * per);
    if (!cache.has(r + key)) cache.set(r + key, readChunk(opt.out, r, key));
    const C = cache.get(r + key);
    if (!C) return NaN;
    const fx = (x - C.x0) / C.r, fz = (z - C.z0) / C.r, k = Math.floor(fx), l = Math.floor(fz), u = fx - k, w = fz - l, n = C.n;
    const q = l * n + k, h = C.h;
    return (h[q] * (1 - u) + h[q + 1] * u) * (1 - w) + (h[q + n] * (1 - u) + h[q + n + 1] * u) * w;
  };
  const v4c = new Map();
  const height10 = (x, z) => {
    const fx = (x - grid.originX) / 10 - 0.5, fz = (z - grid.originZ) / 10 - 0.5, i = Math.floor(fx), j = Math.floor(fz);
    const at = (ii, jj) => {
      const tx = Math.floor(ii / CFG.tile), ty = Math.floor(jj / CFG.tile), k = tx + ',' + ty;
      if (!v4c.has(k)) v4c.set(k, readV4(opt.data, idx, tx, ty));
      const T = v4c.get(k);
      return T ? T.h[(jj - T.j0) * T.side + ii - T.i0] * 0.1 : NaN;
    };
    const u = fx - i, w = fz - j;
    return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - w) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * w;
  };
  const files = [];
  for (const [name, A] of Object.entries(DETAIL_AREAS)) {
    const [cxw, czw] = proj.toLocal(A.lat, A.lon);
    const panels = [['10 m', (x, z) => height10(x, z)], ['5 m', (x, z) => heightAt(5, x, z)], ['2 m', (x, z) => heightAt(2, x, z)]];
    const png = new PNG({ width: W * 3 + 8, height: W });
    png.data.fill(255);
    panels.forEach(([, f], p) => {
      const hgt = new Float32Array((W + 2) * (W + 2));
      for (let l = 0; l < W + 2; l++) for (let k = 0; k < W + 2; k++) hgt[l * (W + 2) + k] = f(cxw - SPAN / 2 + (k - 1) * PX, czw - SPAN / 2 + (l - 1) * PX);
      for (let l = 0; l < W; l++) for (let k = 0; k < W; k++) {
        const q = (l + 1) * (W + 2) + k + 1;
        const dx = (hgt[q + 1] - hgt[q - 1]) / (2 * PX), dz = (hgt[q + W + 2] - hgt[q - W - 2]) / (2 * PX);
        let shade;
        if (!(dx === dx && dz === dz)) shade = [255, 235, 235];
        else {
          // light from the north-west, 45 degrees up (z runs south)
          const nx = -dx, ny = 1, nz = -dz, nl = Math.hypot(nx, ny, nz), L = [-0.5, 0.7071, -0.5];
          const s = Math.max(0, (nx * L[0] + ny * L[1] + nz * L[2]) / nl);
          const g = Math.round(40 + 215 * s);
          shade = [g, g, g];
        }
        const o = (l * png.width + p * (W + 4) + k) * 4;
        png.data[o] = shade[0]; png.data[o + 1] = shade[1]; png.data[o + 2] = shade[2]; png.data[o + 3] = 255;
      }
    });
    const f = path.join(dir, `${name}.png`);
    fs.writeFileSync(f, PNG.sync.write(png));
    files.push(f);
    log(`${f}: ${A.note}, ${SPAN} m square round ${A.lat}, ${A.lon}; 10 m | 5 m | 2 m (pink: no detail chunk)`);
  }
  return files;
}

// ---------- main ---------------------------------------------------------------------------------------------------

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  const idx = JSON.parse(fs.readFileSync(path.join(opt.data, 'index.json'), 'utf8'));
  const bbox = AREAS.bwca, proj = makeProjection(bbox), grid = makeGrid(bbox, proj);
  if (idx.grid.originX !== grid.originX || idx.grid.cell !== grid.cell || idx.grid.tile !== CFG.tile) throw new Error(`${opt.data} is not the bwca grid`);
  const G = { grid, proj, idx };
  if (opt.check) return checkStitch(opt);
  if (opt.shots) return shots(opt, G, opt.shots);
  G.vrt = buildVrt();
  await bake(opt, G);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) main().catch((e) => { console.error(e); process.exit(1); });

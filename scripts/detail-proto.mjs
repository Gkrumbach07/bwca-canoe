#!/usr/bin/env node
// Detail prototype (docs/detail-proto.md): the Minnesota LiDAR (MnTOPO 2 m DEM) cut at 2 m and 5 m straight onto the
// game's grid for a few test tiles, so the game can draw the ground near the player finer than the 10 m tiles
// (`?detail=2` / `?detail=5`). A prototype to choose a resolution by: nothing reads these files unless the flag is on.
//
// For each tile it warps the DEM (gdalwarp, read by window over HTTP through a GDAL VRT of the state's COGs) onto a
// lattice of samples r metres apart whose rows and columns run through the 10 m cell centres: sample (0, 0) sits on
// the centre of cell (tx*256 - 1, ty*256 - 1), one cell outside the tile, and the lattice runs to one cell past the
// far edge, so (256 + 2) * 10 / r + 1 samples a side (1291 at 2 m, 517 at 5 m). The game's mesh vertices are these
// samples. The projection is the bake's (scripts/config.mjs: lat/lon scaled about the box centre), which is a plain
// lat/lon grid, so the target is EPSG:6318 (NAD83(2011), the DEM's own datum, used as the game's lat/lon exactly as
// scripts/sources/lidar.mjs does) with r / mPerDeg degrees per pixel. 5 m: the mean of the 2 m pixels under each
// sample's footprint (-r average); 2 m: bilinear between the 2 m pixels.
//
// Water: the DEM is hydro-flattened (lakes are flat at the surveyed surface). Wherever the 10 m tile says water
// (its shore distance, bilinear, is under 0) the sample is set to the tile's own water level, so the detail's shores
// meet the game's water sheet; the game draws the lake bed from the 10 m tile (bathymetry) anyway. Samples with no
// LiDAR (off the flight) take the 10 m tile's height.
//
// File: <out>/<tx>_<ty>.<r>m.bin, gzip of a 48-byte header then Int16 samples, row-major, row 0 north:
//   0  'BWDT'   4  u32 version (1)   8  i32 tx   12 i32 ty   16 u32 nx   20 u32 ny   24 f32 r (m)   28 f32 base (m)
//   32 f64 x0, 40 f64 z0: the world position (game metres) of sample (0, 0)
// Each sample is centimetres above `base`, delta-coded along the row (the first of a row against the first of the
// row before), which gzips to about half the raw size. <out>/index.json lists the tiles and their resolutions.
//
// Usage: node scripts/detail-proto.mjs [--area lakeone,palisade | --tiles 31_20,62_14] [--res 2,5] [--data public/data]
//          [--out public/data-detail] [--force]
// Needs GDAL (gdalbuildvrt, gdalwarp; `brew install gdal`) and the v4 tiles in --data (npm run data:sync). The VRT is
// data-cache/lidar/raw/dem2m.vrt (built here if missing, as scripts/sources/lidar.mjs builds it); scratch rasters go
// to data-cache/lidar-detail/ and are deleted. Data is git-ignored: never commit it.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { CFG, AREAS, log, makeProjection, makeGrid } from './config.mjs';

// The test areas: one 2.56 km tile round each point
export const DETAIL_AREAS = {
  // the 192 m, 65-degree face 10 m from Lake One, near entry point 30 (the game's start)
  lakeone: { lat: 47.932, lon: -91.483, note: 'Lake One shore cliff' },
  // the Border Route palisades (Rose / Watap / Clearwater): 24 m of relief inside one 10 m cell
  palisade: { lat: 48.0743, lon: -90.4204, note: 'Border Route palisade' },
};

// the DEM (scripts/sources/lidar.mjs SOURCE): six 100 km sections of the 2 m statewide DEM, cloud-optimised GeoTIFFs
const BASE = 'https://g46prsaddst01.blob.core.windows.net/mntopo/derivatives/dem2m_100k/';
const CHUNKS = ['5_52', '5_53', '6_52', '6_53', '7_52', '7_53'];
const RAW = path.join(CFG.cacheDir, 'lidar', 'raw');
const VRT = path.join(RAW, 'dem2m.vrt');
const WORK = path.join(CFG.cacheDir, 'lidar-detail');
const HEADER = 48;

function parseArgs(argv) {
  const o = { area: 'lakeone,palisade', tiles: null, res: [2, 5], data: CFG.outDir === 'public-data-v4' && fs.existsSync('public/data/index.json') ? 'public/data' : CFG.outDir, out: 'public/data-detail', force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--area') o.area = argv[++i];
    else if (a === '--tiles') o.tiles = argv[++i];
    else if (a === '--res') o.res = argv[++i].split(',').map(Number);
    else if (a === '--data') o.data = argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--force') o.force = true;
    else if (a === '--help') { console.log(fs.readFileSync(new URL(import.meta.url)).toString().split('\n').filter((l) => l.startsWith('//')).join('\n')); process.exit(0); }
    else throw new Error('unknown argument ' + a);
  }
  for (const r of o.res) if (!(r > 0 && (10 / r) % 1 === 0)) throw new Error(`--res ${r}: must divide 10 m (1, 2, 2.5, 5)`);
  return o;
}

function run(cmd, args) {
  const env = { ...process.env, GDAL_HTTP_MAX_RETRY: '6', GDAL_HTTP_RETRY_DELAY: '3', CPL_VSIL_CURL_CACHE_SIZE: '134217728' };
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = spawnSync(cmd, args.map(String), { encoding: 'utf8', env });
    if (r.status === 0) return r.stdout;
    log(`${cmd} failed (${r.status}): ${(r.stderr || '').trim().slice(0, 300)}${attempt < 3 ? '; retrying' : ''}`);
  }
  throw new Error(`${cmd} failed: ${args.join(' ')}`);
}

function buildVrt() {
  const v = spawnSync('gdalwarp', ['--version'], { encoding: 'utf8' });
  if (v.status !== 0) throw new Error('GDAL is needed (gdalbuildvrt, gdalwarp): brew install gdal');
  fs.mkdirSync(RAW, { recursive: true });
  if (!fs.existsSync(VRT)) {
    run('gdalbuildvrt', ['-q', '-overwrite', VRT, ...CHUNKS.map((c) => `/vsicurl/${BASE}dem2m_${c}_m.tif`)]);
    log('built', VRT);
  }
  return VRT;
}

// the v4 tile's height, shore distance, lake id and level planes (side^2 cells with the halo)
function readTile(dataDir, idx, tx, ty) {
  const g = idx.grid, side = g.tile + 2 * g.halo, n = side * side;
  const buf = zlib.gunzipSync(fs.readFileSync(path.join(dataDir, 'tiles', `${tx}_${ty}.bin`)));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
  return { side, i0: tx * g.tile - g.halo, j0: ty * g.tile - g.halo, h: new Int16Array(ab, 0, n), lake: new Uint16Array(ab, n * 2, n), sd: new Int16Array(ab, n * 4, n), lvl: new Int16Array(ab, n * 6, n) };
}

// bilinear over the tile's cell centres (world metres in, metres out); water: the level of the water cells round it
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
  return { height: (x, z) => bil(T.h, x, z), sd: (x, z) => bil(T.sd, x, z), level };
}

function cutTile(G, opt, idx, vrt, tx, ty, r) {
  const { grid, proj } = G;
  const out = path.join(opt.out, `${tx}_${ty}.${r}m.bin`);
  if (!opt.force && fs.existsSync(out)) { log(`${out} exists (--force to cut again)`); return { skipped: true, bytes: fs.statSync(out).size }; }
  const n = (grid.tile + 2) * (grid.cell / r) + 1;
  const x0 = grid.cx(tx * grid.tile - 1), z0 = grid.cz(ty * grid.tile - 1);
  // pixel edges, degrees: x = (lon - lon0) mPerDegLon, z = -(lat - lat0) mPerDegLat
  const lonW = proj.lon0 + (x0 - r / 2) / proj.mPerDegLon, lonE = lonW + (n * r) / proj.mPerDegLon;
  const latN = proj.lat0 - (z0 - r / 2) / proj.mPerDegLat, latS = latN - (n * r) / proj.mPerDegLat;
  fs.mkdirSync(WORK, { recursive: true });
  const raw = path.join(WORK, `${tx}_${ty}.${r}m.f32`);
  const t0 = Date.now();
  run('gdalwarp', ['-q', '-overwrite', '-t_srs', 'EPSG:6318', '-te', lonW.toFixed(10), latS.toFixed(10), lonE.toFixed(10), latN.toFixed(10), '-ts', n, n,
    '-r', r >= 4 ? 'average' : 'bilinear', '-ot', 'Float32', '-of', 'ENVI', '-dstnodata', '-9999', '-wm', '512', '-multi', '-novshift', vrt, raw]);
  const b = fs.readFileSync(raw);
  if (b.length !== n * n * 4) throw new Error(`${raw}: ${b.length} bytes, expected ${n * n * 4}`);
  const a = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
  for (const f of [raw, raw.replace(/\.f32$/, '.hdr'), raw + '.aux.xml']) fs.rmSync(f, { force: true });
  const S = sampler(readTile(opt.data, idx, tx, ty), grid);
  let water = 0, filled = 0, lo = Infinity, hi = -Infinity, dmax = 0;
  const h = new Float64Array(n * n);
  for (let l = 0; l < n; l++) for (let k = 0; k < n; k++) {
    const q = l * n + k, x = x0 + k * r, z = z0 + l * r;
    let v = a[q];
    const sd = S.sd(x, z);
    if (sd < 0) { const lv = S.level(x, z); if (lv === lv) { v = lv; water++; } }
    if (!(v > CFG.elevationFloor)) { v = S.height(x, z); filled++; }
    h[q] = v;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
    if (sd >= 0) dmax = Math.max(dmax, Math.abs(v - S.height(x, z)));
  }
  // centimetres over base, delta-coded along each row (the row's first against the first of the row before)
  const base = Math.floor(lo), q16 = new Int16Array(n * n);
  if ((hi - base) * 100 > 65000) throw new Error('relief too large for Int16 centimetres');
  const cm = (v) => Math.round((v - base) * 100);
  for (let l = 0; l < n; l++) for (let k = 0; k < n; k++) {
    const q = l * n + k, prev = k ? cm(h[q - 1]) : l ? cm(h[q - n]) : 0;
    q16[q] = cm(h[q]) - prev;
  }
  const head = Buffer.alloc(HEADER);
  head.write('BWDT', 0, 'ascii'); head.writeUInt32LE(1, 4); head.writeInt32LE(tx, 8); head.writeInt32LE(ty, 12);
  head.writeUInt32LE(n, 16); head.writeUInt32LE(n, 20); head.writeFloatLE(r, 24); head.writeFloatLE(base, 28);
  head.writeDoubleLE(x0, 32); head.writeDoubleLE(z0, 40);
  const body = Buffer.concat([head, Buffer.from(q16.buffer)]);
  const gz = zlib.gzipSync(body, { level: 9 });
  fs.mkdirSync(opt.out, { recursive: true });
  fs.writeFileSync(out, gz);
  const info = { n, r, base, raw: body.length, bytes: gz.length, water, filled, min: +lo.toFixed(2), max: +hi.toFixed(2), maxOff10m: +dmax.toFixed(2), seconds: (Date.now() - t0) / 1000 };
  log(`${out}: ${n} x ${n} at ${r} m, ${(gz.length / 2 ** 20).toFixed(2)} MB gzip (${(body.length / 2 ** 20).toFixed(2)} raw), ${water} water samples set to the level, ${filled} filled from 10 m; land off the 10 m surface by up to ${dmax.toFixed(1)} m; ${info.seconds.toFixed(1)} s`);
  return info;
}

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  const idx = JSON.parse(fs.readFileSync(path.join(opt.data, 'index.json'), 'utf8'));
  const bbox = AREAS.bwca, proj = makeProjection(bbox), grid = { ...makeGrid(bbox, proj), tile: CFG.tile };
  if (idx.grid.originX !== grid.originX || idx.grid.cell !== grid.cell || idx.grid.tile !== grid.tile) throw new Error(`${opt.data} is not the bwca grid`);
  const G = { grid, proj };
  const tiles = [];
  if (opt.tiles) for (const t of opt.tiles.split(',')) { const [tx, ty] = t.split('_').map(Number); tiles.push({ tx, ty, name: t }); }
  else for (const name of opt.area.split(',')) {
    const A = DETAIL_AREAS[name];
    if (!A) throw new Error(`unknown area ${name} (${Object.keys(DETAIL_AREAS).join(', ')})`);
    const [x, z] = proj.toLocal(A.lat, A.lon);
    tiles.push({ tx: Math.floor(grid.ci(x) / grid.tile), ty: Math.floor(grid.cj(z) / grid.tile), name, x: +x.toFixed(1), z: +z.toFixed(1), note: A.note });
  }
  const vrt = buildVrt();
  const indexFile = path.join(opt.out, 'index.json');
  let index = { version: 1, tiles: {} };
  try { index = JSON.parse(fs.readFileSync(indexFile, 'utf8')); } catch { /* first run */ }
  for (const t of tiles) {
    const key = `${t.tx}_${t.ty}`;
    const e = index.tiles[key] || (index.tiles[key] = { res: [] });
    if (t.name) e.name = t.name;
    if (t.note) { e.note = t.note; e.at = [t.x, t.z]; }
    e.stats = e.stats || {};
    for (const r of opt.res) {
      log(`tile ${key} (${t.note || t.name}) at ${r} m`);
      const info = cutTile(G, opt, idx, vrt, t.tx, t.ty, r);
      if (!info.skipped) e.stats[r] = info;
      if (!e.res.includes(r)) e.res.push(r);
      e.res.sort((a, b) => a - b);
    }
  }
  index.layout = 'see scripts/detail-proto.mjs: <tx>_<ty>.<r>m.bin, gzip of a 48-byte header and Int16 centimetres over base, delta-coded along rows';
  index.source = 'Minnesota Statewide Seamless Lidar DEM, 2nd generation, 2 m (MnTOPO), Minnesota DNR / MnGeo; public domain';
  index.updated = new Date().toISOString();
  fs.writeFileSync(indexFile, JSON.stringify(index, null, 1));
  log('wrote', indexFile);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) main().catch((e) => { console.error(e); process.exit(1); });

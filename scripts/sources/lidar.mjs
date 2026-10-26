#!/usr/bin/env node
// D1-lidar: the Minnesota 2nd-generation LiDAR DEM (MnTOPO, 2 m, the spring 2021 Rainy Lake flight) derived onto the
// bake's 10 m grid, cached per tile in data-cache/lidar/ for round D2's bake. Fetch and derive only: no game code.
//
// For every 10 m cell of the bwca grid (scripts/config.mjs AREAS.bwca, the same origin, cell and tile index as
// bake.mjs) it keeps, from the 2 m pixels whose centres fall in the cell:
//   height  mean height (Int16 dm)                  slope  max 2 m slope (Uint8 degrees, Horn 3x3)
//   relief  max - min height (Uint8 dm)             rough  RMS residual from a plane fit (Uint8 cm)
//   level   the hydro-flattened water surface where the cell holds flat water (Int16 dm)
//   mask    bits: 1 LiDAR, 2 water, 4 edge of coverage, 8 shore (some flat water, under half), 16 US side
// Files: data-cache/lidar/<tx>_<ty>.<channel>.bin, gzip of the tile's core 256 x 256 cells (no halo), row-major,
// row 0 = the tile's north edge, little-endian. manifest.json describes the channels and lists the tiles written.
// The flight runs up to about 3 km into Ontario; bit 16 (from the OSM border) marks the US side, where D2 uses it.
//
// The DEM is read by window over HTTP from the state's cloud-optimised GeoTIFFs through a GDAL VRT (gdal_translate,
// /vsicurl/). One window covers a group of 4 x 4 tiles (about 10.5 km, 110 MB of Float32); it is deleted as soon as
// its cells are derived. A run is resumable: tiles already in the manifest are skipped.
//
// Usage: node scripts/sources/lidar.mjs [--tiles 30-34:10-12 | --tiles 31_11,32_11 | --area lakeone] [--force]
//          [--jobs 2] [--no-fetch] [--report] [--shots [dir]] [--data public/data]
//   --report  compares with today's heights over Lake One and lists the cliffs it finds (writes report.json)
//   --shots   quick-look PNGs per channel over Lake One and the whole box (default dir shots/d1-lidar)
// Needs GDAL (gdalbuildvrt, gdal_translate; `brew install gdal`). Stops when the disk has under 15 GB free.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn, spawnSync } from 'node:child_process';
import { PNG } from 'pngjs';
import { CFG, AREAS, log, makeProjection, makeGrid } from '../config.mjs';
import { readPbf } from '../osmpbf.mjs';

const SOURCE = {
  name: 'Minnesota Statewide Seamless Lidar DEM, 2nd generation, 2 m (MnTOPO)',
  agency: 'Minnesota DNR / MnGeo',
  hub: 'https://gisdata.mn.gov (item edc1ffac09254187b98a294fd8d9eaa8)',
  stac: 'https://stac.gisdata.mn.gov/collections/minnesota-100km-sections-DEM-2m',
  base: 'https://g46prsaddst01.blob.core.windows.net/mntopo/derivatives/dem2m_100k/',
  chunks: ['5_52', '5_53', '6_52', '6_53', '7_52', '7_53'],
  crs: 'NAD83(2011) / UTM zone 15N (EPSG:6344), NAVD88 heights (GEOID18), metres',
  flight: 'Rainy Lake LAB, leaf-off, 2021-04-17 to 2021-05-17 (QL1); 2 m resampled bilinear from the 0.5 m DEM',
  license: 'Public domain, no access constraints; acknowledgement appreciated (Minnesota DNR)',
};
const PX = 2;                // metres per source pixel
const GROUP = 4;             // tiles per window edge
const MARGIN = 3;            // source pixels around a window (Horn needs one)
const FLAT_TOL = 0.001;      // m: a pixel is hydro-flat when its four neighbours are within this
const MIN_FREE_GB = 15;
const REF = 400;             // m, subtracted before the plane-fit sums
const NODATA16 = -32768;

const CH = {
  height: { type: 'int16', unit: 'decimetres (NAVD88)', scale: 0.1, nodata: NODATA16, legend: 'mean of the 2 m pixels whose centres fall in the cell; on water, the flat water surface' },
  slope: { type: 'uint8', unit: 'degrees', nodata: 255, legend: 'steepest 2 m pixel in the cell (Horn 3x3 gradient on the 2 m grid, true metres)' },
  relief: { type: 'uint8', unit: 'decimetres', scale: 0.1, nodata: 255, legend: 'highest minus lowest 2 m pixel in the cell; 254 means 25.4 m or more' },
  rough: { type: 'uint8', unit: 'centimetres', scale: 0.01, nodata: 255, legend: 'RMS residual of the 2 m pixels from their least-squares plane (boulders, talus, ledges; a cliff step reads rough too); 254 means 2.54 m or more' },
  level: { type: 'int16', unit: 'decimetres (NAVD88)', scale: 0.1, nodata: NODATA16, legend: 'the hydro-flattened water surface: the mean of the cell\'s flat pixels (four neighbours within 1 mm), wherever the cell holds two or more of them; nodata elsewhere' },
  mask: { type: 'uint8', unit: 'bits', nodata: 0, legend: '1 = LiDAR (over half the cell\'s 2 m pixels hold data; the other channels are valid), 2 = water (at least half its pixels are hydro-flat), 4 = edge (some pixels hold no data: the edge of the flight), 8 = shore (some flat water, under half), 16 = US side of the international border (OSM Minnesota-Ontario boundary; set on every cell of a written tile, LiDAR or not). Use the LiDAR where 1 and 16 are both set: the flight runs up to about 3 km into Ontario in blocky steps, and Ontario stays on today\'s terrain. 0 = Ontario without LiDAR' },
};

// ---------- CLI ---------------------------------------------------------------------

function parseArgs(argv) {
  const o = { jobs: 2, fetch: true, report: false, shots: null, force: false, tiles: null, area: null, data: CFG.outDir };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tiles') o.tiles = argv[++i];
    else if (a === '--area') o.area = argv[++i];
    else if (a === '--force') o.force = true;
    else if (a === '--jobs') o.jobs = Math.max(1, +argv[++i]);
    else if (a === '--no-fetch') o.fetch = false;
    else if (a === '--report') o.report = true;
    else if (a === '--shots') o.shots = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'shots/d1-lidar';
    else if (a === '--data') o.data = argv[++i];
    else if (a === '--help') { console.log(fs.readFileSync(new URL(import.meta.url)).toString().split('\n').filter((l) => l.startsWith('//')).join('\n')); process.exit(0); }
    else throw new Error('unknown argument ' + a);
  }
  return o;
}

// ---------- UTM zone 15N on GRS80 (Krüger series, sub-millimetre across the box) ---------------------

const UTM = (() => {
  const a = 6378137, f = 1 / 298.257222101, k0 = 0.9996, lon0 = (-93 * Math.PI) / 180, FE = 500000;
  const e = Math.sqrt(f * (2 - f)), n = f / (2 - f), n2 = n * n, n3 = n2 * n, n4 = n3 * n, n5 = n4 * n, n6 = n5 * n;
  const A = (a / (1 + n)) * (1 + n2 / 4 + n4 / 64 + n6 / 256);
  const al = [0, n / 2 - (2 * n2) / 3 + (5 * n3) / 16 + (41 * n4) / 180 - (127 * n5) / 288 + (7891 * n6) / 37800,
    (13 * n2) / 48 - (3 * n3) / 5 + (557 * n4) / 1440 + (281 * n5) / 630 - (1983433 * n6) / 1935360,
    (61 * n3) / 240 - (103 * n4) / 140 + (15061 * n5) / 26880 + (167603 * n6) / 181440,
    (49561 * n4) / 161280 - (179 * n5) / 168 + (6601661 * n6) / 7257600,
    (34729 * n5) / 80640 - (3418889 * n6) / 1995840, (212378941 * n6) / 319334400];
  const be = [0, n / 2 - (2 * n2) / 3 + (37 * n3) / 96 - n4 / 360 - (81 * n5) / 512 + (96199 * n6) / 604800,
    n2 / 48 + n3 / 15 - (437 * n4) / 1440 + (46 * n5) / 105 - (1118711 * n6) / 3870720,
    (17 * n3) / 480 - (37 * n4) / 840 - (209 * n5) / 4480 + (5569 * n6) / 90720,
    (4397 * n4) / 161280 - (11 * n5) / 504 - (830251 * n6) / 7257600,
    (4583 * n5) / 161280 - (108847 * n6) / 3991680, (20648693 * n6) / 638668800];
  return {
    forward(lat, lon) {
      const phi = (lat * Math.PI) / 180, lam = (lon * Math.PI) / 180 - lon0;
      const s = Math.sin(phi);
      const t = Math.sinh(Math.atanh(s) - e * Math.atanh(e * s));
      const xp = Math.atan2(t, Math.cos(lam)), ep = Math.atanh(Math.sin(lam) / Math.sqrt(1 + t * t));
      let xi = xp, eta = ep;
      for (let j = 1; j <= 6; j++) { xi += al[j] * Math.sin(2 * j * xp) * Math.cosh(2 * j * ep); eta += al[j] * Math.cos(2 * j * xp) * Math.sinh(2 * j * ep); }
      return [FE + k0 * A * eta, k0 * A * xi];
    },
    inverse(E, N) {
      const xi = N / (k0 * A), eta = (E - FE) / (k0 * A);
      let xp = xi, ep = eta;
      for (let j = 1; j <= 6; j++) { xp -= be[j] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta); ep -= be[j] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta); }
      const tp = Math.sin(xp) / Math.sqrt(Math.sinh(ep) ** 2 + Math.cos(xp) ** 2);
      let tau = tp;
      for (let it = 0; it < 8; it++) {
        const sig = Math.sinh(e * Math.atanh((e * tau) / Math.sqrt(1 + tau * tau)));
        const ti = tau * Math.sqrt(1 + sig * sig) - sig * Math.sqrt(1 + tau * tau);
        const d = ((tp - ti) / Math.sqrt(1 + ti * ti)) * ((1 + (1 - e * e) * tau * tau) / ((1 - e * e) * Math.sqrt(1 + tau * tau)));
        tau += d;
        if (Math.abs(d) < 1e-13) break;
      }
      return [(Math.atan(tau) * 180) / Math.PI, ((lon0 + Math.atan2(Math.sinh(ep), Math.cos(xp))) * 180) / Math.PI];
    },
  };
})();

// ---------- the grid, the VRT and the manifest -------------------------------------------------

const DIR = path.join(CFG.cacheDir, 'lidar');
const RAW = path.join(DIR, 'raw');
const MANIFEST = path.join(DIR, 'manifest.json');
const VRT = path.join(RAW, 'dem2m.vrt');
const key = (tx, ty) => `${tx}_${ty}`;
const tileFile = (tx, ty, ch) => path.join(DIR, `${tx}_${ty}.${ch}.bin`);

function setup() {
  const bbox = AREAS.bwca;
  const proj = makeProjection(bbox);
  const grid = makeGrid(bbox, proj);
  // continuous cell coordinates (u east, v south) of a lat/lon, and back
  const toUV = (lat, lon) => [((lon - proj.lon0) * proj.mPerDegLon - grid.originX) / grid.cell, (-(lat - proj.lat0) * proj.mPerDegLat - grid.originZ) / grid.cell];
  const fromUV = (u, v) => proj.toLatLon(grid.originX + u * grid.cell, grid.originZ + v * grid.cell);
  return { bbox, proj, grid, toUV, fromUV };
}

function readManifest(G) {
  let m = null;
  try { m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch { /* first run */ }
  if (!m) m = { tiles: {}, empty: [], fetched: { windows: 0, rawBytes: 0, seconds: 0 } };
  const { grid, proj, bbox } = G;
  Object.assign(m, {
    source: 'lidar',
    citation: SOURCE,
    grid: { area: 'bwca', bbox, proj: { lat0: proj.lat0, lon0: proj.lon0, mPerDegLat: proj.mPerDegLat, mPerDegLon: proj.mPerDegLon },
      width: grid.width, height: grid.height, cell: grid.cell, originX: grid.originX, originZ: grid.originZ, tile: CFG.tile, ntx: grid.ntx, nty: grid.nty },
    layout: 'data-cache/lidar/<tx>_<ty>.<channel>.bin: gzip of the tile\'s core 256 x 256 cells (no halo), row-major, row 0 = the tile\'s north edge (cell j = ty*256 + row, i = tx*256 + col), little-endian. Tiles not listed in `tiles` have no LiDAR: every channel is nodata there.',
    compression: 'gzip',
    channels: CH,
    method: {
      binning: '2 m source pixels are assigned to the 10 m cell holding their centre (UTM 15N to lat/lon by the Krueger series, then the bake projection); about 25 pixels per cell',
      datum: 'horizontal NAD83(2011) is used as the game\'s WGS84 lat/lon (about 1 m apart here, a tenth of a cell); heights NAVD88, the same as 3DEP',
      flat: `hydro-flattened water: a pixel whose four neighbours are within ${FLAT_TOL * 1000} mm (lakes and most river reaches are exactly flat in this DEM; land never is)`,
      slope: 'Horn 3x3 on the 2 m grid; pixels next to nodata have no slope',
      rough: 'least-squares plane h = a + b*x + c*z over the cell\'s pixels; RMS of the residuals',
    },
  });
  return m;
}

function writeManifest(m) {
  m.updated = new Date().toISOString();
  const keys = Object.keys(m.tiles);
  m.summary = { tiles: keys.length, cells: keys.reduce((s, k) => s + m.tiles[k].valid, 0), water: keys.reduce((s, k) => s + m.tiles[k].water, 0) };
  fs.writeFileSync(MANIFEST + '.part', JSON.stringify(m, null, 1));
  fs.renameSync(MANIFEST + '.part', MANIFEST);
}

function freeGB() {
  const s = fs.statfsSync(CFG.cacheDir);
  return (s.bavail * s.bsize) / 2 ** 30;
}

function haveGdal() {
  const r = spawnSync('gdal_translate', ['--version'], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('GDAL is needed (gdal_translate, gdalbuildvrt): brew install gdal');
  return r.stdout.trim();
}

function buildVrt() {
  fs.mkdirSync(RAW, { recursive: true });
  if (!fs.existsSync(VRT)) {
    const srcs = SOURCE.chunks.map((c) => `/vsicurl/${SOURCE.base}dem2m_${c}_m.tif`);
    const r = spawnSync('gdalbuildvrt', ['-q', '-overwrite', VRT, ...srcs], { encoding: 'utf8' });
    if (r.status !== 0 || !fs.existsSync(VRT)) throw new Error('gdalbuildvrt failed: ' + r.stderr);
    log('built', VRT);
  }
  const x = fs.readFileSync(VRT, 'utf8');
  const [W, H] = [+x.match(/rasterXSize="(\d+)"/)[1], +x.match(/rasterYSize="(\d+)"/)[1]];
  const gt = x.match(/<GeoTransform>([^<]+)<\/GeoTransform>/)[1].split(',').map(Number);
  if (gt[1] !== PX || gt[5] !== -PX) throw new Error('unexpected pixel size in the VRT: ' + gt);
  return { W, H, E0: gt[0], N0: gt[3] };
}

// gdal_translate a pixel window of the VRT to a raw Float32 ENVI file, retried; resolves to the file's path
function fetchWindow(vrt, c0, r0, w, h, out, outsize) {
  const args = ['-q', '-of', 'ENVI', '-srcwin', c0, r0, w, h, ...(outsize ? ['-outsize', outsize[0], outsize[1], '-r', 'nearest'] : []), VRT, out].map(String);
  const env = { ...process.env, GDAL_HTTP_MAX_RETRY: '6', GDAL_HTTP_RETRY_DELAY: '3', CPL_VSIL_CURL_CACHE_SIZE: '67108864' };
  const once = () => new Promise((resolve) => {
    const p = spawn('gdal_translate', args, { env, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => resolve({ code, err }));
  });
  return (async () => {
    const want = (outsize ? outsize[0] * outsize[1] : w * h) * 4;
    for (let attempt = 0; attempt < 4; attempt++) {
      const { code, err } = await once();
      if (code === 0 && fs.existsSync(out) && fs.statSync(out).size === want) return out;
      log(`window ${c0},${r0} ${w}x${h} failed (${code}): ${err.trim().slice(0, 160)}; retrying`);
      await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
    }
    throw new Error('could not fetch window ' + [c0, r0, w, h]);
  })();
}

function removeWindow(file) {
  for (const f of [file, file.replace(/\.bin$/, '.hdr'), file + '.aux.xml']) fs.rmSync(f, { force: true });
}

function readF32(file, n) {
  const b = fs.readFileSync(file);
  if (b.length !== n * 4) throw new Error(`${file}: ${b.length} bytes, expected ${n * 4}`);
  return new Float32Array(b.buffer, b.byteOffset, n);
}

// UTM bounding box of a rectangle of cells [i0, i1) x [j0, j1), sampled along its edges
function utmBox(G, i0, j0, i1, j1) {
  let e0 = Infinity, e1 = -Infinity, n0 = Infinity, n1 = -Infinity;
  const S = 16;
  for (let s = 0; s <= S; s++) {
    const t = s / S;
    for (const [u, v] of [[i0 + (i1 - i0) * t, j0], [i0 + (i1 - i0) * t, j1], [i0, j0 + (j1 - j0) * t], [i1, j0 + (j1 - j0) * t]]) {
      const [lat, lon] = G.fromUV(u, v);
      const [E, N] = UTM.forward(lat, lon);
      if (E < e0) e0 = E; if (E > e1) e1 = E; if (N < n0) n0 = N; if (N > n1) n1 = N;
    }
  }
  return { e0, e1, n0, n1 };
}

// ---------- coverage: which tiles hold any LiDAR at all (one 64 m read of the whole box) ---------------

async function coverage(G, vrt, m) {
  if (m.coverage && m.coverage.vrt === `${vrt.W}x${vrt.H}@${vrt.E0},${vrt.N0}`) return new Set(m.coverage.tiles);
  const { grid } = G;
  const F = 32; // 64 m
  const b = utmBox(G, 0, 0, grid.width, grid.height);
  const c0 = Math.max(0, Math.floor((b.e0 - vrt.E0) / PX / F) * F), c1 = Math.min(vrt.W, Math.ceil((b.e1 - vrt.E0) / PX / F) * F);
  const r0 = Math.max(0, Math.floor((vrt.N0 - b.n1) / PX / F) * F), r1 = Math.min(vrt.H, Math.ceil((vrt.N0 - b.n0) / PX / F) * F);
  const w = Math.floor((c1 - c0) / F), h = Math.floor((r1 - r0) / F);
  const out = path.join(RAW, 'coverage64.bin');
  log(`coverage: reading the box at 64 m (${w} x ${h})`);
  await fetchWindow(vrt, c0, r0, w * F, h * F, out, [w, h]);
  const a = readF32(out, w * h);
  const tiles = [];
  const T = CFG.tile;
  for (let ty = 0; ty < grid.nty; ty++) for (let tx = 0; tx < grid.ntx; tx++) {
    const tb = utmBox(G, tx * T, ty * T, (tx + 1) * T, (ty + 1) * T);
    const x0 = Math.max(0, Math.floor((tb.e0 - vrt.E0) / PX / F) - (c0 / F) - 2), x1 = Math.min(w - 1, Math.ceil((tb.e1 - vrt.E0) / PX / F) - (c0 / F) + 2);
    const y0 = Math.max(0, Math.floor((vrt.N0 - tb.n1) / PX / F) - (r0 / F) - 2), y1 = Math.min(h - 1, Math.ceil((vrt.N0 - tb.n0) / PX / F) - (r0 / F) + 2);
    let any = false;
    for (let y = y0; y <= y1 && !any; y++) for (let x = x0; x <= x1; x++) { const v = a[y * w + x]; if (v > CFG.elevationFloor) { any = true; break; } }
    if (any) tiles.push(key(tx, ty));
  }
  removeWindow(out);
  m.coverage = { vrt: `${vrt.W}x${vrt.H}@${vrt.E0},${vrt.N0}`, tiles, note: 'tiles whose footprint (plus 128 m) touches any LiDAR at 64 m' };
  log(`coverage: ${tiles.length} of ${grid.ntx * grid.nty} tiles touch the LiDAR`);
  return new Set(tiles);
}

// ---------- derive one window ---------------------------------------------------------------

// a: Float32 window (w x h, UL corner at E0, N0), the cell rectangle [i0, i0+ni) x [j0, j0+nj); returns per-cell channels
function derive(G, a, w, h, E0, N0, i0, j0, ni, nj) {
  const NC = ni * nj;
  const cnt = new Uint16Array(NC), nv = new Uint16Array(NC), nflat = new Uint16Array(NC);
  const sh = new Float64Array(NC), sp = new Float64Array(NC), sq = new Float64Array(NC), spp = new Float64Array(NC), sqq = new Float64Array(NC), spq = new Float64Array(NC);
  const sph = new Float64Array(NC), sqh = new Float64Array(NC), shh = new Float64Array(NC), sflat = new Float64Array(NC);
  const hmin = new Float32Array(NC).fill(Infinity), hmax = new Float32Array(NC).fill(-Infinity), smax = new Float32Array(NC).fill(-1);
  // pixel centre -> (u, v) on a lattice every L pixels, bilinear in between (the map bends by far under a millimetre over 64 m)
  const L = 32, KX = Math.ceil((w - 1) / L) + 1, KY = Math.ceil((h - 1) / L) + 1;
  const LU = new Float64Array(KX * KY), LV = new Float64Array(KX * KY);
  for (let ky = 0; ky < KY; ky++) for (let kx = 0; kx < KX; kx++) {
    const [lat, lon] = UTM.inverse(E0 + (kx * L + 0.5) * PX, N0 - (ky * L + 0.5) * PX);
    const [u, v] = G.toUV(lat, lon);
    LU[ky * KX + kx] = u; LV[ky * KX + kx] = v;
  }
  const rowU = new Float64Array(KX), rowV = new Float64Array(KX);
  const FLOOR = CFG.elevationFloor, cell = G.grid.cell, RAD = 180 / Math.PI, inv8 = 1 / (8 * PX);
  for (let r = 1; r < h - 1; r++) {
    const ky = Math.min(KY - 2, Math.floor(r / L)), fy = (r - ky * L) / L;
    for (let kx = 0; kx < KX; kx++) {
      const p = ky * KX + kx;
      rowU[kx] = LU[p] + (LU[p + KX] - LU[p]) * fy;
      rowV[kx] = LV[p] + (LV[p + KX] - LV[p]) * fy;
    }
    for (let c = 1; c < w - 1; c++) {
      const kx = Math.min(KX - 2, Math.floor(c / L)), fx = (c - kx * L) / L;
      const u = rowU[kx] + (rowU[kx + 1] - rowU[kx]) * fx, v = rowV[kx] + (rowV[kx + 1] - rowV[kx]) * fx;
      const iu = Math.floor(u), iv = Math.floor(v);
      const ci = iu - i0, cj = iv - j0;
      if (ci < 0 || cj < 0 || ci >= ni || cj >= nj) continue;
      const q = cj * ni + ci;
      cnt[q]++;
      const k = r * w + c, z5 = a[k];
      if (!(z5 > FLOOR)) continue;
      nv[q]++;
      const hz = z5 - REF, px = (u - iu - 0.5) * cell, pz = (v - iv - 0.5) * cell;
      sh[q] += hz; sp[q] += px; sq[q] += pz; spp[q] += px * px; sqq[q] += pz * pz; spq[q] += px * pz;
      sph[q] += px * hz; sqh[q] += pz * hz; shh[q] += hz * hz;
      if (z5 < hmin[q]) hmin[q] = z5;
      if (z5 > hmax[q]) hmax[q] = z5;
      const z1 = a[k - w - 1], z2 = a[k - w], z3 = a[k - w + 1], z4 = a[k - 1], z6 = a[k + 1], z7 = a[k + w - 1], z8 = a[k + w], z9 = a[k + w + 1];
      if (z1 > FLOOR && z2 > FLOOR && z3 > FLOOR && z4 > FLOOR && z6 > FLOOR && z7 > FLOOR && z8 > FLOOR && z9 > FLOOR) {
        const gx = (z3 + 2 * z6 + z9 - (z1 + 2 * z4 + z7)) * inv8, gy = (z7 + 2 * z8 + z9 - (z1 + 2 * z2 + z3)) * inv8;
        const s = Math.atan(Math.sqrt(gx * gx + gy * gy)) * RAD;
        if (s > smax[q]) smax[q] = s;
        if (Math.abs(z4 - z5) < FLAT_TOL && Math.abs(z6 - z5) < FLAT_TOL && Math.abs(z2 - z5) < FLAT_TOL && Math.abs(z8 - z5) < FLAT_TOL) { nflat[q]++; sflat[q] += z5; }
      }
    }
  }
  const out = {
    height: new Int16Array(NC).fill(NODATA16), slope: new Uint8Array(NC).fill(255), relief: new Uint8Array(NC).fill(255),
    rough: new Uint8Array(NC).fill(255), level: new Int16Array(NC).fill(NODATA16), mask: new Uint8Array(NC),
  };
  for (let q = 0; q < NC; q++) {
    const n = nv[q];
    if (!n || n * 2 <= cnt[q]) continue; // under half the cell covered: nodata (the border, the edge of the flight)
    const nf = nflat[q];
    if (nf >= 2) out.level[q] = Math.round((sflat[q] / nf) * 10);
    let m = 1;
    if (n < cnt[q]) m |= 4;
    if (nf * 2 >= n) m |= 2; else if (nf > 0) m |= 8;
    out.mask[q] = m;
    out.height[q] = Math.round((sh[q] / n + REF) * 10);
    if (smax[q] >= 0) out.slope[q] = Math.min(90, Math.round(smax[q]));
    out.relief[q] = Math.min(254, Math.round((hmax[q] - hmin[q]) * 10));
    if (n >= 6) {
      // normal equations [n sp sq; sp spp spq; sq spq sqq] b = [sh sph sqh]
      const a11 = n, a12 = sp[q], a13 = sq[q], a22 = spp[q], a23 = spq[q], a33 = sqq[q];
      const b1 = sh[q], b2 = sph[q], b3 = sqh[q];
      const c11 = a22 * a33 - a23 * a23, c12 = a13 * a23 - a12 * a33, c13 = a12 * a23 - a13 * a22;
      const det = a11 * c11 + a12 * c12 + a13 * c13;
      if (Math.abs(det) > 1e-6) {
        const c22 = a11 * a33 - a13 * a13, c23 = a12 * a13 - a11 * a23, c33 = a11 * a22 - a12 * a12;
        const x1 = (c11 * b1 + c12 * b2 + c13 * b3) / det, x2 = (c12 * b1 + c22 * b2 + c23 * b3) / det, x3 = (c13 * b1 + c23 * b2 + c33 * b3) / det;
        const sse = shh[q] - (x1 * b1 + x2 * b2 + x3 * b3);
        out.rough[q] = Math.min(254, Math.round(Math.sqrt(Math.max(0, sse) / n) * 100));
      }
    }
  }
  return out;
}

// ---------- the fetch loop -------------------------------------------------------------------

function wantedTiles(G, opt) {
  const { grid } = G;
  const all = [];
  if (opt.tiles) {
    for (const tok of opt.tiles.split(',')) {
      let m;
      if ((m = tok.match(/^(\d+)_(\d+)$/))) all.push([+m[1], +m[2]]);
      else if ((m = tok.match(/^(\d+)-(\d+):(\d+)-(\d+)$/))) { for (let ty = +m[3]; ty <= +m[4]; ty++) for (let tx = +m[1]; tx <= +m[2]; tx++) all.push([tx, ty]); }
      else throw new Error('bad --tiles token ' + tok + ' (use tx_ty or tx0-tx1:ty0-ty1)');
    }
  } else if (opt.area) {
    const r = areaTiles(G, AREAS[opt.area] || (() => { throw new Error('unknown area ' + opt.area); })());
    for (let ty = r.ty0; ty <= r.ty1; ty++) for (let tx = r.tx0; tx <= r.tx1; tx++) all.push([tx, ty]);
  } else {
    for (let ty = 0; ty < grid.nty; ty++) for (let tx = 0; tx < grid.ntx; tx++) all.push([tx, ty]);
  }
  return all.filter(([tx, ty]) => tx >= 0 && ty >= 0 && tx < grid.ntx && ty < grid.nty);
}

function areaCells(G, bb) {
  const [u0, v0] = G.toUV(bb.north, bb.west), [u1, v1] = G.toUV(bb.south, bb.east);
  return { i0: Math.max(0, Math.floor(u0)), j0: Math.max(0, Math.floor(v0)), i1: Math.min(G.grid.width, Math.ceil(u1)), j1: Math.min(G.grid.height, Math.ceil(v1)) };
}
function areaTiles(G, bb) {
  const c = areaCells(G, bb), T = CFG.tile;
  return { tx0: Math.floor(c.i0 / T), ty0: Math.floor(c.j0 / T), tx1: Math.floor((c.i1 - 1) / T), ty1: Math.floor((c.j1 - 1) / T) };
}

async function fetchAll(G, opt, m) {
  const ver = haveGdal();
  log(ver);
  const vrt = buildVrt();
  const covered = await coverage(G, vrt, m);
  writeManifest(m);
  const T = CFG.tile;
  const empty = new Set(m.empty);
  const todo = wantedTiles(G, opt).filter(([tx, ty]) => covered.has(key(tx, ty)) && (opt.force || (!m.tiles[key(tx, ty)] && !empty.has(key(tx, ty)))));
  // group into 4 x 4 windows
  const groups = new Map();
  for (const [tx, ty] of todo) {
    const g = key(Math.floor(tx / GROUP), Math.floor(ty / GROUP));
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push([tx, ty]);
  }
  const list = [...groups.values()];
  log(`${todo.length} tiles to derive in ${list.length} windows (${covered.size} tiles touch the LiDAR, ${Object.keys(m.tiles).length} done, ${empty.size} empty)`);
  let next = 0, done = 0, stop = false;
  const t0 = Date.now();
  const worker = async (wid) => {
    while (!stop && next < list.length) {
      const tiles = list[next++];
      const gb = freeGB();
      if (gb < MIN_FREE_GB) { stop = true; log(`STOP: ${gb.toFixed(1)} GB free, under ${MIN_FREE_GB} GB`); break; }
      const tx0 = Math.min(...tiles.map((t) => t[0])), tx1 = Math.max(...tiles.map((t) => t[0])) + 1;
      const ty0 = Math.min(...tiles.map((t) => t[1])), ty1 = Math.max(...tiles.map((t) => t[1])) + 1;
      const i0 = tx0 * T, j0 = ty0 * T, ni = (tx1 - tx0) * T, nj = (ty1 - ty0) * T;
      const b = utmBox(G, i0, j0, i0 + ni, j0 + nj);
      const c0 = Math.max(0, Math.floor((b.e0 - vrt.E0) / PX) - MARGIN), c1 = Math.min(vrt.W, Math.ceil((b.e1 - vrt.E0) / PX) + MARGIN);
      const r0 = Math.max(0, Math.floor((vrt.N0 - b.n1) / PX) - MARGIN), r1 = Math.min(vrt.H, Math.ceil((vrt.N0 - b.n0) / PX) + MARGIN);
      const tag = `${tx0}-${tx1 - 1}:${ty0}-${ty1 - 1}`;
      if (c1 <= c0 || r1 <= r0) { for (const [tx, ty] of tiles) empty.add(key(tx, ty)); continue; }
      const w = c1 - c0, h = r1 - r0;
      const file = path.join(RAW, `win_${tx0}_${ty0}_${wid}.bin`);
      const tf = Date.now();
      await fetchWindow(vrt, c0, r0, w, h, file);
      const fetchS = (Date.now() - tf) / 1000;
      const tp = Date.now();
      const a = readF32(file, w * h);
      const res = derive(G, a, w, h, vrt.E0 + c0 * PX, vrt.N0 - r0 * PX, i0, j0, ni, nj);
      removeWindow(file);
      let wrote = 0;
      for (const [tx, ty] of tiles) {
        const st = writeTile(res, (tx - tx0) * T, (ty - ty0) * T, ni, tx, ty);
        if (st) { m.tiles[key(tx, ty)] = st; empty.delete(key(tx, ty)); wrote++; } else empty.add(key(tx, ty));
      }
      m.empty = [...empty].sort();
      m.fetched.windows++; m.fetched.rawBytes += w * h * 4; m.fetched.seconds = +(m.fetched.seconds + fetchS).toFixed(1);
      writeManifest(m);
      done++;
      const el = (Date.now() - t0) / 1000;
      log(`window ${tag}: ${w}x${h} px fetched ${fetchS.toFixed(1)} s, derived ${((Date.now() - tp) / 1000).toFixed(1)} s, ${wrote}/${tiles.length} tiles hold LiDAR  [${done}/${list.length}, ${(el / 60).toFixed(1)} min, ~${((el / done) * (list.length - done) / 60).toFixed(0)} min left, ${freeGB().toFixed(1)} GB free]`);
    }
  };
  await Promise.all(Array.from({ length: opt.jobs }, (_, k) => worker(k)));
  if (stop) process.exitCode = 2;
}

// ---------- the international border: mask bit 16 on the US side ---------------------------------

// The Minnesota-Ontario boundary from the bake's OSM cut (the ways shared by relations 165471 Minnesota and
// 68841 Ontario), chained west to east and closed round the south: a polygon in cell coordinates whose inside is the US.
function borderPolygon(G) {
  const dir = path.join(CFG.cacheDir, 'osm');
  const g0 = G.fromUV(0, G.grid.height), g1 = G.fromUV(G.grid.width, 0); // [lat, lon] of the grid's SW and NE corners
  const cuts = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^minnesota-latest.*\.osm\.pbf$/.test(f)) : [];
  const fits = (f) => {
    const m = f.match(/latest-([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)\.cut/);
    return !m || (+m[1] <= g0[0] && +m[2] <= g0[1] && +m[3] >= g1[0] && +m[4] >= g1[1]);
  };
  const file = cuts.filter(fits).sort((a, b) => fs.statSync(path.join(dir, a)).size - fs.statSync(path.join(dir, b)).size)[0];
  if (!file) { log('border: no OSM extract covering the grid in', dir, '(run the bake once); bit 16 not set'); return null; }
  const mem = {};
  readPbf(path.join(dir, file), { relation(id, ms) { if (id === 68841 || id === 165471) mem[id] = new Set(ms.filter((x) => x.type === 'way').map((x) => x.ref)); } });
  if (!mem[68841] || !mem[165471]) { log('border: the Minnesota or Ontario relation is missing from', file); return null; }
  const shared = new Set([...mem[68841]].filter((w) => mem[165471].has(w)));
  const ways = new Map();
  readPbf(path.join(dir, file), { way(id, refs) { if (shared.has(id)) ways.set(id, refs); } });
  const need = new Set([...ways.values()].flat()), nodes = new Map();
  readPbf(path.join(dir, file), { node(id, lat, lon) { if (need.has(id)) nodes.set(id, [lat, lon]); } });
  // chain the ways into one line from its western end
  const at = new Map();
  for (const [id, refs] of ways) for (const e of [refs[0], refs[refs.length - 1]]) { if (!at.has(e)) at.set(e, []); at.get(e).push(id); }
  const ends = [...at].filter(([, v]) => v.length === 1).map(([n]) => n);
  if (ends.length !== 2) { log(`border: the shared ways do not form one line (${ends.length} ends); bit 16 not set`); return null; }
  let cur = nodes.get(ends[0])[1] < nodes.get(ends[1])[1] ? ends[0] : ends[1];
  const line = [cur], used = new Set();
  for (;;) {
    const id = (at.get(cur) || []).find((w) => !used.has(w));
    if (id === undefined) break;
    used.add(id);
    const refs = ways.get(id), fwd = refs[0] === cur;
    const seq = fwd ? refs : [...refs].reverse();
    for (let i = 1; i < seq.length; i++) line.push(seq[i]);
    cur = seq[seq.length - 1];
  }
  const pts = line.map((n) => G.toUV(...nodes.get(n)));
  const [uw] = pts[0], [ue] = pts[pts.length - 1];
  if (!(uw < 0 && ue > G.grid.width)) { log('border: the line does not cross the whole grid; bit 16 not set'); return null; }
  const south = G.grid.height + 1000;
  pts.push([ue, south], [uw, south]);
  log(`border: ${ways.size} ways, ${pts.length - 2} points (${file})`);
  return pts;
}

// even-odd fill of the polygon on cell centres for rows [j0, j0+nj) x columns [i0, i0+ni)
function rasterPolygon(poly, i0, j0, ni, nj) {
  const out = new Uint8Array(ni * nj), xs = [];
  for (let r = 0; r < nj; r++) {
    const vc = j0 + r + 0.5;
    xs.length = 0;
    for (let k = 0, n = poly.length; k < n; k++) {
      const [u1, v1] = poly[k], [u2, v2] = poly[(k + 1) % n];
      if ((v1 <= vc) !== (v2 <= vc)) xs.push(u1 + ((vc - v1) * (u2 - u1)) / (v2 - v1));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.max(0, Math.ceil(xs[k] - 0.5) - i0), b = Math.min(ni - 1, Math.floor(xs[k + 1] - 0.5) - i0);
      for (let c = a; c <= b; c++) out[r * ni + c] = 1;
    }
  }
  return out;
}

// sets (or clears) bit 16 on every written tile that has not had it yet
function applyBorder(G, m, force) {
  const todo = Object.keys(m.tiles).filter((k) => force || m.tiles[k].us === undefined);
  if (!todo.length) return;
  const poly = borderPolygon(G);
  if (!poly) return;
  const T = CFG.tile;
  for (const k of todo) {
    const [tx, ty] = k.split('_').map(Number);
    const mask = readTile(tx, ty, 'mask'), us = rasterPolygon(poly, tx * T, ty * T, T, T);
    let nUs = 0, nOn = 0;
    for (let q = 0; q < T * T; q++) {
      mask[q] = us[q] ? mask[q] | 16 : mask[q] & ~16;
      if (mask[q] & 1) { if (us[q]) nUs++; else nOn++; }
    }
    const f = tileFile(tx, ty, 'mask');
    fs.writeFileSync(f + '.part', zlib.gzipSync(Buffer.from(mask.buffer, mask.byteOffset, mask.byteLength), { level: 9 }));
    fs.renameSync(f + '.part', f);
    Object.assign(m.tiles[k], { us: nUs, ontario: nOn });
  }
  m.border = { source: 'OpenStreetMap contributors (ODbL): the ways shared by relations 165471 (Minnesota) and 68841 (Ontario), from the bake\'s Geofabrik cut', bit: 16 };
  log(`border: bit 16 set on ${todo.length} tiles`);
}

// cut one tile's core cells out of a window's channels and write them; null when no cell holds LiDAR
function writeTile(res, oi, oj, ni, tx, ty) {
  const T = CFG.tile, NT = T * T;
  const tile = {};
  for (const ch of Object.keys(CH)) tile[ch] = new res[ch].constructor(NT);
  let valid = 0, water = 0, edge = 0, smx = 0, hmn = Infinity, hmx = -Infinity;
  for (let r = 0; r < T; r++) {
    const src = (oj + r) * ni + oi;
    for (const ch of Object.keys(CH)) tile[ch].set(res[ch].subarray(src, src + T), r * T);
  }
  for (let q = 0; q < NT; q++) {
    const mk = tile.mask[q];
    if (mk & 1) {
      valid++;
      if (mk & 2) water++;
      if (mk & 4) edge++;
      if (tile.slope[q] !== 255 && tile.slope[q] > smx) smx = tile.slope[q];
      const hh = tile.height[q] / 10;
      if (hh < hmn) hmn = hh; if (hh > hmx) hmx = hh;
    }
  }
  for (const ch of Object.keys(CH)) fs.rmSync(tileFile(tx, ty, ch), { force: true });
  if (!valid) return null;
  let bytes = 0;
  for (const ch of Object.keys(CH)) {
    const t = tile[ch];
    const gz = zlib.gzipSync(Buffer.from(t.buffer, t.byteOffset, t.byteLength), { level: 9 });
    fs.writeFileSync(tileFile(tx, ty, ch) + '.part', gz);
    fs.renameSync(tileFile(tx, ty, ch) + '.part', tileFile(tx, ty, ch));
    bytes += gz.length;
  }
  return { valid, water, edge, maxSlope: smx, h: [+hmn.toFixed(1), +hmx.toFixed(1)], bytes };
}

// ---------- reading the products back -------------------------------------------------------

function readTile(tx, ty, ch) {
  const f = tileFile(tx, ty, ch);
  if (!fs.existsSync(f)) return null;
  const b = zlib.gunzipSync(fs.readFileSync(f));
  const C = { int16: Int16Array, uint8: Uint8Array }[CH[ch].type];
  return new C(b.buffer, b.byteOffset, b.byteLength / C.BYTES_PER_ELEMENT);
}

// a rectangle of cells [i0, i1) x [j0, j1) of one channel from the cached tiles (nodata where no tile)
function readRect(m, ch, i0, j0, i1, j1) {
  const T = CFG.tile, w = i1 - i0, h = j1 - j0;
  const C = { int16: Int16Array, uint8: Uint8Array }[CH[ch].type];
  const out = new C(w * h).fill(CH[ch].nodata);
  for (let ty = Math.floor(j0 / T); ty <= Math.floor((j1 - 1) / T); ty++) for (let tx = Math.floor(i0 / T); tx <= Math.floor((i1 - 1) / T); tx++) {
    if (!m.tiles[key(tx, ty)]) continue;
    const t = readTile(tx, ty, ch);
    if (!t) continue;
    for (let r = 0; r < T; r++) {
      const j = ty * T + r;
      if (j < j0 || j >= j1) continue;
      for (let c = 0; c < T; c++) {
        const i = tx * T + c;
        if (i < i0 || i >= i1) continue;
        out[(j - j0) * w + (i - i0)] = t[r * T + c];
      }
    }
  }
  return out;
}

// today's game heights (public/data tiles, v3: height, lake, sdist, level; halo'd) over a cell rectangle
const loadIndex = (dataDir) => JSON.parse(fs.readFileSync(path.join(dataDir, 'index.json'), 'utf8'));
function readGame(dataDir, i0, j0, i1, j1, idx = loadIndex(dataDir)) {
  const { tile: T, halo: HALO } = idx.grid, SIDE = T + 2 * HALO, w = i1 - i0, h = j1 - j0;
  const hgt = new Int16Array(w * h), lake = new Uint16Array(w * h), sd = new Int16Array(w * h), lvl = new Int16Array(w * h);
  for (let ty = Math.floor(j0 / T); ty <= Math.floor((j1 - 1) / T); ty++) for (let tx = Math.floor(i0 / T); tx <= Math.floor((i1 - 1) / T); tx++) {
    const b = zlib.gunzipSync(fs.readFileSync(path.join(dataDir, 'tiles', `${tx}_${ty}.bin`)));
    const NS = SIDE * SIDE;
    const th = new Int16Array(b.buffer, b.byteOffset, NS), tl = new Uint16Array(b.buffer, b.byteOffset + NS * 2, NS);
    const ts = new Int16Array(b.buffer, b.byteOffset + NS * 4, NS), tv = new Int16Array(b.buffer, b.byteOffset + NS * 6, NS);
    for (let r = 0; r < T; r++) {
      const j = ty * T + r;
      if (j < j0 || j >= j1) continue;
      for (let c = 0; c < T; c++) {
        const i = tx * T + c;
        if (i < i0 || i >= i1) continue;
        const s = (r + HALO) * SIDE + c + HALO, d = (j - j0) * w + (i - i0);
        hgt[d] = th[s]; lake[d] = tl[s]; sd[d] = ts[s]; lvl[d] = tv[s];
      }
    }
  }
  return { idx, hgt, lake, sd, lvl };
}

// ---------- the Lake One report and the cliffs -------------------------------------------------

const pct = (arr, p) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(arr.length * p)))];
function stats(vals) {
  const a = Float64Array.from(vals).sort();
  if (!a.length) return null;
  let s = 0, s2 = 0;
  for (const v of a) { s += v; s2 += v * v; }
  return { n: a.length, mean: +(s / a.length).toFixed(2), rms: +Math.sqrt(s2 / a.length).toFixed(2), p5: +pct(a, 0.05).toFixed(2), median: +pct(a, 0.5).toFixed(2), p95: +pct(a, 0.95).toFixed(2), min: +a[0].toFixed(2), max: +a[a.length - 1].toFixed(2) };
}

// 10 m slope (Horn) of a height grid in decimetres, degrees
function slope10(hgt, w, h, valid) {
  const out = new Float32Array(w * h).fill(-1);
  const R = 180 / Math.PI, k8 = 1 / (8 * 10 * 10); // dm -> m and 10 m cells
  for (let j = 1; j < h - 1; j++) for (let i = 1; i < w - 1; i++) {
    const q = j * w + i;
    if (valid && !(valid[q - w - 1] && valid[q - w] && valid[q - w + 1] && valid[q - 1] && valid[q] && valid[q + 1] && valid[q + w - 1] && valid[q + w] && valid[q + w + 1])) continue;
    const gx = (hgt[q - w + 1] + 2 * hgt[q + 1] + hgt[q + w + 1] - hgt[q - w - 1] - 2 * hgt[q - 1] - hgt[q + w - 1]) * k8;
    const gy = (hgt[q + w - 1] + 2 * hgt[q + w] + hgt[q + w + 1] - hgt[q - w - 1] - 2 * hgt[q - w] - hgt[q - w + 1]) * k8;
    out[q] = Math.atan(Math.hypot(gx, gy)) * R;
  }
  return out;
}

// connected (8-neighbour) groups of cliff cells: max 2 m slope >= minSlope and relief >= minRelief dm
function cliffGroups(slope, relief, height, w, h, minSlope, minRelief) {
  const seen = new Uint8Array(w * h), groups = [], stack = [];
  const isCliff = (q) => slope[q] !== 255 && slope[q] >= minSlope && relief[q] !== 255 && relief[q] >= minRelief;
  for (let q0 = 0; q0 < w * h; q0++) {
    if (seen[q0] || !isCliff(q0)) continue;
    const g = { cells: 0, maxSlope: 0, maxRelief: 0, si: 0, sj: 0, i0: Infinity, i1: -1, j0: Infinity, j1: -1, hlo: Infinity, hhi: -Infinity };
    seen[q0] = 1; stack.push(q0);
    while (stack.length) {
      const q = stack.pop(), i = q % w, j = (q - i) / w;
      g.cells++; g.si += i; g.sj += j;
      if (slope[q] > g.maxSlope) g.maxSlope = slope[q];
      if (relief[q] > g.maxRelief) g.maxRelief = relief[q];
      if (i < g.i0) g.i0 = i; if (i > g.i1) g.i1 = i; if (j < g.j0) g.j0 = j; if (j > g.j1) g.j1 = j;
      // the face's height: from the lowest to the highest cell of the group and its ring
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
        const p = jj * w + ii, hv = height[p];
        if (hv !== NODATA16) { if (hv < g.hlo) g.hlo = hv; if (hv > g.hhi) g.hhi = hv; }
        if (!seen[p] && isCliff(p)) { seen[p] = 1; stack.push(p); }
      }
    }
    groups.push(g);
  }
  return groups;
}

async function report(G, opt, m) {
  const { grid } = G;
  const A = areaCells(G, AREAS.lakeone);
  const w = A.i1 - A.i0, h = A.j1 - A.j0, N = w * h;
  log(`report: Lake One, cells ${A.i0}-${A.i1} x ${A.j0}-${A.j1} (${w} x ${h})`);
  const L = {};
  for (const ch of Object.keys(CH)) L[ch] = readRect(m, ch, A.i0, A.j0, A.i1, A.j1);
  const game = readGame(opt.data, A.i0, A.j0, A.i1, A.j1);
  const rep = { area: 'lakeone', bbox: AREAS.lakeone, cells: N, lidarCells: 0, waterCells: 0 };
  for (let q = 0; q < N; q++) { if (L.mask[q] & 1) rep.lidarCells++; if (L.mask[q] & 2) rep.waterCells++; }

  // 1. land heights: LiDAR mean vs the game's heights, away from the shore (the bake shapes the first 30 m)
  const dGame = [], dGameNear = [], dRaw = [];
  let rawH = null;
  try {
    const { makeSampler } = await import('../elevation.mjs');
    const sampler = makeSampler();
    rawH = new Float32Array(N);
    const row = new Float32Array(w);
    for (let j = 0; j < h; j++) {
      const [lat, lon0] = G.fromUV(A.i0 + 0.5, A.j0 + j + 0.5);
      sampler.sampleRow(lat, lon0, grid.cell / G.proj.mPerDegLon, w, row);
      rawH.set(row, j * w);
    }
  } catch (e) { log('raw 3DEP sampler unavailable:', e.message); }
  for (let q = 0; q < N; q++) {
    if ((L.mask[q] & 15) !== 1 || game.lake[q]) continue; // full LiDAR, land, not shore, not edge
    const d = (L.height[q] - game.hgt[q]) / 10;
    if (game.sd[q] > 300) dGame.push(d); else dGameNear.push(d);
    if (rawH && game.sd[q] > 300) dRaw.push(L.height[q] / 10 - rawH[q]);
  }
  rep.landVsGame = { note: 'LiDAR mean height minus the game\'s height (public/data, data-v3), land cells more than 30 m from the shore', ...stats(dGame) };
  rep.shoreVsGame = { note: 'the same within 30 m of the shore (the bake shapes the banks there)', ...stats(dGameNear) };
  if (rawH) rep.landVsRaw3DEP = { note: 'LiDAR mean height minus the raw 3DEP (terrarium z14) the bake samples, same cells', ...stats(dRaw) };
  const big = dGame.filter((d) => Math.abs(d) > 5).length;
  rep.landVsGame.over5m = +((100 * big) / Math.max(1, dGame.length)).toFixed(2) + ' %';

  // 2. lake levels: the game's level per lake vs the median hydro-flat level over its cells
  const byLake = new Map();
  for (let q = 0; q < N; q++) {
    const id = game.lake[q];
    if (!id || !(L.mask[q] & 2) || L.level[q] === NODATA16) continue;
    if (!byLake.has(id)) byLake.set(id, []);
    byLake.get(id).push(L.level[q] / 10);
  }
  const lakes = [];
  for (const [id, lv] of byLake) {
    const meta = game.idx.lakes[id - 1];
    if (!meta || lv.length < 300) continue;
    lv.sort((p, q) => p - q);
    const lidar = pct(lv, 0.5);
    lakes.push({ id, name: meta.displayName || meta.name || null, river: !!meta.river, cells: lv.length, game: meta.level, lidar: +lidar.toFixed(2), diff: +(lidar - meta.level).toFixed(2), spread: +(pct(lv, 0.95) - pct(lv, 0.05)).toFixed(2) });
  }
  lakes.sort((p, q) => q.cells - p.cells);
  rep.lakeLevels = lakes.slice(0, 25);
  // OSM water the LiDAR calls land, and flat water the OSM misses
  let osmWaterLidarLand = 0, lidarWaterOsmLand = 0, both = 0;
  for (let q = 0; q < N; q++) {
    if (!(L.mask[q] & 1) || (L.mask[q] & 8)) continue;
    const lw = !!(L.mask[q] & 2), gw = !!game.lake[q];
    if (lw && gw) both++; else if (gw) osmWaterLidarLand++; else if (lw) lidarWaterOsmLand++;
  }
  rep.waterAgreement = { both, osmWaterLidarLand, lidarWaterOsmLand, note: 'cells (shore cells left out): OSM water polygons vs LiDAR hydro-flat water' };

  // 3. slopes: the game's 10 m, LiDAR at 10 m, LiDAR at 2 m
  const valid = new Uint8Array(N);
  for (let q = 0; q < N; q++) valid[q] = L.mask[q] & 1 ? 1 : 0;
  const sGame = slope10(game.hgt, w, h, valid), sL10 = slope10(L.height, w, h, valid);
  const frac = (fn) => { let a = 0, n = 0; for (let q = 0; q < N; q++) { if (sGame[q] < 0 || sL10[q] < 0 || L.slope[q] === 255) continue; n++; if (fn(q)) a++; } return +((100 * a) / Math.max(1, n)).toFixed(3) + ' %'; };
  let mxG = 0, mx10 = 0, mx2 = 0;
  for (let q = 0; q < N; q++) { if (sGame[q] > mxG) mxG = sGame[q]; if (sL10[q] > mx10) mx10 = sL10[q]; if (L.slope[q] !== 255 && L.slope[q] > mx2) mx2 = L.slope[q]; }
  rep.slopes = {
    max: { game10m: +mxG.toFixed(1), lidar10m: +mx10.toFixed(1), lidar2m: mx2 },
    over35: { game10m: frac((q) => sGame[q] >= 35), lidar10m: frac((q) => sL10[q] >= 35), lidar2mMax: frac((q) => L.slope[q] >= 35) },
    over45: { game10m: frac((q) => sGame[q] >= 45), lidar10m: frac((q) => sL10[q] >= 45), lidar2mMax: frac((q) => L.slope[q] >= 45) },
    over55: { game10m: frac((q) => sGame[q] >= 55), lidar10m: frac((q) => sL10[q] >= 55), lidar2mMax: frac((q) => L.slope[q] >= 55) },
    note: 'share of cells; lidar2mMax = the steepest 2 m pixel in the cell',
  };

  // roughness and relief on land, to set D2's thresholds for ledges, talus and boulder fields
  const rv = [], lv = [], roughSteep = [];
  for (let q = 0; q < N; q++) {
    if ((L.mask[q] & 15) !== 1 || L.rough[q] === 255) continue;
    rv.push(L.rough[q]); lv.push(L.relief[q] / 10);
    if (L.slope[q] >= 35 && L.slope[q] < 50) roughSteep.push(L.rough[q]);
  }
  const share = (arr, t) => +((100 * arr.filter((v) => v >= t).length) / Math.max(1, arr.length)).toFixed(2) + ' %';
  rep.rough = { unit: 'cm', land: stats(rv), over20: share(rv, 20), over30: share(rv, 30), over50: share(rv, 50), steep35to50: stats(roughSteep) };
  rep.relief = { unit: 'm', land: stats(lv), over3: share(lv, 3), over5: share(lv, 5), over10: share(lv, 10) };

  // 4. cliffs: groups of cells with a 2 m pixel at 50 degrees or more and 3 m of relief
  const groups = cliffGroups(L.slope, L.relief, L.height, w, h, 50, 30);
  const named = (g) => {
    const ci = Math.round(g.si / g.cells), cj = Math.round(g.sj / g.cells);
    let best = null, bd = Infinity;
    for (let dj = -15; dj <= 15; dj++) for (let di = -15; di <= 15; di++) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= w || j >= h) continue;
      const id = game.lake[j * w + i];
      if (id && di * di + dj * dj < bd) { bd = di * di + dj * dj; best = id; }
    }
    const [lat, lon] = G.fromUV(A.i0 + ci + 0.5, A.j0 + cj + 0.5);
    const lm = best ? game.idx.lakes[best - 1] : null;
    return { lat: +lat.toFixed(5), lon: +lon.toFixed(5), cells: g.cells, lengthM: Math.round(Math.hypot(g.i1 - g.i0 + 1, g.j1 - g.j0 + 1) * 10), faceM: +((g.hhi - g.hlo) / 10).toFixed(1), maxSlope: g.maxSlope, maxReliefM: g.maxRelief / 10, water: lm ? (lm.displayName || lm.name || `lake ${best}`) : null, toWaterM: best ? Math.round(Math.sqrt(bd) * 10) : null };
  };
  groups.sort((p, q) => q.cells - p.cells);
  rep.cliffs = { rule: 'connected cells whose steepest 2 m pixel is 50 degrees or more with 3 m or more of relief', groups: groups.length, cells: groups.reduce((s, g) => s + g.cells, 0), biggest: groups.slice(0, 12).map(named), tallest: [...groups].sort((p, q) => (q.hhi - q.hlo) - (p.hhi - p.hlo)).slice(0, 8).map(named) };

  // 5. the whole US side: steep cells and the tallest faces, tile by tile
  rep.box = boxCliffs(G, m, opt.data, game.idx);
  const out = path.join(DIR, 'report.json');
  fs.writeFileSync(out, JSON.stringify(rep, null, 1));
  log('report written to', out);
  console.log(JSON.stringify({ ...rep, box: { ...rep.box, tallest: rep.box.tallest.slice(0, 10) } }, null, 1));
  return rep;
}

// counts and the tallest cliff groups across every cached tile (groups are cut at tile edges, a small undercount)
function boxCliffs(G, m, dataDir, idx) {
  const T = CFG.tile;
  const hist = new Float64Array(91);
  let cells = 0;
  const all = [];
  for (const k of Object.keys(m.tiles)) {
    const [tx, ty] = k.split('_').map(Number);
    const slope = readTile(tx, ty, 'slope'), relief = readTile(tx, ty, 'relief'), height = readTile(tx, ty, 'height'), mask = readTile(tx, ty, 'mask');
    for (let q = 0; q < T * T; q++) {
      if ((mask[q] & 19) === 17 && slope[q] !== 255) { hist[slope[q]]++; cells++; } // US land with LiDAR
      if (!(mask[q] & 16)) slope[q] = 255; // cliffs on the US side only
    }
    let lake = null;
    for (const g of cliffGroups(slope, relief, height, T, T, 50, 30)) {
      const ci = Math.round(g.si / g.cells), cj = Math.round(g.sj / g.cells);
      const [lat, lon] = G.fromUV(tx * T + ci + 0.5, ty * T + cj + 0.5);
      const c = { tile: k, lat: +lat.toFixed(5), lon: +lon.toFixed(5), cells: g.cells, faceM: +((g.hhi - g.hlo) / 10).toFixed(1), maxSlope: g.maxSlope, lengthM: Math.round(Math.hypot(g.i1 - g.i0 + 1, g.j1 - g.j0 + 1) * 10) };
      if (c.faceM >= 25 && idx) {
        // name the nearest water within 300 m, from today's tiles
        if (!lake) lake = readGame(dataDir, tx * T, ty * T, (tx + 1) * T, (ty + 1) * T, idx).lake;
        let best = 0, bd = Infinity;
        for (let dj = -30; dj <= 30; dj++) for (let di = -30; di <= 30; di++) {
          const i = ci + di, j = cj + dj;
          if (i < 0 || j < 0 || i >= T || j >= T) continue;
          const id = lake[j * T + i];
          if (id && di * di + dj * dj < bd) { bd = di * di + dj * dj; best = id; }
        }
        if (best) { const lm = idx.lakes[best - 1]; c.water = lm ? lm.displayName || lm.name || null : null; c.toWaterM = Math.round(Math.sqrt(bd) * 10); }
      }
      all.push(c);
    }
  }
  const over = (s) => { let a = 0; for (let d = s; d <= 90; d++) a += hist[d]; return { cells: a, share: +((100 * a) / Math.max(1, cells)).toFixed(3) + ' %' }; };
  all.sort((p, q) => q.faceM - p.faceM);
  return { landCells: cells, over35: over(35), over45: over(45), over55: over(55), over65: over(65), cliffGroups: all.length, tallest: all.slice(0, 25) };
}

// ---------- quick-look PNGs -----------------------------------------------------------------

const ramp = (stops, t) => {
  t = Math.max(0, Math.min(1, t));
  const n = stops.length - 1, k = Math.min(n - 1, Math.floor(t * n)), f = t * n - k;
  return stops[k].map((c, i) => Math.round(c + (stops[k + 1][i] - c) * f));
};
const TERRAIN = [[52, 92, 60], [110, 140, 80], [170, 160, 110], [150, 120, 95], [235, 230, 225]];
const HEAT = [[20, 20, 28], [70, 70, 90], [150, 150, 150], [240, 170, 40], [220, 40, 30], [255, 240, 240]];
const VIRID = [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]];
const DIVERGE = [[40, 70, 180], [140, 170, 230], [245, 245, 245], [240, 150, 120], [180, 30, 30]];

function hillshade(hgt, w, h, i, j, zf, ex) {
  const g = (ii, jj) => { ii = Math.max(0, Math.min(w - 1, ii)); jj = Math.max(0, Math.min(h - 1, jj)); const v = hgt[jj * w + ii]; return v === NODATA16 ? hgt[j * w + i] : v; };
  const k = ex / (200 * zf); // dm over two cells of zf * 10 m, exaggerated ex times
  const dx = (g(i + 1, j) - g(i - 1, j)) * k, dz = (g(i, j + 1) - g(i, j - 1)) * k;
  const nx = -dx, ny = 1, nz = -dz, nl = Math.hypot(nx, ny, nz);
  const lx = -0.5, ly = 0.7071, lz = -0.5; // from the north-west, 45 degrees up
  return Math.max(0, (nx * lx + ny * ly + nz * lz) / nl);
}

function paint(file, w, h, fn) {
  const png = new PNG({ width: w, height: h });
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const [r, g, b] = fn(i, j), o = (j * w + i) * 4;
    png.data[o] = r; png.data[o + 1] = g; png.data[o + 2] = b; png.data[o + 3] = 255;
  }
  fs.writeFileSync(file, PNG.sync.write(png));
}

function picture(dir, name, C, w, h, zf, ex, extra) {
  const { height, slope, relief, rough, level, mask } = C;
  let lo = Infinity, hi = -Infinity, llo = Infinity, lhi = -Infinity;
  for (let q = 0; q < w * h; q++) {
    if ((mask[q] & 1) && height[q] !== NODATA16) { if (height[q] < lo) lo = height[q]; if (height[q] > hi) hi = height[q]; }
    if (level[q] !== NODATA16) { if (level[q] < llo) llo = level[q]; if (level[q] > lhi) lhi = level[q]; }
  }
  const NONE = [235, 232, 226];
  const files = [];
  const put = (ch, fn) => { const f = path.join(dir, `${name}-${ch}.png`); paint(f, w, h, fn); files.push(f); };
  const shade = (i, j) => hillshade(height, w, h, i, j, zf, ex);
  put('height', (i, j) => {
    const q = j * w + i;
    if (!(mask[q] & 1)) return NONE;
    if (mask[q] & 2) return [70, 110, 160];
    const c = ramp(TERRAIN, (height[q] - lo) / Math.max(1, hi - lo)), s = 0.35 + 0.75 * shade(i, j);
    return c.map((v) => Math.min(255, v * s));
  });
  put('slope', (i, j) => { const q = j * w + i; return slope[q] === 255 ? NONE : ramp(HEAT, slope[q] / 75); });
  put('relief', (i, j) => { const q = j * w + i; return relief[q] === 255 ? NONE : ramp(VIRID, Math.sqrt(relief[q] / 150)); });
  put('rough', (i, j) => { const q = j * w + i; return rough[q] === 255 ? NONE : ramp(VIRID, Math.sqrt(rough[q] / 60)); });
  put('level', (i, j) => {
    const q = j * w + i;
    if (level[q] !== NODATA16) return ramp(VIRID, (level[q] - llo) / Math.max(1, lhi - llo));
    if (!(mask[q] & 1)) return NONE;
    const s = Math.round(90 + 90 * shade(i, j));
    return [s, s, s];
  });
  put('mask', (i, j) => {
    const mk = mask[j * w + i];
    if (!mk) return NONE;
    if (!(mk & 1)) return mk & 16 ? [200, 200, 200] : [235, 232, 226];
    if (!(mk & 16)) return mk & 2 ? [150, 110, 190] : [200, 160, 220];
    if (mk & 4) return [230, 120, 40];
    if (mk & 2) return [60, 110, 200];
    if (mk & 8) return [120, 200, 230];
    return [90, 150, 80];
  });
  if (extra) extra(put, shade);
  return { files, heightRange: [lo / 10, hi / 10], levelRange: [llo / 10, lhi / 10] };
}

async function shots(G, opt, m) {
  fs.mkdirSync(opt.shots, { recursive: true });
  const T = CFG.tile;
  // Lake One at full resolution, with the comparison and the cliffs
  const A = areaCells(G, AREAS.lakeone);
  const w = A.i1 - A.i0, h = A.j1 - A.j0;
  const C = {};
  for (const ch of Object.keys(CH)) C[ch] = readRect(m, ch, A.i0, A.j0, A.i1, A.j1);
  let game = null;
  try { game = readGame(opt.data, A.i0, A.j0, A.i1, A.j1); } catch (e) { log('no game tiles for the comparison shot:', e.message); }
  const one = picture(opt.shots, 'lakeone', C, w, h, 1, 1.5, (put, shade) => {
    if (game) {
      // land: LiDAR mean height minus today's height; water: the LiDAR's flat level minus today's level (+-5 m full scale)
      put('diff-vs-today', (i, j) => {
        const q = j * w + i;
        if (!(C.mask[q] & 1)) return [235, 232, 226];
        if (game.lake[q]) return C.level[q] === NODATA16 ? [120, 120, 120] : ramp(DIVERGE, 0.5 + (C.level[q] - game.lvl[q]) / 10 / 10);
        return ramp(DIVERGE, 0.5 + (C.height[q] - game.hgt[q]) / 10 / 10);
      });
      // water: both = blue, OSM only = red, LiDAR only = green (shore cells grey)
      put('water-vs-osm', (i, j) => {
        const q = j * w + i;
        if (!(C.mask[q] & 1)) return [235, 232, 226];
        const lw = C.mask[q] & 2, gw = game.lake[q];
        if (C.mask[q] & 8) return gw ? [110, 140, 170] : [150, 150, 150];
        if (lw && gw) return [60, 110, 200];
        if (gw) return [220, 50, 40];
        if (lw) return [40, 180, 70];
        const v = Math.round(150 + 90 * shade(i, j));
        return [v, v, v];
      });
      const sg = slope10(game.hgt, w, h, null);
      put('today-slope', (i, j) => { const q = j * w + i; return game.lake[q] ? [20, 20, 28] : sg[q] < 0 ? [235, 232, 226] : ramp(HEAT, sg[q] / 75); });
    }
    put('cliffs', (i, j) => {
      const q = j * w + i;
      if (!(C.mask[q] & 1)) return [235, 232, 226];
      if (C.mask[q] & 2) return [70, 110, 160];
      const s = C.slope[q], r = C.relief[q];
      if (s >= 50 && r >= 30) return [230, 30, 30];
      if (s >= 40) return [245, 160, 30];
      const v = Math.round(110 + 120 * shade(i, j));
      return [v, v, v];
    });
  });
  log('Lake One shots:', one.files.join(' '));
  // the whole box at 80 m: max for slope and relief, mean for rough, the first cell for the rest
  const F = 8, bw = G.grid.width / F, bh = G.grid.height / F;
  const B = {};
  for (const ch of Object.keys(CH)) B[ch] = new (ch === 'height' || ch === 'level' ? Int16Array : Uint8Array)(bw * bh).fill(CH[ch].nodata);
  const roughSum = new Float32Array(bw * bh), roughN = new Uint8Array(bw * bh);
  for (const k of Object.keys(m.tiles)) {
    const [tx, ty] = k.split('_').map(Number);
    const t = {};
    for (const ch of Object.keys(CH)) t[ch] = readTile(tx, ty, ch);
    for (let r = 0; r < T; r++) for (let c = 0; c < T; c++) {
      const q = r * T + c, p = ((ty * T + r) / F | 0) * bw + ((tx * T + c) / F | 0);
      const center = r % F === F / 2 && c % F === F / 2;
      if (center) { B.height[p] = t.height[q]; B.level[p] = t.level[q]; B.mask[p] = t.mask[q]; }
      if (t.slope[q] !== 255 && (B.slope[p] === 255 || t.slope[q] > B.slope[p])) B.slope[p] = t.slope[q];
      if (t.relief[q] !== 255 && (B.relief[p] === 255 || t.relief[q] > B.relief[p])) B.relief[p] = t.relief[q];
      if (t.rough[q] !== 255) { roughSum[p] += t.rough[q]; roughN[p]++; }
    }
  }
  for (let p = 0; p < bw * bh; p++) if (roughN[p]) B.rough[p] = Math.round(roughSum[p] / roughN[p]);
  const box = picture(opt.shots, 'box', B, bw, bh, F, 4);
  log('box shots:', box.files.join(' '));
  return { lakeone: one, box };
}

// ---------- main -----------------------------------------------------------------------------

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  const G = setup();
  fs.mkdirSync(DIR, { recursive: true });
  const m = readManifest(G);
  log(`grid ${G.grid.width} x ${G.grid.height}, ${G.grid.ntx} x ${G.grid.nty} tiles; cache ${DIR}; ${freeGB().toFixed(1)} GB free`);
  if (opt.fetch) {
    if (freeGB() < MIN_FREE_GB) throw new Error(`only ${freeGB().toFixed(1)} GB free (needs ${MIN_FREE_GB})`);
    await fetchAll(G, opt, m);
  }
  applyBorder(G, m, false);
  writeManifest(m);
  const sizes = Object.values(m.tiles).reduce((s, t) => s + t.bytes, 0);
  log(`${Object.keys(m.tiles).length} tiles cached, ${(sizes / 2 ** 20).toFixed(1)} MB; ${m.fetched.windows} windows read, ${(m.fetched.rawBytes / 2 ** 30).toFixed(2)} GB of 2 m Float32 derived and deleted`);
  if (opt.report) await report(G, opt, m);
  if (opt.shots) await shots(G, opt, m);
}

export { UTM, CH };
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) main().catch((e) => { console.error(e); process.exit(1); });

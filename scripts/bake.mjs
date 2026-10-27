#!/usr/bin/env node
// Bakes real-world data for the game into a tiled, streamable world under public/data:
//   - elevation from AWS Terrarium tiles (USGS 3DEP / SRTM derived)
//   - lakes, portages, campsites and entry points from an offline OpenStreetMap extract (Geofabrik)
//
//   index.json             grid/projection, per-tile flags, lake table (names, levels), portages, campsites, entry points
//   tiles/{tx}_{ty}.bin    gzip of [height Int16 dm][lake Uint16][shore distance Int16 dm][level Int16 dm], (tile+2*halo)^2
//                          cells each; format v4 (d2 bake) adds a Uint8 plane per channel after them (v4-products.mjs)
//   far/{fx}_{fy}.bin      the same at 80 m resolution for the far field (no trees, distant shores only)
//   overview.png           40 m/px map of the whole area for the minimap
//
// Everything runs on one global 10 m grid. The expensive per-cell work (elevation, distance transform,
// shore shaping) runs in horizontal bands with a halo wider than the distance clamp, so values are identical
// to a whole-grid computation and continuous across band and tile edges. Water basins, levels and names
// are computed on the full grid with compact typed arrays.
//
// Usage: node scripts/bake.mjs [--all | --area lakeone|bwca | --bbox S,W,N,E] [--out public-data-v4] [--tiles x0-x1,y0-y1]
//
// d2 bake (round D2 of the real data, 2026-10-26): on the bwca grid the bake reads round D1's source products
// (data-cache/{lidar,ground,forest-rock,lake-colour}: v4-products.mjs) and writes tile format v4 (index version 4):
// heights from the MnTOPO LiDAR where it covers the US side (blended into 3DEP over 80 m at its edge), each lake's level
// the LiDAR's median water surface, the ground, forest, canopy, cover, rock, cliff, stone and water colour channels,
// Quetico from the Ontario extract (config.mjs CFG.extracts), and the official campsites and USFS portages
// (official-adds.mjs). It never writes the main checkout's public/data unless told (--force-public-data): the live
// release came from there and every worktree links to it.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { PNG } from 'pngjs';
import { CFG, AREAS, log, makeProjection, makeGrid } from './config.mjs';
import { prefetchTerrarium, makeSampler } from './elevation.mjs';
import { loadOsm } from './osm-extract.mjs';
import { loadBathymetry } from './bathymetry.mjs';
import { loadClarity } from './clarity.mjs';
import { makeWater, placeLandings, linkPortages, chainsFrom } from './world-links.mjs';
import { gradeLevels } from './water-grade.mjs';
import { loadProducts, lidarWeight, makeChannels, lidarBasinLevels, V4_CHANNELS, V4_FIELDS } from './v4-products.mjs'; // d2 bake
import { officialAdds } from './official-adds.mjs'; // d2 bake (d1 names' sites and portages)

// ---------- CLI ---------------------------------------------------------------------

function parseArgs(argv) {
  const o = { area: 'lakeone', out: CFG.outDir };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') o.area = 'bwca';
    else if (a === '--area') o.area = argv[++i];
    else if (a === '--bbox') { const [s, w, n, e] = argv[++i].split(',').map(Number); o.bbox = { south: s, west: w, north: n, east: e }; }
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--tiles') { const [x, y] = argv[++i].split(',').map((r) => r.split('-').map(Number)); o.tiles = { x0: x[0], x1: x[1] ?? x[0], y0: y[0], y1: y[1] ?? y[0] }; }
    else if (a === '--force-public-data') o.forcePublic = true;
    else if (a === '--help') { console.log('node scripts/bake.mjs [--all | --area name | --bbox S,W,N,E] [--out dir] [--tiles x0-x1,y0-y1 (fine tiles written)] [--force-public-data]'); process.exit(0); }
  }
  o.bbox = o.bbox || AREAS[o.area];
  if (!o.bbox) throw new Error('unknown area ' + o.area);
  // d2 bake: a test area's bake goes beside the whole box's, never over it
  if (!argv.includes('--out') && (o.area !== 'bwca' || argv.includes('--bbox'))) o.out = `${CFG.outDir}-${argv.includes('--bbox') ? 'bbox' : o.area}`;
  // d2 bake: the main checkout's public/data holds the live release's data, and every worktree links to it
  const real = (() => { try { return fs.realpathSync(o.out); } catch { return path.resolve(o.out); } })();
  if (/\/public\/data\/?$/.test(real) && !o.forcePublic) throw new Error(`refusing to write ${real} (the release's data, linked from every worktree): pass --out public-data-v4, or --force-public-data`);
  return o;
}

// ---------- rasterization -------------------------------------------------------------

// Scanline rasterization with the even-odd rule across all rings of a polygon.
function rasterizeLakes(lakes, grid, lakeId) {
  const { width, height, cell, originX, originZ } = grid;
  const xs = [];
  for (const lake of lakes) {
    if (!lake.rings.length) continue;
    const id = lake.id;
    const j0 = Math.max(0, Math.floor((lake.minZ - originZ) / cell)), j1 = Math.min(height - 1, Math.ceil((lake.maxZ - originZ) / cell));
    for (let j = j0; j <= j1; j++) {
      const zc = originZ + (j + 0.5) * cell;
      xs.length = 0;
      for (const rg of lake.rings) {
        for (let i = 0, n = rg.length; i < n; i++) {
          const [x1, z1] = rg[i], [x2, z2] = rg[(i + 1) % n];
          if ((z1 <= zc) !== (z2 <= zc)) xs.push(x1 + ((zc - z1) * (x2 - x1)) / (z2 - z1));
        }
      }
      if (xs.length < 2) continue;
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const ia = Math.max(0, Math.ceil((xs[k] - originX) / cell - 0.5));
        const ib = Math.min(width - 1, Math.floor((xs[k + 1] - originX) / cell - 0.5));
        for (let i = ia; i <= ib; i++) lakeId[j * width + i] = id;
      }
    }
  }
}

// Waterway centrelines become channels a few cells wide: every cell whose centre is within the half-width.
function rasterizeCreeks(creeks, grid, lakeId) {
  const { width, height } = grid;
  for (const c of creeks) {
    const hw = c.kind === 'stream' ? 7.5 : 11;
    for (let s = 1; s < c.pts.length; s++) {
      const [x1, z1] = c.pts[s - 1], [x2, z2] = c.pts[s];
      const i0 = Math.max(0, grid.ci(Math.min(x1, x2) - hw)), i1 = Math.min(width - 1, grid.ci(Math.max(x1, x2) + hw));
      const j0 = Math.max(0, grid.cj(Math.min(z1, z2) - hw)), j1 = Math.min(height - 1, grid.cj(Math.max(z1, z2) + hw));
      const dx = x2 - x1, dz = z2 - z1, L2 = dx * dx + dz * dz || 1;
      for (let j = j0; j <= j1; j++) {
        const cz = grid.cz(j);
        for (let i = i0; i <= i1; i++) {
          const cx = grid.cx(i);
          const t = Math.max(0, Math.min(1, ((cx - x1) * dx + (cz - z1) * dz) / L2));
          const px = x1 + dx * t, pz = z1 + dz * t;
          if ((cx - px) * (cx - px) + (cz - pz) * (cz - pz) <= hw * hw) lakeId[j * width + i] = c.id;
        }
      }
    }
  }
}

// Resample a polyline at roughly `step` metre spacing.
function resample(pts, step) {
  const out = [[pts[0][0], pts[0][1]]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const [x0, z0] = pts[i - 1], [x1, z1] = pts[i];
    const L = Math.hypot(x1 - x0, z1 - z0);
    let d = step - carry;
    while (d <= L) { out.push([x0 + ((x1 - x0) * d) / L, z0 + ((z1 - z0) * d) / L]); d += step; }
    carry = L - (d - step);
  }
  out.push([pts[pts.length - 1][0], pts[pts.length - 1][1]]);
  return out;
}

// Weighted least-squares fit of a non-increasing sequence (pool adjacent violators).
function monotoneDecreasing(v, w) {
  const blocks = [];
  for (let i = 0; i < v.length; i++) {
    blocks.push({ sum: v[i] * w[i], w: w[i], n: 1 });
    while (blocks.length > 1) {
      const a = blocks[blocks.length - 2], b = blocks[blocks.length - 1];
      if (a.sum / a.w >= b.sum / b.w) break;
      blocks.pop(); a.sum += b.sum; a.w += b.w; a.n += b.n;
    }
  }
  const out = new Float64Array(v.length);
  let i = 0;
  for (const b of blocks) { const m = b.sum / b.w; for (let q = 0; q < b.n; q++) out[i++] = m; }
  return out;
}

// ---------- exact Euclidean distance transform (Felzenszwalb & Huttenlocher) ------------------

function edt1d(f, d, n, v, z) {
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
}

const EDT_INF = 1e9;
// g: Int32 rows*W with 0 at target cells and EDT_INF elsewhere (overwritten); out: Float32 distance in cells, clamped.
function edt2d(g, W, rows, out, clampCells, scratch) {
  const { f, d, v, z } = scratch;
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < rows; y++) f[y] = g[y * W + x];
    edt1d(f, d, rows, v, z);
    for (let y = 0; y < rows; y++) g[y * W + x] = d[y];
  }
  for (let y = 0; y < rows; y++) {
    const o = y * W;
    for (let x = 0; x < W; x++) f[x] = g[o + x];
    edt1d(f, d, W, v, z);
    for (let x = 0; x < W; x++) out[o + x] = Math.min(clampCells, Math.sqrt(d[x]));
  }
}

// ---------- helpers --------------------------------------------------------------------

// Nearest comfortably-deep water cell to a point (for launching a canoe).
function findLaunch(x, z, grid, lakeId, sdist, maxCells = 10, wantLake = 0) {
  const ci = grid.ci(x), cj = grid.cj(z);
  let best = null;
  for (let dj = -maxCells; dj <= maxCells; dj++) for (let di = -maxCells; di <= maxCells; di++) {
    const i = ci + di, j = cj + dj;
    if (i < 0 || j < 0 || i >= grid.width || j >= grid.height) continue;
    const k = j * grid.width + i;
    if (!lakeId[k] || (wantLake && lakeId[k] !== wantLake)) continue;
    const depth = -sdist[k] / 10;
    const d = Math.hypot(di, dj) * grid.cell;
    const score = d + Math.max(0, 15 - depth) * 3;
    if (!best || score < best.score) best = { score, x: grid.cx(i), z: grid.cz(j), lake: lakeId[k], dist: d };
  }
  return best;
}

const r1 = (v) => +v.toFixed(1);

// ---------- main -------------------------------------------------------------------

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  const t0 = Date.now();
  const bbox = opt.bbox;
  const { cell, tile: T, halo: HALO, far: FAR, farTile: FT, overview: OV, maxDist, band: BAND } = CFG;
  const SIDE = T + 2 * HALO;
  await fsp.mkdir(CFG.cacheDir, { recursive: true });
  for (const d of ['tiles', 'far']) await fsp.mkdir(path.join(opt.out, d), { recursive: true });

  const proj = makeProjection(bbox);
  const grid = makeGrid(bbox, proj);
  const { width: W, height: H, ntx, nty } = grid;
  const N = W * H;
  log(`grid ${W} x ${H} cells of ${cell} m (${(W * cell / 1000).toFixed(1)} x ${(H * cell / 1000).toFixed(1)} km), ${ntx} x ${nty} tiles of ${T}`);

  // the grid is padded beyond the bbox; make sure OSM and elevation cover all of it
  const [latS, lonW] = proj.toLatLon(grid.originX, grid.originZ + H * cell);
  const [latN, lonE] = proj.toLatLon(grid.originX + W * cell, grid.originZ);
  const gridBox = { south: latS - 0.005, west: lonW - 0.01, north: latN + 0.005, east: lonE + 0.01 };
  const [osm, bathy, clarityData] = await Promise.all([loadOsm(gridBox), loadBathymetry(gridBox), loadClarity(gridBox), prefetchTerrarium(gridBox)]);
  const sampler = makeSampler();
  // d2 bake: round D1's products on this grid (null on any other grid: the bake comes out as format v3)
  const P = loadProducts(grid, CFG.cacheDir, log);
  const lidar = P && P.lidar, lidW = lidar ? lidarWeight(grid, lidar) : null;
  if (lidar) { let n = 0, full = 0; for (let k = 0; k < N; k++) if (lidW[k]) { n++; if (lidW[k] === 255) full++; } log(`d2 bake: LiDAR heights on ${n} cells (${full} wholly, the rest blended into 3DEP within ${80} m of its edge)`); }

  // --- lakes in local metres, big first (small ponds and islands' inner lakes drawn later win)
  const lakes = [];
  const inGrid = (minX, maxX, minZ, maxZ) => !(maxX < grid.originX || minX > grid.originX + W * cell || maxZ < grid.originZ || minZ > grid.originZ + H * cell);
  for (const l of osm.lakes) {
    const rings = l.rings.map((rg) => rg.map(([lat, lon]) => proj.toLocal(lat, lon)));
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const rg of rings) for (const [x, z] of rg) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z; }
    if (!inGrid(minX, maxX, minZ, maxZ)) continue;
    lakes.push({ osm: l.osm, name: l.name, river: !!l.river, rings, minX, maxX, minZ, maxZ });
  }
  // waterway centrelines: creeks and rivers mapped only as lines get a narrow channel of their own (rasterized
  // first, so real polygons win wherever both exist); every line also carries the level profile below
  const waterways = [];
  for (const wway of osm.waterways || []) {
    const pts = wway.pts.map(([lat, lon]) => proj.toLocal(lat, lon));
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of pts) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z; }
    if (!inGrid(minX, maxX, minZ, maxZ)) continue;
    const c = { osm: `way/${wway.id}`, name: wway.name || null, kind: wway.kind, river: true, creek: true, rings: [], pts, minX, maxX, minZ, maxZ };
    waterways.push(c);
    lakes.push(c);
  }
  lakes.forEach((l, i) => { l.id = i + 1; });
  if (lakes.length >= 65535) throw new Error('too many water polygons for Uint16 ids');
  const lakeId = new Uint16Array(N);
  rasterizeCreeks(waterways, grid, lakeId);
  rasterizeLakes(lakes, grid, lakeId);
  const nLakes = lakes.length;
  const lakeArea = new Uint32Array(nLakes + 1);
  const sumI = new Float64Array(nLakes + 1), sumJ = new Float64Array(nLakes + 1);
  for (let k = 0; k < N; k++) { const id = lakeId[k]; if (id) { lakeArea[id]++; sumI[id] += k % W; sumJ[id] += (k - (k % W)) / W; } }
  let waterCells = 0;
  for (let id = 1; id <= nLakes; id++) waterCells += lakeArea[id];
  log(`${nLakes} water polygons rasterized, water covers ${(100 * waterCells / N).toFixed(1)}% of ${N} cells`);

  // --- pass 1: elevation, distance field (in bands with a halo wider than the clamp distance)
  const hraw = new Int16Array(N);   // DEM height, decimetres
  const h3dep = lidar ? new Int16Array(N) : null; // d2 bake: 3DEP alone, for each lake's old level (level3dep)
  const sdist = new Int16Array(N);  // signed shore distance, decimetres (+ land, - water)
  const EDT_HALO = Math.ceil(maxDist / cell) + 20;
  const clampCells = maxDist / cell;
  const maxRows = Math.min(H, BAND + 2 * EDT_HALO);
  const g = new Int32Array(maxRows * W);
  const dLand = new Float32Array(maxRows * W), dWater = new Float32Array(maxRows * W);
  const sraw = new Float32Array((BAND + 2) * W);
  const rowBuf = new Float32Array(W);
  const n1 = Math.max(W, maxRows);
  const scratch = { f: new Float64Array(n1), d: new Float64Array(n1), v: new Int32Array(n1), z: new Float64Array(n1 + 1) };
  let hmin = Infinity, hmax = -Infinity;
  for (let r0 = 0; r0 < H; r0 += BAND) {
    const r1_ = Math.min(H, r0 + BAND);
    const w0 = Math.max(0, r0 - EDT_HALO), w1 = Math.min(H, r1_ + EDT_HALO), rows = w1 - w0;
    const tb = Date.now();
    // heights for the band rows
    for (let j = r0; j < r1_; j++) {
      const [lat, lon0] = proj.toLatLon(grid.cx(0), grid.cz(j));
      sampler.sampleRow(lat, lon0, cell / proj.mPerDegLon, W, rowBuf);
      const o = j * W;
      for (let i = 0; i < W; i++) {
        let h = rowBuf[i];
        // d2 bake: the LiDAR's cell mean where it covers the US side, blended into 3DEP at its edge
        if (lidar) { h3dep[o + i] = Math.round(h * 10); const w = lidW[o + i]; if (w) h += (lidar.h[o + i] / 10 - h) * (w / 255); }
        hraw[o + i] = Math.round(h * 10); if (h < hmin) hmin = h; if (h > hmax) hmax = h;
      }
    }
    // distance to land (for water cells) and to water (for land cells)
    const gw = g.subarray(0, rows * W), dl = dLand.subarray(0, rows * W), dw = dWater.subarray(0, rows * W);
    for (let k = 0; k < rows * W; k++) gw[k] = lakeId[w0 * W + k] ? EDT_INF : 0;
    edt2d(gw, W, rows, dl, clampCells, scratch);
    for (let k = 0; k < rows * W; k++) gw[k] = lakeId[w0 * W + k] ? 0 : EDT_INF;
    edt2d(gw, W, rows, dw, clampCells, scratch);
    // signed metres, then a light 3x3 blur so the rasterized shoreline loses its staircase
    const s0 = Math.max(0, r0 - 1), s1 = Math.min(H, r1_ + 1);
    for (let j = s0; j < s1; j++) for (let i = 0; i < W; i++) {
      const k = j * W + i, kw = (j - w0) * W + i;
      sraw[(j - s0) * W + i] = lakeId[k] ? -(dl[kw] - 0.5) * cell : Math.min(maxDist, (dw[kw] - 0.5) * cell);
    }
    for (let j = r0; j < r1_; j++) for (let i = 0; i < W; i++) {
      let acc = 0, wsum = 0;
      for (let dj = -1; dj <= 1; dj++) {
        const jj = j + dj;
        if (jj < s0 || jj >= s1) continue;
        for (let di = -1; di <= 1; di++) {
          const ii = i + di;
          if (ii < 0 || ii >= W) continue;
          const w = dj === 0 && di === 0 ? 4 : (dj === 0 || di === 0 ? 1 : 0.5);
          acc += sraw[(jj - s0) * W + ii] * w; wsum += w;
        }
      }
      sdist[j * W + i] = Math.round(Math.max(-maxDist, Math.min(maxDist, acc / wsum)) * 10);
    }
    log(`pass 1 rows ${r0}-${r1_} of ${H} (${((Date.now() - tb) / 1000).toFixed(1)} s)`);
  }
  log(`elevation range ${hmin.toFixed(1)} .. ${hmax.toFixed(1)} m`);

  // --- basins: connected lake water shares one level; river polygons keep their own level so rapids
  //     between lakes do not merge lakes at different heights into one surface
  const isRiver = new Uint8Array(nLakes + 1);
  lakes.forEach((l, i) => { isRiver[i + 1] = l.river ? 1 : 0; });
  const basin = new Int32Array(N).fill(-1);
  const basins = [];
  const riverBasin = new Int32Array(nLakes + 1).fill(-1);
  const stack = [];
  for (let s = 0; s < N; s++) {
    const id = lakeId[s];
    if (!id || basin[s] >= 0) continue;
    if (isRiver[id]) {
      if (riverBasin[id] < 0) { riverBasin[id] = basins.length; basins.push({ cells: 0, river: true }); }
      basin[s] = riverBasin[id]; basins[riverBasin[id]].cells++;
      continue;
    }
    const b = basins.length;
    const rec = { cells: 0, river: false };
    basins.push(rec);
    stack.push(s); basin[s] = b;
    while (stack.length) {
      const k = stack.pop(); rec.cells++;
      const x = k % W, y = (k - x) / W;
      if (x > 0) { const n = k - 1; if (lakeId[n] && !isRiver[lakeId[n]] && basin[n] < 0) { basin[n] = b; stack.push(n); } }
      if (x < W - 1) { const n = k + 1; if (lakeId[n] && !isRiver[lakeId[n]] && basin[n] < 0) { basin[n] = b; stack.push(n); } }
      if (y > 0) { const n = k - W; if (lakeId[n] && !isRiver[lakeId[n]] && basin[n] < 0) { basin[n] = b; stack.push(n); } }
      if (y < H - 1) { const n = k + W; if (lakeId[n] && !isRiver[lakeId[n]] && basin[n] < 0) { basin[n] = b; stack.push(n); } }
    }
  }
  log(`${basins.length} water basins`);

  // water level per basin: a low percentile of interior cells (shoreline trees leak into the DEM and bias it upward)
  const basinPercentiles = (hraw) => {
    const nb = basins.length, out = new Float32Array(nb);
    const count = new Int32Array(nb + 1);
    for (let k = 0; k < N; k++) if (lakeId[k] && sdist[k] <= -140) count[basin[k] + 1]++;
    for (let b = 0; b < nb; b++) count[b + 1] += count[b];
    const fill = new Int32Array(nb);
    const samples = new Int16Array(count[nb]);
    for (let k = 0; k < N; k++) if (lakeId[k] && sdist[k] <= -140) { const b = basin[k]; samples[count[b] + fill[b]++] = hraw[k]; }
    const small = new Uint8Array(nb);
    for (let b = 0; b < nb; b++) {
      const seg = samples.subarray(count[b], count[b + 1]);
      if (seg.length >= 8) { seg.sort(); out[b] = seg[Math.floor(seg.length * 0.3)] / 10; } else small[b] = 1;
    }
    // small basins: all of their cells, at a lower percentile
    const count2 = new Int32Array(nb + 1);
    for (let k = 0; k < N; k++) if (lakeId[k] && small[basin[k]]) count2[basin[k] + 1]++;
    for (let b = 0; b < nb; b++) count2[b + 1] += count2[b];
    const fill2 = new Int32Array(nb);
    const samples2 = new Int16Array(count2[nb]);
    for (let k = 0; k < N; k++) if (lakeId[k] && small[basin[k]]) { const b = basin[k]; samples2[count2[b] + fill2[b]++] = hraw[k]; }
    for (let b = 0; b < nb; b++) if (small[b]) {
      const seg = samples2.subarray(count2[b], count2[b + 1]);
      seg.sort();
      out[b] = seg.length ? seg[Math.floor(seg.length * 0.12)] / 10 : 0;
    }
    return out;
  };
  {
    const lv = basinPercentiles(hraw);
    for (let b = 0; b < basins.length; b++) basins[b].level = lv[b];
  }
  // d2 bake: where the LiDAR covers a basin (8 cells or more), its level is the median of the LiDAR's hydro-flattened
  // surface over the basin's own cells, not per cell, so a border lake doesn't step at the edge of the flight (about
  // 0.3 m over the 3DEP percentile: the water on the flight days, April-May 2021); the 3DEP percentile stays as
  // `level3dep`
  if (lidar) {
    const l3 = basinPercentiles(h3dep), L = lidarBasinLevels(N, basin, basins.length, lidar);
    let used = 0, rise = [];
    for (let b = 0; b < basins.length; b++) {
      basins[b].level3dep = l3[b];
      if (Number.isNaN(L.level[b])) continue;
      basins[b].level = L.level[b]; basins[b].lidar = L.cells[b]; used++;
      if (!basins[b].river && basins[b].cells >= 2000) rise.push(L.level[b] - l3[b]);
    }
    rise.sort((a, b) => a - b);
    log(`d2 bake: ${used} of ${basins.length} basins levelled by the LiDAR; lakes of 20 ha or more rose by a median ${(rise[rise.length >> 1] || 0).toFixed(2)} m (5-95 %: ${(rise[Math.floor(rise.length * 0.05)] || 0).toFixed(2)} to ${(rise[Math.floor(rise.length * 0.95)] || 0).toFixed(2)})`);
  }
  // each polygon takes the level of the basin holding most of its cells
  const lakeBasin = new Int32Array(nLakes + 1).fill(-1);
  {
    const first = new Int32Array(nLakes + 1).fill(-1), firstCount = new Int32Array(nLakes + 1);
    const other = new Map();
    for (let k = 0; k < N; k++) {
      const id = lakeId[k];
      if (!id) continue;
      if (first[id] < 0) first[id] = basin[k];
      if (basin[k] === first[id]) firstCount[id]++;
      else { let m = other.get(id); if (!m) { m = new Map(); other.set(id, m); } m.set(basin[k], (m.get(basin[k]) || 0) + 1); }
    }
    for (let id = 1; id <= nLakes; id++) {
      let best = first[id], bestN = firstCount[id];
      const m = other.get(id);
      if (m) for (const [b, n] of m) if (n > bestN) { best = b; bestN = n; }
      lakeBasin[id] = best;
    }
  }
  const lakeLevel = new Float32Array(nLakes + 1);
  for (let id = 1; id <= nLakes; id++) lakeLevel[id] = lakeBasin[id] >= 0 ? basins[lakeBasin[id]].level : 0;

  // --- per-cell water level: lakes sit at their basin level; rivers and creeks follow a monotone profile
  //     fitted along their OSM centreline (drawn downstream), robust to shoreline trees in the DEM and
  //     anchored to the lakes they pass through, so rapids between lakes descend instead of terracing
  const level = new Int16Array(N);
  for (let k = 0; k < N; k++) if (lakeId[k]) level[k] = Math.round(lakeLevel[lakeId[k]] * 10);
  {
    const assigned = new Uint8Array(N);
    const WIN = 15; // nodes (150 m) either side for the running low percentile
    let fitted = 0, reversed = 0, perched = 0;
    const PERCH_MAX = 6; // m a waterway's fitted level may stand over the DEM of a river cell it is laid on
    const win = [];
    for (const wway of waterways) {
      const pts = resample(wway.pts, cell);
      const n = pts.length;
      if (n < 2) continue;
      let cells = new Int32Array(n), raw = new Float64Array(n), anchor = new Uint8Array(n);
      let valid = 0;
      for (let i = 0; i < n; i++) {
        const ci = grid.ci(pts[i][0]), cj = grid.cj(pts[i][1]);
        if (ci < 0 || cj < 0 || ci >= W || cj >= H) { cells[i] = -1; raw[i] = NaN; continue; }
        const k = cj * W + ci; cells[i] = k; valid++;
        const id = lakeId[k];
        if (id && !isRiver[id]) { raw[i] = lakeLevel[id]; anchor[i] = 1; } else raw[i] = hraw[k] / 10;
      }
      if (valid < 2) continue;
      let filt = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        if (anchor[i]) { filt[i] = raw[i]; continue; }
        win.length = 0;
        for (let j = Math.max(0, i - WIN); j <= Math.min(n - 1, i + WIN); j++) if (!Number.isNaN(raw[j])) win.push(raw[j]);
        if (!win.length) { filt[i] = NaN; continue; }
        win.sort((a, b) => a - b);
        filt[i] = win[Math.floor(win.length * 0.2)];
      }
      // fill gaps outside the grid from the nearest fitted neighbour
      for (let i = 0; i < n; i++) if (Number.isNaN(filt[i])) { let j = i - 1; while (j >= 0 && Number.isNaN(filt[j])) j--; if (j < 0) { j = i + 1; while (j < n && Number.isNaN(filt[j])) j++; } filt[i] = j >= 0 && j < n ? filt[j] : 0; }
      // OSM ways should run downstream; when the DEM clearly climbs along the way, trust the DEM
      const m = Math.max(3, Math.floor(n / 5));
      let head = 0, tail = 0;
      for (let i = 0; i < m; i++) { head += filt[i]; tail += filt[n - 1 - i]; }
      if (tail > head + 1.5 * m) { cells = cells.reverse(); raw = raw.reverse(); anchor = anchor.reverse(); filt = filt.reverse(); reversed++; }
      const w = new Float64Array(n);
      for (let i = 0; i < n; i++) w[i] = anchor[i] ? 50 : 1;
      const v = monotoneDecreasing(filt, w);
      // never above the lake upstream nor below the lake downstream
      let hi = Infinity;
      for (let i = 0; i < n; i++) { if (anchor[i]) hi = raw[i]; else if (v[i] > hi) v[i] = hi; }
      let lo = -Infinity;
      for (let i = n - 1; i >= 0; i--) { if (anchor[i]) lo = raw[i]; else if (v[i] < lo) v[i] = lo; }
      // holes pass: never a level far over the ground under the cell itself. A line whose ends the fit takes the wrong way
      // round (a creek out of a perched lake read as running into it) is clamped up to that lake's level all along, so
      // where it crossed the Louse River the river's cells took a level 65 m over their ground, and the shore lift below
      // stood the land round them up to it: a canyon of land walls round the real river. Such a node is left to the
      // spread from the river's other cells.
      for (let i = 0; i < n; i++) {
        const k = cells[i];
        if (k >= 0 && lakeId[k] && isRiver[lakeId[k]]) {
          if (v[i] > hraw[k] / 10 + PERCH_MAX) { perched++; continue; }
          level[k] = Math.round(v[i] * 10); assigned[k] = 1;
        }
      }
      fitted++;
    }
    // spread the fitted levels across the river's width and along stretches without a line of their own
    const queue = new Int32Array(waterCells);
    let head = 0, tail = 0;
    for (let k = 0; k < N; k++) if (assigned[k]) queue[tail++] = k;
    while (head < tail) {
      const k = queue[head++], x = k % W, y = (k - x) / W, L = level[k];
      const nb = [x > 0 ? k - 1 : -1, x < W - 1 ? k + 1 : -1, y > 0 ? k - W : -1, y < H - 1 ? k + W : -1];
      for (const q of nb) if (q >= 0 && !assigned[q] && lakeId[q] && isRiver[lakeId[q]]) { assigned[q] = 1; level[q] = L; queue[tail++] = q; }
    }
    log(`${fitted} waterway profiles fitted (${reversed} drawn upstream), ${tail} river cells levelled (${perched} line cells left to the spread: the fit stood over ${PERCH_MAX} m above their ground)`);
  }
  // display level per polygon: lakes keep the basin level, rivers and creeks the mean of their cells
  {
    const sumL = new Float64Array(nLakes + 1);
    for (let k = 0; k < N; k++) if (lakeId[k] && isRiver[lakeId[k]]) sumL[lakeId[k]] += level[k] / 10;
    for (let id = 1; id <= nLakes; id++) if (isRiver[id] && lakeArea[id]) lakeLevel[id] = sumL[id] / lakeArea[id];
  }
  // --- real depth where the DNR has mapped the lake: its contour lines are rasterized as known depths, the
  //     shore ring is pinned at zero, and everything between is relaxed to a smooth surface (nearest known
  //     depth as the start, then Gauss-Seidel sweeps). Lakes without a DNR map keep the synthetic ramp.
  const depth = new Int16Array(N); // decimetres below the surface
  const bathyLake = new Uint8Array(nLakes + 1);
  {
    const inDomain = new Uint8Array(N), known = new Uint8Array(N);
    const bathyBasin = new Uint8Array(basins.length);
    let contourCells = 0;
    for (const c of bathy.contours) {
      const dm = Math.round(c.depthFt * 0.3048 * 10);
      for (const line of c.lines) {
        const pts = line.map(([lat, lon]) => proj.toLocal(lat, lon));
        for (let s2 = 1; s2 < pts.length; s2++) {
          const [x1, z1] = pts[s2 - 1], [x2, z2] = pts[s2];
          const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, z2 - z1) / (cell * 0.5)));
          for (let q = 0; q <= steps; q++) {
            const t = q / steps, i = grid.ci(x1 + (x2 - x1) * t), j = grid.cj(z1 + (z2 - z1) * t);
            if (i < 0 || j < 0 || i >= W || j >= H) continue;
            const k = j * W + i, id = lakeId[k];
            if (!id || isRiver[id]) continue;
            if (!known[k]) { known[k] = 1; contourCells++; depth[k] = dm; } else if (dm > depth[k]) depth[k] = dm;
            bathyBasin[basin[k]] = 1;
          }
        }
      }
    }
    // the domain: lake water of every basin that has a contour; the first ring of water cells is the shore
    let domainCells = 0, knownCells = 0;
    for (let k = 0; k < N; k++) {
      const id = lakeId[k];
      if (!id || isRiver[id] || !bathyBasin[basin[k]]) continue;
      inDomain[k] = 1; domainCells++; bathyLake[id] = 1;
      if (!known[k] && sdist[k] > -50) { known[k] = 1; depth[k] = 0; }
      if (known[k]) knownCells++;
    }
    // start every cell from the nearest known depth
    const queue = new Int32Array(domainCells);
    const visited = new Uint8Array(N);
    let head = 0, tail = 0;
    for (let k = 0; k < N; k++) if (inDomain[k] && known[k]) { visited[k] = 1; queue[tail++] = k; }
    while (head < tail) {
      const k = queue[head++], x = k % W, d = depth[k];
      const nb = [x > 0 ? k - 1 : -1, x < W - 1 ? k + 1 : -1, k - W, k + W];
      for (const q of nb) if (q >= 0 && q < N && inDomain[q] && !visited[q]) { visited[q] = 1; depth[q] = d; queue[tail++] = q; }
    }
    // relax the unknown cells toward the mean of their water neighbours; the start is already close, so a
    // few dozen sweeps smooth the steps between contours
    const unknown = new Int32Array(domainCells - knownCells);
    let u = 0;
    for (let k = 0; k < N; k++) if (inDomain[k] && !known[k]) unknown[u++] = k;
    for (let sweep = 0; sweep < 60; sweep++) {
      const fwd = (sweep & 1) === 0;
      for (let n = 0; n < unknown.length; n++) {
        const k = unknown[fwd ? n : unknown.length - 1 - n], x = k % W;
        let sum = 0, cnt = 0;
        if (x > 0 && inDomain[k - 1]) { sum += depth[k - 1]; cnt++; }
        if (x < W - 1 && inDomain[k + 1]) { sum += depth[k + 1]; cnt++; }
        if (k >= W && inDomain[k - W]) { sum += depth[k - W]; cnt++; }
        if (k + W < N && inDomain[k + W]) { sum += depth[k + W]; cnt++; }
        if (cnt) depth[k] = Math.round(sum / cnt);
      }
    }
    let nb = 0, deepest = 0;
    for (let id = 1; id <= nLakes; id++) if (bathyLake[id]) nb++;
    for (let k = 0; k < N; k++) if (depth[k] > deepest) deepest = depth[k];
    log(`bathymetry: ${bathy.contours.length} DNR contours on ${contourCells} cells, ${nb} polygons with real depth over ${domainCells} cells, deepest ${(deepest / 10).toFixed(1)} m`);
  }

  // --- clarity: each DNR lake polygon (with its mean Secchi depth) is sampled on a coarse lattice and its
  //     reading goes to every OSM polygon that holds a fair share of those samples. Lakes the DNR has not
  //     measured take a distance-weighted mean of measured lakes nearby; rivers and creeks run a little more
  //     stained than the lakes they drain.
  const secchi = new Float32Array(nLakes + 1);
  const secchiSrc = new Uint8Array(nLakes + 1); // 1 measured, 2 estimated from neighbours
  const tpById = new Float32Array(nLakes + 1);
  {
    const STEP = 4; // cells between samples
    const tally = new Map(); // lake id -> Map(dow -> count)
    const measured = [];
    for (const dl of clarityData.lakes) {
      const rings = dl.rings.map((rg) => rg.map(([lat, lon]) => proj.toLocal(lat, lon)));
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const rg of rings) for (const [x, z] of rg) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z; }
      if (!inGrid(minX, maxX, minZ, maxZ)) continue;
      const counts = new Map();
      let total = 0, sx = 0, sz = 0;
      const j0 = Math.max(0, grid.cj(minZ)), j1 = Math.min(H - 1, grid.cj(maxZ)), i0 = Math.max(0, grid.ci(minX)), i1 = Math.min(W - 1, grid.ci(maxX));
      const xs = [];
      for (let j = j0; j <= j1; j += STEP) {
        const zc = grid.cz(j);
        xs.length = 0;
        for (const rg of rings) for (let a = 0, n = rg.length; a < n; a++) { const [x1, z1] = rg[a], [x2, z2] = rg[(a + 1) % n]; if ((z1 <= zc) !== (z2 <= zc)) xs.push(x1 + ((zc - z1) * (x2 - x1)) / (z2 - z1)); }
        if (xs.length < 2) continue;
        xs.sort((a, b) => a - b);
        for (let q = 0; q + 1 < xs.length; q += 2) {
          const ia = Math.max(i0, Math.ceil((xs[q] - grid.originX) / cell - 0.5)), ib = Math.min(i1, Math.floor((xs[q + 1] - grid.originX) / cell - 0.5));
          for (let i = ia; i <= ib; i += STEP) { const id = lakeId[j * W + i]; total++; sx += grid.cx(i); sz += grid.cz(j); if (id && !isRiver[id]) counts.set(id, (counts.get(id) || 0) + 1); }
        }
      }
      if (!total) continue;
      measured.push({ x: sx / total, z: sz / total, secchi: dl.secchi });
      for (const [id, n] of counts) {
        if (n < total * 0.15 && n < lakeArea[id] / (STEP * STEP) * 0.5) continue; // a sliver of a neighbour
        let m = tally.get(id); if (!m) { m = new Map(); tally.set(id, m); }
        m.set(dl.dow, (m.get(dl.dow) || 0) + n);
      }
      for (const [id] of counts) if (!tpById[id] && dl.tp) tpById[id] = dl.tp;
    }
    const byDow = new Map(clarityData.lakes.map((l) => [l.dow, l]));
    for (const [id, m] of tally) {
      let best = null; for (const [dow, n] of m) if (!best || n > best.n) best = { dow, n };
      secchi[id] = byDow.get(best.dow).secchi; secchiSrc[id] = 1;
    }
    // unmeasured lakes: inverse-distance mean of measured lakes within 15 km, else the regional default
    const DEFAULT = 2.6;
    for (let id = 1; id <= nLakes; id++) {
      if (secchiSrc[id] || !lakeArea[id]) continue;
      const cx = grid.cx(sumI[id] / lakeArea[id]), cz = grid.cz(sumJ[id] / lakeArea[id]);
      let ws = 0, wsum = 0;
      for (const mz of measured) { const d = Math.hypot(mz.x - cx, mz.z - cz); if (d < 15000) { const wgt = 1 / (1000 + d); ws += wgt * mz.secchi; wsum += wgt; } }
      secchi[id] = wsum ? ws / wsum : DEFAULT;
      if (isRiver[id]) secchi[id] *= 0.8;
      secchiSrc[id] = 2;
    }
    let nm = 0; for (let id = 1; id <= nLakes; id++) if (secchiSrc[id] === 1) nm++;
    log(`clarity: ${clarityData.lakes.length} DNR lakes with Secchi, ${nm} polygons measured, the rest estimated from neighbours`);
  }

  // a basin is named after its largest named polygon (channels and bays are often unnamed)
  lakes.forEach((l, i) => {
    const id = i + 1, b = basins[lakeBasin[id]];
    if (!b || !l.name || !lakeArea[id]) return;
    if (lakeArea[id] > (b.nameArea || 0)) { b.name = l.name; b.nameArea = lakeArea[id]; }
  });
  const basinName = (id) => (id > 0 && basins[lakeBasin[id]]?.name) || lakes[id - 1]?.name || null;
  // unnamed polygons (river channels, bays) take the name of the nearest named polygon reachable by water:
  // one multi-source breadth-first search over all water cells, reusing the basin array as the label field
  const displayName = new Array(nLakes + 1).fill(null);
  {
    const src = basin; // reused: nearest named polygon id per water cell
    const queue = new Int32Array(waterCells);
    let head = 0, tail = 0;
    for (let k = 0; k < N; k++) {
      const id = lakeId[k];
      if (!id) continue;
      if (lakes[id - 1].name) { src[k] = id; queue[tail++] = k; } else src[k] = 0;
    }
    while (head < tail) {
      const k = queue[head++];
      const x = k % W, y = (k - x) / W, s = src[k];
      if (x > 0 && lakeId[k - 1] && !src[k - 1]) { src[k - 1] = s; queue[tail++] = k - 1; }
      if (x < W - 1 && lakeId[k + 1] && !src[k + 1]) { src[k + 1] = s; queue[tail++] = k + 1; }
      if (y > 0 && lakeId[k - W] && !src[k - W]) { src[k - W] = s; queue[tail++] = k - W; }
      if (y < H - 1 && lakeId[k + W] && !src[k + W]) { src[k + W] = s; queue[tail++] = k + W; }
    }
    for (let k = 0; k < N; k++) {
      const id = lakeId[k];
      if (!id || displayName[id]) continue;
      displayName[id] = lakes[id - 1].name || (src[k] ? lakes[src[k] - 1].name : null);
    }
  }
  log(`levels and names assigned (${((Date.now() - t0) / 1000).toFixed(0)} s so far)`);

  // --- portages: the first bake's 969 as they were, then the ones it dropped, connected (world-links.mjs)
  const water = makeWater({ grid, lakeAt: (i, j) => lakeId[j * W + i], sdAt: (i, j) => sdist[j * W + i] / 10, name: (id) => displayName[id] || null, basin: (id) => lakeBasin[id], big: (id) => !lakes[id - 1].creek && lakeArea[id] >= 50 });
  let portages;
  {
    const { kept, added, report } = linkPortages(chainsFrom(osm.portages, proj), water);
    portages = [...kept, ...added];
    log(`${report.candidates} candidate trails: ${report.kept} kept as they are, ${report.added} of the ${report.dropped} the first bake dropped connected (${JSON.stringify(report.done)}), ${report.left.length} left out`);
    for (const l of report.left) log(`  left out: ${l.names.join('/') || 'unnamed'}: ${l.why}`);
  }

  // --- campsites
  const campsites = [];
  for (const c of osm.campsites) {
    const [x, z] = proj.toLocal(c.lat, c.lon);
    const i = grid.ci(x), j = grid.cj(z);
    if (i < 1 || j < 1 || i >= W - 1 || j >= H - 1) continue;
    const k = j * W + i;
    campsites.push({ x: r1(x), z: r1(z), name: c.name || null, onWater: !!lakeId[k], shore: sdist[k] / 10 });
  }
  log(`${campsites.length} campsites`);

  // --- pass 2: shape lake beds and shores, write tiles, collect the far field and the overview
  const hq = new Int16Array(N); // final heights, decimetres (reuses nothing: hraw is still needed for the halo rows)
  const farW = W / FAR, farH = H / FAR;
  const farHgt = new Int16Array(farW * farH), farLake = new Uint16Array(farW * farH), farSd = new Int16Array(farW * farH), farLvl = new Int16Array(farW * farH);
  const ovW = W / OV, ovH = H / OV;
  const ovHgt = new Int16Array(ovW * ovH), ovSd = new Int16Array(ovW * ovH);
  const tileMeta = new Array(ntx * nty);
  const LIFT = 5; // cells: land this close to water is lifted above the neighbouring water level
  const LIFT_MAX = 8; // m: the most that lift raises any land cell (holes pass)
  const lvlRow = new Float32Array(W);
  {
    const outRows = BAND + 2 * LIFT;
    const out = new Float32Array(outRows * W);
    const rowMax = new Float32Array(outRows * W);
    for (let r0 = 0; r0 < H; r0 += BAND) {
      const tb = Date.now();
      const r1_ = Math.min(H, r0 + BAND);
      const w0 = Math.max(0, r0 - LIFT), w1 = Math.min(H, r1_ + LIFT), rows = w1 - w0;
      // carve beds under water cells; row-wise max of nearby water levels for the shore lift
      for (let j = w0; j < w1; j++) {
        const o = j * W, ow = (j - w0) * W;
        for (let i = 0; i < W; i++) {
          const k = o + i, id = lakeId[k], sd = sdist[k] / 10;
          let h = hraw[k] / 10;
          if (id) {
            const dm = Math.max(0, 5 - sd), ramp = 0.6 + dm * 0.09;
            // mapped lakes take the DNR depth (never shallower than a short ramp off the beach); the rest a synthetic bed
            if (bathyLake[id]) h = level[k] / 10 - Math.max(depth[k] / 10, Math.min(2, ramp));
            else h = Math.min(h, level[k] / 10 - Math.min(14, ramp));
          }
          out[ow + i] = h;
        }
        for (let i = 0; i < W; i++) {
          let m = -Infinity;
          if (Math.abs(sdist[o + i]) <= 1000) for (let di = -LIFT; di <= LIFT; di++) { const ii = i + di; if (ii >= 0 && ii < W && lakeId[o + ii]) { const L = level[o + ii] / 10; if (L > m) m = L; } }
          rowMax[ow + i] = m;
        }
      }
      // shoreline land must sit above the neighbouring water and climb away from it
      for (let j = Math.max(0, r0 - LIFT); j < Math.min(H, r1_ + LIFT); j++) {
        const o = j * W, ow = (j - w0) * W;
        for (let i = 0; i < W; i++) {
          const k = o + i;
          if (lakeId[k] || sdist[k] > 400) continue;
          let m = -Infinity;
          for (let dj = -LIFT; dj <= LIFT; dj++) { const jj = j + dj; if (jj >= w0 && jj < w1) { const v = rowMax[(jj - w0) * W + i]; if (v > m) m = v; } }
          if (m > -Infinity) {
            // (holes pass: by LIFT_MAX at most: a level that stands far over the ground, wrong in the data, made walls of
            // land tens of metres high round it, a canyon with the real river at its foot)
            const dToWater = sdist[k] / 10 / cell + 0.5, h0 = out[ow + i];
            out[ow + i] = Math.max(h0, Math.min(h0 + LIFT_MAX, m + 0.3 + Math.max(0, dToWater - 1) * 1.1));
          }
        }
      }
      for (let j = w0; j < w1; j++) {
        const o = j * W, ow = (j - w0) * W;
        for (let i = 0; i < W; i++) hq[o + i] = Math.round(Math.max(-32000, Math.min(32000, out[ow + i] * 10)));
      }
      // far field (80 m): block mean height and shore distance, the deepest cell decides the lake id
      for (let fj = r0 / FAR; fj < r1_ / FAR; fj++) for (let fi = 0; fi < farW; fi++) {
        let sh = 0, ss = 0, minSd = 32767, id = 0, lv = 0;
        for (let dj = 0; dj < FAR; dj++) { const o = (fj * FAR + dj) * W + fi * FAR; for (let di = 0; di < FAR; di++) { const k = o + di; sh += hq[k]; ss += sdist[k]; if (sdist[k] < minSd) { minSd = sdist[k]; id = lakeId[k]; lv = level[k]; } } }
        const f = fj * farW + fi;
        farHgt[f] = Math.round(sh / (FAR * FAR)); farSd[f] = Math.round(ss / (FAR * FAR));
        farLake[f] = minSd < 0 ? id : 0;
        farLvl[f] = minSd < 0 ? lv : farHgt[f];
      }
      for (let oj = r0 / OV; oj < r1_ / OV; oj++) for (let oi = 0; oi < ovW; oi++) {
        const k = (oj * OV + OV / 2) * W + oi * OV + OV / 2;
        ovHgt[oj * ovW + oi] = hq[k]; ovSd[oj * ovW + oi] = sdist[k];
      }
      log(`pass 2 rows ${r0}-${r1_} shaped (${((Date.now() - tb) / 1000).toFixed(1)} s)`);
    }
  }
  // --- p2 B: the rivers' and creeks' levels graded along their channels (water-grade.mjs: the profile fits' staircase
  //     and the seams between two lines' fits ironed out, the rapids at the portages kept short and steep). Each graded
  //     water cell's bed moves with its surface, the land is left as it is (the grade stays within what the land lift
  //     above allows), and the far field and the overview take the moved cells; the release data-v3 has the same done
  //     at runtime from src/water-grade.bin (scripts/water-grade-fix.mjs)
  {
    const tb = Date.now();
    const river = [];
    for (let k = 0; k < N; k++) if (lakeId[k] && isRiver[lakeId[k]]) river.push(k);
    const res = gradeLevels({ W, H, cell, originX: grid.originX, originZ: grid.originZ, lake: (k) => lakeId[k], river: (id) => !!isRiver[id], level: (k) => level[k], riverCells: Int32Array.from(river), portages });
    const touched = new Set(), ovTouched = new Set();
    for (let a = 0; a < res.cells.length; a++) {
      const k = res.cells[a], d = res.delta[a], i = k % W, j = (k - i) / W;
      level[k] += d; hq[k] += d;
      touched.add(((j / FAR) | 0) * farW + ((i / FAR) | 0));
      if (i % OV === OV / 2 && j % OV === OV / 2) ovTouched.add(k);
    }
    for (const f of touched) {
      const fi = f % farW, fj = (f - fi) / farW;
      let sh = 0, minSd = 32767, lv = 0;
      for (let dj = 0; dj < FAR; dj++) { const o = (fj * FAR + dj) * W + fi * FAR; for (let di = 0; di < FAR; di++) { const k = o + di; sh += hq[k]; if (sdist[k] < minSd) { minSd = sdist[k]; lv = level[k]; } } }
      farHgt[f] = Math.round(sh / (FAR * FAR));
      farLvl[f] = minSd < 0 ? lv : farHgt[f];
    }
    for (const k of ovTouched) { const i = k % W, j = (k - i) / W; ovHgt[((j - OV / 2) / OV) * ovW + (i - OV / 2) / OV] = hq[k]; }
    const sumL = new Float64Array(nLakes + 1);
    for (const k of river) sumL[lakeId[k]] += level[k] / 10;
    for (let id = 1; id <= nLakes; id++) if (isRiver[id] && lakeArea[id]) lakeLevel[id] = sumL[id] / lakeArea[id];
    const { histBefore, histAfter, sample, ...st } = res.stats; void histBefore; void histAfter; void sample;
    log(`river and creek levels graded (${((Date.now() - tb) / 1000).toFixed(1)} s): ${JSON.stringify(st)}`);
  }
  // --- d2 bake: the v4 channels (v4-products.mjs), now the water is known; each polygon's colour from d1-quetico-lakes'
  //     table, joined by its osm id
  const colourOf = new Array(nLakes + 1).fill(null);
  if (P && P.colourTable) {
    let hit = 0, sameId = 0;
    lakes.forEach((l, i) => { const r = P.colourTable.get(l.osm); if (r) { colourOf[i + 1] = r; hit++; if (r.id === i + 1) sameId++; } });
    log(`d2 bake: water colour for ${hit} of ${nLakes} polygons (${sameId} under the same id the colour table expected)`);
  }
  const V4 = P ? makeChannels(grid, P, lakeId, (id) => colourOf[id], log).ch : null;
  const NCH = V4 ? V4_CHANNELS.length : 0;
  // the beds in each lake (ground kinds 8 and 9 on its own cells), for the rice and the lilies (d2 water)
  const emergent = new Uint32Array(nLakes + 1), aqBed = new Uint32Array(nLakes + 1);
  if (V4) for (let k = 0; k < N; k++) { const id = lakeId[k]; if (!id) continue; const g = V4.ground[k]; if (g === 8) emergent[id]++; else if (g === 9) aqBed[id]++; }
  // tiles: (tile + 2 halo)^2 cells each, edges replicated beyond the grid; v4: a Uint8 plane per channel after the four
  {
    const tb = Date.now();
    const n = SIDE * SIDE;
    const buf = Buffer.alloc(n * (8 + NCH));
    const th = new Int16Array(buf.buffer, buf.byteOffset, n);
    const tl = new Uint16Array(buf.buffer, buf.byteOffset + n * 2, n);
    const ts = new Int16Array(buf.buffer, buf.byteOffset + n * 4, n);
    const tv = new Int16Array(buf.buffer, buf.byteOffset + n * 6, n);
    const planes = V4 ? V4_CHANNELS.map((c, q) => [new Uint8Array(buf.buffer, buf.byteOffset + n * (8 + q), n), V4[c.name]]) : [];
    const keep = opt.tiles ? (tx, ty) => tx >= opt.tiles.x0 && tx <= opt.tiles.x1 && ty >= opt.tiles.y0 && ty <= opt.tiles.y1 : () => true;
    let written = 0, bytes = 0;
    for (let ty = 0; ty < nty; ty++) for (let tx = 0; tx < ntx; tx++) {
      let water = 0, mn = 32767, mx = -32768;
      for (let lj = 0; lj < SIDE; lj++) {
        const j = Math.max(0, Math.min(H - 1, ty * T - HALO + lj));
        for (let li = 0; li < SIDE; li++) {
          const i = Math.max(0, Math.min(W - 1, tx * T - HALO + li));
          const k = j * W + i, m = lj * SIDE + li;
          // (d2 bake: v4's level is 0 on land, where v3 copied the height: every reader asks it of water cells only, and
          // the copy cost 120 MB of the release)
          th[m] = hq[k]; tl[m] = lakeId[k]; ts[m] = sdist[k]; tv[m] = lakeId[k] ? level[k] : V4 ? 0 : hq[k];
          for (let q = 0; q < planes.length; q++) planes[q][0][m] = planes[q][1][k];
          if (lj >= HALO && lj < HALO + T && li >= HALO && li < HALO + T) { if (lakeId[k]) water = 1; if (hq[k] < mn) mn = hq[k]; if (hq[k] > mx) mx = hq[k]; }
        }
      }
      tileMeta[ty * ntx + tx] = [water, mn, mx];
      if (!keep(tx, ty)) continue;
      const gz = zlib.gzipSync(buf, { level: 6 });
      bytes += gz.length;
      fs.writeFileSync(path.join(opt.out, 'tiles', `${tx}_${ty}.bin`), gz);
      if (++written % 200 === 0) log(`  ${written}/${ntx * nty} tiles written`);
    }
    log(`${written} tiles written, ${(bytes / 1048576).toFixed(1)} MB (${((Date.now() - tb) / 1000).toFixed(1)} s)`);
  }
  // far tiles: same layout on the 80 m grid
  const nfx = Math.ceil(farW / FT), nfy = Math.ceil(farH / FT);
  {
    const FS = FT + 2 * HALO;
    const buf = Buffer.alloc(FS * FS * 8);
    const th = new Int16Array(buf.buffer, buf.byteOffset, FS * FS);
    const tl = new Uint16Array(buf.buffer, buf.byteOffset + FS * FS * 2, FS * FS);
    const ts = new Int16Array(buf.buffer, buf.byteOffset + FS * FS * 4, FS * FS);
    const tv = new Int16Array(buf.buffer, buf.byteOffset + FS * FS * 6, FS * FS);
    for (let fy = 0; fy < nfy; fy++) for (let fx = 0; fx < nfx; fx++) {
      for (let lj = 0; lj < FS; lj++) {
        const j = Math.max(0, Math.min(farH - 1, fy * FT - HALO + lj));
        for (let li = 0; li < FS; li++) {
          const i = Math.max(0, Math.min(farW - 1, fx * FT - HALO + li));
          const k = j * farW + i, m = lj * FS + li;
          th[m] = farHgt[k]; tl[m] = farLake[k]; ts[m] = farSd[k]; tv[m] = farLvl[k];
        }
      }
      fs.writeFileSync(path.join(opt.out, 'far', `${fx}_${fy}.bin`), zlib.gzipSync(buf, { level: 6 }));
    }
    log(`${nfx * nfy} far tiles written`);
  }
  // overview image for the map: water tinted by depth, land hill-shaded from the north-west. Tints are
  // quantised to a few levels so the PNG stays small; the minimap draws loaded tiles at full detail anyway.
  {
    const png = new PNG({ width: ovW, height: ovH });
    const lo = hmin, span = Math.max(1, hmax - hmin);
    const H2 = (i, j) => ovHgt[Math.max(0, Math.min(ovH - 1, j)) * ovW + Math.max(0, Math.min(ovW - 1, i))] / 10;
    const qz = (v, n) => Math.round(v * n) / n;
    for (let j = 0; j < ovH; j++) for (let i = 0; i < ovW; i++) {
      const k = j * ovW + i, o = k * 4, sd = ovSd[k] / 10;
      let r, g_, b;
      if (sd < 0) {
        const d = qz(Math.max(0, Math.min(1, -sd / 60)), 4);
        r = 70 - d * 30; g_ = 140 - d * 40; b = 175 - d * 30;
      } else {
        const t = qz(Math.max(0, Math.min(1, (H2(i, j) - lo) / span)), 12);
        const hl = H2(i - 1, j - 1) - H2(i + 1, j + 1);
        const s = qz(Math.max(0.6, Math.min(1.15, 0.85 + hl * 0.02)), 10);
        r = (78 + t * 70) * s; g_ = (112 + t * 60) * s; b = (58 + t * 40) * s;
      }
      png.data[o] = r; png.data[o + 1] = g_; png.data[o + 2] = b; png.data[o + 3] = 255;
    }
    fs.writeFileSync(path.join(opt.out, 'overview.png'), PNG.sync.write(png));
    log(`overview ${ovW} x ${ovH} px written`);
  }

  // --- entry points: the hand list's real put-ins (scripts/entrypoints.json), on the water put into there (world-links.mjs)
  const entryPoints = [];
  let landings = [];
  {
    const handList = JSON.parse(await fsp.readFile(new URL('./entrypoints.json', import.meta.url), 'utf8'));
    landings = placeLandings(handList, water, proj, { portages, campsites });
    for (const L of landings) {
      if (L.missing) { log(`  entry point ${L.ep} ${L.name}: no water near its put-in`); continue; }
      entryPoints.push({ ep: L.ep, name: L.name, x: L.x, z: L.z, lake: L.lake });
      log(`  entry point ${L.ep} ${L.name} -> ${displayName[L.lake] || 'unnamed'}, ${L.off} m from the put-in (${L.how})`);
    }
    entryPoints.sort((a, b) => a.ep - b.ep);
  }
  // --- d2 bake: d1 names' official campsites OpenStreetMap lacks and the clear USFS-only portages (official-adds.mjs),
  //     appended after the extract's own as world-fixes.json appended them to data-v3; then each site's water: the lake
  //     of the nearest water cell within 400 m (as scripts/site-lakes.mjs made src/site-lakes.json for data-v3)
  let namesAdded = null;
  if (P) {
    const lakeAt = (i, j) => (i < 0 || j < 0 || i >= W || j >= H ? 0 : lakeId[j * W + i]);
    const sdAt = (i, j) => (i < 0 || j < 0 || i >= W || j >= H ? 3000 : sdist[j * W + i] / 10);
    namesAdded = officialAdds({ grid, proj, lakeAt, sdAt, water, portages, landings, campsites, cacheDir: CFG.cacheDir, log });
    if (namesAdded) {
      for (const c of namesAdded.campsites) campsites.push({ x: c.x, z: c.z, name: c.name, onWater: false, shore: c.shore, usfs: c.usfs, added: true });
      for (const p of namesAdded.portages) portages.push(p);
    }
    const R = 40;
    let found = 0;
    for (const c of campsites) {
      const ci = grid.ci(c.x), cj = grid.cj(c.z);
      let best = 0, bd = Infinity;
      for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
        const d = di * di + dj * dj; if (d >= bd || d > R * R) continue;
        const id = lakeAt(ci + di, cj + dj); if (id) { bd = d; best = id; }
      }
      c.lake = best;
      if (best) found++;
    }
    log(`d2 bake: ${campsites.length} campsites (${namesAdded ? namesAdded.campsites.length : 0} official ones added), ${found} with water within 400 m; ${portages.length} portages (${namesAdded ? namesAdded.portages.length : 0} USFS-only added)`);
  }

  // --- start position: the Lake One landing when it is in the area, else the first entry point, else the biggest lake
  let start = null;
  const ep30 = entryPoints.find((e) => e.ep === 30);
  if (ep30 && basinName(ep30.lake) === 'Lake One') { start = { x: ep30.x, z: ep30.z, lake: ep30.lake }; log('start from entry point 30'); }
  if (!start) for (const p of osm.pois) {
    const t = p.tags;
    if (t.leisure === 'slipway' || (t.amenity === 'parking' && /lake one/i.test(t.name || ''))) {
      const [x, z] = proj.toLocal(p.lat, p.lon);
      if (grid.ci(x) < 0 || grid.ci(x) >= W || grid.cj(z) < 0 || grid.cj(z) >= H) continue;
      const l = findLaunch(x, z, grid, lakeId, sdist, 25);
      if (l && basinName(l.lake) === 'Lake One') { start = l; log('start from OSM', t.leisure || t.amenity, t.name || ''); break; }
    }
  }
  if (!start) {
    const [x, z] = proj.toLocal(...CFG.startLatLon);
    if (grid.ci(x) >= 0 && grid.ci(x) < W && grid.cj(z) >= 0 && grid.cj(z) < H) start = findLaunch(x, z, grid, lakeId, sdist, 40);
    if (start) log('start from fallback coordinates');
  }
  if (!start && entryPoints.length) { start = { x: entryPoints[0].x, z: entryPoints[0].z, lake: entryPoints[0].lake }; log('start from entry point', entryPoints[0].name); }
  if (!start) {
    let big = 0;
    for (let id = 1; id <= nLakes; id++) if (lakes[id - 1].name && lakeArea[id] > (big ? lakeArea[big] : 0)) big = id;
    const [cx, cz] = [grid.cx(sumI[big] / lakeArea[big]), grid.cz(sumJ[big] / lakeArea[big])];
    start = findLaunch(cx, cz, grid, lakeId, sdist, 60, big) || { x: cx, z: cz, lake: big };
    log('start from the largest named lake', lakes[big - 1].name);
  }

  // --- index
  const maxDepth = new Int16Array(nLakes + 1);
  for (let k = 0; k < N; k++) if (lakeId[k] && depth[k] > maxDepth[lakeId[k]]) maxDepth[lakeId[k]] = depth[k];
  const lakeMeta = lakes.map((l, i) => {
    const id = i + 1;
    if (!lakeArea[id]) return null;
    const rec = { id, name: l.name, displayName: displayName[id], river: l.river || undefined, creek: l.creek || undefined, basin: lakeBasin[id], level: +lakeLevel[id].toFixed(2), cells: lakeArea[id], maxDepth: bathyLake[id] ? +(maxDepth[id] / 10).toFixed(1) : undefined,
      secchi: +secchi[id].toFixed(2), secchiMeasured: secchiSrc[id] === 1 || undefined, tp: tpById[id] ? +tpById[id].toFixed(1) : undefined,
      cx: r1(grid.cx(sumI[id] / lakeArea[id])), cz: r1(grid.cz(sumJ[id] / lakeArea[id])), osm: l.osm };
    // d2 bake: the water's colour (UMN LakeBrowser through d1-quetico-lakes: secchi m, cdom a440 per m, chla ug/L, where
    // it came from), the DNR's DOW numbers, the beds' cells (ground 8 and 9) and the 3DEP level before the LiDAR's
    const c = colourOf[id];
    if (c && c.secchi > 0 && c.cdom > 0) {
      rec.secchi = +c.secchi.toFixed(2); rec.secchiMeasured = c.src === 'lake' || c.src === 'dnr' || undefined;
      rec.cdom = +c.cdom.toFixed(2); if (c.chla > 0) rec.chla = +c.chla.toFixed(1); rec.colourSrc = c.src;
    }
    const dow = c && Array.isArray(c.dow) ? c.dow.filter((d) => /^\d{6,}$/.test(String(d).trim())).map((d) => String(d).trim()) : [];
    if (dow.length) rec.dow = dow;
    if (emergent[id]) rec.emergent = emergent[id];
    if (aqBed[id]) rec.aqBed = aqBed[id];
    const b = basins[lakeBasin[id]];
    if (b && b.level3dep !== undefined && !l.river) rec.level3dep = +b.level3dep.toFixed(2);
    return rec;
  });
  const basinMeta = basins.map((b, i) => ({ id: i, name: b.name || null, level: +b.level.toFixed(2), cells: b.cells, river: b.river || undefined, level3dep: b.level3dep !== undefined ? +b.level3dep.toFixed(2) : undefined, lidar: b.lidar || undefined }));
  const index = {
    version: V4 ? 4 : 3,
    fields: V4 ? V4_FIELDS : ['height', 'lake', 'sdist', 'level'],
    // d2 bake: the Uint8 planes after the four (v4-products.mjs): plane `at` starts at byte at x side^2 of a fine tile
    channels: V4 ? V4_CHANNELS.map((c, q) => ({ ...c, at: 8 + q })) : undefined,
    source: { elevation: 'AWS Terrarium tiles (Mapzen/USGS 3DEP, SRTM) z' + CFG.zoom, map: '© OpenStreetMap contributors, ODbL (Geofabrik extracts: ' + (osm.source || CFG.extracts).join(', ') + ')', bathymetry: 'Minnesota DNR Lake Bathymetric Contours (MN Geospatial Commons)', clarity: 'Minnesota DNR Lakes of Phosphorus Sensitivity / Watershed Health lake scores (mean Secchi depth)', baked: new Date().toISOString(),
      ...(P ? { d1: P.citations } : {}) },
    bbox, area: opt.area,
    proj: { lat0: proj.lat0, lon0: proj.lon0, mPerDegLat: proj.mPerDegLat, mPerDegLon: proj.mPerDegLon },
    grid: { width: W, height: H, cell, originX: grid.originX, originZ: grid.originZ, tile: T, halo: HALO, ntx, nty,
      far: { factor: FAR, tile: FT, halo: HALO, width: farW, height: farH, ntx: nfx, nty: nfy }, format: V4 ? 4 : 3, fields: V4 ? V4_FIELDS : undefined },
    tiles: tileMeta,
    overview: { file: 'overview.png', cellsPerPx: OV, width: ovW, height: ovH },
    heightRange: [hmin, hmax],
    lakes: lakeMeta,
    basins: basinMeta,
    portages,
    campsites,
    entryPoints,
    start: { x: r1(start.x), z: r1(start.z), lake: start.lake },
  };
  if (namesAdded) index.namesReport = namesAdded.report;
  await fsp.writeFile(path.join(opt.out, 'index.json'), JSON.stringify(index));
  // the old single-area files are superseded
  for (const f of ['world.json', 'height.bin', 'lake.bin', 'sdist.bin']) await fsp.rm(path.join(opt.out, f), { force: true });
  log(`done in ${((Date.now() - t0) / 60000).toFixed(1)} min: ${ntx * nty} tiles, ${waterways.length} waterways, ${portages.length} portages, ${campsites.length} campsites, ${entryPoints.length} entry points; start at`, start.x, start.z, 'on', basinName(start.lake));
}

main().catch((e) => { console.error(e); process.exit(1); });

// AWS Terrarium elevation tiles (USGS 3DEP / SRTM): prefetch into the cache, then sample rows of the grid.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import { CFG, log, sleep } from './config.mjs';

export function mercPixel(lat, lon, z) {
  const n = 256 * 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const s = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
  return [x, y];
}

export function tileRange(bbox, z) {
  const [x0, y0] = mercPixel(bbox.north, bbox.west, z);
  const [x1, y1] = mercPixel(bbox.south, bbox.east, z);
  return { tx0: Math.floor(x0 / 256) - 1, tx1: Math.floor(x1 / 256) + 1, ty0: Math.floor(y0 / 256) - 1, ty1: Math.floor(y1 / 256) + 1 };
}

const tilePath = (z, tx, ty) => path.join(CFG.cacheDir, `terrarium-${z}-${tx}-${ty}.png`);

async function fetchTile(z, tx, ty) {
  const p = tilePath(z, tx, ty);
  let lastErr;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const res = await fetch(CFG.tileUrl(z, tx, ty), { headers: { 'User-Agent': CFG.ua } });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = Buffer.from(await res.arrayBuffer());
      PNG.sync.read(data); // reject truncated downloads
      await fsp.writeFile(p + '.part', data);
      await fsp.rename(p + '.part', p);
      return true;
    } catch (e) {
      lastErr = e;
      await sleep(1000 * 2 ** attempt);
    }
  }
  log('elevation tile failed', z, tx, ty, String(lastErr?.message).slice(0, 80));
  return false;
}

// Download every tile covering bbox that is not cached yet.
export async function prefetchTerrarium(bbox, z = CFG.zoom, concurrency = 16) {
  await fsp.mkdir(CFG.cacheDir, { recursive: true });
  const { tx0, tx1, ty0, ty1 } = tileRange(bbox, z);
  const jobs = [];
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) if (!fs.existsSync(tilePath(z, tx, ty))) jobs.push([tx, ty]);
  const total = (tx1 - tx0 + 1) * (ty1 - ty0 + 1);
  log(`elevation: ${total} tiles at z${z}, ${jobs.length} to download`);
  let done = 0, failed = 0, next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const [tx, ty] = jobs[next++];
      if (!(await fetchTile(z, tx, ty))) failed++;
      if (++done % 200 === 0) log(`  elevation ${done}/${jobs.length}`);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  if (failed) log(`elevation: ${failed} tiles could not be downloaded (treated as sea level)`);
  return total;
}

// Terrarium encodes no-data as black (-32768 m) and the odd pixel carries garbage; either would carve a pit, so
// anything below the lowest real surface in the area is a hole, filled from its valid neighbours (growing
// inward for larger voids).
const NODATA = CFG.elevationFloor;
function fillHoles(t) {
  let holes = 0;
  for (let i = 0; i < 65536; i++) if (t[i] < NODATA) holes++;
  if (!holes) return;
  const next = new Float32Array(t);
  for (let pass = 0; pass < 64 && holes; pass++) {
    let fixed = 0;
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const i = y * 256 + x;
      if (t[i] >= NODATA) continue;
      let sum = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx > 255 || yy > 255) continue;
        const v = t[yy * 256 + xx];
        if (v >= NODATA) { sum += v; n++; }
      }
      if (n) { next[i] = sum / n; fixed++; }
    }
    t.set(next);
    holes -= fixed;
    if (!fixed) break;
  }
  if (holes) for (let i = 0; i < 65536; i++) if (t[i] < NODATA) t[i] = 0; // a wholly void tile: sea level
}

// Decoded-tile cache with LRU eviction, and a fast bilinear row sampler.
export function makeSampler(z = CFG.zoom, maxTiles = 1500) {
  const tiles = new Map();
  const missing = new Set();
  const get = (tx, ty) => {
    const key = tx * 65536 + ty;
    let t = tiles.get(key);
    if (t) { tiles.delete(key); tiles.set(key, t); return t; }
    if (missing.has(key)) return null;
    const p = tilePath(z, tx, ty);
    if (!fs.existsSync(p)) { missing.add(key); return null; }
    const png = PNG.sync.read(fs.readFileSync(p));
    t = new Float32Array(256 * 256);
    for (let i = 0; i < 65536; i++) t[i] = png.data[i * 4] * 256 + png.data[i * 4 + 1] + png.data[i * 4 + 2] / 256 - 32768;
    fillHoles(t);
    tiles.set(key, t);
    if (tiles.size > maxTiles) tiles.delete(tiles.keys().next().value);
    return t;
  };
  const n = 256 * 2 ** z;
  return {
    // out[i] = elevation at (lat, lon0 + i * dLon) for i in [0, count)
    sampleRow(lat, lon0, dLon, count, out) {
      const [px0, py] = mercPixel(lat, lon0, z);
      const dpx = (dLon / 360) * n;
      const fy = py - 0.5, iy = Math.floor(fy), ay = fy - iy;
      const ty0 = Math.floor(iy / 256), ty1 = Math.floor((iy + 1) / 256);
      const ly0 = iy - ty0 * 256, ly1 = iy + 1 - ty1 * 256;
      let curTx = NaN, a0 = null, a1 = null, b0 = null, b1 = null; // tiles (tx, ty0), (tx, ty1), (tx+1, ty0), (tx+1, ty1)
      for (let i = 0; i < count; i++) {
        const fx = px0 + i * dpx - 0.5, ix = Math.floor(fx), ax = fx - ix;
        const tx = Math.floor(ix / 256), lx = ix - tx * 256;
        if (tx !== curTx) { curTx = tx; a0 = get(tx, ty0); a1 = get(tx, ty1); b0 = get(tx + 1, ty0); b1 = get(tx + 1, ty1); }
        let h00, h10, h01, h11;
        if (lx < 255) {
          h00 = a0 ? a0[ly0 * 256 + lx] : 0; h10 = a0 ? a0[ly0 * 256 + lx + 1] : 0;
          h01 = a1 ? a1[ly1 * 256 + lx] : 0; h11 = a1 ? a1[ly1 * 256 + lx + 1] : 0;
        } else {
          h00 = a0 ? a0[ly0 * 256 + 255] : 0; h10 = b0 ? b0[ly0 * 256] : 0;
          h01 = a1 ? a1[ly1 * 256 + 255] : 0; h11 = b1 ? b1[ly1 * 256] : 0;
        }
        out[i] = (h00 * (1 - ax) + h10 * ax) * (1 - ay) + (h01 * (1 - ax) + h11 * ax) * ay;
      }
    },
  };
}

// CLI: node scripts/elevation.mjs [area]   (prefetch only)
if (process.argv[1] && process.argv[1].endsWith('elevation.mjs')) {
  const { AREAS } = await import('./config.mjs');
  const area = AREAS[process.argv[2] || 'bwca'];
  await prefetchTerrarium(area);
  log('prefetch complete');
}

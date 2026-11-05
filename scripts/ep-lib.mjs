// Entry points true to life (round 2): the node side's view of a data release, for scripts/ep-fixes.mjs (which writes
// src/ep-fixes.json) and scripts/r2-ep-check.mjs. Reads index.json and the fine tiles straight off disk (gzip, the
// planes world.js setTile reads: height, lake, shore distance, level), so no browser is needed for the geometry.
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const RODS = 5.0292; // m in a rod

export function loadData(dir = path.join(ROOT, 'public/data')) {
  const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  const g = index.grid, side = g.tile + 2 * g.halo, n = side * side, tm = g.tile * g.cell, cache = new Map();
  const tile = (tx, ty) => {
    const k = `${tx}_${ty}`;
    if (cache.has(k)) return cache.get(k);
    let t = null;
    const f = path.join(dir, 'tiles', `${k}.bin`);
    if (fs.existsSync(f)) {
      const raw = zlib.gunzipSync(fs.readFileSync(f)), buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
      t = { h: new Int16Array(buf, 0, n), lake: new Uint16Array(buf, n * 2, n), sd: new Int16Array(buf, n * 4, n), lvl: new Int16Array(buf, n * 6, n) };
    }
    cache.set(k, t);
    return t;
  };
  const cellOf = (x, z) => {
    const i = Math.floor((x - g.originX) / g.cell), j = Math.floor((z - g.originZ) / g.cell);
    if (i < 0 || j < 0 || i >= g.width || j >= g.height) return null;
    const tx = (i / g.tile) | 0, ty = (j / g.tile) | 0, t = tile(tx, ty);
    if (!t) return null;
    return { t, m: ((j % g.tile) + g.halo) * side + (i % g.tile) + g.halo };
  };
  const D = {
    index, grid: g, tm,
    lakeAt(x, z) { const c = cellOf(x, z); return c ? c.t.lake[c.m] : 0; },
    shoreAt(x, z) { const c = cellOf(x, z); return c ? c.t.sd[c.m] * 0.1 : 3000; }, // (> 0 on land, < 0 on the water)
    heightAt(x, z) { const c = cellOf(x, z); return c ? c.t.h[c.m] * 0.1 : 0; },
    inBounds(x, z, m = 0) { return x > g.originX + m && x < g.originX + g.width * g.cell - m && z > g.originZ + m && z < g.originZ + g.height * g.cell - m; },
    lakeName(id) { const l = id > 0 ? index.lakes[id - 1] : null; return l ? l.displayName || l.name || null : null; },
    basinOf(id) { const l = id > 0 ? index.lakes[id - 1] : null; return l ? l.basin : null; },
    xz(lat, lon) { const p = index.proj; return [(lon - p.lon0) * p.mPerDegLon, -(lat - p.lat0) * p.mPerDegLat]; },
    ll(x, z) { const p = index.proj; return [+(p.lat0 - z / p.mPerDegLat).toFixed(5), +(p.lon0 + x / p.mPerDegLon).toFixed(5)]; },
    // the nearest water cell's centre to (x, z) within r m (of lake id `lake` when given): { x, z, lake, d } or null
    waterNear(x, z, r = 300, lake = 0, minDepth = 0) {
      let best = null;
      for (let dz = -r; dz <= r; dz += g.cell) for (let dx = -r; dx <= r; dx += g.cell) {
        const px = Math.floor((x + dx - g.originX) / g.cell) * g.cell + g.originX + g.cell / 2, pz = Math.floor((z + dz - g.originZ) / g.cell) * g.cell + g.originZ + g.cell / 2;
        const id = D.lakeAt(px, pz); if (!id || (lake && id !== lake)) continue;
        if (D.shoreAt(px, pz) > -minDepth) continue;
        const d = Math.hypot(px - x, pz - z); if (d <= r && (!best || d < best.d)) best = { x: px, z: pz, lake: id, d };
      }
      return best;
    },
  };
  return D;
}

export const lineLen = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; };
// the point of polyline pts nearest (x, z): { i (segment start), t, x, z, d, along }
export function nearestOn(pts, x, z) {
  let best = null, acc = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9, L = Math.sqrt(L2);
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)), px = ax + dx * t, pz = az + dz * t, d = Math.hypot(px - x, pz - z);
    if (!best || d < best.d) best = { i, t, x: px, z: pz, d, along: acc + L * t };
    acc += L;
  }
  return best;
}
// pts cut at its nearest point to (x, z), the piece toward end `keep` (0: the start, 1: the end); the cut point first
export function cutAt(pts, x, z, keep = 1) {
  const n = nearestOn(pts, x, z), c = [+n.x.toFixed(1), +n.z.toFixed(1)];
  return keep === 1 ? [c, ...pts.slice(n.i + 1)] : [...pts.slice(0, n.i + 1), c].reverse();
}
export const r1 = (v) => Math.round(v * 10) / 10;

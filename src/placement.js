// Deterministic forest placement for one tile: every cell draws its own random numbers from its global cell
// coordinates, so a tile grows the same trees whichever neighbour is loaded first and the seams between
// tiles are invisible. Pure data (no three.js), so it runs in the build worker.
import { mulberry32, fbm, hash2, clamp, smoothstep } from './rng.js';

export const REGION = 640;      // metres: trees are binned into regions for LOD switching and culling
export const SPECIES = { whitePine: 0, spruce: 1, redPine: 2, birch: 3, cedar: 4, snag: 5, boulder: 6, shrub: 7 };
const SCALE = [[0.85, 1.3], [0.75, 1.2], [0.75, 1.15], [0.7, 1.15], [0.75, 1.2], [0.8, 1.2], [0.6, 1.6], [0.7, 1.5]];
const GIANT = [0.04, 0, 0, 0, 0, 0, 0, 0];

function segDist(px, pz, x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1, L2 = dx * dx + dz * dz || 1;
  const t = clamp(((px - x1) * dx + (pz - z1) * dz) / L2, 0, 1);
  return Math.hypot(px - (x1 + dx * t), pz - (z1 + dz * t));
}

export function treeDensity(sd, slope, clearing) {
  let d;
  if (sd < 2) d = 0.1; else if (sd < 10) d = 1.5; else if (sd < 40) d = 1.4; else if (sd < 250) d = 0.95; else if (sd < 700) d = 0.5; else if (sd < 1500) d = 0.32; else d = 0.16;
  d *= 1 - smoothstep(0.45, 0.8, slope) * 0.85;
  d *= 1 - clearing * 0.85;
  return d;
}

// exclusions: Float32Array of [x1, z1, x2, z2, radius] segments (portage trails, campsites) in world metres.
// Returns bins of instances (7 floats each: x, y, z relative to the tile corner, yaw, scale, tint, squash)
// and the canopy shade over the tile's local extent (used to darken the ground under thick forest).
export function placeVegetation(grid, i0, j0, n, { seed = 3, exclusions = null, originX, originZ }) {
  const side = grid.side, cell = grid.cell;
  const shadeCount = new Float32Array(side * side);
  const bins = new Map();
  // trail / campsite exclusion segments that touch this tile, bucketed per cell
  const mask = new Map();
  if (exclusions) {
    const minX = grid.cellX(i0 - 1) - cell, maxX = grid.cellX(i0 + n) + cell, minZ = grid.cellZ(j0 - 1) - cell, maxZ = grid.cellZ(j0 + n) + cell;
    for (let s = 0; s < exclusions.length; s += 5) {
      const x1 = exclusions[s], z1 = exclusions[s + 1], x2 = exclusions[s + 2], z2 = exclusions[s + 3], r = exclusions[s + 4];
      if (Math.max(x1, x2) + r < minX || Math.min(x1, x2) - r > maxX || Math.max(z1, z2) + r < minZ || Math.min(z1, z2) - r > maxZ) continue;
      const seg = [x1, z1, x2, z2, r];
      const ia = Math.max(i0 - 1, grid.cellI(Math.min(x1, x2) - r) - 1), ib = Math.min(i0 + n, grid.cellI(Math.max(x1, x2) + r) + 1);
      const ja = Math.max(j0 - 1, grid.cellJ(Math.min(z1, z2) - r) - 1), jb = Math.min(j0 + n, grid.cellJ(Math.max(z1, z2) + r) + 1);
      for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) { const k = grid.local(i, j); const a = mask.get(k); if (a) a.push(seg); else mask.set(k, [seg]); }
    }
  }
  let total = 0;
  // one cell ring beyond the tile so the canopy shade at the edge matches the neighbour's trees
  for (let j = j0 - 1; j < j0 + n + 1; j++) {
    for (let i = i0 - 1; i < i0 + n + 1; i++) {
      const k = grid.local(i, j);
      const sd = grid.sdCell(i, j);
      if (sd < -4) continue;
      const rng = mulberry32((hash2(i, j, seed) * 4294967296) >>> 0);
      const cx = grid.cellX(i), cz = grid.cellZ(j);
      const slope = grid.slopeAt(cx, cz);
      const clearing = smoothstep(0.62, 0.78, fbm(cx * 0.0035, cz * 0.0035, 3, 21));
      const segs = mask.get(k);
      // trails run through thick woods: more trees and brush right beside them
      const trailSide = segs && segs.some((g) => g[4] < 5) ? 2.6 : 1;
      const e = sd < 0 ? 0 : treeDensity(sd, slope, trailSide > 1 ? 0 : clearing) * 1.05 * trailSide;
      const trees = Math.floor(e) + (rng() < e - Math.floor(e) ? 1 : 0);
      const eShrub = sd > 0.5 && sd < 35 ? (0.75 - smoothstep(10, 35, sd) * 0.5) * (1 - clearing * 0.5) * trailSide : (sd > 0 && trailSide > 1 ? 0.5 : 0);
      const shrubs = Math.floor(eShrub) + (rng() < eShrub - Math.floor(eShrub) ? 1 : 0);
      const rockP = sd < 8 && sd > -4 ? 0.1 + smoothstep(0.3, 0.6, slope) * 0.25 : 0;
      const rocks = rng() < rockP ? 1 : 0;
      const core = i >= i0 && i < i0 + n && j >= j0 && j < j0 + n;
      const cnt = trees + shrubs + rocks;
      for (let q = 0; q < cnt; q++) {
        const isTree = q < trees, isShrub = !isTree && q < trees + shrubs, isRock = !isTree && !isShrub;
        const x = cx + (rng() - 0.5) * cell, z = cz + (rng() - 0.5) * cell;
        const s = grid.shoreAt(x, z);
        if (isRock ? s < -3 || s > 9 : s < 0.6) continue;
        if (segs && segs.some((g) => segDist(x, z, g[0], g[1], g[2], g[3]) < g[4] + (isRock ? 0.5 : isShrub ? 0.4 : 1.2))) continue;
        let sp;
        if (isRock) sp = 6;
        else if (isShrub) sp = 7;
        else {
          const h = grid.heightAt(x, z);
          const patch = fbm(x * 0.0025 + 7, z * 0.0025, 3, 33);
          const r = rng();
          // spruce-dominated boreal mix, birch in stands, cedar along the shore
          if (s < 22 && r < 0.2) sp = 4;
          else if (patch > 0.62 && r < 0.55) sp = 3;
          else if (r < 0.02) sp = 5;
          else if (h > 492 && r < 0.3) sp = 0;
          else if (r < 0.12) sp = 2; else if (r < 0.25) sp = 0; else if (r < 0.32) sp = 3; else sp = 1;
          shadeCount[k] += 1;
        }
        let scale = SCALE[sp][0] + rng() * (SCALE[sp][1] - SCALE[sp][0]);
        if (GIANT[sp] && rng() < GIANT[sp]) scale *= 1.45;
        if (isRock && s > -2 && rng() < 0.08 + smoothstep(0.25, 0.5, slope) * 0.2) scale *= 2.6; // granite outcrop blocks
        if (isTree && s > 600) scale *= 1.15;
        const yaw = rng() * Math.PI * 2, tint = 0.92 + rng() * 0.16, squash = 0.9 + rng() * 0.2;
        if (!core) continue;
        const rx = Math.floor((x - grid.originX) / REGION), rz = Math.floor((z - grid.originZ) / REGION);
        const key = (rx * 4096 + rz) * 8 + sp;
        let b = bins.get(key);
        if (!b) { b = { rx, rz, sp, items: [] }; bins.set(key, b); }
        b.items.push(x - originX, grid.heightAt(x, z) - (isRock ? 0.4 : 0.35), z - originZ, yaw, scale, tint, squash);
        total++;
      }
    }
  }
  // canopy shade for the ground: tree count per cell, softened over the neighbours
  const shade = new Float32Array(side * side);
  for (let lj = 1; lj < side - 1; lj++) for (let li = 1; li < side - 1; li++) {
    let s = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) s += shadeCount[(lj + dj) * side + li + di];
    shade[lj * side + li] = clamp(s / 7, 0, 1);
  }
  return { bins: [...bins.values()].map((b) => ({ rx: b.rx, rz: b.rz, sp: b.sp, items: new Float32Array(b.items) })), shade, total };
}

// Deterministic placement for one tile: forest, lake vegetation and the ground-cover map. Every cell draws
// its own random numbers from its global cell coordinates, so a tile grows the same things whichever
// neighbour is loaded first and the seams between tiles are invisible. Pure data (no three.js), so it
// runs in the build worker.
import { mulberry32, fbm, hash2, clamp, smoothstep } from './rng.js';
import { clearingAt, burnAt, calmAt } from './fields.js';
import { surfaceAt } from './terrain-build.js';

export const REGION = 640;      // metres: instances are binned into regions for LOD switching and culling
export const SPECIES = { whitePine: 0, spruce: 1, redPine: 2, birch: 3, cedar: 4, snag: 5, boulder: 6, shrub: 7, tallPine: 8 };
const SCALE = [[0.85, 1.3], [0.75, 1.2], [0.75, 1.15], [0.7, 1.15], [0.75, 1.2], [0.8, 1.2], [0.6, 1.8], [0.7, 1.5], [0.85, 1.25]];
const GIANT = [0.04, 0, 0, 0, 0, 0, 0, 0, 0];
export const AQUATIC = { pad: 0, reed: 1, weed: 2 };

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
// Returns the segments that touch the tile (grown by `pad` metres), bucketed per local cell index.
function tileSegments(grid, i0, j0, n, exclusions, pad = 0) {
  const mask = new Map();
  if (!exclusions) return mask;
  const cell = grid.cell;
  const minX = grid.cellX(i0 - 1) - cell, maxX = grid.cellX(i0 + n) + cell, minZ = grid.cellZ(j0 - 1) - cell, maxZ = grid.cellZ(j0 + n) + cell;
  for (let s = 0; s < exclusions.length; s += 5) {
    const x1 = exclusions[s], z1 = exclusions[s + 1], x2 = exclusions[s + 2], z2 = exclusions[s + 3], r = Math.max(exclusions[s + 4], pad);
    if (Math.max(x1, x2) + r < minX || Math.min(x1, x2) - r > maxX || Math.max(z1, z2) + r < minZ || Math.min(z1, z2) - r > maxZ) continue;
    const seg = [x1, z1, x2, z2, r, exclusions[s + 4]];
    const ia = Math.max(i0 - 1, grid.cellI(Math.min(x1, x2) - r) - 1), ib = Math.min(i0 + n, grid.cellI(Math.max(x1, x2) + r) + 1);
    const ja = Math.max(j0 - 1, grid.cellJ(Math.min(z1, z2) - r) - 1), jb = Math.min(j0 + n, grid.cellJ(Math.max(z1, z2) + r) + 1);
    for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) { const k = grid.local(i, j); const a = mask.get(k); if (a) a.push(seg); else mask.set(k, [seg]); }
  }
  return mask;
}

// Returns bins of instances (7 floats each: x, y, z relative to the tile corner, yaw, scale, tint, squash)
// and the canopy shade over the tile's local extent (used to darken the ground under thick forest).
export function placeVegetation(grid, i0, j0, n, { seed = 3, exclusions = null, originX, originZ }) {
  const side = grid.side, cell = grid.cell;
  const shadeCount = new Float32Array(side * side);
  const bins = new Map();
  const mask = tileSegments(grid, i0, j0, n, exclusions);
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
      const clearing = smoothstep(0.62, 0.78, clearingAt(cx, cz));
      const burn = burnAt(cx, cz);
      const segs = mask.get(k);
      // trails run through thick woods: more trees and brush right beside them
      const trailSide = segs && segs.some((g) => g[5] < 5) ? 2.6 : 1;
      const e = sd < 0 ? 0 : treeDensity(sd, slope, trailSide > 1 ? 0 : clearing) * 1.05 * trailSide * (1 - burn * 0.5);
      const trees = Math.floor(e) + (rng() < e - Math.floor(e) ? 1 : 0);
      const eShrub = (sd > 0.5 && sd < 35 ? (0.75 - smoothstep(10, 35, sd) * 0.5) * (1 - clearing * 0.5) * trailSide : (sd > 0 && trailSide > 1 ? 0.5 : 0)) + burn * 0.5;
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
          const patch = fbm(x * 0.0025 + 7, z * 0.0025, 3, 33);
          const ridge = fbm(x * 0.0018 + 11, z * 0.0018, 2, 57); // high ground: old pines on ridges and rocky points
          const r = rng();
          // spruce-dominated boreal mix, birch in stands, cedar along the shore; burn scars are
          // standing snags with young spruce coming up; old pines on rocky points and ridges
          if (burn > 0.5) sp = r < 0.72 ? 5 : 1;
          else if (s < 22 && r < 0.2) sp = 4;
          else if (((s < 35 && slope > 0.15) || ridge > 0.66) && r < 0.3) sp = 8;
          else if (patch > 0.62 && r < 0.55) sp = 3;
          else if (r < 0.02) sp = 5;
          else if (ridge > 0.58 && r < 0.3) sp = 0;
          else if (r < 0.12) sp = 2; else if (r < 0.25) sp = 0; else if (r < 0.32) sp = 3; else sp = 1;
          shadeCount[k] += 1;
        }
        let scale = SCALE[sp][0] + rng() * (SCALE[sp][1] - SCALE[sp][0]);
        if (GIANT[sp] && rng() < GIANT[sp]) scale *= 1.45;
        if (isTree && burn > 0.5) scale *= sp === 5 ? 1.25 : 0.45; // tall dead stems, small regrowth
        if (isRock && s > -2 && rng() < 0.08 + smoothstep(0.25, 0.5, slope) * 0.2) scale *= 2.6; // granite outcrop blocks
        if (isTree && s > 600) scale *= 1.15;
        const yaw = rng() * Math.PI * 2, tint = 0.92 + rng() * 0.16, squash = 0.9 + rng() * 0.2;
        if (!core) continue;
        // sink into the ground more on slopes so the downhill edge never hangs in the air
        const sink = (isRock ? 0.4 : isShrub ? 0.45 : 0.35) + grid.slopeAt(x, z) * (isRock ? 1.6 : isShrub ? 1.0 : 1.2) * scale;
        const rx = Math.floor((x - grid.originX) / REGION), rz = Math.floor((z - grid.originZ) / REGION);
        const key = (rx * 4096 + rz) * 16 + sp;
        let b = bins.get(key);
        if (!b) { b = { rx, rz, sp, items: [] }; bins.set(key, b); }
        b.items.push(x - originX, surfaceAt(grid, x, z) - sink, z - originZ, yaw, scale, tint, squash);
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

// Lily pads, reeds and submerged weeds in sheltered shallows. Bins of 5 floats per instance
// (x, y, z relative to the tile corner, yaw, scale), keyed by region, kind and geometry variant.
export function placeAquatic(grid, i0, j0, n, { seed = 9, originX, originZ }) {
  const cell = grid.cell;
  const bins = new Map();
  let total = 0;
  for (let j = j0; j < j0 + n; j++) {
    for (let i = i0; i < i0 + n; i++) {
      const sd = grid.sdCell(i, j);
      if (sd < -32 || sd > 2) continue;
      const cx = grid.cellX(i), cz = grid.cellZ(j);
      const calm = calmAt(cx, cz);
      if (calm < 0.42) continue;
      const rng = mulberry32((hash2(i, j, seed + 1) * 4294967296) >>> 0);
      const level = grid.levelAt(cx, cz, 3);
      const depth = level - grid.hCell(i, j);
      const rx = Math.floor((cx - grid.originX) / REGION), rz = Math.floor((cz - grid.originZ) / REGION);
      const place = (kind, expected, variants, test) => {
        const cnt = Math.floor(expected) + (rng() < expected - Math.floor(expected) ? 1 : 0);
        for (let q = 0; q < cnt; q++) {
          const x = cx + (rng() - 0.5) * cell, z = cz + (rng() - 0.5) * cell;
          const s = grid.shoreAt(x, z), d = level - grid.heightAt(x, z);
          if (!test(s, d)) continue;
          const y = kind === AQUATIC.weed ? grid.heightAt(x, z) : level + 0.07;
          const scale = kind === AQUATIC.weed ? Math.min(0.4 + d * 0.4 * rng() + 0.25, d * 0.8) : kind === AQUATIC.pad ? 0.17 + rng() * 0.2 : 0.8 + rng() * 0.5;
          const variant = kind === AQUATIC.pad && rng() < 0.12 ? 2 : Math.floor(rng() * variants);
          const key = ((rx * 4096 + rz) * 4 + kind) * 4 + variant;
          let b = bins.get(key);
          if (!b) { b = { rx, rz, kind, variant, items: [] }; bins.set(key, b); }
          b.items.push(x - originX, y, z - originZ, rng() * Math.PI * 2, scale);
          total++;
        }
      };
      if (sd < -1.0 && sd > -22 && depth < 3.0 && calm > 0.5) place(AQUATIC.pad, 24 * smoothstep(0.5, 0.66, calm), 2, (s, d) => s < -0.7 && d > 0.25 && d < 3.2);
      if (sd > -6 && sd < 1.6 && calm > 0.5) place(AQUATIC.reed, 2.6 * smoothstep(0.5, 0.68, calm), 3, (s, d) => s < 1.8 && d < 1.4);
      if (sd < -3 && sd > -30 && depth > 0.4 && depth < 3.4) place(AQUATIC.weed, 1.6, 2, (s, d) => s < -2 && d > 0.35 && d < 3.6);
    }
  }
  return { bins: [...bins.values()].map((b) => ({ rx: b.rx, rz: b.rz, kind: b.kind, variant: b.variant, items: new Float32Array(b.items) })), total };
}

// Ground cover per cell over the tile's local extent (core cells only): r = grass cover 0..255 (none in
// water, on bare rock, trails and campsites; thin under dense canopy; thick in clearings and burns),
// g = golden tint (burns and dry clearings).
export function coverField(grid, i0, j0, n, shade, exclusions) {
  const side = grid.side;
  const cover = new Uint8Array(side * side * 2);
  const bare = new Uint8Array(side * side);
  const mask = tileSegments(grid, i0, j0, n, exclusions, 3.5);
  for (const [k, segs] of mask) {
    const li = k % side, lj = (k - li) / side;
    const x = grid.cellX(grid.i0 + li), z = grid.cellZ(grid.j0 + lj);
    if (segs.some((g) => segDist(x, z, g[0], g[1], g[2], g[3]) < g[4])) bare[k] = 1;
  }
  for (let j = j0; j < j0 + n; j++) {
    for (let i = i0; i < i0 + n; i++) {
      const k = grid.local(i, j);
      const sd = grid.sdCell(i, j);
      if (sd <= 2.6 || bare[k]) continue;
      const x = grid.cellX(i), z = grid.cellZ(j);
      const slope = grid.slopeAt(x, z), burn = burnAt(x, z), clearing = clearingAt(x, z);
      // grass carpets the forest floor and the meadows; it thins under a dense canopy and on steep rock
      let c = slope > 0.55 ? 0.05 : slope > 0.38 ? 0.2 : 0.6;
      c *= 1 - (shade ? shade[k] : 0) * 0.4;
      if (clearing > 0.62) c = Math.max(c, 1.0);
      if (burn > 0.5) c = Math.max(c, 0.95);
      const gold = Math.max(burn, clearing > 0.66 ? 0.6 : 0);
      cover[k * 2] = Math.round(Math.min(1, c) * 255);
      cover[k * 2 + 1] = Math.round(Math.min(1, gold) * 255);
    }
  }
  return cover;
}

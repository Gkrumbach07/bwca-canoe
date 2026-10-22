// Deterministic placement for one tile: forest, lake vegetation and the ground-cover map. Every cell draws
// its own random numbers from its global cell coordinates, so a tile grows the same things whichever
// neighbour is loaded first and the seams between tiles are invisible. Pure data (no three.js), so it
// runs in the build worker.
//
// The composition (docs/look.md, pass 5): the forest is not an even field. A low-frequency world-space
// field makes thickets and glades; the species follow the ground (cedar and alder down to the water, birch
// in stands, pine on the ridges and the rock, spruce on the low dark ground); an understory of hazel, alder,
// saplings and ferns stands between the floor and the canopy, thickest at the edges of the woods; a few
// trees in a hundred lie fallen or stand as stumps; granite slabs break the floor where the rock field is
// strong. Every instance also falls in a variant group so a stand draws several geometries of a species.
import { mulberry32, fbm, hash2, clamp, smoothstep } from './rng.js';
import { clearingAt, burnAt, calmAt, rockAt } from './fields.js';
import { surfaceAt, groundClass, rockSlope, GROUND } from './terrain-build.js';

export const REGION = 640;      // metres: instances are binned into regions for LOD switching and culling
// The understory and the deadfall are small and many: they are binned in finer regions so they can be drawn
// only near the camera without dragging a whole 640 m region of them along.
export const SMALL_REGION = 320;
const SMALL = new Set([10, 11, 12, 13, 14, 15]);
// index order matches vegetation.js SPECIES
export const SPECIES = { whitePine: 0, spruce: 1, redPine: 2, birch: 3, cedar: 4, snag: 5, boulder: 6, shrub: 7, tallPine: 8, jackPine: 9, hazel: 10, alder: 11, sapling: 12, fern: 13, log: 14, stump: 15, outcrop: 16 };
const SCALE = [[0.85, 1.3], [0.75, 1.2], [0.75, 1.15], [0.7, 1.15], [0.75, 1.2], [0.8, 1.2], [0.4, 2.2], [0.7, 1.5], [0.85, 1.25], [0.7, 1.1],
  [0.7, 1.3], [0.75, 1.35], [0.6, 1.4], [0.6, 1.3], [0.8, 1.35], [0.75, 1.3], [2.6, 5.0]];
const GIANT = [0.04, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
// How many variant groups a region's bin of each species is split into (makeVegetationMeshes draws each
// group near the camera with its own geometry variant): three for the trees and the boulders so a stand
// shows several trees of a kind, fewer for the small stuff, whose variety is in its scale and yaw and whose
// draw calls would otherwise add up. GROUP_SHARE: the cumulative share of the instances each group takes.
export const GROUPS = [3, 3, 3, 3, 3, 3, 3, 1, 3, 3, 2, 2, 2, 1, 2, 1, 1];
const GROUP_SHARE = { 1: [1], 2: [0.6, 1], 3: [0.45, 0.8, 1] };
export const AQUATIC = { pad: 0, reed: 1, weed: 2 };
const G = Object.fromEntries(GROUND.map((k, i) => [k, i])); // ground class name -> index

// The composition fields, in world metres so they run across tile seams. thicketAt: thickets and glades
// 100–200 m across (its seed is picked so the walk inland from the Kawishiwi Lodge on Lake One, where the
// look is judged, crosses a thicket and then a glade). standAt: ~150 m stands of birch (and of aspen, which
// the birch stands in for). ridgeAt: the relief, high ground for the pines, low dark ground for the spruce.
// fernAt: drifts of ferns 20–30 m across.
const thicketAt = (x, z) => fbm(x * 0.008 + 31, z * 0.008, 3, 112);
const standAt = (x, z) => fbm(x * 0.0065 + 17, z * 0.0065, 2, 123);
const ridgeAt = (x, z) => fbm(x * 0.0018 + 11, z * 0.0018, 2, 57);
const fernAt = (x, z) => fbm(x * 0.03 + 41, z * 0.03, 2, 211);
// Where the woods open: 1 in a glade, 0 in the trees. coverField lets grass into the glades.
export const gladeAt = (x, z) => 1 - smoothstep(0.36, 0.46, thicketAt(x, z));

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

// exclusions: Float32Array of [x1, z1, x2, z2, radius] segments (portage trails, campsites, the cleared
// ground at an outfitter's) in world metres. A negative radius is a lawn: it keeps the trees off but lets
// the grass through (coverField). Returns the segments that touch the tile (grown by `pad` metres),
// bucketed per local cell index, as [x1, z1, x2, z2, |radius| or pad, |radius|, lawn].
function tileSegments(grid, i0, j0, n, exclusions, pad = 0) {
  const mask = new Map();
  if (!exclusions) return mask;
  const cell = grid.cell;
  const minX = grid.cellX(i0 - 1) - cell, maxX = grid.cellX(i0 + n) + cell, minZ = grid.cellZ(j0 - 1) - cell, maxZ = grid.cellZ(j0 + n) + cell;
  for (let s = 0; s < exclusions.length; s += 5) {
    const x1 = exclusions[s], z1 = exclusions[s + 1], x2 = exclusions[s + 2], z2 = exclusions[s + 3], r0 = Math.abs(exclusions[s + 4]), r = Math.max(r0, pad);
    if (Math.max(x1, x2) + r < minX || Math.min(x1, x2) - r > maxX || Math.max(z1, z2) + r < minZ || Math.min(z1, z2) - r > maxZ) continue;
    const seg = [x1, z1, x2, z2, r, r0, exclusions[s + 4] < 0];
    const ia = Math.max(i0 - 1, grid.cellI(Math.min(x1, x2) - r) - 1), ib = Math.min(i0 + n, grid.cellI(Math.max(x1, x2) + r) + 1);
    const ja = Math.max(j0 - 1, grid.cellJ(Math.min(z1, z2) - r) - 1), jb = Math.min(j0 + n, grid.cellJ(Math.max(z1, z2) + r) + 1);
    for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) { const k = grid.local(i, j); const a = mask.get(k); if (a) a.push(seg); else mask.set(k, [seg]); }
  }
  return mask;
}

// Which tree grows here: cumulative weights over the ten tree species (the boulder's and the shrub's slots
// stay 0) from what the cell knows. The boreal base is spruce with some pine and birch; cedar comes down to
// the water, birch fills its stands, the pines take the ridges and the rocky points, spruce the low ground,
// and a dead stem or two stands in the thickets.
const _w = new Float64Array(10);
function treeWeights(sd, slope, rock, shoreBand, stand, high, low, thick) {
  const w = _w;
  w[0] = 0.12; w[1] = 0.5; w[2] = 0.08; w[3] = 0.12; w[4] = 0.04; w[5] = 0.02; w[6] = 0; w[7] = 0; w[8] = 0.04; w[9] = 0;
  w[4] += 1.2 * shoreBand; w[1] += 0.3 * shoreBand;
  w[3] += 2.0 * stand;
  const rocky = smoothstep(0.2, 0.5, rock), point = smoothstep(0.1, 0.3, slope) * shoreBand;
  w[0] += 0.6 * high + 0.4 * rocky; w[2] += 0.5 * high; w[8] += 0.5 * high + 0.6 * point; w[9] += 0.7 * rocky;
  w[1] += 1.2 * low; w[4] += 0.2 * low;
  w[1] += 1.2 * thick; w[5] += 0.05 * thick; // the thickets are dark young spruce
  for (let i = 1; i < 10; i++) w[i] += w[i - 1];
  return w;
}
function pickTree(w, r) {
  const t = r * w[9];
  for (let i = 0; i < 10; i++) if (t < w[i]) return i;
  return 1;
}

// Returns bins of instances (7 floats each: x, y, z relative to the tile corner, yaw, scale, tint, squash),
// one per region (640 m, or 320 m for the small species) and species, the instances sorted into variant
// groups with the count in each (`groups`), and the canopy shade over the tile's local extent (used to
// darken the ground under thick forest).
export function placeVegetation(grid, i0, j0, n, { seed = 3, exclusions = null, originX, originZ }) {
  const side = grid.side, cell = grid.cell;
  const shadeCount = new Float32Array(side * side);
  const bins = new Map();
  const mask = tileSegments(grid, i0, j0, n, exclusions);
  let total = 0;
  const count = (rng, e) => Math.floor(e) + (rng() < e - Math.floor(e) ? 1 : 0);
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
      const rock = sd > 0 ? rockAt(rockSlope(grid, cx, cz), sd, cx, cz) : 0;   // bare bedrock: few stunted trees, no grass, boulders
      const bare = rock > 0.5;
      const soil = 1 - smoothstep(0.35, 0.6, rock);
      const segs = mask.get(k);
      // trails run through thick woods: more trees and brush right beside them
      const trailSide = segs && segs.some((g) => g[5] < 5) ? 2.6 : 1;
      // thickets and glades: the one field that makes the forest uneven. Not on bare rock (sparse already)
      // nor beside a trail (kept thick), and the glade's rim is where the understory gathers.
      const t = thicketAt(cx, cz);
      const glade = 1 - smoothstep(0.36, 0.46, t), thick = smoothstep(0.54, 0.66, t);
      const edge = smoothstep(0.34, 0.42, t) * (1 - smoothstep(0.46, 0.56, t));
      const clump = bare || trailSide > 1 ? 1 : (0.2 + 0.8 * smoothstep(0.38, 0.6, t) + 1.0 * thick) * 1.3;
      const e = sd < 0 ? 0 : Math.min(2.8, treeDensity(sd, slope, trailSide > 1 ? 0 : clearing) * 1.05 * trailSide * (1 - burn * 0.5) * (1 - smoothstep(0.3, 0.6, rock) * 0.88) * clump);
      const trees = count(rng, e);
      const eShrub = ((sd > 0.5 && sd < 35 ? (0.75 - smoothstep(10, 35, sd) * 0.5) * (1 - clearing * 0.5) * trailSide : (sd > 0 && trailSide > 1 ? 0.5 : 0)) + burn * 0.5) * (1 - rock * 0.8);
      const shrubs = count(rng, eShrub);
      const eRock = (sd < 8 && sd > -4 ? 0.1 + smoothstep(0.3, 0.6, slope) * 0.25 : 0) + (bare ? 0.35 + rock * 0.25 : 0) + (sd > 8 && !bare ? 0.05 + smoothstep(0.2, 0.45, slope) * 0.15 : 0);
      const rocks = count(rng, eRock);
      // the understory: hazel at the edges of the woods and in the open stands, alder down by the water
      // and on the low wet ground, young spruce coming up in the glades, the burn and the edges, ferns in
      // drifts under a moderate canopy and on the low ground; all of it sparse under a heavy canopy and
      // none of it on rock or in a meadow
      const ridge = ridgeAt(cx, cz);
      const low = 1 - smoothstep(0.42, 0.56, ridge), high = smoothstep(0.58, 0.7, ridge);
      const shoreBand = sd > 0 ? 1 - smoothstep(6, 26, sd) : 0;
      const heavy = smoothstep(1.1, 2.0, e), open = 1 - heavy, land = sd > 0.8 ? 1 : 0;
      const eHazel = land * (1.6 * edge + 0.18 * open * smoothstep(0.1, 0.4, e)) * soil * (1 - burn) * (1 - clearing * 0.7) * (sd > 3 ? trailSide : 0);
      const eAlder = land * (1.7 * (1 - smoothstep(3, 18, sd)) + 0.35 * low * open * (1 - smoothstep(0.08, 0.2, slope))) * soil * (1 - burn * 0.5) * (1 - clearing);
      const eSapling = land * (0.08 * open * smoothstep(0.1, 0.4, e) + 0.5 * edge + 0.5 * burn + 0.25 * glade * (1 - clearing)) * soil;
      const eFern = land * (1.6 * smoothstep(0.5, 0.64, fernAt(cx, cz)) * smoothstep(0.3, 0.9, e) * (1 - heavy * 0.6) + 0.35 * low * open * smoothstep(0.3, 0.9, e)) * soil * (1 - burn) * (1 - clearing);
      // deadfall: a few trees in a hundred lie on the floor or stand as stumps; granite slabs where the
      // rock field is strong but the ground not yet bare of soil
      const eLog = e * 0.035, eStump = e * 0.02;
      const eOutcrop = sd > 4 ? (0.1 * smoothstep(0.22, 0.42, rock) * (1 - smoothstep(0.5, 0.8, rock)) + 0.03 * smoothstep(0.5, 0.7, rock)) * (1 - smoothstep(0.45, 0.7, slope)) : 0;
      const core = i >= i0 && i < i0 + n && j >= j0 && j < j0 + n;
      let w = null;
      const stand = smoothstep(0.56, 0.66, standAt(cx, cz));
      // one pass over everything the cell grows: [species or -1 for a tree, count, exclusion pad]
      const plan = [[-1, trees, 1.2], [7, shrubs, 0.4], [6, rocks, 0.5], [10, count(rng, eHazel), 0.4], [11, count(rng, eAlder), 0.4], [12, count(rng, eSapling), 0.4], [13, count(rng, eFern), 0.3],
        [14, count(rng, eLog), 1.5], [15, count(rng, eStump), 0.8], [16, count(rng, eOutcrop), 2.5]];
      for (const [kind, cnt, pad] of plan) {
        for (let q = 0; q < cnt; q++) {
          const x = cx + (rng() - 0.5) * cell, z = cz + (rng() - 0.5) * cell;
          const s = grid.shoreAt(x, z);
          const isRock = kind === 6 || kind === 16;
          if (isRock ? s < -3 : s < 0.6) continue;
          if (segs && segs.some((g) => segDist(x, z, g[0], g[1], g[2], g[3]) < g[4] + pad)) continue;
          let sp = kind;
          if (kind === -1) {
            const r = rng();
            // spruce-dominated boreal mix by the ground; burn scars are standing snags with young spruce
            // coming up; jack pine in the cracks of the bare rock, a dead stem or two
            if (bare) sp = r < 0.6 ? 9 : r < 0.78 ? 5 : r < 0.9 ? 1 : 0;
            else if (burn > 0.5) sp = r < 0.72 ? 5 : 1;
            else sp = pickTree(w || (w = treeWeights(sd, slope, rock, shoreBand, stand, high, low, thick)), r);
            shadeCount[k] += 1;
          }
          const isTree = kind === -1, isShrub = kind === 7;
          let scale = SCALE[sp][0] + (isRock ? rng() ** 1.7 : rng()) * (SCALE[sp][1] - SCALE[sp][0]); // rocks: many small, a few big
          if (GIANT[sp] && rng() < GIANT[sp]) scale *= 1.45;
          if (isTree && burn > 0.5) scale *= sp === 5 ? 1.25 : 0.45; // tall dead stems, small regrowth
          if (isTree && bare && sp !== 9) scale *= 0.7;              // stunted on the rock
          if (kind === 6 && s > -2 && rng() < 0.08 + smoothstep(0.25, 0.5, slope) * 0.2) scale *= 2.6; // granite outcrop blocks
          else if (kind === 6 && bare && rng() < 0.3) scale *= 2.2 + rng() * 1.6;                      // slabs breaking the surface
          if (isTree && s > 600) scale *= 1.15;
          if (kind === 12 && burn > 0.5) scale *= 0.8;
          let yaw = rng() * Math.PI * 2;
          const tint = 0.92 + rng() * 0.16, squash = isRock || kind >= 14 ? 1 : 0.9 + rng() * 0.2;
          if (kind === 14) {
            // a fallen trunk lies along the hillside (an instance has no pitch, so across the slope it
            // rests on the ground end to end), any way at all on the flat
            const hx = grid.heightAt(x + cell, z) - grid.heightAt(x - cell, z), hz = grid.heightAt(x, z + cell) - grid.heightAt(x, z - cell);
            if (Math.hypot(hx, hz) / (2 * cell) > 0.05) yaw = Math.atan2(-hx, -hz) + (rng() - 0.5) * 0.5 + (rng() < 0.5 ? Math.PI : 0);
          }
          let group = 0;
          if (GROUPS[sp] > 1) { const r = rng(), share = GROUP_SHARE[GROUPS[sp]]; while (r >= share[group]) group++; }
          if (kind === 14 && segs) {
            // a log is 7 m long: keep both ends off the trails and campsites too
            const ux = Math.cos(yaw) * 3.6 * scale, uz = -Math.sin(yaw) * 3.6 * scale;
            if (segs.some((g) => segDist(x + ux, z + uz, g[0], g[1], g[2], g[3]) < g[4] + 0.6 || segDist(x - ux, z - uz, g[0], g[1], g[2], g[3]) < g[4] + 0.6)) continue;
          }
          if (!core) continue;
          const slopeHere = grid.slopeAt(x, z);
          // sink into the ground more on slopes so the downhill edge never hangs in the air; a boulder is
          // only as tall as its scale, so its sink is capped or steep slopes would swallow it whole
          let sink;
          if (kind === 6) sink = scale * Math.min(0.5, 0.15 + slopeHere * 0.7);
          else if (kind === 16) sink = scale * (0.05 + Math.min(0.35, slopeHere * 0.45));
          else if (kind === 14) sink = 0.02 * scale + slopeHere * 0.25 * scale;
          else if (kind === 15) sink = 0.35 + slopeHere * 0.8 * scale;
          else if (kind >= 10) sink = 0.05 + slopeHere * 1.0 * scale;
          else sink = (isShrub ? 0.45 : 0.35) + slopeHere * (isShrub ? 1.0 : 1.2) * scale;
          const size = SMALL.has(sp) ? SMALL_REGION : REGION;
          const rx = Math.floor((x - grid.originX) / size), rz = Math.floor((z - grid.originZ) / size);
          const key = (rx * 4096 + rz) * 32 + sp;
          let b = bins.get(key);
          if (!b) { b = { rx, rz, sp, size, parts: Array.from({ length: GROUPS[sp] }, () => []) }; bins.set(key, b); }
          b.parts[group].push(x - originX, surfaceAt(grid, x, z) - sink, z - originZ, yaw, scale, tint, squash);
          total++;
        }
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
  // each bin's instances sorted by variant group, with the count in each group
  const out = [];
  for (const b of bins.values()) {
    const items = new Float32Array(b.parts.reduce((n, a) => n + a.length, 0));
    let o = 0;
    for (const a of b.parts) { items.set(a, o); o += a.length; }
    out.push({ rx: b.rx, rz: b.rz, sp: b.sp, size: b.size, groups: b.parts.map((a) => a.length / 7), items });
  }
  return { bins: out, shade, total };
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

// Ground cover per cell over the tile's local extent (core cells only), four bytes per cell: grass cover
// 0..255 by ground class (none in water, on bare rock, trails and campsites; a sparse fifth under the forest
// and thinner still under a thick canopy, more in the glades; full on the meadows and the lawns; most of a
// burn; a fringe up from the shore whatever stands behind it), golden tint (burns and dry clearings), the
// ground class the grass takes its colour from, 0.
export function coverField(grid, i0, j0, n, shade, exclusions) {
  const side = grid.side;
  const cover = new Uint8Array(side * side * 4);
  const bare = new Uint8Array(side * side), lawn = new Uint8Array(side * side);
  const mask = tileSegments(grid, i0, j0, n, exclusions, 3.5);
  for (const [k, segs] of mask) {
    const li = k % side, lj = (k - li) / side;
    const x = grid.cellX(grid.i0 + li), z = grid.cellZ(grid.j0 + lj);
    for (const g of segs) {
      if (segDist(x, z, g[0], g[1], g[2], g[3]) >= g[4]) continue;
      if (g[6]) lawn[k] = 1; else bare[k] = 1;
    }
  }
  for (let j = j0; j < j0 + n; j++) {
    for (let i = i0; i < i0 + n; i++) {
      const k = grid.local(i, j);
      const sd = grid.sdCell(i, j);
      const x = grid.cellX(i), z = grid.cellZ(j);
      const canopy = shade ? shade[k] : 0;
      const cls = groundClass(grid, x, z, canopy);
      cover[k * 4 + 2] = cls;
      if (sd <= 2.6 || bare[k]) continue;
      const burn = burnAt(x, z), clearing = clearingAt(x, z);
      // the forest floor is duff, not lawn: a few tufts, fewer under a thick canopy, more where the woods
      // open into a glade; the meadows are grass, the burns mostly, and a band of grass and sedge runs up
      // from the water; bare rock grows nothing; the cleared ground at an outfitter's is kept as a lawn
      const rock = rockAt(rockSlope(grid, x, z), sd, x, z);
      const soil = 1 - smoothstep(0.4, 0.6, rock);
      let c = 0;
      if (cls === G.meadow) c = 1;
      else if (cls === G.burn) c = 0.6;
      else if (cls === G.forest || cls === G.forestLight || cls === G.forestDark) c = 0.12 * (1 - 0.6 * canopy) + 0.45 * gladeAt(x, z) * (1 - canopy);
      c = Math.max(c, 0.7 * (1 - smoothstep(9, 14, sd)));
      if (lawn[k] && cls !== G.burn) c = Math.max(c, 0.8);
      c *= soil;
      const gold = Math.max(burn, clearing > 0.66 ? 0.6 : 0);
      cover[k * 4] = Math.round(Math.min(1, c) * 255);
      cover[k * 4 + 1] = Math.round(Math.min(1, gold) * 255);
    }
  }
  return cover;
}

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
//
// The rocks (pass 3) follow Campo Santo's shape sheet and come in groups (rockFeatures below): slanted rocks
// one to six to a group, one or two big and the rest small, all at the group's one tilt; layered flats lying
// along the slope; lone erratics in the woods; small rocks and pebbles at the feet of the big ones. A rock
// instance carries its tilt and its height, so the worker turns it into the instance matrix (tile-worker.js),
// and every rock is seated on the terrain mesh itself so its whole foot is in the ground (seatRock).
import { mulberry32, fbm, hash2, clamp, smoothstep } from './rng.js';
import { clearingAt, burnAt, calmAt, rockAt } from './fields.js';
import { surfaceAt, meshHeightAt, groundClass, rockSlope, GROUND } from './terrain-build.js';

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
// Floats per instance: x, y, z (relative to the tile corner), yaw, scale, tint, squash; the rocks add the
// azimuth and the angle of their tilt and a height factor (the instance matrix is T * Ry(azimuth) * Rz(tilt)
// * Ry(yaw) * S, S = scale * (squash, tall, 2 - squash)).
export const STRIDE = 7, ROCK_STRIDE = 10;
const ROCKS = new Set([6, 16]);
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

// The rocks used to be drawn from the cell's own stream here, between the shrubs and the understory. They
// come from a stream of their own now (rockFeatures); this takes the draws they took, so the understory, the
// deadfall and the outcrops still grow exactly where they did.
function skipRockDraws(rng, grid, cnt, cx, cz, cell, segs, slope, bare) {
  for (let q = 0; q < cnt; q++) {
    const x = cx + (rng() - 0.5) * cell, z = cz + (rng() - 0.5) * cell, s = grid.shoreAt(x, z);
    if (s < -3 || (segs && segs.some((g) => segDist(x, z, g[0], g[1], g[2], g[3]) < g[4] + 0.5))) continue;
    rng(); // the scale
    if (!(s > -2 && rng() < 0.08 + smoothstep(0.25, 0.5, slope) * 0.2) && bare && rng() < 0.3) rng();
    rng(); rng(); rng(); // the yaw, the tint, the variant group
  }
}

// The lie of the ground at a point, for a rock that rests along it: the azimuth that turns a rock's +x up the
// slope (the instance's Ry(azimuth) takes +x to (cos, 0, -sin)) and the slope's angle, over a few metres of
// the shaped surface.
export function bedding(grid, x, z, e = 2.5) {
  const gx = (surfaceAt(grid, x + e, z) - surfaceAt(grid, x - e, z)) / (2 * e), gz = (surfaceAt(grid, x, z + e) - surfaceAt(grid, x, z - e)) / (2 * e);
  return { az: Math.atan2(-gz, gx), angle: Math.atan(Math.hypot(gx, gz)) };
}

// The rock families, in vegetation.js's ROCK_KINDS order (the family of a boulder variant is its index mod 3).
export const ROCK_KIND = { slab: 0, block: 1, boulder: 2 };
// Which variant group of a boulder bin draws a family. vegetation.js gives a bin's three groups the variants
// base, base + 1 and base + 2 of its nine (variantsFor; base hashed from the region), so group g draws the
// family (base + g) mod 3, and a rock goes into the group that draws its own. Keep in step with variantsFor.
function rockGroup(rx, rz, kind) {
  const base = Math.floor(hash2(rx * 7919 + rz, SPECIES.boulder, 9) * 9);
  return (kind - (base % 3) + 3) % 3;
}

// Where each family's base lies in its own frame, at unit scale: the plane y = 0, inside these outlines (rocks.js
// FOOT builds every rock within them), and how tall the family stands. The outcrops (vegetation.js composes
// them of slabs and shards about two units across) as a circle.
const ring = (fx, n) => Array.from({ length: n }, (_, i) => fx((i / n) * Math.PI * 2));
const ellipse = (X, Z, n) => ring((a) => [Math.cos(a) * X, Math.sin(a) * Z], n);
const box = (x0, x1, Z, n) => ring((a) => { const c = Math.cos(a), s = Math.sin(a), k = Math.min((c > 0 ? x1 : -x0) / Math.max(1e-6, Math.abs(c)), Z / Math.max(1e-6, Math.abs(s))); return [c * k, s * k]; }, n);
export const ROCK_FOOT = [
  { pts: ellipse(1.18, 0.98, 14), h: 0.7 },        // slab: the layered flats
  { pts: box(-1.6, 1.05, 0.85, 14), h: 0.75 },      // block: the slanted shard
  { pts: ellipse(1.0, 0.92, 14), h: 0.9 },          // boulder: the erratic
];
export const OUTCROP_FOOT = { pts: ellipse(1.5, 1.5, 16), h: 0.6 };
// Seat a rock on the ground: the y of its origin that puts every point of its base (foot.pts, turned, tilted and
// scaled as the worker's instance matrix does it) under `ground` (x, z) -> height, by a fraction of the rock's
// height besides: deeper for the small ones (a pebble that sat on the ground would look dropped there) and on a
// slope. On a slope the low side of the foot decides, so the rock is buried on the high side and meets the
// ground on the low one; a slanted rock is tilted, so its raised head decides and its tail goes deep.
export function seatRock(ground, foot, x, z, scale, squash, tall, yaw, az, tilt, slope = 0) {
  const sx = scale * squash, sz = scale * (2 - squash), cy = Math.cos(yaw), sy = Math.sin(yaw);
  const ca = Math.cos(az), sa = Math.sin(az), ct = Math.cos(tilt), st = Math.sin(tilt);
  let y = ground(x, z);
  for (const [px, pz] of foot.pts) {
    const lx = px * sx, lz = pz * sz;
    const ux = lx * cy + lz * sy, uz = -lx * sy + lz * cy;   // Ry(yaw)
    const vx = ux * ct, vy = ux * st;                        // Rz(tilt) of a point on the base (y = 0)
    const wx = vx * ca + uz * sa, wz = -vx * sa + uz * ca;   // Ry(azimuth)
    y = Math.min(y, ground(x + wx, z + wz) - vy);
  }
  const h = foot.h * scale * tall;
  return y - h * (0.04 + 0.1 * (1 - smoothstep(0.25, 1.2, scale)) + Math.min(0.1, slope * 0.25)) - 0.02;
}

// The rock features a cell grows (docs/look.md, pass 3, Campo Santo's shape sheet), from the rock stream rr:
//   slanted   shards side by side along the strike, every one at the group's tilt and azimuth (each group
//             draws its own: no two groups lean alike): now and then a single big shard or a pair, mostly
//             three to six, one or two of them dominant and the rest well smaller, small shards at their feet
//   flats     one to three stacks of layered flats lying along the slope (their bedding), one big and the rest
//             smaller, on the gentle rock and the shores
//   erratic   one big rounded boulder: the lone glacial erratics of the woods, boulders on the shores
// and pebbles gathered round the feet of all of them. Bare rock grows them densest, then the shores, then the
// woods (mostly erratics there). Where a feature stands and what it is come from rr (so the features stay where
// pass 3 put them); what it is made of from a stream of its own. canopy: how closed the woods are overhead
// (0..1). put(kind, x, z, scale, yaw, az, tilt, tint, squash, tall) places one rock (seated on the ground).
function rockFeatures(grid, rr, { cx, cz, cell, sd, slope, rock, bare, canopy }, blocked, put) {
  const shore = sd > -3 && sd < 10;
  let e = 0;
  if (shore) e += 0.06 + 0.12 * smoothstep(0.12, 0.45, slope) + 0.14 * rock;
  if (bare) e += 0.2 + 0.16 * rock;
  else if (sd >= 10) e += 0.012 + 0.03 * smoothstep(0.2, 0.45, slope) + 0.03 * smoothstep(0.25, 0.5, rock);
  const n = Math.floor(e) + (rr() < e - Math.floor(e) ? 1 : 0);
  const K = ROCK_KIND;
  for (let f = 0; f < n; f++) {
    const fx = cx + (rr() - 0.5) * cell, fz = cz + (rr() - 0.5) * cell;
    if (grid.shoreAt(fx, fz) < -2.5 || blocked(fx, fz, 2.5)) continue;
    const r = rr(), gentle = slope < 0.18;
    let type;
    if (bare) type = gentle ? (r < 0.5 ? 'flats' : r < 0.8 ? 'slanted' : 'erratic') : (r < 0.6 ? 'slanted' : r < 0.85 ? 'flats' : 'erratic');
    else if (shore) type = gentle ? (r < 0.4 ? 'flats' : r < 0.75 ? 'erratic' : 'slanted') : (r < 0.5 ? 'slanted' : r < 0.75 ? 'flats' : 'erratic');
    else type = r < 0.8 ? 'erratic' : slope > 0.15 ? 'slanted' : 'flats';
    const fr = mulberry32((rr() * 4294967296) >>> 0);
    // under a canopy a rock goes darker, as the ground does there (terrain.js darkens the floor by the shade)
    const tint = () => (0.9 + fr() * 0.16) * (1 - 0.32 * canopy);
    const feet = []; // the big pieces [x, z, scale], for the pebbles
    let pebbles = 0, pAz = -1, pTilt = 0;
    if (type === 'slanted') {
      // the group's one tilt; the strike runs along local z, square to the dip
      const az = fr() * Math.PI * 2, tilt = 0.31 + fr() * 0.35;
      const dx = Math.cos(az), dz = -Math.sin(az), kx = Math.sin(az), kz = Math.cos(az);
      // the bare rock keeps its groups full; the single shards and the pairs are mostly on the shores and in the woods
      const q = fr(), one = bare ? 0.07 : 0.16, two = bare ? 0.17 : 0.36, cnt = q < one ? 1 : q < two ? 2 : 3 + Math.floor(fr() * 4);
      // (a shard shows only what stands above the ground, its whole foot being in it: they are big)
      const lead = (bare ? 1.9 + fr() * 2.4 : shore ? 1.7 + fr() * 2.1 : 1.3 + fr() * 1.2) * (cnt === 1 ? 1.2 + fr() * 0.3 : 1);
      const second = fr() < 0.45;
      let left = lead * 0.55, right = lead * 0.55;
      for (let k = 0; k < cnt; k++) {
        // one dominant, now and then a second near its size, the rest well smaller
        const s = k === 0 ? lead : k === 1 && second ? lead * (0.62 + fr() * 0.28) : lead * (0.28 + fr() ** 1.3 * 0.4);
        let o = 0;
        if (k > 0) {
          const gap = s * (0.05 + fr() * 0.4);
          if (fr() < 0.5) { o = -(left + gap + s * 0.55); left = -o + s * 0.55; } else { o = right + gap + s * 0.55; right = o + s * 0.55; }
        }
        // the small ones stand a little down the dip from the big ones, at their feet
        const along = k === 0 ? 0 : (fr() - (s < lead * 0.5 ? 0.75 : 0.6)) * 0.9 * lead;
        const x = fx + kx * o + dx * along, z = fz + kz * o + dz * along;
        const tall = k === 0 ? 0.95 + fr() * 0.3 : 0.8 + fr() * 0.35;
        if (put(K.block, x, z, s, (fr() - 0.5) * 0.5, az, tilt, tint(), 0.82 + fr() * 0.36, tall)) feet.push([x, z, s]);
      }
      pebbles = 3 + Math.floor(fr() * 5); pAz = az; pTilt = tilt;
    } else if (type === 'flats') {
      const bed = bedding(grid, fx, fz), flat = bed.angle < 0.04;
      const az = flat ? fr() * Math.PI * 2 : bed.az, tilt = Math.min(0.42, bed.angle * (0.75 + fr() * 0.2)) + fr() * 0.05;
      const stacks = 1 + (fr() < 0.55 ? 1 : 0) + (fr() < 0.25 ? 1 : 0), main = (bare || shore ? 1.5 + fr() * 2.1 : 1.0 + fr() * 1.4) * (fr() < 0.12 ? 1.5 : 1);
      for (let k = 0; k < stacks; k++) {
        const s = k === 0 ? main : main * (0.35 + fr() * 0.35), a = fr() * Math.PI * 2, d = k === 0 ? 0 : (main + s) * (0.8 + fr() * 0.3);
        const x = fx + Math.cos(a) * d, z = fz + Math.sin(a) * d;
        if (put(K.slab, x, z, s, fr() * Math.PI * 2, az, tilt, tint(), 0.85 + fr() * 0.3, 0.8 + fr() * 0.35)) feet.push([x, z, s]);
      }
      pebbles = 2 + Math.floor(fr() * 4);
    } else {
      const s = (bare || shore ? 1.45 + fr() * 1.9 : 1.55 + fr() * 1.8) * (fr() < (bare || shore ? 0.15 : 0.08) ? 1.6 : 1);
      if (put(K.boulder, fx, fz, s, fr() * Math.PI * 2, fr() * Math.PI * 2, fr() * 0.14, tint(), 0.92 + fr() * 0.16, 0.82 + fr() * 0.22)) feet.push([fx, fz, s]);
      pebbles = 2 + Math.floor(fr() * 5);
    }
    // small rocks and pebbles gathered round the feet of the big ones, a few to a spot; in a slanted group they
    // take its tilt
    for (let p = 0; p < pebbles && feet.length;) {
      const [bx, bz, bs] = feet[Math.floor(fr() * feet.length)], a0 = fr() * Math.PI * 2, d0 = bs * (0.65 + fr() * 0.6);
      for (let c = 1 + Math.floor(fr() * 3); c > 0 && p < pebbles; c--, p++) {
        const a = a0 + (fr() - 0.5) * 0.7, d = d0 + (fr() - 0.3) * 0.5;
        const s = fr() < 0.15 ? 0.6 + fr() * 0.3 : 0.16 + fr() ** 1.5 * 0.4;
        const slab = pAz < 0 && fr() < 0.2;
        put(slab ? K.slab : K.block, bx + Math.cos(a) * d, bz + Math.sin(a) * d, s, fr() * Math.PI * 2, pAz < 0 ? fr() * Math.PI * 2 : pAz, pAz < 0 ? fr() * 0.35 : pTilt, tint(), 0.8 + fr() * 0.4, 0.7 + fr() * 0.5);
      }
    }
  }
}

// Returns bins of instances (`stride` floats each, see STRIDE), one per region (640 m, or 320 m for the small
// species) and species, the instances sorted into variant groups with the count in each (`groups`), and the
// canopy shade over the tile's local extent (used to darken the ground under thick forest).
export function placeVegetation(grid, i0, j0, n, { seed = 3, exclusions = null, originX, originZ }) {
  const side = grid.side, cell = grid.cell;
  const shadeCount = new Float32Array(side * side);
  const bins = new Map();
  const mask = tileSegments(grid, i0, j0, n, exclusions);
  let total = 0;
  const count = (rng, e) => Math.floor(e) + (rng() < e - Math.floor(e) ? 1 : 0);
  // one instance into its (region, species) bin and variant group; a rock carries the azimuth and the angle
  // of its tilt. For the boulder species `group` is the rock's family (ROCK_KIND), put in the group drawing it.
  const emit = (sp, group, x, y, z, yaw, scale, tint, squash, az = 0, tilt = 0, tall = 1) => {
    const size = SMALL.has(sp) ? SMALL_REGION : REGION;
    const rx = Math.floor((x - grid.originX) / size), rz = Math.floor((z - grid.originZ) / size);
    const key = (rx * 4096 + rz) * 32 + sp;
    let b = bins.get(key);
    if (!b) { b = { rx, rz, sp, size, parts: Array.from({ length: GROUPS[sp] }, () => []) }; bins.set(key, b); }
    const part = b.parts[sp === SPECIES.boulder ? rockGroup(rx, rz, group) : group];
    part.push(x - originX, y, z - originZ, yaw, scale, tint, squash);
    if (ROCKS.has(sp)) part.push(az, tilt, tall);
    total++;
  };
  // inside a trail's, a campsite's or an outfitter's clearing (grown by pad metres)?
  const blocked = (x, z, pad) => {
    const segs = mask.get(grid.local(grid.cellI(x), grid.cellJ(z)));
    return !!segs && segs.some((g) => segDist(x, z, g[0], g[1], g[2], g[3]) < g[4] + pad);
  };
  // the terrain mesh's own height, for seating the rocks (the vertices cached: the rocks come in groups)
  const meshCache = new Map(), ground = (x, z) => meshHeightAt(grid, x, z, meshCache);
  // a rock of a family (ROCK_KIND) for rockFeatures: kept out of deep water and the clearings, seated on the mesh
  const emitRock = (kind, x, z, scale, yaw, az, tilt, tint, squash = 1, tall = 1) => {
    if (grid.shoreAt(x, z) < -4 || blocked(x, z, 0.3 + scale * 0.8)) return false;
    const y = seatRock(ground, ROCK_FOOT[kind], x, z, scale, squash, tall, yaw, az, tilt, grid.slopeAt(x, z));
    emit(SPECIES.boulder, kind, x, y, z, yaw, scale, tint, squash, az, tilt, tall);
    return true;
  };
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
        if (kind === 6) { skipRockDraws(rng, grid, cnt, cx, cz, cell, segs, slope, bare); continue; }
        for (let q = 0; q < cnt; q++) {
          const x = cx + (rng() - 0.5) * cell, z = cz + (rng() - 0.5) * cell;
          const s = grid.shoreAt(x, z);
          const isRock = kind === 16;
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
          // sink into the ground more on slopes so the downhill edge never hangs in the air (the rocks are
          // seated on the mesh, in rockFeatures and below for an outcrop, which also lies along the slope)
          let sink = 0;
          if (kind === 14) sink = 0.02 * scale + slopeHere * 0.25 * scale;
          else if (kind === 15) sink = 0.35 + slopeHere * 0.8 * scale;
          else if (kind >= 10 && kind !== 16) sink = 0.05 + slopeHere * 1.0 * scale;
          else if (kind < 10) sink = (isShrub ? 0.45 : 0.35) + slopeHere * (isShrub ? 1.0 : 1.2) * scale;
          // an outcrop lies along the slope like the bedrock it breaks out of, darker under a canopy
          const outcrop = kind === 16, bed = outcrop ? bedding(grid, x, z) : null;
          const y = outcrop ? seatRock(ground, OUTCROP_FOOT, x, z, scale, 1, 1, yaw, bed.az, bed.angle * 0.85, slopeHere) : surfaceAt(grid, x, z) - sink;
          emit(sp, group, x, y, z, yaw, scale, outcrop ? tint * (1 - 0.32 * smoothstep(0.5, 2.0, e)) : tint, squash, outcrop ? bed.az : 0, outcrop ? bed.angle * 0.85 : 0);
        }
      }
      if (core) rockFeatures(grid, mulberry32((hash2(i, j, seed + 101) * 4294967296) >>> 0), { cx, cz, cell, sd, slope, rock, bare, canopy: smoothstep(0.5, 2.0, e) }, blocked, emitRock);
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
    const stride = ROCKS.has(b.sp) ? ROCK_STRIDE : STRIDE;
    // vegetation.js draws a bin with a single non-empty group as if it were group 0: a rock bin holding only
    // one family that is not group 0's gets a zero-sized rock in group 0, so its family is drawn
    const filled = b.parts.filter((a) => a.length);
    if (b.sp === SPECIES.boulder && filled.length === 1 && !b.parts[0].length) b.parts[0].push(...filled[0].slice(0, 4), 0, 1, 1, 0, 0, 1);
    const items = new Float32Array(b.parts.reduce((n, a) => n + a.length, 0));
    let o = 0;
    for (const a of b.parts) { items.set(a, o); o += a.length; }
    out.push({ rx: b.rx, rz: b.rz, sp: b.sp, size: b.size, stride, groups: b.parts.map((a) => a.length / stride), items });
  }
  return { bins: out, shade, total };
}

// Lily pads, reeds and submerged weeds in sheltered shallows. Bins of 5 floats per instance
// (x, y, z relative to the tile corner, yaw, scale), keyed by region, kind and geometry variant.
export function placeAquatic(grid, i0, j0, n, { seed = 9, originX, originZ }) {
  // The lake plants follow the water they need (docs/look.md, the lake pass): rafts of lily pads in sheltered
  // shallow water, reeds, rushes and cattails along soft shores, wild rice in beds in the shallow bays, pondweed on
  // the bed; none on a rocky exposed shore. Kind 3 is the wild rice (aquatic.js), beside placement's AQUATIC kinds.
  const cell = grid.cell, RICE = 3;
  const bins = new Map();
  let total = 0;
  // how sheltered a spot is: of eight rays 48 m out over the water (sphere-traced on the shore distance, inside the
  // tile's halo so a neighbour places the same), the share that reach land
  const shelterAt = (x, z) => {
    let hits = 0;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.2, dx = Math.cos(a), dz = Math.sin(a);
      for (let t = 0; t < 48;) { const s = grid.shoreAt(x + dx * t, z + dz * t); if (s >= 0) { hits++; break; } t += Math.max(-s * 0.9, 5); }
    }
    return hits / 8;
  };
  for (let j = j0; j < j0 + n; j++) {
    for (let i = i0; i < i0 + n; i++) {
      const sd = grid.sdCell(i, j);
      if (sd < -32 || sd > 2) continue;
      const cx = grid.cellX(i), cz = grid.cellZ(j);
      const level = grid.levelAt(cx, cz, 3);
      const depth = level - grid.hCell(i, j);
      // the shore this water faces: bare rock (exposed, steep, nothing roots) or soft ground
      let soft = 1;
      if (sd > -24) {
        const dd = grid.deeperDir(cx, cz), back = Math.max(0, -sd) + 4, lx = cx - dd.x * back, lz = cz - dd.z * back;
        soft = 1 - smoothstep(0.35, 0.6, rockAt(rockSlope(grid, lx, lz), grid.shoreAt(lx, lz), lx, lz));
      }
      if (soft < 0.05 && sd > -24) continue;
      // sheltered: a cove round it, or the calm field's quiet water that the shape test misses
      const calm = calmAt(cx, cz), shelter = shelterAt(cx, cz);
      const shelt = clamp(smoothstep(0.15, 0.6, shelter) * 0.75 + smoothstep(0.45, 0.66, calm) * 0.5, 0, 1);
      const rng = mulberry32((hash2(i, j, seed + 1) * 4294967296) >>> 0);
      const rx = Math.floor((cx - grid.originX) / REGION), rz = Math.floor((cz - grid.originZ) / REGION);
      const place = (kind, expected, pick, test, lift, scaleOf) => {
        const cnt = Math.floor(expected) + (rng() < expected - Math.floor(expected) ? 1 : 0);
        for (let q = 0; q < cnt; q++) {
          const x = cx + (rng() - 0.5) * cell, z = cz + (rng() - 0.5) * cell;
          const s = grid.shoreAt(x, z), d = level - grid.heightAt(x, z);
          if (!test(s, d)) continue;
          const y = kind === AQUATIC.weed ? grid.heightAt(x, z) : level + lift;
          const variant = pick(d), key = ((rx * 4096 + rz) * 4 + kind) * 4 + variant;
          let b = bins.get(key);
          if (!b) { b = { rx, rz, kind, variant, items: [] }; bins.set(key, b); }
          b.items.push(x - originX, y, z - originZ, rng() * Math.PI * 2, scaleOf(d));
          total++;
        }
      };
      // beds of wild rice: 50-100 m fields in the sheltered shallows
      const bed = smoothstep(0.45, 0.58, fbm(cx * 0.012 + 7, cz * 0.012, 2, 113)) * smoothstep(0.3, 0.7, shelt) * soft;
      if (bed > 0.01 && sd < -2.5 && depth > 0.25 && depth < 1.6)
        place(RICE, 4.2 * bed, () => (rng() < 0.5 ? 0 : 1), (s, d) => s < -2 && d > 0.25 && d < 1.6, 0.07, () => 0.85 + rng() * 0.35);
      // rafts of lily pads: loose, gathered into patches 20-40 m across, thinner inside a rice bed
      const raft = smoothstep(0.36, 0.56, fbm(cx * 0.03 + 3, cz * 0.03, 2, 77)) * smoothstep(0.2, 0.6, shelt) * soft * (1 - 0.7 * bed);
      if (raft > 0.01 && sd < -1 && sd > -26 && depth > 0.3 && depth < 2.8)
        place(AQUATIC.pad, 4.5 * raft, () => { const r = rng(); return r < 0.13 ? 2 : r < 0.21 ? 3 : r < 0.6 ? 0 : 1; }, (s, d) => s < -0.8 && d > 0.3 && d < 2.8, 0.035, () => 0.8 + rng() * 0.45);
      // reeds along soft shores, in stands: cattails in the marshy shallows of a cove, bulrush out to a metre, reed
      // and sedge at the edge
      const stand = smoothstep(0.38, 0.56, fbm(cx * 0.05 + 11, cz * 0.05, 2, 91)) * smoothstep(0.1, 0.45, shelt) * soft;
      if (stand > 0.01 && sd > -8 && sd < 1.2)
        place(AQUATIC.reed, 4.5 * stand, (d) => (d > 0.6 ? 0 : d < 0.35 && shelt > 0.55 ? 2 : rng() < 0.6 ? 1 : 0), (s, d) => s < 1.0 && d > -0.05 && d < 1.2, 0.07, () => 0.8 + rng() * 0.45);
      // pondweed on the bed, more where it is sheltered
      if (sd < -3 && sd > -30 && depth > 0.4 && depth < 3.4)
        place(AQUATIC.weed, 1.2 * (0.4 + 0.6 * shelt), () => Math.floor(rng() * 2), (s, d) => s < -2 && d > 0.35 && d < 3.6, 0, (d) => Math.min(0.4 + d * 0.4 * rng() + 0.25, d * 0.8));
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

// Deterministic placement for one tile: forest, lake vegetation and the ground-cover map. Every cell draws
// its own random numbers from its global cell coordinates, so a tile grows the same things whichever
// neighbour is loaded first and the seams between tiles are invisible. Pure data (no three.js), so it
// runs in the build worker.
//
// The composition (docs/look.md, pass 5): the forest is not an even field. A low-frequency world-space
// field makes thickets and glades; an understory of hazel, alder, saplings and ferns stands between the floor
// and the canopy, thickest at the edges of the woods; a few trees in a hundred lie fallen or stand as stumps;
// granite slabs break the floor where the bedrock comes through. Every instance also falls in a variant group
// so a stand draws several geometries of a species.
//
// Habitat (the bluff pass): each tree species grows where it grows in the Boundary Waters, read from the tile's
// site (site.js): jack pine on thin dry rock, ridges and burns; red pine on dry ridges and sandy benches; white
// pine on ridges and the old shores, the tallest standing over the canopy; black spruce and tamarack in the wet
// lowlands and at the bog edges; cedar along the shores, in wet ground and at a cliff's wet foot; balsam fir and
// white spruce in the moist mixed forest and on the north faces; paper birch and aspen on the slopes, at the
// scree's edge and after a burn. The understory follows the same moisture. The forest climbs slopes to the
// cliff bands, thinning as they steepen.
//
// The rocks (pass 3) follow Campo Santo's shape sheet and come in groups (rockFeatures below): slanted rocks
// one to six to a group, one or two big and the rest small, all at the group's one tilt; layered flats lying
// along the slope; lone erratics in the woods; small rocks and pebbles at the feet of the big ones. A rock
// instance carries its tilt and its height, so the worker turns it into the instance matrix (tile-worker.js),
// and every rock is seated on the terrain mesh itself so its whole foot is in the ground (seatRock). They keep
// to the shores, the gentle outcrops and the woods; steep faces carry none (they read as confetti there).
//
// The cliffs (cliffFeatures): along a cliff band, jointed rock modules (cliffs.js) stood at the foot of the
// drawn step, a little proud of it, as tall as the step; small trees on their ledge and a ragged line of pines
// and spruce along their top; scree at their foot, a few big blocks against the wall and many small ones
// thinning out away from it.
import { mulberry32, fbm, hash2, clamp, smoothstep } from './rng.js';
import { clearingAt, burnAt, calmAt, rockAt } from './fields.js';
import { surfaceAt, meshHeightAt, groundClass, rockSlope, GROUND, CELL_SPLAT, bedPre } from './terrain-build.js';
import { CLIFF, CLIFF_MODULE } from './site.js';

export const REGION = 640;      // metres: instances are binned into regions for LOD switching and culling
// The understory, the deadfall and the scree are small and many: they are binned in finer regions so they can
// be drawn only near the camera without dragging a whole 640 m region of them along.
export const SMALL_REGION = 320;
const SMALL = new Set([10, 11, 12, 13, 14, 15, 20]);
// index order matches vegetation.js SPECIES (the bluff pass appended 17 on: the indices before are unchanged)
export const SPECIES = { whitePine: 0, spruce: 1, redPine: 2, birch: 3, cedar: 4, snag: 5, boulder: 6, shrub: 7, tallPine: 8, jackPine: 9, hazel: 10, alder: 11, sapling: 12, fern: 13, log: 14, stump: 15, outcrop: 16, tamarack: 17, aspen: 18, blackSpruce: 19, talus: 20, cliff: 21 };
const SCALE = [[0.85, 1.3], [0.75, 1.2], [0.75, 1.15], [0.7, 1.15], [0.75, 1.2], [0.8, 1.2], [0.4, 2.2], [0.7, 1.5], [0.85, 1.25], [0.7, 1.1],
  [0.7, 1.3], [0.75, 1.35], [0.6, 1.4], [0.6, 1.3], [0.8, 1.35], [0.75, 1.3], [2.6, 5.0], [0.75, 1.15], [0.75, 1.2], [0.7, 1.15], [0.15, 0.6], [1, 1]];
const GIANT = [0.04, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
// How many variant groups a region's bin of each species is split into (makeVegetationMeshes draws each
// group near the camera with its own geometry variant): three for the trees and the boulders so a stand
// shows several trees of a kind, fewer for the small stuff, whose variety is in its scale and yaw and whose
// draw calls would otherwise add up. GROUP_SHARE: the cumulative share of the instances each group takes.
export const GROUPS = [3, 3, 3, 3, 3, 3, 3, 1, 3, 3, 2, 2, 2, 1, 2, 1, 1, 2, 2, 2, 2, 3];
const GROUP_SHARE = { 1: [1], 2: [0.6, 1], 3: [0.45, 0.8, 1] };
// Guests: a species that is drawn in another's bins, in variant groups of its own after the host's (the old
// white pines in the white pine's, aspen in the birch's, black spruce in the spruce's). A bin is one draw call
// per region (and one per group near the camera), so a guest costs no calls of its own far off, where its bin
// draws every instance with the host's first variant; vegetation.js builds the host's variants with the
// guest's after them (SPECIES guest), the guest's made the host's height. [host, first group, the guest's
// height over the host's]: an instance's scale carries that, so far off the host's shape stands at the
// guest's height.
export const GUEST = { 8: [0, 3, 20 / 16], 18: [3, 3, 13 / 10.5], 19: [1, 3, 11 / 12.5] };
// how many variant groups a bin of each species holds: its own and its guests'
export const BIN_GROUPS = GROUPS.map((n, sp) => n + Object.entries(GUEST).filter(([, [h]]) => h === sp).reduce((s, [g]) => s + GROUPS[g], 0));
// Floats per instance: x, y, z (relative to the tile corner), yaw, scale, tint, squash; the rocks add the
// azimuth and the angle of their tilt and a height factor (the instance matrix is T * Ry(azimuth) * Rz(tilt)
// * Ry(yaw) * S, S = scale * (squash, tall, 2 - squash)).
export const STRIDE = 7, ROCK_STRIDE = 10;
const ROCKS = new Set([6, 16, 20, 21]);
export const AQUATIC = { pad: 0, reed: 1, weed: 2 };
const G = Object.fromEntries(GROUND.map((k, i) => [k, i])); // ground class name -> index

// The composition fields, in world metres so they run across tile seams. thicketAt: thickets and glades
// 100–200 m across (its seed is picked so the walk inland from the Kawishiwi Lodge on Lake One, where the
// look is judged, crosses a thicket and then a glade). standAt: ~150 m stands of birch; aspenAt: the aspen's
// clones, 60–150 m, apart from the birch stands. fernAt: drifts of ferns 20–30 m across.
const thicketAt = (x, z) => fbm(x * 0.008 + 31, z * 0.008, 3, 112);
const standAt = (x, z) => fbm(x * 0.0065 + 17, z * 0.0065, 2, 123);
const aspenAt = (x, z) => fbm(x * 0.009 - 23, z * 0.009, 2, 131);
const fernAt = (x, z) => fbm(x * 0.03 + 41, z * 0.03, 2, 211);
// Where the woods open: 1 in a glade, 0 in the trees. coverField lets grass into the glades.
export const gladeAt = (x, z) => 1 - smoothstep(0.36, 0.46, thicketAt(x, z));

function segDist(px, pz, x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1, L2 = dx * dx + dz * dz || 1;
  const t = clamp(((px - x1) * dx + (pz - z1) * dz) / L2, 0, 1);
  return Math.hypot(px - (x1 + dx * t), pz - (z1 + dz * t));
}

// Trees per cell by the shore distance, the slope (the data's, rise over run) and the clearings: the forest
// climbs a slope to 45° and more, thinning from about 24° on.
export function treeDensity(sd, slope, clearing) {
  let d;
  if (sd < 2) d = 0.1; else if (sd < 10) d = 1.5; else if (sd < 40) d = 1.4; else if (sd < 250) d = 0.95; else if (sd < 700) d = 0.5; else if (sd < 1500) d = 0.32; else d = 0.16;
  d *= 1 - smoothstep(0.45, 1.05, slope) * 0.7;
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

// ---- habitat ----------------------------------------------------------------------------------------------
// What a cell offers a tree, from the site (site.js, at the cell's centre) and the world fields:
//   dry    a warm south face, thin soil, a ridge (the pines' ground)
//   moist  a cool north face, deep soil off the ridges, a hollow that drains (the fir and the white spruce)
//   wet    flat low ground: a hollow, the flats along a quiet shore; bog its wettest (open muskeg)
//   steep  the slope from 17° to 37° (birch, aspen, cedar and spruce in the cracks)
//   crack  bare rock with soil in its joints (jack pine)
//   scree  the edge of a scree fan (birch, aspen, cedar by the water)
//   point  a knob or a point standing over the shore (an old white pine stands over everything there)
const _h = { ridge: 0, dry: 0, moist: 0, wet: 0, bog: 0, steep: 0, crack: 0, scree: 0, point: 0, shore: 0, soil: 0, sun: 0 };
function habitat(site, k, sd) {
  const h = _h, tpi = site.tpi[k];
  h.ridge = smoothstep(0.6, 3.2, tpi);
  const hollow = smoothstep(0.4, 2.6, -tpi);
  h.wet = site.wet[k]; h.soil = site.soil[k]; h.sun = site.sun[k];
  h.dry = clamp(0.55 * Math.max(0, h.sun) + 0.45 * (1 - h.soil) + 0.25 * h.ridge - 0.8 * h.wet, 0, 1);
  h.moist = clamp(0.7 * Math.max(0, -h.sun) + 0.35 * h.soil * (1 - h.ridge) + 0.3 * hollow, 0, 1) * (1 - 0.7 * h.wet);
  h.bog = smoothstep(0.65, 0.95, h.wet);
  h.steep = smoothstep(0.3, 0.75, site.S[k]);
  h.crack = smoothstep(0.2, 0.5, site.bare[k]);
  const t = site.talus[k];
  h.scree = smoothstep(0.08, 0.3, t) * (1 - smoothstep(0.55, 0.85, t));
  h.shore = sd > 0 ? 1 - smoothstep(6, 26, sd) : 0;
  h.point = h.shore * smoothstep(0.3, 2.0, tpi);
  return h;
}
// The tree species and their weights in a cell (cumulative over TREES). The boreal base is spruce and fir with
// pine and birch through it; the habitat moves it (see the header).
const TREES = [0, 1, 2, 3, 4, 5, 8, 9, 17, 18, 19];
const _w = new Float64Array(TREES.length);
function treeWeights(h, stand, aspens, thick) {
  const w = _w, dry = h.dry, wet = h.wet, up = (k) => Math.max(0, 1 - k * wet); // the upland trees give way on wet ground
  w[0] = (0.09 + 0.5 * h.ridge + 0.6 * h.shore + 0.15 * dry) * up(1.3);                                                // white pine
  w[1] = (0.16 + 0.95 * h.moist + 0.3 * h.soil * (1 - dry) + 0.9 * thick + 0.3 * h.steep * (1 - dry) + 0.15 * h.shore) * up(0.55) * (1 - 0.5 * dry); // white spruce, balsam fir
  w[2] = (0.03 + 0.5 * h.ridge * smoothstep(0.15, 0.4, h.soil) + 0.45 * dry * smoothstep(0.2, 0.5, h.soil)) * up(1.3);   // red pine
  w[3] = (0.07 + 1.6 * stand + 0.5 * h.steep + 0.6 * h.scree + 0.15 * h.moist) * up(0.75);                              // paper birch
  w[4] = 0.02 + 1.1 * h.shore * (0.4 + 0.6 * Math.max(h.moist, wet)) + 0.6 * wet * (1 - h.bog) + 0.35 * h.steep * h.shore + 0.5 * h.scree * h.shore; // cedar
  w[5] = 0.01 + 0.05 * thick;                                                                                          // a dead stem
  w[6] = (0.035 + 0.35 * h.ridge + 0.15 * h.shore + 0.45 * h.point) * up(1.3);                                          // white pine over the canopy
  w[7] = (0.01 + 1.2 * dry * (1 - h.soil) + 0.8 * h.crack * dry + 0.5 * h.ridge * (1 - h.soil)) * up(1.3);              // jack pine
  w[8] = 2.0 * wet * wet * (0.4 + 0.6 * h.bog);                                                                      // tamarack
  w[9] = (0.05 + 1.3 * aspens + 0.35 * h.steep * (0.5 + 0.5 * Math.max(0, h.sun)) + 0.3 * h.scree) * up(0.8);          // quaking aspen
  w[10] = 0.01 + 2.2 * smoothstep(0.25, 0.8, wet) * (1 - 0.3 * h.shore);                                            // black spruce
  for (let i = 1; i < w.length; i++) w[i] += w[i - 1];
  return w;
}
function pickTree(w, r) {
  const t = r * w[w.length - 1];
  for (let i = 0; i < w.length; i++) if (t < w[i]) return TREES[i];
  return SPECIES.spruce;
}
// On bare rock and in a burn the choice is the ground's, not the stand's: jack pine in the cracks of the rock
// with a few pines, spruce and birch, the odd dead stem; a burn is standing snags over the regrowth of jack
// pine, aspen and birch.
function rockTree(r) { return r < 0.5 ? SPECIES.jackPine : r < 0.62 ? SPECIES.whitePine : r < 0.72 ? SPECIES.redPine : r < 0.82 ? SPECIES.spruce : r < 0.9 ? SPECIES.birch : SPECIES.snag; }
function burnTree(r) { return r < 0.45 ? SPECIES.snag : r < 0.66 ? SPECIES.jackPine : r < 0.85 ? SPECIES.aspen : SPECIES.birch; }

// The lie of the ground at a point, for a rock that rests along it: the azimuth that turns a rock's +x up the
// slope (the instance's Ry(azimuth) takes +x to (cos, 0, -sin)) and the slope's angle, over a few metres of
// the shaped surface.
export function bedding(grid, x, z, e = 2.5) {
  const gx = (surfaceAt(grid, x + e, z) - surfaceAt(grid, x - e, z)) / (2 * e), gz = (surfaceAt(grid, x, z + e) - surfaceAt(grid, x, z - e)) / (2 * e);
  return { az: Math.atan2(-gz, gx), angle: Math.atan(Math.hypot(gx, gz)) };
}
// How steep the drawn ground is at a point (rise over run, over a few metres): nothing that stands upright
// grows on a cliff's face.
function drawnSlope(grid, x, z, e = 2) {
  const gx = surfaceAt(grid, x + e, z) - surfaceAt(grid, x - e, z), gz = surfaceAt(grid, x, z + e) - surfaceAt(grid, x, z - e);
  return Math.hypot(gx, gz) / (2 * e);
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
// them of slabs and shards about two units across) as a circle; the scree block (rocks.js screeBlock) too.
const ring = (fx, n) => Array.from({ length: n }, (_, i) => fx((i / n) * Math.PI * 2));
const ellipse = (X, Z, n) => ring((a) => [Math.cos(a) * X, Math.sin(a) * Z], n);
const box = (x0, x1, Z, n) => ring((a) => { const c = Math.cos(a), s = Math.sin(a), k = Math.min((c > 0 ? x1 : -x0) / Math.max(1e-6, Math.abs(c)), Z / Math.max(1e-6, Math.abs(s))); return [c * k, s * k]; }, n);
export const ROCK_FOOT = [
  { pts: ellipse(1.18, 0.98, 14), h: 0.7 },        // slab: the layered flats
  { pts: box(-1.6, 1.05, 0.85, 14), h: 0.75 },      // block: the slanted shard
  { pts: ellipse(1.0, 0.92, 14), h: 0.9 },          // boulder: the erratic
];
export const OUTCROP_FOOT = { pts: ellipse(1.5, 1.5, 16), h: 0.6 };
export const TALUS_FOOT = { pts: ellipse(1.0, 0.85, 10), h: 0.8 };
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
// woods (mostly erratics there). None on steep ground, a cliff or its scree: there they read as confetti
// thrown on a wall (the cliffs carry their own blocks). Where a feature stands and what it is come from rr;
// what it is made of from a stream of its own. canopy: how closed the woods are overhead (0..1).
// put(kind, x, z, scale, yaw, az, tilt, tint, squash, tall) places one rock (seated on the ground).
function rockFeatures(grid, rr, { cx, cz, cell, sd, slope, rock, bare, canopy, face }, blocked, put) {
  const shore = sd > -3 && sd < 10;
  const gentle = 1 - smoothstep(0.32, 0.5, slope); // 18–27°: from here up a slope sheds them
  let e = 0;
  if (shore) e += (0.06 + 0.12 * smoothstep(0.12, 0.3, slope) + 0.14 * rock) * gentle;
  if (bare) e += (0.2 + 0.16 * rock) * gentle;
  else if (sd >= 10) e += (0.012 + 0.03 * smoothstep(0.15, 0.32, slope) + 0.03 * smoothstep(0.25, 0.5, rock)) * gentle;
  e *= 1 - face;
  const n = Math.floor(e) + (rr() < e - Math.floor(e) ? 1 : 0);
  const K = ROCK_KIND;
  for (let f = 0; f < n; f++) {
    const fx = cx + (rr() - 0.5) * cell, fz = cz + (rr() - 0.5) * cell;
    if (grid.shoreAt(fx, fz) < -2.5 || blocked(fx, fz, 2.5) || drawnSlope(grid, fx, fz, 2.5) > 0.6) continue;
    const r = rr(), flat = slope < 0.18;
    let type;
    if (bare) type = flat ? (r < 0.5 ? 'flats' : r < 0.8 ? 'slanted' : 'erratic') : (r < 0.6 ? 'slanted' : r < 0.85 ? 'flats' : 'erratic');
    else if (shore) type = flat ? (r < 0.4 ? 'flats' : r < 0.75 ? 'erratic' : 'slanted') : (r < 0.5 ? 'slanted' : r < 0.75 ? 'flats' : 'erratic');
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
      const bed = bedding(grid, fx, fz), level = bed.angle < 0.04;
      const az = level ? fr() * Math.PI * 2 : bed.az, tilt = Math.min(0.42, bed.angle * (0.75 + fr() * 0.2)) + fr() * 0.05;
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

// ---- the cliffs -------------------------------------------------------------------------------------------
// One cliff module where a core cell's fall line crosses its band's step (site.js), with what goes with it.
// The step is read off the terrain mesh along the cell's fall line: its steepest metre, then down to where it
// eases under 35° (the foot) and up to the same (the top). The module (cliffs.js; its frame in site.js
// CLIFF_MODULE) stands with its face at the foot, a little proud of it, as wide as a cell and a few metres more
// (the neighbours overlap), as tall as the step and a ragged metre or so over its top, reaching back into the
// hill past the top. A step is claimed by the cell its steepest point lies in, or (when that cell is not on
// the band itself) by the band cell nearest to it, so each step gets one module.
// ctx: { emit, put (a boulder-species rock), scree (a scree block), tree (sp, x, z, scale), ground, blocked }.
function cliffFeatures(grid, site, k, i, j, rng, ctx) {
  const ux = site.ux[k], uz = site.uz[k];
  if (!ux && !uz) return;
  const cx = grid.cellX(i), cz = grid.cellZ(j), ground = ctx.ground;
  // the profile along the fall line, a metre apart
  const T0 = -16, NT = 43, h = new Float32Array(NT);
  for (let t = 0; t < NT; t++) h[t] = ground(cx + ux * (T0 + t), cz + uz * (T0 + t));
  let best = -1, bs = 0;
  for (let t = 0; t < NT - 1; t++) { const s = h[t + 1] - h[t]; if (s > bs) { bs = s; best = t; } }
  if (best < 0 || bs < CLIFF.steep[0]) return;
  let foot = best, top = best + 1;
  while (foot > 0 && h[foot] - h[foot - 1] >= 0.7) foot--;
  while (top < NT - 1 && h[top + 1] - h[top] >= 0.7) top++;
  const tStar = T0 + best + 0.5, px = cx + ux * tStar, pz = cz + uz * tStar;
  // who claims this step
  const pi = grid.cellI(px), pj = grid.cellJ(pz);
  if (pi !== i || pj !== j) {
    const owner = site.index(px, pz);
    if (site.cliff[owner] >= 0.3) return;
    let near = Infinity, mine = Math.hypot(px - cx, pz - cz);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const qi = pi + di, qj = pj + dj, q = site.index(grid.cellX(qi), grid.cellZ(qj));
      if (site.cliff[q] >= CLIFF.band && (qi !== i || qj !== j)) near = Math.min(near, Math.hypot(px - grid.cellX(qi), pz - grid.cellZ(qj)));
    }
    if (near < mine) return;
  }
  const tFoot = T0 + foot, tTop = T0 + top, hFoot = h[foot], hTop = h[top], wall = hTop - hFoot;
  if (wall < 3.5) return;
  // the module's frame: +z up the fall line (into the hill), +x along the contour
  const yaw = Math.atan2(ux, uz) + (rng() - 0.5) * 0.12, fx = Math.sin(yaw), fz = Math.cos(yaw), vx = fz, vz = -fx;
  const proud = 0.45 + rng() * 0.45, W = 12.5 + rng() * 3, off = (rng() - 0.5) * 2;
  const ox = cx + ux * tFoot - fx * proud + vx * off, oz = cz + uz * tFoot - fz * proud + vz * off;
  // its base under the lowest ground along its face, its top a ragged metre over the step's
  let low = hFoot;
  for (const a of [-0.5, -0.25, 0, 0.25, 0.5]) low = Math.min(low, ground(ox + vx * a * W, oz + vz * a * W));
  const base = low - 0.7 - 0.04 * wall, Hm = hTop + 0.4 + rng() * 1.2 - base, D = tTop - tFoot + proud + 2.2;
  const sc = (W + D) / 2, sq = W / sc, tall = Hm / sc;
  ctx.emit(SPECIES.cliff, Math.floor(rng() * 3), ox, base, oz, yaw, sc, 0.86 + rng() * 0.18, sq, 0, 0, tall);
  // a small tree or two on the ledge now and then (cedar, jack pine, birch and spruce root in its joints)
  const ledgeY = base + CLIFF_MODULE.ledge * Hm;
  if (Hm > 7 && rng() < 0.4) for (let c = rng() < 0.3 ? 2 : 1; c > 0; c--) {
    const bx = CLIFF_MODULE.benchX, lx = (bx[0] + rng() * (bx[1] - bx[0])) * W, lz = (CLIFF_MODULE.ledgeZ[0] + rng() * (CLIFF_MODULE.ledgeZ[1] - CLIFF_MODULE.ledgeZ[0])) * D, r = rng();
    const sp = r < 0.35 ? SPECIES.jackPine : r < 0.6 ? SPECIES.cedar : r < 0.8 ? SPECIES.birch : SPECIES.spruce;
    ctx.tree(sp, ox + vx * lx + fx * lz, oz + vz * lx + fz * lz, 0.38 + rng() * 0.22, ledgeY - 0.25);
  }
  // the ragged line of pines and spruce along the top, a step back from the edge
  for (let c = 0; c < 3; c++) {
    if (rng() > 0.72) continue;
    const t = tTop + 1.6 + rng() * 4.5, a = (rng() - 0.5) * 0.9 * W, x = cx + ux * t + vx * (a + off), z = cz + uz * t + vz * (a + off), r = rng();
    const sp = r < 0.28 ? SPECIES.whitePine : r < 0.52 ? SPECIES.spruce : r < 0.66 ? SPECIES.redPine : r < 0.9 ? SPECIES.jackPine : SPECIES.birch;
    if (drawnSlope(grid, x, z) < 0.8) ctx.tree(sp, x, z, 0.75 + rng() * 0.35, null);
  }
  // big blocks fallen against the foot of the wall and leaning on it, the head of each against the face: the top
  // of the scree, hiding the foot of the step
  const fcx = ox + fx * proud, fcz = oz + fz * proud, azIn = Math.atan2(-fz, fx);
  for (let c = 2 + Math.floor(W / 5 + rng() * 2); c > 0; c--) {
    const a = (rng() - 0.5) * W, d = 0.6 + rng() * 1.6, s = 1.0 + rng() * 1.3;
    ctx.put(ROCK_KIND.block, fcx - fx * d + vx * a, fcz - fz * d + vz * a, s, (rng() - 0.5) * 0.8, azIn + (rng() - 0.5) * 0.7, 0.45 + rng() * 0.4, 0.84 + rng() * 0.18, 0.8 + rng() * 0.35, 0.85 + rng() * 0.35);
  }
  // trees at the foot, where the shelf under the wall is wide enough (cedar likes the wet foot of a cliff, birch
  // and spruce come up through the scree): the forest climbing to the face
  for (let c = 0; c < 3; c++) {
    if (rng() > 0.5) continue;
    const d = 1.6 + rng() * 2.8, a = (rng() - 0.5) * 0.9 * W, r = rng();
    const x = ox + fx * proud - fx * d + vx * a, z = oz + fz * proud - fz * d + vz * a;
    const sp = r < 0.4 ? SPECIES.cedar : r < 0.65 ? SPECIES.birch : r < 0.88 ? SPECIES.spruce : SPECIES.aspen;
    if (grid.shoreAt(x, z) > 1.2 && drawnSlope(grid, x, z) < 0.55) ctx.tree(sp, x, z, 0.7 + rng() * 0.35, null);
  }
  // the scree: a few big blocks against the wall and many small ones out from it, thinning away; as far out as
  // half the wall's height and a little more, and on into the shallows
  const fall = clamp(0.55 * wall + 1.5, 3, 15), n = Math.round(W * fall * 0.42 * (0.7 + 0.6 * rng()));
  for (let q = 0; q < n; q++) {
    const d = 0.3 + fall * rng() ** 1.35, a = (rng() - 0.5) * W, near = 1 - d / fall;
    const x = fcx - fx * d + vx * a, z = fcz - fz * d + vz * a;
    const sdq = grid.shoreAt(x, z);
    if (sdq < -2.5 || (sdq < -0.5 && rng() < 0.6)) continue; // a few into the shallows, none out in the lake
    const big = rng() < 0.12 + 0.3 * near * near;
    const s = big ? 0.62 + rng() * 0.9 * (0.5 + near) : 0.2 + rng() ** 1.4 * 0.46 * (0.6 + 0.4 * near);
    const tint = 0.86 + rng() * 0.22, yawR = rng() * Math.PI * 2, az = rng() * Math.PI * 2, tilt = 0.1 + rng() * 0.45;
    if (big) ctx.put(ROCK_KIND.block, x, z, s, yawR, az, tilt, tint, 0.8 + rng() * 0.4, 0.75 + rng() * 0.4);
    else ctx.scree(x, z, s, yawR, az, tilt, tint, 0.8 + rng() * 0.4, 0.7 + rng() * 0.5, rng() < 0.5 ? 0 : 1);
  }
}

// ---- the lake bed (the lake pass) -----------------------------------------------------------------------------
// What lies on the bed of one water cell, from what the bed is made of there (terrain-build.js bedPre, the same the
// paint reads): stones and boulders off a rocky shore and on the stony shelves, in groups of a big one and a few small
// round it, seated whole on the drawn bed: the big one a rounded erratic (the boulder species, so it throws its shadow
// on the sunlit bed), the small ones scree blocks (the cheap rock: no shadow, no collision), each its own shade; sunken
// logs off the wooded shores, lying along the contour and half in the silt; and in the soft shallows of a quiet bay a
// waterlogged log lying awash, its back just out of the water. The water's tint pass colours all of them as it does
// the bed (water.js). The cobble and the gravel are the bed's own paint (terrain.js bedCobble).
// ctx: { emit, ground, blocked, cx, cz, cell, sd, level }.
const _bed = {};
function bedFeatures(grid, site, rr, ctx) {
  const { cx, cz, cell, sd, level } = ctx, ground = ctx.ground;
  const depth = level - ground(cx, cz);
  if (!(depth > 0.15) || depth > 9) return;
  const b = bedPre(grid, cx, cz, sd, depth, site, _bed);
  const shallow = 1 - smoothstep(3.5, 7, depth);
  // stones: a group of one big one and a few small, more off a rocky shore
  const eRock = (0.35 * b.cobble + 1.8 * b.rock * (b.cobble + b.bedrock)) * shallow * (1 - b.silt);
  for (let n = Math.floor(eRock) + (rr() < eRock % 1 ? 1 : 0); n > 0; n--) {
    const gx = cx + (rr() - 0.5) * cell, gz = cz + (rr() - 0.5) * cell;
    if (grid.shoreAt(gx, gz) > -0.6) continue;
    const big = rr() < 0.3 + 0.3 * b.rock, lead = big ? 0.6 + rr() * 0.55 : 0.28 + rr() * 0.27;
    const k = 1 + Math.floor(rr() * (big ? 4 : 3));
    for (let q = 0; q < k; q++) {
      const s = q === 0 ? lead : lead * (0.3 + rr() * 0.4), a = rr() * Math.PI * 2, d = q === 0 ? 0 : lead * (0.9 + rr() * 1.2);
      const x = gx + Math.cos(a) * d, z = gz + Math.sin(a) * d;
      if (grid.shoreAt(x, z) > -0.4 || ctx.blocked(x, z, s)) continue;
      const yaw = rr() * Math.PI * 2, az = rr() * Math.PI * 2, tilt = rr() * 0.3, squash = 0.8 + rr() * 0.4, tall = 0.7 + rr() * 0.5;
      const tint = 0.62 + rr() * 0.42;
      if (q === 0 && big) {
        // the group's boulder: a rounded erratic (the boulder species: it casts its shadow on the bed)
        const bs = s * 0.8, bt = tall * 0.85;
        ctx.emit(SPECIES.boulder, ROCK_KIND.boulder, x, seatRock(ground, ROCK_FOOT[ROCK_KIND.boulder], x, z, bs, squash, bt, yaw, az, tilt * 0.5, grid.slopeAt(x, z)), z, yaw, bs, tint, squash, az, tilt * 0.5, bt);
        continue;
      }
      const y = seatRock(ground, TALUS_FOOT, x, z, s, squash, tall, yaw, az, tilt, grid.slopeAt(x, z));
      ctx.emit(SPECIES.talus, rr() < 0.5 ? 0 : 1, x, y, z, yaw, s, tint, squash, az, tilt, tall);
    }
  }
  // a sunken log off a wooded shore (not off the bare rock or the open muskeg), lying along the contour
  const wooded = (1 - b.rock) * (1 - smoothstep(0.5, 0.9, b.soft)) * (1 - smoothstep(4, 6, depth)) * smoothstep(-26, -6, sd);
  if (rr() < 0.05 * wooded) {
    const x = cx + (rr() - 0.5) * cell, z = cz + (rr() - 0.5) * cell, dd = grid.deeperDir(x, z);
    const yaw = Math.atan2(dd.x, dd.z) + (rr() - 0.5) * 0.8, scale = 0.8 + rr() * 0.5;
    const ux = Math.cos(yaw) * 3.4 * scale, uz = -Math.sin(yaw) * 3.4 * scale;
    if (grid.shoreAt(x + ux, z + uz) < -0.8 && grid.shoreAt(x - ux, z - uz) < -0.8 && !ctx.blocked(x, z, 4)) {
      const y = Math.min(ground(x + ux, z + uz), ground(x - ux, z - uz), ground(x, z)) - 0.12 * scale;
      ctx.emit(SPECIES.log, rr() < 0.6 ? 0 : 1, x, y, z, yaw, scale, 0.55 + rr() * 0.12, 1);
    }
  }
  // a waterlogged log awash in a quiet soft shallow, its back just out of the water
  if (depth < 1.1 && rr() < 0.035 * b.soft * (1 - b.rock)) {
    const x = cx + (rr() - 0.5) * cell, z = cz + (rr() - 0.5) * cell, yaw = rr() * Math.PI * 2, scale = 0.7 + rr() * 0.4;
    const ux = Math.cos(yaw) * 3.4 * scale, uz = -Math.sin(yaw) * 3.4 * scale;
    if (grid.shoreAt(x + ux, z + uz) < -0.3 && grid.shoreAt(x - ux, z - uz) < -0.3 && !ctx.blocked(x, z, 4)) {
      const y = Math.max(Math.min(ground(x + ux, z + uz), ground(x - ux, z - uz)) - 0.15, level - 0.4 * scale);
      ctx.emit(SPECIES.log, 0, x, y, z, yaw, scale, 0.58 + rr() * 0.1, 1);
    }
  }
}

// Returns bins of instances (`stride` floats each, see STRIDE), one per region (640 m, or 320 m for the small
// species) and species, the instances sorted into variant groups with the count in each (`groups`), and the
// canopy shade over the tile's local extent (used to darken the ground under thick forest).
export function placeVegetation(grid, i0, j0, n, { seed = 3, exclusions = null, originX, originZ, site }) {
  const side = grid.side, cell = grid.cell;
  const shadeCount = new Float32Array(side * side);
  const bins = new Map();
  const mask = tileSegments(grid, i0, j0, n, exclusions);
  let total = 0;
  const count = (rng, e) => Math.floor(e) + (rng() < e - Math.floor(e) ? 1 : 0);
  // one instance into its (region, species) bin and variant group; a rock carries the azimuth and the angle
  // of its tilt. For the boulder species `group` is the rock's family (ROCK_KIND), put in the group drawing it.
  const emit = (sp, group, x, y, z, yaw, scale, tint, squash, az = 0, tilt = 0, tall = 1) => {
    if (GUEST[sp]) { group += GUEST[sp][1]; scale *= GUEST[sp][2]; sp = GUEST[sp][0]; }
    const size = SMALL.has(sp) ? SMALL_REGION : REGION;
    const rx = Math.floor((x - grid.originX) / size), rz = Math.floor((z - grid.originZ) / size);
    const key = (rx * 4096 + rz) * 32 + sp;
    let b = bins.get(key);
    if (!b) { b = { rx, rz, sp, size, parts: Array.from({ length: BIN_GROUPS[sp] }, () => []) }; bins.set(key, b); }
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
  // the terrain mesh's own height, for seating everything (the vertices cached: things come in groups)
  const meshCache = new Map(), ground = (x, z) => meshHeightAt(grid, x, z, meshCache);
  // a rock of a family (ROCK_KIND) for rockFeatures: kept out of deep water and the clearings, seated on the mesh
  const emitRock = (kind, x, z, scale, yaw, az, tilt, tint, squash = 1, tall = 1) => {
    if (grid.shoreAt(x, z) < -4 || blocked(x, z, 0.3 + scale * 0.8)) return false;
    const y = seatRock(ground, ROCK_FOOT[kind], x, z, scale, squash, tall, yaw, az, tilt, grid.slopeAt(x, z));
    emit(SPECIES.boulder, kind, x, y, z, yaw, scale, tint, squash, az, tilt, tall);
    return true;
  };
  // a block of scree (the cheap scree species; the big ones are boulder-species shards, which the walker is held off)
  const emitScree = (x, z, scale, yaw, az, tilt, tint, squash, tall, group) => {
    if (blocked(x, z, 0.3 + scale * 0.8)) return;
    emit(SPECIES.talus, group, x, seatRock(ground, TALUS_FOOT, x, z, scale, squash, tall, yaw, az, tilt, grid.slopeAt(x, z)), z, yaw, scale, tint, squash, az, tilt, tall);
  };
  // a tree a cliff places (on its ledge at `y`, or on its top, seated on the ground when y is null)
  const cliffTree = (sp, x, z, scale, y) => {
    if (grid.shoreAt(x, z) < 0.6 || blocked(x, z, 1.2)) return;
    let group = 0;
    if (GROUPS[sp] > 1) { const r = hash2(Math.floor(x * 7), Math.floor(z * 7), 5), share = GROUP_SHARE[GROUPS[sp]]; while (r >= share[group]) group++; }
    const yaw = hash2(Math.floor(x * 13), Math.floor(z * 13), 6) * Math.PI * 2, tint = 0.92 + hash2(Math.floor(x * 3), Math.floor(z * 3), 7) * 0.16;
    const s = SCALE[sp][0] + (SCALE[sp][1] - SCALE[sp][0]) * hash2(Math.floor(x * 5), Math.floor(z * 5), 8);
    const slope = grid.slopeAt(x, z), yy = y ?? ground(x, z) - (0.35 + slope * 1.2 * s * scale);
    emit(sp, group, x, yy, z, yaw, s * scale, tint, 0.9 + hash2(Math.floor(x * 11), Math.floor(z * 11), 9) * 0.2);
    shadeCount[grid.local(grid.cellI(x), grid.cellJ(z))] += 0.5;
  };
  const cliffCtx = { emit, put: emitRock, scree: emitScree, tree: cliffTree, ground, blocked };
  // one cell ring beyond the tile so the canopy shade at the edge matches the neighbour's trees
  for (let j = j0 - 1; j < j0 + n + 1; j++) {
    for (let i = i0 - 1; i < i0 + n + 1; i++) {
      const k = grid.local(i, j);
      const sd = grid.sdCell(i, j);
      // the lake bed's stones and logs (bedFeatures), core cells only, a stream of their own
      if (sd < 0 && i >= i0 && i < i0 + n && j >= j0 && j < j0 + n) {
        const bx = grid.cellX(i), bz = grid.cellZ(j);
        bedFeatures(grid, site, mulberry32((hash2(i, j, seed + 307) * 4294967296) >>> 0), { emit, ground, blocked, cx: bx, cz: bz, cell, sd, level: grid.levelAt(bx, bz, 3) });
      }
      if (sd < -4) continue;
      const rng = mulberry32((hash2(i, j, seed) * 4294967296) >>> 0);
      const cx = grid.cellX(i), cz = grid.cellZ(j);
      const slope = site.S[k];
      const clearing = smoothstep(0.62, 0.78, clearingAt(cx, cz));
      const burn = burnAt(cx, cz);
      const cliff = site.cliff[k], talus = site.talus[k], bareness = site.bare[k];
      const bare = bareness > 0.5;
      const face = Math.max(smoothstep(0.25, 0.5, cliff), smoothstep(0.3, 0.6, talus)); // a cliff or its scree
      const soil = 1 - smoothstep(0.35, 0.6, Math.max(bareness, face));
      const h = habitat(site, k, sd);
      const segs = mask.get(k);
      // trails run through thick woods: more trees and brush right beside them
      const trailSide = segs && segs.some((g) => g[5] < 5) ? 2.6 : 1;
      // thickets and glades: the one field that makes the forest uneven. Not on bare rock (sparse already)
      // nor beside a trail (kept thick), and the glade's rim is where the understory gathers.
      const t = thicketAt(cx, cz);
      const glade = 1 - smoothstep(0.36, 0.46, t), thick = smoothstep(0.54, 0.66, t);
      const edge = smoothstep(0.34, 0.42, t) * (1 - smoothstep(0.46, 0.56, t));
      const clump = bare || trailSide > 1 ? 1 : (0.2 + 0.8 * smoothstep(0.38, 0.6, t) + 1.0 * thick) * 1.3;
      // the forest: thinner on the steep, gone from a cliff's face, sparse on its scree and on bare rock, open
      // in the wettest bog
      const e = sd < 0 ? 0 : Math.min(2.8, treeDensity(sd, slope, trailSide > 1 ? 0 : clearing) * 1.05 * trailSide * (1 - burn * 0.5) * (1 - smoothstep(0.3, 0.6, bareness) * 0.88)
        * (1 - 0.95 * smoothstep(0.25, 0.6, cliff)) * (1 - 0.7 * smoothstep(0.2, 0.7, talus)) * (1 - 0.35 * h.bog) * clump);
      const trees = count(rng, e);
      // shoreline shrubs
      const eShrub = ((sd > 0.5 && sd < 35 ? (0.75 - smoothstep(10, 35, sd) * 0.5) * (1 - clearing * 0.5) * trailSide : (sd > 0 && trailSide > 1 ? 0.5 : 0)) + burn * 0.5) * (1 - bareness * 0.8) * (1 - face);
      const shrubs = count(rng, eShrub);
      // the understory: hazel at the edges of the woods and in the open stands, off the wet ground; alder down
      // by the water, on the wet ground and round the bogs; young fir coming up in the gaps of the moist woods, the
      // glades and the burn; bracken in drifts under a moderate canopy; all of it sparse under a heavy canopy and
      // none of it on rock, a cliff, its scree or in a meadow
      const heavy = smoothstep(1.1, 2.0, e), open = 1 - heavy, land = sd > 0.8 ? 1 : 0;
      const eHazel = land * (1.6 * edge + 0.18 * open * smoothstep(0.1, 0.4, e)) * (1 - 0.8 * h.wet) * soil * (1 - burn) * (1 - clearing * 0.7) * (sd > 3 ? trailSide : 0);
      const eAlder = land * (1.7 * (1 - smoothstep(3, 18, sd)) + 0.9 * h.wet * open + 0.6 * h.bog) * soil * (1 - burn * 0.5) * (1 - clearing);
      const eSapling = land * (0.08 * open * smoothstep(0.1, 0.4, e) + 0.5 * edge + 0.25 * burn + 0.25 * glade * (1 - clearing)) * (0.8 + 0.4 * h.moist) * (1 - 0.5 * h.wet) * soil;
      const eFern = land * (1.6 * smoothstep(0.5, 0.64, fernAt(cx, cz)) * smoothstep(0.3, 0.9, e) * (1 - heavy * 0.6) + 0.35 * open * smoothstep(0.3, 0.9, e) * (1 - h.dry)) * (1 - 0.6 * h.wet) * soil * (1 - burn) * (1 - clearing);
      // deadfall: a few trees in a hundred lie on the floor or stand as stumps; granite slabs where the
      // bedrock comes through on gentle ground
      const eLog = e * 0.035 * (1 - face), eStump = e * 0.02;
      const eOutcrop = sd > 4 ? (0.1 * smoothstep(0.22, 0.42, bareness) * (1 - smoothstep(0.5, 0.8, bareness)) + 0.03 * smoothstep(0.5, 0.7, bareness)) * (1 - smoothstep(0.3, 0.5, slope)) * (1 - face) : 0;
      const core = i >= i0 && i < i0 + n && j >= j0 && j < j0 + n;
      let w = null;
      const stand = smoothstep(0.56, 0.66, standAt(cx, cz)), aspens = smoothstep(0.6, 0.7, aspenAt(cx, cz)) * (1 - stand);
      // one pass over everything the cell grows: [species or -1 for a tree, count, exclusion pad]
      const plan = [[-1, trees, 1.2], [7, shrubs, 0.4], [10, count(rng, eHazel), 0.4], [11, count(rng, eAlder), 0.4], [12, count(rng, eSapling), 0.4], [13, count(rng, eFern), 0.3],
        [14, count(rng, eLog), 1.5], [15, count(rng, eStump), 0.8], [16, count(rng, eOutcrop), 2.5]];
      for (const [kind, cnt, pad] of plan) {
        for (let q = 0; q < cnt; q++) {
          const x = cx + (rng() - 0.5) * cell, z = cz + (rng() - 0.5) * cell;
          const s = grid.shoreAt(x, z);
          const isRock = kind === 16;
          if (isRock ? s < -3 : s < 0.6) continue;
          if (segs && segs.some((g) => segDist(x, z, g[0], g[1], g[2], g[3]) < g[4] + pad)) continue;
          // nothing upright on a cliff's face (the steep step of the drawn ground)
          if (face > 0.05 && kind !== 16 && drawnSlope(grid, x, z) > 0.9) continue;
          let sp = kind;
          if (kind === -1) {
            const r = rng();
            if (bare) sp = rockTree(r);
            else if (burn > 0.5) sp = burnTree(r);
            else sp = pickTree(w || (w = treeWeights(h, stand, aspens, thick)), r);
            shadeCount[k] += 1;
          }
          const isTree = kind === -1, isShrub = kind === 7;
          let scale = SCALE[sp][0] + (isRock ? rng() ** 1.7 : rng()) * (SCALE[sp][1] - SCALE[sp][0]); // rocks: many small, a few big
          if (GIANT[sp] && rng() < GIANT[sp]) scale *= 1.45;
          if (isTree && burn > 0.5) scale *= sp === SPECIES.snag ? 1.25 : 0.45;        // tall dead stems, small regrowth
          if (isTree && bare && sp !== SPECIES.jackPine) scale *= 0.7;                 // stunted on the rock
          if (isTree && h.bog > 0.3 && (sp === SPECIES.blackSpruce || sp === SPECIES.tamarack)) scale *= 1 - 0.3 * h.bog; // the muskeg's runts
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
          // sink into the ground more on slopes so the downhill edge never hangs in the air; everything stands on
          // the drawn mesh itself (meshHeightAt), the rocks seated whole on it (rockFeatures, and below for an
          // outcrop, which also lies along the slope)
          let sink = 0;
          if (kind === 14) sink = 0.02 * scale + slopeHere * 0.25 * scale;
          else if (kind === 15) sink = 0.35 + slopeHere * 0.8 * scale;
          else if (kind >= 10 && kind !== 16) sink = 0.05 + slopeHere * 1.0 * scale;
          else if (kind < 10) sink = (isShrub ? 0.45 : 0.35) + slopeHere * (isShrub ? 1.0 : 1.2) * scale;
          // an outcrop lies along the slope like the bedrock it breaks out of, darker under a canopy
          const outcrop = kind === 16, bed = outcrop ? bedding(grid, x, z) : null;
          const y = outcrop ? seatRock(ground, OUTCROP_FOOT, x, z, scale, 1, 1, yaw, bed.az, bed.angle * 0.85, slopeHere) : ground(x, z) - sink;
          emit(sp, group, x, y, z, yaw, scale, outcrop ? tint * (1 - 0.32 * smoothstep(0.5, 2.0, e)) : tint, squash, outcrop ? bed.az : 0, outcrop ? bed.angle * 0.85 : 0);
        }
      }
      if (core) {
        rockFeatures(grid, mulberry32((hash2(i, j, seed + 101) * 4294967296) >>> 0), { cx, cz, cell, sd, slope, rock: bareness, bare, canopy: smoothstep(0.5, 2.0, e), face }, blocked, emitRock);
        if (cliff >= CLIFF.band * 0.66 && sd > -3) cliffFeatures(grid, site, k, i, j, mulberry32((hash2(i, j, seed + 211) * 4294967296) >>> 0), cliffCtx);
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

// The lake plants (docs/look.md, the lake pass). Bins of 5 floats per instance (x, y, z relative to the tile corner,
// yaw, scale), keyed by region, kind and geometry variant (aquatic.js draws a bin with one geometry). Each grows where
// it grows in the Boundary Waters, read from the bed (terrain-build.js bedPre: soft silt and sand root plants, cobble and
// bedrock hardly any), the shore behind (wet ground or bare rock: site.js) and how sheltered the water is:
//   pads (kind 0)    rafts of yellow pond lily (spatterdock: big pads, some standing out of the water, yellow
//                    flowers) in the shallow mucky water, white water lily a little deeper, small plain pads among
//                    them; dense in the sheltered soft-bottomed bays and the inlets, 0.4-3 m, in patches 30-60 m across
//   reeds (kind 1)   sedge tussocks along the marshy shores, standing out of the water at its edge (variant 3); cattail
//                    in the shallow muck of a sheltered marshy shore (2); bulrush out to a metre and a half on the
//                    soft bottoms, sheltered or not (0); reed and grass at the edge (1)
//   weed (kind 2)    pondweed and milfoil on the soft bed, 0.4-3.6 m, in the beds the bed's paint marks (bedPre weed)
//   rice (kind 3)    wild rice in the shallow soft bays where water runs in or out (an inlet, a river mouth), and in
//                    the quiet shallows of the stained lakes, 0.3-1.4 m
// Nothing roots off a bare rocky shore or on a cobble bed in the open; all of it is thicker where the water is calm.
// The season (aquatic.js) grows and browns them.
const _bedA = {};
export function placeAquatic(grid, i0, j0, n, { seed = 9, originX, originZ, site = null }) {
  const cell = grid.cell, RICE = 3, SEDGE = 3;
  const bins = new Map();
  let total = 0;
  // depths are to the drawn bed (the shore band reshaped: the raw cells under an unmapped lake's shallows sit a metre
  // down right at the waterline); the weed is seated on the mesh itself
  const meshCache = new Map(), bedAt = (x, z) => surfaceAt(grid, x, z);
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
  // water running in or out nearby: another water polygon (a river, a creek, the next lake through a narrows) within 55 m
  const inletAt = (x, z, id) => {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.4, dx = Math.cos(a), dz = Math.sin(a);
      for (const t of [22, 40, 55]) { const o = grid.lakeIdAt(x + dx * t, z + dz * t); if (o && o !== id) return 1 - t / 80; }
    }
    return 0;
  };
  for (let j = j0; j < j0 + n; j++) {
    for (let i = i0; i < i0 + n; i++) {
      const sd = grid.sdCell(i, j);
      if (sd < -40 || sd > 2) continue;
      const cx = grid.cellX(i), cz = grid.cellZ(j);
      const level = grid.levelAt(cx, cz, 3);
      const depth = level - bedAt(cx, cz);
      // the shore this water faces: bare rock, a cliff or its scree (nothing roots off it), or wet ground (a marsh)
      let rockS = 0, wet = 0;
      {
        const dd = grid.deeperDir(cx, cz), back = Math.max(0, -sd) + 4, lx = cx - dd.x * back, lz = cz - dd.z * back;
        rockS = smoothstep(0.35, 0.6, rockAt(rockSlope(grid, lx, lz), grid.shoreAt(lx, lz), lx, lz));
        if (site) {
          rockS = Math.max(rockS, smoothstep(0.2, 0.5, Math.max(site.at(site.cliff, lx, lz), site.at(site.talus, lx, lz), site.at(site.bare, lx, lz))));
          if (grid.shoreAt(lx, lz) > 0) wet = smoothstep(0.3, 0.8, site.at(site.wet, lx, lz));
        }
      }
      if (rockS > 0.95 && sd > -24) continue;
      // the bottom (bedPre, as the bed is painted): soft silt and sand root plants, cobble and bedrock hardly any
      const bed = bedPre(grid, cx, cz, Math.min(sd, -0.01), Math.max(depth, 0), site, _bedA);
      const rooting = Math.min(1, bed.silt + 0.7 * bed.sand + 0.25 * bed.cobble) * (1 - 0.9 * rockS);
      // sheltered: a cove round it, or the calm field's quiet water that the shape test misses
      const calm = calmAt(cx, cz), shelter = shelterAt(cx, cz);
      const shelt = clamp(smoothstep(0.15, 0.6, shelter) * 0.75 + smoothstep(0.45, 0.66, calm) * 0.5, 0, 1);
      const id = grid.lakeIdAt(cx, cz) || grid.lakeIdAt(cx - 10, cz) || grid.lakeIdAt(cx + 10, cz);
      const inlet = sd < -1 && depth < 2 ? inletAt(cx, cz, id) : 0;
      const stained = 1 - smoothstep(1.4, 3.0, bed.clarity);
      const rng = mulberry32((hash2(i, j, seed + 1) * 4294967296) >>> 0);
      const rx = Math.floor((cx - grid.originX) / REGION), rz = Math.floor((cz - grid.originZ) / REGION);
      const place = (kind, expected, pick, test, lift, scaleOf) => {
        const cnt = Math.floor(expected) + (rng() < expected - Math.floor(expected) ? 1 : 0);
        for (let q = 0; q < cnt; q++) {
          const x = cx + (rng() - 0.5) * cell, z = cz + (rng() - 0.5) * cell;
          const s = grid.shoreAt(x, z), d = level - bedAt(x, z);
          if (!test(s, d)) continue;
          const y = kind === AQUATIC.weed ? meshHeightAt(grid, x, z, meshCache) : level + lift;
          const variant = pick(d), key = ((rx * 4096 + rz) * 4 + kind) * 4 + variant;
          let b = bins.get(key);
          if (!b) { b = { rx, rz, kind, variant, items: [] }; bins.set(key, b); }
          b.items.push(x - originX, y, z - originZ, rng() * Math.PI * 2, scaleOf(d));
          total++;
        }
      };
      // beds of wild rice: 50-100 m fields in the soft shallows where water runs through, and in the quiet stained bays
      const riceField = smoothstep(0.42, 0.56, fbm(cx * 0.012 + 7, cz * 0.012, 2, 113));
      const bedR = clamp(Math.max(1.4 * inlet, riceField * smoothstep(0.3, 0.7, shelt) * (0.45 + 0.55 * stained)), 0, 1) * rooting;
      if (bedR > 0.01 && sd < -1.5 && depth > 0.2 && depth < 1.6)
        place(RICE, 7 * bedR, () => (rng() < 0.5 ? 0 : 1), (s, d) => s < -1.2 && d > 0.25 && d < 1.5, 0.07, () => 0.85 + rng() * 0.4);
      // rafts of lily pads, gathered into patches 30-60 m across, dense in the quiet soft bays and the inlets, thinner
      // inside a rice bed: spatterdock in the shallow muck, white lilies a little deeper, small plain pads among them
      const raft = smoothstep(0.26, 0.48, fbm(cx * 0.025 + 3, cz * 0.025, 2, 77)) ** 0.7 * clamp(smoothstep(0.1, 0.5, shelt) + 0.8 * inlet, 0, 1) * (0.3 + 0.7 * rooting) * (1 - 0.6 * bedR) * (1 - 0.9 * rockS);
      if (raft > 0.01 && sd < -0.8 && sd > -32 && depth > 0.3 && depth < 3.0)
        place(AQUATIC.pad, 18 * raft, (d) => { const r = rng(); return d < 1.6 && r < 0.38 + 0.25 * stained ? 1 : d > 0.9 && r < 0.6 ? 2 : r < 0.75 ? 0 : 3; },
          (s, d) => s < -0.6 && d > 0.3 && d < 3.0, 0.035, () => 0.8 + rng() * 0.5);
      // the emergent plants, in stands along the soft shores
      const stand = smoothstep(0.32, 0.52, fbm(cx * 0.05 + 11, cz * 0.05, 2, 91));
      const marsh = Math.max(wet, 0.6 * smoothstep(0.4, 0.8, bed.soft)) * (1 - rockS);
      // sedge tussocks along a marshy shore, out of the water at its very edge
      const sedgy = Math.max(marsh, 0.5 * (1 - rockS) * (0.4 + 0.6 * shelt) * rooting);
      if (sedgy > 0.05 && sd > -6 && sd < 1.6)
        place(AQUATIC.reed, 16 * sedgy * (0.3 + 0.7 * stand), () => SEDGE, (s, d) => s < 1.4 && d > -0.08 && d < 0.55, 0.05, () => 0.75 + rng() * 0.5);
      // cattail in the shallow muck of a sheltered marshy shore
      if (marsh > 0.05 && sd > -9 && sd < 1)
        place(AQUATIC.reed, 4 * marsh * shelt * stand, () => 2, (s, d) => s < 0.8 && d > 0 && d < 0.75, 0.07, () => 0.8 + rng() * 0.4);
      // bulrush out to a metre and a half on the soft bottoms, and reed and grass at the edge
      if (sd > -16 && sd < 1)
        place(AQUATIC.reed, 4.5 * stand * rooting * (0.4 + 0.6 * shelt), (d) => (d > 0.5 ? 0 : rng() < 0.55 ? 1 : 0), (s, d) => s < 0.9 && d > -0.04 && d < 1.5, 0.07, () => 0.8 + rng() * 0.45);
      // pondweed and milfoil on the soft bed, in the weed beds
      if (sd < -2 && sd > -38 && depth > 0.4 && depth < 3.8)
        place(AQUATIC.weed, (0.8 + 7 * bed.weed) * rooting * (0.5 + 0.5 * shelt), () => Math.floor(rng() * 2), (s, d) => s < -1.5 && d > 0.35 && d < 3.8, 0, (d) => Math.min(0.45 + d * 0.45 * rng() + 0.25, d * 0.8));
    }
  }
  return { bins: [...bins.values()].map((b) => ({ rx: b.rx, rz: b.rz, kind: b.kind, variant: b.variant, items: new Float32Array(b.items) })), total };
}

// Ground cover per cell over the tile's local extent (core cells only). The first side² x 4 bytes, four per
// cell: grass cover 0..255 by ground class (none in water, on bare rock, trails and campsites; a sparse fifth
// under the forest and thinner still under a thick canopy, more in the glades; full on the meadows and the lawns;
// most of a burn; a fringe up from the shore whatever stands behind it), golden tint (burns and dry clearings),
// the ground class (what the footsteps and the water read), 0. After them, from COVER_SPLAT_AT, CELL_SPLAT bytes
// per cell: the terrain's own splat at the cell's centre (the ten material weights, the canopy shade, the sunny
// stand), which the worker fills from the terrain build (tile-worker.js, terrain-build.js cellSplat); the grass
// blends those, so a tuft takes the colour of the ground under it (groundcover.js). The four-byte part is laid
// out as before, so world.coverCell and the water's atlas read it unchanged.
export const COVER_SPLAT_AT = (side) => side * side * 4;
export function coverField(grid, i0, j0, n, shade, exclusions, site = null) {
  const side = grid.side;
  const cover = new Uint8Array(side * side * (4 + CELL_SPLAT));
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
      const cls = groundClass(grid, x, z, canopy, site);
      cover[k * 4 + 2] = cls;
      if (sd <= 2.6 || bare[k]) continue;
      const burn = burnAt(x, z), clearing = clearingAt(x, z);
      // the forest floor is duff, not lawn: a few tufts, fewer under a thick canopy, more where the woods
      // open into a glade; the meadows are grass, the burns mostly, and a band of grass and sedge runs up
      // from the water; bare rock grows nothing; the cleared ground at an outfitter's is kept as a lawn
      const rock = site ? Math.max(site.at(site.bare, x, z), site.at(site.cliff, x, z) * 1.3, site.at(site.talus, x, z) * 1.3) : rockAt(rockSlope(grid, x, z), sd, x, z);
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

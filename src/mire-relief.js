// The floor of the wetlands (the density round, 2026-11-01: "real ones are hummocky, wet and covered"). The 2 m LiDAR
// can't hold a bog's relief (hummocks a few metres across and a foot or so high), so the baked ground there is a
// billiard table. This lays the relief back on, from the NWI's class and the ground kind of each cell:
//   lawn    a bog's hummocks and hollows (the black spruce bog, the tamarack swamp, the leatherleaf mat, the runts): domes
//           over broad wet hollow lawns, the hollows flat-bottomed where the water stands
//   tussock a lumpier field of lower bumps (the sedge meadow, the alder thicket, the marsh's muck, nearly flat)
//   mounds  the black ash swamp's root mounds, a few metres across, with dips between that hold the spring's water
// Zero at every shore and brook, on the trails, the campsites and the outfitters' yards (props sit flat), and fading
// out over a cell at the wetland's edge. Pure and deterministic, worker-safe: the same in the two tiles that share a
// cell (the per-cell field reads only a cell and its corners, inside the halo).
//   reliefAt(grid, x, z)    metres to add to the ground (detail-build.js puts it on the 2 m lattice, so tiles.groundAt
//                           and everything detail.js re-seats stand on it)
//   mirePoolAt(grid, x, z)  0..1, water standing there by the regime and the date the tile is built for (a saturated
//                           bog only in its deepest hollows; a marsh in May in all its low ground)
//   mireK(grid, x, z)       0..1, how much relief the ground has there (0 off the wetlands)
//   mireAttr(grid, x, z, sd, out, fine)  the terrain's per-vertex aRelief (terrain.js): the shape as drawn, the pools, the
//                           swamp's floor
import { roadClearGap } from './road-grade.js'; // round 5: every road's clearing, by tile
import { noise2, smoothstep, clamp } from './rng.js';
import { landOf, KIND, wclass1, wetRegime, wetBeaver, standingWater, RG } from './land.js';
import { brookDist, CUT } from './brook-cut.js';
import { burnDate } from './burns.js';

export const STYLE = { lawn: 0, tussock: 1, mounds: 2 };
// [amplitude (m: the shape runs -1 .. 1 times this), style, swamp floor (dark moss, leaf litter, fern: 0..1)], by
// the NWI class (land.js WCLASS index) and, where no class is mapped, by the ground kind (land.js KIND)
const BY_CLASS = {
  1: [0.3, STYLE.mounds, 1],      // FO1 black ash swamp
  2: [0.32, STYLE.lawn, 0.3],     // FO2 tamarack swamp
  3: [0.38, STYLE.lawn, 0],       // FO4 black spruce bog
  4: [0.2, STYLE.lawn, 0.5],      // FO swamp forest
  5: [0.12, STYLE.tussock, 1],    // SS1 alder thicket
  6: [0.4, STYLE.lawn, 0],       // SS2 stunted tamarack
  7: [0.46, STYLE.lawn, 0],       // SS3 leatherleaf bog
  8: [0.4, STYLE.lawn, 0],       // SS4 stunted black spruce
  9: [0.12, STYLE.tussock, 0.8],  // SS shrub swamp
  10: [0.05, STYLE.tussock, 0],   // EM1 sedge and cattail: water and muck
  11: [0.03, STYLE.tussock, 0],   // EM2 wild rice
};
const BY_KIND = {
  [KIND.openBog]: [0.44, STYLE.lawn, 0], [KIND.coniferBog]: [0.34, STYLE.lawn, 0], [KIND.shrubSwamp]: [0.12, STYLE.tussock, 1],
  [KIND.marsh]: [0.05, STYLE.tussock, 0], [KIND.wetMeadow]: [0.15, STYLE.tussock, 0], [KIND.hardwoodSwamp]: [0.3, STYLE.mounds, 1],
  [KIND.water]: [0.04, STYLE.tussock, 0],
};
// the forest map's open kinds where nothing was surveyed (Ontario), as land.js OPEN_KIND
const OPEN_KIND = { 13: KIND.openBog, 14: KIND.wetMeadow, 15: KIND.shrubSwamp, 16: KIND.marsh, 17: KIND.wetMeadow };
// the fades: metres from the shore over which it grows in, past a trail's or a site's radius, past a brook's cut
export const FADE = { shore: [1.5, 9], clear: [0.4, 4], brook: [0, 3] };
// the hollows' floors: under FLOOR (in the shape's units) the ground falls only FLOOR_K as fast, so the water lies flat
const FLOOR = -0.55, FLOOR_K = 0.3;
// the water's line in the shape's units, by how much stands (land.js standingWater, 0 .. 1); a saturated bog's
// (no standing water) at SATURATED: pools only in the deepest hollows, a few in a hectare
const POOL = { dry: -0.72, wet: 0.15, saturated: -0.8, edge: 0.12 };

// ---- the cut-outs: the trails, the campsites and the yards (props.js exclusionsFor), binned --------------------------
let ex = null, bins = null;
const BIN = 16, bkey = (bx, bz) => bx * 65536 + bz;
export function setMireExclusions(e) {
  ex = e && e.length ? e : null; bins = null;
  if (!ex) return;
  bins = new Map();
  for (let k = 0; k < ex.length; k += 5) {
    const r = Math.abs(ex[k + 4]) + FADE.clear[1];
    const x0 = Math.min(ex[k], ex[k + 2]) - r, x1 = Math.max(ex[k], ex[k + 2]) + r, z0 = Math.min(ex[k + 1], ex[k + 3]) - r, z1 = Math.max(ex[k + 1], ex[k + 3]) + r;
    for (let bz = Math.floor(z0 / BIN); bz <= Math.floor(z1 / BIN); bz++) for (let bx = Math.floor(x0 / BIN); bx <= Math.floor(x1 / BIN); bx++) {
      const q = bkey(bx, bz), a = bins.get(q);
      if (a) a.push(k); else bins.set(q, [k]);
    }
  }
}
// metres from (x, z) to the edge of the nearest trail, site or yard (Infinity past its fade)
export function clearGap(x, z) {
  const rg = roadClearGap(x, z); // (round 5: the roads come by tile: road-grade.js)
  if (!bins) return rg;
  const a = bins.get(bkey(Math.floor(x / BIN), Math.floor(z / BIN)));
  if (!a) return rg;
  let g = rg;
  for (const k of a) {
    const ax = ex[k], az = ex[k + 1], dx = ex[k + 2] - ax, dz = ex[k + 3] - az, L2 = dx * dx + dz * dz || 1;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1);
    g = Math.min(g, Math.hypot(ax + dx * t - x, az + dz * t - z) - Math.abs(ex[k + 4]));
  }
  return g;
}
// 0 on a cleared line or site, 1 past its fade
function clearFade(x, z) {
  const rg = roadClearGap(x, z), f0 = rg < FADE.clear[1] ? smoothstep(FADE.clear[0], FADE.clear[1], rg) : 1; // (round 5)
  if (!bins || !f0) return f0;
  const a = bins.get(bkey(Math.floor(x / BIN), Math.floor(z / BIN)));
  if (!a) return f0;
  let f = f0;
  for (const k of a) {
    const ax = ex[k], az = ex[k + 1], dx = ex[k + 2] - ax, dz = ex[k + 3] - az, L2 = dx * dx + dz * dz || 1;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1), d = Math.hypot(ax + dx * t - x, az + dz * t - z) - Math.abs(ex[k + 4]);
    if (d < FADE.clear[1]) f = Math.min(f, smoothstep(FADE.clear[0], FADE.clear[1], d));
    if (!f) return 0;
  }
  return f;
}

// ---- the per-cell field: amplitude, style shares, swamp floor and the water's line, cached on the grid ---------------
// one cell's [amp, tussock, mounds, swamp floor, water line] from its bytes, into o; false off the wetlands
function cellOf(kd, ft, wc, wb, doy, o) {
  if (!kd) kd = OPEN_KIND[ft] || 0;
  const byK = BY_KIND[kd];
  if (!byK) return false;
  const byC = wc ? BY_CLASS[wclass1(wc)] : null;
  let a = byK[0], st = byK[1], sw = byK[2];
  if (byC) { a = Math.max(a, byC[0]); st = byC[1]; sw = byC[2]; }
  if (kd === KIND.wetMeadow) st = STYLE.tussock; // a beaver meadow's tussocks, whatever class the polygon has
  const rg = wetRegime(wb), sw2 = wb && rg !== RG.saturated ? standingWater(rg, wetBeaver(wb), doy) : -1;
  o[0] = a; o[1] = st === STYLE.tussock ? 1 : 0; o[2] = st === STYLE.mounds ? 1 : 0; o[3] = sw;
  o[4] = sw2 < 0 ? POOL.saturated : POOL.dry + (POOL.wet - POOL.dry) * sw2;
  return true;
}
const _c = [0, 0, 0, 0, 0];
function field(grid) {
  if (grid._mire !== undefined) return grid._mire;
  const L = landOf(grid);
  if (!L || !L.ground) return (grid._mire = null);
  const n = grid.side, N = n * n, doy = burnDate().doy;
  const A = [0, 1, 2, 3, 4].map(() => new Float32Array(N));
  A[4].fill(POOL.saturated);
  let any = false;
  for (let k = 0; k < N; k++) {
    if (!cellOf(L.ground[k], L.forest ? L.forest[k] : 0, L.wcls ? L.wcls[k] : 0, L.wet ? L.wet[k] : 0, doy, _c)) continue;
    for (let q = 0; q < 5; q++) A[q][k] = _c[q];
    any = true;
  }
  return (grid._mire = any ? A : null);
}
// The five values bilinear at (x, z) (cell centres carry them, as site.js at), into _s; from a tile's grid (its cached
// field) or from the World on the main thread (its chCell bytes, cell by cell)
const _s = { amp: 0, tus: 0, mnd: 0, swp: 0, lvl: 0 }, _v = new Float64Array(5);
function sample(grid, x, z) {
  const fx = (x - grid.originX) / grid.cell - 0.5, fz = (z - grid.originZ) / grid.cell - 0.5;
  const i = Math.floor(fx), j = Math.floor(fz), a = fx - i, b = fz - j;
  _v.fill(0);
  if (grid.side !== undefined && grid.local) {
    const F = field(grid);
    if (!F) return null;
    const k00 = grid.local(i, j), k10 = grid.local(i + 1, j), k01 = grid.local(i, j + 1), k11 = grid.local(i + 1, j + 1);
    for (let q = 0; q < 5; q++) { const f = F[q]; _v[q] = (f[k00] * (1 - a) + f[k10] * a) * (1 - b) + (f[k01] * (1 - a) + f[k11] * a) * b; }
  } else if (grid.chCell) {
    const doy = burnDate().doy;
    for (let c = 0; c < 4; c++) {
      const ci = i + (c & 1), cj = j + (c >> 1), w = (c & 1 ? a : 1 - a) * (c >> 1 ? b : 1 - b);
      if (!cellOf(grid.chCell('ground', ci, cj), grid.chCell('forest', ci, cj), grid.chCell('wcls', ci, cj), grid.chCell('wet', ci, cj), doy, _c)) { _c.fill(0); _c[4] = POOL.saturated; }
      for (let q = 0; q < 5; q++) _v[q] += w * _c[q];
    }
  } else return null;
  if (_v[0] < 0.002) return null;
  _s.amp = _v[0]; _s.tus = _v[1]; _s.mnd = _v[2]; _s.swp = _v[3]; _s.lvl = _v[4];
  return _s;
}

// ---- the shapes, -1 (a hollow) .. 1 (a hummock's top) ------------------------------------------------------------
// The lawn: domes about 5 m apart over a slower swell, the noise's lattice warped away; the hollows broader and
// flatter than the domes are high, as a bog's are. The 2 m lattice can't draw anything finer (the moss mounds and the
// sedge tussocks are instanced on it, and the shader's light ripples).
function lawn(x, z) {
  const wx = 1.4 * (noise2(x * 0.06, z * 0.06, 401) - 0.5), wz = 1.4 * (noise2(x * 0.06 + 7.3, z * 0.06 - 2.1, 402) - 0.5);
  const n = 0.68 * noise2(x * 0.2 + wx, z * 0.2 + wz, 403) + 0.32 * noise2(x * 0.075 - wz, z * 0.075 + wx, 404);
  const s = clamp((n - 0.5) * 3.4, -1, 1);
  return s > 0 ? s : 0.75 * s;
}
// the tussocks: lower, closer bumps (the drawn lattice's finest)
function tussock(x, z) {
  const wx = noise2(x * 0.09, z * 0.09, 405) - 0.5;
  const n = 0.7 * noise2(x * 0.3 + wx, z * 0.3 - wx, 406) + 0.3 * noise2(x * 0.11, z * 0.11, 407);
  return clamp((n - 0.5) * 3.2, -1, 1);
}
// the ash's root mounds: a mound 3–5 m across here and there, dips between
function mounds(x, z) {
  const wx = noise2(x * 0.07, z * 0.07, 408) - 0.5;
  const m = smoothstep(0.56, 0.82, noise2(x * 0.17 + wx, z * 0.17 - wx, 409));
  const dip = smoothstep(0.5, 0.25, noise2(x * 0.11 - wx, z * 0.11 + wx, 410));
  return m - 0.8 * dip;
}
function shapeOf(S, x, z) {
  let s = 0, w = 1 - S.tus - S.mnd;
  if (w > 0.01) s += w * lawn(x, z);
  if (S.tus > 0.01) s += S.tus * tussock(x, z);
  if (S.mnd > 0.01) s += S.mnd * mounds(x, z);
  return s;
}
// the drawn shape: the hollows' floors laid flat for the water
const floorOf = (s) => (s < FLOOR ? FLOOR + (s - FLOOR) * FLOOR_K : s);
// how much of the ground the relief reaches at (x, z) (sd: the shore distance there, if known)
function fadeAt(grid, x, z, sd) {
  if (sd === undefined) sd = grid.shoreAt(x, z);
  if (sd <= FADE.shore[0]) return 0;
  let f = smoothstep(FADE.shore[0], FADE.shore[1], sd);
  const b = brookDist(x, z);
  if (b < CUT.reach + FADE.brook[1]) f *= smoothstep(CUT.reach + FADE.brook[0], CUT.reach + FADE.brook[1], b);
  return f ? f * clearFade(x, z) : 0;
}

export function reliefAt(grid, x, z, sd) {
  const S = sample(grid, x, z);
  if (!S) return 0;
  const f = fadeAt(grid, x, z, sd);
  return f ? S.amp * f * floorOf(shapeOf(S, x, z)) : 0;
}
export function mireK(grid, x, z, sd) {
  const S = sample(grid, x, z);
  return S ? smoothstep(0, 0.12, S.amp) * fadeAt(grid, x, z, sd) : 0;
}
export function mirePoolAt(grid, x, z) {
  const S = sample(grid, x, z);
  if (!S) return 0;
  return smoothstep(S.lvl + 0.02, S.lvl - POOL.edge, shapeOf(S, x, z)) * clearFade(x, z);
}

// The wetland's ground cover (groundcover.js), per 10 m cell: its kind (COVER: the sedge and bluejoint of a marsh or a
// meadow, tall and unbroken; the bog's few low sedges and cottongrass on the sphagnum; the ferns under the alder and the
// ash) and how thick, as one byte, kind * 64 + thickness * 63 (0: none of these, the grass as before). It rides in the
// cover map's spare splat byte (terrain-build.js buildTerrainChunk). Off the trails, the sites and the yards with their
// pad (as placement.js coverField keeps the grass off them), and off the waterline.
export const COVER = { sedge: 1, bog: 2, fern: 3 };
const COVER_OF_CLASS = { 1: [3, 0.6], 2: [2, 0.55], 3: [2, 0.45], 4: [3, 0.5], 5: [3, 0.5], 6: [2, 0.6], 7: [2, 0.6], 8: [2, 0.55], 9: [3, 0.55], 10: [1, 1], 11: [1, 0.75] };
const COVER_OF_KIND = { [KIND.openBog]: [2, 0.6], [KIND.coniferBog]: [2, 0.45], [KIND.shrubSwamp]: [3, 0.6], [KIND.marsh]: [1, 1], [KIND.wetMeadow]: [1, 0.95], [KIND.hardwoodSwamp]: [3, 0.75], [KIND.water]: [1, 0.6] };
export function coverByte(grid, i, j) {
  const L = landOf(grid);
  if (!L || !L.ground || grid.sdCell(i, j) < 3) return 0;
  const k = grid.local(i, j);
  let kd = L.ground[k];
  if (!kd && L.forest) kd = OPEN_KIND[L.forest[k]] || 0;
  const byK = COVER_OF_KIND[kd];
  if (!byK) return 0;
  const byC = L.wcls ? COVER_OF_CLASS[wclass1(L.wcls[k])] : null, c = kd === KIND.wetMeadow || kd === KIND.marsh ? byK : byC || byK;
  if (clearGap(grid.cellX(i), grid.cellZ(j)) < 3.5) return 0;
  return c[0] * 64 + Math.round(c[1] * 63);
}

// The pools' share of the ground for a water line `lvl`, from the lawn's own spread (sampled once): what a coarse
// vertex (5 m, 10 m) that can't draw the hollows carries instead, so the shader scatters pools in that share.
let CDF = null;
function poolShare(lvl) {
  if (!CDF) {
    const v = [];
    for (let k = 0; k < 4096; k++) v.push(lawn((k % 64) * 3.7 + 1000, Math.floor(k / 64) * 3.7 - 2000));
    CDF = Float32Array.from(v.sort((a, b) => a - b));
  }
  let lo = 0, hi = CDF.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (CDF[m] < lvl) lo = m + 1; else hi = m; }
  return lo / CDF.length;
}
// The vertex attribute (terrain.js aRelief), into out[0..3]: x the shape as drawn (-1 .. 1, times the fade: the hummock
// tops paler and redder, the hollows darker), y the pools (0 = no relief here, the old painted pools; over 0.2 a mire
// floor with 0.2 + 0.8 x its water: the pool itself on a fine vertex, the pools' share on a coarse one), z the swamp's
// floor, w 0. `fine`: the vertex is on the 2 m lattice (else it can't draw the hollows).
// Everything the 2 m lattice wants at one sample, each part worked out once (detail-build.js chunkGround): returns the
// relief (m) and fills out[0..3] as mireAttr(..., fine = true) does
export function mireSample(grid, x, z, sd, out) {
  out[0] = out[1] = out[2] = out[3] = 0;
  if (sd < 0) return 0;
  const S = sample(grid, x, z);
  if (!S) return 0;
  const pres = smoothstep(0.004, 0.03, S.amp), s = shapeOf(S, x, z), fl = floorOf(s);
  let cf = 1, f = 0;
  if (sd > FADE.shore[0]) {
    cf = clearFade(x, z);
    f = smoothstep(FADE.shore[0], FADE.shore[1], sd) * cf;
    if (f) { const b = brookDist(x, z); if (b < CUT.reach + FADE.brook[1]) f *= smoothstep(CUT.reach + FADE.brook[0], CUT.reach + FADE.brook[1], b); }
  } else cf = clearFade(x, z);
  out[0] = fl * f * smoothstep(0.02, 0.12, S.amp);
  out[1] = pres * (0.2 + 0.8 * smoothstep(S.lvl + 0.02, S.lvl - POOL.edge, s) * cf);
  out[2] = S.swp * pres;
  return S.amp * f * fl;
}
export function mireAttr(grid, x, z, sd, out, fine) {
  out[0] = out[1] = out[2] = out[3] = 0;
  if (sd < 0) return out;
  const S = sample(grid, x, z);
  if (!S) return out;
  const pres = smoothstep(0.004, 0.03, S.amp), cf = clearFade(x, z);
  out[2] = S.swp * pres;
  let pool;
  if (fine) {
    const s = shapeOf(S, x, z);
    out[0] = floorOf(s) * fadeAt(grid, x, z, sd) * smoothstep(0.02, 0.12, S.amp);
    pool = smoothstep(S.lvl + 0.02, S.lvl - POOL.edge, s);
  } else pool = poolShare(S.lvl);
  out[1] = pres * (0.2 + 0.8 * pool * cf);
  return out;
}

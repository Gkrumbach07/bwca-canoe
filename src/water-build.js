// The far water mesh for one tile: 10 m quads wherever a cell corner touches water, carrying the shore
// distance (so the shader can damp the swell and draw the waterline) and the depth to the bed (so the
// colour deepens and the shallows stay clear). Positions relative to the tile corner.
import { fbm } from './rng.js'; // d2 water (shoalBeds)

// Wetlands round 2: a seasonal creek (index.json lake record `seasonal`) stands lower from late July through September,
// LOW.drop metres at its lowest (about 1.3 ft), eased in and out. Only the water moves: the terrain keeps the bank it
// was shaped to (terrain-build.js shoreShape reads the tile's own level), so the mud of the bank shows over the water,
// and the water's shore distance moves out with it (by drop / LOW.slope, the band's slope) so the waterline draws where
// the lower water meets that bank. So that a canoe still floats down the middle, a seasonal creek's channel is cut
// deeper the year round (its shore distance under water times LOW.deepen: the bank shaping reads it). Both ease off
// over LOW.reach metres from other water (the lake or river it runs into stays as it is, so no step at the mouth).
// The worker writes the drop per cell for the date it built the tile on (lowCreeks: a plane beside the tile's own,
// world.js levelCell and the water patch read it); a tile built again later takes the new date.
export const LOW = { drop: 0.42, slope: 0.12, deepen: 1.5, reach: 50 };
const ease = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// how low a seasonal creek runs (0 normal .. 1 at its lowest) by the day of the year
export function lowWater(doy) { return ease(198, 214, doy) * (1 - ease(266, 282, doy)); }

// The season round (2026-11-01): every water's level through the year, from agency data. The bake's levels are the
// spring's: the MnTOPO LiDAR they come from was flown 17 April to 17 May 2021, at the melt's high water. So the water
// only ever drops from them, and the bank the terrain was shaped to shows as a wet band and a bare lip at low water.
// - Lakes: the MN DNR's lake-level readings (LakeFinder water_levels_export, data-cache/lakefinder/levels), each year
//   against its own mean, averaged by half month: high in mid-May, falling through the summer, lowest in mid-September,
//   a little back up with the October rains (LAKE_CURVE, 0 the spring high .. 1 the low). How far it falls (LAKE_FALL,
//   m) by the lake's place in the water: the dammed Kawishiwi chain (Farm 0.5 ft, Garden 0.2) and the chain lakes
//   (Burntside 0.75, Vermilion 0.9, Shagawa 1.1) least, the small headwater lakes (Hungry Jack, Bearskin, Caribou
//   0.6-0.8) and landlocked ones about the same, the border lakes on their rock-ledge outlets most (Sea Gull 1.8 ft,
//   Gunflint 1.6, Saganaga 1.5). Lake Superior doesn't move. Rivers and creeks fall with the chain lakes.
// - The Namakan chain (Namakan, Sand Point, Crane, Kabetogama, Little Vermilion) is a reservoir held by the dams at
//   Kettle Falls on the IJC's rule curve: the International Joint Commission, Official Compilation of the Order for
//   regulation of levels of Rainy and Namakan Lakes, 13 September 2018 (Docket 50), paragraph 1(a), "Namakan Lake
//   Elevations" (NAMAKAN_BAND, m above sea level). The dam owners aim for the middle of the band: drawn down over the
//   winter, lowest from the end of March to ice-out, filled through May, full from mid-June, eased down from
//   September. The middle stands 1.35 m under its summer full at its lowest; here every point is scaled by 0.6 / 1.35
//   (held to 0.6 m, 2 ft) so the docks and the landing at Crane Lake still meet the water at ice-out. Only the
//   reservoir's own water (level 339.5-340.6 m): a pond that shares a name keeps its own level.
// - Flowages (the NWI's C, A and F regimes under most of a pond, beaver-made or not: the bake's lake `regime`): full
//   from ice-out into early July, then drawn down: by August a seasonally flooded one (C) is mud flats with pools and
//   the creek's channel (FLOW.c m down), a semipermanent one (F) half that; the October rains bring some back.
// WK: the kind of each water (waterKinds), | WK.creek on rivers and creeks (they follow the lake they meet).
export const WK = { still: 0, seasonal: 1, chain: 2, head: 3, land: 4, border: 5, namakan: 6, flowC: 7, flowF: 8, creek: 16 };
const LAKE_CURVE = [[1, 0.92], [95, 0.97], [108, 0.5], [122, 0.12], [136, 0], [152, 0.06], [167, 0.22], [182, 0.4], [197, 0.56], [213, 0.72], [228, 0.88], [244, 0.97], [259, 1], [274, 0.97], [289, 0.88], [305, 0.86], [335, 0.88], [366, 0.92]];
export const LAKE_FALL = { [WK.chain]: 0.2, [WK.head]: 0.24, [WK.land]: 0.2, [WK.border]: 0.48, [WK.seasonal]: 0.2 };
// [doy, minimum, maximum] (m), the Order's dates (1 Jan, 15 Mar, 31 Mar, 15 Apr, 22 Apr, 31 May, 8 Jun, 15 Jun,
// 30 Sep, 15 Nov), each bound filled in on the other's dates by the straight line between its own, as the Order says
const NAMAKAN_BAND = [[1, 339.66, 339.93], [74, 339.56, 339.9], [90, 338.95, 339.948], [105, 338.95, 339.99], [112, 338.95, 340.133],
  [151, 340.47, 340.93], [159, 340.582, 340.94], [166, 340.68, 340.919], [273, 340.4, 340.6], [319, 339.73, 339.98], [366, 339.66, 339.93]];
const NAMAKAN_FULL = 340.8, NAMAKAN_CAP = 0.6 / 1.35; // the summer's middle of the band; the drawdown held to 0.6 m
const NAMAKAN = NAMAKAN_BAND.map(([d, lo, hi]) => [d, Math.max(0, NAMAKAN_FULL - (lo + hi) / 2) * NAMAKAN_CAP]);
export const FLOW = { c: 0.95, f: 0.45, bedC: 0.75, bedF: 1.15, chan: 1.7, chanW: 7 };
const BORDER = /^(Sea Gull|Saganaga|Gunflint|Northern Light|Magnetic|Granite|Clove|Gneiss) Lake$/;
const NAMAKAN_LAKES = /^(Namakan|Sand Point|Crane|Kabetogama|Little Vermilion) Lake$/;
const curveAt = (pts, d) => {
  d = ((d - 1) % 365 + 365) % 365 + 1;
  for (let i = 1; i < pts.length; i++) if (d <= pts[i][0]) { const [a, va] = pts[i - 1], [b, vb] = pts[i]; return va + (vb - va) * ease(a, b, d); }
  return pts[pts.length - 1][1];
};
// a flowage's water (0 full .. 1 drawn down): full into early July, down by August, some back with the October rains
export function flowageLow(doy) { return ease(186, 214, doy) * (1 - 0.45 * ease(278, 300, doy)); }
// how far a water of kind k stands under its baked (spring) level on day doy, m
export function waterDrop(k, doy) {
  const kind = k & 15;
  if (kind === WK.still) return 0;
  if (kind === WK.namakan) return curveAt(NAMAKAN, doy);
  if (kind === WK.flowC || kind === WK.flowF) return Math.max(curveAt(LAKE_CURVE, doy) * LAKE_FALL[WK.land], flowageLow(doy) * (kind === WK.flowC ? FLOW.c : FLOW.f));
  const lake = curveAt(LAKE_CURVE, doy) * (LAKE_FALL[kind] || 0.2);
  return kind === WK.seasonal ? Math.max(lake, lowWater(doy) * LOW.drop) : lake;
}
export const isFlowage = (k) => (k & 15) === WK.flowC || (k & 15) === WK.flowF;
// each lake id's kind from index.json's records (Uint8Array by id)
export function waterKinds(lakes) {
  const out = new Uint8Array(lakes.length + 1);
  for (const l of lakes) {
    if (!l) continue;
    const name = l.displayName || l.name || '';
    let k;
    if (l.creek || l.river) k = (l.seasonal ? WK.seasonal : WK.chain) | WK.creek;
    else if (name === 'Lake Superior') k = WK.still;
    else if (NAMAKAN_LAKES.test(name) && l.level > 339.5 && l.level < 340.6) k = WK.namakan;
    else if (l.regime === 'C') k = WK.flowC;
    else if (l.regime === 'F') k = WK.flowF;
    else if (BORDER.test(name)) k = WK.border;
    else k = l.flow === 'headwater' ? WK.head : l.flow === 'chain' ? WK.chain : WK.land;
    out[l.id] = k;
  }
  return out;
}
// One tile's buffer ([height][lake][sdist][level], side^2 cells each; cell metres): the seasonal creeks' channels cut
// deeper in place, and how far each water cell stands under its baked level on day `doy`, in centimetres (Uint8Array),
// or null where the tile holds no water. kinds: waterKinds (a Set of seasonal creek ids is still taken: the old way).
// Where two waters of different drops meet, the creek follows the lake it runs into over LOW.reach metres (two lakes,
// or two creeks, meet halfway), so there is no step at a mouth.
export function lowCreeks(buf, side, cell, kinds, doy) {
  if (!kinds) return null;
  if (kinds instanceof Set) { const a = new Uint8Array(65536); for (const id of kinds) a[id] = WK.seasonal | WK.creek; kinds = a; }
  const n = side * side, lake = new Uint16Array(buf, n * 2, n), sd = new Int16Array(buf, n * 4, n);
  const R = Math.max(1, Math.round(LOW.reach / cell));
  const dropOf = new Map();
  const D = (id) => { let v = dropOf.get(id); if (v === undefined) dropOf.set(id, (v = id < kinds.length ? waterDrop(kinds[id], doy) : 0)); return v; };
  const rank = (id) => (id < kinds.length && kinds[id] & WK.creek ? 1 : 2);
  const own = new Float32Array(n);
  let any = false, seasonal = false;
  for (let m = 0; m < n; m++) {
    const id = lake[m];
    if (!id) continue;
    any = true; own[m] = D(id);
    if (id < kinds.length && (kinds[id] & 15) === WK.seasonal) seasonal = true;
  }
  if (!any) return null;
  // where two waters meet: each cell within R of the meeting eased toward the level they meet at
  const near = new Float32Array(n).fill(Infinity), toward = new Float32Array(n);
  const stamp = (ci, cj, cid, meet) => {
    for (let dy = -R; dy <= R; dy++) {
      const y = cj + dy;
      if (y < 0 || y >= side) continue;
      for (let dx = -R; dx <= R; dx++) {
        const x = ci + dx;
        if (x < 0 || x >= side) continue;
        const q = y * side + x;
        if (lake[q] !== cid) continue;
        const d = Math.hypot(dx, dy);
        if (d < near[q]) { near[q] = d; toward[q] = meet; }
      }
    }
  };
  for (let m = 0; m < n; m++) {
    const id = lake[m];
    if (!id) continue;
    const i = m % side, j = (m - i) / side;
    for (let s = 0; s < 2; s++) {
      const ii = i + (s ? 0 : 1), jj = j + (s ? 1 : 0);
      if (ii >= side || jj >= side) continue;
      const o = lake[jj * side + ii];
      if (!o || o === id) continue;
      const a = D(id), b = D(o);
      if (Math.abs(a - b) < 0.005) continue;
      const ra = rank(id), rb = rank(o), meet = ra > rb ? a : rb > ra ? b : (a + b) / 2;
      if (ra <= rb) stamp(i, j, id, meet); // (the lower-ranked side eases; both when equal)
      if (rb <= ra) stamp(ii, jj, o, meet);
    }
  }
  const out = new Uint8Array(n);
  let wet = false;
  for (let m = 0; m < n; m++) {
    if (!lake[m]) continue;
    let v = own[m];
    if (near[m] !== Infinity) v = toward[m] + (v - toward[m]) * ease(0, R, near[m]);
    out[m] = Math.min(255, Math.round(v * 100));
    if (out[m]) wet = true;
  }
  // the seasonal creeks' channels cut deeper, eased off toward other water (as before)
  if (seasonal) for (let m = 0; m < n; m++) {
    const id = lake[m];
    if (!id || id >= kinds.length || (kinds[id] & 15) !== WK.seasonal || sd[m] >= 0) continue;
    const i = m % side, j = (m - i) / side;
    let best = R * R + 1;
    for (let dj = -R; dj <= R; dj++) {
      const jj = j + dj;
      if (jj < 0 || jj >= side) continue;
      for (let di = -R; di <= R; di++) {
        const ii = i + di, d = di * di + dj * dj;
        if (ii < 0 || ii >= side || d >= best) continue;
        const o = lake[jj * side + ii];
        if (o && o !== id && (o >= kinds.length || (kinds[o] & 15) !== WK.seasonal)) best = d;
      }
    }
    sd[m] = Math.round(sd[m] * (1 + (LOW.deepen - 1) * ease(0.5, R, Math.sqrt(best))));
  }
  return wet ? out : null;
}
// The season round: a flowage's bed is shallow (the bake's ramp off the shore made a beaver pond metres deep): capped at
// FLOW.bedC (C) or FLOW.bedF (F) under its spring level, a little more or less by a slow noise, so the late-summer
// drawdown bares most of it to mud with pools left in the hollows; along the creek's line through it (creeks.json
// `chans`, setFlowChannels) a channel FLOW.chan deep keeps water. Runs in the worker on the fine tile's own arrays
// after shoalBeds (so the main thread gets the same bed). Returns the cells changed.
let CHANS = null; // Float32Array of segments x0, z0, x1, z1 (world m)
export function setFlowChannels(segs) { CHANS = segs && segs.length ? segs : null; }
export function flowageBeds(grid, kinds) {
  if (!kinds) return 0;
  const S = grid.side, N = S * S, h = grid.h, lake = grid.lake, lvl = grid.lvl;
  let any = false;
  for (let m = 0; m < N && !any; m++) { const id = lake[m]; if (id && id < kinds.length && isFlowage(kinds[id])) any = true; }
  if (!any) return 0;
  // the channel segments near this tile
  const x0 = grid.cellX(grid.i0) - 20, z0 = grid.cellZ(grid.j0) - 20, x1 = grid.cellX(grid.i0 + S) + 20, z1 = grid.cellZ(grid.j0 + S) + 20, segs = [];
  if (CHANS) for (let s = 0; s < CHANS.length; s += 4) {
    const ax = CHANS[s], az = CHANS[s + 1], bx = CHANS[s + 2], bz = CHANS[s + 3];
    if (Math.max(ax, bx) < x0 || Math.min(ax, bx) > x1 || Math.max(az, bz) < z0 || Math.min(az, bz) > z1) continue;
    segs.push(ax, az, bx, bz);
  }
  const chanD = (x, z) => {
    let best = Infinity;
    for (let s = 0; s < segs.length; s += 4) {
      const ax = segs[s], az = segs[s + 1], dx = segs[s + 2] - ax, dz = segs[s + 3] - az, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L2)), ex = ax + dx * t - x, ez = az + dz * t - z;
      best = Math.min(best, ex * ex + ez * ez);
    }
    return Math.sqrt(best);
  };
  let changed = 0;
  for (let m = 0; m < N; m++) {
    const id = lake[m];
    if (!id || id >= kinds.length || !isFlowage(kinds[id])) continue;
    const li = m % S, lj = (m - li) / S, x = grid.cellX(grid.i0 + li), z = grid.cellZ(grid.j0 + lj);
    let cap = ((kinds[id] & 15) === WK.flowC ? FLOW.bedC : FLOW.bedF) * (0.6 + 0.8 * fbm(x * 0.045 + 7, z * 0.045 - 3, 2, 977));
    if (segs.length) { const t = ease(FLOW.chanW * 0.5, FLOW.chanW + grid.cell, chanD(x, z)); cap = Math.max(cap, FLOW.chan * (1 - t) + cap * t); }
    const L = lvl[m] / 10, depth = L - h[m] / 10;
    if (depth > cap) { h[m] = Math.round((L - cap) * 10); changed++; }
  }
  return changed;
}

// d2 water: a cell's own Secchi depth (m) and CDOM (m^-1) where a v4 tile carries them (the two byte
// channels over the tile's side, lake-colour's encoding: grid.ch), else its lake's (grid.cdomById, the worker's; CDOM 0 on v3)
export function cellColour(grid, i, j, id, out) {
  const c = grid.ch;
  let s = 0, d = 0;
  if (c && c.secchi) { const m = grid.local(i, j); s = c.secchi[m] * 0.1; d = c.cdom[m] * 0.05; }
  out[0] = s > 0 ? s : grid.clarityOf(id);
  out[1] = d > 0 ? d : grid.cdomById ? grid.cdomById[id] || 0 : 0;
  return out;
}
const _col = [0, 0];

export function buildWaterChunk(grid, i0, j0, n, originX, originZ) {
  const w = n + 1;
  const map = new Int32Array(w * w).fill(-1);
  const pos = [], shore = [], depth = [], clarity = [], cdom = [], idx = [];
  // a land corner takes the lowest level of the water round it (holes pass: it took the highest, so beside a step, a falls
  // or a creek against a perched pond, the low water's sheet climbed to the high water's level over its bank and hung
  // there in the air; the lowest never stands over the bank the terrain shapes to the water, it runs in under it). On
  // level water it is the same level.
  const low = grid.low || null; // wetlands round 2: a seasonal creek's water this date (lowCreeks)
  const lowAt = (i, j) => (low ? low[grid.local(i, j)] * 0.01 : 0);
  const lvlOf = (i, j) => grid.levelCell(i, j) - lowAt(i, j);
  const vertexLevel = (i, j) => {
    if (grid.lakeCell(i, j)) return lvlOf(i, j);
    let best = Infinity;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (grid.lakeCell(i + di, j + dj)) best = Math.min(best, lvlOf(i + di, j + dj));
    return best;
  };
  const vid = (i, j) => {
    const m = (j - j0) * w + (i - i0);
    if (map[m] < 0) {
      map[m] = pos.length / 3;
      const lv = vertexLevel(i, j);
      pos.push(grid.cellX(i) - originX, lv, grid.cellZ(j) - originZ);
      shore.push(grid.sdCell(i, j) + lowAt(i, j) / LOW.slope); // (the low creek's waterline moved out)
      depth.push(Math.max(0, lv - grid.hCell(i, j)));
      // the clarity of the water at this corner: its own cell's lake, else the deepest-set neighbour's (d2 water: and
      // its colour, the cell's own where the tile has it)
      let cid = grid.lakeCell(i, j), ci = i, cj = j;
      if (!cid) for (let dj = -1; dj <= 1 && !cid; dj++) for (let di = -1; di <= 1 && !cid; di++) { cid = grid.lakeCell(i + di, j + dj); ci = i + di; cj = j + dj; }
      cellColour(grid, ci, cj, cid, _col);
      clarity.push(_col[0]); cdom.push(_col[1]);
    }
    return map[m];
  };
  for (let j = j0; j < j0 + n; j++) for (let i = i0; i < i0 + n; i++) {
    if (!(grid.lakeCell(i, j) || grid.lakeCell(i + 1, j) || grid.lakeCell(i, j + 1) || grid.lakeCell(i + 1, j + 1))) continue;
    const a = vid(i, j), b = vid(i + 1, j), c = vid(i, j + 1), d = vid(i + 1, j + 1);
    if (((i + j) & 1) === 0) idx.push(a, c, b, b, c, d); else idx.push(a, c, d, a, d, b);
  }
  if (!idx.length) return null;
  return { pos: new Float32Array(pos), shore: new Float32Array(shore), depth: new Float32Array(depth), clarity: new Float32Array(clarity), cdom: new Float32Array(cdom), idx: new Uint32Array(idx) };
}

// d2 water: the water over a mapped bed is shallow. The NWI's in-lake emergent bed (ground kind 8: wild rice, bulrush)
// and its aquatic bed (kind 9: lilies, pondweed) are where the bottom comes up within reach of the light, but most lakes
// have no contour map, and their bed is the bake's ramp off the shore (or d1 lakes' bowl), metres deep where a rice bay
// is a metre. So over a mapped bed the bed comes up to SHOAL.emergent (kind 8) or SHOAL.bed (kind 9) below the surface,
// a little more or less by a slow noise, and eases back down to the old bed over SHOAL.reach cells round it, SHOAL.slope
// metres a cell; never deeper than it was. reach stays inside the tile's halo, so neighbouring tiles agree at their seam.
// Runs in the worker on the fine tile's own arrays (grid.h is a view of the tile buffer: the main thread gets the same
// bed), after d1 lakes' bowl. Returns the cells raised.
export const SHOAL = { emergent: 1.15, bed: 2.3, reach: 5, slope: 1.0 };
export function shoalBeds(grid) {
  const g = grid.ch && grid.ch.ground;
  if (!g) return 0;
  const S = grid.side, N = S * S, h = grid.h, lake = grid.lake, lvl = grid.lvl, R = SHOAL.reach;
  let cap = null;
  for (let m = 0; m < N; m++) {
    const k = g[m];
    if ((k !== 8 && k !== 9) || !lake[m]) continue;
    if (!cap) cap = new Float32Array(N).fill(Infinity);
    const li = m % S, lj = (m - li) / S;
    const x = grid.cellX(grid.i0 + li), z = grid.cellZ(grid.j0 + lj);
    const c = (k === 8 ? SHOAL.emergent : SHOAL.bed) * (0.75 + 0.5 * fbm(x * 0.031 + 3, z * 0.031, 2, 181));
    for (let dj = -R; dj <= R; dj++) {
      const j = lj + dj;
      if (j < 0 || j >= S) continue;
      for (let di = -R; di <= R; di++) {
        const i = li + di;
        if (i < 0 || i >= S) continue;
        const d = Math.hypot(di, dj);
        if (d > R + 0.01) continue;
        const v = c + d * SHOAL.slope, q = j * S + i;
        if (v < cap[q]) cap[q] = v;
      }
    }
  }
  if (!cap) return 0;
  let raised = 0;
  for (let m = 0; m < N; m++) {
    if (!lake[m] || cap[m] === Infinity) continue;
    const L = lvl[m] / 10, depth = L - h[m] / 10;
    if (depth > cap[m]) { h[m] = Math.round((L - cap[m]) * 10); raised++; }
  }
  return raised;
}

// The far water mesh for one tile: 10 m quads wherever a cell corner touches water, carrying the shore
// distance (so the shader can damp the swell and draw the waterline) and the depth to the bed (so the
// colour deepens and the shallows stay clear). Positions relative to the tile corner.
import { fbm } from './rng.js'; // d2 water (shoalBeds)

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
  const vertexLevel = (i, j) => {
    if (grid.lakeCell(i, j)) return grid.levelCell(i, j);
    let best = Infinity;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (grid.lakeCell(i + di, j + dj)) best = Math.min(best, grid.levelCell(i + di, j + dj));
    return best;
  };
  const vid = (i, j) => {
    const m = (j - j0) * w + (i - i0);
    if (map[m] < 0) {
      map[m] = pos.length / 3;
      const lv = vertexLevel(i, j);
      pos.push(grid.cellX(i) - originX, lv, grid.cellZ(j) - originZ);
      shore.push(grid.sdCell(i, j));
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

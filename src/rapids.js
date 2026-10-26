// d1 rapids: the real falls and rapids, and the rocks that break the surface of the lakes (the owner, 2026-10-26, real
// data "for everything": "i honestly would like to do all of this"). src/rapids.json (scripts/rapids.mjs) holds, from
// USGS NHD for Minnesota with the names from OpenStreetMap, USGS GNIS and Geographic Names Ontario:
//   white  each falls and rapids once: kind ('falls' | 'rapids'), name (or null), its middle (x, z: world metres), the
//          line across the river from shore to shore (a, b), the way the water runs (dir: radians, atan2(dz, dx)), its
//          drop (m: a falls's one step; a rapids's fall over its run), the lakes above and below (up, down: the
//          release's lake ids) and, as they apply: run (a rapids's run, from and to, along the flow from the middle),
//          cascade (a falls of more than 10 m: the rest of its fall goes down below it), flat (the game's water is level
//          there: broken water only), hidden (a name where the game has no river: nothing drawn), src.
//   rows   the river levels made over so each drop falls where it really is: [j, i0, level0, change0, change1, ...]
//          (dm), a run of cells along grid row j from column i0, applied with the bed (patchTile).
//   rocks  NHD's rocks above the water: half-metre integers, delta-coded (x0, z0, x1 - x0, z1 - z0, ...).
// Pure (no three.js): the tile worker takes the levels and the rocks (patchTile, lakeRockBins); the main thread the rest
// (whitewater.js draws the drops, audio-beds.js hears them, main.js's `// d1 rapids:` block wires them).
import TABLE from './rapids.json';
import { hash2 } from './rng.js';
import { SPECIES, ROCK_KIND, ROCK_FOOT, seatRock, BIN_GROUPS, ROCK_STRIDE, REGION } from './placement.js';
import { meshHeightAt } from './terrain-build.js';

// ---- the drops ------------------------------------------------------------------------------------------------
const mapWhite = (list) => list.map((w, id) => {
  const ux = Math.cos(w.dir || 0), uz = Math.sin(w.dir || 0);
  const half = w.a ? Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) / 2 : 0;
  return { ...w, id, ux, uz, half, drop: w.drop || 0, flat: !!w.flat, hidden: !!w.hidden };
});
export let WHITE = mapWhite(TABLE.white);
// d2 bake: a v4 release has every drop baked into its own levels (scripts/rapids-bake.mjs) and its own list of drops
// (TABLE.v4: its lake ids, Quetico's drops on the rivers it now has). useV4() swaps that list in and lets go of the
// rows, which were made over data-v3's levels; world.js calls it as a v4 index loads, the tile worker on its init.
let ROW_LIST = TABLE.rows || [];
export function useV4() {
  if (TABLE.v4 && TABLE.v4.white) WHITE = mapWhite(TABLE.v4.white);
  ROW_LIST = (TABLE.v4 && TABLE.v4.rows) || [];
  ROWS = null;
}
// the list the map draws and the place note reads (hud.mapPlaces, d1 names): { kind, name, x, z, a, b, drop }
export function whiteWater() {
  return WHITE.map((w) => ({ kind: w.kind, name: w.name, x: w.x, z: w.z, ...(w.a ? { a: w.a, b: w.b } : {}), drop: w.drop }));
}
// the drops within r of (x, z), nearest first: [{ w, d }]
export function whiteNear(x, z, r) {
  const out = [];
  for (const w of WHITE) { const d = Math.hypot(w.x - x, w.z - z); if (d < r) out.push({ w, d }); }
  return out.sort((p, q) => p.d - q.d);
}

// ---- the lake plants kept off the white water (the tile worker) ---------------------------------------------------
// No pad, reed or rice where the water falls or boils: round each drop that is drawn (not a level one, not a name
// alone) a box along the flow, from `above` m over its line (a rapids: over its run) to `below` m under it, as wide as
// the water and `side` m more. Bins of 5 floats (x, y, z from the tile's corner, yaw, scale), filtered in place.
export const CLEAR = { above: 18, below: 55, side: 6 };
export function clearPlants(bins, originX, originZ) {
  if (!bins || !bins.length) return 0;
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const b of bins) for (let o = 0; o < b.items.length; o += 5) { const x = b.items[o] + originX, z = b.items[o + 2] + originZ; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  const R = CLEAR.below + 200;
  const drops = WHITE.filter((w) => !w.hidden && !w.flat && w.x > x0 - R && w.x < x1 + R && w.z > z0 - R && w.z < z1 + R);
  if (!drops.length) return 0;
  let gone = 0;
  for (const b of bins) {
    const keep = [];
    for (let o = 0; o < b.items.length; o += 5) {
      const x = b.items[o] + originX, z = b.items[o + 2] + originZ;
      let hit = false;
      for (const w of drops) {
        const dx = x - w.x, dz = z - w.z, s = dx * w.ux + dz * w.uz, u = Math.abs(-dx * w.uz + dz * w.ux);
        const run = w.run || [0, 0];
        if (s > run[0] - CLEAR.above && s < run[1] + CLEAR.below + (w.cascade ? Math.min(40, w.cascade / 0.3) : 0) && u < w.half + CLEAR.side) { hit = true; break; }
      }
      if (hit) gone++; else for (let k = 0; k < 5; k++) keep.push(b.items[o + k]);
    }
    if (keep.length !== b.items.length) b.items = new Float32Array(keep);
  }
  return gone;
}

// ---- the levels made over (the tile worker) ---------------------------------------------------------------------
// rows by grid row j
let ROWS = null;
const rowsByJ = () => {
  if (ROWS) return ROWS;
  ROWS = new Map();
  for (const r of ROW_LIST) { let a = ROWS.get(r[0]); if (!a) ROWS.set(r[0], (a = [])); a.push(r); }
  return ROWS;
};
// The rocks' shoals: a rock above the water stands on a shoal, and the bed the bake made is often metres down there
// (the synthetic bowl, the contours between soundings), so each rock's water cells within `reach` m are raised to `top`
// under the surface at the rock and `slope` deeper a metre out (never lowered).
export const SHOAL = { top: 0.55, slope: 0.16, reach: 14 };
// Patch one fine tile's buffer in place ([height Int16][lake Uint16][shore Int16][level Int16], side^2 cells, dm), after
// the graded levels (water-levels.js gradeTile): the drops' rows (a run whose first cell holds another level than the
// table's is another bake's water and is left alone; the runs are cut so each lies wholly inside or outside a tile, so
// every tile holding a cell decides it alike), then the rocks' shoals. grid: the index's grid. Returns the cells changed.
export function patchTile(buf, tx, ty, grid) {
  const side = grid.tile + 2 * grid.halo, n = side * side;
  if (buf.byteLength < n * 8) return 0;
  const h = new Int16Array(buf, 0, n), lake = new Uint16Array(buf, n * 2, n), lvl = new Int16Array(buf, n * 6, n);
  const gi0 = tx * grid.tile - grid.halo, gj0 = ty * grid.tile - grid.halo;
  const rows = rowsByJ();
  let changed = 0;
  for (let lj = 0; lj < side; lj++) {
    const list = rows.get(gj0 + lj);
    if (!list) continue;
    for (const r of list) {
      const li = r[1] - gi0, len = r.length - 3;
      if (li < 0 || li + len > side) continue;
      const m0 = lj * side + li;
      if (lvl[m0] !== r[2] || !lake[m0]) continue;
      for (let k = 0; k < len; k++) { lvl[m0 + k] += r[3 + k]; h[m0 + k] += r[3 + k]; }
      changed += len;
    }
  }
  // the shoals
  const cell = grid.cell, x0 = grid.originX + gi0 * cell, z0 = grid.originZ + gj0 * cell, x1 = x0 + side * cell, z1 = z0 + side * cell, R = SHOAL.reach;
  forRocks(grid, x0 - R, z0 - R, x1 + R, z1 + R, (k, rx, rz) => {
    const a0 = Math.max(0, Math.floor((rx - R - x0) / cell)), a1 = Math.min(side - 1, Math.floor((rx + R - x0) / cell));
    const b0 = Math.max(0, Math.floor((rz - R - z0) / cell)), b1 = Math.min(side - 1, Math.floor((rz + R - z0) / cell));
    for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) {
      const m = b * side + a;
      if (!lake[m]) continue;
      const d = Math.hypot(x0 + (a + 0.5) * cell - rx, z0 + (b + 0.5) * cell - rz);
      if (d > R) continue;
      const want = lvl[m] - Math.round((SHOAL.top + SHOAL.slope * d) * 10);
      if (h[m] < want) { h[m] = want; changed++; }
    }
  });
  return changed;
}

// ---- the rocks --------------------------------------------------------------------------------------------------
const RX = [], RZ = [];
{
  const q = (TABLE.rocks && TABLE.rocks.q) || 0.5, xz = (TABLE.rocks && TABLE.rocks.xz) || [];
  let x = 0, z = 0;
  for (let k = 0; k < xz.length; k += 2) { x += xz[k]; z += xz[k + 1]; RX.push(x * q); RZ.push(z * q); }
}
export const ROCK_COUNT = RX.length;
// the rocks by 640 m block, made once
let BLOCKS = null;
const BLOCK = 640;
function forRocks(grid, x0, z0, x1, z1, fn) {
  if (!BLOCKS) {
    BLOCKS = new Map();
    for (let k = 0; k < RX.length; k++) { const key = `${Math.floor(RX[k] / BLOCK)},${Math.floor(RZ[k] / BLOCK)}`; let a = BLOCKS.get(key); if (!a) BLOCKS.set(key, (a = [])); a.push(k); }
  }
  for (let bz = Math.floor(z0 / BLOCK); bz <= Math.floor(z1 / BLOCK); bz++) for (let bx = Math.floor(x0 / BLOCK); bx <= Math.floor(x1 / BLOCK); bx++) {
    const a = BLOCKS.get(`${bx},${bz}`);
    if (a) for (const k of a) if (RX[k] >= x0 && RX[k] < x1 && RZ[k] >= z0 && RZ[k] < z1) fn(k, RX[k], RZ[k]);
  }
}
// One rock, the same every time (the worker that draws it and the main thread that bumps the canoe on it agree): mostly a
// rounded erratic, now and then a shard; big enough to break the surface from its shoal; `above` how far its top
// stands out of the water at the least. Its companions: one or two smaller ones on the shoal beside it, some awash.
export function rockSpec(k) {
  const r = (n) => hash2(k, n, 4517);
  const kind = r(1) < 0.72 ? ROCK_KIND.boulder : ROCK_KIND.block;
  const scale = kind === ROCK_KIND.boulder ? 1.15 + r(2) ** 1.3 * 1.25 : 0.95 + r(2) * 0.9;
  return {
    kind, scale, squash: 0.8 + r(3) * 0.4, tall: 0.95 + r(4) * 0.35, yaw: r(5) * Math.PI * 2, az: r(6) * Math.PI * 2,
    tilt: kind === ROCK_KIND.block ? 0.15 + r(7) * 0.35 : r(7) * 0.15, tint: 0.62 + r(8) * 0.3, above: 0.35 + r(9) * 0.6,
    mates: Math.floor(r(10) * 3), // 0-2
    // the hull keeps off a circle this big round the middle (the drawn rock's reach, a little inside it)
    reach: scale * (kind === ROCK_KIND.boulder ? 0.95 : 1.1),
  };
}
// the rocks within r of (x, z) on water (world: anything with shoreAt): [{ x, z, reach, k }]
export function rocksNear(world, x, z, r) {
  const out = [];
  forRocks(null, x - r, z - r, x + r, z + r, (k, rx, rz) => {
    if (world.shoreAt(rx, rz) > 1.5) return;
    out.push({ x: rx, z: rz, reach: rockSpec(k).reach, k });
  });
  return out;
}
// The rocks of one fine tile as boulder bins for the tile's placement (tile-worker.js puts them with the forest's
// bins: drawn in the rock style, cast shadows, mirrored, and the walker and a swimmer are held off them as off any
// boulder). Each rock of the tile's core on water (shoreAt under 1.5 m), seated on the drawn bed (its shoal: patchTile),
// raised if need be so its top stands `above` out of the water. grid: the tile's TileGrid; i0, j0, n: its core cells;
// originX, originZ: its corner.
export function lakeRockBins(grid, i0, j0, n, originX, originZ) {
  const cell = grid.cell, x0 = grid.cellX(i0) - cell / 2, z0 = grid.cellZ(j0) - cell / 2, x1 = x0 + n * cell, z1 = z0 + n * cell;
  const bins = new Map(), cache = new Map(), ground = (x, z) => meshHeightAt(grid, x, z, cache);
  const put = (kind, x, y, z, yaw, scale, tint, squash, az, tilt, tall) => {
    const rx = Math.floor((x - grid.originX) / REGION), rz = Math.floor((z - grid.originZ) / REGION), key = rx * 4096 + rz;
    let b = bins.get(key);
    if (!b) bins.set(key, (b = { rx, rz, parts: Array.from({ length: BIN_GROUPS[SPECIES.boulder] }, () => []) }));
    b.parts[rockGroup(rx, rz, kind)].push(x - originX, y, z - originZ, yaw, scale, tint, squash, az, tilt, tall);
  };
  const place = (kind, x, z, s, level, above, sq, tall, yaw, az, tilt, tint) => {
    const foot = ROCK_FOOT[kind];
    let y = seatRock(ground, foot, x, z, s, sq, tall, yaw, az, tilt, grid.slopeAt(x, z));
    const top = y + foot.h * s * tall;
    if (above != null && top < level + above) y += level + above - top;
    put(kind, x, y, z, yaw, s, tint, sq, az, tilt, tall);
  };
  forRocks(grid, x0, z0, x1, z1, (k, x, z) => {
    if (grid.shoreAt(x, z) > 1.5) return;
    const s = rockSpec(k), level = grid.levelAt(x, z, 3);
    place(s.kind, x, z, s.scale, level, s.above, s.squash, s.tall, s.yaw, s.az, s.tilt, s.tint);
    for (let m = 0; m < s.mates; m++) {
      const r = (n) => hash2(k, 20 + m * 8 + n, 4517);
      const a = r(0) * Math.PI * 2, d = s.scale * (1.2 + r(1) * 1.3), mx = x + Math.cos(a) * d, mz = z + Math.sin(a) * d;
      if (grid.shoreAt(mx, mz) > 0.5) continue;
      const kind = r(2) < 0.5 ? ROCK_KIND.boulder : ROCK_KIND.block;
      place(kind, mx, mz, s.scale * (0.3 + r(3) * 0.3), level, r(4) < 0.5 ? -0.15 : null, 0.8 + r(5) * 0.4, 0.75 + r(6) * 0.4, r(7) * 6.28, a, 0.1 + r(1) * 0.3, s.tint * (0.9 + r(2) * 0.15));
    }
  });
  const out = [];
  for (const b of bins.values()) {
    // a bin with one family not in group 0 is drawn as group 0 (vegetation.js): a zero-sized rock there keeps its family
    // (placement.js placeVegetation does the same)
    const filled = b.parts.filter((a) => a.length);
    if (filled.length === 1 && !b.parts[0].length) b.parts[0].push(...filled[0].slice(0, 4), 0, 1, 1, 0, 0, 1);
    const items = new Float32Array(b.parts.reduce((s, a) => s + a.length, 0));
    let o = 0;
    for (const a of b.parts) { items.set(a, o); o += a.length; }
    out.push({ rx: b.rx, rz: b.rz, sp: SPECIES.boulder, size: REGION, stride: ROCK_STRIDE, groups: b.parts.map((a) => a.length / ROCK_STRIDE), items });
  }
  return out;
}
// Which variant group of a boulder bin draws a family: placement.js rockGroup (vegetation.js gives a bin's three groups
// the variants base, base + 1 and base + 2 of its nine, base hashed from the region). Keep in step with both.
function rockGroup(rx, rz, kind) {
  const base = Math.floor(hash2(rx * 7919 + rz, SPECIES.boulder, 9) * 9);
  return (kind - (base % 3) + 3) % 3;
}

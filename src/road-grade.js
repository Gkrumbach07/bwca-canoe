// The roads in 3D (stream E3, docs/build/edge-and-roads.md): a road's grade in the ground, the way ramps.js grades a
// campsite's way up. Each road (scripts/roads.mjs → src/roads.bin) is a 3D line from the OSM line's heights on the
// release's ground, smoothed to a forest road's grade and bridged level over water; drawn flat across its core (its half
// width and a shoulder of gravel) and eased back to the ground over a shoulder as wide as its cut or fill wants.
// Every ground the game reads goes through it: the 10 m mesh (terrain-build.js rampGround: its vertices, meshHeightAt,
// surfaceAt; away from the shore's fine band only, where no tee has to hold) and the 5 m and 2 m detail (detail-build.js
// chunkGround), so the drawn mesh, groundAt, the walker and the truck agree. Built into the tiles and chunks as they are
// made: nothing a frame. `?roads=off` leaves the ground (and the roads) out.
//
// Round 5 (every road in the box, 4,400 km): the table comes a tile at a time (roads.js tileRoads: each tile's piece holds
// every road within 80 m of it, so the piece alone answers for any point of the tile and its halo). A tile worker sets the
// piece of the tile it builds (setRoadGrade, before each build); the main thread keeps one per installed tile
// (addTileGrade / dropTileGrade, by tile: setGradeFrame) and answers each point from its own tile's.
//
// The table: a flat Float32Array of segments, SEG floats each: x0, z0, h0, w0, x1, z1, h1, w1, core, ex, ab (h the road's
// height at each end, w its shoulder there; core the flat half width; ex the forest's clearing round the line, negative a
// lawn: roads.js clearOf; ab 1 by a bridge's end, an abutment: graded right to the water's edge, the caller's shore fade
// not taken, so the bank meets the deck).
export const SEG = 11;
export const ROAD_SHOULDER = 0.9; // metres of flat gravel shoulder past the drawn half width
const BIN = 32;

function makeSet(a) {
  if (!a || !a.length) return null;
  const S = a, bins = new Map();
  for (let k = 0; k < S.length; k += SEG) {
    const r = Math.max(S[k + 8] + Math.max(S[k + 3], S[k + 7]), Math.abs(S[k + 9]));
    const x0 = Math.floor((Math.min(S[k], S[k + 4]) - r) / BIN), x1 = Math.floor((Math.max(S[k], S[k + 4]) + r) / BIN);
    const z0 = Math.floor((Math.min(S[k + 1], S[k + 5]) - r) / BIN), z1 = Math.floor((Math.max(S[k + 1], S[k + 5]) + r) / BIN);
    for (let bz = z0; bz <= z1; bz++) for (let bx = x0; bx <= x1; bx++) {
      const key = (bx + 65536) * 131072 + (bz + 65536);
      let l = bins.get(key);
      if (!l) bins.set(key, (l = []));
      l.push(k);
    }
  }
  return { S, bins };
}
let cur = null;            // the one table (a worker: the tile it builds)
let frame = null;          // the main thread: { x0, z0, size, ntx }, the tiles' grid
const tiles = new Map();   // tile index → set

export function setRoadGrade(a) { cur = makeSet(a); }
export function setGradeFrame(x0, z0, size, ntx) { frame = { x0, z0, size, ntx }; }
export function addTileGrade(tx, ty, a) { if (frame) tiles.set(ty * frame.ntx + tx, makeSet(a)); }
export function dropTileGrade(tx, ty) { if (frame) tiles.delete(ty * frame.ntx + tx); }
export const hasRoadGrade = () => !!cur || tiles.size > 0;
// (a point in a tile not in yet, within a piece's reach of an installed neighbour: the neighbour's, whose halo it is)
const REACH = 78;
function setAt(x, z) {
  if (!frame || !tiles.size) return cur;
  const fx = (x - frame.x0) / frame.size, fz = (z - frame.z0) / frame.size, tx = Math.floor(fx), tz = Math.floor(fz);
  const T = tiles.get(tz * frame.ntx + tx);
  if (T !== undefined) return T;
  const ux = (fx - tx) * frame.size, uz = (fz - tz) * frame.size, m = frame.size - REACH;
  const dx = ux < REACH ? -1 : ux > m ? 1 : 0, dz = uz < REACH ? -1 : uz > m ? 1 : 0;
  if (dx) { const q = tiles.get(tz * frame.ntx + tx + dx); if (q !== undefined) return q; }
  if (dz) { const q = tiles.get((tz + dz) * frame.ntx + tx); if (q !== undefined) return q; }
  if (dx && dz) { const q = tiles.get((tz + dz) * frame.ntx + tx + dx); if (q !== undefined) return q; }
  return cur;
}
const binAt = (T, x, z) => T.bins.get((Math.floor(x / BIN) + 65536) * 131072 + (Math.floor(z / BIN) + 65536));

// The ground at (x, z) with the roads in: h eased to the road's own height by how near its line the point is (1 within
// the core, 0 past the shoulder), times k (the caller's own fade: the shore). Where two roads meet, the nearer one's
// height wins (weights by the fourth power of the distance).
export function roadGradeAt(x, z, h, k = 1) {
  const T = setAt(x, z), l = T && binAt(T, x, z);
  if (!l) return h;
  const S = T.S, kk = k > 0 ? k : 0;
  let K = 0, sw = 0, st = 0;
  for (const s of l) {
    const ks = S[s + 10] ? 1 : kk;
    if (!(ks > 0)) continue;
    const ax = S[s], az = S[s + 1], ex = S[s + 4] - ax, ez = S[s + 5] - az, L2 = ex * ex + ez * ez;
    const t = L2 > 1e-9 ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2)) : 0;
    const d = Math.hypot(x - ax - ex * t, z - az - ez * t), core = S[s + 8], w = S[s + 3] + (S[s + 7] - S[s + 3]) * t;
    if (d >= core + w) continue;
    const u = d <= core ? 0 : (d - core) / w, k1 = 1 - u * u * (3 - 2 * u);
    if (k1 <= 0) continue;
    const th = S[s + 2] + (S[s + 6] - S[s + 2]) * t, wt = k1 / (d * d * d * d + 0.05);
    sw += wt; st += wt * th;
    if (k1 * ks > K) K = k1 * ks;
  }
  return K > 0 ? h + (st / sw - h) * K : h;
}

// How much of a road's own grade (x, z) takes, 0 to 1 (1 on its core), whatever the caller's fade (detail-build.js: a
// road's ground is not stood up to a pond's level past ROAD_DRY m from its shore: round 5, EP 50)
export const ROAD_DRY = 6;
export function roadCoreAt(x, z) {
  const T = setAt(x, z), l = T && binAt(T, x, z);
  if (!l) return 0;
  const S = T.S;
  let K = 0;
  for (const s of l) {
    const ax = S[s], az = S[s + 1], ex = S[s + 4] - ax, ez = S[s + 5] - az, L2 = ex * ex + ez * ez;
    const t = L2 > 1e-9 ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2)) : 0;
    const d = Math.hypot(x - ax - ex * t, z - az - ez * t), core = S[s + 8], w = S[s + 3] + (S[s + 7] - S[s + 3]) * t;
    if (d >= core + w) continue;
    const u = d <= core ? 0 : (d - core) / w, k1 = 1 - u * u * (3 - 2 * u);
    if (k1 > K) K = k1;
  }
  return K;
}

// Is (x, z) within a road's reach (its core and shoulder) plus pad metres?
export function nearRoad(x, z, pad = 0) {
  const T = setAt(x, z), l = T && binAt(T, x, z);
  if (!l) return false;
  const S = T.S;
  for (const s of l) {
    const ax = S[s], az = S[s + 1], ex = S[s + 4] - ax, ez = S[s + 5] - az, L2 = ex * ex + ez * ez;
    const t = L2 > 1e-9 ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2)) : 0;
    if (Math.hypot(x - ax - ex * t, z - az - ez * t) < S[s + 8] + S[s + 3] + (S[s + 7] - S[s + 3]) * t + pad) return true;
  }
  return false;
}

// Metres from (x, z) to the edge of the nearest road's clearing (its ex), Infinity past a bin's reach (mire-relief.js:
// no hummocks on a road; thicket.js: no brush on it)
export function roadClearGap(x, z) {
  const T = setAt(x, z), l = T && binAt(T, x, z);
  if (!l) return Infinity;
  const S = T.S;
  let g = Infinity;
  for (const s of l) {
    const ax = S[s], az = S[s + 1], ex = S[s + 4] - ax, ez = S[s + 5] - az, L2 = ex * ex + ez * ez;
    const t = L2 > 1e-9 ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2)) : 0;
    g = Math.min(g, Math.hypot(x - ax - ex * t, z - az - ez * t) - Math.abs(S[s + 9]));
  }
  return g;
}

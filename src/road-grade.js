// The roads in 3D (stream E3, docs/build/edge-and-roads.md): a road's grade in the ground, the way ramps.js grades a
// campsite's way up. Each road (src/roads.json, scripts/roads.mjs) is a 3D line from the OSM line's heights on the
// release's ground, smoothed to a forest road's grade and bridged level over water; drawn flat across its core (its half
// width and a shoulder of gravel) and eased back to the ground over a shoulder as wide as its cut or fill wants.
// Every ground the game reads goes through it: the 10 m mesh (terrain-build.js rampGround: its vertices, meshHeightAt,
// surfaceAt; away from the shore's fine band only, where no tee has to hold) and the 5 m and 2 m detail (detail-build.js
// chunkGround), so the drawn mesh, groundAt, the walker and the truck agree. Built into the tiles and chunks as they are
// made: nothing a frame. `?roads=off` leaves the ground (and the roads) out.
//
// The table: a flat Float32Array of segments, SEG floats each: x0, z0, h0, w0, x1, z1, h1, w1, core (h the road's
// height at each end, w its shoulder there; core the flat half width).
export const SEG = 9;
export const ROAD_SHOULDER = 0.9; // metres of flat gravel shoulder past the drawn half width
const BIN = 32;
let S = null, bins = null, reach = 0;

export function setRoadGrade(a) {
  S = a && a.length ? a : null; bins = null; reach = 0;
  if (!S) return;
  bins = new Map();
  for (let k = 0; k < S.length; k += SEG) {
    const r = S[k + 8] + Math.max(S[k + 3], S[k + 7]);
    reach = Math.max(reach, r);
    const x0 = Math.floor((Math.min(S[k], S[k + 4]) - r) / BIN), x1 = Math.floor((Math.max(S[k], S[k + 4]) + r) / BIN);
    const z0 = Math.floor((Math.min(S[k + 1], S[k + 5]) - r) / BIN), z1 = Math.floor((Math.max(S[k + 1], S[k + 5]) + r) / BIN);
    for (let bz = z0; bz <= z1; bz++) for (let bx = x0; bx <= x1; bx++) {
      const key = (bx + 65536) * 131072 + (bz + 65536);
      let l = bins.get(key);
      if (!l) bins.set(key, (l = []));
      l.push(k);
    }
  }
}
export const hasRoadGrade = () => !!S;

// The ground at (x, z) with the roads in: h eased to the road's own height by how near its line the point is (1 within
// the core, 0 past the shoulder), times k (the caller's own fade: the shore). Where two roads meet, the nearer one's
// height wins (weights by the fourth power of the distance).
export function roadGradeAt(x, z, h, k = 1) {
  if (!bins || !(k > 0)) return h;
  const l = bins.get((Math.floor(x / BIN) + 65536) * 131072 + (Math.floor(z / BIN) + 65536));
  if (!l) return h;
  let K = 0, sw = 0, st = 0;
  for (const s of l) {
    const ax = S[s], az = S[s + 1], ex = S[s + 4] - ax, ez = S[s + 5] - az, L2 = ex * ex + ez * ez;
    const t = L2 > 1e-9 ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2)) : 0;
    const d = Math.hypot(x - ax - ex * t, z - az - ez * t), core = S[s + 8], w = S[s + 3] + (S[s + 7] - S[s + 3]) * t;
    if (d >= core + w) continue;
    const u = d <= core ? 0 : (d - core) / w, k1 = 1 - u * u * (3 - 2 * u);
    if (k1 <= 0) continue;
    const th = S[s + 2] + (S[s + 6] - S[s + 2]) * t, wt = k1 / (d * d * d * d + 0.05);
    sw += wt; st += wt * th;
    if (k1 > K) K = k1;
  }
  return K > 0 ? h + (st / sw - h) * K * k : h;
}

// Is (x, z) within a road's reach (its core and shoulder) plus pad metres?
export function nearRoad(x, z, pad = 0) {
  if (!bins) return false;
  const l = bins.get((Math.floor(x / BIN) + 65536) * 131072 + (Math.floor(z / BIN) + 65536));
  if (!l) return false;
  for (const s of l) {
    const ax = S[s], az = S[s + 1], ex = S[s + 4] - ax, ez = S[s + 5] - az, L2 = ex * ex + ez * ez;
    const t = L2 > 1e-9 ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2)) : 0;
    if (Math.hypot(x - ax - ex * t, z - az - ez * t) < S[s + 8] + S[s + 3] + (S[s + 7] - S[s + 3]) * t + pad) return true;
  }
  return false;
}

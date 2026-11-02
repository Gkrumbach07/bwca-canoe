// Round ramps (2026-11-02, the owner: "steep landings for campsites need to be more gradual. a switch back maybe").
//
// What drew the wall: the LiDAR detail (detail-build.js chunkGround) rises from the 10 m mesh's waterline to the 2 m
// ground over the first 2 m inland, and where the real bank is steep the 2 m lattice square astride the waterline stood
// 2-5 m tall: a smooth grey face out of the water, with the bed's pebbles poking up at its foot (the waterline's twins sit
// on that face, metres over the water). The way up (camp-access.mjs) was graded on the LiDAR alone, so it never saw it.
//
// A ramp is the way up graded in the ground itself: a 3D line from the waterline to the fire ring (scripts/camp-ramps.mjs
// works it out on the release's ground: a low shelf at the water, then no steeper than RAMP.grade, laid as a switchback
// where the straight way is too short for its rise, with flat turns), drawn RAMP.core metres either side at its own
// height and eased back to the ground over a shoulder as wide as its cut or fill wants. Every ground the game reads goes
// through rampAt: the 10 m mesh (terrain-build.js: the vertices, meshHeightAt, surfaceAt), the 5 m and 2 m detail
// (detail-build.js chunkGround), so the drawn mesh, groundAt, the walker and everything seated agree. Built into the
// tiles and chunks as they are made: nothing a frame. `?ramps=off` (or `?access=off`) leaves the ground as it was.
//
// The table: a flat Float32Array of segments, SEG floats each: x0, z0, h0, w0, x1, z1, h1, w1 (h the ramp's height at
// each end, w its shoulder there, metres).
export const RAMP = { grade: Math.tan((20 * Math.PI) / 180), core: 1.4, shelf: 0.15 };
export const SEG = 8;
const BIN = 16;
let S = null, bins = null;

export function setRamps(a) {
  S = a && a.length ? a : null; bins = null;
  if (!S) return;
  bins = new Map();
  for (let k = 0; k < S.length; k += SEG) {
    const r = RAMP.core + Math.max(S[k + 3], S[k + 7]);
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
export const hasRamps = () => !!S;

// The ground at (x, z) with the ramps in: h (the ground as it would be) eased to the ramp's own height by how near its line
// the point is (1 within RAMP.core, 0 past the shoulder). Where two legs of a switchback are both near, the nearer one's
// height wins (weights by the fourth power of the distance), so each leg keeps its own grade to its edge.
export function rampAt(x, z, h) {
  if (!bins) return h;
  const l = bins.get((Math.floor(x / BIN) + 65536) * 131072 + (Math.floor(z / BIN) + 65536));
  if (!l) return h;
  let K = 0, sw = 0, st = 0;
  for (const k of l) {
    const ax = S[k], az = S[k + 1], ex = S[k + 4] - ax, ez = S[k + 5] - az, L2 = ex * ex + ez * ez;
    const t = L2 > 1e-9 ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2)) : 0;
    const d = Math.hypot(x - ax - ex * t, z - az - ez * t), w = S[k + 3] + (S[k + 7] - S[k + 3]) * t;
    if (d >= RAMP.core + w) continue;
    const u = d <= RAMP.core ? 0 : (d - RAMP.core) / w, k1 = 1 - u * u * (3 - 2 * u);
    if (k1 <= 0) continue;
    const th = S[k + 2] + (S[k + 6] - S[k + 2]) * t, wt = k1 / (d * d * d * d + 0.05);
    sw += wt; st += wt * th;
    if (k1 > K) K = k1;
  }
  return K > 0 ? h + (st / sw - h) * K : h;
}

// fn() read on the ground as it was, no ramp in (props.js: an outfitter's store is sited on the 10 m ground as it stood,
// so it stands where it stood; only what is fitted to the ground drawn, the dock's sill and steps, the floor, meets the ramp)
export function withoutRamps(fn) {
  const b = bins;
  bins = null;
  try { return fn(); } finally { bins = b; }
}

// Is (x, z) within a ramp's reach (its core and shoulder) plus pad metres? (placement.js: no cliff module stands in a cut)
export function nearRamp(x, z, pad = 0) {
  if (!bins) return false;
  const l = bins.get((Math.floor(x / BIN) + 65536) * 131072 + (Math.floor(z / BIN) + 65536));
  if (!l) return false;
  for (const k of l) {
    const ax = S[k], az = S[k + 1], ex = S[k + 4] - ax, ez = S[k + 5] - az, L2 = ex * ex + ez * ez;
    const t = L2 > 1e-9 ? Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2)) : 0;
    if (Math.hypot(x - ax - ex * t, z - az - ez * t) < RAMP.core + S[k + 3] + (S[k + 7] - S[k + 3]) * t + pad) return true;
  }
  return false;
}

// The table from the world's campsites (world.js setCampAccess: c.access.ramp, [[x, z, h, w], ...] from the waterline up)
export function makeRamps(world) {
  if (typeof location !== 'undefined' && /[?&]ramps=off\b/.test(location.search)) return new Float32Array(0);
  const out = [];
  const add = (r) => { if (r) for (let i = 1; i < r.length; i++) out.push(...r[i - 1], ...r[i]); };
  for (const c of world.campsites) add(c.access && c.access.ramp);
  for (const ep of world.entryPoints || []) add(ep.ramp); // (an outfitter's, dock to door: world.js setCampAccess)
  return new Float32Array(out);
}

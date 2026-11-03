// Round world, the owner (2026-11-02): "with all the new foliage we've added, which while is accurate, does hide a lot of
// the campsites, which should have a better shore view ... I would trim back a lot of foliage on the water facing side and
// potentially just taper it. So it's not just completely clear cut it, but open it up more and open it up more a little
// bit around it as well ... Same thing with portage landings."
//
// A view is a tapered opening from a point on land out to the water: a fan from (ax, az) to (bx, bz) (and VIEW.past metres
// on over the water), w0 metres half wide at its land end and w1 at the water, thinned by `k` (0..1, the share of the
// plants taken) on its line, easing to nothing at its sides and past its ends; a ring round its land end (ring metres,
// thinned by kr) opens the ground round a site. viewThin(x, z) is the share of the plants to take at (x, z): a plant
// stands only where its own number (thinKeep) is over it, so the opening is thinned, not cleared, and every tile and the
// near ring (thicket.js) thin it alike. The views are made once at startup from the world (makeViews: tiles.js) and sent
// to the tile workers (setViews), where placement.js thins the forest with them.
import { hash2 } from './rng.js';

export const VIEW = {
  site: { w0: 7, w1: 15, k: 0.82, ring: 20, kr: 0.45, past: 6 },     // a campsite: ring to its landing (or nearest shore)
  portage: { w0: 5, w1: 14, k: 0.85, ring: 0, kr: 0, past: 5, back: 26 }, // a portage's landing: the trail's last metres to the water
};
const STRIDE = 9; // ax, az, bx, bz, w0, w1, k, ring, kr
let V = null, bins = null;
const BIN = 64;

// the views as a flat Float32Array (STRIDE a view)
export function makeViews(world) {
  const out = [];
  const shore = (x, z) => { // the waterline straight down from (x, z), within 120 m, or null
    let px = x, pz = z;
    for (let i = 0; i < 240; i++) { const sd = world.shoreAt(px, pz); if (sd <= 0.2) return [px, pz]; const d = world.deeperDir(px, pz); px += d.x * 0.5; pz += d.z * 0.5; }
    return null;
  };
  for (const c of world.campsites) {
    const S = VIEW.site, A = c.access;
    let a = [c.x, c.z], b = A && A.landing ? A.landing : shore(c.x, c.z);
    if (A && A.way) a = A.way[0]; // (from the ring)
    // round ramps 2: a landing well down the shore (the natural way up winds to it): the site's view to its own water as
    // before, and a narrower one at the landing, along the way's last metres
    if (A && A.landing && Math.hypot(b[0] - a[0], b[1] - a[1]) > 40) {
      const P = VIEW.portage, w = A.way, L = w[w.length - 1];
      let k = w.length - 2, run = 0;
      while (k > 0 && run + Math.hypot(w[k][0] - w[k + 1][0], w[k][1] - w[k + 1][1]) < 14) { run += Math.hypot(w[k][0] - w[k + 1][0], w[k][1] - w[k + 1][1]); k--; }
      const [bx, bz] = w[Math.max(0, k)], dx = L[0] - bx, dz = L[1] - bz, l2 = Math.hypot(dx, dz) || 1;
      out.push(bx, bz, L[0] + (dx / l2) * P.past, L[1] + (dz / l2) * P.past, P.w0, P.w1, P.k, 0, 0);
      b = shore(a[0], a[1]) || b;
    }
    if (!b) { out.push(a[0], a[1], a[0], a[1], S.w0, S.w0, 0, S.ring, S.kr); continue; }
    // a landing round a corner of the way: the view runs from the ring to the landing all the same (its line is the
    // way's chord); and past it out over the water
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    out.push(a[0], a[1], b[0] + (dx / L) * S.past, b[1] + (dz / L) * S.past, S.w0, S.w1, S.k, S.ring, S.kr);
  }
  for (const p of world.portages) {
    const P = VIEW.portage;
    for (const end of [0, 1]) {
      const e = end ? p.pts[p.pts.length - 1] : p.pts[0], l = p.launch && p.launch[end];
      if (!l) continue;
      // back along the trail from its end, to the launch out on the water
      const pts = end ? [...p.pts].reverse() : p.pts;
      let bx = e[0], bz = e[1], run = 0;
      for (let i = 1; i < pts.length && run < P.back; i++) { const s = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); const t = Math.min(1, (P.back - run) / (s || 1)); bx = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t; bz = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t; run += s * t; }
      const dx = l.x - bx, dz = l.z - bz, L = Math.hypot(dx, dz) || 1, far = Math.min(L, Math.hypot(e[0] - bx, e[1] - bz) + 12);
      out.push(bx, bz, bx + (dx / L) * (far + P.past), bz + (dz / L) * (far + P.past), P.w0, P.w1, P.k, 0, 0);
    }
  }
  return new Float32Array(out);
}

export function setViews(a) {
  V = a && a.length ? a : null; bins = null;
  if (!V) return;
  bins = new Map();
  for (let o = 0; o < V.length; o += STRIDE) {
    const r = Math.max(V[o + 5], V[o + 7]) + 4;
    const x0 = Math.min(V[o], V[o + 2]) - r, x1 = Math.max(V[o], V[o + 2]) + r, z0 = Math.min(V[o + 1], V[o + 3]) - r, z1 = Math.max(V[o + 1], V[o + 3]) + r;
    for (let j = Math.floor(z0 / BIN); j <= Math.floor(z1 / BIN); j++) for (let i = Math.floor(x0 / BIN); i <= Math.floor(x1 / BIN); i++) {
      const k = i * 100003 + j, l = bins.get(k);
      if (l) l.push(o); else bins.set(k, [o]);
    }
  }
}
export const hasViews = () => !!V;

const ease = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
// the share of the plants taken at (x, z), 0..1
export function viewThin(x, z) {
  if (!bins) return 0;
  const l = bins.get(Math.floor(x / BIN) * 100003 + Math.floor(z / BIN));
  if (!l) return 0;
  let best = 0;
  for (const o of l) {
    const ax = V[o], az = V[o + 1], ex = V[o + 2] - ax, ez = V[o + 3] - az, L2 = ex * ex + ez * ez;
    const ring = V[o + 7];
    if (ring > 0) { const d = Math.hypot(x - ax, z - az); if (d < ring) best = Math.max(best, V[o + 8] * (1 - ease(ring * 0.5, ring, d))); }
    if (!(L2 > 1) || !(V[o + 6] > 0)) continue;
    const u = ((x - ax) * ex + (z - az) * ez) / L2, L = Math.sqrt(L2);
    if (u < -0.15 || u > 1.15) continue;
    const t = Math.min(1, Math.max(0, u)), w = V[o + 4] + (V[o + 5] - V[o + 4]) * t;
    const d = Math.abs((x - ax) * ez - (z - az) * ex) / L;
    if (d > w) continue;
    const along = u < 0 ? 1 - ease(0, 0.15, -u) : u > 1 ? 1 - ease(0, 0.15, u - 1) : 1;
    best = Math.max(best, V[o + 6] * (1 - ease(w * 0.45, w, d)) * along);
  }
  return best;
}
// whether a plant at (x, z) stands in a view: its own number over the share taken there (seed: a kind's own, so two
// layers at one spot are thinned apart)
export function thinKeep(x, z, seed = 0) {
  const k = viewThin(x, z);
  return k <= 0 || hash2(Math.floor(x * 5.3), Math.floor(z * 5.3), 401 + seed) >= k;
}

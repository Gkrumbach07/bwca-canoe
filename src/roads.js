// The roads in 3D (stream E3, docs/build/edge-and-roads.md; the owner 2026-11-08: "still put the roads in"). The last
// stretch of the real road into each lot and yard, from OpenStreetMap (scripts/roads.mjs → src/roads.json, for one
// release), read once at load (world.js setRoads) into world.roads:
//   list    [{ k (KIND), hw (half width m), line (a centre line), name, n (points), p: Float32Array [x, z, h, w] per
//           point (w < 0 over water: no grade there), bbox [x0, z0, x1, z1] }]
//   routes  Map key → { key, ep, at ('store' | 'lot' | 'landing'), snap, p: Float32Array [x, z] }: the truck's way out
//           from the road's end at the start (key: the entry point, 'h<ep>' an outfitter's own portage-first lot)
// What reads it: props.js (the ribbon in each tile's trail decal, and the corridor kept clear: exclusionsFor),
// road-grade.js (the ground), truck.js (the truck), the maps (later: the edge-and-roads stream E2).
// `?roads=off` leaves them all out.
import { SEG, ROAD_SHOULDER } from './road-grade.js';

export const KIND = { gravel: 1, blacktop: 2, track: 3 };
// the corridor kept off the road's centreline (a forest road's cut), past its half width: trees, brush and rocks kept
// off, the grass let through (a lawn: props.js exclusionsFor)
export const ROAD_CLEAR = 3.2;

export function roadsOff() { return typeof location !== 'undefined' && /[?&]roads=off\b/.test(location.search); }

// the table (src/roads.json) → world.roads, or null when it is for another release (or `?roads=off`)
export function readRoads(table, baked) {
  if (!table || !table.roads || roadsOff()) return null;
  if (table.for && baked && table.for !== baked) return null;
  const list = table.roads.map((r) => {
    const a = r.p, n = Math.floor(a.length / 4), p = new Float32Array(n * 4);
    let x = 0, z = 0, h = 0;
    const box = [Infinity, Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i++) {
      x += a[i * 4]; z += a[i * 4 + 1]; h += a[i * 4 + 2];
      const X = x / 10, Z = z / 10;
      p[i * 4] = X; p[i * 4 + 1] = Z; p[i * 4 + 2] = h / 100; p[i * 4 + 3] = a[i * 4 + 3] / 10;
      if (X < box[0]) box[0] = X; if (Z < box[1]) box[1] = Z; if (X > box[2]) box[2] = X; if (Z > box[3]) box[3] = Z;
    }
    return { k: r.k, hw: r.hw, line: !!r.line, name: r.name || '', n, p, bbox: box };
  });
  const routes = new Map();
  for (const r of table.routes || []) {
    const a = r.p, n = Math.floor(a.length / 2), p = new Float32Array(n * 2);
    let x = 0, z = 0;
    for (let i = 0; i < n; i++) { x += a[i * 2]; z += a[i * 2 + 1]; p[i * 2] = x / 10; p[i * 2 + 1] = z / 10; }
    routes.set(String(r.key), { key: String(r.key), ep: r.ep, at: r.at, snap: r.snap, p });
  }
  // each road's two ends: joined to another road (no fade), at a start (faded in over a few metres: the lot's own
  // gravel or the landing), or cut off into the trees (faded out over the last 30 m, so it reads as going on)
  const endKey = (x, z) => `${Math.round(x)},${Math.round(z)}`, ends = new Map();
  for (const r of list) for (const i of [0, r.n - 1]) { const k = endKey(r.p[i * 4], r.p[i * 4 + 1]); ends.set(k, (ends.get(k) || 0) + 1); }
  const atStart = (x, z) => { for (const q of routes.values()) if (Math.hypot(q.p[0] - x, q.p[1] - z) < 40) return true; return false; };
  for (const r of list) {
    const f = (i) => { const x = r.p[i * 4], z = r.p[i * 4 + 1]; return ends.get(endKey(x, z)) > 1 ? 0 : atStart(x, z) ? 5 : 30; };
    r.fadeA = f(0); r.fadeB = f(r.n - 1);
  }
  // the water a road crosses mid-way (a run of its points over water, land at both ends): a bridge from bank to bank
  // (props.js roadBridges draws the deck, truck.js drives on it), level with the road at each bank
  const bridges = [];
  for (const r of list) {
    const p = r.p;
    for (let i = 1; i < r.n - 1;) {
      if (!(p[i * 4 + 3] < 0)) { i++; continue; }
      let j = i; while (j < r.n - 1 && p[j * 4 + 3] < 0) j++;
      if (j < r.n - 1 || p[j * 4 + 3] >= 0) {
        const a = i - 1, b = j; // the banks
        bridges.push({ ax: p[a * 4], az: p[a * 4 + 1], ah: p[a * 4 + 2], bx: p[b * 4], bz: p[b * 4 + 1], bh: p[b * 4 + 2], hw: r.hw, k: r.k, name: r.name });
      }
      i = j + 1;
    }
  }
  const km = list.reduce((t, r) => { for (let i = 1; i < r.n; i++) t += Math.hypot(r.p[i * 4] - r.p[i * 4 - 4], r.p[i * 4 + 1] - r.p[i * 4 - 3]); return t; }, 0) / 1000;
  return { list, routes, bridges, km };
}

// the ground table (road-grade.js): every land segment of every road
export function makeRoadGrade(world) {
  const R = world && world.roads;
  if (!R) return new Float32Array(0);
  const out = [];
  for (const r of R.list) {
    const p = r.p, core = r.hw + ROAD_SHOULDER;
    for (let i = 1; i < r.n; i++) {
      const a = (i - 1) * 4, b = i * 4;
      if (p[a + 3] < 0 || p[b + 3] < 0) continue; // (over water: the bed stays the bed)
      out.push(p[a], p[a + 1], p[a + 2], p[a + 3], p[b], p[b + 1], p[b + 2], p[b + 3], core);
    }
  }
  void SEG;
  return new Float32Array(out);
}

// the corridor (props.js exclusionsFor): [x1, z1, x2, z2, radius] along each road, a segment every few points. A gravel
// or blacktop road is bare (no grass on it: a positive radius, and at least ROAD_BARE so placement.js plants no trail's
// green tunnel beside it); a two-track a lawn (its crown grows grass)
export const ROAD_BARE = 6.5;
export function roadExclusions(world) {
  const R = world && world.roads, segs = [];
  if (!R) return segs;
  for (const r of R.list) {
    const p = r.p, rad = r.k === KIND.track ? -(r.hw + ROAD_CLEAR) : Math.max(ROAD_BARE, r.hw + 2.4);
    for (let i = 0; i + 1 < r.n; i += 2) {
      const j = Math.min(r.n - 1, i + 2);
      if (p[i * 4] === p[j * 4] && p[i * 4 + 1] === p[j * 4 + 1]) continue; // (never a point: site.js reads those as campsites)
      segs.push([p[i * 4], p[i * 4 + 1], p[j * 4], p[j * 4 + 1], rad]);
    }
  }
  return segs;
}

// the top of a bridge's deck at (x, z), or -Infinity off every bridge (truck.js: it drives over, not through the creek)
export const DECK = 0.06; // the deck's top over the road's own height at the banks
export function deckAt(world, x, z) {
  const R = world && world.roads;
  if (!R || !R.bridges.length) return -Infinity;
  for (const b of R.bridges) {
    const ex = b.bx - b.ax, ez = b.bz - b.az, L2 = ex * ex + ez * ez;
    const t = L2 > 1e-9 ? ((x - b.ax) * ex + (z - b.az) * ez) / L2 : 0, L = Math.sqrt(L2);
    if (t < -2 / L || t > 1 + 2 / L) continue;
    const tc = Math.max(0, Math.min(1, t));
    if (Math.hypot(x - b.ax - ex * tc, z - b.az - ez * tc) > b.hw + 0.3) continue;
    return b.ah + (b.bh - b.ah) * tc + DECK;
  }
  return -Infinity;
}

// the road nearest (x, z) within max metres: { road, i (the point), d } or null
export function nearestRoad(world, x, z, max = 30) {
  const R = world && world.roads;
  if (!R) return null;
  let best = null, bd = max;
  for (const r of R.list) {
    const b = r.bbox;
    if (x < b[0] - max || x > b[2] + max || z < b[1] - max || z > b[3] + max) continue;
    for (let i = 0; i < r.n; i++) { const d = Math.hypot(r.p[i * 4] - x, r.p[i * 4 + 1] - z); if (d < bd) { bd = d; best = { road: r, i, d }; } }
  }
  return best;
}

// the truck's way out from a start (an entry point's number, or 'h<ep>'): [[x, z], ...] from the start's end of the
// road, or null
export function routeOf(world, key) {
  const R = world && world.roads, r = R && R.routes.get(String(key));
  if (!r) return null;
  const out = [];
  for (let i = 0; i < r.p.length; i += 2) out.push([r.p[i], r.p[i + 1]]);
  return { ...r, pts: out };
}
